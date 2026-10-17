// The kitchen half of the shop's notice, against stored snapshots the domain's public function made.
// The snapshots were priced under another book than the live one, so a notice that prints the stored
// price and one that prices again answer differently and only the first is right. Bodies are also given
// a finish and a handle of their own, so the facts under a row are more than its width.
import {
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  canonicalSerializeDesign,
  DesignSchema,
  priceDesign,
  projectDesignForDisplay,
  SAMPLE_PRICE_BOOK,
  SAMPLE_PRICE_BOOK_VERSION,
  type Design,
  type Finish,
  type Handle,
  type PricedDesign,
  type SubmissionSnapshot,
} from "@lemnaria/configurator-domain";
import type { ContactSubmissionToRecord } from "@lemnaria/persistence";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { NoticeKitchenError } from "@/lib/server/mail/lead-notification";
import { isSendableMailMessage } from "@/lib/server/mail/mail-sender";
import { describeReview, rowDetailOf } from "@/review/review-model";

import {
  customerSuppliedIds,
  keepingOnly,
  pastTheWall,
} from "../../../support/review-edits";
import { ro } from "../../../support/romanian-content";
import {
  VARIED_ARMS,
  variedKitchensOf,
  type VariedArm,
} from "../../../support/varied-kitchens";
import { forbidFetch, releaseFetch } from "./mail-test-support";
import { everyReadingOf } from "./qa-8j-support";
import {
  callbackRequest,
  designRequest,
  noticeOf,
  SAMPLE_BOOK,
  snapshotUnder,
  thrownBy,
  type SnapshotBook,
} from "./qa-8j-notice-support";

const notice = ro.leadNotice;
const ARMS = VARIED_ARMS.map((arm) => [arm.name, arm] as const);
const HARDWARE_RAISE = 7;
const FACT_INDENT = "  ";

/** The sample book with every hardware amount raised, as a book the shop priced under before a change. */
const EARLIER_BOOK: SnapshotBook = {
  pricingVersion: "qa-earlier-book",
  book: {
    ...SAMPLE_PRICE_BOOK,
    version: "qa-earlier-book",
    hardware: {
      ...SAMPLE_PRICE_BOOK.hardware,
      tiers: SAMPLE_PRICE_BOOK.hardware.tiers.map((tier) => ({
        ...tier,
        perHingeMinor: tier.perHingeMinor * HARDWARE_RAISE,
        perDrawerMinor: tier.perDrawerMinor * HARDWARE_RAISE,
      })),
    },
  },
};

interface StoredKitchen {
  readonly design: Design;
  readonly stored: SubmissionSnapshot;
}

function storedKitchensOf(arm: VariedArm): readonly StoredKitchen[] {
  return variedKitchensOf(arm).flatMap(({ design }) => {
    const stored = snapshotUnder(design, EARLIER_BOOK);
    return stored === undefined ? [] : [{ design, stored }];
  });
}

/** The lines a review of this design and this price shows, in the notice's layout: the summary, then the appendix. */
function reviewLinesOf(design: Design, priced: PricedDesign): string[] {
  const review = describeReview({
    content: ro,
    design,
    pricing: { ok: true, priced },
    groups: projectDesignForDisplay(
      design,
      buildKitchenLBodyCatalog(cabinetDepthMmOf(design)),
    ),
  });
  if (review.kind !== "available") throw new Error("the review is unavailable");
  return [
    notice.line(notice.labels.room, review.roomLine),
    ...review.groups.map((group) =>
      notice.groupCount(group.heading, group.rows.length),
    ),
    notice.line(
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
        notice.line(row.label, row.amountText),
        ...rowDetailOf(review.rowDetails, row.key).facts.map(
          (fact) => `${FACT_INDENT}${fact}`,
        ),
      ]),
    ]),
    ...review.wholeKitchenRows.map((row) =>
      notice.line(row.label, row.amountText),
    ),
  ];
}

function livePriceOf(design: Design): PricedDesign {
  const pricing = priceDesign({
    design,
    catalog: buildKitchenLBodyCatalog(cabinetDepthMmOf(design)),
    book: SAMPLE_PRICE_BOOK,
    pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
    selections: design.settings,
  });
  if (!pricing.ok) throw new Error("the fixture kitchen did not price");
  return pricing.priced;
}

/** The text part after the link line and the customer's lines: the summary, then the appendix. */
function kitchenLinesOf(submission: ContactSubmissionToRecord): string[] {
  const lines = noticeOf(submission).text.split("\n");
  const afterTheLink = lines.indexOf("") + 1;
  return lines.slice(lines.indexOf("", afterTheLink) + 1);
}

function storedDesignOf(snapshot: SubmissionSnapshot): Design {
  return DesignSchema.parse(JSON.parse(snapshot.document));
}

beforeEach(forbidFetch);
afterEach(releaseFetch);

describe.each(ARMS)(
  "kitchens of the %s arm, stored under an earlier book",
  (_name, arm) => {
    const kitchens = storedKitchensOf(arm);

    it("are many, and their stored price is not what the live book would answer", () => {
      const pricedAlikeLive = kitchens.filter(
        ({ design, stored }) =>
          stored.priced.totalMinor === livePriceOf(design).totalMinor,
      );

      expect(kitchens.length).toBeGreaterThan(50);
      expect(pricedAlikeLive).toEqual([]);
    });

    it("print the rows, the figure and the disclaimer a review of the stored snapshot shows", () => {
      const wrong = kitchens.filter(
        ({ stored }) =>
          JSON.stringify(
            kitchenLinesOf(designRequest({ snapshot: stored })),
          ) !==
          JSON.stringify(reviewLinesOf(storedDesignOf(stored), stored.priced)),
      );

      expect(wrong).toEqual([]);
    });

    it("never print what a review of the same design priced again today would show", () => {
      const printingTheLivePrice = kitchens.filter(
        ({ design, stored }) =>
          JSON.stringify(
            kitchenLinesOf(designRequest({ snapshot: stored })),
          ) === JSON.stringify(reviewLinesOf(design, livePriceOf(design))),
      );

      expect(printingTheLivePrice).toEqual([]);
    });

    it("print a body the customer supplies with the review's own words, in every kitchen that has one", () => {
      const withASuppliedBody = kitchens.filter(
        ({ stored }) => customerSuppliedIds(stored.priced).size > 0,
      );
      const missingTheWords = withASuppliedBody.filter(
        ({ stored }) =>
          !kitchenLinesOf(designRequest({ snapshot: stored })).some((line) =>
            line.endsWith(`: ${ro.priceBreakdown.notIncluded}`),
          ),
      );

      expect(withASuppliedBody.length).toBeGreaterThan(0);
      expect(missingTheWords).toEqual([]);
    });

    it("make a message the port may send", () => {
      const unsendable = kitchens.filter(
        ({ stored }) =>
          !isSendableMailMessage(noticeOf(designRequest({ snapshot: stored }))),
      );

      expect(unsendable).toEqual([]);
    });
  },
);

/** A finish of its own that each material of the sample book lets a body carry. */
const OWN_FINISH_BY_MATERIAL: Readonly<Record<string, Finish>> = {
  "material.melamine": { kind: "palette-entry", entryId: "pal.antracit" },
  "material.painted-mdf": { kind: "free-colour", value: "#b8c4a1" },
  "material.veneer": { kind: "palette-entry", entryId: "veneer.nuc" },
};
const OWN_HANDLES: readonly Handle[] = ["steel", "black", "push"];

function finishNameOf(finish: Finish): string {
  return finish.kind === "palette-entry"
    ? ro.finishName(finish.entryId)
    : ro.globalSettings.pillColourValue(finish.value);
}

/** Every body given a handle of its own, and a finish of its own where the kitchen's material offers one. */
function withOwnFinishAndHandle(design: Design): Design {
  const finish = OWN_FINISH_BY_MATERIAL[design.settings?.materialTierId ?? ""];
  return {
    ...design,
    placements: design.placements.map((placement, index) => ({
      ...placement,
      body: {
        ...placement.body,
        ...(finish === undefined ? {} : { finish }),
        handle: OWN_HANDLES[index % OWN_HANDLES.length],
      },
    })),
  };
}

interface DressedKitchen {
  readonly design: Design;
  readonly stored: SubmissionSnapshot;
  readonly factLines: readonly string[];
}

/** The arm's kitchens, dressed, as the domain's public snapshot function stores them. */
function dressedKitchensOf(arm: VariedArm): readonly DressedKitchen[] {
  return variedKitchensOf(arm).flatMap(({ design }) => {
    const dressed = withOwnFinishAndHandle(design);
    const stored = snapshotUnder(dressed, SAMPLE_BOOK);
    if (stored === undefined) return [];
    const factLines = kitchenLinesOf(
      designRequest({ snapshot: stored }),
    ).filter((line) => line.startsWith(FACT_INDENT));
    return [{ design: dressed, stored, factLines }];
  });
}

function countOf(lines: readonly string[], wanted: string): number {
  return lines.filter((line) => line === wanted).length;
}

describe.each(ARMS)(
  "kitchens of the %s arm whose bodies carry a finish and a handle of their own",
  (_name, arm) => {
    const kitchens = dressedKitchensOf(arm);
    const withAFinish = kitchens.filter(({ design }) =>
      design.placements.some(({ body }) => body.finish !== undefined),
    );

    it("are stored by the domain for every kitchen of the arm, most of them with a finish too", () => {
      expect(kitchens).toHaveLength(variedKitchensOf(arm).length);
      expect(kitchens.length).toBeGreaterThan(50);
      expect(withAFinish.length).toBeGreaterThan(20);
    });

    it("print under each row the facts the review's model gives that row, in its order", () => {
      const wrong = kitchens
        .filter(
          ({ stored }) =>
            JSON.stringify(
              kitchenLinesOf(designRequest({ snapshot: stored })),
            ) !==
            JSON.stringify(
              reviewLinesOf(storedDesignOf(stored), stored.priced),
            ),
        )
        .map(({ design }) => JSON.stringify(design.room));

      expect(wrong).toEqual([]);
    });

    it("print each handle's own word once for every body that carries that handle", () => {
      const wrong = kitchens
        .filter(({ design, factLines }) =>
          OWN_HANDLES.some(
            (handle) =>
              countOf(
                factLines,
                `${FACT_INDENT}${ro.panel.handleLabels[handle]}`,
              ) !==
              design.placements.filter(({ body }) => body.handle === handle)
                .length,
          ),
        )
        .map(({ design }) => JSON.stringify(design.room));

      expect(wrong).toEqual([]);
    });

    it("print the finish's own name once for every body that carries a finish", () => {
      const wrong = withAFinish
        .filter(({ design, factLines }) => {
          const [first] = design.placements;
          const finish = first?.body.finish;
          return (
            finish === undefined ||
            countOf(factLines, `${FACT_INDENT}${finishNameOf(finish)}`) !==
              design.placements.length
          );
        })
        .map(({ design }) => JSON.stringify(design.room));

      expect(wrong).toEqual([]);
    });
  },
);

const HOSTILE_ID = "QA-HOSTILE-5d81c0\nTelefon: +37360000000";

/** The same kitchen with its first body's id replaced by text that holds a marker and a line break. */
function withAHostilePlacementId(design: Design): Design {
  return {
    ...design,
    placements: design.placements.map((placement, index) =>
      index === 0 ? { ...placement, id: HOSTILE_ID } : placement,
    ),
  };
}

describe("a placement id that holds a marker and a line break", () => {
  const [firstArm] = VARIED_ARMS;
  if (firstArm === undefined) throw new Error("the fixture has no arm");
  const [kitchen] = storedKitchensOf(firstArm);
  if (kitchen === undefined) throw new Error("the fixture has no kitchen");
  const hostile = withAHostilePlacementId(kitchen.design);

  it("leaves in nothing thrown when the stored price is not that document's", () => {
    const submission = designRequest({
      snapshot: {
        document: canonicalSerializeDesign(hostile),
        priced: kitchen.stored.priced,
      },
    });

    const thrown = thrownBy(() => noticeOf(submission));

    expect(thrown).toBeInstanceOf(NoticeKitchenError);
    expect((thrown as NoticeKitchenError).failure).toBe("review-not-sendable");
    expect((thrown as Error).cause).toBeUndefined();
    expect(everyReadingOf([thrown, (thrown as Error).stack])).not.toContain(
      "QA-HOSTILE",
    );
  });

  it("is printed nowhere when the domain stored the kitchen with it", () => {
    const stored = snapshotUnder(hostile, SAMPLE_BOOK);
    if (stored === undefined) throw new Error("the domain refused the kitchen");

    const message = noticeOf(designRequest({ snapshot: stored }));

    expect(stored.document).toContain("QA-HOSTILE");
    expect(everyReadingOf(message)).not.toContain("QA-HOSTILE");
    expect(isSendableMailMessage(message)).toBe(true);
  });
});

/** A value on which any operation at all, a prototype lookup included, throws. */
function valueWhoseEveryTrapThrows(): object {
  const everyTrapThrows = new Proxy(
    {},
    {
      get: () => () => {
        throw new Error("a trap of the thrown value ran");
      },
    },
  );
  return new Proxy({}, everyTrapThrows);
}

describe("a kitchen line that cannot be composed", () => {
  it("leaves as the fixed error, with nothing asked of what was thrown while the room's line was written", () => {
    const content = {
      ...ro,
      leadNotice: {
        ...ro.leadNotice,
        line: (label: string, value: string) => {
          // eslint-disable-next-line @typescript-eslint/only-throw-error -- a thrown value that is no Error is the case
          if (label === notice.labels.room) throw valueWhoseEveryTrapThrows();
          return notice.line(label, value);
        },
      },
    };

    const thrown = thrownBy(() => noticeOf(designRequest(), content));

    expect(thrown).toBeInstanceOf(NoticeKitchenError);
    expect((thrown as NoticeKitchenError).failure).toBe("review-not-sendable");
    expect((thrown as Error).cause).toBeUndefined();
  });
});

/** What a store would hold had it kept a kitchen the domain refuses: the same two members, made the same way. */
function handMadeSnapshotOf(design: Design): SubmissionSnapshot {
  return {
    document: canonicalSerializeDesign(design),
    priced: livePriceOf(design),
  };
}

function firstPlacementIdOf(design: Design): ReadonlySet<string> {
  const [first] = design.placements;
  if (first === undefined) throw new Error("the kitchen has no body");
  return new Set([first.id]);
}

describe.each(ARMS)(
  "kitchens of the %s arm the review would refuse",
  (_name, arm) => {
    const designs = variedKitchensOf(arm).map(({ design }) => design);

    const REFUSED_KITCHENS: readonly [string, (design: Design) => Design][] = [
      [
        "a body past the end of its wall",
        (design) => pastTheWall(design, firstPlacementIdOf(design)),
      ],
      [
        "nothing but bodies the customer supplies",
        (design) =>
          keepingOnly(design, customerSuppliedIds(livePriceOf(design))),
      ],
    ];

    it.each(REFUSED_KITCHENS)(
      "are refused by the domain's snapshot and by the notice alike, with %s",
      (_label, refuse) => {
        const refused = designs.map(refuse);
        const stillSnapshotted = refused.filter(
          (design) => snapshotUnder(design, SAMPLE_BOOK) !== undefined,
        );
        const notRefusedByTheNotice = refused.filter((design) => {
          const thrown = thrownBy(() =>
            noticeOf(designRequest({ snapshot: handMadeSnapshotOf(design) })),
          );
          return !(
            thrown instanceof NoticeKitchenError &&
            thrown.failure === "review-not-sendable"
          );
        });

        expect(refused.length).toBeGreaterThan(50);
        expect(stillSnapshotted).toEqual([]);
        expect(notRefusedByTheNotice).toEqual([]);
      },
    );
  },
);

function deepFrozen<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const member of Object.values(value)) deepFrozen(member);
  }
  return value;
}

function withMembersReversed<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).reverse()) as T;
}

describe("one stored request, the same bytes on every attempt", () => {
  const [firstArm] = VARIED_ARMS;
  if (firstArm === undefined) throw new Error("the fixture has no arm");
  const [first, second] = storedKitchensOf(firstArm);
  if (first === undefined || second === undefined)
    throw new Error("the fixture has too few kitchens");
  const submission = designRequest({ snapshot: first.stored });

  it("is the same after the request went through the store's JSON and came back", () => {
    const reloaded = JSON.parse(
      JSON.stringify(submission),
    ) as ContactSubmissionToRecord;

    expect(noticeOf(reloaded)).toStrictEqual(noticeOf(submission));
  });

  it("does not depend on the order the request's or the contact's members were written in", () => {
    const reordered = withMembersReversed({
      ...submission,
      contact: withMembersReversed(submission.contact),
      snapshot: withMembersReversed(first.stored),
    });

    expect(noticeOf(reordered)).toStrictEqual(noticeOf(submission));
  });

  it("is the same after other requests were described in between, a callback among them", () => {
    const before = noticeOf(submission);

    noticeOf(designRequest({ snapshot: second.stored, locale: "ru" }));
    noticeOf(callbackRequest({ clientRequestId: "qa_request_0000000002" }));
    thrownBy(() => noticeOf(designRequest({ snapshot: undefined })));

    expect(noticeOf(submission)).toStrictEqual(before);
  });

  it("reads a request it may not write to, and leaves a writable one as it found it", () => {
    const writable = designRequest({ snapshot: first.stored });
    const asFound = JSON.stringify(writable);

    const fromFrozen = noticeOf(
      deepFrozen(designRequest({ snapshot: first.stored })),
    );
    const fromWritable = noticeOf(writable);

    expect(fromFrozen).toStrictEqual(fromWritable);
    expect(JSON.stringify(writable)).toBe(asFound);
  });
});
