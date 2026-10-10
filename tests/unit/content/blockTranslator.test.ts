import { DOMManipulator } from "@content/domManipulator";

describe("block-level translation", () => {
  let dm: DOMManipulator;
  beforeEach(() => {
    dm = new DOMManipulator();
  });

  it("extracts a block with inline tags as one placeholder unit", () => {
    document.body.innerHTML =
      '<p id="p">Click <a href="/x">here</a> or <b>there</b>.</p>';
    const nodes = dm.extractTextNodes();
    expect(nodes).toHaveLength(1);
    expect(nodes[0].text).toBe("Click <1>here</1> or <2>there</2>.");
  });

  it("keeps plain-text blocks on the text-node path", () => {
    document.body.innerHTML = "<p>Hello</p>";
    const nodes = dm.extractTextNodes();
    expect(nodes[0].block).toBeUndefined();
    expect(nodes[0].node.nodeType).toBe(Node.TEXT_NODE);
  });

  it("restores the original inline elements, allowing reordering", () => {
    document.body.innerHTML =
      '<p id="p">Click <a href="/x">here</a> or <b>there</b>.</p>';
    const a = document.querySelector("a")!;
    const nodes = dm.extractTextNodes();
    dm.applyTranslations(nodes, ["<2>あちら</2>か<1>こちら</1>をクリック。"]);
    const p = document.getElementById("p")!;
    expect(p.textContent).toBe("あちらかこちらをクリック。");
    expect(document.querySelector("a")).toBe(a);
    expect(a.getAttribute("href")).toBe("/x");
    expect(a.textContent).toBe("こちら");
  });

  it("leaves DOM untouched when placeholders are broken", () => {
    document.body.innerHTML = '<p>Click <a href="/x">here</a>.</p>';
    const nodes = dm.extractTextNodes();
    dm.applyTranslations(nodes, ["こちらをクリック。"]);
    expect(document.body.innerHTML).toBe('<p>Click <a href="/x">here</a>.</p>');
  });

  it("handles void placeholders (br) and reset", () => {
    const html = "<p>Line one<br>Line <b>two</b></p>";
    document.body.innerHTML = html;
    const nodes = dm.extractTextNodes();
    expect(nodes[0].text).toBe("Line one<1/>Line <2>two</2>");
    dm.applyTranslations(nodes, ["一行目<1/>二行目<2>二</2>"]);
    expect(document.querySelector("br")).not.toBeNull();
    expect(document.body.textContent).toBe("一行目二行目二");
    dm.reset();
    expect(document.body.innerHTML).toBe(html);
  });

  it("does not treat blocks containing nested blocks as units", () => {
    document.body.innerHTML = "<li>Item <ul><li>Sub</li></ul></li>";
    const nodes = dm.extractTextNodes();
    expect(nodes.every((n) => !n.block)).toBe(true);
  });

  it("keeps original in constrained containers when text grows a lot", () => {
    document.body.innerHTML = "<button>Go <b>now</b></button>";
    const nodes = dm.extractTextNodes();
    // buttons are not block tags: fall back to text nodes
    dm.applyTranslations(
      nodes,
      nodes.map(() => "Veryveryverylongtranslation"),
    );
    expect(document.querySelector("button")!.textContent).toBe("Go now");
    expect(document.querySelector("button")!.getAttribute("title")).toContain(
      "Veryvery",
    );
    dm.reset();
    expect(document.querySelector("button")!.hasAttribute("title")).toBe(false);
  });

  it("guards th blocks with inline tags", () => {
    document.body.innerHTML =
      "<table><tr><th>Total <b>amount</b></th></tr></table>";
    const nodes = dm.extractTextNodes();
    expect(nodes[0].block).toBeDefined();
    dm.applyTranslations(nodes, ["<1>Gesamtbetragsumme</1> insgesamt hier"]);
    expect(document.querySelector("th")!.textContent).toBe("Total amount");
    expect(document.querySelector("th")!.getAttribute("title")).toBeTruthy();
  });
});
