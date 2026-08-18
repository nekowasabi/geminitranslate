import { BATCH_CONFIG } from "@shared/constants";

export type ProximityBand = "viewport" | "near" | "far";

export interface RectLike {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
  height: number;
}

export interface ViewportSize {
  width: number;
  height: number;
}

export interface IntersectionEntryLike {
  target: Element;
  isIntersecting: boolean;
}

export interface IntersectionObserverLike {
  observe(target: Element): void;
  unobserve(target: Element): void;
  disconnect(): void;
}

export type IntersectionObserverFactory = (
  callback: (entries: IntersectionEntryLike[]) => void,
  options?: { rootMargin?: string },
) => IntersectionObserverLike;

export function classifyRect(
  rect: RectLike,
  viewport: ViewportSize,
  nearScreens: number = BATCH_CONFIG.NEAR_VIEWPORT_SCREENS,
): ProximityBand {
  const inViewport =
    rect.top < viewport.height &&
    rect.bottom > 0 &&
    rect.left < viewport.width &&
    rect.right > 0;

  if (inViewport) {
    return "viewport";
  }

  const nearTop = -viewport.height * nearScreens;
  const nearBottom = viewport.height * (1 + nearScreens);
  const nearLeft = -viewport.width * nearScreens;
  const nearRight = viewport.width * (1 + nearScreens);
  const inNear =
    rect.top < nearBottom &&
    rect.bottom > nearTop &&
    rect.left < nearRight &&
    rect.right > nearLeft;

  return inNear ? "near" : "far";
}

function defaultObserverFactory(
  callback: (entries: IntersectionEntryLike[]) => void,
  options?: { rootMargin?: string },
): IntersectionObserverLike {
  if (typeof IntersectionObserver === "undefined") {
    return {
      observe(): void {},
      unobserve(): void {},
      disconnect(): void {},
    };
  }

  return new IntersectionObserver((entries) => {
    callback(
      entries.map((entry) => ({
        target: entry.target,
        isIntersecting: entry.isIntersecting,
      })),
    );
  }, options);
}

/**
 * Watches far nodes and emits them when they approach the viewport.
 */
export class ApproachingNodeObserver {
  private observer: IntersectionObserverLike | null = null;
  private readonly elementToNodes = new Map<Element, Node[]>();

  constructor(
    private readonly onApproach: (nodes: Node[]) => void,
    private readonly createObserver: IntersectionObserverFactory = defaultObserverFactory,
  ) {}

  watch(nodes: Node[]): void {
    this.disconnect();

    for (const node of nodes) {
      const element =
        node.nodeType === Node.ELEMENT_NODE
          ? (node as Element)
          : node.parentElement;
      if (!element) {
        continue;
      }
      const list = this.elementToNodes.get(element) ?? [];
      list.push(node);
      this.elementToNodes.set(element, list);
    }

    if (this.elementToNodes.size === 0) {
      return;
    }

    const marginPercent = BATCH_CONFIG.NEAR_VIEWPORT_SCREENS * 100;
    this.observer = this.createObserver(
      (entries) => {
        const approached: Node[] = [];
        for (const entry of entries) {
          if (!entry.isIntersecting) {
            continue;
          }
          const mapped = this.elementToNodes.get(entry.target);
          if (mapped) {
            approached.push(...mapped);
          }
        }
        if (approached.length > 0) {
          this.onApproach(approached);
        }
      },
      { rootMargin: `${marginPercent}% 0px` },
    );

    for (const element of this.elementToNodes.keys()) {
      this.observer.observe(element);
    }
  }

  disconnect(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.elementToNodes.clear();
  }
}
