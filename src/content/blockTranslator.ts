/**
 * BlockTranslator - block-level translation units with inline tag placeholders
 *
 * A block element (p, li, td, ...) whose children are only text and inline
 * elements (a, b, span, ...) is translated as ONE unit. Inline elements are
 * sent to the translator as numbered placeholders, e.g.
 *
 *   <p>Click <a href="/x">here</a> or <b>there</b>.</p>
 *   → "Click <1>here</1> or <2>there</2>."
 *
 * and restored after translation by re-attaching the ORIGINAL inline elements
 * (attributes, listeners and styles survive). Opaque inline elements (br, img,
 * code, ...) become self-closing placeholders: "<3/>".
 *
 * If the translated text does not contain a well-formed, complete set of
 * placeholders, nothing is applied and the original DOM is left untouched.
 */

const BLOCK_TAGS = new Set([
  "P",
  "LI",
  "TD",
  "TH",
  "DD",
  "DT",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "FIGCAPTION",
  "BLOCKQUOTE",
  "SUMMARY",
  "CAPTION",
  "DIV",
]);

/** Inline elements whose text is translated in place. */
const INLINE_TAGS = new Set([
  "A",
  "B",
  "STRONG",
  "I",
  "EM",
  "U",
  "S",
  "SPAN",
  "SMALL",
  "SUB",
  "SUP",
  "MARK",
  "ABBR",
  "CITE",
  "Q",
  "DEL",
  "INS",
  "TIME",
  "FONT",
]);

/** Inline elements kept intact and passed as self-closing placeholders. */
const OPAQUE_TAGS = new Set([
  "BR",
  "IMG",
  "WBR",
  "CODE",
  "KBD",
  "SAMP",
  "VAR",
  "SVG",
  "INPUT",
]);

/** Containers whose size is usually fixed: translations must not grow them much. */
export const CONSTRAINED_SELECTOR =
  'button, th, nav, [role="button"], [role="tab"], [role="menuitem"]';

/** Allowed growth of display width before a constrained element is left alone. */
const GROWTH_RATIO = 1.4;
const GROWTH_SLACK = 4;

export type BlockNode =
  | { kind: "text"; node: Text }
  | { kind: "el"; id: number; el: Element; children: BlockNode[] }
  | { kind: "void"; id: number; el: Element };

export interface BlockUnit {
  element: Element;
  tree: BlockNode[];
  /** Marked-up source string sent to the translator. */
  markup: string;
  /** Original child lists of the block and of every inline element in it. */
  originalChildren: Map<Element, Node[]>;
  /** Number of placeholders (ids are 1..count). */
  count: number;
}

export function isBlockTag(el: Element): boolean {
  return BLOCK_TAGS.has(el.tagName);
}

export function isConstrained(el: Element | null): Element | null {
  return el ? el.closest(CONSTRAINED_SELECTOR) : null;
}

/** Display width: full-width (CJK etc.) characters count double. */
export function displayWidth(text: string): number {
  let width = 0;
  for (const ch of text) {
    width += ch.codePointAt(0)! >= 0x2e80 ? 2 : 1;
  }
  return width;
}

export function growsTooMuch(original: string, translated: string): boolean {
  return (
    displayWidth(translated.trim()) >
    displayWidth(original.trim()) * GROWTH_RATIO + GROWTH_SLACK
  );
}

/**
 * Try to build a block unit for `element`.
 * Returns null when the element is not a pure text+inline block or has no
 * inline element worth wrapping (plain text blocks keep the per-text-node path).
 */
export function buildBlockUnit(
  element: Element,
  isExcluded: (el: Element) => boolean,
): BlockUnit | null {
  if (!isBlockTag(element)) return null;

  const originalChildren = new Map<Element, Node[]>();
  let count = 0;
  let inlineWithText = 0;
  let ok = true;

  const walk = (parent: Element): BlockNode[] => {
    originalChildren.set(parent, Array.from(parent.childNodes));
    const nodes: BlockNode[] = [];
    for (const child of Array.from(parent.childNodes)) {
      if (!ok) break;
      if (child.nodeType === Node.TEXT_NODE) {
        nodes.push({ kind: "text", node: child as Text });
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as Element;
        const tag = el.tagName.toUpperCase();
        if (OPAQUE_TAGS.has(tag) || (INLINE_TAGS.has(tag) && isExcluded(el))) {
          nodes.push({ kind: "void", id: ++count, el });
        } else if (INLINE_TAGS.has(tag)) {
          const id = ++count;
          const children = walk(el);
          if (el.textContent?.trim()) inlineWithText++;
          nodes.push({ kind: "el", id, el, children });
        } else {
          ok = false; // nested block, form control, etc.
        }
      } else if (child.nodeType !== Node.COMMENT_NODE) {
        ok = false;
      }
    }
    return nodes;
  };

  const tree = walk(element);
  if (!ok || inlineWithText === 0) return null;

  const markup = serialize(tree);
  if (/[<>]/.test(markup.replace(/<\/?\d+\/?>/g, ""))) return null;
  if (!markup.replace(/<\/?\d+\/?>/g, "").trim()) return null;

  return { element, tree, markup: markup.trim(), originalChildren, count };
}

function serialize(nodes: BlockNode[]): string {
  return nodes
    .map((n) => {
      if (n.kind === "text") return n.node.textContent || "";
      if (n.kind === "void") return `<${n.id}/>`;
      return `<${n.id}>${serialize(n.children)}</${n.id}>`;
    })
    .join("");
}

/** Plain text of marked-up string (placeholders removed). */
export function stripMarkup(markup: string): string {
  return markup.replace(/<\/?\d+\/?>/g, "");
}

type Parsed =
  | { kind: "text"; text: string }
  | { kind: "el"; id: number; children: Parsed[] }
  | { kind: "void"; id: number };

/** Parse translated markup. Returns null if malformed or placeholders differ. */
export function parseTranslation(
  translated: string,
  unit: BlockUnit,
): Parsed[] | null {
  const root: Parsed[] = [];
  const stack: { id: number; children: Parsed[] }[] = [];
  const seen = new Set<number>();
  const current = () =>
    stack.length ? stack[stack.length - 1].children : root;
  const re = /<(\/?)(\d+)(\/?)>/g;
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(translated))) {
    if (m.index > last) {
      current().push({ kind: "text", text: translated.slice(last, m.index) });
    }
    last = re.lastIndex;
    const closing = m[1] === "/";
    const selfClosing = m[3] === "/";
    const id = Number(m[2]);
    if (closing) {
      const top = stack.pop();
      if (!top || top.id !== id) return null;
    } else {
      if (id < 1 || id > unit.count || seen.has(id)) return null;
      seen.add(id);
      if (selfClosing) {
        current().push({ kind: "void", id });
      } else {
        const node: Parsed = { kind: "el", id, children: [] };
        current().push(node);
        stack.push(node);
      }
    }
  }
  if (last < translated.length) {
    current().push({ kind: "text", text: translated.slice(last) });
  }
  if (stack.length > 0 || seen.size !== unit.count) return null;

  // Void ids must stay void, element ids must stay elements.
  const kinds = new Map<number, string>();
  const collect = (nodes: BlockNode[]) =>
    nodes.forEach((n) => {
      if (n.kind === "text") return;
      kinds.set(n.id, n.kind);
      if (n.kind === "el") collect(n.children);
    });
  collect(unit.tree);
  const check = (nodes: Parsed[]): boolean =>
    nodes.every((n) =>
      n.kind === "text"
        ? true
        : kinds.get(n.id) === n.kind &&
          (n.kind === "void" || check(n.children)),
    );
  return check(root) ? root : null;
}

/**
 * Apply a translation to the block, re-using the original inline elements.
 * Returns false (DOM untouched) if the translation is unusable.
 */
export function applyBlockTranslation(
  unit: BlockUnit,
  translated: string,
): boolean {
  const parsed = parseTranslation(translated, unit);
  if (!parsed) return false;

  const elements = new Map<number, Element>();
  const index = (nodes: BlockNode[]) =>
    nodes.forEach((n) => {
      if (n.kind === "text") return;
      elements.set(n.id, n.el);
      if (n.kind === "el") index(n.children);
    });
  index(unit.tree);

  const render = (nodes: Parsed[]): Node[] =>
    nodes.map((n) => {
      if (n.kind === "text") return document.createTextNode(n.text);
      const el = elements.get(n.id)!;
      if (n.kind === "el") {
        el.replaceChildren(...render(n.children));
      }
      return el;
    });

  unit.element.replaceChildren(...render(parsed));
  return true;
}

export function restoreBlock(unit: BlockUnit): void {
  // Restore inline elements first, then the block itself.
  unit.originalChildren.forEach((children, el) => {
    if (el !== unit.element) el.replaceChildren(...children);
  });
  unit.element.replaceChildren(
    ...(unit.originalChildren.get(unit.element) || []),
  );
}
