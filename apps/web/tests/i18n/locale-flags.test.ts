// **The flags the language menu draws, and the three ways a flag can be wrong.**
//
// The owner's 2026-09-10 ruling replaced the menu's current-locale dot with a flag on every row, and
// ruled Romanian's flag to be **the Republic of Moldova's** — the language is Romanian, the market is
// Moldova. That ruling is why the checks below pin colours and proportions rather than merely
// counting three bands: Romania's flag is *also* a vertical blue-yellow-red tricolour, so a file that
// quietly drew Romania's would satisfy every structural claim and still be the wrong flag.
//
// The second failure is a flag that says something. A flag names a language; it cannot say which
// language is current, and a screen reader that announced one would read the language's name twice.
// So every flag here is `aria-hidden` and carries no text — asserted, not assumed.
//
// The third is the one `Record<AppLocale, …>` already makes impossible and this file states out loud:
// a locale offered with no flag. Swept over `routing.locales`, so a fourth language is covered by
// these cases without an edit here.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { flagOf } from "@/i18n/locale-flags";
import { routing } from "@/i18n/routing";

/** The rendered flag, as the two things every claim below is made about. */
function markupOf(locale: (typeof routing.locales)[number]): string {
  return renderToStaticMarkup(flagOf(locale));
}

function fillsOf(markup: string): readonly string[] {
  return [...markup.matchAll(/fill="([^"]+)"/g)].map((match) => match[1] ?? "");
}

function boxOf(markup: string): {
  readonly width: number;
  readonly height: number;
} {
  const width = /<svg[^>]*\bwidth="(\d+)"/.exec(markup)?.[1];
  const height = /<svg[^>]*\bheight="(\d+)"/.exec(markup)?.[1];
  if (width === undefined || height === undefined)
    throw new Error("the flag declares no size of its own");
  return { width: Number(width), height: Number(height) };
}

describe("every language on offer flies a flag", () => {
  it.each([...routing.locales])("draws one for %s", (locale) => {
    const markup = markupOf(locale);

    expect(markup.startsWith("<svg")).toBe(true);
    expect(fillsOf(markup)).toHaveLength(3);
  });

  it("draws a different flag for each, so no two languages share one", () => {
    const drawn = routing.locales.map((locale) => markupOf(locale));

    expect(new Set(drawn).size).toBe(drawn.length);
  });

  // Same width, so the endonyms beside them keep one left edge; each flag's own height, so none of
  // them is stretched out of its country's proportion to get there.
  it("gives every flag one width, and lets each keep its own proportion", () => {
    const widths = routing.locales.map(
      (locale) => boxOf(markupOf(locale)).width,
    );

    expect(new Set(widths).size).toBe(1);
    expect(widths[0]).toBeGreaterThan(0);
  });
});

describe("a flag is decoration, and the endonym is the name", () => {
  it.each([...routing.locales])(
    "hides %s's flag from the accessibility tree",
    (locale) => {
      const markup = markupOf(locale);

      expect(markup).toContain('aria-hidden="true"');
      // No `<text>`, no `<title>`: "Moldova flag, Română" is the announcement this prevents.
      expect(markup).not.toMatch(/<(text|title)\b/);
    },
  );
});

describe("the flags themselves", () => {
  // **The ruling's own claim.** Romania's tricolour is the same three bands in the same order at
  // 2:3 and in different shades (`#002b7f`, `#fcd116`, `#ce1126`), so the colours and the 1:2 are
  // what actually distinguish Moldova's from it.
  it("flies the Republic of Moldova's flag for Romanian, not Romania's", () => {
    const markup = markupOf("ro");
    const { width, height } = boxOf(markup);

    expect(fillsOf(markup)).toEqual(["#0046ae", "#ffd200", "#cc092f"]);
    expect(width / height).toBe(2);
    expect(markup).not.toMatch(/#002b7f|#fcd116|#ce1126/);
  });

  // Vertical bands, left to right: three `x` offsets and one shared height.
  it("stands Moldova's bands upright, in equal thirds", () => {
    const bands = [...markupOf("ro").matchAll(/<rect[^>]*>/g)].map(
      (match) => match[0],
    );

    expect(bands.map((band) => /\bx="(\d+)"/.exec(band)?.[1])).toEqual([
      undefined,
      "2",
      "4",
    ]);
    for (const band of bands) expect(band).toContain('width="2"');
  });

  // White on top. The Netherlands' is red-white-blue and Serbia's is this flag upside down, so the
  // order is the whole claim.
  it("lays Russia's bands white, blue then red from the top", () => {
    const markup = markupOf("ru");
    const { width, height } = boxOf(markup);

    expect(fillsOf(markup)).toEqual(["#ffffff", "#0039a6", "#d52b1e"]);
    expect(width / height).toBe(1.5);
  });

  it("stacks Russia's bands, in equal thirds", () => {
    const bands = [...markupOf("ru").matchAll(/<rect[^>]*>/g)].map(
      (match) => match[0],
    );

    expect(bands.map((band) => /\by="(\d+)"/.exec(band)?.[1])).toEqual([
      undefined,
      "2",
      "4",
    ]);
    for (const band of bands) expect(band).toContain('height="2"');
  });
});
