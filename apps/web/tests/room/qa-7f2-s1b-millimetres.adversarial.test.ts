// Adversarial QA for wave 7F2 slice S1b (ADR 0126): Step 1's lengths are typed in whole millimetres
// and the URL keeps its metre wire form. The implementer's suites sweep the approved range and the
// grammar; this file attacks the seams around them:
//
// - **an old link means exactly what it meant** — every metre spelling a link written before S1b can
//   carry, pinned to the millimetres HEAD `731a338` read it as (measured by running that commit's
//   `roomDraftFromQuery` beside this tree's, over the test suite's own URL literals plus generated
//   spellings: 0 differences);
// - **the round trip never loses a millimetre outside the policy either** — 1 mm, the 999/1000/1001
//   transition, 9 000 001 and the largest safe integer, in every field a U asks for;
// - **a paste that is not whole millimetres is refused and kept**, never stripped into another room;
// - **no metre unit survives on a customer-visible room leaf, and no display path is left on metres.**
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { fc } from "@fast-check/vitest";
import { APPROVED_ROOM_POLICY } from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { metresTextForUrl } from "@/room/metres-text";
import {
  createRoomDraft,
  withEnteredText,
  type RoomDraft,
  type RoomLengthField,
} from "@/room/room-draft";
import { deriveRoomIssueView } from "@/room/room-issue-model";
import {
  canonicalRoomQuery,
  queryEntriesOf,
  roomDraftFromQuery,
} from "@/room/room-query-sync";
import {
  parseRoomUrlState,
  requiredFieldsFor,
  type RoomSearchParams,
} from "@/room/room-url-state";

import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";

const SWEEP_RUNS = 1000;

/** Nine kilometres: past every bound a room can have, the ceiling the plan's own probe swept to. */
const NINE_KILOMETRES_MM = 9_000_000;

/** A U asks for every length field there is, so it is the shape that reaches wall C. */
const EVERY_U_FIELD: readonly RoomLengthField[] = requiredFieldsFor("U");

/** A value refused on the wire is no length at all: the field stays empty after the refill. */
const REFUSED = undefined;

/**
 * Old-link spellings of wall A and the millimetres HEAD `731a338` read each as — measured, not
 * derived: the same `roomDraftFromQuery` call run at that commit in a scratch copy. A link keeps its
 * meaning when this tree refills exactly those millimetres; `REFUSED` rows must stay refused, because
 * a link that newly read would be a room nobody wrote.
 */
const OLD_LINK_READINGS: readonly (readonly [string, number | undefined])[] = [
  ["4", 4000],
  ["04", 4000],
  ["4.0", 4000],
  ["4,0", 4000],
  ["4.000", 4000],
  ["004.5", 4500],
  ["3,6", 3600],
  ["3,60", 3600],
  ["3,600", 3600],
  ["3.600", 3600],
  ["3.6000", 3600],
  ["2.70", 2700],
  ["2,7", 2700],
  ["03.56", 3560],
  ["0.001", 1],
  ["0,001", 1],
  ["9000", NINE_KILOMETRES_MM],
  ["9000.000", NINE_KILOMETRES_MM],
  [" 3.56 ", 3560],
  ["\t2.7", 2700],
  ["27.005", 27_005],
  ["9007199254740.991", Number.MAX_SAFE_INTEGER],
  ["4.", REFUSED],
  ["4,", REFUSED],
  ["1.0005", REFUSED],
  ["0.0005", REFUSED],
  ["٣.٥٦", REFUSED],
  ["+3.6", REFUSED],
  ["-3.6", REFUSED],
  ["3 560", REFUSED],
  ["1e3", REFUSED],
  ["0x10", REFUSED],
  [".5", REFUSED],
  [",5", REFUSED],
  ["3..5", REFUSED],
  ["0", REFUSED],
  ["0.000", REFUSED],
  ["9007199254740.992", REFUSED],
];

/** Paste-shaped text that is not whole millimetres. `"3,600"` and `"3.600"` are the sharpest: a
 *  filter that deleted non-digits would read them as the *right* room by coincidence, so only
 *  "kept verbatim and refused" tells refusal from stripping. */
const PASTES_THAT_ARE_NOT_MILLIMETRES = [
  "3 600",
  "3600 mm",
  "3600mm",
  "3,600",
  "3.600",
  "3,6",
  "3.6",
  "3600.0",
  "3 600",
  "３６００",
] as const;

function arrivedFrom(query: RoomSearchParams): RoomDraft {
  return roomDraftFromQuery("U", { shape: "U", ...query });
}

function typedInto(field: RoomLengthField, text: string): RoomDraft {
  return withEnteredText(createRoomDraft("U"), { field, text });
}

/** The typed draft carried to the wire and read back, as a reload or a traversal would. */
function reloadedFrom(draft: RoomDraft): RoomDraft {
  const wire = canonicalRoomQuery(draft).toString();
  return roomDraftFromQuery(draft.shape, queryEntriesOf(wire));
}

function unreadableFieldsIn(draft: RoomDraft): readonly RoomLengthField[] {
  return deriveRoomIssueView({
    draft,
    draftState: parseRoomUrlState(
      queryEntriesOf(canonicalRoomQuery(draft).toString()),
    ),
    policy: APPROVED_ROOM_POLICY,
  }).unreadableFields;
}

/** A metre spelling of `mm` a link could carry: dot or comma, whole metres behind up to two zeros,
 *  and the three millimetre digits with their trailing zeros dropped or padded up to three more. */
function oldWireSpelling(): fc.Arbitrary<{ mm: number; spelling: string }> {
  return fc
    .record({
      mm: fc.integer({ min: 1, max: NINE_KILOMETRES_MM }),
      separator: fc.constantFrom(".", ","),
      leadingZeros: fc.integer({ min: 0, max: 2 }),
      paddingZeros: fc.integer({ min: 0, max: 3 }),
      isTrimmed: fc.boolean(),
    })
    .map(({ mm, separator, leadingZeros, paddingZeros, isTrimmed }) => {
      const wholeMetres = String(Math.floor(mm / 1000));
      const millimetreDigits = String(mm % 1000).padStart(3, "0");
      const decimals =
        (isTrimmed ? millimetreDigits.replace(/0+$/, "") : millimetreDigits) +
        "0".repeat(paddingZeros);
      const fraction = decimals === "" ? "" : `${separator}${decimals}`;
      return {
        mm,
        spelling: `${"0".repeat(leadingZeros)}${wholeMetres}${fraction}`,
      };
    });
}

describe("a link written before S1b refills the millimetres it always meant (task 1)", () => {
  it.each(OLD_LINK_READINGS)(
    "reads wallA=%j as HEAD 731a338 read it (%s mm)",
    (spelling, mmAtHead) => {
      const refilled = arrivedFrom({ wallA: spelling }).lengths.wallA;

      expect(refilled.millimetres).toBe(mmAtHead);
      expect(refilled.text).toBe(mmAtHead === REFUSED ? "" : String(mmAtHead));
    },
  );

  it("refills every metre spelling of every length as its digits, in every U field", () => {
    fc.assert(
      fc.property(
        oldWireSpelling(),
        fc.constantFrom(...EVERY_U_FIELD),
        ({ mm, spelling }, field) => {
          const refilled = arrivedFrom({ [field]: spelling }).lengths[field];

          expect(refilled).toEqual({ text: String(mm), millimetres: mm });
        },
      ),
      { numRuns: SWEEP_RUNS },
    );
  });

  it("puts an old link's room back on the wire in the canonical metres, not in millimetres", () => {
    const arrived = arrivedFrom({
      wallA: "4",
      wallB: "2,4",
      wallC: "2.180",
      height: "2.70",
      direction: "left",
    });

    // No `direction` for a U (M7B U5 S1, Q-U4 (b)): it has one hand.
    expect(canonicalRoomQuery(arrived).toString()).toBe(
      "shape=U&wallA=4&wallB=2.4&wallC=2.18&height=2.7",
    );
  });
});

describe("the round trip never loses a millimetre, inside the policy or out of it (task 2)", () => {
  it.each([
    1,
    9,
    10,
    99,
    100,
    999,
    1000,
    1001,
    3605,
    9999,
    10_001,
    NINE_KILOMETRES_MM,
    NINE_KILOMETRES_MM + 1,
    Number.MAX_SAFE_INTEGER,
  ])("refills a typed %i mm as the digits typed, in every U field", (mm) => {
    for (const field of EVERY_U_FIELD) {
      const typed = typedInto(field, String(mm));

      expect(canonicalRoomQuery(typed).get(field)).toBe(metresTextForUrl(mm));
      expect(reloadedFrom(typed).lengths[field]).toEqual({
        text: String(mm),
        millimetres: mm,
      });
    }
  });

  it("refills any positive safe integer exactly, past the nine kilometres the plan swept", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: Number.MAX_SAFE_INTEGER }),
        fc.constantFrom(...EVERY_U_FIELD),
        (mm, field) => {
          expect(
            reloadedFrom(typedInto(field, String(mm))).lengths[field].text,
          ).toBe(String(mm));
        },
      ),
      { numRuns: SWEEP_RUNS },
    );
  });

  it("keeps a typed leading zero in the field, and drops it only through the URL", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: NINE_KILOMETRES_MM }),
        fc.integer({ min: 1, max: 4 }),
        fc.constantFrom(...EVERY_U_FIELD),
        (mm, zeroCount, field) => {
          const text = `${"0".repeat(zeroCount)}${String(mm)}`;
          const typed = typedInto(field, text);

          expect(typed.lengths[field]).toEqual({ text, millimetres: mm });
          expect(canonicalRoomQuery(typed).toString()).toBe(
            canonicalRoomQuery(typedInto(field, String(mm))).toString(),
          );
          expect(reloadedFrom(typed).lengths[field].text).toBe(String(mm));
        },
      ),
      { numRuns: SWEEP_RUNS },
    );
  });

  it("settles after one trip: a refilled room writes the query it was refilled from", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: NINE_KILOMETRES_MM }), {
          minLength: EVERY_U_FIELD.length,
          maxLength: EVERY_U_FIELD.length,
        }),
        (lengths) => {
          const typed = EVERY_U_FIELD.reduce(
            (draft, field, index) =>
              withEnteredText(draft, { field, text: String(lengths[index]) }),
            createRoomDraft("U"),
          );
          const once = reloadedFrom(typed);

          expect(canonicalRoomQuery(reloadedFrom(once)).toString()).toBe(
            canonicalRoomQuery(typed).toString(),
          );
          expect(
            EVERY_U_FIELD.map((field) => once.lengths[field].text),
          ).toEqual(lengths.map(String));
        },
      ),
      { numRuns: SWEEP_RUNS },
    );
  });
});

describe("a paste that is not whole millimetres is refused and kept, never stripped (task 4)", () => {
  it.each(PASTES_THAT_ARE_NOT_MILLIMETRES)(
    "keeps %j verbatim, reads no length, writes nothing, and calls it unreadable",
    (pasted) => {
      for (const field of EVERY_U_FIELD) {
        const typed = typedInto(field, pasted);

        expect(typed.lengths[field]).toEqual({
          text: pasted,
          millimetres: undefined,
        });
        expect(canonicalRoomQuery(typed).has(field)).toBe(false);
        expect(unreadableFieldsIn(typed)).toEqual([field]);
      }
    },
  );

  it.each(["3", "36", "99999", "03600"])(
    "does not call a readable value %j unreadable, however far out of range",
    (text) => {
      expect(unreadableFieldsIn(typedInto("wallA", text))).toEqual([]);
    },
  );

  it.each(["", "   "])("does not call an empty field %j unreadable", (text) => {
    expect(unreadableFieldsIn(typedInto("wallA", text))).toEqual([]);
  });
});

/** A standalone metre unit — *m* or *м* not part of a longer word (*mm*, *мм*, *milimetri* pass). */
const STANDALONE_METRE_UNIT = /(?<![\p{L}])(?:m|м)(?![\p{L}])/u;

/** A decimal comma between two digits: the metre display S1b retired. */
const DECIMAL_COMMA = /\d,\d/;

function leavesOf(node: unknown, path: string): readonly [string, string][] {
  if (typeof node === "string") return [[path, node]];
  if (typeof node !== "object" || node === null) return [];
  return Object.entries(node).flatMap(([key, child]) =>
    leavesOf(child, `${path}.${key}`),
  );
}

describe("no room leaf and no room module still shows metres (task 3)", () => {
  it.each([
    ["ro", roMessages],
    ["ru", ruMessages],
  ] as const)(
    "keeps every room.* leaf in %s free of a metre unit and a decimal comma",
    (_locale, messages) => {
      const offending = leavesOf(messages.room, "room").filter(
        ([, text]) =>
          STANDALONE_METRE_UNIT.test(text) ||
          DECIMAL_COMMA.test(text) ||
          text.includes("{metres"),
      );

      expect(offending).toEqual([]);
    },
  );

  it("names the metre formatter nowhere under src, and keeps the wire's formatter on the URL modules", () => {
    const directory = resolve(import.meta.dirname, "../../src/room");
    const sources = readdirSync(directory)
      .filter((entry) => /\.tsx?$/.test(entry))
      .map((entry) => ({
        entry,
        source: readFileSync(resolve(directory, entry), "utf8"),
      }));

    const namingTheDisplayFormatter = sources
      .filter(({ source }) => /formatMetresForDisplay|unitMetres/.test(source))
      .map(({ entry }) => entry);
    const callingTheWireFormatter = sources
      .filter(({ source }) => source.includes("metresTextForUrl("))
      .map(({ entry }) => entry);

    expect(namingTheDisplayFormatter).toEqual([]);
    expect(callingTheWireFormatter.sort()).toEqual([
      "metres-text.ts",
      "room-query-sync.ts",
      "room-url-state.ts",
    ]);
  });
});
