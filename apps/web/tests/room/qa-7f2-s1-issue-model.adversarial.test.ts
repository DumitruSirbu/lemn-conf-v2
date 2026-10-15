// **Adversarial QA — wave 7F2 slice S1, the room issue model and its copy.**
//
// The developer's `room-issue-model.test.ts` samples 100 rooms per arm. Criterion 1 is stated on a 1 mm
// grid, so this file sweeps it **exhaustively** where that is affordable — the whole approved-and-beyond
// rectangle at 10 mm, and every transition band at 1 mm on one axis — and takes its expected side from
// `validateRoomInput` called **directly on the millimetres**, not through the URL parser the model reads.
// The model and the domain must agree on every room, and the census must reproduce the plan's measured
// table (7F2 plan, *What the tree does today*), which nobody in this wave computed from the model.
//
// It also pins the §5 copy **literally in both locales** — the Russian is held by nothing else, the gap
// 7D5b found — classifies unreadable text against the parser's own acceptance rules, and fuzzes real
// query strings through `room-url-state` to look for a draft that makes the model throw.
//
// **Amended by wave 7F2 S1b (ADR 0126).** The fields take whole millimetres, so typed lengths below are
// digit strings, and S1's claim *"unreadable is exactly the text the URL parser refuses"* is false by
// design now: unreadable is the text the **field's** parser, `parseMillimetres`, refuses. The URL keeps
// its metres, so every query literal here is unchanged.
import { fc } from "@fast-check/vitest";
import {
  APPROVED_ROOM_POLICY,
  isShapeBuildable,
  validateRoomInput,
  type CornerDirection,
  type RoomIssue,
  type RoomPolicy,
  type RoomShape,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { metresTextForUrl } from "@/room/metres-text";
import { parseMillimetres } from "@/room/parse-millimetres";
import {
  createRoomDraft,
  withCornerDirection,
  withEnteredText,
  type RoomDraft,
  type RoomLengthField,
} from "@/room/room-draft";
import {
  deriveRoomIssueView,
  type RoomIssueView,
} from "@/room/room-issue-model";
import {
  canonicalRoomQuery,
  queryEntriesOf,
  roomDraftFromQuery,
} from "@/room/room-query-sync";
import {
  parseRoomUrlState,
  requiredFieldsFor,
  type RoomSearchParams,
  type RoomUrlState,
} from "@/room/room-url-state";

import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";
import { requireLeafAt, type Catalogue } from "../support/catalogues";

const SWEEP_TIMEOUT_MS = 180_000;

/** The sweep's outer range, criterion 1: past both ends of every approved bound. */
const SWEPT_WALL_MM = { min: 100, max: 7000 } as const;
const SWEPT_CEILING_MM = { min: 1000, max: 5000 } as const;
const COARSE_STEP_MM = 10;

/** The plan's census ceiling (*"L rooms, walls 100–7000 mm at 10 mm, ceiling 2600"*). */
const CENSUS_CEILING_MM = 2600;

const DIRECTIONS: readonly CornerDirection[] = ["left", "right"];
const ROOM_SHAPES: readonly RoomShape[] = ["linear", "L", "U"];

// ---------------------------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------------------------

interface LRoomMm {
  readonly wallA: number;
  readonly wallB: number;
  readonly height: number;
}

function lDraft(room: LRoomMm, direction: CornerDirection): RoomDraft {
  const typed = (["wallA", "wallB", "height"] as const).reduce(
    (draft, field) =>
      withEnteredText(draft, { field, text: String(room[field]) }),
    createRoomDraft("L"),
  );
  return withCornerDirection(typed, direction);
}

function draftWithTexts(
  shape: RoomShape,
  texts: Partial<Record<RoomLengthField, string>>,
): RoomDraft {
  return Object.entries(texts).reduce(
    (draft, [field, text]) =>
      withEnteredText(draft, { field: field as RoomLengthField, text }),
    createRoomDraft(shape),
  );
}

/** What `room-screen.tsx`'s `roomInDraft` asks: the draft's own canonical query, parsed. */
function stateOfDraft(draft: RoomDraft): RoomUrlState {
  return parseRoomUrlState(
    queryEntriesOf(canonicalRoomQuery(draft).toString()),
  );
}

function viewOfDraft(draft: RoomDraft): RoomIssueView {
  return deriveRoomIssueView({
    draft,
    draftState: stateOfDraft(draft),
    policy: APPROVED_ROOM_POLICY,
  });
}

// ---------------------------------------------------------------------------------------------
// The independent oracle: the domain, asked directly with millimetres
// ---------------------------------------------------------------------------------------------

interface IssueSurface {
  readonly fieldReasons: readonly string[];
  readonly roomReasonKeys: readonly string[];
  readonly markedWalls: readonly string[];
  readonly isOneC: boolean;
}

/** The §5 table's key for each code, restated here rather than read from the model's exported
 *  `ROOM_ISSUE_MESSAGE_KEYS`: an oracle that imports the producer's table cannot catch a swap in it. */
const EXPECTED_KEY_OF_CODE: Readonly<Record<string, string>> = {
  SHAPE_NOT_BUILDABLE: "room.issue.shapeNotBuildable",
  ROOM_TOO_SMALL_FOR_KITCHEN: "room.issue.roomTooSmall",
  WALL_TOO_SHORT: "room.issue.wallTooShort",
  WALL_TOO_LONG: "room.issue.wallTooLong",
  HEIGHT_TOO_LOW: "room.issue.heightTooLow",
  HEIGHT_TOO_HIGH: "room.issue.heightTooHigh",
};

/** Frame 1C's plan label (*"B prea scurt"*) for each wall-length code. */
const EXPECTED_LABEL_OF_CODE: Readonly<Record<string, string>> = {
  WALL_TOO_SHORT: "room.planWallIssue.tooShort",
  WALL_TOO_LONG: "room.planWallIssue.tooLong",
};

const WALL_ID_OF_FIELD: Readonly<Record<string, string>> = {
  wallA: "A",
  wallB: "B",
  wallC: "C",
};

function domainIssuesFor(room: LRoomMm, direction: CornerDirection) {
  return validateRoomInput(
    {
      shape: "L",
      wallAMm: room.wallA,
      wallBMm: room.wallB,
      heightMm: room.height,
      cornerDirection: direction,
    },
    APPROVED_ROOM_POLICY,
  );
}

function entryOf(table: Readonly<Record<string, string>>, key: string): string {
  const entry = table[key];
  if (entry === undefined)
    throw new Error(`the oracle has no entry for ${key}`);
  return entry;
}

function expectedSurfaceOf(issues: readonly RoomIssue[]): IssueSurface {
  const onFields = issues.filter((issue) => issue.field !== "shape");
  const onWalls = onFields.filter(
    (issue) => WALL_ID_OF_FIELD[issue.field] !== undefined,
  );
  return {
    fieldReasons: onFields.map(
      (issue) => `${issue.field}:${entryOf(EXPECTED_KEY_OF_CODE, issue.code)}`,
    ),
    roomReasonKeys: issues
      .filter(
        (issue) =>
          issue.field === "shape" && issue.code !== "SHAPE_NOT_BUILDABLE",
      )
      .map((issue) => entryOf(EXPECTED_KEY_OF_CODE, issue.code)),
    markedWalls: onWalls.map(
      (issue) =>
        `${entryOf(WALL_ID_OF_FIELD, issue.field)}:${entryOf(EXPECTED_LABEL_OF_CODE, issue.code)}`,
    ),
    isOneC: issues.length > 0,
  };
}

function actualSurfaceOf(view: RoomIssueView): IssueSurface {
  return {
    fieldReasons: view.fieldReasons.map(
      (reason) => `${reason.field}:${reason.messageKey}`,
    ),
    roomReasonKeys: [...view.roomReasons],
    markedWalls: view.markedWalls.map(
      (marked) => `${marked.wall}:${marked.labelKey}`,
    ),
    isOneC: view.isNoteShown,
  };
}

/** One room, judged twice: by the domain from its millimetres, and by the model from a typed draft.
 *  Returns the census key so a sweep can compare its tally with the plan's measured table. */
function assertModelAgreesWithDomain(
  room: LRoomMm,
  direction: CornerDirection,
): string {
  const validation = domainIssuesFor(room, direction);
  const issues = validation.ok ? [] : validation.issues;
  const view = viewOfDraft(lDraft(room, direction));
  const actual = {
    surface: actualSurfaceOf(view),
    isLinearSuggested: view.isLinearSuggested,
    isShapeRefused: view.isShapeRefused,
    unreadableFields: view.unreadableFields,
  };
  const expected = {
    surface: expectedSurfaceOf(issues),
    // 7J S5: the straight kitchen's own bounds are in `APPROVED_ROOM_POLICY` now, so this is the
    // real domain's verdict on wall A and the height alone — never a hardcoded `false` — exactly
    // the same oracle `room-issue-model.test.ts`'s own restatement derives.
    isLinearSuggested:
      issues.length > 0 &&
      validateRoomInput(
        { shape: "linear", wallAMm: room.wallA, heightMm: room.height },
        APPROVED_ROOM_POLICY,
      ).ok,
    isShapeRefused: false,
    unreadableFields: [],
  };
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    // One expect per disagreement, not per room: 477 481 passing expects would dominate the sweep.
    expect({ room, direction, ...actual }).toEqual({
      room,
      direction,
      ...expected,
    });
  }
  return censusKeyOf(issues);
}

function censusKeyOf(issues: readonly RoomIssue[]): string {
  if (issues.length === 0) return "ok";
  return issues.map((issue) => `${issue.field}:${issue.code}`).join("+");
}

function tally(counts: Map<string, number>, key: string): void {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

function inclusiveRange(min: number, max: number, step = 1): number[] {
  const values: number[] = [];
  for (let value = min; value <= max; value += step) values.push(value);
  return values;
}

// ---------------------------------------------------------------------------------------------
// Task 1 — criterion 1, exhaustively
// ---------------------------------------------------------------------------------------------

describe("the model agrees with the domain on every L room of the swept rectangle", () => {
  it(
    "matches validateRoomInput on all 477 481 rooms at 10 mm and reproduces the plan's census",
    () => {
      const counts = new Map<string, number>();
      const wallValues = inclusiveRange(
        SWEPT_WALL_MM.min,
        SWEPT_WALL_MM.max,
        COARSE_STEP_MM,
      );

      for (const wallA of wallValues) {
        for (const wallB of wallValues) {
          const direction = DIRECTIONS[(wallA + wallB) % 2] ?? "left";
          const key = assertModelAgreesWithDomain(
            { wallA, wallB, height: CENSUS_CEILING_MM },
            direction,
          );
          tally(counts, key);
        }
      }

      // The plan's **[measured]** row, 7F2 plan *What the tree does today*: the independent tally.
      expect(Object.fromEntries(counts)).toEqual({
        ok: 245_211,
        "wallB:WALL_TOO_LONG": 51_100,
        "wallA:WALL_TOO_LONG": 50_100,
        "wallB:WALL_TOO_SHORT": 45_990,
        "wallA:WALL_TOO_SHORT": 40_080,
        "shape:ROOM_TOO_SMALL_FOR_KITCHEN": 10_800,
        "wallA:WALL_TOO_LONG+wallB:WALL_TOO_LONG": 10_000,
        "wallA:WALL_TOO_LONG+wallB:WALL_TOO_SHORT": 9_000,
        "wallA:WALL_TOO_SHORT+wallB:WALL_TOO_LONG": 8_000,
        "wallA:WALL_TOO_SHORT+wallB:WALL_TOO_SHORT": 7_200,
      });
    },
    SWEEP_TIMEOUT_MS,
  );

  /** Wall B values that sit on each side of every transition wall A's sweep can cross: the bounds
   *  (1000, 6000) and the minimum kitchen's thresholds on B (split at 1600, pair at 2200). */
  const WALL_B_PROBES = [
    500, 999, 1000, 1599, 1600, 2199, 2200, 4000, 6000, 6001,
  ];
  /** Wall A's twin: bounds 900 / 6000, split threshold 1500, pair threshold 2100. */
  const WALL_A_PROBES = [
    500, 899, 900, 1499, 1500, 2099, 2100, 4000, 6000, 6001,
  ];

  it.each(WALL_B_PROBES)(
    "matches the domain for every wall A from 100 to 7000 mm at 1 mm, with wall B at %i mm",
    (wallB) => {
      for (const wallA of inclusiveRange(
        SWEPT_WALL_MM.min,
        SWEPT_WALL_MM.max,
      )) {
        for (const direction of DIRECTIONS) {
          assertModelAgreesWithDomain(
            { wallA, wallB, height: 2500 },
            direction,
          );
        }
      }
    },
    SWEEP_TIMEOUT_MS,
  );

  it.each(WALL_A_PROBES)(
    "matches the domain for every wall B from 100 to 7000 mm at 1 mm, with wall A at %i mm",
    (wallA) => {
      for (const wallB of inclusiveRange(
        SWEPT_WALL_MM.min,
        SWEPT_WALL_MM.max,
      )) {
        for (const direction of DIRECTIONS) {
          assertModelAgreesWithDomain(
            { wallA, wallB, height: 2500 },
            direction,
          );
        }
      }
    },
    SWEEP_TIMEOUT_MS,
  );

  it.each([
    ["a roomy L", { wallA: 3000, wallB: 2400 }],
    ["an L too small for the kitchen", { wallA: 900, wallB: 1000 }],
    ["an L with wall B short", { wallA: 3600, wallB: 450 }],
    ["an L with both walls short", { wallA: 800, wallB: 800 }],
  ] as const)(
    "matches the domain for every ceiling from 1000 to 5000 mm at 1 mm on %s",
    (_, walls) => {
      for (const height of inclusiveRange(
        SWEPT_CEILING_MM.min,
        SWEPT_CEILING_MM.max,
      )) {
        assertModelAgreesWithDomain({ ...walls, height }, "left");
      }
    },
    SWEEP_TIMEOUT_MS,
  );

  it(
    "matches the domain across the minimum-kitchen corner at 1 mm in both walls (A 800–2200, B 900–2300)",
    () => {
      // The coupled rule has an L-shaped boundary (split at A 1500 / B 1600, pair at A 2100 / B 2200),
      // so one axis at a time can miss a corner of it. This window holds every point of that boundary.
      const counts = new Map<string, number>();
      for (const wallA of inclusiveRange(800, 2200)) {
        for (const wallB of inclusiveRange(900, 2300)) {
          tally(
            counts,
            assertModelAgreesWithDomain(
              { wallA, wallB, height: 2500 },
              "right",
            ),
          );
        }
      }

      expect(counts.get("shape:ROOM_TOO_SMALL_FOR_KITCHEN")).toBeGreaterThan(0);
      expect(counts.get("ok")).toBeGreaterThan(0);
    },
    SWEEP_TIMEOUT_MS,
  );
});

// ---------------------------------------------------------------------------------------------
// Task 2 — the copy, pinned literally in both locales
// ---------------------------------------------------------------------------------------------

/** The 7F2 plan's §5 table, **ADOPTED 2026-09-21 (Q-7F2-1 = (a))**, transcribed character for
 *  character. The Romanian is also held by the copy lock; the Russian is held by nothing but this. */
/* eslint-disable no-restricted-syntax -- 6B-j allow-list: the owner-approved §5 sentences quoted as the expected side of a verbatim pin against the plan. Reading them through the catalogue would make the pin agree with whatever the catalogue says, which is the tautology the pin exists to avoid. */
const APPROVED_SECTION_5_COPY: Readonly<
  Record<string, { readonly ro: string; readonly ru: string }>
> = {
  "room.issue.wallTooShort": {
    ro: "Lungimea aceasta e mai mică decât putem mobila. Mărește valoarea.",
    ru: "Эта длина меньше, чем мы можем обставить. Увеличь значение.",
  },
  "room.issue.wallTooLong": {
    ro: "Lungimea aceasta e mai mare decât putem mobila. Introdu doar porțiunea pe care vrei dulapuri.",
    ru: "Эта длина больше, чем мы можем обставить. Введи только ту часть, где нужны шкафы.",
  },
  "room.issue.heightTooLow": {
    ro: "La înălțimea aceasta nu încap dulapurile de sus. Verifică valoarea.",
    ru: "При такой высоте не помещаются верхние шкафы. Проверь значение.",
  },
  "room.issue.heightTooHigh": {
    ro: "Înălțimea aceasta e mai mare decât putem construi. Verifică valoarea.",
    ru: "Эта высота больше, чем мы можем построить. Проверь значение.",
  },
  "room.issue.roomTooSmall": {
    ro: "Cu lungimile acestea, după dulapul de colț nu mai rămâne loc pentru chiuvetă și plită. Mărește una dintre lungimi.",
    ru: "При таких длинах после углового шкафа не остаётся места для мойки и варочной панели. Увеличь одну из длин.",
  },
  "room.issue.shapeNotBuildable": {
    ro: "Pentru forma aceasta nu putem propune încă o bucătărie. Alege altă formă.",
    ru: "Для этой формы мы пока не можем предложить кухню. Выбери другую форму.",
  },
  "room.issue.orChooseLinear": {
    ro: "Sau alege o formă liniară.",
    ru: "Или выбери линейную форму.",
  },
  "room.planWallIssue.tooShort": {
    ro: "{wall} prea scurt",
    ru: "{wall} слишком короткая",
  },
  "room.planWallIssue.tooLong": {
    ro: "{wall} prea lung",
    ru: "{wall} слишком длинная",
  },
  "room.presetsAfterValid": {
    ro: "Presetele apar după ce toate valorile sunt valide.",
    ru: "Пресеты появятся, когда все значения будут верными.",
  },
  // Replaced by wave 7F2 S1b (owner, 2026-09-21; ADR 0126): the fields take whole millimetres.
  "room.issue.unreadable": {
    ro: "Scrie valoarea în milimetri, doar cu cifre.",
    ru: "Введи значение в миллиметрах, только цифрами.",
  },
};
/* eslint-enable no-restricted-syntax */

const SECTION_5_KEYS = Object.keys(APPROVED_SECTION_5_COPY);

const RO_CATALOGUE: Catalogue = roMessages;
const RU_CATALOGUE = ruMessages as Catalogue;

const COMMA_BELOW_S_AND_T = characterClassOf([0x0218, 0x0219, 0x021a, 0x021b]);
const CEDILLA_S_AND_T = characterClassOf([0x015e, 0x015f, 0x0162, 0x0163]);
const DIGIT = /\p{Nd}/u;
const CYRILLIC = /\p{Script=Cyrillic}/u;
const LATIN = /\p{Script=Latin}/u;
const WALL_PLACEHOLDER = /\{wall\}/gu;

/** Built from code points so this file names the letters without spelling them. */
function characterClassOf(codePoints: readonly number[]): RegExp {
  return new RegExp(`[${String.fromCodePoint(...codePoints)}]`, "u");
}

function withoutPlaceholder(leaf: string): string {
  return leaf.replace(WALL_PLACEHOLDER, "");
}

describe("the §5 copy ships exactly as the owner approved it", () => {
  it("holds all eleven §5 leaves and no twelfth under room.issue / room.planWallIssue", () => {
    const shipped = [
      ...Object.keys(roMessages.room.issue).map((key) => `room.issue.${key}`),
      ...Object.keys(roMessages.room.planWallIssue).map(
        (key) => `room.planWallIssue.${key}`,
      ),
      "room.presetsAfterValid",
    ];

    expect(shipped.sort()).toEqual([...SECTION_5_KEYS].sort());
  });

  it.each(SECTION_5_KEYS)(
    "ships the Romanian §5 text for %s verbatim",
    (key) => {
      expect(requireLeafAt(RO_CATALOGUE, key)).toBe(
        APPROVED_SECTION_5_COPY[key]?.ro,
      );
    },
  );

  it.each(SECTION_5_KEYS)(
    "ships the Russian §5 text for %s verbatim",
    (key) => {
      expect(requireLeafAt(RU_CATALOGUE, key)).toBe(
        APPROVED_SECTION_5_COPY[key]?.ru,
      );
    },
  );

  it.each(SECTION_5_KEYS)(
    "writes %s in NFC in both locales, so a decomposed letter cannot pass the eye",
    (key) => {
      for (const catalogue of [RO_CATALOGUE, RU_CATALOGUE]) {
        const leaf = requireLeafAt(catalogue, key);
        expect(leaf).toBe(leaf.normalize("NFC"));
      }
    },
  );

  it.each(SECTION_5_KEYS)(
    "spells s and t in %s with the comma below, never the cedilla",
    (key) => {
      expect(requireLeafAt(RO_CATALOGUE, key)).not.toMatch(CEDILLA_S_AND_T);
    },
  );

  it("actually exercises the comma-below letters, so the cedilla check is not vacuous", () => {
    const withCommaBelow = SECTION_5_KEYS.filter((key) =>
      COMMA_BELOW_S_AND_T.test(requireLeafAt(RO_CATALOGUE, key)),
    );

    expect(withCommaBelow).toEqual([
      "room.issue.wallTooShort",
      "room.issue.wallTooLong",
      "room.issue.heightTooLow",
      "room.issue.heightTooHigh",
      "room.issue.roomTooSmall",
    ]);
  });

  it.each(SECTION_5_KEYS)(
    "carries no digit in %s, in either locale's raw leaf",
    (key) => {
      expect(requireLeafAt(RO_CATALOGUE, key)).not.toMatch(DIGIT);
      expect(requireLeafAt(RU_CATALOGUE, key)).not.toMatch(DIGIT);
    },
  );

  it.each(SECTION_5_KEYS)(
    "keeps each locale in its own script in %s (no Latin look-alike in the Russian, no Cyrillic in the Romanian)",
    (key) => {
      expect(withoutPlaceholder(requireLeafAt(RU_CATALOGUE, key))).not.toMatch(
        LATIN,
      );
      expect(requireLeafAt(RO_CATALOGUE, key)).not.toMatch(CYRILLIC);
    },
  );

  it.each(SECTION_5_KEYS)(
    "carries no ICU argument in %s other than the plan label's {wall}",
    (key) => {
      for (const catalogue of [RO_CATALOGUE, RU_CATALOGUE]) {
        const arguments_ =
          requireLeafAt(catalogue, key).match(/\{[^}]*\}/gu) ?? [];
        const expected = key.startsWith("room.planWallIssue.")
          ? ["{wall}"]
          : [];
        expect(arguments_).toEqual(expected);
      }
    },
  );
});

// 7J S5, ADR 0108 Amendment G: `APPROVED_ROOM_POLICY` states the straight kitchen's own bounds now,
// so the suggestion's positive arm is live under the real policy — restated below from "is off for
// every shape, direction and typed text", which held while every straight room was refused.
describe("the linear suggestion is catalogued and shows exactly when the domain says so", () => {
  it("matches the real gate — a reason other than the shape's own, and wall A with the height validating as a straight room — for every shape, direction and typed text", () => {
    const anyText = fc.oneof(
      fc.constant(""),
      fc.string({ maxLength: 10 }),
      fc.integer({ min: 1, max: 20_000 }).map(String),
    );
    fc.assert(
      fc.property(
        fc.constantFrom(...ROOM_SHAPES),
        fc.record({
          wallA: anyText,
          wallB: anyText,
          wallC: anyText,
          height: anyText,
        }),
        fc.constantFrom(...DIRECTIONS),
        (shape, texts, direction) => {
          const draft = withCornerDirection(
            draftWithTexts(shape, texts),
            direction,
          );
          const state = stateOfDraft(draft);
          const expected =
            state.substate === "1C" &&
            state.issues.some(
              (issue) => issue.code !== "SHAPE_NOT_BUILDABLE",
            ) &&
            validateRoomInput(
              {
                shape: "linear",
                wallAMm: state.input.wallAMm,
                heightMm: state.input.heightMm,
              },
              APPROVED_ROOM_POLICY,
            ).ok;

          expect(viewOfDraft(draft).isLinearSuggested).toBe(expected);
        },
      ),
      { numRuns: 2000 },
    );
  });

  it("is off even for a filled straight room, which is the shape the suggestion names", () => {
    const draft = draftWithTexts("linear", {
      wallA: "3600",
      height: "2600",
    });

    expect(viewOfDraft(draft).isLinearSuggested).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
// Criterion 9's model arm, over every policy that states any subset of the shapes
// ---------------------------------------------------------------------------------------------

/** R8's fabricated policy (ADR 0116), generalised: the approved policy restricted to exactly
 *  `shapes`, each shape keeping the approved policy's own real bounds. Since M7B U6 S1 the U has
 *  bounds of its own, so nothing is borrowed and the cast to `BuildableShapes` (ADR 0116 A2, AC4) is
 *  gone: each stated shape is a spread of its own typed entry. */
function policyStating(shapes: readonly RoomShape[]): RoomPolicy {
  const approved = APPROVED_ROOM_POLICY.buildableShapes;
  return {
    ...APPROVED_ROOM_POLICY,
    buildableShapes: {
      ...(shapes.includes("L") && approved.L !== undefined
        ? { L: approved.L }
        : {}),
      ...(shapes.includes("linear") && approved.linear !== undefined
        ? { linear: approved.linear }
        : {}),
      ...(shapes.includes("U") && approved.U !== undefined
        ? { U: approved.U }
        : {}),
    },
  };
}

describe("the shape refusal follows whichever policy the screen is handed", () => {
  it("refuses a shape exactly when the handed policy does not build it, for every subset of shapes", () => {
    fc.assert(
      fc.property(
        fc.subarray([...ROOM_SHAPES]),
        fc.constantFrom(...ROOM_SHAPES),
        (stated, chosen) => {
          const policy = policyStating(stated);
          const draft = draftWithTexts(chosen, {
            wallA: "2200",
            wallB: "2000",
          });

          const view = deriveRoomIssueView({
            draft,
            draftState: stateOfDraft(draft),
            policy,
          });

          expect(view.isShapeRefused).toBe(!stated.includes(chosen));
          expect(view.isShapeRefused).toBe(!isShapeBuildable(chosen, policy));
        },
      ),
      { numRuns: 200 },
    );
  });
});

// ---------------------------------------------------------------------------------------------
// Task 3 — unreadable input, classified against the parser's own acceptance rules
// ---------------------------------------------------------------------------------------------

/** The parser's verdict on a text, asked **through the URL parser** with every other L field valid:
 *  the field is refused exactly when `parseRoomUrlState` marks it. */
function urlParserRefuses(
  field: "wallA" | "wallB" | "height",
  text: string,
): boolean {
  const query: RoomSearchParams = {
    shape: "L",
    wallA: "3,6",
    wallB: "2,4",
    height: "2,6",
    direction: "left",
    [field]: text,
  };
  const markedFields: readonly string[] = parseRoomUrlState(query).markedFields;
  return markedFields.includes(field);
}

function isBlank(text: string): boolean {
  return text.trim() === "";
}

/** Each text, and whether a length field holding it is unreadable. Since S1b (ADR 0126) a field reads
 *  whole millimetres, so every metre spelling — *"3.60"*, *" 3,6 "* — is unreadable here, though the
 *  URL still reads it; the whitespace rows keep their subject with a millimetre value inside. */
const EDGE_TEXTS: readonly (readonly [string, string, boolean])[] = [
  ["a word", "abc", true],
  ["a word with a length in it", "abc3600", true],
  ["the plan's zero", "0", true],
  ["zero spelled with three digits", "000", true],
  ["a whole-millimetre length", "3600", false],
  ["a leading zero", "03600", false],
  ["a readable length far below any bound", "3", false],
  ["a dot decimal, the metre habit", "3.60", true],
  ["a comma decimal, the metre habit", "3,6", true],
  ["a comma decimal with a unit", "3,60 m", true],
  ["a millimetre length with its unit", "3600mm", true],
  ["surrounding spaces", " 3600 ", false],
  ["a tab and a newline around it", "\t3600\n", false],
  ["a no-break space around it", "\u00A03600\u00A0", false],
  ["a negative number", "-1", true],
  ["an explicit plus sign", "+3", true],
  ["an exponent", "1e3", true],
  ["Arabic-Indic digits", "\u0663", true],
  ["full-width digits", "\uFF13\uFF16\uFF10\uFF10", true],
  ["a thousands separator", "3 600", true],
  ["two separators", "3,6,0", true],
  ["a trailing separator", "3,", true],
  ["a leading separator", ",6", true],
  ["zero spelled with decimals", "0,000", true],
  ["a sub-millimetre digit", "3,6005", true],
  ["trailing zeros past the millimetre", "3,60000000", true],
  ["a length past 2^53 millimetres", "9".repeat(20), true],
  ["a very long valid length", `${"0".repeat(10_000)}3600`, false],
  ["a very long metre length", `3,6${"0".repeat(10_000)}`, true],
  ["a very long garbage string", "x".repeat(10_000), true],
  ["NaN", "NaN", true],
  ["Infinity", "Infinity", true],
  ["hex", "0x10", true],
];

describe("unreadable text is exactly the text the field's millimetre parser refuses, and never blank text", () => {
  it.each(EDGE_TEXTS)(
    "classifies %s as the millimetre parser does, in every L field",
    (_, text, isUnreadable) => {
      for (const field of ["wallA", "wallB", "height"] as const) {
        const draft = draftWithTexts("L", {
          wallA: "3600",
          wallB: "2400",
          height: "2600",
          [field]: text,
        });

        const view = viewOfDraft(draft);

        expect(!parseMillimetres(text).ok).toBe(isUnreadable);
        expect(view.unreadableFields).toEqual(isUnreadable ? [field] : []);
      }
    },
  );

  it.each(["3,6", "3.60"])(
    "reports %j unreadable in a field although the URL parser still reads it (S1b-6)",
    (text) => {
      const draft = draftWithTexts("L", {
        wallA: text,
        wallB: "2400",
        height: "2600",
      });

      expect(urlParserRefuses("wallA", text)).toBe(false);
      expect(viewOfDraft(draft).unreadableFields).toEqual(["wallA"]);
    },
  );

  it("agrees with the parser on arbitrary text in every required field of every shape", () => {
    const text = fc.oneof(
      fc.string({ maxLength: 12 }),
      fc.string({ unit: "grapheme", maxLength: 6 }),
      fc.stringMatching(/^\s*[-+]?\d{0,3}([.,]\d{0,6})?(e\d)?\s*m?\s*$/),
      fc.stringMatching(/^\s*0{0,3}\d{1,5}\s*(mm)?$/),
    );
    fc.assert(
      fc.property(
        fc.constantFrom(...ROOM_SHAPES),
        fc.record({ wallA: text, wallB: text, wallC: text, height: text }),
        (shape, texts) => {
          const view = viewOfDraft(draftWithTexts(shape, texts));
          const expected = requiredFieldsFor(shape).filter(
            (field) =>
              !isBlank(texts[field]) && !parseMillimetres(texts[field]).ok,
          );

          expect(view.unreadableFields).toEqual(expected);
        },
      ),
      { numRuns: 3000 },
    );
  });

  it("never reports a field unreadable while the draft reads it as millimetres, and vice versa", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ROOM_SHAPES),
        fc.record({
          wallA: fc.string({ maxLength: 8 }),
          wallB: fc.string({ maxLength: 8 }),
          wallC: fc.string({ maxLength: 8 }),
          height: fc.string({ maxLength: 8 }),
        }),
        (shape, texts) => {
          const draft = draftWithTexts(shape, texts);
          const view = viewOfDraft(draft);

          for (const field of requiredFieldsFor(shape)) {
            const isRead = draft.lengths[field].millimetres !== undefined;
            const isUnreadable = view.unreadableFields.includes(field);
            expect(isRead && isUnreadable).toBe(false);
            expect(isRead || isUnreadable || isBlank(texts[field])).toBe(true);
          }
        },
      ),
      { numRuns: 2000 },
    );
  });

  it("keeps an unreadable field out of 1C: the room is 1B, with no reason and no note", () => {
    const draft = draftWithTexts("L", {
      wallA: "800",
      wallB: "abc",
      height: "2000",
    });

    const view = viewOfDraft(draft);

    expect(stateOfDraft(draft).substate).toBe("1B");
    expect(view.unreadableFields).toEqual(["wallB"]);
    expect(view.fieldReasons).toEqual([]);
    expect(view.markedWalls).toEqual([]);
    expect(view.isNoteShown).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
// Task 5 — reachability: no real draft makes the model throw
// ---------------------------------------------------------------------------------------------

/** Mostly lengths a customer could type, so the fuzz spends its runs in 1C and 1D where the model
 *  can throw; the rest is garbage, zero and blanks, which must fall to 1B without throwing. */
const lengthValue = fc.oneof(
  {
    arbitrary: fc.integer({ min: 1, max: 99_999 }).map(metresTextForUrl),
    weight: 12,
  },
  { arbitrary: fc.stringMatching(/^\d{1,3}[.,]\d{1,6}$/), weight: 2 },
  { arbitrary: fc.string({ maxLength: 8 }), weight: 1 },
  { arbitrary: fc.constantFrom("0", "", " ", "abc", "3,6005"), weight: 1 },
);

/** A query value as Next hands it to a page: absent, one string, or a repeated key. */
const queryValue = fc.oneof(
  { arbitrary: lengthValue, weight: 12 },
  { arbitrary: fc.constant(undefined), weight: 1 },
  {
    arbitrary: fc.array(lengthValue, { minLength: 2, maxLength: 3 }),
    weight: 1,
  },
);

const shapeValue = fc.oneof(
  { arbitrary: fc.constantFrom("linear", "L", "U"), weight: 8 },
  { arbitrary: fc.constantFrom("l", "u", "LINEAR", ""), weight: 1 },
  { arbitrary: fc.string({ maxLength: 4 }), weight: 1 },
);

const roomQuery: fc.Arbitrary<RoomSearchParams> = fc.record(
  {
    shape: shapeValue,
    wallA: queryValue,
    wallB: queryValue,
    wallC: queryValue,
    height: queryValue,
    direction: fc.oneof(
      { arbitrary: fc.constantFrom("left", "right"), weight: 8 },
      { arbitrary: fc.string({ maxLength: 5 }), weight: 1 },
    ),
  },
  { requiredKeys: ["shape"] },
);

describe("no draft a real address can produce makes the model throw", () => {
  it("derives a view for every fuzzed query, read both as the address bar and as the draft", () => {
    let reachedOneC = 0;
    fc.assert(
      fc.property(roomQuery, (query) => {
        const urlState = parseRoomUrlState(query);
        const shape = urlState.substate === "1A" ? "L" : shapeOf(urlState);
        const draft = roomDraftFromQuery(shape, query);
        const draftState = stateOfDraft(draft);
        if (draftState.substate === "1C") reachedOneC += 1;
        const view = deriveRoomIssueView({
          draft,
          draftState,
          policy: APPROVED_ROOM_POLICY,
        });

        // Frame 1C is never a silent state: when its note shows, something says why.
        const isExplained =
          view.fieldReasons.length + view.roomReasons.length > 0 ||
          view.isShapeRefused;
        expect(view.isNoteShown).toBe(draftState.substate === "1C");
        expect(!view.isNoteShown || isExplained).toBe(true);
        expect(() =>
          deriveRoomIssueView({
            draft,
            draftState,
            policy: APPROVED_ROOM_POLICY,
          }),
        ).not.toThrow();
        expect(() =>
          deriveRoomIssueView({
            draft,
            draftState: urlState,
            policy: APPROVED_ROOM_POLICY,
          }),
        ).not.toThrow();
      }),
      { numRuns: 5000 },
    );

    // The fuzz must actually reach the only sub-state where the model can throw.
    expect(reachedOneC).toBeGreaterThan(100);
  });

  it("derives a view for every 1C room of every shape in the swept range, both directions", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ROOM_SHAPES),
        fc.record({
          wallA: fc.integer({ min: 1, max: 99_999 }),
          wallB: fc.integer({ min: 1, max: 99_999 }),
          wallC: fc.integer({ min: 1, max: 99_999 }),
          height: fc.integer({ min: 1, max: 99_999 }),
        }),
        fc.constantFrom(...DIRECTIONS),
        (shape, mm, direction) => {
          const texts = {
            wallA: String(mm.wallA),
            wallB: String(mm.wallB),
            wallC: String(mm.wallC),
            height: String(mm.height),
          };
          const draft = withCornerDirection(
            draftWithTexts(shape, texts),
            direction,
          );

          expect(() => viewOfDraft(draft)).not.toThrow();
        },
      ),
      { numRuns: 3000 },
    );
  });
});

function shapeOf(state: Exclude<RoomUrlState, { substate: "1A" }>): RoomShape {
  return state.substate === "1B" ? state.shape : state.input.shape;
}
