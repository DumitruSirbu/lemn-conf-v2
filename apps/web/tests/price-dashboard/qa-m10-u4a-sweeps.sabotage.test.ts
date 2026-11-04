// The properties of `qa-m10-u4a-sweeps.adversarial.test.ts` hold the form's judgement of a class's words to the book's. With
// the form's judgement sabotaged to accept everything, the same property finds a counterexample at once; with it as it is,
// none, so the property is one that can fail.
import { fc } from "@fast-check/vitest";
import { describe, expect, it, vi } from "vitest";

import {
  HARDWARE_RATE_FIELDS,
  SAMPLE_PRICE_BOOK,
  applyChanges,
  judgeCreatedRowText,
  type DraftChange,
} from "@lemnaria/configurator-domain";

const world = vi.hoisted(() => ({ isSabotaged: false }));

vi.mock("@lemnaria/configurator-domain", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@lemnaria/configurator-domain")>();
  return {
    ...actual,
    judgeCreatedRowText: (raw: unknown, field: "name" | "description") =>
      world.isSabotaged
        ? { ok: true as const, text: String(raw) }
        : actual.judgeCreatedRowText(raw, field),
  };
});

const creationOf = (name: string): readonly DraftChange[] => [
  {
    address: { kind: "hardware-tier-created", tierId: "hardware.sweep" },
    value: { name, description: "" },
  },
  ...HARDWARE_RATE_FIELDS.map(
    (field): DraftChange => ({
      address: { kind: "hardware", tierId: "hardware.sweep", field },
      value: 1_000,
    }),
  ),
];

const acceptedTextIsTakenByTheBook = fc.property(
  fc.string({ unit: "binary", maxLength: 30 }),
  (name) => {
    const judged = judgeCreatedRowText(name, "name");
    return (
      !judged.ok || applyChanges(SAMPLE_PRICE_BOOK, creationOf(judged.text)).ok
    );
  },
);

describe("a sabotage of the form's judgement of a class's name", () => {
  it("finds no counterexample while the judgement is the domain's", () => {
    world.isSabotaged = false;

    expect(
      fc.check(acceptedTextIsTakenByTheBook, { numRuns: 500 }).failed,
    ).toBe(false);
  });

  it("finds a counterexample once the judgement accepts everything", () => {
    world.isSabotaged = true;

    expect(
      fc.check(acceptedTextIsTakenByTheBook, { numRuns: 500 }).failed,
    ).toBe(true);
  });
});
