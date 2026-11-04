// The settings a new kitchen is created with: the dashboard's new-kitchen defaults, written into the design's own
// `settings`. A saved kitchen never reads them again, and a document that names no tier keeps the fixed pricing
// fallback. With no request the settings are the reference kitchen's and nothing else (ADR 0111).
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
import { pickDefined } from "../pick-defined.js";

/** The six settings a new kitchen is stamped with, in the schema's order: the one list the type, the key check and
 *  the stamp are all read from. */
const NEW_KITCHEN_KEYS = [
  "materialTierId",
  "hardwareTierId",
  "cabinetDepthMm",
  "finish",
  "handle",
  "topRowHandle",
] as const;

const KNOWN_KEYS: ReadonlySet<string> = new Set(NEW_KITCHEN_KEYS);

/** Every key is optional: a key left out is stamped as nothing and the reader's own fallback decides (ADR 0099
 *  decision 10), except the depth, which a current design must carry. */
export type NewKitchenSettings = Pick<
  DesignSettings,
  (typeof NEW_KITCHEN_KEYS)[number]
>;

/** The container a new design is written with: always carries its depth. */
export type StampedKitchenSettings = DesignSettings & {
  readonly cabinetDepthMm: number;
};

/** A request that is not the settings container a design may hold: a depth nobody manufactures, a colour that is
 *  not a `Finish`, an id the schema refuses, a `null` or a key this request does not define. A programming error at
 *  this seam, as the shell builders' input errors are: the caller judged the defaults before it saved them. */
export class NewKitchenSettingsError extends Error {
  readonly refusal = "NEW_KITCHEN_SETTINGS_NOT_STORABLE";

  constructor() {
    super("newKitchenSettings is not a settings container a design may hold");
    this.name = "NewKitchenSettingsError";
  }
}

const REFERENCE_DEPTH_MM = cabinetDepthMmOf(KITCHEN_L_DESIGN);

/**
 * The `settings` of a new design, judged once and copied from the request.
 *
 * With a request: its defined keys over the reference depth. A colour the stamped material does not offer becomes
 * that material's default colour (ADR 0057 decision 2, ADR 0071), by the same offer query `setMaterialTier` resets by.
 * An absent material is PAL, as everywhere; an undeclared one makes no offer of its own and resets nothing.
 */
export function stampedSettingsOf(
  request: NewKitchenSettings | undefined,
): StampedKitchenSettings {
  if (request === undefined) return { cabinetDepthMm: REFERENCE_DEPTH_MM };
  refuseARequestNoDesignMayHold(request);
  return containerOf(request, finishTheMaterialOffers(request));
}

/** A copy that shares nothing with the caller's request, for the log: a later edit of the request must not change
 *  what replay stamps. */
export function copyOfNewKitchenSettings(
  request: NewKitchenSettings,
): NewKitchenSettings {
  const { finish } = request;
  return finish === undefined
    ? { ...request }
    : { ...request, finish: { ...finish } };
}

/** The request's defined keys in the schema's order, with the depth settled and the colour the caller has settled. */
function containerOf(
  request: NewKitchenSettings,
  finish: Finish | undefined,
): StampedKitchenSettings {
  const cabinetDepthMm = depthOf(request);
  const present = { ...request, cabinetDepthMm, finish };
  // The depth is in `present`, so the override keeps its place in the schema's order and settles its type.
  return { ...pickDefined(present, NEW_KITCHEN_KEYS), cabinetDepthMm };
}

/** Only an absent depth falls back: a `null` is a value the schema refuses, never the reference depth. The cast is
 *  sound only for a request `refuseARequestNoDesignMayHold` has passed, and the one other call is that check itself. */
function depthOf(request: NewKitchenSettings): number {
  const requested: unknown = request.cabinetDepthMm;
  return requested === undefined ? REFERENCE_DEPTH_MM : (requested as number);
}

/** Judged before the reset: a colour that is not a `Finish` at all must be refused, not healed into a default, and
 *  so must a key this request does not define or a `null` standing where a value is optional. */
function refuseARequestNoDesignMayHold(request: NewKitchenSettings): void {
  const given: unknown = request;
  const isAnObject = typeof given === "object" && given !== null;
  if (
    !isAnObject ||
    !Object.keys(request).every((key) => KNOWN_KEYS.has(key)) ||
    !DesignSettingsSchema.safeParse(containerOf(request, request.finish))
      .success
  ) {
    throw new NewKitchenSettingsError();
  }
}

function finishTheMaterialOffers(
  request: NewKitchenSettings,
): Finish | undefined {
  const { finish } = request;
  if (finish === undefined) return undefined;
  const lookup = lookUpMaterial(request.materialTierId ?? DEFAULT_MATERIAL_ID);
  if (lookup.kind === "undeclared") return { ...finish };
  return materialOffersFinish(lookup.material, finish)
    ? { ...finish }
    : { ...lookup.material.defaultFinish };
}
