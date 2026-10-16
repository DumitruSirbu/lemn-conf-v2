import {
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  DesignSchema,
  projectDesignForDisplay,
  type SubmissionSnapshot,
} from "@lemnaria/configurator-domain";
import { afterEach, describe, expect, it, vi } from "vitest";

import { endonymOf } from "@/i18n/locale-endonyms";
import type { SentKitchenLink } from "@/lib/server/contact/sent-kitchen-link";
import {
  buildLeadNotification,
  composeLeadNotice,
  NoticeLineError,
  type NoticeKitchenLink,
} from "@/lib/server/mail/lead-notification";
import {
  isSendableMailMessage,
  LINE_BREAKING_CHARACTER,
} from "@/lib/server/mail/mail-sender";
import { describeReview } from "@/review/review-model";

import { ro } from "../../../support/romanian-content";
import { VARIED_ARMS, VARIED_L_ARM } from "../../../support/varied-kitchens";
import {
  callbackSubmission,
  designSubmission,
  FIXTURE_KITCHEN_URL,
  FIXTURE_REFERENCE,
  FIXTURE_REVISION,
  fixtureContact,
  KITCHEN_LINK,
  LEAD_NOTICE_FIXTURES,
  NO_LINK,
  noticeInput,
  sendableKitchensOf,
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

  it("is what the notice without a link is: the route's builder hands the same message", () => {
    const input = noticeInput(designSubmission());

    expect(buildLeadNotification(input)).toEqual(
      composeLeadNotice({ ...input, kitchenLink: { kind: "unavailable" } }),
    );
  });
});

describe("the compact summary", () => {
  function groupsOf(snapshot: SubmissionSnapshot) {
    const design = DesignSchema.parse(JSON.parse(snapshot.document));
    const review = describeReview({
      content: ro,
      design,
      pricing: { ok: true, priced: snapshot.priced },
      groups: projectDesignForDisplay(
        design,
        buildKitchenLBodyCatalog(cabinetDepthMmOf(design)),
      ),
    });
    if (review.kind !== "available")
      throw new Error("the review is unavailable");
    return review.groups;
  }

  it.each(VARIED_ARMS.map((arm) => [arm.name, arm] as const))(
    "counts each group's bodies as the stored review's rows, in the text and in the HTML, for the %s arm",
    (_name, arm) => {
      const kitchens = sendableKitchensOf(arm).slice(0, KITCHENS_PER_ARM);
      const wrong = kitchens.filter(({ snapshot }) => {
        const message = composeLeadNotice(
          noticeInput(designSubmission({ snapshot })),
        );
        const expected = groupsOf(snapshot).map((group) =>
          notice.groupCount(group.heading, group.rows.length),
        );
        const lines = linesOf(message.text);
        const summaryStart = lines.indexOf("", 2) + 2;
        const paragraphs = [
          ...parseNotice(message.html ?? "").document.querySelectorAll("p"),
        ].map(ownTextOf);
        return (
          JSON.stringify(
            lines.slice(summaryStart, summaryStart + expected.length),
          ) !== JSON.stringify(expected) ||
          expected.some((line) => !paragraphs.includes(line))
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
        groupsOf(snapshot).map((group) => group.rows.length),
      );

    expect(new Set(counts).size).toBeGreaterThan(3);
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
