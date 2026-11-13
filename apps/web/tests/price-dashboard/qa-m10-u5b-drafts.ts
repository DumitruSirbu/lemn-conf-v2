// The drafts the adversarial tests of the structural diff rows sweep: a person's steps, in every order, that write
// a created class, a created accessory, their rewording, their deletion and ordinary edits. Nothing here asserts.
import fc from "fast-check";
import {
  applyChanges,
  isSameAddress,
  readEditableFields,
  type DraftChange,
} from "@lemnaria/configurator-domain";

import {
  ACTIVE,
  change,
  createAccessoryChange,
  createTierChanges,
  firstNamedBuildId,
  NEW_ACCESSORY,
  NEW_TIER,
} from "./publish-structural-rows.support";

const TIER = { kind: "hardware", tierId: NEW_TIER } as const;
const ACCESSORY = { kind: "accessory", accessoryId: NEW_ACCESSORY } as const;

const existingHardwareRate = readEditableFields(ACTIVE).find(
  (reading) => reading.address.kind === "hardware",
);
if (existingHardwareRate === undefined) throw new Error("no hardware rate");

/** Each is one step of a person's work: the changes it writes, which replace the draft's change of the same address. */
const STEPS: readonly (readonly DraftChange[])[] = [
  createTierChanges(),
  [createAccessoryChange(firstNamedBuildId())],
  [
    change(
      { kind: "created-row-text", item: TIER, field: "name" },
      "Economic plus",
    ),
  ],
  [
    change(
      { kind: "created-row-text", item: TIER, field: "description" },
      "Alta descriere.",
    ),
  ],
  [
    change(
      { kind: "created-row-text", item: ACCESSORY, field: "name" },
      "Soclu nou",
    ),
  ],
  [
    change(
      { kind: "created-row-text", item: ACCESSORY, field: "description" },
      "Descriere noua.",
    ),
  ],
  [
    change(
      { kind: "hardware", tierId: NEW_TIER, field: "perHingeMinor" },
      5_500,
    ),
  ],
  [change({ kind: "item-deleted", item: TIER }, true)],
  [change({ kind: "item-deleted", item: ACCESSORY }, true)],
  [change(existingHardwareRate.address, 12_300)],
  [
    change(
      { kind: "cabinet", ruleId: "cabinet.base-cabinet", field: "anchorMinor" },
      66_600,
    ),
  ],
  [change({ kind: "provisional" }, false)],
];

function draftOf(steps: readonly (readonly DraftChange[])[]): DraftChange[] {
  return steps.reduce<DraftChange[]>(
    (draft, step) =>
      step.reduce(
        (held, next) => [
          ...held.filter((kept) => !isSameAddress(kept.address, next.address)),
          next,
        ],
        draft,
      ),
    [],
  );
}

export const applicableDrafts = fc
  .array(fc.constantFrom(...STEPS), { minLength: 1, maxLength: 7 })
  .map(draftOf)
  .filter((draft) => applyChanges(ACTIVE, draft).ok);

/** A draft that deletes no row it creates: that pair leaves no row at all, which is ruled and drawn by its own test below. */
export const draftsThatDeleteNothingTheyCreate = applicableDrafts.filter(
  (draft) =>
    !draft.some(
      ({ address }) =>
        address.kind === "item-deleted" &&
        draft.some(
          ({ address: created }) =>
            (created.kind === "hardware-tier-created" &&
              address.item.kind === "hardware" &&
              created.tierId === address.item.tierId) ||
            (created.kind === "accessory-created" &&
              address.item.kind === "accessory" &&
              created.accessoryId === address.item.accessoryId),
        ),
    ),
);
