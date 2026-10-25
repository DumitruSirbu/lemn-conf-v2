import type { DesignId } from "@lemnaria/configurator-domain";
import { fc } from "@fast-check/vitest";
import { nanoid } from "nanoid";
import { describe, expect, it } from "vitest";

import {
  MAX_EXPORTED_KITCHENS,
  MAX_EXPORTED_NOTE_BYTES,
  MAX_EXPORTED_NOTES_IN_TOTAL,
  MAX_EXPORTED_NOTES_PER_KITCHEN,
} from "../../src/account-kitchen-store.js";
import type {
  AccountKitchenStore,
  ExportedKitchenNotes,
} from "../../src/account-kitchen-store.js";
import { rejectionOf } from "./rejection-of.js";

/** The staff member who wrote a note. Nothing about them may reach the client's export. */
export interface StaffWriter {
  readonly accountId: string;
  readonly email: string;
  readonly name: string;
}

export interface NotesKitchenSpec {
  readonly accountId: string;
  readonly isHidden?: boolean;
  readonly isDeletedByClient?: boolean;
}

export interface NoteSpec {
  readonly designId: DesignId;
  readonly author: StaffWriter;
  readonly text: string;
  readonly createdAt: Date;
  /** The 21 characters `design_notes_id_shape` checks. Defaults to a fresh id. */
  readonly id?: string;
}

/** `count` notes `note 0` to `note {count - 1}`, one minute apart from `firstAt`, so a higher number is newer. */
export interface SomeNotesSpec {
  /** When given, every note has exactly this text instead of `note {index}`. */
  readonly text?: string;
  readonly designId: DesignId;
  readonly author: StaffWriter;
  readonly count: number;
  readonly firstAt: Date;
}

/** What one arm (the fake, or the database) provides: a store, and the rows around it. */
export interface NotesWorld {
  readonly store: AccountKitchenStore;
  aClient(): Promise<string>;
  aStaffWriter(): Promise<StaffWriter>;
  aKitchen(spec: NotesKitchenSpec): Promise<DesignId>;
  aNote(spec: NoteSpec): Promise<string>;
  someNotes(spec: SomeNotesSpec): Promise<void>;
}

export interface NotesContractOptions {
  /** How many random ownership layouts the property tries: the database arm pays a round trip per row. */
  readonly propertyRuns: number;
}

const FIRST_INSTANT = Date.UTC(2026, 0, 1);
const ONE_MINUTE_MS = 60_000;
const UNKNOWN_KITCHEN = "unknown-kitchen-id";
const NOTE_ID_PADDING_LENGTH = 20;
const FULL_KITCHENS =
  MAX_EXPORTED_NOTES_IN_TOTAL / MAX_EXPORTED_NOTES_PER_KITCHEN;
const LONG_TEXT_LENGTH = 2000;
const LIVE_TEST_TIMEOUT_MS = 120_000;

function instantAt(minute: number): Date {
  return new Date(FIRST_INSTANT + minute * ONE_MINUTE_MS);
}

function textsOf(kitchenNotes: ExportedKitchenNotes | undefined): string[] {
  return (kitchenNotes?.notes ?? []).map(({ text }) => text);
}

/** The behaviour `AccountKitchenStore.exportNotes` promises, written once for the fake and for `NeonAccountKitchenStore`. */
export function describeAccountKitchenNotesContract(
  name: string,
  newWorld: () => Promise<NotesWorld>,
  { propertyRuns }: NotesContractOptions,
): void {
  describe(`${name}: exportNotes`, () => {
    it("reads each note as its text and its instant, newest first, a tie in the instant going to the larger id", async () => {
      const world = await newWorld();
      const owner = await world.aClient();
      const staff = await world.aStaffWriter();
      const kitchen = await world.aKitchen({ accountId: owner });
      const idPadding = nanoid(NOTE_ID_PADDING_LENGTH);
      await world.aNote({
        designId: kitchen,
        author: staff,
        text: "oldest",
        createdAt: instantAt(1),
      });
      await world.aNote({
        designId: kitchen,
        author: staff,
        text: "tie, smaller id",
        createdAt: instantAt(2),
        id: `${idPadding}A`,
      });
      await world.aNote({
        designId: kitchen,
        author: staff,
        text: "tie, larger id",
        createdAt: instantAt(2),
        id: `${idPadding}B`,
      });
      await world.aNote({
        designId: kitchen,
        author: staff,
        text: "newest",
        createdAt: instantAt(3),
      });

      const notes = await world.store.exportNotes(owner, [kitchen]);

      expect(notes.get(kitchen)).toEqual({
        notes: [
          { text: "newest", createdAt: instantAt(3) },
          { text: "tie, larger id", createdAt: instantAt(2) },
          { text: "tie, smaller id", createdAt: instantAt(2) },
          { text: "oldest", createdAt: instantAt(1) },
        ],
        isTruncated: false,
      });
    });

    it("keeps a note's text exactly: newlines, mixed scripts and the longest text a note can hold", async () => {
      const world = await newWorld();
      const owner = await world.aClient();
      const staff = await world.aStaffWriter();
      const kitchen = await world.aKitchen({ accountId: owner });
      const texts = [
        "Two\nlines",
        "Привет, мир 家 😀",
        "x".repeat(LONG_TEXT_LENGTH),
      ];
      for (const [index, text] of texts.entries()) {
        await world.aNote({
          designId: kitchen,
          author: staff,
          text,
          createdAt: instantAt(index),
        });
      }

      const notes = await world.store.exportNotes(owner, [kitchen]);

      expect(textsOf(notes.get(kitchen))).toEqual([...texts].reverse());
    });

    it("holds nothing but the text and the instant of a note and the notes and the mark of a kitchen: no id, author, e-mail or name", async () => {
      const world = await newWorld();
      const owner = await world.aClient();
      const staff = await world.aStaffWriter();
      const kitchen = await world.aKitchen({ accountId: owner });
      const noteId = await world.aNote({
        designId: kitchen,
        author: staff,
        text: "a note",
        createdAt: instantAt(1),
      });

      const notes = await world.store.exportNotes(owner, [kitchen]);

      const entry = notes.get(kitchen);
      expect(Object.keys(entry ?? {}).sort()).toEqual(["isTruncated", "notes"]);
      expect(Object.keys(entry?.notes[0] ?? {}).sort()).toEqual([
        "createdAt",
        "text",
      ]);
      const everything = JSON.stringify([...notes]);
      for (const forbidden of [
        staff.accountId,
        staff.email,
        staff.name,
        noteId,
      ]) {
        expect(everything).not.toContain(forbidden);
      }
    });

    it("reads the notes of a hidden kitchen and not those of a kitchen the client deleted", async () => {
      const world = await newWorld();
      const owner = await world.aClient();
      const staff = await world.aStaffWriter();
      const listed = await world.aKitchen({ accountId: owner });
      const hidden = await world.aKitchen({ accountId: owner, isHidden: true });
      const deleted = await world.aKitchen({
        accountId: owner,
        isDeletedByClient: true,
      });
      for (const [index, designId] of [listed, hidden, deleted].entries()) {
        await world.aNote({
          designId,
          author: staff,
          text: `note ${String(index)}`,
          createdAt: instantAt(index),
        });
      }

      const notes = await world.store.exportNotes(owner, [
        listed,
        hidden,
        deleted,
      ]);

      expect([...notes.keys()].sort()).toEqual([listed, hidden].sort());
      expect(textsOf(notes.get(hidden))).toEqual(["note 1"]);
    });

    it("reads nothing of another account's kitchen, however it is asked for, and nothing of a kitchen not asked for", async () => {
      const world = await newWorld();
      const owner = await world.aClient();
      const stranger = await world.aClient();
      const staff = await world.aStaffWriter();
      const mine = await world.aKitchen({ accountId: owner });
      const mineNotAsked = await world.aKitchen({ accountId: owner });
      const theirs = await world.aKitchen({ accountId: stranger });
      for (const designId of [mine, mineNotAsked, theirs]) {
        await world.aNote({
          designId,
          author: staff,
          text: `on ${designId}`,
          createdAt: instantAt(1),
        });
      }

      const notes = await world.store.exportNotes(owner, [
        mine,
        theirs,
        UNKNOWN_KITCHEN,
      ]);

      expect([...notes.keys()]).toEqual([mine]);
      expect(JSON.stringify([...notes])).not.toContain(theirs);
    });

    it("leaves a kitchen without a note out of the answer, and answers an empty list with an empty answer", async () => {
      const world = await newWorld();
      const owner = await world.aClient();
      const bare = await world.aKitchen({ accountId: owner });

      expect((await world.store.exportNotes(owner, [bare])).size).toBe(0);
      expect((await world.store.exportNotes(owner, [])).size).toBe(0);
    });

    it("reads a kitchen once, however many times it is asked for", async () => {
      const world = await newWorld();
      const owner = await world.aClient();
      const staff = await world.aStaffWriter();
      const kitchen = await world.aKitchen({ accountId: owner });
      await world.someNotes({
        designId: kitchen,
        author: staff,
        count: 2,
        firstAt: instantAt(0),
      });

      const notes = await world.store.exportNotes(owner, [kitchen, kitchen]);

      expect(textsOf(notes.get(kitchen))).toEqual(["note 1", "note 0"]);
    });

    it("carries a kitchen's newest MAX_EXPORTED_NOTES_PER_KITCHEN notes unmarked at the bound, and marks the kitchen one past it", async () => {
      const world = await newWorld();
      const owner = await world.aClient();
      const staff = await world.aStaffWriter();
      const atBound = await world.aKitchen({ accountId: owner });
      const pastBound = await world.aKitchen({ accountId: owner });
      await world.someNotes({
        designId: atBound,
        author: staff,
        count: MAX_EXPORTED_NOTES_PER_KITCHEN,
        firstAt: instantAt(0),
      });
      await world.someNotes({
        designId: pastBound,
        author: staff,
        count: MAX_EXPORTED_NOTES_PER_KITCHEN + 1,
        firstAt: instantAt(0),
      });

      const notes = await world.store.exportNotes(owner, [atBound, pastBound]);

      expect(notes.get(atBound)?.notes).toHaveLength(
        MAX_EXPORTED_NOTES_PER_KITCHEN,
      );
      expect(notes.get(atBound)?.isTruncated).toBe(false);
      expect(notes.get(pastBound)?.notes).toHaveLength(
        MAX_EXPORTED_NOTES_PER_KITCHEN,
      );
      expect(notes.get(pastBound)?.isTruncated).toBe(true);
      expect(textsOf(notes.get(pastBound))).not.toContain("note 0");
      expect(textsOf(notes.get(pastBound))[0]).toBe(
        `note ${String(MAX_EXPORTED_NOTES_PER_KITCHEN)}`,
      );
    });

    describe("the bound on the whole export", () => {
      async function fullKitchens(
        world: NotesWorld,
        owner: string,
        staff: StaffWriter,
      ): Promise<DesignId[]> {
        const kitchens: DesignId[] = [];
        for (let index = 0; index < FULL_KITCHENS; index += 1) {
          const designId = await world.aKitchen({ accountId: owner });
          await world.someNotes({
            designId,
            author: staff,
            count: MAX_EXPORTED_NOTES_PER_KITCHEN,
            firstAt: instantAt(1000 + index * 1000),
          });
          kitchens.push(designId);
        }
        return kitchens;
      }

      function totalOf(
        notes: ReadonlyMap<DesignId, ExportedKitchenNotes>,
      ): number {
        return [...notes.values()].reduce(
          (sum, { notes: held }) => sum + held.length,
          0,
        );
      }

      it(
        "carries exactly MAX_EXPORTED_NOTES_IN_TOTAL notes with no kitchen marked",
        async () => {
          const world = await newWorld();
          const owner = await world.aClient();
          const staff = await world.aStaffWriter();
          const kitchens = await fullKitchens(world, owner, staff);

          const notes = await world.store.exportNotes(owner, kitchens);

          expect(totalOf(notes)).toBe(MAX_EXPORTED_NOTES_IN_TOTAL);
          expect(
            [...notes.values()].some(({ isTruncated }) => isTruncated),
          ).toBe(false);
        },
        LIVE_TEST_TIMEOUT_MS,
      );

      it(
        "withholds the oldest note past it and marks only the kitchen it belongs to, even when that kitchen keeps none",
        async () => {
          const world = await newWorld();
          const owner = await world.aClient();
          const staff = await world.aStaffWriter();
          const kitchens = await fullKitchens(world, owner, staff);
          const olderThanAll = await world.aKitchen({ accountId: owner });
          await world.aNote({
            designId: olderThanAll,
            author: staff,
            text: "the oldest of all",
            createdAt: instantAt(1),
          });

          const notes = await world.store.exportNotes(owner, [
            ...kitchens,
            olderThanAll,
          ]);

          expect(totalOf(notes)).toBe(MAX_EXPORTED_NOTES_IN_TOTAL);
          expect(notes.get(olderThanAll)).toEqual({
            notes: [],
            isTruncated: true,
          });
          expect(kitchens.filter((id) => notes.get(id)?.isTruncated)).toEqual(
            [],
          );
        },
        LIVE_TEST_TIMEOUT_MS,
      );

      it(
        "withholds a newer kitchen's older notes first: the newest notes of the whole export are the ones carried",
        async () => {
          const world = await newWorld();
          const owner = await world.aClient();
          const staff = await world.aStaffWriter();
          const kitchens = await fullKitchens(world, owner, staff);
          const newestOfAll = await world.aKitchen({ accountId: owner });
          await world.aNote({
            designId: newestOfAll,
            author: staff,
            text: "the newest of all",
            createdAt: instantAt(1_000_000),
          });

          const notes = await world.store.exportNotes(owner, [
            ...kitchens,
            newestOfAll,
          ]);

          const [oldestKitchen] = kitchens;
          expect(notes.get(newestOfAll)).toEqual({
            notes: [
              { text: "the newest of all", createdAt: instantAt(1_000_000) },
            ],
            isTruncated: false,
          });
          expect(notes.get(oldestKitchen ?? "")?.notes).toHaveLength(
            MAX_EXPORTED_NOTES_PER_KITCHEN - 1,
          );
          expect(notes.get(oldestKitchen ?? "")?.isTruncated).toBe(true);
          expect(textsOf(notes.get(oldestKitchen ?? ""))).not.toContain(
            "note 0",
          );
          expect(totalOf(notes)).toBe(MAX_EXPORTED_NOTES_IN_TOTAL);
        },
        LIVE_TEST_TIMEOUT_MS,
      );

      it(
        "ships the full MAX_EXPORTED_NOTES_IN_TOTAL real notes from kitchens that each hold more than the per-kitchen cap, none lost to a marker row",
        async () => {
          const world = await newWorld();
          const owner = await world.aClient();
          const staff = await world.aStaffWriter();
          const kitchens: DesignId[] = [];
          for (let index = 0; index < 25; index += 1) {
            const designId = await world.aKitchen({ accountId: owner });
            await world.someNotes({
              designId,
              author: staff,
              count: 150,
              firstAt: instantAt(1000 + index * 1000),
            });
            kitchens.push(designId);
          }

          const notes = await world.store.exportNotes(owner, kitchens);

          expect(totalOf(notes)).toBe(MAX_EXPORTED_NOTES_IN_TOTAL);
          for (const designId of kitchens) {
            expect(notes.get(designId)?.notes.length).toBeLessThanOrEqual(
              MAX_EXPORTED_NOTES_PER_KITCHEN,
            );
            expect(notes.get(designId)?.isTruncated).toBe(true);
          }
        },
        LIVE_TEST_TIMEOUT_MS,
      );

      describe("the byte budget", () => {
        const BIG_NOTE = "x".repeat(2000);
        const BIG_NOTES_IN_BUDGET = 524;
        const SMALL_NOTE_FITS =
          MAX_EXPORTED_NOTE_BYTES - BIG_NOTES_IN_BUDGET * BIG_NOTE.length;

        /** 524 big notes of 2000 bytes over six kitchens, then one oldest note of `lastNoteBytes` bytes in a seventh. */
        async function budgetWorld(lastNoteBytes: number) {
          const world = await newWorld();
          const owner = await world.aClient();
          const staff = await world.aStaffWriter();
          const kitchens: DesignId[] = [];
          for (const [index, count] of [
            100, 100, 100, 100, 100, 24,
          ].entries()) {
            const designId = await world.aKitchen({ accountId: owner });
            await world.someNotes({
              designId,
              author: staff,
              count,
              text: BIG_NOTE,
              firstAt: instantAt(10_000 + index * 1000),
            });
            kitchens.push(designId);
          }
          const oldest = await world.aKitchen({ accountId: owner });
          await world.aNote({
            designId: oldest,
            author: staff,
            text: "y".repeat(lastNoteBytes),
            createdAt: instantAt(1),
          });
          const notes = await world.store.exportNotes(owner, [
            ...kitchens,
            oldest,
          ]);
          return { notes, kitchens, oldest };
        }

        function bytesOf(
          notes: ReadonlyMap<DesignId, ExportedKitchenNotes>,
        ): number {
          return [...notes.values()]
            .flatMap(({ notes: held }) => held)
            .reduce(
              (sum, { text }) => sum + new TextEncoder().encode(text).length,
              0,
            );
        }

        it(
          "carries notes that add up to exactly MAX_EXPORTED_NOTE_BYTES, with no kitchen marked",
          async () => {
            const { notes, kitchens, oldest } =
              await budgetWorld(SMALL_NOTE_FITS);

            expect(bytesOf(notes)).toBe(MAX_EXPORTED_NOTE_BYTES);
            expect(notes.get(oldest)).toMatchObject({ isTruncated: false });
            expect(notes.get(oldest)?.notes).toHaveLength(1);
            expect(kitchens.filter((id) => notes.get(id)?.isTruncated)).toEqual(
              [],
            );
          },
          LIVE_TEST_TIMEOUT_MS,
        );

        it(
          "withholds the oldest note one byte past it, and marks that kitchen alone",
          async () => {
            const { notes, kitchens, oldest } = await budgetWorld(
              SMALL_NOTE_FITS + 1,
            );

            expect(bytesOf(notes)).toBe(BIG_NOTES_IN_BUDGET * BIG_NOTE.length);
            expect(notes.get(oldest)).toEqual({ notes: [], isTruncated: true });
            expect(kitchens.filter((id) => notes.get(id)?.isTruncated)).toEqual(
              [],
            );
          },
          LIVE_TEST_TIMEOUT_MS,
        );

        it(
          "keeps a pathological history under the budget: 100 notes of 2000 four-byte characters in each of 4 kitchens",
          async () => {
            const world = await newWorld();
            const owner = await world.aClient();
            const staff = await world.aStaffWriter();
            const hugeNote = "\u{1F600}".repeat(2000);
            const kitchens: DesignId[] = [];
            for (let index = 0; index < 4; index += 1) {
              const designId = await world.aKitchen({ accountId: owner });
              await world.someNotes({
                designId,
                author: staff,
                count: MAX_EXPORTED_NOTES_PER_KITCHEN,
                text: hugeNote,
                firstAt: instantAt(10_000 + index * 1000),
              });
              kitchens.push(designId);
            }

            const notes = await world.store.exportNotes(owner, kitchens);

            const hugeBytes = new TextEncoder().encode(hugeNote).length;
            expect(hugeBytes).toBe(8000);
            expect(bytesOf(notes)).toBe(
              Math.floor(MAX_EXPORTED_NOTE_BYTES / hugeBytes) * hugeBytes,
            );
            expect(kitchens.map((id) => notes.get(id)?.isTruncated)).toEqual([
              true,
              true,
              true,
              false,
            ]);
          },
          LIVE_TEST_TIMEOUT_MS,
        );

        it(
          "withholds a small old note behind a large newer one that was withheld: the running sum never lets it slip past",
          async () => {
            const world = await newWorld();
            const owner = await world.aClient();
            const staff = await world.aStaffWriter();
            const filler = await world.aKitchen({ accountId: owner });
            await world.someNotes({
              designId: filler,
              author: staff,
              count: MAX_EXPORTED_NOTES_PER_KITCHEN,
              text: "\u{1F600}".repeat(LONG_TEXT_LENGTH),
              firstAt: instantAt(10_000),
            });
            const refill = await world.aKitchen({ accountId: owner });
            await world.someNotes({
              designId: refill,
              author: staff,
              count: 32,
              text: "\u{1F600}".repeat(LONG_TEXT_LENGTH),
              firstAt: instantAt(5000),
            });
            const tiny = await world.aKitchen({ accountId: owner });
            await world.aNote({
              designId: tiny,
              author: staff,
              text: "tiny",
              createdAt: instantAt(1),
            });

            const notes = await world.store.exportNotes(owner, [
              filler,
              refill,
              tiny,
            ]);

            expect(notes.get(tiny)).toEqual({ notes: [], isTruncated: true });
            expect(notes.get(refill)?.isTruncated).toBe(true);
          },
          LIVE_TEST_TIMEOUT_MS,
        );
      });
    });

    it("refuses a malformed account id, a malformed kitchen id and more than MAX_EXPORTED_KITCHENS ids, answering none of them", async () => {
      const world = await newWorld();
      const owner = await world.aClient();
      const tooMany = Array.from(
        { length: MAX_EXPORTED_KITCHENS + 1 },
        (_, index) => `kitchen-${String(index)}`,
      );

      for (const call of [
        () => world.store.exportNotes("short", []),
        () => world.store.exportNotes(owner, ["has a space"]),
        () => world.store.exportNotes(owner, [""]),
        () => world.store.exportNotes(owner, tooMany),
      ]) {
        expect(await rejectionOf(call())).toBeInstanceOf(Error);
      }
    });

    it(
      "holds, over random ownership, hiding, deletion, asking and note counts, exactly the notes of the asked kitchens the account owns and has not deleted",
      async () => {
        const kitchenLayout = fc.record({
          isMine: fc.boolean(),
          isHidden: fc.boolean(),
          isDeleted: fc.boolean(),
          isAsked: fc.boolean(),
          noteCount: fc.integer({ min: 0, max: 2 }),
        });
        await fc.assert(
          fc.asyncProperty(
            fc.array(kitchenLayout, { maxLength: 5 }),
            async (layouts) => {
              const world = await newWorld();
              const me = await world.aClient();
              const someoneElse = await world.aClient();
              const staff = await world.aStaffWriter();
              const asked: DesignId[] = [];
              const expected = new Map<DesignId, string[]>();
              for (const [index, layout] of layouts.entries()) {
                const designId = await world.aKitchen({
                  accountId: layout.isMine ? me : someoneElse,
                  isHidden: layout.isHidden,
                  isDeletedByClient: layout.isDeleted,
                });
                const texts = Array.from(
                  { length: layout.noteCount },
                  (_, noteIndex) =>
                    `kitchen ${String(index)} note ${String(noteIndex)}`,
                );
                for (const [noteIndex, text] of texts.entries()) {
                  await world.aNote({
                    designId,
                    author: staff,
                    text,
                    createdAt: instantAt(noteIndex),
                  });
                }
                if (layout.isAsked) asked.push(designId);
                const isExported =
                  layout.isMine &&
                  !layout.isDeleted &&
                  layout.isAsked &&
                  texts.length > 0;
                if (isExported) expected.set(designId, [...texts].reverse());
              }

              const notes = await world.store.exportNotes(me, asked);

              expect(
                new Map([...notes].map(([id, held]) => [id, textsOf(held)])),
              ).toEqual(expected);
              expect(
                [...notes.values()].some(({ isTruncated }) => isTruncated),
              ).toBe(false);
            },
          ),
          { numRuns: propertyRuns },
        );
      },
      LIVE_TEST_TIMEOUT_MS,
    );
  });
}
