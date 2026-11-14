// M12 wave W2, adversarial pass (ADR 0183 decisions 1-3; plan §5 W2; coordinator ruling 2026-11-15: the cabinet is
// placed wherever the insert succeeds, shortened to the opening from the lowest ceiling that fits, refused below).
//
// What this file adds to `over-the-fridge.test.ts` (the implementer's, which sweeps round-number grids; this file owns
// the SEEDED odd-millimetre rooms and, over them, the switch at the lowest ceiling that fits, the replay and the
// comparison with the earlier generator), each from a counterexample hunt:
// - the refusal CODE per ceiling band, not "either code", and the line where the band switches;
// - the ids, the commands and the steps against the generator as it stood before ADR 0183, field by field (the oracle
//   is `support/before-adr-0183.ts`; it was itself checked against a real `HEAD` worktree for ~4 900 rooms, 0 diffs);
// - the fridge's final centre where a free-end resize or fill moved it after it was inserted;
// - a log recorded before ADR 0183 replays to the design it recorded (stored logs, ADR 0167);
// - geometry above and beside the cabinet, at the shortened ceilings as well as from the grid's last level;
// - what the cabinet does to the price, to a depth change and to a delete;
// - the one place the declaration is read.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import {
  buildKitchenLBodyCatalog,
  replayGenerationLog,
  removePlacement,
  setCabinetDepth,
  type Design,
  type DesignPlacement,
  type DesignRoom,
  type GenerateKitchenResult,
  type GenerationCommand,
  type GenerationStep,
} from "../../src/index.js";
import { priceDesign } from "../../src/pricing/price-design.js";
import type { PricedDesign } from "../../src/pricing/price-lines.js";
import { SAMPLE_PRICE_BOOK } from "../../src/pricing/sample-price-book.js";
import { beforeAdr0183 } from "../support/before-adr-0183.js";
import { NOTHING_DISABLED } from "../support/availability.js";
import { MEASURED_DEEPENING_ROWS } from "../support/deepening-rows.js";
import { createFakeProbeFactory } from "../support/fake-probe.js";
import {
  DEPTHS_MM,
  FRIDGE_STEP_ID,
  FRIDGE_TOP_MM,
  generate,
  HIGHEST_SHORTENED_CEILING_MM,
  LOWEST_CEILING_THAT_FITS_MM,
  MIDDLE_SHORTENED_CEILING_MM,
  NO_OPENING_THROUGH_MM,
  OCCURRED_AT,
  OPENING_TOP_MM,
  OVER_BODY_ROLE,
  overBodyStepOf,
  placementOf,
  Reach,
  seededRooms,
  spansOverlap,
  stepNamed,
  TOO_SHORT_FROM_MM,
} from "../support/over-the-fridge.js";

vi.mock("../../src/wall-body-over-it.js", async (importOriginal) => {
  const { withTheDeclarationSwitchable } = await import(
    "../support/before-adr-0183.js"
  );
  return withTheDeclarationSwitchable(await importOriginal());
});

type Generated = Extract<GenerateKitchenResult, { ok: true }>;

interface Outcome {
  readonly threw?: string;
  readonly result?: GenerateKitchenResult;
}

function outcomeOf(generateOnce: () => GenerateKitchenResult): Outcome {
  try {
    return { result: generateOnce() };
  } catch (error) {
    return { threw: error instanceof Error ? error.message : String(error) };
  }
}

function nowAndBefore(room: DesignRoom, cabinetDepthMm: number) {
  return {
    now: outcomeOf(() => generate(room, cabinetDepthMm)),
    before: outcomeOf(() =>
      beforeAdr0183(() => generate(room, cabinetDepthMm)),
    ),
  };
}

function topMmOf(placement: DesignPlacement): number {
  return placement.y0Mm + placement.body.heightMm;
}

const ROOMS_BELOW_THE_LINE: readonly DesignRoom[] = [
  { shape: "L", widthMm: 4100, depthMm: 3300, heightMm: 0 },
  { shape: "L", widthMm: 6000, depthMm: 5000, heightMm: 0 },
  { shape: "linear", widthMm: 4200, depthMm: 3400, heightMm: 0 },
  { shape: "U", widthMm: 4000, depthMm: 3000, wallCMm: 2800, heightMm: 0 },
  { shape: "U", widthMm: 5600, depthMm: 5000, wallCMm: 5000, heightMm: 0 },
];

describe("the refusal code follows the ceiling band, and nothing throws that the earlier generator did not (ruling 2026-11-15)", () => {
  /** Every ceiling within 20 mm of a switch and every 7th one elsewhere, from the fridge's own top to the line. */
  function ceilingsToSweep(): number[] {
    const ceilings: number[] = [];
    for (
      let mm = FRIDGE_TOP_MM;
      mm <= LOWEST_CEILING_THAT_FITS_MM + 1;
      mm += 1
    ) {
      const isNearASwitch =
        Math.abs(mm - NO_OPENING_THROUGH_MM) <= 20 ||
        Math.abs(mm - LOWEST_CEILING_THAT_FITS_MM) <= 20;
      if (isNearASwitch || mm % 7 === 0) ceilings.push(mm);
    }
    return ceilings;
  }

  it("is NO_OPENING with no command through the first band, OPENING_TOO_SHORT with one command through the second, placed from the lowest ceiling that fits", () => {
    const reach = new Reach();
    for (const cabinetDepthMm of DEPTHS_MM) {
      for (const size of ROOMS_BELOW_THE_LINE) {
        for (const heightMm of ceilingsToSweep()) {
          const room = { ...size, heightMm } as DesignRoom;
          const label = `${JSON.stringify(room)} @${String(cabinetDepthMm)}`;
          const { now, before } = nowAndBefore(room, cabinetDepthMm);

          // Throws exactly where the earlier generator threw, with the same message.
          expect(now.threw, label).toBe(before.threw);
          if (now.result === undefined || before.result === undefined) {
            reach.note("throws as before");
            continue;
          }
          const fridge = stepNamed(now.result, FRIDGE_STEP_ID);
          const overStep = overBodyStepOf(now.result);
          if (fridge?.status !== "placed") {
            expect(overStep, label).toBeUndefined();
            reach.note("no fridge");
            continue;
          }
          if (!now.result.ok || !before.result.ok) {
            expect(now.result.ok, label).toBe(before.result.ok);
            continue;
          }
          if (overStep === undefined) throw new Error(`${label}: no step`);

          if (heightMm >= LOWEST_CEILING_THAT_FITS_MM) {
            expect(overStep.status, label).toBe("placed");
            reach.note("placed");
            continue;
          }
          expect(now.result.design, label).toStrictEqual(before.result.design);
          expect(overStep.status, label).toBe("not_placed");
          if (overStep.status !== "not_placed") continue;
          if (heightMm <= NO_OPENING_THROUGH_MM) {
            expect(overStep.reason, label).toEqual({
              code: "NO_OPENING",
              params: {},
            });
            expect(overStep.commands, label).toEqual([]);
            reach.note("NO_OPENING");
          } else {
            expect(overStep.reason.code, label).toBe("OPENING_TOO_SHORT");
            expect(overStep.commands, label).toHaveLength(1);
            reach.note("OPENING_TOO_SHORT");
          }
        }
      }
    }
    expect(reach.of("NO_OPENING")).toBeGreaterThanOrEqual(100);
    expect(reach.of("OPENING_TOO_SHORT")).toBeGreaterThanOrEqual(200);
    expect(reach.of("placed")).toBeGreaterThanOrEqual(20);
    expect(reach.of("throws as before")).toBeGreaterThanOrEqual(10);
  });

  it("switches from NO_OPENING with no command to OPENING_TOO_SHORT with one command exactly at the ruled ceiling, in L and straight rooms", () => {
    const rooms = ROOMS_BELOW_THE_LINE.filter(({ shape }) => shape !== "U");
    let compared = 0;
    for (const cabinetDepthMm of DEPTHS_MM) {
      for (const size of rooms) {
        const at = (heightMm: number) => {
          const room = { ...size, heightMm } as DesignRoom;
          const result = outcomeOf(() => generate(room, cabinetDepthMm)).result;
          const step = result && overBodyStepOf(result);
          if (step?.status !== "not_placed") {
            throw new Error(`${JSON.stringify(room)}: not refused`);
          }
          return step;
        };
        const label = `${size.shape} @${String(cabinetDepthMm)}`;
        const below = at(NO_OPENING_THROUGH_MM);
        const above = at(TOO_SHORT_FROM_MM);

        expect([label, below.reason.code, below.commands.length]).toEqual([
          label,
          "NO_OPENING",
          0,
        ]);
        expect([label, above.reason.code, above.commands.length]).toEqual([
          label,
          "OPENING_TOO_SHORT",
          1,
        ]);
        compared += 1;
      }
    }
    expect(compared).toBe(2 * rooms.length);
  });

  it("switches once and in one direction as the ceiling rises: NO_OPENING, then OPENING_TOO_SHORT, then placed", () => {
    const rank = { NO_OPENING: 0, OPENING_TOO_SHORT: 1, placed: 2 } as const;
    const sawARank = new Set<number>();
    for (const size of ROOMS_BELOW_THE_LINE) {
      let lastRank = -1;
      let switches = 0;
      const ranksReached = new Set<number>();
      for (
        let heightMm = NO_OPENING_THROUGH_MM - 150;
        heightMm <= OPENING_TOP_MM + 100;
        heightMm += 1
      ) {
        const room = { ...size, heightMm } as DesignRoom;
        const outcome = outcomeOf(() => generate(room, 600));
        const step = outcome.result
          ? overBodyStepOf(outcome.result)
          : undefined;
        if (step === undefined) continue;
        const code = step.status === "placed" ? "placed" : step.reason.code;
        expect(Object.keys(rank), `${code} at ${String(heightMm)}`).toContain(
          code,
        );
        const current = rank[code as keyof typeof rank];
        expect(
          current,
          `${JSON.stringify(room)} falls back at ${String(heightMm)}`,
        ).toBeGreaterThanOrEqual(lastRank);
        if (current !== lastRank) switches += 1;
        lastRank = current;
        ranksReached.add(current);
        sawARank.add(current);
      }
      // A U that already throws at the lowest ceilings (its hob has no hood) starts in a later band: at most three switches.
      expect(switches).toBeLessThanOrEqual(3);
      expect(lastRank).toBe(rank.placed);
      expect(ranksReached.has(rank.OPENING_TOO_SHORT)).toBe(true);
    }
    expect([...sawARank].sort()).toEqual([0, 1, 2]);
  });

  it("places the lowest ceiling that fits and refuses the one below it in every sampled room, not in one room only", () => {
    let compared = 0;
    for (const room of seededRooms(120, [LOWEST_CEILING_THAT_FITS_MM])) {
      const at = (heightMm: number) =>
        outcomeOf(() => generate({ ...room, heightMm }, 600)).result;
      const placed = at(LOWEST_CEILING_THAT_FITS_MM);
      const refused = at(LOWEST_CEILING_THAT_FITS_MM - 1);
      if (!placed || !refused) continue;
      if (stepNamed(placed, FRIDGE_STEP_ID)?.status !== "placed") continue;
      expect(overBodyStepOf(placed)?.status, JSON.stringify(room)).toBe(
        "placed",
      );
      const refusal = overBodyStepOf(refused);
      expect(
        refusal?.status === "not_placed" ? refusal.reason.code : undefined,
        JSON.stringify(room),
      ).toBe("OPENING_TOO_SHORT");
      compared += 1;
    }
    expect(compared).toBeGreaterThanOrEqual(80);
  });
});

describe("against the generator as it stood before ADR 0183, only the cabinet and the top row's id moved (W2-3)", () => {
  const CEILINGS_MM = [
    LOWEST_CEILING_THAT_FITS_MM,
    MIDDLE_SHORTENED_CEILING_MM,
    HIGHEST_SHORTENED_CEILING_MM,
    OPENING_TOP_MM,
    OPENING_TOP_MM + 1,
    OPENING_TOP_MM + 200,
    OPENING_TOP_MM + 700,
  ];

  function everyRoomWithACabinet(
    reach: Reach,
    visit: (input: {
      room: DesignRoom;
      cabinetDepthMm: number;
      now: Generated;
      before: Generated;
      overStep: Extract<GenerationStep, { status: "placed" }>;
    }) => void,
  ): void {
    for (const cabinetDepthMm of DEPTHS_MM) {
      for (const room of seededRooms(210, CEILINGS_MM)) {
        const { now, before } = nowAndBefore(room, cabinetDepthMm);
        if (!now.result?.ok || !before.result?.ok) continue;
        const overStep = overBodyStepOf(now.result);
        if (overStep?.status !== "placed") {
          reach.note("no cabinet");
          continue;
        }
        visit({
          room,
          cabinetDepthMm,
          now: now.result,
          before: before.result,
          overStep,
        });
        reach.note(`${room.shape}@${String(cabinetDepthMm)}`);
        reach.note(`ceiling ${String(room.heightMm)}`);
      }
    }
  }

  const idPattern = /^([a-z]+)(\d+)$/;
  function numberOf(id: string): number {
    const match = idPattern.exec(id);
    if (!match) throw new Error(`unexpected id ${id}`);
    return Number(match[2]);
  }

  it("keeps every non-top id and body, shifts every top-row id by one, and gives the cabinet the first top-row id", () => {
    const reach = new Reach();
    everyRoomWithACabinet(reach, ({ room, now, before, overStep }) => {
      const label = JSON.stringify(room);
      const topIds = (result: Generated) =>
        result.log.steps.flatMap((step) =>
          step.role === "top" && step.status === "placed"
            ? [step.placementId]
            : [],
        );
      const beforeTops = topIds(before);
      const nowTops = topIds(now);
      const beforeById = new Map(
        before.design.placements.map((placement) => [placement.id, placement]),
      );

      expect(nowTops.length, label).toBe(beforeTops.length);
      beforeTops.forEach((id, index) => {
        const shifted = nowTops[index] ?? "";
        expect(numberOf(shifted), label).toBe(numberOf(id) + 1);
        expect(shifted.replace(/\d+$/, ""), label).toBe(id.replace(/\d+$/, ""));
        const nowTop = now.design.placements.find(
          (placement) => placement.id === shifted,
        );
        const beforeTop = beforeById.get(id);
        expect(nowTop, label).toBeDefined();
        expect({ ...nowTop, id: undefined }, label).toStrictEqual({
          ...beforeTop,
          id: undefined,
        });
      });
      const topSet = new Set(nowTops);
      for (const placement of now.design.placements) {
        if (topSet.has(placement.id) || placement.id === overStep.placementId) {
          continue;
        }
        expect(beforeById.get(placement.id), label).toStrictEqual(placement);
      }
      // The cabinet takes the first id the top row would have had, or the next free one where there is no top row.
      const firstFreeNumber = Math.max(
        ...before.design.placements
          .filter(({ id }) => id.startsWith("n"))
          .map(({ id }) => numberOf(id)),
      );
      expect(overStep.placementId, label).toBe(
        beforeTops[0] ?? `n${String(firstFreeNumber + 1)}`,
      );
      expect(
        new Set(now.design.placements.map(({ id }) => id)).size,
        label,
      ).toBe(now.design.placements.length);
    });
    expect(reach.of("L@600")).toBeGreaterThanOrEqual(30);
    expect(reach.of("U@700")).toBeGreaterThanOrEqual(30);
    expect(reach.of("linear@700")).toBeGreaterThanOrEqual(30);
  });

  it("splices exactly one command between the earlier log's uppers and its top row, leaving every other command byte for byte", () => {
    const reach = new Reach();
    everyRoomWithACabinet(reach, ({ room, now, before, overStep }) => {
      const label = JSON.stringify(room);
      const topCommandCount = before.log.steps
        .filter((step) => step.role === "top")
        .reduce((sum, step) => sum + step.commands.length, 0);
      const splitAt = before.log.commands.length - topCommandCount;
      const expected: GenerationCommand[] = [
        ...before.log.commands.slice(0, splitAt),
        ...overStep.commands,
        ...before.log.commands.slice(splitAt),
      ];

      expect(overStep.commands, label).toHaveLength(1);
      expect(now.log.commands, label).toStrictEqual(expected);
      expect(
        now.log.steps.filter((step) => step.role !== OVER_BODY_ROLE),
        label,
      ).toStrictEqual(
        before.log.steps.map((step) =>
          step.role === "top" && step.status === "placed"
            ? { ...step, placementId: expect.any(String) as string }
            : step,
        ),
      );
      expect(now.log.plan, label).toStrictEqual(before.log.plan);
      expect(now.log.newKitchenSettings, label).toStrictEqual(
        before.log.newKitchenSettings,
      );
      reach.note(`top ${topCommandCount > 0 ? "some" : "none"}`);
    });
    expect(reach.of("top some")).toBeGreaterThanOrEqual(20);
    expect(reach.of("top none")).toBeGreaterThanOrEqual(20);
  });

  it("changes no column record, empty or stored, anywhere, and no design field but the placements", () => {
    const reach = new Reach();
    everyRoomWithACabinet(reach, ({ room, now, before }) => {
      const label = JSON.stringify(room);
      expect(now.design.emptyColumns, label).toStrictEqual(
        before.design.emptyColumns,
      );
      expect(now.design.columnExtents, label).toStrictEqual(
        before.design.columnExtents,
      );
      const withoutPlacements = (design: Design) => ({
        ...design,
        placements: [],
      });
      expect(withoutPlacements(now.design), label).toStrictEqual(
        withoutPlacements(before.design),
      );
      reach.note("compared");
    });
    expect(reach.of("compared")).toBeGreaterThanOrEqual(350);
  });
});

describe("the cabinet stands over the fridge's final centre, wherever free-end work moved the fridge (W2-1 anchor)", () => {
  /** The fridge as it stood the moment it was inserted, from the log replayed up to that command. */
  function fridgeWhenInserted(result: Generated): DesignPlacement {
    const fridgeStep = stepNamed(result, FRIDGE_STEP_ID);
    if (fridgeStep?.status !== "placed") throw new Error("no fridge");
    const [insertion] = fridgeStep.commands;
    const index = result.log.commands.findIndex(
      (command) => JSON.stringify(command) === JSON.stringify(insertion),
    );
    const replayed = replayGenerationLog({
      log: { ...result.log, commands: result.log.commands.slice(0, index + 1) },
      probeAt: createFakeProbeFactory(),
    });
    const found = replayed.placements.find(
      (placement) =>
        placement.body.buildId === fridgeStep.buildId &&
        placement.wall === placementOf(result.design, fridgeStep).wall,
    );
    if (!found) throw new Error("the fridge was not at its insertion");
    return found;
  }

  it("matches the final fridge's wall, centre and width, in rooms where free-end work ran after the fridge was inserted", () => {
    const reach = new Reach();
    for (const cabinetDepthMm of DEPTHS_MM) {
      for (const room of seededRooms(300, [
        OPENING_TOP_MM,
        OPENING_TOP_MM + 200,
        OPENING_TOP_MM + 400,
      ])) {
        const result = outcomeOf(() => generate(room, cabinetDepthMm)).result;
        if (!result?.ok) continue;
        const fridgeStep = stepNamed(result, FRIDGE_STEP_ID);
        const overStep = overBodyStepOf(result);
        if (fridgeStep?.status !== "placed" || overStep?.status !== "placed") {
          continue;
        }
        const fridge = placementOf(result.design, fridgeStep);
        const cabinet = placementOf(result.design, overStep);
        expect(cabinet.wall).toBe(fridge.wall);
        expect(cabinet.alongMm).toBe(fridge.alongMm);
        expect(cabinet.body.widthMm).toBe(fridge.body.widthMm);
        expect(cabinet.y0Mm).toBe(FRIDGE_TOP_MM);

        const inserted = fridgeWhenInserted(result);
        reach.note(inserted.alongMm === fridge.alongMm ? "stayed" : "moved");
        reach.note(`${room.shape}:${fridge.wall}`);
        reach.note(`width ${String(fridge.body.widthMm)}`);
        const hasSetWidthAfter = result.log.commands
          .slice(
            result.log.commands.findIndex(
              (command) =>
                JSON.stringify(command) ===
                JSON.stringify(fridgeStep.commands[0]),
            ) + 1,
          )
          .some((command) => command.type === "set_width");
        reach.note(hasSetWidthAfter ? "resized after" : "no resize after");
      }
    }
    expect(reach.of("stayed")).toBeGreaterThanOrEqual(100);
    // Free-end resizes and fills run after the fridge is inserted in 100+ of these rooms, and none moved it: it stands
    // at the end of its run, so the arm "moved after insertion" is not reachable by generation today. The anchor
    // assertions above hold for it either way; this floor says the resize half of the question was asked.
    expect(reach.of("resized after")).toBeGreaterThanOrEqual(50);
    expect(reach.of("L:B")).toBeGreaterThanOrEqual(30);
    expect(reach.of("linear:A")).toBeGreaterThanOrEqual(30);
    expect(reach.of("U:B")).toBeGreaterThanOrEqual(30);
    expect(reach.of("U:C")).toBeGreaterThanOrEqual(30);
  });
});

describe("geometry over and beside the cabinet, at the shortened ceilings and above (W2-4)", () => {
  it("has no body overlapping the cabinet's span above its top, none inside its box, and ends at the ceiling or the grid's last level", () => {
    const reach = new Reach();
    for (const cabinetDepthMm of DEPTHS_MM) {
      for (const room of seededRooms(240, [
        LOWEST_CEILING_THAT_FITS_MM,
        MIDDLE_SHORTENED_CEILING_MM,
        HIGHEST_SHORTENED_CEILING_MM,
        OPENING_TOP_MM,
        OPENING_TOP_MM + 200,
        OPENING_TOP_MM + 700,
      ])) {
        const result = outcomeOf(() => generate(room, cabinetDepthMm)).result;
        if (!result?.ok) continue;
        const overStep = overBodyStepOf(result);
        if (overStep?.status !== "placed") continue;
        const cabinet = placementOf(result.design, overStep);
        const others = result.design.placements.filter(
          (placement) => placement.id !== cabinet.id,
        );
        const label = JSON.stringify(room);

        expect(
          others
            .filter(
              (other) =>
                spansOverlap(other, cabinet) &&
                topMmOf(other) > cabinet.y0Mm &&
                other.y0Mm < topMmOf(cabinet),
            )
            .map(({ id }) => id),
          label,
        ).toEqual([]);
        expect(
          others.filter(
            (other) =>
              spansOverlap(other, cabinet) && other.y0Mm >= topMmOf(cabinet),
          ),
          label,
        ).toEqual([]);
        expect(topMmOf(cabinet), label).toBe(
          Math.min(room.heightMm, OPENING_TOP_MM),
        );
        expect(
          result.design.placements.filter(
            (placement) =>
              placement.body.buildId === "wall-cabinet" &&
              placement.y0Mm === FRIDGE_TOP_MM,
          ),
          label,
        ).toHaveLength(1);
        reach.note(room.heightMm < OPENING_TOP_MM ? "shortened" : "full");
      }
    }
    expect(reach.of("shortened")).toBeGreaterThanOrEqual(100);
    expect(reach.of("full")).toBeGreaterThanOrEqual(100);
  });

  it("generates exactly one oven and exactly one cabinet over the fridge in every ceiling from the lowest that fits to just above the grid's last level", () => {
    const reach = new Reach();
    for (const size of ROOMS_BELOW_THE_LINE) {
      for (
        let heightMm = LOWEST_CEILING_THAT_FITS_MM;
        heightMm <= OPENING_TOP_MM + 100;
        heightMm += 3
      ) {
        const result = outcomeOf(() =>
          generate({ ...size, heightMm } as DesignRoom, 600),
        ).result;
        if (!result?.ok) continue;
        const ovens = result.design.placements.filter(({ body }) =>
          ["base-hob-oven", "tall-oven-tower"].includes(body.buildId),
        );
        expect(ovens, `${size.shape} @${String(heightMm)}`).toHaveLength(1);
        expect(
          result.log.steps.filter((step) => step.role === OVER_BODY_ROLE),
        ).toHaveLength(1);
        reach.note("checked");
      }
    }
    expect(reach.of("checked")).toBeGreaterThanOrEqual(300);
  });
});

describe("replay reproduces the design at the shortened ceilings, in every shape, and an earlier log replays to its own design (W2-5, ADR 0167)", () => {
  it("replays byte for byte at every shortened ceiling", () => {
    let replayed = 0;
    for (const cabinetDepthMm of DEPTHS_MM) {
      for (const room of seededRooms(240, [
        LOWEST_CEILING_THAT_FITS_MM,
        LOWEST_CEILING_THAT_FITS_MM + 29,
        LOWEST_CEILING_THAT_FITS_MM + 59,
        HIGHEST_SHORTENED_CEILING_MM,
      ])) {
        const result = outcomeOf(() => generate(room, cabinetDepthMm)).result;
        if (!result?.ok || overBodyStepOf(result)?.status !== "placed")
          continue;
        expect(
          replayGenerationLog({
            log: result.log,
            probeAt: createFakeProbeFactory(),
          }),
          JSON.stringify(room),
        ).toStrictEqual(result.design);
        replayed += 1;
      }
    }
    expect(replayed).toBeGreaterThanOrEqual(300);
  });

  it("replays a log recorded before ADR 0183 to the design it recorded, with no cabinet over the fridge", () => {
    let replayed = 0;
    for (const cabinetDepthMm of DEPTHS_MM) {
      for (const room of seededRooms(240, [
        LOWEST_CEILING_THAT_FITS_MM,
        HIGHEST_SHORTENED_CEILING_MM,
        OPENING_TOP_MM,
        OPENING_TOP_MM + 200,
      ])) {
        const recorded = outcomeOf(() =>
          beforeAdr0183(() => generate(room, cabinetDepthMm)),
        ).result;
        if (!recorded?.ok) continue;
        const replay = replayGenerationLog({
          log: recorded.log,
          probeAt: createFakeProbeFactory(),
        });
        expect(replay, JSON.stringify(room)).toStrictEqual(recorded.design);
        expect(
          replay.placements.some(
            (placement) =>
              placement.body.buildId === "wall-cabinet" &&
              placement.y0Mm === FRIDGE_TOP_MM,
          ),
        ).toBe(false);
        replayed += 1;
      }
    }
    expect(replayed).toBeGreaterThanOrEqual(300);
  });
});

describe("the price of a generated kitchen at the new cabinet heights (decision 6, ADR 0177)", () => {
  function priced(design: Design, cabinetDepthMm: number): PricedDesign {
    const result = priceDesign({
      design,
      catalog: buildKitchenLBodyCatalog(cabinetDepthMm),
      book: SAMPLE_PRICE_BOOK,
      pricingVersion: SAMPLE_PRICE_BOOK.version,
      deepeningRows: MEASURED_DEEPENING_ROWS,
      availability: NOTHING_DISABLED,
    });
    if (!result.ok) throw new Error(`pricing refused: ${result.failure.code}`);
    return result.priced;
  }

  it("prices every generated design with the cabinet, and the total grows by its line, its hardware and (at 700) the depth uplift only", () => {
    const reach = new Reach();
    for (const cabinetDepthMm of DEPTHS_MM) {
      for (const room of seededRooms(150, [
        LOWEST_CEILING_THAT_FITS_MM,
        MIDDLE_SHORTENED_CEILING_MM,
        HIGHEST_SHORTENED_CEILING_MM,
        OPENING_TOP_MM,
        OPENING_TOP_MM + 200,
      ])) {
        const result = outcomeOf(() => generate(room, cabinetDepthMm)).result;
        if (!result?.ok) continue;
        const overStep = overBodyStepOf(result);
        if (overStep?.status !== "placed") continue;
        const label = JSON.stringify(room);
        const withIt = priced(result.design, cabinetDepthMm);
        const withoutIt = priced(
          {
            ...result.design,
            placements: result.design.placements.filter(
              ({ id }) => id !== overStep.placementId,
            ),
          },
          cabinetDepthMm,
        );
        const cabinetLine = withIt.lines.find(
          (line) =>
            line.kind === "cabinet" &&
            line.placementId === overStep.placementId,
        );

        expect(cabinetLine?.kind, label).toBe("cabinet");
        expect(cabinetLine?.amountMinor, label).toBeGreaterThan(0);
        expect(
          cabinetLine?.kind === "cabinet" ? cabinetLine.pricedAsBuildId : "",
          label,
        ).toBe("wall-cabinet");
        const changed = withIt.lines
          .filter((line) => {
            const other = withoutIt.lines.find(
              ({ lineId }) => lineId === line.lineId,
            );
            return other?.amountMinor !== line.amountMinor;
          })
          .map((line) => line.kind);
        expect(
          changed.filter((kind) => kind !== "cabinet"),
          label,
        ).toEqual(
          cabinetDepthMm === 700 ? ["hardware", "depth"] : ["hardware"],
        );
        expect(withIt.totalMinor, label).toBeGreaterThan(withoutIt.totalMinor);
        expect(withIt.overflowingPlacementIds, label).toEqual(
          withoutIt.overflowingPlacementIds,
        );
        reach.note(`priced @${String(cabinetDepthMm)}`);
      }
    }
    expect(reach.of("priced @600")).toBeGreaterThanOrEqual(80);
    expect(reach.of("priced @700")).toBeGreaterThanOrEqual(80);
  });

  it("never prices a taller cabinet below a shorter one in the same room, across every ceiling from the lowest that fits to the grid's last level", () => {
    const room = { shape: "L", widthMm: 4100, depthMm: 3300 } as const;
    let previous = 0;
    const amounts = new Set<number>();
    for (
      let heightMm = LOWEST_CEILING_THAT_FITS_MM;
      heightMm <= OPENING_TOP_MM;
      heightMm += 1
    ) {
      const result = generate({ ...room, heightMm }, 600);
      const overStep = overBodyStepOf(result);
      if (!result.ok || overStep?.status !== "placed") {
        throw new Error(`not placed at ${String(heightMm)}`);
      }
      const line = priced(result.design, 600).lines.find(
        (candidate) =>
          candidate.kind === "cabinet" &&
          candidate.placementId === overStep.placementId,
      );
      const amount = line?.amountMinor ?? 0;
      expect(amount, `at ${String(heightMm)}`).toBeGreaterThanOrEqual(previous);
      previous = amount;
      amounts.add(amount);
    }
    // The book steps the price with the height (ADR 0070 height tiers): both sides of the step are in range.
    expect(amounts.size).toBeGreaterThanOrEqual(2);
  });
});

describe("what a customer can do to a generated kitchen with the cabinet over its fridge (ADR 0183 dependency, ADR 0167)", () => {
  const ROOM: DesignRoom = {
    shape: "L",
    widthMm: 4100,
    depthMm: 3300,
    heightMm: OPENING_TOP_MM + 200,
  };

  function generated(cabinetDepthMm: number): {
    result: Generated;
    fridge: DesignPlacement;
    cabinet: DesignPlacement;
  } {
    const result = generate(ROOM, cabinetDepthMm);
    if (!result.ok) throw new Error("the reference L was refused");
    const fridgeStep = stepNamed(result, FRIDGE_STEP_ID);
    const overStep = overBodyStepOf(result);
    if (!fridgeStep || !overStep) throw new Error("no fridge or no cabinet");
    return {
      result,
      fridge: placementOf(result.design, fridgeStep),
      cabinet: placementOf(result.design, overStep),
    };
  }

  it("takes a cabinet-depth change either way and keeps the cabinet over the fridge, as wide, as tall and as high as before", () => {
    for (const [from, to] of [
      [600, 700],
      [700, 600],
    ] as const) {
      const { result, fridge, cabinet } = generated(from);
      const changed = setCabinetDepth({
        design: result.design,
        catalogAt: buildKitchenLBodyCatalog,
        probeAt: createFakeProbeFactory(),
        cabinetDepthMm: to,
        occurredAt: OCCURRED_AT,
      });
      if (!changed.ok)
        throw new Error(
          `${String(from)}->${String(to)} refused: ${changed.reason.code}`,
        );
      const after = changed.design.placements.find(
        ({ id }) => id === cabinet.id,
      );
      const fridgeAfter = changed.design.placements.find(
        ({ id }) => id === fridge.id,
      );

      expect(after?.wall).toBe(cabinet.wall);
      expect(after?.alongMm).toBe(fridgeAfter?.alongMm);
      expect(after?.body.widthMm).toBe(cabinet.body.widthMm);
      expect(after?.body.heightMm).toBe(cabinet.body.heightMm);
      expect(after?.y0Mm).toBe(cabinet.y0Mm);
    }
  });

  it("takes the fridge's removal and leaves the cabinet standing where it was, over the opened column", () => {
    const { result, fridge, cabinet } = generated(600);
    const removed = removePlacement({
      design: result.design,
      catalog: buildKitchenLBodyCatalog(600),
      target: { kind: "placement", id: fridge.id },
      occurredAt: OCCURRED_AT,
    });
    if (!removed.ok) throw new Error(`removal refused: ${removed.reason.code}`);

    expect(
      removed.design.placements.find(({ id }) => id === cabinet.id),
    ).toStrictEqual(cabinet);
    expect(removed.design.placements).toHaveLength(
      result.design.placements.length - 1,
    );
  });

  it("takes the cabinet's removal and is then the kitchen the earlier generator made, but for the ids and the stamp", () => {
    const { result, cabinet } = generated(600);
    const earlier = beforeAdr0183(() => generate(ROOM, 600));
    if (!earlier.ok) throw new Error("the earlier generator refused");
    const removed = removePlacement({
      design: result.design,
      catalog: buildKitchenLBodyCatalog(600),
      target: { kind: "placement", id: cabinet.id },
      occurredAt: OCCURRED_AT,
    });
    if (!removed.ok) throw new Error(`removal refused: ${removed.reason.code}`);
    const withoutId = ({ id, ...rest }: DesignPlacement) => {
      expect(id).toBeDefined();
      return JSON.stringify(rest);
    };

    expect(removed.design.placements.map(withoutId).sort()).toEqual(
      earlier.design.placements.map(withoutId).sort(),
    );
    expect(removed.design.emptyColumns).toStrictEqual(
      earlier.design.emptyColumns,
    );
    expect(removed.design.columnExtents).toStrictEqual(
      earlier.design.columnExtents,
    );
  });

  it("is never re-generated by a stored design's edit: a depth change on a kitchen generated before ADR 0183 adds no cabinet", () => {
    const earlier = beforeAdr0183(() => generate(ROOM, 600));
    if (!earlier.ok) throw new Error("the earlier generator refused");
    const changed = setCabinetDepth({
      design: earlier.design,
      catalogAt: buildKitchenLBodyCatalog,
      probeAt: createFakeProbeFactory(),
      cabinetDepthMm: 700,
      occurredAt: OCCURRED_AT,
    });
    if (!changed.ok) throw new Error(`refused: ${changed.reason.code}`);

    expect(changed.design.placements).toHaveLength(
      earlier.design.placements.length,
    );
    expect(
      changed.design.placements.filter(
        ({ y0Mm, body }) =>
          body.buildId === "wall-cabinet" && y0Mm === FRIDGE_TOP_MM,
      ),
    ).toEqual([]);
  });
});

describe("generation is the only reader of the declaration", () => {
  it("is read by `generate-kitchen.ts` and by no other production module that is not its own definition or the barrel", () => {
    const sourceRoot = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../src",
    );
    const readers: string[] = [];
    const visit = (directory: string): void => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) visit(full);
        else if (
          entry.name.endsWith(".ts") &&
          readFileSync(full, "utf8").includes("isAWallBodyOwedOver(")
        ) {
          readers.push(path.relative(sourceRoot, full));
        }
      }
    };
    visit(sourceRoot);

    expect(readers.sort()).toEqual([
      "generation/generate-kitchen.ts",
      "wall-body-over-it.ts",
    ]);
  });
});
