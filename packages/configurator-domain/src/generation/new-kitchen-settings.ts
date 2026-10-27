// What a new kitchen is stamped with: the dashboard's new-kitchen defaults, written into the design's own `settings`
// when generation creates it. A saved kitchen never reads them again, and a document that names no tier keeps the
// fixed pricing fallback. No request is the old behaviour exactly: the reference kitchen's settings and nothing else.
import {
  cabinetDepthMmOf,
  DesignSettingsSchema,
  type DesignSettings,
} from "../design.js";
import { KITCHEN_L_DESIGN } from "../fixtures/kitchen-l-design.js";
import {
  DEFAULT_MATERIAL_ID,
  lookUpMaterial,
  materialOffersFinish,
  type Finish,
} from "../materials.js";

/** The six defaults the dashboard stores. Every key is optional: a key left out is stamped as nothing, and the
 *  reader's own fallback decides (ADR 0099 decision 10), except the depth, which a current design must carry. */
export type NewKitchenSettings = Pick<
  DesignSettings,
  | "materialTierId"
  | "hardwareTierId"
  | "cabinetDepthMm"
  | "finish"
  | "handle"
  | "topRowHandle"
>;

/** The container a new design is written with: always carries its depth. */
export type StampedKitchenSettings = DesignSettings & {
  readonly cabinetDepthMm: number;
};

/** A request that is not the settings container a design may hold: a depth nobody manufactures, a colour that is
 *  not a `Finish`, an id the schema refuses. A programming error at this seam, as the shell builders' input errors
 *  are: the caller judged the defaults before it saved them. */
export class NewKitchenSettingsError extends Error {
  readonly refusal = "NEW_KITCHEN_SETTINGS_NOT_STORABLE";

  constructor() {
    super("newKitchenSettings is not a settings container a design may hold");
    this.name = "NewKitchenSettingsError";
  }
}

const REFERENCE_DEPTH_MM = cabinetDepthMmOf(KITCHEN_L_DESIGN);

/**
 * The `settings` of a new design.
 *
 * - No request: the reference kitchen's settings (its depth and nothing else), so the output is what it always was.
 * - A request: its defined keys, in the schema's order, over the reference depth. A colour the stamped material
 *   does not offer becomes that material's default colour (ADR 0057 decision 2, ADR 0071's Amendment of
 *   2026-09-04), through the same offer query and the same lookup `setMaterialTier` resets by. An absent material
 *   is PAL, as everywhere (`materialOfDesign`); an undeclared one makes no offer of its own and resets nothing.
 */
export function stampedSettingsOf(
  request: NewKitchenSettings | undefined,
): StampedKitchenSettings {
  if (request === undefined) return { cabinetDepthMm: REFERENCE_DEPTH_MM };
  refuseAContainerNoDesignMayHold(containerOf(request, request.finish));
  return containerOf(request, finishTheMaterialOffers(request));
}

/** The depth a request asks for, which the plan, the catalogue and the probe are all read at. */
export function newKitchenDepthMmOf(
  request: NewKitchenSettings | undefined,
): number {
  return stampedSettingsOf(request).cabinetDepthMm;
}

/** The request's keys in the schema's order, over the reference depth, with the colour the caller has settled. */
function containerOf(
  request: NewKitchenSettings,
  finish: Finish | undefined,
): StampedKitchenSettings {
  return {
    ...definedKey("materialTierId", request.materialTierId),
    ...definedKey("hardwareTierId", request.hardwareTierId),
    cabinetDepthMm: request.cabinetDepthMm ?? REFERENCE_DEPTH_MM,
    ...definedKey("finish", finish),
    ...definedKey("handle", request.handle),
    ...definedKey("topRowHandle", request.topRowHandle),
  };
}

/** Judged before the reset: a colour that is not a `Finish` at all must be refused, not healed into a default. */
function refuseAContainerNoDesignMayHold(
  container: StampedKitchenSettings,
): void {
  if (!DesignSettingsSchema.safeParse(container).success) {
    throw new NewKitchenSettingsError();
  }
}

function finishTheMaterialOffers(
  request: NewKitchenSettings,
): Finish | undefined {
  const { finish } = request;
  if (finish === undefined) return undefined;
  const lookup = lookUpMaterial(request.materialTierId ?? DEFAULT_MATERIAL_ID);
  if (lookup.kind === "undeclared") return finish;
  return materialOffersFinish(lookup.material, finish)
    ? finish
    : lookup.material.defaultFinish;
}

function definedKey<Key extends keyof DesignSettings>(
  key: Key,
  value: DesignSettings[Key] | undefined,
): Partial<Pick<DesignSettings, Key>> {
  return value === undefined
    ? {}
    : ({ [key]: value } as Pick<DesignSettings, Key>);
}
