// The catalogue as it was declared before ADR 0182: every corner body with `canHandle: false`.
//
// Until then a corner resolved no handle and drew the builder's steel bar whatever the kitchen said, which made the
// corners the only shipped bodies that had a bar and refused a mode. The scene/price seam gates (ADR 0092 decision 3)
// are about exactly that body, so they hold the rule against it through this catalogue: the build ids and the meshes
// are the shipped ones, and one flag differs. A corner is a body the catalogue declares structural for that reason.
import type { BodyCatalog } from "@lemnaria/configurator-domain";

export function catalogWithCornersTakingNoHandle(
  catalog: BodyCatalog,
): BodyCatalog {
  return new Map(
    [...catalog].map(([buildId, definition]) => [
      buildId,
      definition.structuralReason === "corner"
        ? { ...definition, canHandle: false }
        : definition,
    ]),
  );
}
