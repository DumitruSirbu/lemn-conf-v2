// What the hardware screens are drawn from: the classes of the active book and the draft's creations beside them, with
// each rate as it is and as the draft would leave it.
import { describe, expect, it } from "vitest";

import {
  HARDWARE_RATE_FIELDS,
  SAMPLE_PRICE_BOOK,
  type DraftChange,
} from "@lemnaria/configurator-domain";

import {
  deriveHardware,
  hardwareClassOf,
  type HardwareDerivation,
} from "@/price-dashboard/hardware-model";

import { stateOf } from "./dashboard-state-fixture";

const HETTICH = "hardware.soft-close";
const CREATED = "hardware.economic";

const CREATION: readonly DraftChange[] = [
  {
    address: { kind: "hardware-tier-created", tierId: CREATED },
    value: { name: "GTV Economic", description: "Pentru oferte economice" },
  },
  ...HARDWARE_RATE_FIELDS.map(
    (field): DraftChange => ({
      address: { kind: "hardware", tierId: CREATED, field },
      value: 2_000,
    }),
  ),
];

function readyOf(changes: readonly DraftChange[] = []) {
  const derivation: HardwareDerivation = deriveHardware(stateOf(changes));
  if (derivation.kind !== "ready") throw new Error("the draft did not apply");
  return derivation;
}

describe("the classes", () => {
  it("are the book's, in its order, with the draft's creations after them", () => {
    const { classes } = readyOf(CREATION);

    expect(classes.map((held) => held.tierId)).toEqual([
      ...SAMPLE_PRICE_BOOK.hardware.tiers.map((tier) => tier.tierId),
      CREATED,
    ]);
  });

  it("have a column for each rate the book states, the lift fourth", () => {
    expect(readyOf().rates).toEqual([
      "perHingeMinor",
      "perDrawerMinor",
      "perPushToOpenMinor",
      "perLiftMinor",
    ]);
  });

  it("carry the active rate and the one the draft leaves, which differ only where the draft changes one", () => {
    const hettich = hardwareClassOf(
      readyOf([
        {
          address: { kind: "hardware", tierId: HETTICH, field: "perLiftMinor" },
          value: 70_000,
        },
      ]),
      HETTICH,
    );

    expect(
      hettich?.rates.map(({ field, activeMinor, pendingMinor }) => [
        field,
        activeMinor === pendingMinor,
      ]),
    ).toEqual([
      ["perHingeMinor", true],
      ["perDrawerMinor", true],
      ["perPushToOpenMinor", true],
      ["perLiftMinor", false],
    ]);
    expect(hettich?.isModified).toBe(true);
  });

  it("say a class only the draft holds is created, has no active rate and is modified", () => {
    const created = hardwareClassOf(readyOf(CREATION), CREATED);

    expect(created).toMatchObject({
      isCreated: true,
      isModified: true,
      isKeyed: false,
      isDeletionPending: false,
    });
    expect(created?.rates.map((rate) => rate.activeMinor)).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
  });

  it("say a class the draft deletes still stands in the active book, and is pending its deletion", () => {
    const hettich = hardwareClassOf(
      readyOf([
        {
          address: {
            kind: "item-deleted",
            item: { kind: "hardware", tierId: HETTICH },
          },
          value: true,
        },
      ]),
      HETTICH,
    );

    expect(hettich).toMatchObject({
      isDeletionPending: true,
      isCreated: false,
    });
  });

  it("read a catalogue row as keyed, and only a row with no key as authored", () => {
    const derivation = readyOf();

    expect(hardwareClassOf(derivation, "hardware.standard")?.isKeyed).toBe(
      true,
    );
    expect(hardwareClassOf(derivation, HETTICH)?.isKeyed).toBe(true);
  });

  it("are unreadable for a draft that does not apply, rather than drawn wrong", () => {
    expect(
      deriveHardware(
        stateOf([
          {
            address: {
              kind: "hardware",
              tierId: "hardware.stranger",
              field: "perLiftMinor",
            },
            value: 100,
          },
        ]),
      ),
    ).toEqual({ kind: "unreadable" });
  });
});
