import {
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  canonicalSerializeDesign,
  priceDesign,
  projectDesignForDisplay,
  SAMPLE_PRICE_BOOK,
  SAMPLE_PRICE_BOOK_VERSION,
  snapshotSubmission,
  validateContactFields,
  type ContactFieldsInput,
  type ContactFields,
  type Design,
  type Finish,
  type Handle,
  type SubmissionSnapshot,
} from "@lemnaria/configurator-domain";
import type { ContactSubmissionToRecord } from "@lemnaria/persistence";
import { inspect } from "node:util";
import ts from "typescript";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { endonymOf } from "@/i18n/locale-endonyms";
import {
  composeLeadNotice,
  LEAD_NOTIFICATION_KEY_PREFIX,
  NoticeKitchenError,
  NoticeLineError,
  NOTICE_LOCALE,
} from "@/lib/server/mail/lead-notification";
import {
  isSendableMailMessage,
  LINE_BREAKING_CHARACTER,
} from "@/lib/server/mail/mail-sender";
import { describeStartingPrice } from "@/price/starting-price";
import { describeReview, rowDetailOf } from "@/review/review-model";

import { ro } from "../../../support/romanian-content";
import {
  VARIED_ARMS,
  VARIED_L_ARM,
  variedKitchensOf,
  type VariedArm,
} from "../../../support/varied-kitchens";
import { FIXTURE_PUBLIC_ORIGIN } from "./lead-notice-fixtures";
import {
  forbidFetch,
  PROCESS_ENV_OR_BUILD_MODE,
  readMailModuleSource,
  releaseFetch,
} from "./mail-test-support";
import { MEASURED_DEEPENING_ROWS } from "../../../support/deepening-rows";

const ARMS_BY_NAME = VARIED_ARMS.map((arm) => [arm.name, arm] as const);

const REFERENCE = "LM-ABCD2345";
const CLIENT_REQUEST_ID = "req_0123456789abcdef";

const NAME_MARKER = "Nume Marker Exemplu";
const PHONE_AS_TYPED = "069 000 111";
const LOCALITY_MARKER = "Localitate Marker";
const EMAIL_MARKER = "marker.client@example.com";

function validContact(overrides: ContactFieldsInput = {}): ContactFields {
  const result = validateContactFields({
    name: NAME_MARKER,
    phone: PHONE_AS_TYPED,
    locality: LOCALITY_MARKER,
    channel: "phone",
    consent: true,
    consentTextVersion: "placeholder",
    ...overrides,
  });
  if (!result.ok) throw new Error("the fixture contact is not valid");
  return result.contact;
}

function snapshotOfDesign(design: Design): SubmissionSnapshot {
  const result = snapshotSubmission({
    deepeningRows: MEASURED_DEEPENING_ROWS,
    design,
    catalog: buildKitchenLBodyCatalog(cabinetDepthMmOf(design)),
    book: SAMPLE_PRICE_BOOK,
    pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
  });
  if (!result.ok) throw new Error("the fixture kitchen cannot be submitted");
  return result.snapshot;
}

function sendableDesigns(arm: VariedArm, limit: number): readonly Design[] {
  return variedKitchensOf(arm)
    .map(({ design }) => design)
    .filter(
      (design) =>
        snapshotSubmission({
          deepeningRows: MEASURED_DEEPENING_ROWS,
          design,
          catalog: buildKitchenLBodyCatalog(cabinetDepthMmOf(design)),
          book: SAMPLE_PRICE_BOOK,
          pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
        }).ok,
    )
    .slice(0, limit);
}

const DESIGN = requireFirst(sendableDesigns(VARIED_L_ARM, 1));
const SNAPSHOT = snapshotOfDesign(DESIGN);

const KITCHENS_PER_ARM = 25;
const MIN_KITCHENS_PER_ARM = 20;

/** What each material lets a body wear, so a dressed kitchen is one the review can draw. */
const OWN_FINISH_BY_MATERIAL: Readonly<Record<string, Finish>> = {
  "material.melamine": { kind: "palette-entry", entryId: "pal.antracit" },
  "material.painted-mdf": { kind: "free-colour", value: "#b8c4a1" },
  "material.veneer": { kind: "palette-entry", entryId: "veneer.nuc" },
};
const OWN_HANDLES: readonly Handle[] = ["steel", "black", "push"];

/** The kitchen with its bodies dressed in turn: nothing, a finish of their own, a handle, both. */
function dressed(design: Design, offset: number): Design {
  const finish = OWN_FINISH_BY_MATERIAL[design.settings?.materialTierId ?? ""];
  return {
    ...design,
    placements: design.placements.map((placement, index) => {
      const dress = (index + offset) % 4;
      const hasFinish = (dress === 1 || dress === 3) && finish !== undefined;
      const hasHandle = dress === 2 || dress === 3;
      return {
        ...placement,
        body: {
          ...placement.body,
          ...(hasFinish ? { finish } : {}),
          ...(hasHandle
            ? { handle: OWN_HANDLES[(index + offset) % OWN_HANDLES.length] }
            : {}),
        },
      };
    }),
  };
}

function dressedKitchens(arm: VariedArm, limit: number): readonly Design[] {
  return sendableDesigns(arm, limit).map(dressed);
}

function entriesOf(design: Design) {
  return projectDesignForDisplay(
    design,
    buildKitchenLBodyCatalog(cabinetDepthMmOf(design)),
  ).flatMap((group) => group.entries);
}

function requireFirst<T>(items: readonly T[]): T {
  const [first] = items;
  if (first === undefined) throw new Error("the fixture has no kitchen");
  return first;
}

function designRequest(
  overrides: Partial<ContactSubmissionToRecord> = {},
): ContactSubmissionToRecord {
  return {
    clientRequestId: CLIENT_REQUEST_ID,
    payloadDigest: "d".repeat(64),
    contact: validContact(),
    locale: "ru",
    target: { kind: "design", design: { id: "design-1", revision: "3" } },
    snapshot: SNAPSHOT,
    ...overrides,
  };
}

function callbackRequest(
  overrides: Partial<ContactSubmissionToRecord> = {},
): ContactSubmissionToRecord {
  return designRequest({
    target: { kind: "intent", intent: "callback" },
    snapshot: undefined,
    ...overrides,
  });
}

const KITCHEN_URL = "https://example.invalid/ro/s/Lead0Notice1";

function noticeOf(submission: ContactSubmissionToRecord) {
  return composeLeadNotice({
    reference: REFERENCE,
    submission,
    content: ro,
    kitchenLink: { kind: "link", url: KITCHEN_URL },
    publicOrigin: FIXTURE_PUBLIC_ORIGIN,
  });
}

/** A design's text part opens with the kitchen link's line and a blank line; a callback's has neither. */
const CUSTOMER_LINES_START = 2;

/** The design's summary and appendix: everything after the customer's lines. */
function kitchenLinesOf(lines: readonly string[]): readonly string[] {
  return lines.slice(lines.indexOf("", CUSTOMER_LINES_START) + 1);
}

function bodyLinesOf(submission: ContactSubmissionToRecord): string[] {
  return noticeOf(submission).text.split("\n");
}

function thrownBy(action: () => unknown): unknown {
  try {
    action();
  } catch (error) {
    return error;
  }
  throw new Error("expected the action to throw");
}

/** The wording of the notice is the copy lock's. These tests assert which leaf stands at which line, so the expected
 *  lines are composed from the resolved leaves; the sentences themselves are not restated. */
const notice = ro.leadNotice;

function lineOf(label: string, value: string): string {
  return notice.line(label, value);
}

const CALLBACK_NOTICE_LINES = [
  lineOf(notice.labels.reference, REFERENCE),
  lineOf(notice.labels.locale, endonymOf("ru")),
  lineOf(notice.labels.name, NAME_MARKER),
  lineOf(notice.labels.phone, "+37369000111"),
  lineOf(notice.labels.locality, LOCALITY_MARKER),
  lineOf(notice.labels.channel, notice.channels.phone),
];

beforeEach(forbidFetch);
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  releaseFetch();
});

describe("the notice's key and subject", () => {
  it("keys the message by the purpose and the client request id", () => {
    expect(noticeOf(designRequest()).key).toBe(
      `${LEAD_NOTIFICATION_KEY_PREFIX}${CLIENT_REQUEST_ID}`,
    );
    expect(LEAD_NOTIFICATION_KEY_PREFIX).toBe("lead-notification/");
  });

  it("is a fixed template and the reference", () => {
    expect(noticeOf(designRequest()).subject).toBe(notice.subject(REFERENCE));
  });

  it("holds nothing the customer wrote, in the subject or the key", () => {
    const submission = designRequest({
      contact: validContact({ channel: "email", email: EMAIL_MARKER }),
    });
    const { subject, key } = noticeOf(submission);

    for (const marker of [
      NAME_MARKER,
      "069",
      "37369",
      LOCALITY_MARKER,
      EMAIL_MARKER,
    ]) {
      expect(subject).not.toContain(marker);
      expect(key).not.toContain(marker);
    }
  });

  it("passes the port's predicate for a design and for a callback", () => {
    expect(isSendableMailMessage(noticeOf(designRequest()))).toBe(true);
    expect(isSendableMailMessage(noticeOf(callbackRequest()))).toBe(true);
  });

  it.each(ARMS_BY_NAME)(
    "passes the port's predicate for every sendable kitchen of the %s arm",
    (_name, arm) => {
      const kitchens = sendableDesigns(arm, 40);
      const failures = kitchens.filter(
        (design) =>
          !isSendableMailMessage(
            noticeOf(designRequest({ snapshot: snapshotOfDesign(design) })),
          ),
      );

      expect(kitchens.length).toBeGreaterThanOrEqual(MIN_KITCHENS_PER_ARM);
      expect(failures).toEqual([]);
    },
  );

  it("is written in the owner-owed language, one constant", () => {
    expect(NOTICE_LOCALE).toBe("ro");
  });
});

describe("the notice's customer lines", () => {
  it("puts each value on a line of its own behind its label, the phone in its normal form", () => {
    const lines = bodyLinesOf(designRequest());

    expect(lines.slice(CUSTOMER_LINES_START, CUSTOMER_LINES_START + 6)).toEqual(
      CALLBACK_NOTICE_LINES,
    );
    expect(lines.join("\n")).not.toContain(PHONE_AS_TYPED);
  });

  it("prints a dash for an empty locality", () => {
    const lines = bodyLinesOf(
      designRequest({ contact: validContact({ locality: "" }) }),
    );

    expect(lines).toContain(lineOf(notice.labels.locality, notice.emptyValue));
  });

  it("prints the e-mail line only when the channel is e-mail, and the channel in the notice's own word", () => {
    const withEmail = bodyLinesOf(
      designRequest({
        contact: validContact({ channel: "email", email: EMAIL_MARKER }),
      }),
    );
    const without = bodyLinesOf(designRequest());

    expect(withEmail).toContain(lineOf(notice.labels.email, EMAIL_MARKER));
    expect(withEmail).toContain(
      lineOf(notice.labels.channel, notice.channels.email),
    );
    expect(without.join("\n")).not.toContain(notice.labels.email);
  });

  it.each([
    ["a formula", '=HYPERLINK("https://example.com/x","Click")'],
    ["a link", "https://example.com/phishing"],
    ["markup", '<b>bold</b> <a href="https://example.com">x</a>'],
    ["a spreadsheet command", "+cmd|' /C calc'!A0"],
  ])(
    "keeps a name that is %s as inert text on its own line",
    (_label, name) => {
      const contact = { ...validContact(), name };

      const lines = bodyLinesOf(designRequest({ contact }));

      expect(lines).toContain(lineOf(notice.labels.name, name));
      expect(noticeOf(designRequest({ contact })).text).not.toContain("&lt;");
    },
  );
});

describe("a channel or a request id the notice has no usable word for", () => {
  const LOG_METHODS = [
    "debug",
    "error",
    "info",
    "log",
    "trace",
    "warn",
  ] as const;

  it.each([
    "fax",
    "",
    "constructor",
    "__proto__",
    "toString",
    "hasOwnProperty",
  ])(
    "throws the named error for the channel %j, with no value and no log line",
    (channel) => {
      const spies = LOG_METHODS.map((method) =>
        vi.spyOn(console, method).mockImplementation(() => undefined),
      );
      const submission = designRequest({
        contact: { ...validContact(), channel: channel as never },
      });

      const thrown = thrownBy(() => noticeOf(submission));

      expect(thrown).toEqual(new NoticeLineError("channel"));
      expect(spies.every((spy) => spy.mock.calls.length === 0)).toBe(true);
    },
  );

  it.each([
    ["empty text", ""],
    ["a number", 42],
    ["nothing", undefined],
    ["null", null],
  ])(
    "throws the named error for a client request id that is %s",
    (_label, id) => {
      const submission = designRequest({ clientRequestId: id as never });

      expect(thrownBy(() => noticeOf(submission))).toEqual(
        new NoticeLineError("key"),
      );
    },
  );

  it("keys two different ids differently, with no shape asked of either", () => {
    const one = noticeOf(designRequest({ clientRequestId: "a" }));
    const other = noticeOf(designRequest({ clientRequestId: "b" }));

    expect(one.key).not.toBe(other.key);
  });
});

describe("building a notice writes no log line", () => {
  it.each(["debug", "error", "info", "log", "trace", "warn"] as const)(
    "never calls console.%s, for a design, a callback or an e-mail channel",
    (method) => {
      const spy = vi.spyOn(console, method).mockImplementation(() => undefined);

      noticeOf(designRequest());
      noticeOf(callbackRequest());
      noticeOf(
        designRequest({
          contact: validContact({ channel: "email", email: EMAIL_MARKER }),
        }),
      );

      expect(spy).not.toHaveBeenCalled();
    },
  );
});

describe("a name holding what a message formatter treats as syntax", () => {
  const SYNTAX_NAMES = [
    "O'Brien",
    "{name}",
    "{count, plural, one {#} other {#}}",
    "a < b > c",
    "'{quoted}' ''double'' <tag attr='x'>",
  ];

  it.each(SYNTAX_NAMES)(
    "prints %j exactly as stored on its own line",
    (name) => {
      const contact = { ...validContact(), name };

      const lines = bodyLinesOf(designRequest({ contact }));

      expect(lines).toContain(`${notice.labels.name}: ${name}`);
    },
  );

  it("prints such a name in the locality and in the e-mail line as stored too", () => {
    const name = "{a} 'b' <c>";
    const contact = {
      ...validContact({ channel: "email", email: "a@example.com" }),
      locality: name,
      email: name,
    };

    const lines = bodyLinesOf(designRequest({ contact }));

    expect(lines).toContain(`${notice.labels.locality}: ${name}`);
    expect(lines).toContain(`${notice.labels.email}: ${name}`);
  });
});

describe("a line that would hold a control character or a line separator", () => {
  const BREAKERS: readonly [string, string][] = [
    ["a carriage return", "\r"],
    ["a line feed", "\n"],
    ["a tab", "\t"],
    ["a NUL", "\u0000"],
    ["a line separator", "\u2028"],
    ["a paragraph separator", "\u2029"],
  ];
  const HOSTILE_VALUE_MARKER = "HOSTILE-MARKER-31";

  /** An e-mail-channel contact, so every field has a line, with one field set to a value the domain refuses. */
  function submissionWith(
    field: string,
    value: string,
  ): ContactSubmissionToRecord {
    const contact = {
      ...validContact({ channel: "email", email: "a@example.com" }),
      [field]: value,
    } as ContactFields;
    return designRequest({ contact });
  }

  const CUSTOMER_FIELDS = ["name", "phoneNormalForm", "locality", "email"];

  describe.each(CUSTOMER_FIELDS)("in the contact's %s", (field) => {
    it.each(BREAKERS)(
      "throws the named error for %s and names no value",
      (_label, breaker) => {
        const submission = submissionWith(
          field,
          `${HOSTILE_VALUE_MARKER}${breaker}x`,
        );

        const thrown = thrownBy(() => noticeOf(submission));

        expect(thrown).toBeInstanceOf(NoticeLineError);
        expect(
          inspect(thrown, { depth: null, showHidden: true }),
        ).not.toContain(HOSTILE_VALUE_MARKER);
      },
    );
  });

  it.each(BREAKERS)("throws for %s in the locale", (_label, breaker) => {
    expect(() => noticeOf(designRequest({ locale: `ro${breaker}` }))).toThrow(
      NoticeLineError,
    );
  });

  it.each(BREAKERS)(
    "throws for %s in the reference, which is also in the subject",
    (_label, breaker) => {
      expect(() =>
        composeLeadNotice({
          reference: `LM-AB${breaker}CD`,
          submission: designRequest(),
          content: ro,
          kitchenLink: { kind: "unavailable" },
          publicOrigin: FIXTURE_PUBLIC_ORIGIN,
        }),
      ).toThrow(NoticeLineError);
    },
  );

  it("names the line and not its value", () => {
    const submission = submissionWith("name", `${HOSTILE_VALUE_MARKER}\n`);

    expect(() => noticeOf(submission)).toThrow(new NoticeLineError("name"));
  });

  it("throws for a control character in the kitchen's lines, whose content is not the customer's", () => {
    const content = {
      ...ro,
      leadNotice: {
        ...ro.leadNotice,
        labels: { ...ro.leadNotice.labels, room: "Camera\n" },
      },
    };

    expect(() =>
      composeLeadNotice({
        reference: REFERENCE,
        submission: designRequest(),
        content,
        kitchenLink: { kind: "unavailable" },
        publicOrigin: FIXTURE_PUBLIC_ORIGIN,
      }),
    ).toThrow(NoticeLineError);
  });
});

describe("the notice's kitchen lines", () => {
  function expectedKitchenLines(design: Design): string[] {
    const catalog = buildKitchenLBodyCatalog(cabinetDepthMmOf(design));
    const review = describeReview({
      content: ro,
      design,
      pricing: priceDesign({
        deepeningRows: MEASURED_DEEPENING_ROWS,
        design,
        catalog,
        book: SAMPLE_PRICE_BOOK,
        pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
        selections: design.settings,
      }),
      groups: projectDesignForDisplay(design, catalog),
    });
    if (review.kind !== "available")
      throw new Error("the fixture is unavailable");
    return [
      lineOf(notice.labels.room, review.roomLine),
      ...review.groups.map((group) =>
        notice.groupCount(group.heading, group.rows.length),
      ),
      lineOf(
        notice.labels.price,
        notice.figure(review.figure.label, review.figure.amountText),
      ),
      review.disclaimer.rounding,
      review.disclaimer.notice,
      "",
      notice.appendixHeading,
      ...review.groups.flatMap((group) => [
        group.heading,
        ...group.rows.flatMap((row) => [
          lineOf(row.label, row.amountText),
          ...rowDetailOf(review.rowDetails, row.key).facts.map(
            (fact) => `  ${fact}`,
          ),
        ]),
      ]),
      ...review.wholeKitchenRows.map((row) =>
        lineOf(row.label, row.amountText),
      ),
    ];
  }

  it.each(ARMS_BY_NAME)(
    "shows the rows, facts, figure and disclaimer the review shows for the same design, in the %s arm",
    (_name, arm) => {
      const kitchens = [
        ...sendableDesigns(arm, KITCHENS_PER_ARM),
        ...dressedKitchens(arm, KITCHENS_PER_ARM),
      ];
      const mismatches = kitchens.filter((design) => {
        const kitchen = kitchenLinesOf(
          bodyLinesOf(designRequest({ snapshot: snapshotOfDesign(design) })),
        );
        return (
          JSON.stringify(kitchen) !==
          JSON.stringify(expectedKitchenLines(design))
        );
      });

      expect(kitchens.length).toBeGreaterThanOrEqual(2 * MIN_KITCHENS_PER_ARM);
      expect(mismatches).toEqual([]);
    },
  );

  it.each(ARMS_BY_NAME)(
    "has kitchens with a body's own finish and with a handle to compare, in the %s arm",
    (_name, arm) => {
      const entries = dressedKitchens(arm, KITCHENS_PER_ARM).map(entriesOf);

      expect(
        entries.filter((kitchen) =>
          kitchen.some((entry) => entry.finish !== undefined),
        ).length,
      ).toBeGreaterThanOrEqual(MIN_KITCHENS_PER_ARM);
      expect(
        entries.filter((kitchen) =>
          kitchen.some((entry) => entry.handle !== undefined),
        ).length,
      ).toBeGreaterThanOrEqual(MIN_KITCHENS_PER_ARM);
    },
  );

  it.each(ARMS_BY_NAME)(
    "prints the word of a handle a body chose and can take, from the body's own member, under its row in the %s arm",
    (_name, arm) => {
      const missing = dressedKitchens(arm, KITCHENS_PER_ARM).filter(
        (design) => {
          const printed = bodyLinesOf(
            designRequest({ snapshot: snapshotOfDesign(design) }),
          );
          const catalog = buildKitchenLBodyCatalog(cabinetDepthMmOf(design));
          return entriesOf(design).some(
            (entry) =>
              entry.handle !== undefined &&
              catalog.get(entry.buildId)?.canHandle === true &&
              !printed.includes(`  ${ro.panel.handleLabels[entry.handle]}`),
          );
        },
      );

      expect(missing).toEqual([]);
    },
  );

  it("sets each fact in by two spaces, with no label, under the row it belongs to", () => {
    const [design] = dressedKitchens(VARIED_L_ARM, 1);
    if (design === undefined) throw new Error("the fixture has no kitchen");

    const lines = bodyLinesOf(
      designRequest({ snapshot: snapshotOfDesign(design) }),
    );
    const facts = lines.filter((line) => line.startsWith("  "));

    expect(facts.length).toBeGreaterThan(0);
    expect(facts.every((fact) => !fact.startsWith("   "))).toBe(true);
    expect(facts.some((fact) => fact.includes(":"))).toBe(false);
  });

  it("separates the customer's lines from the kitchen's with one blank line", () => {
    const lines = bodyLinesOf(designRequest());

    expect(lines[CUSTOMER_LINES_START + 6]).toBe("");
    expect(
      lines[CUSTOMER_LINES_START + 7]?.startsWith(
        notice.line(notice.labels.room, ""),
      ),
    ).toBe(true);
  });

  it("prints the figure of the stored total, so a snapshot whose total is changed prints the changed figure", () => {
    const changedTotalMinor = SNAPSHOT.priced.totalMinor * 2;
    const changed: SubmissionSnapshot = {
      ...SNAPSHOT,
      priced: { ...SNAPSHOT.priced, totalMinor: changedTotalMinor },
    };
    const figure = (totalMinor: number) =>
      describeStartingPrice({ totalMinor, copy: ro.price });
    const figureLineOf = (totalMinor: number) =>
      lineOf(
        notice.labels.price,
        notice.figure(figure(totalMinor).label, figure(totalMinor).amountText),
      );

    const original = bodyLinesOf(designRequest());
    const printed = bodyLinesOf(designRequest({ snapshot: changed }));

    expect(printed).toContain(figureLineOf(changedTotalMinor));
    expect(printed).not.toContain(figureLineOf(SNAPSHOT.priced.totalMinor));
    expect(original).toContain(figureLineOf(SNAPSHOT.priced.totalMinor));
    expect(figureLineOf(changedTotalMinor)).not.toBe(
      figureLineOf(SNAPSHOT.priced.totalMinor),
    );
  });

  it("ends the summary with the figure and the review's two disclaimer sentences and says nothing more about the price", () => {
    const lines = bodyLinesOf(designRequest());
    const appendixAt = lines.indexOf(notice.appendixHeading);

    expect(lines[appendixAt - 1]).toBe("");
    expect(lines.slice(appendixAt - 4, appendixAt - 1)).toEqual([
      expect.stringMatching(
        new RegExp(
          `^${notice.line(notice.labels.price, ro.price.startingPrefix)} \\d[\\d ]* MDL$`,
        ),
      ),
      ro.review.roundedUpNote,
      ro.priceBreakdown.note,
    ]);
  });

  it("describes a callback with its one line and no kitchen", () => {
    const lines = bodyLinesOf(callbackRequest());

    expect(lines.slice(6)).toEqual(["", notice.callbackLine]);
  });

  it("holds the whole callback notice in the fixed shape", () => {
    expect(noticeOf(callbackRequest()).text).toBe(
      [...CALLBACK_NOTICE_LINES, "", notice.callbackLine].join("\n"),
    );
  });
});

describe("a request whose kitchen the notice cannot describe", () => {
  function expectKitchenFailure(
    submission: ContactSubmissionToRecord,
    failure: string,
  ): void {
    const thrown = thrownBy(() => noticeOf(submission));
    expect(thrown).toBeInstanceOf(NoticeKitchenError);
    expect((thrown as NoticeKitchenError).failure).toBe(failure);
    expect((thrown as Error).cause).toBeUndefined();
  }

  it("throws a named error, holding no value, for a design with no snapshot", () => {
    expectKitchenFailure(
      designRequest({ snapshot: undefined }),
      "snapshot-missing",
    );
  });

  it("throws a named error, with none of the text, for a document that is not a design", () => {
    const marker = "DOCUMENT-MARKER-77";
    const submission = designRequest({
      snapshot: { ...SNAPSHOT, document: `{"id": "${marker}"` },
    });

    expectKitchenFailure(submission, "document-unreadable");
    expect(
      inspect(
        thrownBy(() => noticeOf(submission)),
        {
          depth: null,
          showHidden: true,
        },
      ),
    ).not.toContain(marker);
  });

  it("throws the one value-free error when a placement id holding a marker and a line break splits the inputs", () => {
    const marker = "PLACEMENT-ID-MARKER-91";
    const [first, ...rest] = DESIGN.placements;
    if (first === undefined) throw new Error("the fixture has no body");
    const renamed: Design = {
      ...DESIGN,
      placements: [{ ...first, id: `${marker}\nX-Injected: 1` }, ...rest],
    };
    const submission = designRequest({
      snapshot: {
        document: canonicalSerializeDesign(renamed),
        priced: SNAPSHOT.priced,
      },
    });

    expectKitchenFailure(submission, "review-not-sendable");
    expect(
      inspect(
        thrownBy(() => noticeOf(submission)),
        {
          depth: null,
          showHidden: true,
        },
      ),
    ).not.toContain(marker);
  });

  it("throws the same value-free error when the review cannot be made at all", () => {
    const spoiled = {
      ...SNAPSHOT,
      priced: { ...SNAPSHOT.priced, lines: undefined },
    } as unknown as SubmissionSnapshot;
    const submission = designRequest({ snapshot: spoiled });

    const thrown = thrownBy(() => noticeOf(submission));

    expect(thrown).toBeInstanceOf(NoticeKitchenError);
    expect((thrown as NoticeKitchenError).failure).toBe("review-not-sendable");
    expect((thrown as Error).cause).toBeUndefined();
  });

  it("throws the fixed error, keeping nothing, for a thrown value whose every trap throws", () => {
    const hostile = new Proxy(
      {},
      new Proxy(
        {},
        {
          get: () => () => {
            throw new Error("a trap of the thrown value ran");
          },
        },
      ),
    );
    const priced = Object.defineProperty({ ...SNAPSHOT.priced }, "lines", {
      enumerable: true,
      get: (): never => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error -- a thrown value that is no Error is the case
        throw hostile;
      },
    });
    const submission = designRequest({
      snapshot: { ...SNAPSHOT, priced },
    });

    const thrown = thrownBy(() => noticeOf(submission));

    expect(thrown).toBeInstanceOf(NoticeKitchenError);
    expect((thrown as NoticeKitchenError).failure).toBe("review-not-sendable");
    expect((thrown as Error).cause).toBeUndefined();
  });

  it("throws a named error for a kitchen the review does not allow", () => {
    const empty: Design = {
      ...DESIGN,
      placements: [],
      emptyColumns: [],
      columnExtents: [],
    };
    const pricing = priceDesign({
      deepeningRows: MEASURED_DEEPENING_ROWS,
      design: empty,
      catalog: buildKitchenLBodyCatalog(cabinetDepthMmOf(empty)),
      book: SAMPLE_PRICE_BOOK,
      pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
      selections: empty.settings,
    });
    if (!pricing.ok) throw new Error("the empty kitchen did not price");

    expectKitchenFailure(
      designRequest({
        snapshot: {
          document: canonicalSerializeDesign(empty),
          priced: pricing.priced,
        },
      }),
      "review-not-sendable",
    );
  });
});

describe("the line-break class", () => {
  it("reads source: is the port's own, so the notice passes the predicate on every line it writes", () => {
    const source = readMailModuleSource("lead-notification.ts");

    expect(LINE_BREAKING_CHARACTER.source).toBe("[\\p{Cc}\\p{Zl}\\p{Zp}]");
    expect(source).toMatch(/LINE_BREAKING_CHARACTER/);
    expect(source).not.toMatch(/\\p\{Cc\}|\\u2028|\\u2029/);
  });
});

/** A tag's opening, `<p` or `</td`, in any text literal; a type's angle brackets are not literals and are not read. */
const TAG_OPENING = /<\/?[A-Za-z!]/;

/** Every string and template piece the source spells out, read as syntax. */
function textLiteralsOf(source: string): string[] {
  const file = ts.createSourceFile(
    "module.ts",
    source,
    ts.ScriptTarget.Latest,
    true,
  );
  const literals: string[] = [];
  function visit(node: ts.Node): void {
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      literals.push(node.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  return literals;
}

function tagLiteralsOf(source: string): string[] {
  return textLiteralsOf(source).filter((text) => TAG_OPENING.test(text));
}

describe("the composer writes no markup", () => {
  it("reads source: lead-notification.ts spells no tag in any literal, so markup is made only in lead-notification-html.ts", () => {
    expect(tagLiteralsOf(readMailModuleSource("lead-notification.ts"))).toEqual(
      [],
    );
  });

  it("is a reading that finds a tag where one is written, and none in a type's brackets: the control", () => {
    expect(
      tagLiteralsOf(
        'const a: Array<string> = []; const b = `<p>${a.join("")}</p>`; const c = "</td>";',
      ),
    ).toEqual(["<p>", "</p>", "</td>"]);
    expect(
      tagLiteralsOf(
        "const a: Readonly<Record<string, number>> = {}; const b = 1 < 2;",
      ),
    ).toEqual([]);
  });

  it("finds the template's own tags in lead-notification-html.ts, so the reading is not blind to the real source", () => {
    expect(
      tagLiteralsOf(readMailModuleSource("lead-notification-html.ts")).length,
    ).toBeGreaterThan(0);
  });
});

describe("one request, one message, the same bytes", () => {
  it("gives equal messages for equal input", () => {
    expect(noticeOf(designRequest())).toEqual(noticeOf(designRequest()));
  });

  it("gives the same bytes with the clock and every random source made to throw, and at another time", () => {
    const first = noticeOf(designRequest());
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2031-01-01T00:00:00Z"));
    const refuse = () => {
      throw new Error("the notice read a clock or a random source");
    };
    vi.spyOn(Date, "now").mockImplementation(refuse);
    vi.spyOn(Math, "random").mockImplementation(refuse);
    vi.spyOn(globalThis.crypto, "randomUUID").mockImplementation(refuse);
    vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation(refuse);
    vi.spyOn(performance, "now").mockImplementation(refuse);

    expect(noticeOf(designRequest())).toEqual(first);
  });

  it("reads source: names no clock, random source, environment, build mode or request", () => {
    const source = readMailModuleSource("lead-notification.ts");

    expect(source).not.toMatch(PROCESS_ENV_OR_BUILD_MODE);
    expect(source).not.toMatch(
      /\bDate\b|Math\.random|\bcrypto\b|performance\.now|\bfetch\b/,
    );
    expect(source).not.toMatch(/create-mail-sender/);
  });
});
