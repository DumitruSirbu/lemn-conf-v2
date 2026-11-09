// M10 Q5d, adversarial: the review control's stylesheet, read as source. The implementer's test pins the disabled rule's values;
// this holds what surrounds it: that the enabled rule is exactly what it was (the disabled look is an override, never an edit to
// the live control), that the only rules naming the control are the three that should, that nothing interactive (hover, active,
// focus, pointer-events) can land on the disabled state, and that a broad selector elsewhere cannot reach the span.
//
// What this cannot see: the cascade as a browser resolves it. It reads rule text; a browser check of the painted control is
// what shows the grey at 390 and 1440.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const SOURCE_DIRECTORY = resolve(import.meta.dirname, "../../src/app");
const configureCss = readCss("configurator/configure/configure.module.css");
const globalsCss = readCss("globals.css");

/** `.reviewCta` as it stood at 787c9d38, before Q5d: the enabled control, declaration by declaration. */
const ENABLED_RULE_BEFORE_Q5D = [
  "display: flex",
  "flex: 1",
  "align-items: center",
  "justify-content: center",
  "height: 52px",
  "text-decoration: none",
  "font: 700 15px/1 var(--font-ui)",
  "color: var(--paper)",
  "background: var(--accent)",
  "border-radius: 12px",
];

interface Rule {
  readonly selector: string;
  readonly declarations: readonly string[];
}

function readCss(relativePath: string): string {
  return readFileSync(resolve(SOURCE_DIRECTORY, relativePath), "utf8");
}

/** Every innermost `selector { declarations }` block, comments dropped; an at-rule's body is read as the rules inside it. */
function rulesOf(css: string): Rule[] {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  return [...withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(
    ([, selector = "", body = ""]) => ({
      selector: selector.trim(),
      declarations: body
        .split(";")
        .map((declaration) => declaration.trim().replace(/\s+/g, " "))
        .filter((declaration) => declaration !== ""),
    }),
  );
}

function rulesNamingTheControl(): Rule[] {
  return rulesOf(configureCss).filter((rule) =>
    rule.selector.includes("reviewCta"),
  );
}

/** The nth rule naming the control, in stylesheet order. */
function ruleNamingTheControl(position: number): Rule {
  const rule = rulesNamingTheControl()[position];
  if (rule === undefined) throw new Error(`no rule ${String(position)}`);
  return rule;
}

function propertiesOf(rule: Rule): string[] {
  return rule.declarations.map((declaration) =>
    declaration.slice(0, declaration.indexOf(":")).trim(),
  );
}

describe("the rules that name the review control", () => {
  it("are exactly three: the enabled rule, the disabled override, and the desktop sizing", () => {
    expect(rulesNamingTheControl().map((rule) => rule.selector)).toEqual([
      ".reviewCta",
      '.reviewCta[aria-disabled="true"]',
      ".reviewCta",
    ]);
  });

  it("leave the enabled rule exactly as it was before Q5d", () => {
    const enabled = ruleNamingTheControl(0);

    expect(enabled.declarations).toEqual(ENABLED_RULE_BEFORE_Q5D);
  });

  it("keep the disabled override a paint-and-cursor override only: no size, no border, no opacity, no pointer-events", () => {
    const disabled = ruleNamingTheControl(1);

    expect(disabled.selector).toBe('.reviewCta[aria-disabled="true"]');
    const touched = propertiesOf(disabled).filter(
      (property) => !property.startsWith("--"),
    );
    expect([...touched].sort()).toEqual([
      "background",
      "box-shadow",
      "color",
      "cursor",
    ]);
  });

  it("keep the desktop override to the box's size and spacing: it re-paints nothing and cannot undo the disabled look", () => {
    const desktop = ruleNamingTheControl(2);

    expect(propertiesOf(desktop)).toEqual(["flex", "height", "padding"]);
  });

  it("never use !important, which would let one rule beat the others regardless of specificity", () => {
    for (const rule of rulesNamingTheControl()) {
      expect(rule.declarations.join(";")).not.toMatch(/!important/);
    }
  });

  it("draw the disabled box exactly the enabled box's size: the border is an inset shadow, not a border or an outline", () => {
    const disabled = ruleNamingTheControl(1);

    expect(disabled.declarations).toContain(
      "box-shadow: inset 0 0 0 1px var(--line)",
    );
    expect(propertiesOf(disabled)).not.toContain("border");
    expect(propertiesOf(disabled)).not.toContain("outline");
    expect(propertiesOf(disabled)).not.toContain("padding");
  });
});

describe("nothing interactive can land on the disabled control", () => {
  /** Whether the last compound of a selector can match a `span.reviewCta[role=link][aria-disabled=true]`. */
  function couldMatchTheDisabledSpan(selector: string): boolean {
    const lastCompound = selector.split(/[\s>+~]+/).pop() ?? "";
    const beforePseudo = lastCompound.split(":")[0] ?? "";
    return (
      beforePseudo === "" ||
      beforePseudo === "*" ||
      beforePseudo.startsWith("span") ||
      beforePseudo.includes("reviewCta") ||
      beforePseudo.includes("[role") ||
      beforePseudo.includes("aria-disabled")
    );
  }

  it("has no :hover, :active, :focus or :focus-visible rule on the control", () => {
    for (const rule of rulesOf(configureCss)) {
      if (rule.selector.includes("reviewCta")) {
        expect(rule.selector).not.toMatch(/:(hover|active|focus)/);
      }
    }
  });

  it("has no interaction-state rule in either stylesheet that a span with role=link could match", () => {
    const interactionRules = [
      ...rulesOf(configureCss),
      ...rulesOf(globalsCss),
    ].filter((rule) =>
      /:(hover|active|focus|focus-visible)\b/.test(rule.selector),
    );

    for (const { selector } of interactionRules) {
      for (const part of selector.split(",")) {
        expect(
          couldMatchTheDisabledSpan(part.trim()),
          `${part.trim()} would reach the disabled span`,
        ).toBe(false);
      }
    }
  });

  it("sets neither pointer-events nor user-select on the control, so the not-allowed cursor is the one that shows", () => {
    for (const rule of rulesNamingTheControl()) {
      expect(propertiesOf(rule)).not.toContain("pointer-events");
      expect(propertiesOf(rule)).not.toContain("user-select");
    }
  });

  it("is overridden by no global rule that names a link or a role: globals.css only sets an anchor's colour to inherit", () => {
    const rulesThatCouldTouchIt = rulesOf(globalsCss).filter((rule) =>
      /(^|[\s,])(a|span)\b|\[role|aria-disabled/.test(rule.selector),
    );

    expect(
      rulesThatCouldTouchIt.map((rule) => [rule.selector, rule.declarations]),
    ).toEqual([["a", ["color: inherit"]]]);
  });
});
