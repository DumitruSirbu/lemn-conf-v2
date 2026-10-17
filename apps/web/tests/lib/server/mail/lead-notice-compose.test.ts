import { afterEach, describe, expect, it, vi } from "vitest";

import { endonymOf } from "@/i18n/locale-endonyms";
import type { SentKitchenLink } from "@/lib/server/contact/sent-kitchen-link";
import {
  composeLeadNotice,
  NOTICE_HTML_BUDGET_BYTES,
  NoticeLineError,
  type NoticeKitchenLink,
} from "@/lib/server/mail/lead-notification";
import {
  HTML_MAX_LENGTH,
  isSendableMailMessage,
  LINE_BREAKING_CHARACTER,
} from "@/lib/server/mail/mail-sender";
import { PUBLIC_ORIGIN_VARIABLE } from "@/lib/server/public-origin";

import { ro } from "../../../support/romanian-content";
import { VARIED_ARMS, VARIED_L_ARM } from "../../../support/varied-kitchens";
import {
  callbackSubmission,
  densestUKitchen,
  designSubmission,
  dressed,
  FIXTURE_KITCHEN_URL,
  FIXTURE_PUBLIC_ORIGIN,
  FIXTURE_REFERENCE,
  FIXTURE_REVISION,
  fixtureContact,
  KITCHEN_LINK,
  LEAD_NOTICE_FIXTURES,
  NO_LINK,
  noticeInput,
  sendableKitchensOf,
  snapshotOf,
} from "./lead-notice-fixtures";
import { consoleCallsOf, spyOnEveryConsoleMethod } from "./mail-test-support";
import { ownTextOf, parseNotice } from "./notice-html-dom-support";

afterEach(() => {
  vi.restoreAllMocks();
});

const notice = ro.leadNotice;
const KITCHENS_PER_ARM = 30;
const MIN_KITCHENS_PER_ARM = 20;

function linesOf(text: string): string[] {
  return text.split("\n");
}

function customerLinesFor(locale: string): string[] {
  const contact = fixtureContact();
  return [
    notice.line(notice.labels.reference, FIXTURE_REFERENCE),
    notice.line(notice.labels.locale, locale),
    notice.line(notice.labels.name, contact.name),
    notice.line(notice.labels.phone, contact.phoneNormalForm),
    notice.line(notice.labels.locality, contact.locality),
    notice.line(notice.labels.channel, notice.channels.whatsapp),
  ];
}

describe("the text part's order", () => {
  it("opens a design's notice with the link's line, a blank line, then the customer's lines in their order", () => {
    const lines = linesOf(
      composeLeadNotice(noticeInput(designSubmission())).text,
    );

    expect(lines.slice(0, 9)).toEqual([
      notice.line(notice.kitchen.linkLabel, FIXTURE_KITCHEN_URL),
      "",
      ...customerLinesFor(endonymOf("ro")),
      "",
    ]);
  });

  it("opens with the unavailable sentence in the link's place when there is no link", () => {
    const lines = linesOf(
      composeLeadNotice(noticeInput(designSubmission(), NO_LINK)).text,
    );

    expect(lines.slice(0, 3)).toEqual([
      notice.kitchen.unavailable,
      "",
      notice.line(notice.labels.reference, FIXTURE_REFERENCE),
    ]);
  });

  it.each(VARIED_ARMS.map((arm) => [arm.name, arm] as const))(
    "holds the link line first and passes the single-line rule on every line, for every sendable kitchen of the %s arm",
    (_name, arm) => {
      const kitchens = sendableKitchensOf(arm).slice(0, KITCHENS_PER_ARM);
      const wrong = kitchens.filter(({ snapshot }) => {
        const message = composeLeadNotice(
          noticeInput(designSubmission({ snapshot })),
        );
        const lines = linesOf(message.text);
        return (
          lines[0] !==
            notice.line(notice.kitchen.linkLabel, FIXTURE_KITCHEN_URL) ||
          lines[1] !== "" ||
          lines.some((line) => LINE_BREAKING_CHARACTER.test(line)) ||
          !isSendableMailMessage(message)
        );
      });

      expect(kitchens.length).toBeGreaterThanOrEqual(MIN_KITCHENS_PER_ARM);
      expect(wrong).toEqual([]);
    },
  );

  it.each([
    ["a link", KITCHEN_LINK],
    ["no link", NO_LINK],
  ])(
    "writes a callback with %s handed in as its customer lines and its one line, no link and no unavailable line",
    (_label, link) => {
      const message = composeLeadNotice(
        noticeInput(callbackSubmission(), link),
      );

      expect(linesOf(message.text)).toEqual([
        ...customerLinesFor(endonymOf("ro")),
        "",
        notice.callbackLine,
      ]);
      expect(message.html).not.toContain(FIXTURE_KITCHEN_URL);
      expect(message.html).not.toContain(notice.kitchen.unavailable);
      expect(message.html).not.toContain(notice.summaryHeading);
      expect(message.html).not.toContain(notice.appendixHeading);
    },
  );
});

describe("a notice whose link is unavailable", () => {
  const message = composeLeadNotice(noticeInput(designSubmission(), NO_LINK));

  it("says so in the HTML part, with no button and no kitchen address", () => {
    const { document } = parseNotice(message.html ?? "");
    const hrefs = [...document.querySelectorAll("a")].map((anchor) =>
      anchor.getAttribute("href"),
    );

    expect(message.html).toContain(notice.kitchen.unavailable);
    expect(message.html).not.toContain(notice.kitchen.button);
    expect(hrefs.filter((href) => href?.includes("/s/"))).toEqual([]);
  });

  it.each([
    [
      "a link of the minted shape under attacker.example, not the configured origin",
      { kind: "link", url: "https://attacker.example/ro/s/Fixture0Tok1" },
      FIXTURE_PUBLIC_ORIGIN,
    ],
    [
      "a link while the attempt read no usable origin",
      KITCHEN_LINK,
      { status: "unavailable", variable: PUBLIC_ORIGIN_VARIABLE },
    ],
  ] as const)(
    "refuses %s, showing the unavailable sentence in both parts",
    (_label, kitchenLink, publicOrigin) => {
      const refused = composeLeadNotice({
        ...noticeInput(designSubmission(), kitchenLink),
        publicOrigin,
      });

      expect(linesOf(refused.text)[0]).toBe(notice.kitchen.unavailable);
      expect(refused.text).not.toContain("/ro/s/");
      expect(refused.html).toContain(notice.kitchen.unavailable);
      expect(refused.html).not.toContain("/ro/s/");
    },
  );
});

/** A group's count as the summary line writes it, read back by its digits: `{heading} — {count} {noun}`. */
const GROUP_COUNT = / — (\d+) \S+$/;

/** The summary's group lines in the text part: after the room line, up to the figure. */
function summaryGroupLinesOf(text: string): string[] {
  const lines = linesOf(text);
  const summaryStart = lines.indexOf("", 2) + 2;
  const figureAt = lines.findIndex(
    (line, index) =>
      index >= summaryStart && line.startsWith(notice.labels.price),
  );
  return lines.slice(summaryStart, figureAt);
}

function countOf(groupLine: string): number {
  return Number(GROUP_COUNT.exec(groupLine)?.[1] ?? Number.NaN);
}

describe("the compact summary", () => {
  it.each(VARIED_ARMS.map((arm) => [arm.name, arm] as const))(
    "counts, over its groups, every body the stored design holds, and shows the same lines in the HTML, for the %s arm",
    (_name, arm) => {
      const kitchens = sendableKitchensOf(arm).slice(0, KITCHENS_PER_ARM);
      const wrong = kitchens.filter(({ design, snapshot }) => {
        const message = composeLeadNotice(
          noticeInput(designSubmission({ snapshot })),
        );
        const groupLines = summaryGroupLinesOf(message.text);
        const counts = groupLines.map(countOf);
        const paragraphs = [
          ...parseNotice(message.html ?? "").document.querySelectorAll("p"),
        ].map(ownTextOf);
        return (
          groupLines.length === 0 ||
          counts.some((count) => !(count >= 1)) ||
          counts.reduce((total, count) => total + count, 0) !==
            design.placements.length ||
          groupLines.some((line) => !paragraphs.includes(line))
        );
      });

      expect(kitchens.length).toBeGreaterThanOrEqual(MIN_KITCHENS_PER_ARM);
      expect(wrong).toEqual([]);
    },
  );

  it("has kitchens with groups of more than one body, so a count of one everywhere would fail", () => {
    const counts = sendableKitchensOf(VARIED_L_ARM)
      .slice(0, KITCHENS_PER_ARM)
      .flatMap(({ snapshot }) =>
        summaryGroupLinesOf(
          composeLeadNotice(noticeInput(designSubmission({ snapshot }))).text,
        ).map(countOf),
      );

    expect(new Set(counts).size).toBeGreaterThan(3);
  });
});

/**
 * Measured on this fixture, all 261 bodies dressed: the HTML would be 271 340 bytes (270 398 UTF-16 units, past the
 * sender's 262 144), and the text part is 18 740 bytes. Packed in the fixture's order, the HTML first passes the
 * budget at 81 dressed bodies (90 546 bytes), or 112 plain ones.
 */
const DENSEST_PLACEMENTS = 261;

/** One dressed body adds about 1 040 bytes to the HTML; a kept notice within this of the budget is at its edge. */
const LARGEST_DRESSED_ROW_BYTES = 1_500;

describe("a notice whose HTML is past its budget", () => {
  const design = dressed(densestUKitchen());
  const snapshot = snapshotOf(design);
  const message =
    snapshot === undefined
      ? undefined
      : composeLeadNotice(noticeInput(designSubmission({ snapshot })));

  it("is made from a kitchen the domain stores: the densest U, every body dressed", () => {
    expect(design.placements).toHaveLength(DENSEST_PLACEMENTS);
    expect(snapshot).toBeDefined();
  });

  it("is sent as its text part alone, which a sender takes", () => {
    expect(message).toBeDefined();
    expect(message?.html).toBeUndefined();
    expect(message !== undefined && isSendableMailMessage(message)).toBe(true);
  });

  it("still opens with the kitchen link's line, a blank line and the customer's lines, and counts every body", () => {
    const text = message?.text ?? "";

    expect(linesOf(text).slice(0, 9)).toEqual([
      notice.line(notice.kitchen.linkLabel, FIXTURE_KITCHEN_URL),
      "",
      ...customerLinesFor(endonymOf("ro")),
      "",
    ]);
    expect(
      summaryGroupLinesOf(text)
        .map(countOf)
        .reduce((total, count) => total + count, 0),
    ).toBe(DENSEST_PLACEMENTS);
  });

  it("keeps the HTML up to the budget, so a notice is not stripped while it would still fit", () => {
    const sizes = Array.from(
      { length: DENSEST_PLACEMENTS },
      (_unused, index) => {
        const prefix = {
          ...design,
          placements: design.placements.slice(0, index + 1),
        };
        const prefixSnapshot = snapshotOf(prefix);
        if (prefixSnapshot === undefined) return Number.NaN;
        const { html } = composeLeadNotice(
          noticeInput(designSubmission({ snapshot: prefixSnapshot })),
        );
        return html === undefined
          ? undefined
          : new TextEncoder().encode(html).byteLength;
      },
    );
    const keptCount = sizes.filter((size) => size !== undefined).length;
    const largestKept = sizes[keptCount - 1] ?? Number.NaN;

    expect(sizes.slice(keptCount).every((size) => size === undefined)).toBe(
      true,
    );
    expect(largestKept).toBeLessThanOrEqual(NOTICE_HTML_BUDGET_BYTES);
    expect(largestKept).toBeGreaterThan(
      NOTICE_HTML_BUDGET_BYTES - LARGEST_DRESSED_ROW_BYTES,
    );
  });

  it("keeps its budget under Gmail's clip and far under the sender's own cap, both in bytes", () => {
    expect(NOTICE_HTML_BUDGET_BYTES).toBe(90_000);
    expect(NOTICE_HTML_BUDGET_BYTES).toBeLessThan(HTML_MAX_LENGTH);
  });
});

describe("the contact buttons", () => {
  function hrefsFor(channel: "phone" | "whatsapp" | "email"): string[] {
    const contact =
      channel === "email"
        ? {
            ...fixtureContact({ channel, email: "a@example.md" }),
            email: "ion?cc=x@example.md",
          }
        : fixtureContact({ channel });
    const { document } = parseNotice(
      composeLeadNotice(noticeInput(designSubmission({ contact }), NO_LINK))
        .html ?? "",
    );
    return [...document.querySelectorAll("a")].map(
      (anchor) => anchor.getAttribute("href") ?? "",
    );
  }

  it.each([
    ["phone", ["tel:+37369000123"]],
    ["whatsapp", ["tel:+37369000123", "https://wa.me/37369000123"]],
    ["email", ["tel:+37369000123", "mailto:ion%3Fcc%3Dx@example.md"]],
  ] as const)(
    "offers a call always, and the %s channel's own button",
    (channel, expected) => {
      expect(hrefsFor(channel)).toEqual(expected);
    },
  );

  it("offers no call and no chat for a number that is not in E.164, and still prints it as text", () => {
    const contact = { ...fixtureContact(), phoneNormalForm: "069 000 123" };
    const message = composeLeadNotice(
      noticeInput(designSubmission({ contact }), NO_LINK),
    );

    expect(
      parseNotice(message.html ?? "").document.querySelectorAll("a"),
    ).toHaveLength(0);
    expect(message.html).toContain("069 000 123");
  });
});

describe("the footer and the client's language", () => {
  it("prints the reference and the design's revision, each behind its label, in the HTML part only", () => {
    const message = composeLeadNotice(noticeInput(designSubmission()));
    const paragraphs = [
      ...parseNotice(message.html ?? "").document.querySelectorAll("p"),
    ].map(ownTextOf);

    expect(paragraphs).toContain(
      notice.line(notice.labels.reference, FIXTURE_REFERENCE),
    );
    expect(paragraphs).toContain(
      notice.line(notice.revisionLabel, FIXTURE_REVISION),
    );
    expect(message.text).not.toContain(notice.revisionLabel);
  });

  it("refuses a revision that would break a line, by its name", () => {
    const submission = designSubmission({
      target: { kind: "design", design: { id: "d", revision: "7\nBcc: x" } },
    });

    expect(() => composeLeadNotice(noticeInput(submission))).toThrow(
      new NoticeLineError("revision"),
    );
  });

  it.each(["ro", "ru"] as const)(
    "names the client's %s language in its own name, in both parts",
    (locale) => {
      const message = composeLeadNotice(
        noticeInput(designSubmission({ locale })),
      );
      const spans = [
        ...parseNotice(message.html ?? "").document.querySelectorAll("span"),
      ].map(ownTextOf);

      expect(message.text).toContain(
        notice.line(notice.labels.locale, endonymOf(locale)),
      );
      expect(spans).toContain(endonymOf(locale));
    },
  );

  it("shows a language the site does not serve as it was stored", () => {
    const message = composeLeadNotice(
      noticeInput(designSubmission({ locale: "de" })),
    );

    expect(message.text).toContain(notice.line(notice.labels.locale, "de"));
  });
});

describe("composing a notice", () => {
  it("writes nothing to the console, for every fixture", () => {
    const spies = spyOnEveryConsoleMethod();

    for (const { input } of LEAD_NOTICE_FIXTURES) composeLeadNotice(input);

    expect(consoleCallsOf(spies)).toEqual([]);
  });

  it("gives the same bytes for the same input", () => {
    const input = noticeInput(designSubmission());

    expect(composeLeadNotice(input)).toStrictEqual(composeLeadNotice(input));
  });

  it("takes the sent-kitchen link's own outcome as its link, whichever it is", () => {
    const outcomes: readonly SentKitchenLink[] = [
      { kind: "link", url: FIXTURE_KITCHEN_URL },
      { kind: "unavailable", cause: "deadline" },
    ];
    const linkOf = (outcome: SentKitchenLink): NoticeKitchenLink => outcome;

    const [linked, unlinked] = outcomes.map((outcome) =>
      composeLeadNotice(noticeInput(designSubmission(), linkOf(outcome))),
    );

    expect(linked?.html).toContain(FIXTURE_KITCHEN_URL);
    expect(unlinked?.html).toContain(notice.kitchen.unavailable);
    expect(unlinked?.html).not.toContain("deadline");
  });
});
