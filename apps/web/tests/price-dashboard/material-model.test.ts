// What the materials screens are drawn from: the materials of the active book with each surcharge as it is and as the
// draft would leave it, and what the code declares of each one's colours.
import { describe, expect, it } from "vitest";

import {
  MATERIALS,
  paletteEntriesOf,
  SAMPLE_PRICE_BOOK,
  type DraftChange,
} from "@lemnaria/configurator-domain";

import {
  deriveMaterials,
  materialItemOf,
  materialNameOf,
  materialOf,
  surchargeAddressOf,
  type MaterialDerivation,
} from "@/price-dashboard/material-model";

import { stateOf } from "./dashboard-state-fixture";
import { MDF, PAL, VENEER } from "./material-harness";

const MDF_SURCHARGE: DraftChange = {
  address: surchargeAddressOf(MDF),
  value: 35,
};
const MDF_DELETION: DraftChange = {
  address: { kind: "item-deleted", item: { kind: "material", tierId: MDF } },
  value: true,
};

function readyOf(changes: readonly DraftChange[] = []) {
  const derivation: MaterialDerivation = deriveMaterials(stateOf(changes));
  if (derivation.kind !== "ready") throw new Error("the draft did not apply");
  return derivation;
}

function factsOf(tierId: string, changes: readonly DraftChange[] = []) {
  const facts = materialOf(readyOf(changes), tierId);
  if (facts === undefined) throw new Error(`no material ${tierId}`);
  return facts;
}

describe("the materials", () => {
  it("are the book's, in its order, and nothing the draft could add", () => {
    expect(readyOf().materials.map((held) => held.tierId)).toEqual(
      SAMPLE_PRICE_BOOK.material.tiers.map((tier) => tier.tierId),
    );
  });

  it("carry the active surcharge and the one the draft leaves, which differ only where the draft changes one", () => {
    const changed = factsOf(MDF, [MDF_SURCHARGE]);

    expect(changed.activePercent).toBe(
      SAMPLE_PRICE_BOOK.material.tiers.find((tier) => tier.tierId === MDF)
        ?.percentOfCabinets,
    );
    expect(changed.pendingPercent).toBe(35);
    expect(factsOf(VENEER, [MDF_SURCHARGE]).pendingPercent).toBe(
      factsOf(VENEER, [MDF_SURCHARGE]).activePercent,
    );
  });

  it("call the book's default the reference, and no other", () => {
    expect(factsOf(PAL).isReference).toBe(true);
    expect(factsOf(MDF).isReference).toBe(false);
    expect(factsOf(VENEER).isReference).toBe(false);
  });

  it("are modified only by a change that names them, whether a surcharge or a deletion", () => {
    expect(factsOf(MDF).isModified).toBe(false);
    expect(factsOf(MDF, [MDF_SURCHARGE]).isModified).toBe(true);
    expect(factsOf(MDF, [MDF_DELETION]).isModified).toBe(true);
    expect(factsOf(VENEER, [MDF_SURCHARGE]).isModified).toBe(false);
  });

  it("keep a deleted material, with its active surcharge, and say that the draft deletes it", () => {
    const deleted = factsOf(MDF, [MDF_DELETION]);

    expect(deleted.isDeletionPending).toBe(true);
    expect(deleted.pendingPercent).toBe(deleted.activePercent);
    expect(factsOf(MDF).isDeletionPending).toBe(false);
  });

  it("are not drawn from a draft that does not apply", () => {
    const refused: DraftChange = {
      address: surchargeAddressOf(PAL),
      value: 10,
    };

    expect(deriveMaterials(stateOf([refused]))).toEqual({
      kind: "unreadable",
    });
  });

  it("hold no material the book does not state", () => {
    expect(materialOf(readyOf(), "material.unknown")).toBeUndefined();
  });
});

describe("a material's colours, as the code declares them", () => {
  it("count the entries of a list: PAL's decors and veneer's woods", () => {
    const declared = (id: string) => {
      const material = MATERIALS.find(({ materialId }) => materialId === id);
      if (material === undefined) throw new Error(id);
      return paletteEntriesOf(material).length;
    };

    expect(factsOf(PAL).colours).toEqual({
      kind: "count",
      count: declared(PAL),
    });
    expect(factsOf(VENEER).colours).toEqual({
      kind: "count",
      count: declared(VENEER),
    });
    expect(declared(PAL)).toBeGreaterThan(0);
  });

  it("are a picker for painted MDF, which has no list to count", () => {
    expect(factsOf(MDF).colours).toEqual({ kind: "picker" });
  });
});

describe("the item and the name a material stands for", () => {
  it("is the material's own item, whatever the facts it is made from", () => {
    expect(materialItemOf(factsOf(MDF))).toEqual({
      kind: "material",
      tierId: MDF,
    });
  });

  it("names a material by the catalogue's words, and no other kind of item at all", () => {
    const derivation = readyOf();
    const bookText = (authored: string, key: string | undefined) =>
      key === undefined ? authored : `key:${key}`;

    expect(
      materialNameOf(derivation, bookText, { kind: "material", tierId: MDF }),
    ).toBe("key:priceBook.material.painted-mdf.name");
    expect(
      materialNameOf(derivation, bookText, {
        kind: "hardware",
        tierId: "hardware.standard",
      }),
    ).toBe("");
    expect(
      materialNameOf(derivation, bookText, {
        kind: "material",
        tierId: "material.unknown",
      }),
    ).toBe("");
  });
});
