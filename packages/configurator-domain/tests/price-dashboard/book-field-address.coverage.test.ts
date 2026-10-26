// M10 X0: the field address covers every editable field the mockup draws in frames D2 to D7, listed frame by frame,
// and the two things it deliberately omits are listed with their rulings (plan §10, X0 acceptance).
//
// Source of the rows: `docs/design/mockups/Lemnaria Dashboard.dc.html`, the `detail`, `d4edit`, `d5edit`, `d6edit`,
// `d7` and `rcB` functions and the frames' notes (script lines 635-775 and 829-883).
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  BOOK_FIELD_ADDRESS_KINDS,
  CABINET_RULE_FIELDS,
  CREATED_ROW_TEXT_FIELDS,
  HARDWARE_RATE_FIELDS,
  ITEM_KINDS,
  type BookFieldAddress,
  type BookFieldAddressKind,
  type DraftChange,
} from "../../src/price-dashboard/book-field-address.js";
import type { CatalogueAvailability } from "../../src/pricing/catalogue-availability.js";

interface DrawnField {
  readonly frame: string;
  /** The mockup's own field id or label. */
  readonly drawn: string;
  readonly address: BookFieldAddress;
}

const BASE_3_DRAWER = "cabinet.base-3drawer";
const WALL_LIFT = "cabinet.wall-lift";
const CARGO = "cabinet.base-bottle-cargo";
const HETTICH = "hardware.hettich";
const MDF = "material.painted-mdf";
const DRYING_RACK = "accessory.dish-drying-rack";

const DRAWN_FIELDS: readonly DrawnField[] = [
  // D2: the list. The price at the default width is edited in the table, and the depth rule is a card above it.
  {
    frame: "D2A",
    drawn: "inline price at the default width",
    address: { kind: "cabinet", ruleId: BASE_3_DRAWER, field: "anchorMinor" },
  },
  {
    frame: "D2C",
    drawn: "inline price, a wrong value (field d3s)",
    address: { kind: "cabinet", ruleId: BASE_3_DRAWER, field: "anchorMinor" },
  },
  {
    frame: "D2E1",
    drawn: "rc-edit: the depth rule's percentage",
    address: { kind: "depth-rule" },
  },
  // D2D: the bulk percentage is a group of cabinet and size changes, never an address of its own (A-14).
  {
    frame: "D2D",
    drawn: "bulk-p, applied to a price at the default width",
    address: { kind: "cabinet", ruleId: BASE_3_DRAWER, field: "anchorMinor" },
  },
  {
    frame: "D2D",
    drawn: "bulk-p, applied to a width step",
    address: {
      kind: "cabinet",
      ruleId: BASE_3_DRAWER,
      field: "perStepWiderMinor",
    },
  },
  {
    frame: "D2D",
    drawn: "bulk-p, applied to a price per size",
    address: { kind: "cabinet-size", ruleId: CARGO, widthMm: 200 },
  },
  // D3: the cabinet page. The keys are the mockup's `keysOf(c)`.
  {
    frame: "D3A",
    drawn: "anchor (price at the default width)",
    address: { kind: "cabinet", ruleId: BASE_3_DRAWER, field: "anchorMinor" },
  },
  {
    frame: "D3A",
    drawn: "plus (step per 50 mm wider)",
    address: {
      kind: "cabinet",
      ruleId: BASE_3_DRAWER,
      field: "perStepWiderMinor",
    },
  },
  {
    frame: "D3C",
    drawn: "minus (step per 50 mm narrower)",
    address: {
      kind: "cabinet",
      ruleId: BASE_3_DRAWER,
      field: "perStepNarrowerMinor",
    },
  },
  {
    frame: "D3D",
    drawn: "door (extra door leaf)",
    address: {
      kind: "cabinet",
      ruleId: WALL_LIFT,
      field: "perExtraDoorLeafMinor",
    },
  },
  {
    frame: "D3D",
    drawn: "hstep (height step)",
    address: {
      kind: "cabinet",
      ruleId: WALL_LIFT,
      field: "perHeightStepMinor",
    },
  },
  {
    frame: "D3F",
    drawn: "s200 (one price per fixed size)",
    address: { kind: "cabinet-size", ruleId: CARGO, widthMm: 200 },
  },
  {
    frame: "D3F",
    drawn: "s300",
    address: { kind: "cabinet-size", ruleId: CARGO, widthMm: 300 },
  },
  // D4: hardware. The four columns and fields hw-bal, hw-gl, hw-push, hw-lift (HWF).
  {
    frame: "D4B",
    drawn: "hw-bal (price per hinge)",
    address: { kind: "hardware", tierId: HETTICH, field: "perHingeMinor" },
  },
  {
    frame: "D4B",
    drawn: "hw-gl (price per drawer, the runner pair)",
    address: { kind: "hardware", tierId: HETTICH, field: "perDrawerMinor" },
  },
  {
    frame: "D4B",
    drawn: "hw-push (price per push-to-open latch)",
    address: { kind: "hardware", tierId: HETTICH, field: "perPushToOpenMinor" },
  },
  {
    frame: "D4B",
    drawn: "hw-lift (price per lift mechanism)",
    address: { kind: "hardware", tierId: HETTICH, field: "perLiftMinor" },
  },
  {
    frame: "D4C",
    drawn: "new class: name and description (RO)",
    address: {
      kind: "hardware-tier-created",
      tierId: "hardware.economy",
    },
  },
  {
    frame: "D4C",
    drawn: "new class: hw-balan, a rate of the new class",
    address: {
      kind: "hardware",
      tierId: "hardware.economy",
      field: "perHingeMinor",
    },
  },
  {
    frame: "D4B",
    drawn: "name of a class the dashboard created",
    address: {
      kind: "created-row-text",
      item: { kind: "hardware", tierId: "hardware.economy" },
      field: "name",
    },
  },
  {
    frame: "D4B",
    drawn: "description of a class the dashboard created",
    address: {
      kind: "created-row-text",
      item: { kind: "hardware", tierId: "hardware.economy" },
      field: "description",
    },
  },
  {
    frame: "D4D",
    drawn: "delete class (an unused, non-default class)",
    address: {
      kind: "item-deleted",
      item: { kind: "hardware", tierId: "hardware.economy" },
    },
  },
  // D5: materials. One percentage over PAL, m-p. A material is deleted from D5D.
  {
    frame: "D5B",
    drawn: "m-p (percentage over PAL)",
    address: { kind: "material", tierId: MDF, field: "percentOfCabinets" },
  },
  {
    frame: "D5D",
    drawn: "delete material (an unused, non-default material)",
    address: { kind: "item-deleted", item: { kind: "material", tierId: MDF } },
  },
  // D6: accessories. The price per unit of a built-in or of a linked one, and the creation of a linked one.
  {
    frame: "D6B",
    drawn: "a-p (price per unit), a built-in accessory",
    address: {
      kind: "accessory",
      accessoryId: "dishDryingRack",
      field: "perUnitMinor",
    },
  },
  {
    frame: "D6B",
    drawn: "a-p (price per unit), a linked accessory",
    address: {
      kind: "accessory",
      accessoryId: DRYING_RACK,
      field: "perUnitMinor",
    },
  },
  {
    frame: "D6",
    drawn: "add accessory: name, description, linked cabinet type, price",
    address: {
      kind: "accessory-created",
      accessoryId: DRYING_RACK,
    },
  },
  {
    frame: "D6B",
    drawn: "name of an accessory the dashboard created",
    address: {
      kind: "created-row-text",
      item: { kind: "accessory", accessoryId: DRYING_RACK },
      field: "name",
    },
  },
  {
    frame: "D6B",
    drawn: "description of an accessory the dashboard created",
    address: {
      kind: "created-row-text",
      item: { kind: "accessory", accessoryId: DRYING_RACK },
      field: "description",
    },
  },
  {
    frame: "D6",
    drawn: "delete (an unused accessory the dashboard created)",
    address: {
      kind: "item-deleted",
      item: { kind: "accessory", accessoryId: DRYING_RACK },
    },
  },
  // D7: publish. The "Sume provizorii" switch (FLAGP) is the one field on the page.
  {
    frame: "D7A",
    drawn: "FLAGP: provisional amounts, on",
    address: { kind: "provisional" },
  },
  {
    frame: "D7C",
    drawn: "FLAGP: provisional amounts, off",
    address: { kind: "provisional" },
  },
];

/** What a frame draws that is not a field of the book, and why, with the record that rules it. */
interface DeliberateAbsence {
  readonly frame: string;
  readonly drawn: string;
  readonly ruling: string;
  readonly why: string;
}

const DELIBERATE_ABSENCES: readonly DeliberateAbsence[] = [
  // The two the acceptance names.
  {
    frame: "D4B, D4C",
    drawn: "active-in-configurator toggle",
    ruling: "A-17",
    why: "Availability applies on save, outside the draft and the book.",
  },
  {
    frame: "D5B, D5F",
    drawn: "active-in-configurator toggle and the Activate button",
    ruling: "A-17",
    why: "Availability applies on save, outside the draft and the book.",
  },
  {
    frame: "D6B",
    drawn: "active toggle",
    ruling: "A-17",
    why: "Availability applies on save, outside the draft and the book.",
  },
  {
    frame: "D4E, D5C, D5G, D6C",
    drawn: "deactivate dialogs",
    ruling: "A-17",
    why: "The same switch, immediate and logged.",
  },
  {
    frame: "D5B",
    drawn: "description, RU tab",
    ruling: "A-21",
    why: "The dashboard authors Romanian only; Russian waits for the translation feature (ADR 0174 O-L3-3).",
  },
  {
    frame: "D4B, D5B, D6B",
    drawn: "name and description RO/RU tabs",
    ruling: "A-21",
    why: "No Russian authored-text field exists anywhere in the book.",
  },
  // The rest of what the frames draw, none of which is a settable field of the book.
  {
    frame: "D4B, D5B",
    drawn: "name and description of a keyed row (Hettich, MDF)",
    ruling: "A-21",
    why: "A keyed row's text is read-only; only a created row's text is a change.",
  },
  {
    frame: "D5A",
    drawn: "PAL: 0 %, the reference row, not editable",
    ruling: "A-5",
    why: "PAL is the fixed 0 % reference and has no address.",
  },
  {
    frame: "D3A",
    drawn: "with-hardware and depth 600 / 700 switches, the preview table",
    ruling: "plan §2 (D3)",
    why: "View state of the preview; nothing is stored.",
  },
  {
    frame: "D3E",
    drawn: "customer-supplied hood: no fields",
    ruling: "plan §5 A-19",
    why: "A customer-supplied row is never priced and carries no field.",
  },
  {
    frame: "D3",
    drawn: "anchorWidthMm and anchorHeightMm",
    ruling: "A-2",
    why: "Book data no frame draws as a field; a book judgement keeps the width equal to the catalogue's default width.",
  },
  {
    frame: "D6B",
    drawn: "linked cabinet type, once the accessory exists",
    ruling: "unruled (reported)",
    why: "§8.4 b has an arm for the link at creation and none for editing it afterwards; no arm is invented.",
  },
  {
    frame: "D7",
    drawn: 'status "estimate"',
    ruling: "plan §8.4 a [mock L894]",
    why: "The dashboard never edits it.",
  },
  {
    frame: "D8C",
    drawn: "restore prices",
    ruling: "A-15",
    why: "Restore adds the version's differing fields as ordinary changes; it has no address of its own.",
  },
  {
    frame: "D9A-D9C",
    drawn: "the six new-kitchen defaults",
    ruling: "A-9",
    why: "Stored unversioned beside the book, applied at once, and never a draft change.",
  },
];

const COVERED_KINDS = new Set(DRAWN_FIELDS.map((row) => row.address.kind));

function addressFieldsOfKind(kind: BookFieldAddressKind): readonly string[] {
  return DRAWN_FIELDS.filter((row) => row.address.kind === kind).flatMap(
    (row) => ("field" in row.address ? [row.address.field] : []),
  );
}

describe("the field address against the mockup's frames D2 to D7", () => {
  it("covers every address kind at least once", () => {
    expect([...COVERED_KINDS].sort()).toEqual(
      [...BOOK_FIELD_ADDRESS_KINDS].sort(),
    );
  });

  it("covers every cabinet field the D3 page draws, and no frame draws one the address lacks", () => {
    expect(new Set(addressFieldsOfKind("cabinet"))).toEqual(
      new Set(CABINET_RULE_FIELDS),
    );
  });

  it("covers the four hardware rates of D4, the lift rate included", () => {
    expect(new Set(addressFieldsOfKind("hardware"))).toEqual(
      new Set(HARDWARE_RATE_FIELDS),
    );
    expect(HARDWARE_RATE_FIELDS).toContain("perLiftMinor");
  });

  it("covers the text a created row carries, in both of the fields the row kinds have", () => {
    const covered = DRAWN_FIELDS.flatMap((row) =>
      row.address.kind === "created-row-text" ? [row.address.field] : [],
    );

    expect(new Set(covered)).toEqual(new Set(CREATED_ROW_TEXT_FIELDS));
  });

  it("covers every item kind a deletion or an availability can name, or says why not", () => {
    const deletable = new Set(
      DRAWN_FIELDS.flatMap((row) =>
        row.address.kind === "item-deleted" ? [row.address.item.kind] : [],
      ),
    );

    expect([...deletable].sort()).toEqual([
      "accessory",
      "hardware",
      "material",
    ]);
    expect(ITEM_KINDS).toEqual([
      "material",
      "hardware",
      "finish",
      "handle",
      "accessory",
    ]);
  });

  it("names a frame from D2 to D7 in every row", () => {
    for (const row of DRAWN_FIELDS) {
      expect(row.frame).toMatch(/^D[2-7]/);
    }
  });

  it("lists the absences, each with a ruling and the frames it concerns", () => {
    for (const absence of DELIBERATE_ABSENCES) {
      expect(absence.ruling).not.toBe("");
      expect(absence.why).not.toBe("");
      expect(absence.frame).toMatch(/^D\d/);
    }
    const rulings = new Set(
      DELIBERATE_ABSENCES.map((absence) => absence.ruling),
    );
    expect(rulings).toContain("A-17");
    expect(rulings).toContain("A-21");
  });
});

describe("what the address does not contain", () => {
  it("has no activation arm: availability is not a draft change (A-17)", () => {
    const kinds: readonly string[] = BOOK_FIELD_ADDRESS_KINDS;

    expect(kinds.filter((kind) => /activ|enable|disable/i.test(kind))).toEqual(
      [],
    );

    const activation: BookFieldAddress = {
      // @ts-expect-error an activation is not a draft change
      kind: "item-activation",
      item: { kind: "material", tierId: MDF },
      active: false,
    };
    expect(activation.kind).toBe("item-activation");
  });

  it("has no Russian authored-text field: the text of a created row is Romanian only (A-21)", () => {
    const russianField: BookFieldAddress = {
      kind: "created-row-text",
      item: { kind: "hardware", tierId: HETTICH },
      // @ts-expect-error the text field list holds name and description and no language
      field: "name-ru",
    };
    const russianClass: DraftChange = {
      address: { kind: "hardware-tier-created", tierId: HETTICH },
      value: {
        name: "x",
        description: "y",
        // @ts-expect-error a created class carries no Russian member
        nameRu: "z",
      },
    };
    const russianAccessory: DraftChange = {
      address: { kind: "accessory-created", accessoryId: DRYING_RACK },
      value: {
        linkedBuildId: "base-sink",
        perUnitMinor: 1,
        name: "x",
        // @ts-expect-error a created accessory carries no Russian member
        descriptionRu: "z",
      },
    };

    expect([russianField, russianClass, russianAccessory]).toHaveLength(3);
  });

  it("names neither an activation nor a language anywhere in the address module's code", () => {
    const source = readFileSync(
      path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        "../../src/price-dashboard/book-field-address.ts",
      ),
      "utf8",
    );
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");

    expect(code).not.toMatch(/\bactive\b/i);
    expect(code).not.toMatch(/\b(ru|russian|nameRu|descriptionRu)\b/i);
  });

  it("leaves the availability beside the book, with an opaque revision and no flag per item", () => {
    const availability: CatalogueAvailability = {
      revision: "7",
      disabled: [{ kind: "handle", handle: "black" }],
    };

    expect(Object.keys(availability).sort()).toEqual(["disabled", "revision"]);
  });
});

describe("an address is identity only; the payload is the change's value (X0-4)", () => {
  it("gives two edits of one field equal addresses, so a later one can replace the earlier", () => {
    const first: DraftChange = {
      address: {
        kind: "created-row-text",
        item: { kind: "hardware", tierId: HETTICH },
        field: "name",
      },
      value: "Economy",
    };
    const second: DraftChange = {
      address: {
        kind: "created-row-text",
        item: { kind: "hardware", tierId: HETTICH },
        field: "name",
      },
      value: "Economy plus",
    };
    const on: DraftChange = { address: { kind: "provisional" }, value: true };
    const off: DraftChange = { address: { kind: "provisional" }, value: false };

    expect(second.address).toEqual(first.address);
    expect(off.address).toEqual(on.address);
  });

  it("carries every kind's payload as the value its kind says", () => {
    const changes: readonly DraftChange[] = [
      { address: { kind: "depth-rule" }, value: 15, groupId: "bulk-1" },
      { address: { kind: "provisional" }, value: false },
      {
        address: { kind: "hardware-tier-created", tierId: "hardware.economy" },
        value: { name: "Economy", description: "Budget offers." },
      },
      {
        address: { kind: "accessory-created", accessoryId: DRYING_RACK },
        value: {
          linkedBuildId: "base-sink",
          perUnitMinor: 60_000,
          name: "Dish rack",
          description: "Stainless steel.",
        },
      },
      {
        address: {
          kind: "created-row-text",
          item: { kind: "accessory", accessoryId: DRYING_RACK },
          field: "description",
        },
        value: "Stainless steel.",
      },
      {
        address: {
          kind: "item-deleted",
          item: { kind: "material", tierId: MDF },
        },
        value: true,
      },
    ];

    expect(changes.map((change) => change.address.kind)).toEqual([
      "depth-rule",
      "provisional",
      "hardware-tier-created",
      "accessory-created",
      "created-row-text",
      "item-deleted",
    ]);
  });

  it("refuses, at compile time, a payload in an address and a value of the wrong kind", () => {
    const inAddress: BookFieldAddress = {
      kind: "hardware-tier-created",
      tierId: HETTICH,
      // @ts-expect-error an address names the row and carries no payload
      name: "x",
    };
    const provisionalInAddress: BookFieldAddress = {
      kind: "provisional",
      // @ts-expect-error the switch's state is the change's value
      value: true,
    };
    const depthRule = { kind: "depth-rule" } as const;
    const deletion = {
      kind: "item-deleted",
      item: { kind: "material", tierId: MDF },
    } as const;
    // @ts-expect-error a percentage is a number
    const wrongValue: DraftChange = { address: depthRule, value: "15" };
    // @ts-expect-error a deletion's value is true
    const falseDeletion: DraftChange = { address: deletion, value: false };
    // @ts-expect-error a change without its value
    const missingValue: DraftChange = { address: depthRule };

    expect([
      inAddress,
      provisionalInAddress,
      wrongValue,
      falseDeletion,
      missingValue,
    ]).toHaveLength(5);
  });

  it("has no arm for editing a linked accessory's cabinet type after creation", () => {
    const accessoryFields: readonly string[] = DRAWN_FIELDS.flatMap((row) =>
      row.address.kind === "accessory" ? [row.address.field] : [],
    );

    expect(new Set(accessoryFields)).toEqual(new Set(["perUnitMinor"]));
  });
});

describe("where ItemRef and CatalogueAvailability live (X0-3)", () => {
  const SRC = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../src",
  );

  function filesUnder(root: string): readonly string[] {
    return readdirSync(root, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
      .map((entry) => path.join(entry.parentPath, entry.name));
  }

  function importedSpecifiers(source: string): readonly string[] {
    return [...source.matchAll(/(?:import|export)[^;]*?from\s+"([^"]+)"/g)].map(
      (match) => match[1] ?? "",
    );
  }

  it("declares them in pricing/catalogue-availability.ts, which imports nothing but the Handle type", () => {
    const file = path.join(SRC, "pricing", "catalogue-availability.ts");
    const source = readFileSync(file, "utf8");

    expect(source).toMatch(/export type ItemRef =/);
    expect(source).toMatch(/export interface CatalogueAvailability/);
    expect(importedSpecifiers(source)).toEqual(["../design.js"]);
    expect(source).not.toMatch(/\b(const|function|class)\b/);
  });

  it("has the address module import them from there, and declare neither", () => {
    const source = readFileSync(
      path.join(SRC, "price-dashboard", "book-field-address.ts"),
      "utf8",
    );

    expect(importedSpecifiers(source)).toContain(
      "../pricing/catalogue-availability.js",
    );
    expect(source).not.toMatch(
      /export (type|interface) (ItemRef|CatalogueAvailability)\b/,
    );
  });

  it("has no file under pricing/ importing price-dashboard/", () => {
    const importers = filesUnder(path.join(SRC, "pricing")).filter((file) =>
      importedSpecifiers(readFileSync(file, "utf8")).some((specifier) =>
        specifier.includes("price-dashboard"),
      ),
    );

    expect(importers).toEqual([]);
  });
});
