import {
  ApproachingNodeObserver,
  classifyRect,
} from "../../../src/content/proximityClassifier";
import { BATCH_CONFIG } from "../../../src/shared/constants/config";

describe("classifyRect", () => {
  const viewport = { width: 800, height: 600 };

  it("marks on-screen rects as viewport", () => {
    expect(
      classifyRect(
        { top: 10, bottom: 40, left: 0, right: 100, width: 100, height: 30 },
        viewport,
      ),
    ).toBe("viewport");
  });

  it("marks the next few screens as near", () => {
    expect(
      classifyRect(
        {
          top: viewport.height + 20,
          bottom: viewport.height + 40,
          left: 0,
          right: 100,
          width: 100,
          height: 20,
        },
        viewport,
      ),
    ).toBe("near");
  });

  it("marks content beyond NEAR_VIEWPORT_SCREENS as far", () => {
    const top = viewport.height * (1 + BATCH_CONFIG.NEAR_VIEWPORT_SCREENS) + 50;
    expect(
      classifyRect(
        {
          top,
          bottom: top + 20,
          left: 0,
          right: 100,
          width: 100,
          height: 20,
        },
        viewport,
      ),
    ).toBe("far");
  });
});

describe("ApproachingNodeObserver", () => {
  it("does not emit far nodes until an intersecting signal arrives", () => {
    const approached: Node[][] = [];
    let callback:
      | ((entries: Array<{ target: Element; isIntersecting: boolean }>) => void)
      | undefined;
    const observed: Element[] = [];

    const farHost = document.createElement("div");
    const farNode = document.createTextNode("far copy");
    farHost.appendChild(farNode);
    document.body.appendChild(farHost);

    const observer = new ApproachingNodeObserver(
      (nodes) => {
        approached.push(nodes);
      },
      (cb) => {
        callback = cb;
        return {
          observe(target) {
            observed.push(target);
          },
          unobserve() {},
          disconnect() {},
        };
      },
    );

    observer.watch([farNode]);
    expect(observed).toContain(farHost);
    expect(approached).toHaveLength(0);

    callback?.([{ target: farHost, isIntersecting: false }]);
    expect(approached).toHaveLength(0);

    callback?.([{ target: farHost, isIntersecting: true }]);
    expect(approached).toHaveLength(1);
    expect(approached[0]).toContain(farNode);

    observer.disconnect();
    farHost.remove();
  });
});
