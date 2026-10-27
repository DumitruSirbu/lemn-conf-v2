// M10 wave M1, adversarial QA: M1-a and M1-b as properties over random books of both forms, with random edits written by
// an oracle that does not use the module (`qa-m1-books.ts`). Books differ in structure as well as in value.
import { fc } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import type { DraftChange } from "../../src/price-dashboard/book-field-address.js";
import {
  applyChanges,
  revertChange,
  type ApplyChangesResult,
} from "../../src/price-dashboard/apply-changes.js";
import {
  DIFF_SECTIONS,
  diffBooks,
  type BookDiffRow,
  type FieldDiffRow,
} from "../../src/price-dashboard/diff-books.js";
import { CHANGE_REFUSAL_CODES } from "../../src/price-dashboard/editable-fields.js";
import { restoreChanges } from "../../src/price-dashboard/restore.js";
import type { PriceBook } from "../../src/pricing/price-book.js";

import {
  addressKeyOf,
  bookArb,
  bookWithEditsArb,
  cabinetSlotsOf,
  changeFor,
  editsArb,
  lastWins,
  must,
  MAX_AMOUNT,
  MAX_DEPTH,
  MAX_MATERIAL,
  PROPERTY_RUNS,
  PROPERTY_SEED,
  slotsOf,
  valueAt,
  written,
  type Edit,
} from "./qa-m1-books.js";

const RUN = { numRuns: PROPERTY_RUNS, seed: PROPERTY_SEED };

function bookOf(result: ApplyChangesResult): PriceBook {
  if (!result.ok) {
    throw new Error(`expected a candidate book: ${JSON.stringify(result)}`);
  }
  return result.book;
}

function deepFreeze<Value>(value: Value): Value {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const member of Object.values(value)) deepFreeze(member);
  }
  return value;
}

const SECTION_OF_KIND: Record<string, string> = {
  cabinet: "cabinets",
  "cabinet-size": "cabinets",
  "depth-rule": "price-rules",
  material: "materials",
  hardware: "hardware",
  accessory: "accessories",
  provisional: "provisional",
};

function fieldRowsOf(rows: readonly BookDiffRow[]): readonly FieldDiffRow[] {
  return rows.flatMap((row) => (row.kind === "field" ? [row] : row.items));
}

describe("the generator produces what the properties assume", () => {
  it("makes parser-valid percentage-form books with varied structure", () => {
    const books = fc.sample(bookArb, { numRuns: 400, seed: PROPERTY_SEED });
    const shapes = new Set(
      books.flatMap((book) =>
        book.cabinetRules.map((rule) => rule.formula.shape),
      ),
    );

    // One form since the cut-over: every book states a depth percentage and every material tier a percentage.
    expect(
      books.every((book) =>
        Number.isInteger(book.depthRule.deepCabinetPercent),
      ),
    ).toBe(true);
    expect(
      books.every((book) =>
        book.material.tiers.every((tier) => "percentOfCabinets" in tier),
      ),
    ).toBe(true);
    expect(
      new Set(books.map((book) => book.depthRule.deepCabinetPercent)).size,
    ).toBeGreaterThan(1);
    for (const shape of [
      "anchored-width",
      "anchored-width-and-door-leaves",
      "anchored-width-and-height",
      "anchored-width-height-and-door-leaves",
      "price-per-size",
    ]) {
      expect(shapes.has(shape as never)).toBe(true);
    }
    expect(
      new Set(books.map((book) => book.material.defaultTierId)).size,
    ).toBeGreaterThan(1);
    expect(
      new Set(books.map((book) => book.hardware.defaultTierId)).size,
    ).toBeGreaterThan(1);
    expect(
      books.some((book) =>
        book.hardware.tiers.some((tier) => "perLiftMinor" in tier),
      ),
    ).toBe(true);
  });
});

describe("M1-a: apply(active, []) is active", () => {
  it("deep-equals the active book and keeps it, whatever its structure", () => {
    fc.assert(
      fc.property(bookArb, (book) => {
        expect(bookOf(applyChanges(book, []))).toEqual(book);
      }),
      RUN,
    );
  });
});

describe("M1-a: the changes that restore an archived book make it, on every field both books state", () => {
  it("holds between two independently generated books (form, rules, shapes, sizes and default tiers may differ)", () => {
    fc.assert(
      fc.property(bookArb, bookArb, (archived, active) => {
        const archivedValues = new Map(
          slotsOf(archived).map((found) => [
            found.key,
            valueAt(archived, found),
          ]),
        );
        const expected = written(
          active,
          slotsOf(active).flatMap((found): Edit[] => {
            const archivedValue = archivedValues.get(found.key);
            return archivedValue === undefined
              ? []
              : [{ slot: found, value: archivedValue }];
          }),
        );

        const restored = applyChanges(active, restoreChanges(archived, active));

        expect(bookOf(restored)).toEqual(expected);
      }),
      { ...RUN, numRuns: 600 },
    );
  });

  it("gives the archived value at every field both books state, and leaves the others as active has them", () => {
    fc.assert(
      fc.property(bookArb, bookArb, (archived, active) => {
        const result = bookOf(
          applyChanges(active, restoreChanges(archived, active)),
        );
        const resultSlots = new Map(
          slotsOf(result).map((found) => [found.key, found]),
        );
        for (const archivedSlot of slotsOf(archived)) {
          const resulting = resultSlots.get(archivedSlot.key);
          if (resulting === undefined) continue;
          expect(valueAt(result, resulting)).toBe(
            valueAt(archived, archivedSlot),
          );
        }
      }),
      RUN,
    );
  });

  it("restores nothing between equal books and one change per differing shared field otherwise", () => {
    fc.assert(
      fc.property(bookArb, bookArb, (archived, active) => {
        const activeSlots = new Map(
          slotsOf(active).map((found) => [found.key, found]),
        );
        const differing = slotsOf(archived).filter((found) => {
          const counterpart = activeSlots.get(found.key);
          return (
            counterpart !== undefined &&
            valueAt(active, counterpart) !== valueAt(archived, found)
          );
        });

        const changes = restoreChanges(archived, active);

        expect(changes).toHaveLength(differing.length);
        expect(restoreChanges(active, active)).toEqual([]);
      }),
      RUN,
    );
  });
});

describe("M1-a: reverting the only change gives the active book back", () => {
  it("holds for any single edit of any field of any book", () => {
    fc.assert(
      fc.property(
        bookArb.chain((book) =>
          editsArb(book, { min: 1, max: 1 }).map((edits) => ({ book, edits })),
        ),
        ({ book, edits }) => {
          const change = changeFor(must(edits[0]));

          const reverted = revertChange([change], change.address);

          expect(reverted).toEqual([]);
          expect(bookOf(applyChanges(book, reverted))).toEqual(book);
        },
      ),
      RUN,
    );
  });

  it("removes only the named address from a longer draft", () => {
    fc.assert(
      fc.property(bookWithEditsArb, fc.nat(), ({ book, edits }, drawn) => {
        void book;
        const draft = lastWins(edits).map((edit) => changeFor(edit));
        if (draft.length === 0) return;
        const target = draft[drawn % draft.length];
        if (target === undefined) return;

        const reverted = revertChange(draft, target.address);

        expect(reverted).toEqual(draft.filter((change) => change !== target));
      }),
      RUN,
    );
  });
});

describe("applying changes: the candidate is exactly the edits, later over earlier", () => {
  it("equals the oracle's book for any list of edits, duplicates included", () => {
    fc.assert(
      fc.property(bookWithEditsArb, ({ book, edits }) => {
        const result = applyChanges(
          book,
          edits.map((edit) => changeFor(edit)),
        );

        expect(bookOf(result)).toEqual(written(book, edits));
      }),
      { ...RUN, numRuns: 600 },
    );
  });

  it("is idempotent: a draft listed twice, and a candidate re-applied, are the candidate", () => {
    fc.assert(
      fc.property(bookWithEditsArb, ({ book, edits }) => {
        const changes = edits.map((edit) => changeFor(edit));

        const once = bookOf(applyChanges(book, changes));
        const listedTwice = bookOf(
          applyChanges(book, [...changes, ...changes]),
        );
        const reapplied = bookOf(applyChanges(once, changes));

        expect(listedTwice).toEqual(once);
        expect(reapplied).toEqual(once);
      }),
      RUN,
    );
  });

  it("commutes for changes of different addresses, and the last of an equal address wins", () => {
    fc.assert(
      fc.property(
        bookWithEditsArb,
        fc.infiniteStream(fc.nat()),
        ({ book, edits }, stream) => {
          const distinct = lastWins(edits);
          const draw = stream[Symbol.iterator]();
          const shuffled = [...distinct]
            .map((edit) => ({ edit, order: draw.next().value as number }))
            .sort((left, right) => left.order - right.order)
            .map(({ edit }) => edit);

          const inOrder = applyChanges(
            book,
            distinct.map((edit) => changeFor(edit)),
          );
          const permuted = applyChanges(
            book,
            shuffled.map((edit) => changeFor(edit)),
          );

          expect(bookOf(permuted)).toEqual(bookOf(inOrder));
        },
      ),
      RUN,
    );
  });

  it("lets the later of two changes to one field win, in either order", () => {
    fc.assert(
      fc.property(
        bookArb.chain((book) =>
          editsArb(book, { min: 1, max: 1 }).chain(([first]) =>
            fc
              .tuple(fc.nat(2_147_483_647), fc.nat(2_147_483_647))
              .map(([left, right]) => ({
                book,
                slot: must(first).slot,
                left,
                right,
              })),
          ),
        ),
        ({ book, slot, left, right }) => {
          const valueOne =
            slot.unit === "flag" ? left % 2 === 0 : left % (slot.max + 1);
          const valueTwo =
            slot.unit === "flag" ? right % 2 === 0 : right % (slot.max + 1);
          const one: Edit = { slot, value: valueOne };
          const two: Edit = { slot, value: valueTwo };

          const oneThenTwo = bookOf(
            applyChanges(book, [changeFor(one), changeFor(two)]),
          );
          const twoThenOne = bookOf(
            applyChanges(book, [changeFor(two), changeFor(one)]),
          );

          expect(oneThenTwo).toEqual(written(book, [two]));
          expect(twoThenOne).toEqual(written(book, [one]));
        },
      ),
      RUN,
    );
  });

  it("is a pure function: frozen input, equal results on a repeat, and the active book is untouched", () => {
    fc.assert(
      fc.property(bookWithEditsArb, ({ book, edits }) => {
        const before = JSON.stringify(book);
        const changes = deepFreeze(edits.map((edit) => changeFor(edit)));
        deepFreeze(book);

        const first = applyChanges(book, changes);
        const second = applyChanges(book, changes);

        expect(second).toEqual(first);
        expect(JSON.stringify(book)).toBe(before);
      }),
      RUN,
    );
  });
});

describe("applying changes: every in-range value is accepted, at the edges of every range", () => {
  it("accepts 0, 1, max - 1 and max at every field at once, and the parser takes the book (no in-range edit is a defect)", () => {
    fc.assert(
      fc.property(
        bookArb,
        fc.constantFrom("zero", "one", "max-1", "max"),
        (book, pick) => {
          const edits = slotsOf(book).map((found): Edit => {
            if (found.unit === "flag") return { slot: found, value: true };
            const at: Record<string, number> = {
              zero: 0,
              one: 1,
              "max-1": found.max - 1,
              max: found.max,
            };
            return { slot: found, value: must(at[pick]) };
          });

          const result = applyChanges(
            book,
            edits.map((edit) => changeFor(edit)),
          );

          expect(bookOf(result)).toEqual(written(book, edits));
        },
      ),
      RUN,
    );
  });

  it("refuses one past the edge of every range, naming no more than that change", () => {
    fc.assert(
      fc.property(bookArb, (book) => {
        const edits = slotsOf(book).filter((found) => found.unit !== "flag");
        const changes = edits.map((found) =>
          changeFor({ slot: found, value: found.max + 1 }),
        );

        const result = applyChanges(book, changes);

        expect(result).toEqual({
          ok: false,
          reason: "changes-refused",
          refusals: edits.map((_, index) => ({ index, code: "TOO_LARGE" })),
        });
      }),
      RUN,
    );
  });

  it("holds the amount ceiling at the parser's own bound", () => {
    expect(MAX_AMOUNT).toBeGreaterThan(2 ** 31);
  });
});

const NON_CONFORMING_VALUES: readonly unknown[] = [
  -0,
  -1,
  -MAX_AMOUNT - 1,
  Number.MIN_SAFE_INTEGER,
  0.5,
  -0.5,
  Number.NaN,
  Infinity,
  -Infinity,
  Number.MIN_VALUE,
  "1",
  "",
  [],
  [1],
  {},
  true,
  false,
  null,
  undefined,
  2 ** 53,
  1e21,
  MAX_AMOUNT + 1,
  MAX_MATERIAL + 1,
  MAX_DEPTH + 1,
  200.5,
];

/** The code a value is refused for at a numeric field with this ceiling, or undefined when it is in range. */
function expectedRefusal(value: unknown, max: number): string | undefined {
  if (value === null || value === undefined) return "MISSING_VALUE";
  if (typeof value !== "number" || !Number.isInteger(value))
    return "NOT_A_WHOLE_NUMBER";
  if (value < 0 || Object.is(value, -0)) return "NEGATIVE";
  return value > max ? "TOO_LARGE" : undefined;
}

describe("a value is refused with the code its defect names, at every numeric field of every book", () => {
  it("classifies hostile and out-of-range values (negative zero included) by one precedence", () => {
    fc.assert(
      fc.property(
        bookArb,
        fc.constantFrom(...NON_CONFORMING_VALUES),
        (book, value) => {
          for (const found of slotsOf(book)) {
            if (found.unit === "flag") continue;
            const change = {
              address: found.address,
              value,
            } as unknown as DraftChange;
            const code = expectedRefusal(value, found.max);

            const result = applyChanges(book, [change]);

            if (code === undefined) {
              expect(result.ok, String(value)).toBe(true);
            } else {
              expect(result, String(value)).toEqual({
                ok: false,
                reason: "changes-refused",
                refusals: [{ index: 0, code }],
              });
            }
          }
        },
      ),
      RUN,
    );
  });

  it("refuses anything but a boolean at the provisional flag, with a code from the closed list", () => {
    fc.assert(
      fc.property(
        bookArb,
        fc.constantFrom(...NON_CONFORMING_VALUES),
        (book, value) => {
          if (typeof value === "boolean") return;
          const result = applyChanges(book, [
            {
              address: { kind: "provisional" },
              value,
            } as unknown as DraftChange,
          ]);

          expect(result.ok).toBe(false);
          if (!result.ok && result.reason === "changes-refused") {
            expect(CHANGE_REFUSAL_CODES).toContain(result.refusals[0]?.code);
          }
        },
      ),
      RUN,
    );
  });
});

describe("judging against the running candidate: a refused change leaves the candidate as it was", () => {
  it("names exactly the invalid changes of an interleaved list, whatever their places, and applies the valid ones once the invalid are removed", () => {
    fc.assert(
      fc.property(
        bookWithEditsArb,
        fc.infiniteStream(fc.boolean()),
        ({ book, edits }, flags) => {
          const draw = flags[Symbol.iterator]();
          const entries = edits
            .filter((edit) => edit.slot.unit !== "flag")
            .map((edit) => {
              const isBad = draw.next().value as boolean;
              return {
                isBad,
                edit,
                change: changeFor(
                  isBad ? { slot: edit.slot, value: edit.slot.max + 1 } : edit,
                ),
              };
            });

          const result = applyChanges(
            book,
            entries.map((entry) => entry.change),
          );

          const badIndexes = entries.flatMap((entry, index) =>
            entry.isBad ? [index] : [],
          );
          if (badIndexes.length > 0) {
            expect(result).toEqual({
              ok: false,
              reason: "changes-refused",
              refusals: badIndexes.map((index) => ({
                index,
                code: "TOO_LARGE",
              })),
            });
          }
          const goodOnly = entries.filter((entry) => !entry.isBad);
          expect(
            bookOf(
              applyChanges(
                book,
                goodOnly.map((entry) => entry.change),
              ),
            ),
          ).toEqual(
            written(
              book,
              goodOnly.map((entry) => entry.edit),
            ),
          );
        },
      ),
      RUN,
    );
  });
});

describe("the rows a change may never set are refused on every generated book", () => {
  it("refuses the default material tier and every customer-supplied rule, whatever the default is", () => {
    fc.assert(
      fc.property(bookArb, (book) => {
        const refusedCodes = [
          ...book.material.tiers
            .filter((tier) => tier.tierId === book.material.defaultTierId)
            .map((tier) => ({
              kind: "material",
              tierId: tier.tierId,
              field: "percentOfCabinets",
            })),
          ...book.cabinetRules
            .filter((rule) => rule.suppliedBy === "customer")
            .flatMap((rule) => [
              { kind: "cabinet", ruleId: rule.ruleId, field: "anchorMinor" },
              { kind: "cabinet-size", ruleId: rule.ruleId, widthMm: 600 },
            ]),
        ].map((address) => {
          const result = applyChanges(book, [
            { address, value: 1 } as unknown as DraftChange,
          ]);
          return result.ok ? "accepted" : JSON.stringify(result);
        });

        expect(refusedCodes.length).toBeGreaterThan(0);
        for (const outcome of refusedCodes) {
          expect(outcome).not.toBe("accepted");
          expect(outcome).toMatch(/NOT_EDITABLE|FIELD_NOT_ON_RULE/);
        }
        const defaultRefusal = applyChanges(book, [
          {
            address: {
              kind: "material",
              tierId: book.material.defaultTierId,
              field: "percentOfCabinets",
            },
            value: 1,
          } as unknown as DraftChange,
        ]);
        expect(defaultRefusal.ok).toBe(false);
      }),
      RUN,
    );
  });
});

describe("M1-b: a diff of identical books is empty, unless a change names a field", () => {
  it("is empty for any book when no change is given", () => {
    fc.assert(
      fc.property(bookArb, (book) => {
        expect(diffBooks(book, book)).toEqual([]);
        expect(diffBooks(book, book, { changes: [] })).toEqual([]);
      }),
      RUN,
    );
  });

  it("draws exactly one no-op row, before = after with delta 0, for each field a lone change names, and none for any other", () => {
    fc.assert(
      fc.property(bookWithEditsArb, ({ book, edits }) => {
        const named = lastWins(edits);
        const changes = named.map((edit) => changeFor(edit));

        const rows = diffBooks(book, book, { changes });

        expect(rows.every((row) => row.kind === "field")).toBe(true);
        expect(
          rows.map((row) => addressKeyOf((row as FieldDiffRow).address)).sort(),
        ).toEqual(named.map((edit) => edit.slot.key).sort());
        for (const row of fieldRowsOf(rows)) {
          expect(row.before).toBe(row.after);
          if (row.unit !== "flag") expect(row.delta).toBe(0);
        }
      }),
      RUN,
    );
  });

  it("draws no row for an address no change names, nor for a named address neither book states", () => {
    fc.assert(
      fc.property(bookArb, bookArb, (before, after) => {
        const ghost = {
          address: {
            kind: "hardware",
            tierId: "hardware.nowhere",
            field: "perHingeMinor",
          },
          value: 1,
        } as unknown as DraftChange;
        const rows = diffBooks(before, after, { changes: [ghost] });

        expect(rows).toEqual(diffBooks(before, after));
      }),
      RUN,
    );
  });

  it("counts every member a group's changes name, in a group of no-ops too", () => {
    fc.assert(
      fc.property(
        bookArb.filter((book) => cabinetSlotsOf(book).length >= 2),
        (book) => {
          const members = cabinetSlotsOf(book).map((found) => ({
            slot: found,
            value: valueAt(book, found),
          }));
          const changes = members.map((edit) =>
            changeFor(edit, {
              groupId: "g",
              bulk: { percent: 0, scope: "all" },
            }),
          );

          const rows = diffBooks(book, book, { changes });

          expect(rows).toHaveLength(1);
          const [row] = rows;
          if (row?.kind !== "group") throw new Error("expected a group row");
          expect(row.items).toHaveLength(members.length);
          expect(row.amountCount).toBe(members.length);
          expect(row.ruleCount).toBe(
            new Set(
              members.map(
                (edit) => (edit.slot.address as { ruleId: string }).ruleId,
              ),
            ).size,
          );
        },
      ),
      RUN,
    );
  });
});

describe("M1-b: a diff names exactly the fields that differ", () => {
  it("is one row per differing field of an edited book, with before, after and delta", () => {
    fc.assert(
      fc.property(bookWithEditsArb, ({ book, edits }) => {
        const after = written(book, edits);
        const changed = slotsOf(book).filter(
          (found) => valueAt(book, found) !== valueAt(after, found),
        );

        const rows = fieldRowsOf(diffBooks(book, after));

        expect(rows).toHaveLength(changed.length);
        for (const found of changed) {
          const row = rows.find(
            (candidate) => addressKeyOf(candidate.address) === found.key,
          );
          expect(row).toBeDefined();
          expect(row?.before).toBe(valueAt(book, found));
          expect(row?.after).toBe(valueAt(after, found));
          expect(row?.unit).toBe(found.unit);
          if (found.unit === "flag") expect(row).not.toHaveProperty("delta");
          else {
            expect(row?.delta).toBe(
              (valueAt(after, found) as number) -
                (valueAt(book, found) as number),
            );
          }
        }
      }),
      RUN,
    );
  });

  it("states a field one book lacks as absent on that side, and never as zero, between any two books", () => {
    fc.assert(
      fc.property(bookArb, bookArb, (before, after) => {
        const beforeSlots = new Map(
          slotsOf(before).map((found) => [found.key, found]),
        );
        const afterSlots = new Map(
          slotsOf(after).map((found) => [found.key, found]),
        );
        const keys = new Set([...beforeSlots.keys(), ...afterSlots.keys()]);
        const expected = [...keys].filter((key) => {
          const left = beforeSlots.get(key);
          const right = afterSlots.get(key);
          return (
            left === undefined ||
            right === undefined ||
            valueAt(before, left) !== valueAt(after, right)
          );
        });

        const rows = fieldRowsOf(diffBooks(before, after));

        expect(rows.map((row) => addressKeyOf(row.address)).sort()).toEqual(
          [...expected].sort(),
        );
        for (const row of rows) {
          const key = addressKeyOf(row.address);
          const isOnlyBefore = beforeSlots.has(key) && !afterSlots.has(key);
          const isOnlyAfter = !beforeSlots.has(key) && afterSlots.has(key);
          if (isOnlyBefore) expect(row.after).toEqual({ kind: "absent" });
          if (isOnlyAfter) expect(row.before).toEqual({ kind: "absent" });
          if (isOnlyBefore || isOnlyAfter)
            expect(row).not.toHaveProperty("delta");
        }
      }),
      RUN,
    );
  });

  it("is antisymmetric on the fields both books state: swapping the books swaps before and after and negates delta", () => {
    fc.assert(
      fc.property(bookWithEditsArb, ({ book, edits }) => {
        const after = written(book, edits);

        const forward = fieldRowsOf(diffBooks(book, after));
        const backward = fieldRowsOf(diffBooks(after, book));

        expect(backward).toHaveLength(forward.length);
        for (const row of forward) {
          const mirror = backward.find(
            (candidate) =>
              addressKeyOf(candidate.address) === addressKeyOf(row.address),
          );
          expect(mirror?.before).toBe(row.after);
          expect(mirror?.after).toBe(row.before);
          expect(mirror?.delta).toBe(
            row.delta === undefined ? undefined : -row.delta,
          );
        }
      }),
      RUN,
    );
  });

  it("lists sections in D7's order and gives the same rows, in the same order, on every repeat", () => {
    fc.assert(
      fc.property(bookArb, bookArb, (before, after) => {
        const rows = diffBooks(before, after);
        const order = rows.map((row) => DIFF_SECTIONS.indexOf(row.section));

        expect(order).toEqual([...order].sort((a, b) => a - b));
        expect(diffBooks(before, after)).toEqual(rows);
        expect(JSON.stringify(diffBooks(before, after))).toBe(
          JSON.stringify(rows),
        );
        for (const row of fieldRowsOf(rows)) {
          expect(row.section).toBe(SECTION_OF_KIND[row.address.kind]);
        }
      }),
      RUN,
    );
  });

  it("does not depend on the order a draft lists its changes in", () => {
    fc.assert(
      fc.property(bookWithEditsArb, ({ book, edits }) => {
        const distinct = lastWins(edits);
        const changes = distinct.map((edit, index) =>
          edit.slot.address.kind === "cabinet" ||
          edit.slot.address.kind === "cabinet-size"
            ? changeFor(edit, {
                groupId: `g${String(index % 3)}`,
                bulk: { percent: 5, scope: "all" },
              })
            : changeFor(edit),
        );
        const after = written(book, distinct);

        const forward = diffBooks(book, after, { changes });
        const reversed = diffBooks(book, after, {
          changes: [...changes].reverse(),
        });

        expect(reversed).toEqual(forward);
      }),
      RUN,
    );
  });
});

describe("M1-b: a bulk group of n changes diffs as one row expanding to n", () => {
  it("holds for random partitions of a book's cabinet edits into groups, with ungrouped fields kept apart", () => {
    fc.assert(
      fc.property(
        bookArb.filter((book) => cabinetSlotsOf(book).length >= 3),
        fc.infiniteStream(fc.nat(3)),
        fc.infiniteStream(fc.nat(2_147_483_647)),
        (book, groupDraws, valueDraws) => {
          const groupIterator = groupDraws[Symbol.iterator]();
          const valueIterator = valueDraws[Symbol.iterator]();
          const cabinets = cabinetSlotsOf(book);
          const edits = cabinets.map((found): Edit => {
            const current = valueAt(book, found) as number;
            const next =
              (valueIterator.next().value as number) % (found.max + 1);
            return {
              slot: found,
              value: next % 3 === 0 ? current : next,
            };
          });
          const groupOf = edits.map(() => groupIterator.next().value as number);
          const changes = edits.map((edit, index) =>
            groupOf[index] === 0
              ? changeFor(edit)
              : changeFor(edit, {
                  groupId: `group-${String(groupOf[index])}`,
                  bulk: { percent: 7, scope: "all" },
                }),
          );
          const after = bookOf(applyChanges(book, changes));
          const differs = (edit: Edit): boolean =>
            valueAt(book, edit.slot) !== valueAt(after, edit.slot);

          const rows = diffBooks(book, after, { changes });

          for (const groupNumber of [1, 2, 3]) {
            const members = edits.filter(
              (_, index) => groupOf[index] === groupNumber,
            );
            const groupRows = rows.filter(
              (row) =>
                row.kind === "group" &&
                row.groupId === `group-${String(groupNumber)}`,
            );
            if (members.length === 0) {
              expect(groupRows).toHaveLength(0);
              continue;
            }
            expect(groupRows).toHaveLength(1);
            const [groupRow] = groupRows;
            if (groupRow?.kind !== "group")
              throw new Error("expected a group row");
            expect(groupRow.items).toHaveLength(members.length);
            expect(groupRow.amountCount).toBe(members.length);
            expect(groupRow.ruleCount).toBe(
              new Set(
                members.map(
                  (edit) => (edit.slot.address as { ruleId: string }).ruleId,
                ),
              ).size,
            );
            expect(groupRow.section).toBe("cabinets");
          }
          const ungrouped = edits.filter((_, index) => groupOf[index] === 0);
          const looseRows = rows.filter((row) => row.kind === "field");
          expect(looseRows).toHaveLength(ungrouped.length);
          const grouped = rows.filter((row) => row.kind === "group");
          expect(rows).toHaveLength(looseRows.length + grouped.length);
          expect(fieldRowsOf(rows)).toHaveLength(edits.length);
          expect(edits.some(differs)).toBe(true);
        },
      ),
      RUN,
    );
  });
});
