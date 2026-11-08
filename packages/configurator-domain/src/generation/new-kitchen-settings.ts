// The settings a new kitchen is created with: the dashboard's new-kitchen defaults, written into the design's own
// `settings`. A saved kitchen never reads them again, and a document that names no tier keeps the fixed pricing
// fallback. With no request the settings are the reference kitchen's and nothing else (ADR 0111).
import {
  withSettings,
  type CommandResult,
} from "../commands/command-result.js";
import { setKitchenHandle } from "../commands/set-kitchen-handle.js";
import {
  setGlobalFinish,
  setHardwareTier,
  setMaterialTier,
  type WholeKitchenTierInput,
} from "../commands/set-whole-kitchen-settings.js";
import {
  cabinetDepthMmOf,
  DesignSettingsSchema,
  type Design,
  type DesignSettings,
  type Handle,
} from "../design.js";
import { designOffersFinish, materialOfDesign } from "../design-material.js";
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

/**
 * A design stamped with the new-kitchen settings through the public commands, on the design's own clock; the depth is
 * never written, since only `setCabinetDepth` can rebuild bodies for it. The colour is judged once, against the
 * material the design ends up wearing. A refusal here is a programming error and throws.
 */
export function stampedDesignOf(
  design: Design,
  request: NewKitchenSettings,
): Design {
  refuseARequestNoDesignMayHold(request);
  const withTiers = withStampedTiers(design, request);
  const withColourAndHandle = withStampedColourAndHandle(withTiers, request);
  return request.topRowHandle === undefined
    ? withColourAndHandle
    : withTopRowHandle(withColourAndHandle, request.topRowHandle);
}

function withStampedTiers(
  design: Design,
  { materialTierId, hardwareTierId }: NewKitchenSettings,
): Design {
  const occurredAt = design.updatedAt;
  const withMaterial =
    materialTierId === undefined
      ? design
      : settled(
          setMaterialTier({
            design,
            ...onlyOffered(materialTierId),
            occurredAt,
          }),
        );
  return hardwareTierId === undefined
    ? withMaterial
    : settled(
        setHardwareTier({
          design: withMaterial,
          ...onlyOffered(hardwareTierId),
          occurredAt,
        }),
      );
}

/** The tier as the one id the command is told is offered: the request was judged against the book and the head. */
function onlyOffered(
  tierId: string,
): Pick<WholeKitchenTierInput, "tierId" | "availableTierIds"> {
  return { tierId, availableTierIds: [tierId] };
}

function withStampedColourAndHandle(
  design: Design,
  { finish, handle }: NewKitchenSettings,
): Design {
  const occurredAt = design.updatedAt;
  const coloured =
    finish === undefined
      ? design
      : settled(
          setGlobalFinish({
            design,
            finish: finishTheDesignOffers(design, finish),
            occurredAt,
          }),
        );
  return handle === undefined
    ? coloured
    : settled(setKitchenHandle({ design: coloured, handle, occurredAt }));
}

/** Judged against the material the design wears after its tier command, which is the stamped one except when the
 *  request names no material: a design of another material keeps that material's colour rule. */
function finishTheDesignOffers(design: Design, finish: Finish): Finish {
  if (designOffersFinish(design, finish)) return { ...finish };
  const lookup = materialOfDesign(design);
  return lookup.kind === "declared"
    ? { ...lookup.material.defaultFinish }
    : finish;
}

/** No command writes the top row's handle: the customer has no kitchen-level control for it (H-3). */
function withTopRowHandle(design: Design, topRowHandle: Handle): Design {
  return withSettings(
    design,
    { ...design.settings, topRowHandle },
    design.updatedAt,
  );
}

function settled(result: CommandResult): Design {
  if (result.ok) return result.design;
  throw new Error(`stampedDesignOf: a command refused (${result.reason.code})`);
}

/** What a stored row of defaults is read as: the settings it holds, or a row that is not settings at all. */
export type StoredSettingsReading =
  | { readonly ok: true; readonly defaults: NewKitchenSettings }
  | { readonly ok: false };

const UNREADABLE_SETTINGS: StoredSettingsReading = Object.freeze({
  ok: false,
} as const);

/**
 * Reads a row of saved defaults the store holds as `unknown`. Its shape is judged, nothing more: whether the items it
 * names are offered is `judgeKitchenDefaults`'s question. A row that is not an object, names a key a new kitchen does
 * not take, or holds a value the design's settings refuse (a `null` included) is `ok: false`, and is never read as `{}`:
 * a reader that took it for "nothing saved" would judge against fallbacks the saved row had replaced. The settings
 * returned share nothing with the row.
 */
export function readStoredNewKitchenSettings(
  stored: unknown,
): StoredSettingsReading {
  if (!isKeyedByKnownKeysOnly(stored)) return UNREADABLE_SETTINGS;
  const parsed = DesignSettingsSchema.safeParse(stored);
  if (!parsed.success) return UNREADABLE_SETTINGS;
  return {
    ok: true,
    defaults: copyOfNewKitchenSettings(
      pickDefined(parsed.data, NEW_KITCHEN_KEYS),
    ),
  };
}

/** A key the schema would admit but a new kitchen does not take is refused here, so a seventh design setting never
 *  reads as a default it cannot be. */
function isKeyedByKnownKeysOnly(stored: unknown): boolean {
  return (
    typeof stored === "object" &&
    stored !== null &&
    !Array.isArray(stored) &&
    Object.keys(stored).every((key) => KNOWN_KEYS.has(key))
  );
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
  const isAnObject =
    typeof given === "object" && given !== null && !Array.isArray(given);
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
