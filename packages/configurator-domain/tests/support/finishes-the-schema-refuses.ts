// Values a caller holding the `Finish` type can hand a command and `FinishSchema` refuses: the type is
// inferred from the schema, so a cast or an untyped caller reaches the command with any of them
// (ADR 0078 decision 6). Written out here, never derived from the schema: `design-material.offer.test.ts`
// holds each one against `FinishSchema` so the list cannot quietly become values the schema admits.
import type { Design } from "../../src/design.js";
import { KITCHEN_L_DESIGN } from "../../src/fixtures/kitchen-l-design.js";
import type { Finish } from "../../src/materials.js";

export const FINISHES_THE_SCHEMA_REFUSES: readonly (readonly [
  string,
  Finish,
])[] = [
  [
    "a colour with a trailing newline",
    { kind: "free-colour", value: "#b8c4a1\n" },
  ],
  ["a colour one digit short", { kind: "free-colour", value: "#b8c4a" }],
  ["an empty colour", { kind: "free-colour", value: "" }],
  [
    "a well-formed colour carrying an entry id",
    { kind: "free-colour", value: "#abcdef", entryId: "pal.alb" } as Finish,
  ],
  [
    "a declared entry carrying a colour",
    { kind: "palette-entry", entryId: "pal.alb", value: "#abcdef" } as Finish,
  ],
  [
    "a palette id nobody declares",
    { kind: "palette-entry", entryId: "pal.nu-exista" } as unknown as Finish,
  ],
  ["a colour with no value", { kind: "free-colour" } as unknown as Finish],
  [
    "a kind the union does not carry",
    { kind: "ral", value: "#abcdef" } as unknown as Finish,
  ],
  ["a bare colour string", "#abcdef" as unknown as Finish],
  ["null", null as unknown as Finish],
];

/** An id shaped like a tier and naming no material this product declares (ADR 0078 decision 3). */
export const UNDECLARED_MATERIAL_ID = "material.laminate";

/** The three answers a material lookup can give a refused value: PAL offers entries, MDF offers
 *  colours, and an undeclared id offers nothing and refuses nothing. */
export const MATERIALS_A_REFUSED_FINISH_MEETS: readonly (readonly [
  string,
  string,
])[] = [
  ["PAL", "material.melamine"],
  ["MDF", "material.painted-mdf"],
  ["an undeclared material", UNDECLARED_MATERIAL_ID],
];

/** Every (material, refused value) pair, titled for `it.each`. */
export const REFUSED_FINISH_CASES: readonly (readonly [
  string,
  string,
  string,
  Finish,
])[] = MATERIALS_A_REFUSED_FINISH_MEETS.flatMap(([materialName, materialId]) =>
  FINISHES_THE_SCHEMA_REFUSES.map(
    ([finishName, finish]) =>
      [finishName, materialName, materialId, finish] as const,
  ),
);

export function kitchenMadeOf(materialTierId: string): Design {
  return {
    ...KITCHEN_L_DESIGN,
    settings: { ...KITCHEN_L_DESIGN.settings, materialTierId },
  };
}
