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

const REQUEST_KEYS: ReadonlySet<string> = new Set([
  "materialTierId",
  "hardwareTierId",
  "cabinetDepthMm",
  "finish",
  "handle",
  "topRowHandle",
]);

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
    cabinetDepthMm: depthOf(request),
    ...definedKey("finish", finish),
    ...definedKey("handle", request.handle),
    ...definedKey("topRowHandle", request.topRowHandle),
  };
}

/** Only an absent depth falls back: a `null` is a value the schema refuses, never the reference depth. Read as
 *  `unknown` because the type admits no `null`, which a caller outside the type system can still send. */
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
    !Object.keys(request).every((key) => REQUEST_KEYS.has(key)) ||
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

function definedKey<Key extends keyof DesignSettings>(
  key: Key,
  value: DesignSettings[Key] | undefined,
): Partial<Pick<DesignSettings, Key>> {
  return value === undefined
    ? {}
    : ({ [key]: value } as Pick<DesignSettings, Key>);
}
