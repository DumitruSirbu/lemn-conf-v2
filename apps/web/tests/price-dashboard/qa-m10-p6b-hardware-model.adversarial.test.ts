// The words of a hardware class are the draft's, not the active version's: a reworded created class shows its new name and
// description in the facts the list and the page both read, a catalogue class keeps its keys, and a class the draft deletes
// keeps the words it had.
import { describe, expect, it } from "vitest";

import {
  HARDWARE_RATE_FIELDS,
  SAMPLE_PRICE_BOOK,
  type DraftChange,
  type HardwareTier,
} from "@lemnaria/configurator-domain";

import {
  deriveHardware,
  hardwareClassOf,
  type HardwareClassFacts,
} from "@/price-dashboard/hardware-model";

import { stateOf } from "./dashboard-state-fixture";

const PUBLISHED = "hardware.economic";
const STANDARD = "hardware.standard";
const PUBLISHED_NAME = "GTV Economic";
const PUBLISHED_DESCRIPTION = "Pentru oferte economice";

const publishedTier = {
  tierId: PUBLISHED,
  ruleId: PUBLISHED,
  name: PUBLISHED_NAME,
  description: PUBLISHED_DESCRIPTION,
  ...Object.fromEntries(HARDWARE_RATE_FIELDS.map((field) => [field, 2_000])),
} as unknown as HardwareTier;

function keyed(): HardwareTier {
  const found = SAMPLE_PRICE_BOOK.hardware.tiers.find(
    (tier) => tier.tierId === STANDARD,
  );
  if (found === undefined) throw new Error(`no class ${STANDARD}`);
  return found;
}

function factsOf(
  tierId: string,
  changes: readonly DraftChange[],
): HardwareClassFacts {
  const base = stateOf(changes);
  const state = {
    ...base,
    active: {
      ...base.active,
      book: {
        ...SAMPLE_PRICE_BOOK,
        hardware: {
          ...SAMPLE_PRICE_BOOK.hardware,
          tiers: [...SAMPLE_PRICE_BOOK.hardware.tiers, publishedTier],
        },
      },
    },
  };
  const derivation = deriveHardware(state);
  if (derivation.kind !== "ready") throw new Error("the draft did not apply");
  const facts = hardwareClassOf(derivation, tierId);
  if (facts === undefined) throw new Error(`no class ${tierId}`);
  return facts;
}

const wordsChange = (
  tierId: string,
  field: "name" | "description",
  value: string,
): DraftChange => ({
  address: {
    kind: "created-row-text",
    item: { kind: "hardware", tierId },
    field,
  },
  value,
});

describe("a published class the catalogue does not key", () => {
  it("reads its words as published when the draft holds none", () => {
    const { name, description, isModified } = factsOf(PUBLISHED, []);

    expect(name).toEqual({ authored: PUBLISHED_NAME, key: undefined });
    expect(description).toEqual({
      authored: PUBLISHED_DESCRIPTION,
      key: undefined,
    });
    expect(isModified).toBe(false);
  });

  it("reads the draft's name, keeps the published description, and is modified", () => {
    const facts = factsOf(PUBLISHED, [
      wordsChange(PUBLISHED, "name", "GTV Premium"),
    ]);

    expect(facts.name.authored).toBe("GTV Premium");
    expect(facts.description.authored).toBe(PUBLISHED_DESCRIPTION);
    expect(facts.isModified).toBe(true);
    expect(facts.isKeyed).toBe(false);
  });

  it("reads the draft's description, keeps the published name", () => {
    const facts = factsOf(PUBLISHED, [
      wordsChange(PUBLISHED, "description", "Alta descriere"),
    ]);

    expect(facts.name.authored).toBe(PUBLISHED_NAME);
    expect(facts.description.authored).toBe("Alta descriere");
  });

  it("keeps the published words, and stays deleted, when the draft deletes it", () => {
    const facts = factsOf(PUBLISHED, [
      {
        address: {
          kind: "item-deleted",
          item: { kind: "hardware", tierId: PUBLISHED },
        },
        value: true,
      },
    ]);

    expect(facts.isDeletionPending).toBe(true);
    expect(facts.name.authored).toBe(PUBLISHED_NAME);
    expect(facts.description.authored).toBe(PUBLISHED_DESCRIPTION);
  });

  it("does not move the words of another class", () => {
    const facts = factsOf(STANDARD, [
      wordsChange(PUBLISHED, "name", "GTV Premium"),
    ]);

    expect(facts.name).toEqual({
      authored: keyed().name,
      key: keyed().nameKey,
    });
    expect(facts.isModified).toBe(false);
  });
});

describe("a class the catalogue keys", () => {
  it("keeps its keys and flags itself keyed", () => {
    const { name, description, isKeyed } = factsOf(STANDARD, []);

    expect(isKeyed).toBe(true);
    expect(keyed().nameKey).toBeDefined();
    expect(keyed().descriptionKey).toBeDefined();
    expect(name).toEqual({ authored: keyed().name, key: keyed().nameKey });
    expect(description).toEqual({
      authored: keyed().description,
      key: keyed().descriptionKey,
    });
  });
});
