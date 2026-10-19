// **Adversarial QA for M7 wave 7D5b slice SW — frame 1F's dishwasher row** (ADR 0110 Amendment M3,
// with M1 and M13; ADR 0113 for the copy; ADR 0121 decision 2 for the key).
//
// `generation-model.test.ts` proves W1–W4 at three rooms. This file asks the same questions where
// the answers could drift without those three noticing:
//
//   - **At S2's trades.** Slice S2 now places a dishwasher by trading out a pantry column (b), the
//     bottle (d) or, last, the oven tower (c). Each trade gives the dishwasher row a new population
//     and changes what the storage row stands on. One witness per trade, at all three ceilings.
//   - **Over a grid of approved rooms**, not a sample: the storage row reads *inclus* iff a storage
//     body **other than the dishwasher** reached the design, and the dishwasher row iff a
//     `base-dishwasher` did. The grid is checked to contain both discriminating populations, so a
//     sweep that happened to miss them cannot pass vacuously.
//   - **W4 over the same grid**, including the (e) and M1 rooms where the fridge is dropped and a
//     dishwasher stands.
//   - **Copy**, with the Russian leaf pinned to the owner's wording (nothing else pins it: the copy
//     lock and the golden manifest are Romanian-only).
//   - **W5, as a source scan** of the row's own modules.
//
// Bodies, widths and wording are literals here: they are the expectation, and the app must reach
// them through the domain's exports (ADR 0121 decision 4).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  DISHWASHER_PLANNED_WIDTH_MM,
  generateKitchen,
  type DesignRoom,
  type GenerateKitchenResult,
  type GenerationStep,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import {
  droppedRolesIn,
  GENERATION_ROLE_MESSAGE_KEY,
  GENERATION_ROW_MESSAGE_KEY,
  resolveGenerationRows,
  type GenerationRow,
  type GenerationRowId,
} from "@/room/generation-model";

import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";
import { APPROVED_ROMANIAN_MESSAGES } from "../support/approved-romanian-messages";
import { createFakeProbeFactory } from "../support/fake-body-probe";

const OCCURRED_AT = "2026-09-14T09:00:00.000Z";

const DISHWASHER_BODY = "base-dishwasher";
const DISHWASHER_WIDTH_MM = 600;
const OVEN_TOWER_BODY = "tall-oven-tower";
const HOB_WITH_OVEN_BODY = "base-hob-oven";
const BOTTLE_BODY = "base-bottle-cargo";
const PANTRY_BODY = "tall-pantry";
/** The cabinet generation's run-end fill stands (ADR 0167 D1); its step carries the storage role. */
const RUN_END_FILL_BODY = "base-cabinet";

/** The three ceilings the 7D5b plan measures at (*"identical at 2200, 2600 and 3900 mm ceilings
 *  unless stated"*). */
const PLAN_CEILINGS_MM = [2200, 2600, 3900] as const;

/** The owner's Russian wording, 2026-09-21 (7D5b SW ruling). The Romanian is the copy lock's to
 *  spell (`approved-romanian-messages.ts`); the Russian has no lock, so it is spelled here. */
const OWNER_RUSSIAN_LABEL = "Ниша для посудомоечной машины";

function roomOf(
  widthMm: number,
  depthMm: number,
  heightMm: number,
): DesignRoom {
  return { shape: "L", widthMm, depthMm, heightMm };
}

function generateFor(room: DesignRoom): GenerateKitchenResult {
  return generateKitchen({
    room,
    occurredAt: OCCURRED_AT,
    probeAt: createFakeProbeFactory(),
  });
}

function statusOf(
  rows: readonly GenerationRow[],
  rowId: GenerationRowId,
): GenerationRow["status"] {
  const row = rows.find((candidate) => candidate.id === rowId);
  if (row === undefined) throw new Error(`the list draws no ${rowId} row`);
  return row.status;
}

/** The placed steps whose body actually reached the design — the only steps a row may count. */
function stepsInTheDesign(
  result: GenerateKitchenResult,
): readonly GenerationStep[] {
  if (!result.ok) return [];
  const present = new Set(
    result.design.placements.map((placement) => placement.id),
  );
  return result.log.steps.filter(
    (step) => step.status === "placed" && present.has(step.placementId),
  );
}

function bodiesInTheDesign(result: GenerateKitchenResult): readonly string[] {
  return result.ok
    ? result.design.placements.map((placement) => placement.body.buildId)
    : [];
}

function nonDishwasherStorageBodies(
  result: GenerateKitchenResult,
): readonly string[] {
  return stepsInTheDesign(result)
    .filter(
      (step) => step.role === "storage" && step.buildId !== DISHWASHER_BODY,
    )
    .map((step) => step.buildId);
}

function holdsDishwasher(result: GenerateKitchenResult): boolean {
  return bodiesInTheDesign(result).includes(DISHWASHER_BODY);
}

describe("the witnesses, re-read on the tree S2 leaves (task 1)", () => {
  describe.each(PLAN_CEILINGS_MM)("at a %i mm ceiling", (heightMm) => {
    it("1500 × 2800 (M1) is still dishwasher-only storage: dishwasher inclus, Depozitare not", () => {
      const result = generateFor(roomOf(1500, 2800, heightMm));
      const storageRoleBodies = stepsInTheDesign(result)
        .filter((step) => step.role === "storage")
        .map((step) => step.buildId);
      expect(storageRoleBodies).toEqual([DISHWASHER_BODY]);

      const rows = resolveGenerationRows(result.log);
      expect(statusOf(rows, "dishwasher")).toBe("placed");
      expect(statusOf(rows, "storage")).toBe("not_placed");
    });

    it("1500 × 3500 still holds no dishwasher, beside a storage cabinet", () => {
      const result = generateFor(roomOf(1500, 3500, heightMm));
      expect(holdsDishwasher(result)).toBe(false);
      expect(nonDishwasherStorageBodies(result).length).toBeGreaterThan(0);

      const rows = resolveGenerationRows(result.log);
      expect(statusOf(rows, "dishwasher")).toBe("not_placed");
      expect(statusOf(rows, "storage")).toBe("placed");
    });

    it("4650 × 1000 ((c)): the dishwasher is inclus, the oven moves under the hob, and the hob row stays inclus", () => {
      const result = generateFor(roomOf(4650, 1000, heightMm));
      const bodies = bodiesInTheDesign(result);
      // The guard that makes this (c) and not another trade: no tower, and the hob carries the oven.
      expect(bodies).not.toContain(OVEN_TOWER_BODY);
      expect(bodies).toContain(HOB_WITH_OVEN_BODY);
      expect(bodies).toContain(DISHWASHER_BODY);

      const rows = resolveGenerationRows(result.log);
      expect(statusOf(rows, "hob")).toBe("placed");
      expect(statusOf(rows, "dishwasher")).toBe("placed");
      // The bottle stays, so storage is inclus on its account, not the dishwasher's. Wall A's 350 mm
      // remainder past the bottle is now filled by one base-cabinet (ADR 0167 D1), also a storage body.
      expect(nonDishwasherStorageBodies(result)).toEqual([
        BOTTLE_BODY,
        RUN_END_FILL_BODY,
      ]);
      expect(statusOf(rows, "storage")).toBe("placed");
      expect(droppedRolesIn(result.log)).toEqual([]);
    });

    it("900 × 5000 ((b)): the dishwasher is inclus and the storage row stands on the bottle and the tower", () => {
      const result = generateFor(roomOf(900, 5000, heightMm));
      const bodies = bodiesInTheDesign(result);
      expect(bodies).toContain(DISHWASHER_BODY);
      expect(bodies).not.toContain(PANTRY_BODY);

      const rows = resolveGenerationRows(result.log);
      expect(statusOf(rows, "dishwasher")).toBe("placed");
      expect([...nonDishwasherStorageBodies(result)].sort()).toEqual(
        [BOTTLE_BODY, OVEN_TOWER_BODY].sort(),
      );
      expect(statusOf(rows, "storage")).toBe("placed");
    });

    it("900 × 4700 ((d)): the dishwasher is inclus, the bottle is gone, and storage is the tower alone", () => {
      const result = generateFor(roomOf(900, 4700, heightMm));
      expect(bodiesInTheDesign(result)).not.toContain(BOTTLE_BODY);

      const rows = resolveGenerationRows(result.log);
      expect(statusOf(rows, "dishwasher")).toBe("placed");
      expect(nonDishwasherStorageBodies(result)).toEqual([OVEN_TOWER_BODY]);
      expect(statusOf(rows, "storage")).toBe("placed");
    });

    it("900 × 5010, which no trade allows, reads the dishwasher not placed", () => {
      const result = generateFor(roomOf(900, 5010, heightMm));
      expect(holdsDishwasher(result)).toBe(false);

      expect(statusOf(resolveGenerationRows(result.log), "dishwasher")).toBe(
        "not_placed",
      );
    });
  });
});

/**
 * **The grid.** Wall A and wall B stepped by 100 mm across the whole approved L (ADR 0120 B2: 900–6000
 * and 1000–6000), at the plan's middle ceiling. 52 × 51 rooms; a 100 mm step crosses every trade's
 * 600 mm module more than once, and the populations below are asserted non-empty so the step is known
 * to be fine enough rather than assumed to be.
 */
const GRID_STEP_MM = 100;
const GRID_CEILING_MM = 2600;

function stepped(minMm: number, maxMm: number): readonly number[] {
  return Array.from(
    { length: Math.floor((maxMm - minMm) / GRID_STEP_MM) + 1 },
    (_, index) => minMm + index * GRID_STEP_MM,
  );
}

interface GridRoom {
  readonly room: DesignRoom;
  readonly result: GenerateKitchenResult;
  readonly rows: readonly GenerationRow[];
}

const GRID: readonly GridRoom[] = stepped(900, 6000).flatMap((widthMm) =>
  stepped(1000, 6000).map((depthMm) => {
    const room = roomOf(widthMm, depthMm, GRID_CEILING_MM);
    const result = generateFor(room);
    return { room, result, rows: resolveGenerationRows(result.log) };
  }),
);

function nameOf({ room }: GridRoom): string {
  return `${String(room.widthMm)} × ${String(room.depthMm)}`;
}

function roomsWhere(
  predicate: (gridRoom: GridRoom) => boolean,
): readonly string[] {
  return GRID.filter(predicate).map(nameOf);
}

describe("the storage row never counts the dishwasher, over the approved grid (task 2, W2 and W3)", () => {
  it("reads Depozitare inclus exactly where a non-dishwasher storage body reached the design", () => {
    const liars = roomsWhere(
      ({ result, rows }) =>
        (statusOf(rows, "storage") === "placed") !==
        nonDishwasherStorageBodies(result).length > 0,
    );

    expect(liars).toEqual([]);
  });

  it("reads the dishwasher inclus exactly where a base-dishwasher reached the design", () => {
    const liars = roomsWhere(
      ({ result, rows }) =>
        (statusOf(rows, "dishwasher") === "placed") !== holdsDishwasher(result),
    );

    expect(liars).toEqual([]);
  });

  it("prints 600 over a dishwasher that is 600 wide, and never over two of them", () => {
    const withDishwasher = GRID.filter(({ result }) => holdsDishwasher(result));
    const wrongDishwashers = withDishwasher.filter(({ result }) => {
      if (!result.ok) return false;
      const dishwashers = result.design.placements.filter(
        (placement) => placement.body.buildId === DISHWASHER_BODY,
      );
      return (
        dishwashers.length !== 1 ||
        dishwashers[0]?.body.widthMm !== DISHWASHER_WIDTH_MM
      );
    });

    expect(DISHWASHER_PLANNED_WIDTH_MM).toBe(DISHWASHER_WIDTH_MM);
    expect(wrongDishwashers.map(nameOf)).toEqual([]);
  });

  it("holds both discriminating populations, so the two sweeps above are not vacuous", () => {
    // W3's own population: the dishwasher is the whole of the storage role. A row counting the
    // dishwasher reads inclus here and nowhere else goes red.
    const dishwasherOnlyStorage = roomsWhere(
      ({ result }) =>
        holdsDishwasher(result) &&
        nonDishwasherStorageBodies(result).length === 0,
    );
    // W2 (a)'s population: storage stands, the dishwasher does not. A row keyed on role `storage`
    // reads inclus here.
    const storageWithoutDishwasher = roomsWhere(
      ({ result }) =>
        !holdsDishwasher(result) &&
        nonDishwasherStorageBodies(result).length > 0,
    );

    expect(dishwasherOnlyStorage).toContain("1500 × 2800");
    expect(storageWithoutDishwasher).toContain("1500 × 3500");
    expect(dishwasherOnlyStorage.length).toBeGreaterThan(1);
    expect(storageWithoutDishwasher.length).toBeGreaterThan(1);
  });

  it("keeps the hob row inclus in every room where the hob carries the oven and no tower stands", () => {
    const ovenUnderTheHob = GRID.filter(({ result }) => {
      const bodies = bodiesInTheDesign(result);
      return (
        bodies.includes(HOB_WITH_OVEN_BODY) &&
        bodies.includes(DISHWASHER_BODY) &&
        !bodies.includes(OVEN_TOWER_BODY)
      );
    });

    expect(ovenUnderTheHob.length).toBeGreaterThan(0);
    expect(
      ovenUnderTheHob
        .filter(({ rows }) => statusOf(rows, "hob") !== "placed")
        .map(nameOf),
    ).toEqual([]);
  });
});

describe("the dropped-roles sentence never names the dishwasher (task 3, W4)", () => {
  const CORE_ROLES = ["fridge", "sink", "preparation", "hob"];

  it("lists core roles only, in every room of the grid", () => {
    const offenders = roomsWhere(({ result }) =>
      droppedRolesIn(result.log).some((role) => !CORE_ROLES.includes(role)),
    );

    expect(offenders).toEqual([]);
  });

  it("names the fridge and not the dishwasher where the fridge is dropped and a dishwasher stands", () => {
    const fridgeTradedForDishwasher = GRID.filter(
      ({ result }) =>
        holdsDishwasher(result) &&
        droppedRolesIn(result.log).includes("fridge"),
    );
    expect(fridgeTradedForDishwasher.length).toBeGreaterThan(0);

    for (const { result } of fridgeTradedForDishwasher) {
      const namedKeys = droppedRolesIn(result.log).map(
        (role) => GENERATION_ROLE_MESSAGE_KEY[role],
      );
      expect(namedKeys).not.toContain(GENERATION_ROW_MESSAGE_KEY.dishwasher);
      expect(namedKeys).not.toContain(GENERATION_ROLE_MESSAGE_KEY.storage);
    }
  });

  it.each([
    [900, 3400],
    [1500, 2800],
  ])(
    "keeps Blat de lucru inclus and drops only the fridge in %i × %i",
    (widthMm, depthMm) => {
      const result = generateFor(roomOf(widthMm, depthMm, GRID_CEILING_MM));
      expect(holdsDishwasher(result)).toBe(true);

      expect(droppedRolesIn(result.log)).toEqual(["fridge"]);
      expect(statusOf(resolveGenerationRows(result.log), "preparation")).toBe(
        "placed",
      );
    },
  );

  it("never lets the dropped sentence's key table name a row that is not a core role", () => {
    // The sentence resolves through `GENERATION_ROLE_MESSAGE_KEY`; it must stay the role table and
    // never become the widened row table.
    expect(Object.keys(GENERATION_ROLE_MESSAGE_KEY)).not.toContain(
      "dishwasher",
    );
  });
});

describe("the dishwasher's copy (task 4)", () => {
  /** Romanian's comma-below s and t, and the cedilla look-alikes a keyboard or a converter produces
   *  instead — as codepoints, because the wording itself is the lock's to spell. */
  const COMMA_BELOW_S = 0x0219;
  const CEDILLA_LOOKALIKES = [0x015e, 0x015f, 0x0162, 0x0163];

  function codepointsOf(text: string): readonly number[] {
    return Array.from(text, (character) => character.codePointAt(0) ?? 0);
  }

  it("is the locked Romanian, with the comma-below s and never the cedilla", () => {
    const leaf = roMessages.room.compose.dishwasher;

    expect(leaf).toBe(APPROVED_ROMANIAN_MESSAGES.room.compose.dishwasher);
    expect(codepointsOf(leaf)).toContain(COMMA_BELOW_S);
    expect(
      codepointsOf(leaf).filter((codepoint) =>
        CEDILLA_LOOKALIKES.includes(codepoint),
      ),
    ).toEqual([]);
    expect(leaf.normalize("NFC")).toBe(leaf);
  });

  it("is the owner's Russian, which no lock or golden hash pins but this", () => {
    const russian = (ruMessages as typeof roMessages).room.compose.dishwasher;

    expect(russian).toBe(OWNER_RUSSIAN_LABEL);
    expect(russian).not.toMatch(/[A-Za-z]/u);
  });

  it("is mirrored in ro.d.json.ts", () => {
    const declaration = readFileSync(
      resolve(import.meta.dirname, "../../src/messages/ro.d.json.ts"),
      "utf8",
    );

    expect(declaration).toContain(
      `"dishwasher": ${JSON.stringify(roMessages.room.compose.dishwasher)}`,
    );
  });

  it("carries no explanatory sibling leaf beside the row's label", () => {
    // The owner ruled no explanatory sentence (ADR 0113 decision 5). A `dishwasherReason`,
    // `dishwasherHelp` or similar leaf would be one waiting to be rendered.
    const siblings = (catalogue: typeof roMessages): readonly string[] =>
      Object.keys(catalogue.room.compose).filter((key) =>
        key.toLowerCase().includes("dishwasher"),
      );

    expect(siblings(roMessages)).toEqual(["dishwasher"]);
    expect(siblings(ruMessages as typeof roMessages)).toEqual(["dishwasher"]);
  });
});

/**
 * **W5, and how it has to be read.** Literally — *"`apps/web/src/**` spells neither `"base-dishwasher"`
 * nor the row's `600`"* — it is false at HEAD and was before SW: the body's catalogue label
 * (`messages/*.json`), its thumbnail (`panel/cabinet-thumbnails.ts`) and its label resolver
 * (`i18n/content.ts`) all spell the id, since M5/M6B. What SW can be held to is that **the row's own
 * code** spells neither and reads both from the domain. That is scanned here with comments stripped, so a
 * comment mentioning *Spălător · 600* is not a finding and a `600` in code is.
 */
describe("the row reads its body and width from the domain (task 5, W5)", () => {
  const ROW_SOURCES = [
    "../../src/room/generation-model.ts",
    "../../src/room/generation-steps.tsx",
  ] as const;

  /** The file with its comments removed, so prose (*Spălător · 600*) is not a finding and code is.
   *  A plain strip, not a parser: neither file holds `//` inside a string, which the first test
   *  below checks rather than assumes. */
  function codeOf(relativePath: string): string {
    return readFileSync(resolve(import.meta.dirname, relativePath), "utf8")
      .replace(/\/\*[\s\S]*?\*\//gu, "")
      .replace(/\/\/.*$/gmu, "");
  }

  it.each(ROW_SOURCES)(
    "holds no `//` inside a string in %s, so the strip is sound",
    (relativePath) => {
      const source = readFileSync(
        resolve(import.meta.dirname, relativePath),
        "utf8",
      );

      expect(source).not.toMatch(/["'`][^"'`\n]*\/\/[^"'`\n]*["'`]/u);
    },
  );

  it.each(ROW_SOURCES)(
    "spells neither the body id nor 600 in %s",
    (relativePath) => {
      const code = codeOf(relativePath);

      expect(code).not.toContain(DISHWASHER_BODY);
      expect(code).not.toMatch(
        new RegExp(`\\b${String(DISHWASHER_WIDTH_MM)}\\b`, "u"),
      );
    },
  );

  it("imports both from the domain in generation-model.ts", () => {
    const code = codeOf(ROW_SOURCES[0]);

    expect(code).toMatch(
      /\bDISHWASHER_BUILD_ID\b[\s\S]*from "@lemnaria\/configurator-domain"/u,
    );
    expect(code).toMatch(
      /\bDISHWASHER_PLANNED_WIDTH_MM\b[\s\S]*from "@lemnaria\/configurator-domain"/u,
    );
  });
});
