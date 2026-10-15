// Reads source and stylesheets: what the already-sent view's pieces declare, which a dom test cannot paint. The pinned
// region is sticky and in the flow, and the call link is a touch target.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { valuesFor } from "../support/css-declarations";

const SOURCE_ROOT = join(import.meta.dirname, "../../src");

function sourceOf(path: string): string {
  return readFileSync(join(SOURCE_ROOT, path), "utf8");
}

describe("the call link's stylesheet", () => {
  const stylesheet = sourceOf("shop/call-shop-link.module.css");

  it("is at least a touch target tall", () => {
    expect(valuesFor(stylesheet, "callShop", "min-height")).toEqual([
      "var(--touch-target)",
    ]);
  });
});

describe("the already-sent view's foot", () => {
  const stylesheet = sourceOf("contact/contact.module.css");

  it("is the contact page's pinned region, sticky and in the flow", () => {
    expect(valuesFor(stylesheet, "bottom", "position")).toEqual(["sticky"]);
    expect(sourceOf("contact/already-sent-view.tsx")).toContain(
      "styles.bottom",
    );
  });

  it("keeps what takes focus clear of the pinned region", () => {
    expect(sourceOf("contact/already-sent-view.tsx")).toContain(
      "useKeepFocusAbove(regionRef)",
    );
  });
});
