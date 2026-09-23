// ADR 0129 (wave 7I slice S1): the schema (D2), the one reader (D2) and generation staying canonical
// under either direction (D3, D1). `validateRoomInput` carrying the field and never reading it is
// covered in `validate-room.test.ts`, `.property.test.ts` and `.adversarial.test.ts` instead, since
// those suites already own that function's behaviour end to end.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { fc } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  cornerDirectionOf,
  DesignRoomSchema,
  generateKitchen,
  KITCHEN_L_DESIGN,
  type DesignRoom,
} from "../../src/index.js";
import { createFakeProbeFactory } from "../support/fake-probe.js";

const OCCURRED_AT = "2026-09-23T10:00:00.000Z";

const SOURCE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "src",
);

function sourceFiles(): readonly string[] {
  return readdirSync(SOURCE, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
    .map((entry) =>
      path.relative(SOURCE, path.join(entry.parentPath, entry.name)),
    );
}

function sourceOf(relativePath: string): string {
  return readFileSync(path.join(SOURCE, relativePath), "utf8");
}

// =================================================================================================
// 7I-A2 — the schema.
// =================================================================================================

describe("DesignRoomSchema — cornerDirection", () => {
  const VALID_ROOM = {
    shape: "L",
    widthMm: 3000,
    depthMm: 2500,
    heightMm: 2400,
  } as const;

  it.each([
    ["an absent key", {}],
    ["left", { cornerDirection: "left" }],
    ["right", { cornerDirection: "right" }],
  ])("parses the room with %s", (_name, extra) => {
    const result = DesignRoomSchema.safeParse({ ...VALID_ROOM, ...extra });

    expect(result.success).toBe(true);
  });

  it.each([
    ["a mis-cased value", "Right"],
    ["an empty string", ""],
    ["a nonsense word", "up"],
    ["a number", 1],
    ["an array", ["right"]],
  ])("refuses %s", (_name, cornerDirection) => {
    const result = DesignRoomSchema.safeParse({
      ...VALID_ROOM,
      cornerDirection,
    });

    expect(result.success).toBe(false);
  });

  it("refuses null explicitly, distinct from an absent key", () => {
    expect(
      DesignRoomSchema.safeParse({ ...VALID_ROOM, cornerDirection: null })
        .success,
    ).toBe(false);
  });
});

// =================================================================================================
// 7I-A3 — one reader.
// =================================================================================================

describe("cornerDirectionOf", () => {
  it("maps an absent key to left", () => {
    const room: DesignRoom = {
      shape: "L",
      widthMm: 3000,
      depthMm: 2500,
      heightMm: 2400,
    };

    expect(cornerDirectionOf(room)).toBe("left");
  });

  it.each(["left", "right"] as const)("reads an explicit %s", (direction) => {
    const room: DesignRoom = {
      shape: "L",
      widthMm: 3000,
      depthMm: 2500,
      heightMm: 2400,
      cornerDirection: direction,
    };

    expect(cornerDirectionOf(room)).toBe(direction);
  });
});

describe("room.cornerDirection has exactly one production reader in this package", () => {
  // Matched narrowly on the accessor a `DesignRoom` reader writes (`room.cornerDirection` or
  // `.room.cornerDirection`), so `validate-room.ts`'s `input.cornerDirection` — the *entered*
  // direction it carries onto the room it returns, never the stored field — does not false-positive.
  const READS_THE_STORED_FIELD = /\broom\.cornerDirection\b/;

  it("finds it read only in cornerDirectionOf itself", () => {
    const offenders = sourceFiles()
      .filter((file) => file !== `room${path.sep}corner-direction.ts`)
      .filter((file) => READS_THE_STORED_FIELD.test(sourceOf(file)));

    expect(offenders).toStrictEqual([]);
  });

  it("does read it there, so the pattern is not vacuous", () => {
    expect(
      READS_THE_STORED_FIELD.test(
        sourceOf(`room${path.sep}corner-direction.ts`),
      ),
    ).toBe(true);
  });
});

// =================================================================================================
// 7I-A5 — generation is canonical.
// =================================================================================================

describe("generateKitchen — canonical under either direction", () => {
  function generate(room: DesignRoom) {
    return generateKitchen({
      room,
      occurredAt: OCCURRED_AT,
      probeAt: createFakeProbeFactory(),
    });
  }

  type GeneratedKitchen = Extract<
    ReturnType<typeof generate>,
    { readonly ok: true }
  >;

  // The log's own `plan.room` echoes whatever room generation was asked to build (`run-layout.ts`'s
  // `KitchenCompositionPlan.room`), so it is expected to carry the same right-hand room the design
  // does; deep-equal is asserted on the log with that one field substituted back to compare the rest.
  function logWithRoom(log: GeneratedKitchen["log"], room: DesignRoom) {
    return { ...log, plan: { ...log.plan, room } };
  }

  it("yields a design differing from the left twin only in room.cornerDirection", () => {
    const left = KITCHEN_L_DESIGN.room;
    const right: DesignRoom = { ...left, cornerDirection: "right" };

    const leftResult = generate(left);
    const rightResult = generate(right);

    expect(leftResult.ok).toBe(true);
    expect(rightResult.ok).toBe(true);
    if (!leftResult.ok || !rightResult.ok) return;

    expect(rightResult.design).toStrictEqual({
      ...leftResult.design,
      room: right,
    });
    expect(rightResult.log).toStrictEqual(logWithRoom(leftResult.log, right));
  });

  it("holds over a sweep of rooms the reference policy accepts", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 900, max: 6300 }),
        fc.integer({ min: 1000, max: 6300 }),
        (widthMm, depthMm) => {
          const left: DesignRoom = {
            shape: "L",
            widthMm,
            depthMm,
            heightMm: KITCHEN_L_DESIGN.room.heightMm,
          };
          const right: DesignRoom = { ...left, cornerDirection: "right" };

          const leftResult = generate(left);
          const rightResult = generate(right);

          expect(rightResult.ok).toBe(leftResult.ok);
          if (leftResult.ok && rightResult.ok) {
            expect(rightResult.design).toStrictEqual({
              ...leftResult.design,
              room: right,
            });
            expect(rightResult.log).toStrictEqual(
              logWithRoom(leftResult.log, right),
            );
          } else if (!leftResult.ok && !rightResult.ok) {
            expect(rightResult.reason).toStrictEqual(leftResult.reason);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("references no direction under generation/, but for one pre-existing dummy literal", () => {
    // `shell-design.ts`'s `isInsideTheEngineLimits` hands `validateRoomInput` a fixed
    // `CORNER_DIRECTION_VALIDATION_NEVER_READS` literal — pre-dates this wave, is not a read of
    // any room's actual direction, and validation never reads it either way (ADR 0108 decision 5).
    const PRE_EXISTING_DUMMY_LITERAL = `generation${path.sep}shell-design.ts`;

    const offenders = sourceFiles()
      .filter((file) => file.startsWith(`generation${path.sep}`))
      .filter((file) => file !== PRE_EXISTING_DUMMY_LITERAL)
      .filter((file) => sourceOf(file).includes("cornerDirection"));

    expect(offenders).toStrictEqual([]);
  });
});
