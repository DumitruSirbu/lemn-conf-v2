// @vitest-environment happy-dom
//
// The reading-order extractor the sheet's "said once" checks stand on. A check that counts utterances is only worth what the
// extractor can see, so this proves it sees the failures it is there for: a labelled group that repeats its content, a name
// pointing at nothing, and hidden text that is not read.
import { describe, expect, it } from "vitest";

import { accessibleNameOf, utterancesOf } from "./read-aloud";

function parse(markup: string): HTMLElement {
  const host = document.createElement("div");
  host.innerHTML = markup;
  document.body.replaceChildren(host);
  return host;
}

function buttonsOf(host: HTMLElement): Element[] {
  return [...host.querySelectorAll("button")];
}

describe("the reading-order extractor", () => {
  it("reads a labelled group's name and then its content, so a name that repeats its content is heard twice", () => {
    const host = parse(
      '<div role="group" aria-label="MDF nu mai este disponibil"><span>Material</span><span>MDF</span><span>nu mai este disponibil</span></div>',
    );

    expect(utterancesOf(host)).toEqual([
      "MDF nu mai este disponibil",
      "Material",
      "MDF",
      "nu mai este disponibil",
    ]);
  });

  it("reads an unlabelled row's spans in document order, once each", () => {
    const host = parse("<div><span>Material</span><span>MDF</span></div>");

    expect(utterancesOf(host)).toEqual(["Material", "MDF"]);
  });

  it("skips aria-hidden and hidden subtrees, however deep", () => {
    const host = parse(
      '<div><span aria-hidden="true">glyph</span><p hidden>never</p><div><i aria-hidden="true"><b>deep</b></i>kept</div></div>',
    );

    expect(utterancesOf(host)).toEqual(["kept"]);
  });

  it("names a button by aria-labelledby, in the order of the ids, and does not read its content as well", () => {
    const host = parse(
      '<span id="a">Material</span><button id="b" aria-labelledby="b a">Alege</button>',
    );

    expect(utterancesOf(host)).toEqual(["Material", "Alege Material"]);
  });

  it("gives an empty name to a button whose labelledby id points at nothing, as a browser does", () => {
    const host = parse('<button aria-labelledby="missing">Alege</button>');

    expect(buttonsOf(host).map(accessibleNameOf)).toEqual([""]);
    expect(utterancesOf(host)).toEqual([]);
  });

  it("falls back to the content for an unlabelled button, and to aria-label before it", () => {
    const host = parse(
      '<button id="one">Alege</button><button id="two" aria-label="Change">x</button>',
    );

    expect(buttonsOf(host).map(accessibleNameOf)).toEqual(["Alege", "Change"]);
  });

  it("treats a span with role=link as named by itself, and an anchor without an href as plain text", () => {
    const host = parse(
      '<span role="link" aria-disabled="true">Review</span><a>plain</a>',
    );

    expect(utterancesOf(host)).toEqual(["Review", "plain"]);
  });
});
