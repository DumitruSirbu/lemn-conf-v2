// The wall cabinet ADR 0183 hangs over a body that declares one owed, found from the design alone: a placement whose
// span is exactly the span of a body whose catalogue row declares it (`isAWallBodyOwedOver`), standing on that body's
// declared top. Tests that count the wall row's uppers or the top row's cabinets leave it out, since it is neither.
import {
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  isAWallBodyOwedOver,
  type BodyDefinition,
  type Design,
  type DesignPlacement,
} from "../../src/index.js";

export function isOverABodyOwedOne(
  design: Design,
  placement: DesignPlacement,
): boolean {
  return bodiesOwedOneIn(design).some(
    ({ body, topMm }) =>
      body.wall === placement.wall &&
      body.alongMm === placement.alongMm &&
      body.body.widthMm === placement.body.widthMm &&
      topMm === placement.y0Mm,
  );
}

/** Every placement whose row declares a wall body owed over it, with the declared top that body stands on. */
export function bodiesOwedOneIn(
  design: Design,
): readonly { readonly body: DesignPlacement; readonly topMm: number }[] {
  const catalog = buildKitchenLBodyCatalog(cabinetDepthMmOf(design));
  return design.placements.flatMap((body) => {
    const definition = catalog.get(body.body.buildId);
    return definition !== undefined && isAWallBodyOwedOver(definition)
      ? [{ body, topMm: body.y0Mm + declaredHeightMmOf(definition) }]
      : [];
  });
}

/** A row that is owed a body over it declares its height, since the cabinet stands on it. */
function declaredHeightMmOf(definition: BodyDefinition): number {
  if (definition.nominalHeightMm === undefined) {
    throw new Error(
      `${definition.kind} declares a body owed over it and no height`,
    );
  }
  return definition.nominalHeightMm;
}
