import {
  RateLimiter,
  RequestGate,
  type Clock,
} from "../../../src/shared/utils/requestGate";
import { RATE_LIMIT_CONFIG } from "../../../src/shared/constants/config";

function createFakeClock(): {
  clock: Clock;
  now: { value: number };
  sleeps: Array<{ ms: number; resolve: () => void }>;
} {
  const now = { value: 0 };
  const sleeps: Array<{ ms: number; resolve: () => void }> = [];
  const clock: Clock = {
    now: () => now.value,
    sleep: (ms: number) =>
      new Promise<void>((resolve) => {
        sleeps.push({ ms, resolve });
      }),
  };
  return { clock, now, sleeps };
}

describe("RateLimiter", () => {
  it("uses RATE_LIMIT_CONFIG window and does not start the next call until the window elapses", async () => {
    const { clock, now, sleeps } = createFakeClock();
    const limiter = new RateLimiter(
      RATE_LIMIT_CONFIG.MAX_REQUESTS_PER_MINUTE,
      RATE_LIMIT_CONFIG.WINDOW_SIZE,
      clock,
    );

    for (let i = 0; i < RATE_LIMIT_CONFIG.MAX_REQUESTS_PER_MINUTE; i++) {
      await limiter.acquire();
    }

    let acquired = false;
    const pending = limiter.acquire().then(() => {
      acquired = true;
    });
    await Promise.resolve();
    expect(acquired).toBe(false);
    expect(sleeps).toHaveLength(1);
    expect(sleeps[0].ms).toBe(RATE_LIMIT_CONFIG.WINDOW_SIZE);

    now.value += RATE_LIMIT_CONFIG.WINDOW_SIZE;
    sleeps[0].resolve();
    await pending;
    expect(acquired).toBe(true);
  });
});

describe("RequestGate", () => {
  it("never lets in-flight work exceed the concurrency cap", async () => {
    const { clock } = createFakeClock();
    const gate = new RequestGate(
      2,
      new RateLimiter(1000, 60_000, clock),
    );

    let inFlight = 0;
    let maxInFlight = 0;
    const releases: Array<() => void> = [];

    const runOne = () =>
      gate.run(async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise<void>((resolve) => {
          releases.push(() => {
            inFlight -= 1;
            resolve();
          });
        });
      });

    const jobs = [runOne(), runOne(), runOne()];
    await Promise.resolve();
    await Promise.resolve();

    expect(maxInFlight).toBeLessThanOrEqual(2);
    expect(releases).toHaveLength(2);

    releases[0]();
    const waitStart = Date.now();
    while (releases.length < 3 && Date.now() - waitStart < 500) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    expect(releases).toHaveLength(3);
    expect(maxInFlight).toBeLessThanOrEqual(2);

    releases[1]();
    releases[2]();
    await Promise.all(jobs);
    expect(maxInFlight).toBe(2);
  });

  it("does not hold a concurrency slot while waiting for the rate window",
    async () => {
    const { clock, now, sleeps } = createFakeClock();
    const gate = new RequestGate(2, new RateLimiter(1, 1000, clock));

    let firstResolve: (() => void) | undefined;
    const firstDone = gate.run(
      () =>
        new Promise<void>((resolve) => {
          firstResolve = resolve;
        }),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(firstResolve).toBeDefined();

    let laterStarted = 0;
    const later = [
      gate.run(async () => {
        laterStarted += 1;
      }),
      gate.run(async () => {
        laterStarted += 1;
      }),
    ];
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Why: if the rate-wait held the second slot, only one waiter could sleep.
    // Releasing the slot lets both later jobs observe the rate window.
    expect(laterStarted).toBe(0);
    expect(sleeps.length).toBe(2);

    firstResolve?.();
    await firstDone;
    const waitStart = Date.now();
    while (laterStarted < 2 && Date.now() - waitStart < 500) {
      now.value += 1000;
      const pending = sleeps.splice(0);
      pending.forEach((sleep) => sleep.resolve());
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    await Promise.all(later);
    expect(laterStarted).toBe(2);
  });
});
