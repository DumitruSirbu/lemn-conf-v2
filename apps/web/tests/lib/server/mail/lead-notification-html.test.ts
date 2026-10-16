import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { Design, Finish, Handle } from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import {
  escapeHtml,
  isAllowedNoticeHref,
  NoticeMarkupError,
  renderLeadNoticeHtml,
  type LeadNoticeView,
} from "@/lib/server/mail/lead-notification-html";
import {
  composeLeadNotice,
  NOTICE_LOCALE,
} from "@/lib/server/mail/lead-notification";

import { ro } from "../../../support/romanian-content";
import {
  VARIED_U_ARM,
  variedKitchensOf,
} from "../../../support/varied-kitchens";
import {
  designSubmission,
  FIXTURE_KITCHEN_URL,
  fixtureContact,
  fixtureNamed,
  LEAD_NOTICE_FIXTURES,
  noticeInput,
  snapshotOf,
} from "./lead-notice-fixtures";
import {
  contrastRatio,
  inheritedStyle,
  inlineStyleOf,
  isHidden,
  ownTextOf,
  parseNotice,
} from "./notice-html-dom-support";

const notice = ro.leadNotice;

function htmlOf(name: string): string {
  return composeLeadNotice(fixtureNamed(name)).html ?? "";
}

describe("escapeHtml", () => {
  it.each([
    ["an ampersand", "&", "&amp;"],
    ["a less-than sign", "<", "&lt;"],
    ["a greater-than sign", ">", "&gt;"],
    ["a double quote", '"', "&quot;"],
    ["a single quote", "'", "&#39;"],
    ["an entity already written", "&amp;", "&amp;amp;"],
    [
      "a closing cell and a script",
      "</td><script>",
      "&lt;/td&gt;&lt;script&gt;",
    ],
    ["an attribute breaking out", '" onerror="x', "&quot; onerror=&quot;x"],
  ])("writes %s as text", (_label, value, escaped) => {
    expect(escapeHtml(value)).toBe(escaped);
  });

  it.each([
    ["Cyrillic", "Русский"],
    ["an emoji", "😀"],
    ["a right-to-left override", "abc‮fed"],
    ["a zero-width joiner and a byte order mark", "a‍b﻿"],
    ["half of a surrogate pair", "a\ud800b"],
    ["a line feed and a carriage return", "a\r\nb"],
    ["braces and a scheme", "{{name}} javascript:x"],
  ])("leaves %s as it is, having no markup character", (_label, value) => {
    expect(escapeHtml(value)).toBe(value);
  });

  it("escapes a very long value whole", () => {
    const escaped = escapeHtml("<".repeat(100_000));

    expect(escaped).toBe("&lt;".repeat(100_000));
  });
});

describe("the href allow-list", () => {
  it.each([
    ["the kitchen link", FIXTURE_KITCHEN_URL],
    [
      "the kitchen link on a loopback origin",
      "http://localhost:4320/ro/s/AbCdEf012345",
    ],
    [
      "the kitchen link on a loopback address",
      "http://127.0.0.1:3000/ro/s/AbCdEf012345",
    ],
    ["a call", "tel:+37369000123"],
    ["a WhatsApp chat", "https://wa.me/37369000123"],
    ["an e-mail", "mailto:ion.exemplu%2Boferta@example.invalid"],
    ["an e-mail with an encoded question mark", "mailto:a%3Fcc%3Db@example.md"],
  ])("accepts %s", (_label, href) => {
    expect(isAllowedNoticeHref(href, NOTICE_LOCALE)).toBe(true);
  });

  it.each([
    ["a script", "javascript:alert(1)"],
    ["a script in capitals", "JAVASCRIPT:alert(1)"],
    ["a script after a space", " javascript:alert(1)"],
    ["a data address", "data:text/html,<script>alert(1)</script>"],
    ["a VBScript", "vbscript:msgbox(1)"],
    ["a file", "file:///etc/passwd"],
    ["a kitchen link with a short token", "https://example.invalid/ro/s/short"],
    [
      "a kitchen link in another language",
      "https://example.invalid/ru/s/Fixture0Tok1",
    ],
    ["a kitchen link with a query", `${FIXTURE_KITCHEN_URL}?x=1`],
    ["a kitchen link with a fragment", `${FIXTURE_KITCHEN_URL}#x`],
    ["a kitchen link with a trailing line feed", `${FIXTURE_KITCHEN_URL}\n`],
    [
      "a kitchen link under a path",
      "https://example.invalid/x/ro/s/Fixture0Tok1",
    ],
    [
      "a kitchen link with user information",
      "https://u@example.invalid/ro/s/Fixture0Tok1",
    ],
    ["a kitchen link in capitals", "HTTPS://EXAMPLE.INVALID/ro/s/Fixture0Tok1"],
    [
      "a kitchen link over plain http",
      "http://example.invalid/ro/s/Fixture0Tok1",
    ],
    [
      "a kitchen link on a port past the range",
      "https://example.invalid:99999/ro/s/Fixture0Tok1",
    ],
    [
      "a kitchen link nested in another",
      `${FIXTURE_KITCHEN_URL}/ro/s/Fixture0Tok1`,
    ],
    ["a call with letters", "tel:+3736900012a"],
    ["a call without the plus", "tel:37369000123"],
    ["a call that is too long", "tel:+1234567890123456"],
    ["a WhatsApp chat with a plus", "https://wa.me/+37369000123"],
    ["a WhatsApp chat with a query", "https://wa.me/37369000123?text=x"],
    ["an e-mail adding a copy", "mailto:a@example.md?cc=b@example.md"],
    ["an e-mail with an ampersand", "mailto:a&b@example.md"],
    ["an e-mail with a fragment", "mailto:a#b@example.md"],
    ["an e-mail with an encoded line feed", "mailto:a%0Ab@example.md"],
    ["an e-mail with an encoded carriage return", "mailto:a%0db@example.md"],
    ["an e-mail with a capital domain", "mailto:a@Example.md"],
    ["an empty address", ""],
  ])("refuses %s", (_label, href) => {
    expect(isAllowedNoticeHref(href, NOTICE_LOCALE)).toBe(false);
  });

  it("refuses the kitchen link when the notice's language is not a language tag", () => {
    expect(isAllowedNoticeHref(FIXTURE_KITCHEN_URL, "r.")).toBe(false);
  });

  it("is what the template asks: a view holding a refused link is not rendered", () => {
    const view = viewWithAction("javascript:alert(1)");

    expect(() => renderLeadNoticeHtml(view)).toThrow(NoticeMarkupError);
  });
});

function viewWithAction(href: string): LeadNoticeView {
  return {
    lang: NOTICE_LOCALE,
    title: "title",
    preheader: "preheader",
    wordmark: "wordmark",
    tagline: "tagline",
    heading: "heading",
    body: { kind: "callback", callbackLine: "callback" },
    client: {
      heading: "client",
      name: "name",
      phone: "phone",
      actions: [{ kind: "call", href, label: "call" }],
      facts: [],
    },
    footer: { lines: ["reference"], noReply: "no reply" },
  };
}

describe("the document", () => {
  it.each(LEAD_NOTICE_FIXTURES)(
    "is one HTML document in the notice's language, light only, for $name",
    ({ input }) => {
      const { document } = parseNotice(composeLeadNotice(input).html ?? "");

      expect(document.documentElement.getAttribute("lang")).toBe(NOTICE_LOCALE);
      expect(
        document
          .querySelector('meta[name="color-scheme"]')
          ?.getAttribute("content"),
      ).toBe("light");
      expect(
        document
          .querySelector('meta[name="supported-color-schemes"]')
          ?.getAttribute("content"),
      ).toBe("light");
      expect(
        document.querySelector("meta[charset]")?.getAttribute("charset"),
      ).toBe("utf-8");
    },
  );

  it.each(LEAD_NOTICE_FIXTURES)(
    "lays out in tables a reader is told are no data, for $name",
    ({ input }) => {
      const { document } = parseNotice(composeLeadNotice(input).html ?? "");
      const tables = [...document.querySelectorAll("table")];

      expect(tables.length).toBeGreaterThan(2);
      expect(
        tables.filter((table) => table.getAttribute("role") !== "presentation"),
      ).toEqual([]);
    },
  );

  it("has one h1 and the section headings as headings, for a design", () => {
    const { document } = parseNotice(htmlOf("design-with-link"));

    expect([...document.querySelectorAll("h1")].map(ownTextOf)).toEqual([
      notice.heading,
    ]);
    expect([...document.querySelectorAll("h2")].map(ownTextOf)).toEqual([
      notice.clientHeading,
      notice.summaryHeading,
    ]);
    expect([...document.querySelectorAll("h3")].map(ownTextOf)).toEqual([
      notice.appendixHeading,
    ]);
  });

  it("opens with the hidden preheader as the body's first text", () => {
    const { document } = parseNotice(htmlOf("design-with-link"));
    const first = document.body.firstElementChild;
    const contact = fixtureContact();

    expect(first?.textContent).toBe(
      notice.preheader({
        lead: notice.kitchen.button,
        name: contact.name,
        locality: contact.locality,
      }),
    );
    expect(first !== null && isHidden(first)).toBe(true);
    expect(document.body.childNodes[0]).toBe(first);
  });

  it("names the action in every link's own words", () => {
    const { document } = parseNotice(htmlOf("email-channel-u-kitchen"));

    expect([...document.querySelectorAll("a")].map(ownTextOf)).toEqual([
      notice.kitchen.button,
      notice.actions.call,
      notice.actions.email,
    ]);
  });
});

/** D5's list, as elements, attributes and style text a parsed document could hold. */
const ACTIVE_ELEMENTS =
  "img, script, link, iframe, form, style, object, embed, video, audio, svg, base";
const REMOTE_ATTRIBUTES = [
  "src",
  "srcset",
  "background",
  "action",
  "formaction",
  "poster",
];
const ACTIVE_STYLE = /url\(|@import|expression\(|behavior:/i;
const D5_STRINGS = [
  "<img",
  "<script",
  "<link",
  "<iframe",
  "<form",
  "<style",
  "src=",
  "url(",
  "@import",
  "background=",
];

describe("no remote or active content", () => {
  it.each(LEAD_NOTICE_FIXTURES)(
    "parses to no active element, no remote attribute, no handler and no fetching style, for $name",
    ({ input }) => {
      const { document, elements } = parseNotice(
        composeLeadNotice(input).html ?? "",
      );

      expect(document.querySelectorAll(ACTIVE_ELEMENTS)).toHaveLength(0);
      const attributeNames = elements.flatMap((element) =>
        element.getAttributeNames(),
      );
      expect(
        attributeNames.filter((name) => REMOTE_ATTRIBUTES.includes(name)),
      ).toEqual([]);
      expect(attributeNames.filter((name) => name.startsWith("on"))).toEqual(
        [],
      );
      expect(
        elements.filter((element) =>
          ACTIVE_STYLE.test(element.getAttribute("style") ?? ""),
        ),
      ).toEqual([]);
    },
  );

  it.each(
    LEAD_NOTICE_FIXTURES.filter(({ name }) => name !== "special-characters"),
  )(
    "holds none of the listed strings anywhere in its bytes, for $name",
    ({ input }) => {
      const html = composeLeadNotice(input).html ?? "";

      expect(D5_STRINGS.filter((needle) => html.includes(needle))).toEqual([]);
    },
  );

  it("holds a customer's markup only as text: the hostile fixture's strings are escaped, never elements", () => {
    const html = htmlOf("special-characters");

    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script");
    expect(html).toContain("&lt;img src=x onerror=y&gt;");
  });
});

/** WCAG AA for normal text. */
const MIN_CONTRAST = 4.5;

describe("contrast", () => {
  interface Pair {
    readonly colour: string;
    readonly background: string;
  }

  /** Text a reader sees: in the body, not hidden. The head's title is the client's to draw. */
  function pairsOf(html: string): Pair[] {
    const { document, elements } = parseNotice(html);
    return elements
      .filter(
        (element) =>
          document.body.contains(element) &&
          !isHidden(element) &&
          ownTextOf(element).trim() !== "",
      )
      .map((element) => ({
        colour: inheritedStyle(element, "color") ?? "none",
        background: inheritedStyle(element, "background-color") ?? "none",
      }));
  }

  const pairs = LEAD_NOTICE_FIXTURES.flatMap(({ input }) =>
    pairsOf(composeLeadNotice(input).html ?? ""),
  );
  const distinct = [
    ...new Set(pairs.map((pair) => `${pair.colour} on ${pair.background}`)),
  ];

  it("is at least 4.5:1 for every text and the background it sits on, computed from the rendered styles", () => {
    const below = distinct.filter((pair) => {
      const [colour = "", background = ""] = pair.split(" on ");
      return contrastRatio(colour, background) < MIN_CONTRAST;
    });

    expect(below).toEqual([]);
  });

  it("measured every kind of text the template draws, the button's white on the accent among them", () => {
    expect(pairs.length).toBeGreaterThan(100);
    expect(distinct.length).toBeGreaterThanOrEqual(5);
    expect(distinct).toContain("#ffffff on #7c5c3d");
  });

  it("names its own background and text colour on every cell, so a client's default reaches no text", () => {
    const cells = LEAD_NOTICE_FIXTURES.flatMap(({ input }) => [
      ...parseNotice(
        composeLeadNotice(input).html ?? "",
      ).document.querySelectorAll("td"),
    ]);
    const unnamed = cells.filter((cell) => {
      const style = inlineStyleOf(cell);
      return !style.has("background-color") || !style.has("color");
    });

    expect(cells.length).toBeGreaterThan(50);
    expect(unnamed).toEqual([]);
  });

  it("is a ratio the helper computes as WCAG does: black on white is 21:1", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
  });
});

/** Gmail clips a message past about 102 KB; the notice keeps its own margin under that. */
const HTML_BUDGET_BYTES = 90_000;
const MIN_U_KITCHENS = 50;

const OWN_FINISH: Finish = { kind: "palette-entry", entryId: "pal.antracit" };
const OWN_HANDLES: readonly Handle[] = ["steel", "black", "push"];

/** Every body dressed, so each row carries the most facts the review gives. */
function dressed(design: Design): Design {
  return {
    ...design,
    placements: design.placements.map((placement, index) => ({
      ...placement,
      body: {
        ...placement.body,
        finish: OWN_FINISH,
        handle: OWN_HANDLES[index % OWN_HANDLES.length],
      },
    })),
  };
}

describe("size", () => {
  it("keeps the HTML of every U kitchen of the sweep, dressed, under 90 000 bytes", () => {
    const sizes = variedKitchensOf(VARIED_U_ARM).flatMap(({ design }) => {
      const kitchen = dressed(design);
      const snapshot = snapshotOf(kitchen) ?? snapshotOf(design);
      if (snapshot === undefined) return [];
      const html =
        composeLeadNotice(noticeInput(designSubmission({ snapshot }))).html ??
        "";
      return [Buffer.byteLength(html, "utf8")];
    });

    expect(sizes.length).toBeGreaterThanOrEqual(MIN_U_KITCHENS);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(HTML_BUDGET_BYTES);
  });
});

const GOLDEN_PATH = join(
  import.meta.dirname,
  "fixtures",
  "lead-notice-design-with-link.golden.html",
);

describe("the golden notice", () => {
  // A reviewable copy of one rendered notice: open it in a browser. A change to the template, the copy or the
  // fixture kitchen moves it, and the moved file is the diff a reviewer reads.
  it("renders the design-with-link fixture byte for byte as the checked-in file", () => {
    expect(htmlOf("design-with-link")).toBe(readFileSync(GOLDEN_PATH, "utf8"));
  });
});
