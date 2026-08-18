/**
 * Sliding-window rate limiter plus a concurrency gate.
 * Every translation API call should go through RequestGate.run().
 */

export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

export const systemClock: Clock = {
  now: () => Date.now(),
  sleep: (ms: number) =>
    new Promise((resolve) => {
      setTimeout(resolve, ms);
    }),
};

/**
 * At most `maxRequests` acquire() calls may start inside any windowMs interval.
 */
export class RateLimiter {
  private timestamps: number[] = [];

  constructor(
    private readonly maxRequests: number,
    private readonly windowMs: number,
    private readonly clock: Clock = systemClock,
  ) {}

  tryAcquire(): boolean {
    const now = this.clock.now();
    this.timestamps = this.timestamps.filter((t) => now - t < this.windowMs);
    if (this.timestamps.length < this.maxRequests) {
      this.timestamps.push(now);
      return true;
    }
    return false;
  }

  waitMsUntilAvailable(): number {
    const now = this.clock.now();
    this.timestamps = this.timestamps.filter((t) => now - t < this.windowMs);
    if (this.timestamps.length < this.maxRequests) {
      return 0;
    }
    return Math.max(0, this.windowMs - (now - this.timestamps[0]));
  }

  async waitUntilAvailable(): Promise<void> {
    const waitMs = this.waitMsUntilAvailable();
    if (waitMs > 0) {
      await this.clock.sleep(waitMs);
    }
  }

  async acquire(): Promise<void> {
    while (!this.tryAcquire()) {
      await this.waitUntilAvailable();
    }
  }
}

/**
 * Shared cap for happy-path batches and individual fallback.
 * Why: nested mapWithConcurrencyLimit would otherwise multiply in-flight calls.
 */
export class RequestGate {
  private activeSlots = 0;
  private inFlightCount = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(
    private readonly concurrencyLimit: number,
    readonly rateLimiter: RateLimiter,
  ) {}

  get inFlight(): number {
    return this.inFlightCount;
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    // Why: do not hold a concurrency slot while sleeping for the rate window.
    // Holding all slots during Retry-After / per-minute wait froze remaining
    // batches and left the in-page bar stuck (often after the first 20-text batch).
    while (true) {
      await this.acquireSlot();
      if (this.rateLimiter.tryAcquire()) {
        break;
      }
      this.releaseSlot();
      await this.rateLimiter.waitUntilAvailable();
    }
    this.inFlightCount += 1;
    try {
      return await fn();
    } finally {
      this.inFlightCount -= 1;
      this.releaseSlot();
    }
  }

  private async acquireSlot(): Promise<void> {
    if (this.activeSlots < this.concurrencyLimit) {
      this.activeSlots += 1;
      return;
    }
    await new Promise<void>((resolve) => {
      this.waiters.push(() => {
        this.activeSlots += 1;
        resolve();
      });
    });
  }

  private releaseSlot(): void {
    this.activeSlots -= 1;
    const next = this.waiters.shift();
    if (next) {
      next();
    }
  }
}
