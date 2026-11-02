// Adversarial QA of the structural diff rows (U5b): row, text and link rows over drafts that mix a created class, a created
// accessory, their rewording, their deletion and ordinary edits, in every order the draft can hold them. Properties, not
// examples: the rows must be unique, must name something, and what ↺ takes back must leave a draft that still makes a book.
// Each predicate is also shown to fail on a row list built to break it, so a green sweep is not a sweep that checks nothing.
import fc from "fast-check";
import {
  applyChanges,
  revertChange,
  type DraftChange,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import {
  describeVersionDiff,
  readPendingDraft,
  type RowView,
  type SectionView,
} from "@/price-dashboard/publish-model";

import {
  applicableDrafts,
  draftsThatDeleteNothingTheyCreate,
} from "./qa-m10-u5b-drafts";
import { ACTIVE, CABINET_NAMES } from "./publish-structural-rows.support";

const SWEEP = { numRuns: 300 } as const;

function allRows(sections: readonly SectionView[]): readonly RowView[] {
  return sections.flatMap((section) => section.rows);
}

function readySections(draft: readonly DraftChange[]): readonly SectionView[] {
  const reading = readPendingDraft({
    active: ACTIVE,
    changes: draft,
    cabinetNames: CABINET_NAMES,
  });
  if (reading.kind !== "ready") throw new Error(`read as ${reading.kind}`);
  return reading.view.sections;
}

/** The keys that more than one row of a section carries: React would draw one of them twice or not at all. */
function repeatedKeysIn(sections: readonly SectionView[]): readonly string[] {
  return sections.flatMap(({ rows }) => {
    const seen = new Set<string>();
    return rows.flatMap(({ key }) => {
      if (seen.has(key)) return [key];
      seen.add(key);
      return [];
    });
  });
}

/** The rows that say nothing of what they are about. */
function unnamedRowsIn(rows: readonly RowView[]): readonly string[] {
  return rows.flatMap((row) => {
    if (row.kind === "group") return [];
    const { subject } = row;
    const name =
      subject.kind === "name"
        ? subject.name
        : subject.kind === "book-text"
          ? subject.authored
          : "named by the page";
    return name === "" ? [row.key] : [];
  });
}

/** The rows of an archived version's diff that nevertheless hold an address to take something back by. */
function armedRowsIn(rows: readonly RowView[]): readonly string[] {
  return rows.flatMap((row) => (row.revert === undefined ? [] : [row.key]));
}

const A_ROW: RowView = {
  kind: "row",
  key: "k",
  section: "hardware",
  change: "created",
  itemKind: "hardware",
  subject: { kind: "book-text", authored: "Economic", key: undefined },
  revert: undefined,
};

describe("the predicates of the sweep below", () => {
  it("see a key two rows share", () => {
    const section: SectionView = { section: "hardware", rows: [A_ROW, A_ROW] };

    expect(repeatedKeysIn([section])).toEqual(["k"]);
  });

  it("see a row that names nothing", () => {
    const row: RowView = {
      ...A_ROW,
      subject: { kind: "book-text", authored: "", key: undefined },
    };

    expect(unnamedRowsIn([row])).toEqual(["k"]);
  });

  it("see a row that holds an arrow", () => {
    const row: RowView = {
      ...A_ROW,
      revert: { kind: "group", groupId: "g" },
    };

    expect(armedRowsIn([row])).toEqual(["k"]);
  });
});

describe("the rows of any draft the domain accepts", () => {
  it("are drawn: a draft that applies is never read as empty or as one that cannot be listed", () => {
    fc.assert(
      fc.property(applicableDrafts, (draft) => {
        const reading = readPendingDraft({
          active: ACTIVE,
          changes: draft,
          cabinetNames: CABINET_NAMES,
        });

        expect(reading.kind).toBe("ready");
      }),
      SWEEP,
    );
  });

  it("have a key of their own within their section", () => {
    fc.assert(
      fc.property(applicableDrafts, (draft) => {
        expect(repeatedKeysIn(readySections(draft))).toEqual([]);
      }),
      SWEEP,
    );
  });

  it("name what they are about, never with nothing", () => {
    fc.assert(
      fc.property(applicableDrafts, (draft) => {
        expect(unnamedRowsIn(allRows(readySections(draft)))).toEqual([]);
      }),
      SWEEP,
    );
  });

  it("each take back, through their arrow, a draft that still makes a book, and fewer changes than before", () => {
    fc.assert(
      fc.property(applicableDrafts, (draft) => {
        for (const row of allRows(readySections(draft))) {
          if (row.revert === undefined || row.revert.kind !== "change")
            continue;

          const remaining = revertChange(draft, row.revert.address);

          expect(
            remaining.length,
            `the arrow of ${row.key} removes nothing`,
          ).toBeLessThan(draft.length);
          expect(
            applyChanges(ACTIVE, remaining).ok,
            `the arrow of ${row.key} leaves a draft no book comes of`,
          ).toBe(true);
        }
      }),
      SWEEP,
    );
  });

  it("leave no change that no row can take back, in a draft that deletes nothing it creates", () => {
    fc.assert(
      fc.property(draftsThatDeleteNothingTheyCreate, (draft) => {
        let remaining: readonly DraftChange[] = draft;
        for (const row of allRows(readySections(draft))) {
          if (row.revert?.kind === "change") {
            remaining = revertChange(remaining, row.revert.address);
          }
        }
        const left = remaining.filter((held) => held.groupId === undefined);

        expect(
          left.map((held) => JSON.stringify(held.address)),
          "a change no row names stayed in the draft",
        ).toEqual([]);
      }),
      SWEEP,
    );
  });
});

describe("an archived version's diff of the same books", () => {
  it("has no arrow and no address to write to on any row", () => {
    fc.assert(
      fc.property(applicableDrafts, (draft) => {
        const applied = applyChanges(ACTIVE, draft);
        if (!applied.ok) return;

        const rows = allRows(
          describeVersionDiff({
            before: ACTIVE,
            after: applied.book,
            changes: draft,
            cabinetNames: CABINET_NAMES,
          }),
        );

        expect(armedRowsIn(rows.filter((row) => row.kind !== "group"))).toEqual(
          [],
        );
        for (const row of rows) {
          if (row.kind === "group") expect(row.revert).toBeUndefined();
        }
      }),
      { numRuns: 200 },
    );
  });
});
