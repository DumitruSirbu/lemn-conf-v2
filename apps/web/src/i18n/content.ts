import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from "@lemnaria/configurator-domain";
import type { _Translator, Messages, RichTagsFunction } from "next-intl";

import type {
  AccountFieldCode,
  Band,
  BodyLabel,
  ContactChannel,
  ContactFieldCode,
  CornerDirection,
  DesignRoomShape,
  DesignWall,
  EmptySpaceSide,
  Finish,
  KitchenSummary,
  PaletteEntryId,
  PasswordRefusalCode,
  PresetNameFacts,
  RejectionDetail,
} from "@lemnaria/configurator-domain";

export type ContentTranslator = _Translator<Messages>;

function assertNever(value: never): never {
  throw new Error(`Unhandled descriptor: ${JSON.stringify(value)}`);
}

/**
 * Resolves a locale-free `BodyLabel` through the message catalogue. Both inner switches use literal keys, never
 * `` translate(`catalog.kinds.${k}`) ``: a template key defeats next-intl's generated declaration, so a catalogue
 * row without a message leaf must be a compile error (ADR 0095 decision 1).
 */
export function resolveBodyLabel(
  translate: ContentTranslator,
  label: BodyLabel,
): string {
  switch (label.kind) {
    case "entry":
      return resolveEntryLabel(translate, label.buildId);
    case "bodyKind":
      return resolveKindLabel(translate, label.bodyKind);
    case "emptySlot":
      return translate("catalog.emptySlot");
    // ADR 0033's count wraps a name that is never itself counted: `labelWithDoors` throws on a nested wrap.
    case "withDoors":
      return translate("catalog.bodyLabelWithDoors", {
        name: resolveBodyLabel(translate, label.name),
        doors: label.doors,
      });
    default:
      return assertNever(label);
  }
}

/**
 * The row word for §9's header and ADR 0066's top-row kind leaf. Takes the raw band, so a seeded top-row
 * cabinet still reads as the top row although §5.2's gate treats it as `wall`.
 */
export function resolveBandLabel(
  translate: ContentTranslator,
  band: Band,
): string {
  switch (band) {
    case "base":
      return translate("band.base");
    case "wall":
      return translate("band.wall");
    case "top":
      return translate("band.top");
    case "column":
      return translate("band.column");
    default:
      return assertNever(band);
  }
}

/** §11 row 24's fallback: a body the catalogue cannot name is still named, never by a key path, an empty
 *  string or the raw `kind` id. */
function resolveUnknownBody(translate: ContentTranslator): string {
  return translate("catalog.unknownKind");
}

/**
 * A palette entry's name from the entry id the domain publishes (ADR 0071). A literal-key switch over a closed
 * id union, as in `resolveBodyLabel`: a new `PALETTE_ENTRY_IDS` entry is a compile error here.
 */
export function resolveFinishName(
  translate: ContentTranslator,
  entryId: PaletteEntryId,
): string {
  switch (entryId) {
    case "pal.alb":
      return translate("finish.pal.alb");
    case "pal.stejar-bardolino":
      return translate("finish.pal.stejar-bardolino");
    case "pal.stejar-halifax":
      return translate("finish.pal.stejar-halifax");
    case "pal.antracit":
      return translate("finish.pal.antracit");
    case "pal.gri-havanna":
      return translate("finish.pal.gri-havanna");
    case "pal.nuc-warmia":
      return translate("finish.pal.nuc-warmia");
    case "veneer.stejar":
      return translate("finish.veneer.stejar");
    case "veneer.nuc":
      return translate("finish.veneer.nuc");
    default:
      return assertNever(entryId);
  }
}

/**
 * One rendered field of a price book row (ADR 0106 decision 1): the catalogue leaf the row's key names, else the
 * row's own authored text. A key this build has no arm for also falls back to that text, because a book arrives
 * from outside TypeScript. The arms are literal keys; only the `ru` pass of `price-book-text.test.ts` catches
 * a deleted arm, since every Romanian leaf equals the authored word.
 */
export function resolveBookText(
  translate: ContentTranslator,
  authored: string,
  key: string | undefined,
): string {
  if (key === undefined) return authored;
  return resolveBookLeaf(translate, key) ?? authored;
}

/** The leaf a book row's key names, or `undefined` where this build knows no such leaf. */
function resolveBookLeaf(
  translate: ContentTranslator,
  key: string,
): string | undefined {
  switch (key) {
    case "priceBook.hardware.standard.name":
      return translate("priceBook.hardware.standard.name");
    case "priceBook.hardware.standard.description":
      return translate("priceBook.hardware.standard.description");
    case "priceBook.hardware.soft-close.description":
      return translate("priceBook.hardware.soft-close.description");
    case "priceBook.hardware.premium.description":
      return translate("priceBook.hardware.premium.description");
    case "priceBook.material.melamine.name":
      return translate("priceBook.material.melamine.name");
    case "priceBook.material.melamine.description":
      return translate("priceBook.material.melamine.description");
    case "priceBook.material.painted-mdf.name":
      return translate("priceBook.material.painted-mdf.name");
    case "priceBook.material.painted-mdf.description":
      return translate("priceBook.material.painted-mdf.description");
    case "priceBook.material.veneer.name":
      return translate("priceBook.material.veneer.name");
    case "priceBook.material.veneer.description":
      return translate("priceBook.material.veneer.description");
    case "priceBook.accessory.sink-protective-cover.name":
      return translate("priceBook.accessory.sink-protective-cover.name");
    case "priceBook.accessory.sink-protective-cover.description":
      return translate("priceBook.accessory.sink-protective-cover.description");
    case "priceBook.accessory.dish-drying-rack.name":
      return translate("priceBook.accessory.dish-drying-rack.name");
    case "priceBook.accessory.dish-drying-rack.description":
      return translate("priceBook.accessory.dish-drying-rack.description");
    default:
      return undefined;
  }
}

function resolveEntryLabel(
  translate: ContentTranslator,
  buildId: string,
): string {
  switch (buildId) {
    case "base-cabinet":
      return translate("catalog.entries.base-cabinet");
    case "base-3drawer":
      return translate("catalog.entries.base-3drawer");
    case "base-panbank":
      return translate("catalog.entries.base-panbank");
    case "base-hob-2drawer":
      return translate("catalog.entries.base-hob-2drawer");
    case "base-hob-oven":
      return translate("catalog.entries.base-hob-oven");
    case "base-bottle-cargo":
      return translate("catalog.entries.base-bottle-cargo");
    case "base-sink":
      return translate("catalog.entries.base-sink");
    case "base-dishwasher":
      return translate("catalog.entries.base-dishwasher");
    case "wall-cabinet":
      return translate("catalog.entries.wall-cabinet");
    case "wall-lift":
      return translate("catalog.entries.wall-lift");
    case "open-shelf":
      return translate("catalog.entries.open-shelf");
    case "hood":
      return translate("catalog.entries.hood");
    case "tall-pantry":
      return translate("catalog.entries.tall-pantry");
    case "tall-oven-tower":
      return translate("catalog.entries.tall-oven-tower");
    case "tall-fridge-housing":
      return translate("catalog.entries.tall-fridge-housing");
    case "fridge-free":
      return translate("catalog.entries.fridge-free");
    // A `BodyCatalog` can arrive from outside TypeScript (ADR 0062), so a build id with no leaf is reachable
    // and is named rather than rendered as a hole.
    default:
      return resolveUnknownBody(translate);
  }
}

function resolveKindLabel(
  translate: ContentTranslator,
  bodyKind: string,
): string {
  switch (bodyKind) {
    case "base_cabinet":
      return translate("catalog.kinds.base_cabinet");
    case "dishwasher_housing":
      return translate("catalog.kinds.dishwasher_housing");
    case "induction_cooktop":
      return translate("catalog.kinds.induction_cooktop");
    case "tall_unit":
      return translate("catalog.kinds.tall_unit");
    case "fridge_housing":
      return translate("catalog.kinds.fridge_housing");
    case "fridge_freestanding":
      return translate("catalog.kinds.fridge_freestanding");
    case "wall_cabinet":
      return translate("catalog.kinds.wall_cabinet");
    case "open_shelf_unit":
      return translate("catalog.kinds.open_shelf_unit");
    case "extractor_hood":
      return translate("catalog.kinds.extractor_hood");
    case "corner_base_x":
      return translate("catalog.kinds.corner_base_x");
    case "corner_base_return":
      return translate("catalog.kinds.corner_base_return");
    case "corner_wall_return":
      return translate("catalog.kinds.corner_wall_return");
    // ADR 0066: the one kind leaf taking an argument; the row word comes from `band.top`, as in §9's header.
    case "corner_wall_return_top":
      return translate("catalog.kinds.corner_wall_return_top", {
        rowWord: resolveBandLabel(translate, "top"),
      });
    // §11 row 24: a kind the catalogue does not name — including `VOID_KIND`, which it never will.
    default:
      return resolveUnknownBody(translate);
  }
}

/**
 * The domain's `"right"`/`"left"` mean +along/−along, never a screen side, and which screen side +along reads
 * as depends on the wall, not only on the room's direction (ADR 0129 D8). Measured against the camera projection:
 *
 * | wall | direction | +along reads on screen |
 * | ---  | ---       | ---                     |
 * | A    | left      | right                   |
 * | A    | right     | left                    |
 * | B    | left      | left                    |
 * | B    | right     | right                   |
 * | C    | left      | right                   |
 * | C    | right     | left                    |
 *
 * Wall C is wall B's row turned over: its camera is wall B's reflected in x = W/2. A U has no right-hand
 * variant, so wall C never crosses in the product; its right row is what the rule answers for a room that
 * cannot exist. `screenSideOf` is the one place a crossing happens; elsewhere `side.side` is the domain's.
 */
export function crossesOnScreen(
  wall: DesignWall,
  cornerDirection: CornerDirection,
): boolean {
  return (
    (wall === "A" && cornerDirection === "right") ||
    (wall === "B" && cornerDirection === "left") ||
    (wall === "C" && cornerDirection === "right")
  );
}

function screenSideOf(
  domainSide: EmptySpaceSide["side"],
  wall: DesignWall,
  cornerDirection: CornerDirection,
): EmptySpaceSide["side"] {
  if (!crossesOnScreen(wall, cornerDirection)) return domainSide;
  return domainSide === "right" ? "left" : "right";
}

/** next-intl 4.14.2's generated parser types a select-only message as taking no values, so this leaf uses an
 *  exact-value `selectordinal`: typed, same output. The numbers are a side/reason selector, never domain data. */
function resolveEmptySpaceSide(
  translate: ContentTranslator,
  side: EmptySpaceSide,
  wall: DesignWall,
  cornerDirection: CornerDirection,
): string {
  const screenSide = screenSideOf(side.side, wall, cornerDirection);
  switch (screenSide) {
    case "right":
      switch (side.reason) {
        case "absent":
          return translate("rejection.parts.emptySpaceSide", { sideReason: 0 });
        case "too_narrow":
          return translate("rejection.parts.emptySpaceSide", { sideReason: 1 });
        case "opens_a_gap":
          return translate("rejection.parts.emptySpaceSide", { sideReason: 2 });
        case "key_taken":
          return translate("rejection.parts.emptySpaceSide", { sideReason: 3 });
        default:
          return assertNever(side.reason);
      }
    case "left":
      switch (side.reason) {
        case "absent":
          return translate("rejection.parts.emptySpaceSide", { sideReason: 4 });
        case "too_narrow":
          return translate("rejection.parts.emptySpaceSide", { sideReason: 5 });
        case "opens_a_gap":
          return translate("rejection.parts.emptySpaceSide", { sideReason: 6 });
        case "key_taken":
          return translate("rejection.parts.emptySpaceSide", { sideReason: 7 });
        default:
          return assertNever(side.reason);
      }
    default:
      return assertNever(screenSide);
  }
}

function resolveEmptySpaceSides(
  translate: ContentTranslator,
  sides: readonly EmptySpaceSide[],
  wall: DesignWall,
  cornerDirection: CornerDirection,
): string {
  return sides
    .map((side) =>
      resolveEmptySpaceSide(translate, side, wall, cornerDirection),
    )
    .join(translate("rejection.parts.sidesJoin"));
}

type WidthNotSupportedParams = Extract<
  RejectionDetail,
  { readonly code: "WIDTH_NOT_SUPPORTED" }
>["params"];

function resolveWidthsMadeClause(
  translate: ContentTranslator,
  params: WidthNotSupportedParams,
): string {
  const ranges = params.widthRangesMm;
  if (ranges?.some((range) => range.minMm < range.maxMm) === true) {
    return ranges
      .map((range) =>
        range.minMm === range.maxMm
          ? translate("rejection.parts.widthsMadeAt", {
              minMm: range.minMm,
            })
          : translate("rejection.parts.widthsMadeBetween", {
              minMm: range.minMm,
              maxMm: range.maxMm,
            }),
      )
      .join(translate("rejection.parts.widthsJoin"));
  }
  return translate("rejection.parts.widthsMadeList", {
    sizes: params.sizesMm.join(translate("rejection.parts.widthsJoin")),
  });
}

/** Resolves a locale-free domain refusal through the message catalogue. The exhaustive literal-key switch keeps
 *  every code checked against the domain union and the generated ICU argument declarations.
 *
 *  The descriptor is resolved before it is interpolated: ICU cannot reference a sub-message by argument, so a
 *  message reading `„{label}”` needs a resolved string. */
export function resolveRejection(
  translate: ContentTranslator,
  detail: RejectionDetail,
  // Both default to wall A / left rather than being threaded to every caller: only a width-resize refusal's
  // `sides` reads either (`resolveEmptySpaceSides`). Wall A is the default because its crossing rule agrees with
  // `cornerDirection`'s default of left (ADR 0129 D8).
  wall: DesignWall = "A",
  cornerDirection: CornerDirection = "left",
): string {
  switch (detail.code) {
    case "VOID_SELECTED":
      return translate("rejection.VOID_SELECTED");
    case "TARGET_NOT_FOUND":
      return translate("rejection.TARGET_NOT_FOUND");
    case "INVALID_OCCURRED_AT":
      return translate("rejection.INVALID_OCCURRED_AT");
    case "BODY_PROBE_UNAVAILABLE":
      return translate("rejection.BODY_PROBE_UNAVAILABLE");
    case "ACCESSORY_NOT_DELETABLE":
      return translate("rejection.ACCESSORY_NOT_DELETABLE", {
        label: resolveBodyLabel(translate, detail.params.label),
      });
    case "NOT_DELETABLE":
      return translate("rejection.NOT_DELETABLE", {
        label: resolveBodyLabel(translate, detail.params.label),
      });
    case "NOT_IN_LIBRARY":
      return translate("rejection.NOT_IN_LIBRARY");
    case "NOT_INSERTABLE":
      return translate("rejection.NOT_INSERTABLE", {
        label: resolveBodyLabel(translate, detail.params.label),
      });
    case "TARGET_NOT_REPLACEABLE":
      return translate("rejection.TARGET_NOT_REPLACEABLE", {
        label: resolveBodyLabel(translate, detail.params.label),
      });
    case "BAND_MISMATCH":
      return translate("rejection.BAND_MISMATCH", {
        label: resolveBodyLabel(translate, detail.params.label),
        slotBand: detail.params.slotBand,
      });
    case "WIDTH_TOO_LARGE":
      return translate("rejection.WIDTH_TOO_LARGE", {
        label: resolveBodyLabel(translate, detail.params.label),
        requiredMm: detail.params.requiredMm,
        availableMm: detail.params.availableMm,
      });
    case "WIDTH_TOO_SMALL":
      return detail.params.requiredMm === undefined
        ? translate("rejection.WIDTH_TOO_SMALL_UNKNOWN_FLOOR", {
            label: resolveBodyLabel(translate, detail.params.label),
          })
        : translate("rejection.WIDTH_TOO_SMALL", {
            label: resolveBodyLabel(translate, detail.params.label),
            requiredMm: detail.params.requiredMm,
            availableMm: detail.params.availableMm,
          });
    case "WIDTH_NOT_SUPPORTED": {
      const hasNoWidth =
        detail.params.sizesMm.length === 0 &&
        (detail.params.widthRangesMm?.length ?? 0) === 0;
      if (hasNoWidth) {
        return translate("rejection.WIDTH_NOT_SUPPORTED_NO_WIDTH", {
          label: resolveBodyLabel(translate, detail.params.label),
        });
      }
      const widthsMadeClause = resolveWidthsMadeClause(
        translate,
        detail.params,
      );
      return detail.params.boundScope === "column"
        ? translate("rejection.WIDTH_NOT_SUPPORTED_COLUMN", {
            label: resolveBodyLabel(translate, detail.params.label),
            widthsMadeClause,
            availableMm: detail.params.availableMm,
          })
        : translate("rejection.WIDTH_NOT_SUPPORTED_BODY", {
            label: resolveBodyLabel(translate, detail.params.label),
            widthsMadeClause,
            availableMm: detail.params.availableMm,
          });
    }
    case "OPENING_TOO_SHORT":
      return translate("rejection.OPENING_TOO_SHORT", {
        availableMm: detail.params.availableMm,
        minimumMm: detail.params.minimumMm,
      });
    case "HEIGHT_EXCEEDS_LEVEL":
      return translate("rejection.HEIGHT_EXCEEDS_LEVEL", {
        label: resolveBodyLabel(translate, detail.params.label),
        requiredMm: detail.params.requiredMm,
        availableMm: detail.params.availableMm,
      });
    case "HEIGHT_TOO_LARGE":
      return translate("rejection.HEIGHT_TOO_LARGE", {
        label: resolveBodyLabel(translate, detail.params.label),
        requiredMm: detail.params.requiredMm,
        availableMm: detail.params.availableMm,
      });
    case "NO_SNAP_POSITION":
      return translate("rejection.NO_SNAP_POSITION", {
        label: resolveBodyLabel(translate, detail.params.label),
      });
    case "BUILT_SIZE_MISMATCH":
      return translate("rejection.BUILT_SIZE_MISMATCH", {
        label: resolveBodyLabel(translate, detail.params.label),
        builtMm: detail.params.builtMm,
        requiredMm: detail.params.requiredMm,
      });
    case "MEASUREMENT_UNUSABLE":
      return translate("rejection.MEASUREMENT_UNUSABLE", {
        label: resolveBodyLabel(translate, detail.params.label),
      });
    case "COLUMN_MISMATCH":
      return translate("rejection.COLUMN_MISMATCH", {
        label: resolveBodyLabel(translate, detail.params.label),
      });
    case "NOT_RESIZABLE":
      return translate("rejection.NOT_RESIZABLE", {
        label: resolveBodyLabel(translate, detail.params.label),
      });
    case "WIDTH_UNCHANGED":
      return translate("rejection.WIDTH_UNCHANGED", {
        label: resolveBodyLabel(translate, detail.params.label),
        widthMm: detail.params.widthMm,
      });
    case "NO_EMPTY_SPACE":
      return translate("rejection.NO_EMPTY_SPACE", {
        label: resolveBodyLabel(translate, detail.params.label),
        requestedMm: detail.params.requestedMm,
        deltaMm: detail.params.deltaMm,
        sides: resolveEmptySpaceSides(
          translate,
          detail.params.sides,
          wall,
          cornerDirection,
        ),
      });
    case "COLUMN_MEMBER_NOT_RESIZABLE":
      return translate("rejection.COLUMN_MEMBER_NOT_RESIZABLE", {
        label: resolveBodyLabel(translate, detail.params.label),
        memberLabel: resolveBodyLabel(translate, detail.params.memberLabel),
      });
    case "DEPENDENT_MEMBER_NOT_REBUILDABLE":
      return translate("rejection.DEPENDENT_MEMBER_NOT_REBUILDABLE", {
        label: resolveBodyLabel(translate, detail.params.label),
        memberLabel: resolveBodyLabel(translate, detail.params.memberLabel),
      });
    case "RESIZE_OPENS_GAP":
      return translate("rejection.RESIZE_OPENS_GAP", {
        label: resolveBodyLabel(translate, detail.params.label),
        sides: resolveEmptySpaceSides(
          translate,
          detail.params.sides,
          wall,
          cornerDirection,
        ),
      });
    case "COLUMN_KEY_COLLISION":
      return translate("rejection.COLUMN_KEY_COLLISION", {
        label: resolveBodyLabel(translate, detail.params.label),
        requestedMm: detail.params.requestedMm,
        sides: resolveEmptySpaceSides(
          translate,
          detail.params.sides,
          wall,
          cornerDirection,
        ),
      });
    case "COLUMN_HOOD_FLOOR":
      return translate("rejection.COLUMN_HOOD_FLOOR", {
        label: resolveBodyLabel(translate, detail.params.label),
        requestedMm: detail.params.requestedMm,
        hoodWidthMm: detail.params.hoodWidthMm,
      });
    case "NON_INTEGER_MILLIMETRES":
      return translate("rejection.NON_INTEGER_MILLIMETRES", {
        field: detail.params.field,
        valueMm: String(detail.params.valueMm),
      });
    case "FINISH_NOT_SUPPORTED":
      return translate("rejection.FINISH_NOT_SUPPORTED", {
        label: resolveBodyLabel(translate, detail.params.label),
      });
    case "FINISH_NOT_OFFERED":
      return translate("rejection.FINISH_NOT_OFFERED");
    case "HANDLE_NOT_SUPPORTED":
      return translate("rejection.HANDLE_NOT_SUPPORTED", {
        label: resolveBodyLabel(translate, detail.params.label),
      });
    case "UNKNOWN_MATERIAL_TIER":
      return translate("rejection.UNKNOWN_MATERIAL_TIER");
    case "UNKNOWN_HARDWARE_TIER":
      return translate("rejection.UNKNOWN_HARDWARE_TIER");
    case "UNKNOWN_CABINET_DEPTH":
      return translate("rejection.UNKNOWN_CABINET_DEPTH");
    default:
      return assertNever(detail);
  }
}

/** A room as the review's one line states it: the walls its shape has, in whole millimetres, the corner side only
 *  where the shape has one, and how many bodies the kitchen holds. */
export type ReviewRoomLine =
  | {
      readonly shape: "linear";
      readonly wallAMm: number;
      readonly bodyCount: number;
    }
  | {
      readonly shape: "L";
      readonly wallAMm: number;
      readonly wallBMm: number;
      readonly corner: CornerDirection;
      readonly bodyCount: number;
    }
  | {
      readonly shape: "U";
      readonly wallAMm: number;
      readonly wallBMm: number;
      readonly wallCMm: number;
      readonly bodyCount: number;
    };

/**
 * One leaf per shape, each naming only the lengths that shape has. The body count is rendered first and passed in as
 * text, so the plural lives in one leaf instead of three.
 */
export function resolveReviewRoomLine(
  translate: ContentTranslator,
  line: ReviewRoomLine,
): string {
  const bodies = translate("review.bodyCount", { bodyCount: line.bodyCount });
  switch (line.shape) {
    case "linear":
      return translate("review.roomLine.linear", {
        shape: translate("room.shapes.linear.short"),
        wallA: line.wallAMm,
        bodies,
      });
    case "L":
      return translate("review.roomLine.L", {
        shape: translate("room.shapes.L.short"),
        wallA: line.wallAMm,
        wallB: line.wallBMm,
        corner: resolveCornerSide(translate, line.corner),
        bodies,
      });
    case "U":
      return translate("review.roomLine.U", {
        shape: translate("room.shapes.U.short"),
        wallA: line.wallAMm,
        wallB: line.wallBMm,
        wallC: line.wallCMm,
        bodies,
      });
    default:
      return assertNever(line);
  }
}

function resolveCornerSide(
  translate: ContentTranslator,
  corner: CornerDirection,
): string {
  switch (corner) {
    case "left":
      return translate("review.roomLine.cornerLeft");
    case "right":
      return translate("review.roomLine.cornerRight");
    default:
      return assertNever(corner);
  }
}

/**
 * The sentence for one field refusal, found by the domain's code and never by the field: a code has one sentence
 * wherever it is met. An exhaustive literal-key switch, so a code the domain adds does not compile until it has a leaf.
 */
export function resolveContactFieldError(
  translate: ContentTranslator,
  code: ContactFieldCode,
): string {
  switch (code) {
    case "REQUIRED":
      return translate("contact.fieldErrors.REQUIRED");
    case "TOO_LONG":
      return translate("contact.fieldErrors.TOO_LONG");
    case "FORBIDDEN_CHARACTER":
      return translate("contact.fieldErrors.FORBIDDEN_CHARACTER");
    case "MALFORMED":
      return translate("contact.fieldErrors.MALFORMED");
    case "PHONE_MOLDOVAN_INCOMPLETE":
      return translate("contact.fieldErrors.PHONE_MOLDOVAN_INCOMPLETE");
    case "PHONE_MOLDOVAN_TOO_MANY_DIGITS":
      return translate("contact.fieldErrors.PHONE_MOLDOVAN_TOO_MANY_DIGITS");
    case "PHONE_MOLDOVAN_SECOND_ZERO":
      return translate("contact.fieldErrors.PHONE_MOLDOVAN_SECOND_ZERO");
    case "PHONE_INTERNATIONAL_INCOMPLETE":
      return translate("contact.fieldErrors.PHONE_INTERNATIONAL_INCOMPLETE");
    case "PHONE_INTERNATIONAL_TOO_MANY_DIGITS":
      return translate(
        "contact.fieldErrors.PHONE_INTERNATIONAL_TOO_MANY_DIGITS",
      );
    case "PHONE_FORMAT_UNRECOGNISED":
      return translate("contact.fieldErrors.PHONE_FORMAT_UNRECOGNISED");
    case "CONSENT_NOT_GIVEN":
      return translate("contact.fieldErrors.CONSENT_NOT_GIVEN");
    // No field of the form can produce these three: the value is not text, or comes from a closed set the page sends.
    case "NOT_TEXT":
    case "UNKNOWN_CHANNEL":
    case "UNKNOWN_CONSENT_TEXT_VERSION":
      return translate("submissionResult.failureNotSent");
    default:
      return resolveCodeThisBuildLacks(translate, code);
  }
}

/** A code arrives from the network, so one this build has no leaf for is reachable: it is told as the failure it
 *  is to the customer. The `never` keeps the switch above exhaustive at compile time. */
function resolveCodeThisBuildLacks(
  translate: ContentTranslator,
  code: never,
): string {
  void code;
  return translate("submissionResult.failureNotSent");
}

/** What the screen says, beside the form, of an answer that was not a send, with the one value a sentence carries
 *  already read: the clock time, and whether it is tomorrow's, that a limited send may be tried again. The kinds are
 *  `ContactOutcome`'s but `sent`, which the result screens tell, and `failed` and `unanswered`, which have the screen
 *  of frame 5B; this module takes nothing from `contact/`, which would put the form's routing into every model that
 *  names a resolved sentence, and a test ties the two unions. */
export type ContactOutcomeNotice =
  | {
      readonly kind: "limited";
      readonly time: string;
      readonly isTomorrow: boolean;
    }
  | { readonly kind: "refused" }
  | { readonly kind: "conflict" }
  | { readonly kind: "design-not-current" }
  | { readonly kind: "does-not-fit" };

/** One sentence per class of answer. A send that does not fit is told in the review's own words for it. */
export function resolveContactOutcome(
  translate: ContentTranslator,
  notice: ContactOutcomeNotice,
): string {
  switch (notice.kind) {
    case "limited":
      return translate(
        notice.isTomorrow
          ? "contact.outcomes.limitedTomorrow"
          : "contact.outcomes.limited",
        { time: notice.time },
      );
    case "refused":
      return translate("contact.outcomes.refused");
    case "conflict":
      return translate("contact.outcomes.conflict");
    case "design-not-current":
      return translate("contact.outcomes.designNotCurrent");
    case "does-not-fit":
      return translate("review.refusalReasons.BODIES_PAST_WALL");
    default:
      return assertNever(notice);
  }
}

/** What the result screen says of how the shop will reach the customer: the channel chosen and the one value typed
 *  for it, exactly as typed. */
export interface SubmissionChannelLine {
  readonly channel: ContactChannel;
  readonly contact: string;
}

/** One sentence per channel, found by the channel's own name so a channel the domain adds is a type error here. */
export function resolveSubmissionChannelLine(
  translate: ContentTranslator,
  line: SubmissionChannelLine,
): string {
  return translate("submissionResult.channelLine", {
    channel: line.channel,
    contact: line.contact,
  });
}

/** What the message to the shop names: the request, and the customer's own view-only link to the design. */
export interface ShopWhatsappMessageParts {
  readonly reference: string;
  readonly link: string;
}

/** The message a customer sends the shop. It is the customer's voice, so it addresses the shop in neither register. */
export function resolveShopWhatsappMessage(
  translate: ContentTranslator,
  parts: ShopWhatsappMessageParts,
): string {
  return translate("submissionResult.whatsappMessageToShop", parts);
}

/** The advice on the already-sent view; `phone` is the shop's display form, never digits typed into a leaf. */
export function resolveAlreadySentAdvice(
  translate: ContentTranslator,
  phone: string,
): string {
  return translate("submissionResult.alreadySentAdvice", { phone });
}

/** What the notice's hidden first line is made of. An empty `locality` is left out rather than shown as a dash. */
export interface NoticePreheaderParts {
  readonly lead: string;
  readonly name: string;
  readonly locality: string;
}

export function resolveNoticePreheader(
  translate: ContentTranslator,
  { lead, name, locality }: NoticePreheaderParts,
): string {
  return locality === ""
    ? translate("leadNotice.preheader", { lead, name })
    : translate("leadNotice.preheaderWithLocality", { lead, name, locality });
}

/**
 * The wording of the account e-mails, resolved in one locale. `action` is the label of the link's button.
 * `emailChanged` goes to the OLD address and carries the undo link; `emailChangeRequested` goes to the same address
 * when a change is asked for, names the address that was typed, and so is a function of it. Both were approved as
 * drafted (ADR 0113 decision 2; plan O28b).
 */
export function resolveAccountMailCopy(translate: ContentTranslator) {
  return {
    noReply: translate("accountMail.noReply"),
    linkFallback: translate("accountMail.linkFallback"),
    confirmEmail: {
      subject: translate("accountMail.confirmEmail.subject"),
      intro: translate("accountMail.confirmEmail.intro"),
      action: translate("accountMail.confirmEmail.action"),
      note: translate("accountMail.confirmEmail.note"),
    },
    alreadyRegistered: {
      subject: translate("accountMail.alreadyRegistered.subject"),
      intro: translate("accountMail.alreadyRegistered.intro"),
      action: translate("accountMail.alreadyRegistered.action"),
      note: translate("accountMail.alreadyRegistered.note"),
    },
    resetPassword: {
      subject: translate("accountMail.resetPassword.subject"),
      intro: translate("accountMail.resetPassword.intro"),
      action: translate("accountMail.resetPassword.action"),
      note: translate("accountMail.resetPassword.note"),
    },
    passwordChanged: {
      subject: translate("accountMail.passwordChanged.subject"),
      intro: translate("accountMail.passwordChanged.intro"),
      note: translate("accountMail.passwordChanged.note"),
    },
    emailChange: {
      subject: translate("accountMail.emailChange.subject"),
      intro: translate("accountMail.emailChange.intro"),
      action: translate("accountMail.emailChange.action"),
      note: translate("accountMail.emailChange.note"),
    },
    emailChangeAddressInUse: {
      subject: translate("accountMail.emailChangeAddressInUse.subject"),
      intro: translate("accountMail.emailChangeAddressInUse.intro"),
      action: translate("accountMail.emailChangeAddressInUse.action"),
      note: translate("accountMail.emailChangeAddressInUse.note"),
    },
    emailChanged: {
      subject: translate("accountMail.emailChanged.subject"),
      intro: translate("accountMail.emailChanged.intro"),
      action: translate("accountMail.emailChanged.action"),
      note: translate("accountMail.emailChanged.note"),
    },
    emailChangeReverted: {
      subject: translate("accountMail.emailChangeReverted.subject"),
      intro: translate("accountMail.emailChangeReverted.intro"),
      note: translate("accountMail.emailChangeReverted.note"),
    },
    emailChangeRequested: (address: string) => ({
      subject: translate("accountMail.emailChangeRequested.subject"),
      intro: translate("accountMail.emailChangeRequested.intro", { address }),
      action: translate("accountMail.emailChangeRequested.action"),
      note: translate("accountMail.emailChangeRequested.note"),
    }),
  };
}

export type AccountMailCopy = ReturnType<typeof resolveAccountMailCopy>;

/** The fields of an account form that a server answer can mark. `locale` and the notice version are the page's own
 *  values, so a refusal of either is the request failing, not a field to correct. `currentPassword` and `newPassword`
 *  are the password change's own request members, named as the body names them (plan P13). */
export type AccountIssueField =
  | "email"
  | "newEmail"
  | "phone"
  | "password"
  | "currentPassword"
  | "newPassword"
  | "name"
  | "address";

/** The password's refusals: the domain's three, the breach check's, a password that was not text, and the empty
 *  password the form refuses before sending. */
export type AccountIssueCode =
  | AccountFieldCode
  | PasswordRefusalCode
  | "PASSWORD_BREACHED"
  | "PASSWORD_NOT_TEXT"
  | "PASSWORD_REQUIRED"
  | "PASSWORD_UNCHANGED";

/** One field and one code, never the value that was refused. */
export interface AccountFieldIssue {
  readonly field: AccountIssueField;
  readonly code: AccountIssueCode;
}

/** A limit told by a sentence that does not change as the page lives, with the one value it carries already read:
 *  whole minutes, or the clock time and whether it is tomorrow's. `unreadable` carries no number. */
export type AccountRateLimitSentence =
  | { readonly kind: "minutes"; readonly minutes: number }
  | {
      readonly kind: "at";
      readonly time: string;
      readonly isTomorrow: boolean;
    }
  | { readonly kind: "unreadable" };

/** How a limited account request is told. A short wait is a `countdown` the notice keeps live up to the instant it
 *  ends; any other is a sentence. */
export type AccountRateLimitNotice =
  | AccountRateLimitSentence
  | { readonly kind: "countdown"; readonly endsAtMs: number };

/** Draws a tagged span of a message. The caller owns the element, so this module holds no markup. */
export type RichTagRenderer = RichTagsFunction;

/** What a rich message resolves to; taken from the translator's own type so this module names no React. */
type RichMessage = ReturnType<RichTagsFunction>;

/**
 * The sentence for one field refusal, found by the field and the code: one code can be worded per field. A code
 * arrives from the network, so one this build has no leaf for is told as the failed request it is.
 */
export function resolveAccountFieldError(
  translate: ContentTranslator,
  { field, code }: AccountFieldIssue,
): string {
  switch (field) {
    case "email":
    case "newEmail":
      return resolveEmailError(translate, code);
    case "phone":
      return resolvePhoneError(translate, code);
    case "password":
    case "currentPassword":
    case "newPassword":
      return resolvePasswordError(translate, code);
    case "name":
      return resolveNameError(translate, code);
    case "address":
      return resolveAddressError(translate, code);
    default:
      return assertNever(field);
  }
}

function resolveEmailError(
  translate: ContentTranslator,
  code: AccountIssueCode,
): string {
  switch (code) {
    case "REQUIRED":
      return translate("accountFieldErrors.emailRequired");
    case "MALFORMED":
      return translate("accountFieldErrors.emailMalformed");
    case "TOO_LONG":
      return translate("accountFieldErrors.emailTooLong");
    case "FORBIDDEN_CHARACTER":
    case "NOT_TEXT":
      return translate("accountFieldErrors.emailForbiddenCharacter");
    default:
      return translate("accountForm.requestFailedBody");
  }
}

function resolvePhoneError(
  translate: ContentTranslator,
  code: AccountIssueCode,
): string {
  switch (code) {
    case "PHONE_MOLDOVAN_INCOMPLETE":
      return translate("accountFieldErrors.phoneMoldovanIncomplete");
    case "PHONE_MOLDOVAN_TOO_MANY_DIGITS":
      return translate("accountFieldErrors.phoneMoldovanTooManyDigits");
    case "PHONE_MOLDOVAN_SECOND_ZERO":
      return translate("accountFieldErrors.phoneMoldovanSecondZero");
    case "PHONE_INTERNATIONAL_INCOMPLETE":
      return translate("accountFieldErrors.phoneInternationalIncomplete");
    case "PHONE_INTERNATIONAL_TOO_MANY_DIGITS":
      return translate("accountFieldErrors.phoneInternationalTooManyDigits");
    case "PHONE_FORMAT_UNRECOGNISED":
      return translate("accountFieldErrors.phoneFormatUnrecognised");
    case "TOO_LONG":
      return translate("accountFieldErrors.phoneTooLong");
    case "FORBIDDEN_CHARACTER":
    case "NOT_TEXT":
      return translate("accountFieldErrors.phoneForbiddenCharacter");
    default:
      return translate("accountForm.requestFailedBody");
  }
}

function resolveNameError(
  translate: ContentTranslator,
  code: AccountIssueCode,
): string {
  switch (code) {
    case "TOO_LONG":
      return translate("accountFieldErrors.nameTooLong");
    case "FORBIDDEN_CHARACTER":
    case "NOT_TEXT":
      return translate("accountFieldErrors.nameForbiddenCharacter");
    default:
      return translate("accountForm.requestFailedBody");
  }
}

function resolveAddressError(
  translate: ContentTranslator,
  code: AccountIssueCode,
): string {
  switch (code) {
    case "TOO_LONG":
      return translate("accountFieldErrors.addressTooLong");
    case "FORBIDDEN_CHARACTER":
    case "NOT_TEXT":
      return translate("accountFieldErrors.addressForbiddenCharacter");
    default:
      return translate("accountForm.requestFailedBody");
  }
}

function resolvePasswordError(
  translate: ContentTranslator,
  code: AccountIssueCode,
): string {
  switch (code) {
    case "PASSWORD_TOO_SHORT":
      return translate("accountFieldErrors.passwordTooShort", {
        min: PASSWORD_MIN_LENGTH,
      });
    case "PASSWORD_TOO_LONG":
      return translate("accountFieldErrors.passwordTooLong", {
        max: PASSWORD_MAX_LENGTH,
      });
    case "PASSWORD_IS_EMAIL":
      return translate("accountFieldErrors.passwordIsEmail");
    case "PASSWORD_BREACHED":
      return translate("accountFieldErrors.passwordBreached");
    case "PASSWORD_NOT_TEXT":
      return translate("accountFieldErrors.passwordNotText");
    case "PASSWORD_REQUIRED":
      return translate("accountFieldErrors.passwordRequired");
    default:
      return translate("accountForm.requestFailedBody");
  }
}

/** The form-level sentence for a limited request. Its lead is a tagged span, drawn by the caller's renderer. */
export function resolveAccountRateLimit(
  translate: ContentTranslator,
  notice: AccountRateLimitSentence,
  strong: RichTagRenderer,
): RichMessage {
  switch (notice.kind) {
    case "minutes":
      return translate.rich("accountForm.rateLimitedMinutes", {
        minutes: notice.minutes,
        strong,
      });
    case "at":
      return translate.rich(
        notice.isTomorrow
          ? "accountForm.rateLimitedTomorrowAt"
          : "accountForm.rateLimitedAt",
        { time: notice.time, strong },
      );
    case "unreadable":
      return translate.rich("accountForm.rateLimitedFallback", { strong });
    default:
      return assertNever(notice);
  }
}

/** The shared wording of the account forms, resolved in one locale: the fields, the notices every form can show and
 *  the challenge slot. A page's own text is added here too: a component never reads the catalogue itself. */
export function resolveAccountKitCopy(translate: ContentTranslator) {
  return {
    emailLabel: translate("accountForm.emailLabel"),
    emailPlaceholder: translate("accountForm.emailPlaceholder"),
    passwordLabel: translate("accountForm.passwordLabel"),
    newPasswordLabel: translate("accountForm.newPasswordLabel"),
    passwordHint: translate("accountForm.passwordHint", {
      min: PASSWORD_MIN_LENGTH,
    }),
    passwordCount: (count: number, minimum: number) =>
      translate("accountForm.passwordCount", { count, min: minimum }),
    showPassword: translate("accountForm.showPassword"),
    hidePassword: translate("accountForm.hidePassword"),
    showPasswordName: translate("accountForm.showPasswordName"),
    hidePasswordName: translate("accountForm.hidePasswordName"),
    fieldSummary: (count: number) =>
      translate("accountForm.fieldSummary", { count }),
    rateLimitCountdown: (
      minutes: number,
      seconds: string,
      strong: RichTagRenderer,
    ) =>
      translate.rich("accountForm.rateLimitedCountdown", {
        minutes,
        seconds,
        strong,
      }),
    rateLimitReady: translate("accountForm.rateLimitedReady"),
    unavailable: {
      title: translate("accountForm.unavailableTitle"),
      body: translate("accountForm.unavailableBody"),
    },
    retry: translate("accountForm.retry"),
    requestFailed: {
      title: translate("accountForm.requestFailedTitle"),
      body: translate("accountForm.requestFailedBody"),
      tokenBody: translate("accountForm.requestFailedTokenBody"),
    },
    reloadPage: translate("accountForm.reloadPage"),
    offline: {
      title: translate("accountForm.offlineTitle"),
      body: translate("accountForm.offlineBody"),
    },
    challenge: {
      loading: translate("accountForm.challengeLoading"),
      failed: translate("accountForm.challengeFailed"),
      unavailable: translate("accountForm.challengeUnavailable"),
      waiting: translate("accountForm.challengeWaiting"),
    },
    checkInbox: {
      helpTitle: translate("accountForm.checkInboxHelpTitle"),
      spam: translate("accountForm.checkInboxSpam"),
      newest: translate("accountForm.checkInboxNewest"),
    },
    fieldError: (issue: AccountFieldIssue) =>
      resolveAccountFieldError(translate, issue),
    rateLimit: (notice: AccountRateLimitSentence, strong: RichTagRenderer) =>
      resolveAccountRateLimit(translate, notice, strong),
  };
}

export type AccountKitCopy = ReturnType<typeof resolveAccountKitCopy>;

/** The frame every account page sits in: the wordmark, the way back to the configurator and the language control. */
export function resolveAccountShellCopy(translate: ContentTranslator) {
  return {
    brand: translate("brand"),
    backToConfigurator: translate("accountShell.backToConfigurator"),
    localeMenu: translate("accountShell.localeMenu"),
  };
}

export type AccountShellCopy = ReturnType<typeof resolveAccountShellCopy>;

/** The forgotten-password page's own text, on the screen that asks and on the screen that says it was sent. */
export function resolveAccountForgotCopy(translate: ContentTranslator) {
  return {
    metaTitle: translate("accountForgot.metaTitle", {
      brand: translate("brand"),
    }),
    headerTitle: translate("accountForgot.headerTitle"),
    title: translate("accountForgot.title"),
    body: translate("accountForgot.body"),
    submit: translate("accountForgot.submit"),
    submitting: translate("accountForgot.submitting"),
    remembered: translate("accountForgot.remembered"),
    logIn: translate("accountForgot.logIn"),
    sentTitle: translate("accountForgot.sentTitle"),
    sentBody: translate("accountForgot.sentBody"),
  };
}

export type AccountForgotCopy = ReturnType<typeof resolveAccountForgotCopy>;

/** The register page's own text. The legal line carries a tagged span, drawn by the caller as the notice's link. */
export function resolveAccountRegisterCopy(translate: ContentTranslator) {
  return {
    metaTitle: translate("accountRegister.metaTitle", {
      brand: translate("brand"),
    }),
    headerTitle: translate("accountRegister.headerTitle"),
    title: translate("accountRegister.title"),
    body: translate("accountRegister.body"),
    phoneLabel: translate("accountRegister.phoneLabel"),
    phonePlaceholder: translate("accountRegister.phonePlaceholder"),
    phoneHint: translate("accountRegister.phoneHint"),
    legal: (notice: RichTagRenderer) =>
      translate.rich("accountRegister.legal", { notice }),
    noticeNewTab: translate("accountRegister.noticeNewTab"),
    submit: translate("accountRegister.submit"),
    submitting: translate("accountRegister.submitting"),
    haveAccount: translate("accountRegister.haveAccount"),
    logIn: translate("accountRegister.logIn"),
  };
}

export type AccountRegisterCopy = ReturnType<typeof resolveAccountRegisterCopy>;

/** The login page's own text. One sentence answers every refused sign-in, so it is one leaf. */
export function resolveAccountLoginCopy(translate: ContentTranslator) {
  return {
    metaTitle: translate("accountLogin.metaTitle", {
      brand: translate("brand"),
    }),
    headerTitle: translate("accountLogin.headerTitle"),
    title: translate("accountLogin.title"),
    submit: translate("accountLogin.submit"),
    submitting: translate("accountLogin.submitting"),
    forgot: translate("accountLogin.forgot"),
    noAccount: translate("accountLogin.noAccount"),
    createOne: translate("accountLogin.createOne"),
    invalidCredentials: translate("accountLogin.invalidCredentials"),
    sessionExpired: translate("accountLogin.sessionExpired"),
    signedOutEverywhere: translate("accountLogin.signedOutEverywhere"),
    passwordMaybeChanged: translate("accountLogin.passwordMaybeChanged"),
  };
}

export type AccountLoginCopy = ReturnType<typeof resolveAccountLoginCopy>;

/** The confirm-address page's own text. The invalid-link sentence carries a tagged span, drawn as the sign-in link. */
export function resolveAccountVerifyCopy(translate: ContentTranslator) {
  return {
    metaTitle: translate("accountVerify.metaTitle", {
      brand: translate("brand"),
    }),
    headerTitle: translate("accountVerify.headerTitle"),
    title: translate("accountVerify.title"),
    lead: translate("accountVerify.lead"),
    submit: translate("accountVerify.submit"),
    submitting: translate("accountVerify.submitting"),
    invalidLink: (link: RichTagRenderer) =>
      translate.rich("accountVerify.invalidLink", { link }),
    confirmedTitle: translate("accountVerify.confirmedTitle"),
    confirmedBody: translate("accountVerify.confirmedBody"),
  };
}

export type AccountVerifyCopy = ReturnType<typeof resolveAccountVerifyCopy>;

/** The new-password page's own text: the form, the changed screen and the one screen for a link that is no longer good. */
export function resolveAccountResetCopy(translate: ContentTranslator) {
  return {
    metaTitle: translate("accountReset.metaTitle", {
      brand: translate("brand"),
    }),
    headerTitle: translate("accountReset.headerTitle"),
    title: translate("accountReset.title"),
    body: translate("accountReset.body"),
    submit: translate("accountReset.submit"),
    submitting: translate("accountReset.submitting"),
    changedTitle: translate("accountReset.changedTitle"),
    changedBody: translate("accountReset.changedBody"),
    logIn: translate("accountReset.logIn"),
    linkInvalidTitle: translate("accountReset.linkInvalidTitle"),
    linkInvalidBody: translate("accountReset.linkInvalidBody"),
    requestNewLink: translate("accountReset.requestNewLink"),
  };
}

export type AccountResetCopy = ReturnType<typeof resolveAccountResetCopy>;

/** The page an unknown address under the account family lands on. */
export function resolveAccountNotFoundCopy(translate: ContentTranslator) {
  return {
    title: translate("accountNotFound.title"),
    body: translate("accountNotFound.body"),
  };
}

export type AccountNotFoundCopy = ReturnType<typeof resolveAccountNotFoundCopy>;

/** The page a signed-in account lands on when its role does not hold the capability the page needs. It never says the
 *  session expired: the session is live. */
export function resolveAccountForbiddenCopy(translate: ContentTranslator) {
  return {
    title: translate("accountForbidden.title"),
    body: translate("accountForbidden.body"),
  };
}

export type AccountForbiddenCopy = ReturnType<
  typeof resolveAccountForbiddenCopy
>;

/** The account control in the configurator's top bar: the way in, the name of the signed-in menu, what it says and the
 *  two ways out of it. */
export function resolveAccountControlCopy(translate: ContentTranslator) {
  return {
    signIn: translate("accountControl.signIn"),
    menuName: translate("accountControl.menuName"),
    signedInAs: translate("accountControl.signedInAs"),
    myKitchens: translate("accountControl.myKitchens"),
    profile: translate("accountControl.profile"),
    close: translate("accountControl.close"),
    signOutHere: translate("accountControl.signOutHere"),
    signOutEverywhere: translate("accountControl.signOutEverywhere"),
    signedOutToast: translate("accountControl.signedOutToast"),
    signOutFailed: translate("accountControl.signOutFailed"),
  };
}

export type AccountControlCopy = ReturnType<typeof resolveAccountControlCopy>;

/**
 * The list of the account's kitchens. A kitchen the person never named is called by the name its facts generate
 * (`resolvePresetName`), so the list and the preset chooser say the same thing of the same room.
 */
export function resolveAccountKitchensCopy(translate: ContentTranslator) {
  return {
    metaTitle: translate("accountKitchens.metaTitle", {
      brand: translate("brand"),
    }),
    title: translate("accountKitchens.title"),
    loading: translate("accountKitchens.loading"),
    count: (count: number) => translate("accountKitchens.count", { count }),
    sortNewestFirst: translate("accountKitchens.sortNewestFirst"),
    sentBadge: translate("accountKitchens.sentBadge"),
    draftBadge: translate("accountKitchens.draftBadge"),
    modified: (when: string) => translate("accountKitchens.modified", { when }),
    kitchenName: (summary: KitchenSummary) =>
      resolvePresetName(translate, summary),
    meta: (summary: KitchenSummary) =>
      translate("accountKitchens.meta", {
        shape: resolveShapeShortName(translate, summary.shape),
        walls: summary.wallsMm.join(PRESET_WALL_JOINER),
      }),
    price: resolvePriceCopy(translate),
    open: translate("accountKitchens.open"),
    openNamed: (name: string) =>
      translate("accountKitchens.openNamed", { name }),
    loadMore: translate("accountKitchens.loadMore"),
    loadingMore: translate("accountKitchens.loadingMore"),
    emptyTitle: translate("accountKitchens.emptyTitle"),
    emptyBody: translate("accountKitchens.emptyBody"),
    startKitchen: translate("accountKitchens.startKitchen"),
    actions: resolveKitchenActionsCopy(translate),
    rename: resolveKitchenRenameCopy(translate),
    duplicate: resolveKitchenDuplicateCopy(translate),
    remove: resolveKitchenRemoveCopy(translate),
    share: resolveKitchenShareCopy(translate),
    alreadyGone: translate("accountKitchens.alreadyGone"),
  };
}

function resolveKitchenActionsCopy(translate: ContentTranslator) {
  return {
    moreFor: (name: string) =>
      translate("accountKitchens.moreActions", { name }),
    close: translate("accountKitchens.close"),
    rename: translate("accountKitchens.menuRename"),
    duplicate: translate("accountKitchens.menuDuplicate"),
    share: translate("accountKitchens.menuShare"),
    delete: translate("accountKitchens.menuDelete"),
    hide: translate("accountKitchens.menuHide"),
  };
}

function resolveKitchenRenameCopy(translate: ContentTranslator) {
  return {
    label: translate("accountKitchens.renameLabel"),
    save: translate("accountKitchens.renameSave"),
    saving: translate("accountKitchens.renameSaving"),
    cancel: translate("accountKitchens.cancel"),
    fieldError: (code: AccountIssueCode) =>
      code === "REQUIRED"
        ? translate("accountKitchens.renameRequired")
        : resolveAccountFieldError(translate, { field: "name", code }),
  };
}

function resolveKitchenDuplicateCopy(translate: ContentTranslator) {
  return {
    nameOf: (name: string) => translate("accountKitchens.copyName", { name }),
    pending: translate("accountKitchens.copying"),
    created: translate("accountKitchens.copyCreated"),
    failed: translate("accountKitchens.copyFailed"),
  };
}

/** The two ways a kitchen leaves the list: a draft is deleted, a sent kitchen is hidden. */
function resolveKitchenRemoveCopy(translate: ContentTranslator) {
  return {
    cancel: translate("accountKitchens.cancel"),
    deleteTitle: (name: string) =>
      translate("accountKitchens.deleteTitle", { name }),
    deleteBody: translate("accountKitchens.deleteBody"),
    deleteConfirm: translate("accountKitchens.deleteConfirm"),
    deleteBusy: translate("accountKitchens.deleteBusy"),
    deleted: translate("accountKitchens.deleted"),
    sentMeanwhile: translate("accountKitchens.sentMeanwhile"),
    hideTitle: translate("accountKitchens.hideTitle"),
    hideBody: (strong: RichTagRenderer) =>
      translate.rich("accountKitchens.hideBody", { strong }),
    hideConfirm: translate("accountKitchens.hideConfirm"),
    hideBusy: translate("accountKitchens.hideBusy"),
    hidden: translate("accountKitchens.hidden"),
    notSentMeanwhile: translate("accountKitchens.notSentMeanwhile"),
  };
}

function resolveKitchenShareCopy(translate: ContentTranslator) {
  return {
    title: translate("accountKitchens.shareTitle"),
    body: translate("accountKitchens.shareBody"),
    linkLabel: translate("accountKitchens.shareLinkLabel"),
    active: translate("accountKitchens.shareActive"),
    create: translate("accountKitchens.shareCreate"),
    reissue: translate("accountKitchens.shareReissue"),
    reissueWarning: translate("accountKitchens.shareReissueWarning"),
    shownOnce: translate("accountKitchens.shareShownOnce"),
    copy: translate("accountKitchens.shareCopy"),
    copied: translate("accountKitchens.shareCopied"),
    stop: translate("accountKitchens.shareStop"),
    stopWarning: translate("accountKitchens.shareStopWarning"),
    stopping: translate("accountKitchens.shareStopping"),
    stopped: translate("accountKitchens.shareStopped"),
    error: translate("accountKitchens.shareError"),
    close: translate("accountKitchens.close"),
    cancel: translate("accountKitchens.cancel"),
  };
}

export type AccountKitchensCopy = ReturnType<typeof resolveAccountKitchensCopy>;

/** The profile page's own text: the optional details a signed-in account keeps. The e-mail label is the forms' own. */
export function resolveAccountProfileCopy(translate: ContentTranslator) {
  return {
    metaTitle: translate("accountProfile.metaTitle", {
      brand: translate("brand"),
    }),
    title: translate("accountProfile.title"),
    nameLabel: translate("accountProfile.nameLabel"),
    namePlaceholder: translate("accountProfile.namePlaceholder"),
    addressLabel: translate("accountProfile.addressLabel"),
    addressPlaceholder: translate("accountProfile.addressPlaceholder"),
    phoneLabel: translate("accountProfile.phoneLabel"),
    phonePlaceholder: translate("accountProfile.phonePlaceholder"),
    phoneHint: translate("accountProfile.phoneHint"),
    submit: translate("accountProfile.submit"),
    submitting: translate("accountProfile.submitting"),
    saved: translate("accountProfile.saved"),
    nothingToSave: translate("accountProfile.nothingToSave"),
    privacyNotice: translate("accountProfile.privacyNotice"),
    privacyNoticeNewTab: translate("accountProfile.privacyNoticeNewTab"),
  };
}

export type AccountProfileCopy = ReturnType<typeof resolveAccountProfileCopy>;

/** The password-change page's own text. The password policy hint and the field refusals are the forms' own. */
export function resolveAccountPasswordCopy(translate: ContentTranslator) {
  return {
    metaTitle: translate("accountPassword.metaTitle", {
      brand: translate("brand"),
    }),
    title: translate("accountPassword.title"),
    currentPasswordLabel: translate("accountPassword.currentPasswordLabel"),
    newPasswordLabel: translate("accountPassword.newPasswordLabel"),
    currentPasswordWrong: translate("accountPassword.currentPasswordWrong"),
    submit: translate("accountPassword.submit"),
    submitting: translate("accountPassword.submitting"),
    changedTitle: translate("accountPassword.changedTitle"),
    changedBody: translate("accountPassword.changedBody"),
    backToProfile: translate("accountPassword.backToProfile"),
    changedSignInBody: translate("accountPassword.changedSignInBody"),
    logIn: translate("accountPassword.logIn"),
  };
}

export type AccountPasswordCopy = ReturnType<typeof resolveAccountPasswordCopy>;

/** The e-mail change's own text: the confirm page that the e-mailed link opens, and the sheet on the profile that asks
 *  for the link. The field refusals and the service notices are the forms' own. */
export function resolveAccountEmailChangeCopy(translate: ContentTranslator) {
  return {
    metaTitle: translate("accountEmailChange.metaTitle", {
      brand: translate("brand"),
    }),
    title: translate("accountEmailChange.title"),
    lead: translate("accountEmailChange.lead"),
    confirm: translate("accountEmailChange.confirm"),
    confirming: translate("accountEmailChange.confirming"),
    changedTitle: translate("accountEmailChange.changedTitle"),
    changedBody: translate("accountEmailChange.changedBody"),
    logIn: translate("accountEmailChange.logIn"),
    linkInvalidTitle: translate("accountEmailChange.linkInvalidTitle"),
    linkInvalidBody: translate("accountEmailChange.linkInvalidBody"),
    openProfile: translate("accountEmailChange.openProfile"),
    changeControl: translate("accountEmailChange.changeControl"),
    sheetTitle: translate("accountEmailChange.sheetTitle"),
    newEmailLabel: translate("accountEmailChange.newEmailLabel"),
    passwordHint: translate("accountEmailChange.passwordHint"),
    send: translate("accountEmailChange.send"),
    sending: translate("accountEmailChange.sending"),
    cancel: translate("accountEmailChange.cancel"),
    sentTitle: translate("accountEmailChange.sentTitle"),
    sentBody: translate("accountEmailChange.sentBody"),
    close: translate("accountEmailChange.close"),
  };
}

export type AccountEmailChangeCopy = ReturnType<
  typeof resolveAccountEmailChangeCopy
>;

/** The undo page's own text: the form that asks for a new password, the restored screen and the one screen for a link
 *  that is no longer good. The field refusals and the service notices are the forms' own. */
export function resolveAccountRevertEmailCopy(translate: ContentTranslator) {
  return {
    metaTitle: translate("accountRevertEmail.metaTitle", {
      brand: translate("brand"),
    }),
    title: translate("accountRevertEmail.title"),
    lead: translate("accountRevertEmail.lead"),
    submit: translate("accountRevertEmail.submit"),
    submitting: translate("accountRevertEmail.submitting"),
    doneTitle: translate("accountRevertEmail.doneTitle"),
    doneBody: translate("accountRevertEmail.doneBody"),
    logIn: translate("accountRevertEmail.logIn"),
    linkInvalidTitle: translate("accountRevertEmail.linkInvalidTitle"),
    linkInvalidBody: translate("accountRevertEmail.linkInvalidBody"),
    passwordUnchanged: translate("accountRevertEmail.passwordUnchanged"),
  };
}

export type AccountRevertEmailCopy = ReturnType<
  typeof resolveAccountRevertEmailCopy
>;

/** The data-export page's own text. The refusal for an account too large to export is the profile namespace's leaf; the
 *  limit, offline and unavailable notices are the forms' own. */
export function resolveAccountExportCopy(translate: ContentTranslator) {
  return {
    metaTitle: translate("accountExport.metaTitle", {
      brand: translate("brand"),
    }),
    title: translate("accountExport.title"),
    lead: translate("accountExport.lead"),
    submit: translate("accountExport.submit"),
    submitting: translate("accountExport.submitting"),
    preparing: translate("accountExport.preparing"),
    downloaded: translate("accountExport.downloaded"),
    downloadedHint: translate("accountExport.downloadedHint"),
    downloadAgain: translate("accountExport.downloadAgain"),
    backToProfile: translate("accountExport.backToProfile"),
    tooLarge: translate("accountProfile.exportTooLarge"),
  };
}

export type AccountExportCopy = ReturnType<typeof resolveAccountExportCopy>;

function resolveShapeShortName(
  translate: ContentTranslator,
  shape: DesignRoomShape,
): string {
  switch (shape) {
    case "linear":
      return translate("room.shapes.linear.short");
    case "L":
      return translate("room.shapes.L.short");
    case "U":
      return translate("room.shapes.U.short");
    default:
      return assertNever(shape);
  }
}

/** The question that signs the person out of every device, and the sentence for the one failure it names itself. A
 *  connection that dropped is told by the form kit's offline notice, which every account screen shares. */
export function resolveLogoutEverywhereCopy(translate: ContentTranslator) {
  return {
    title: translate("logoutEverywhere.title"),
    description: translate("logoutEverywhere.description"),
    confirm: translate("logoutEverywhere.confirm"),
    busy: translate("logoutEverywhere.busy"),
    cancel: translate("logoutEverywhere.cancel"),
    unavailable: translate("logoutEverywhere.unavailable"),
  };
}

/** The sheet that tells the editor its signed-in session ended. `returnNote` is said only beside a way back to a saved
 *  kitchen, and it promises nothing about edits that were not saved. */
export function resolveSessionExpiredSheetCopy(translate: ContentTranslator) {
  return {
    title: translate("sessionExpiredSheet.title"),
    body: translate("sessionExpiredSheet.body"),
    returnNote: translate("sessionExpiredSheet.returnNote"),
    signIn: translate("sessionExpiredSheet.signIn"),
    later: translate("sessionExpiredSheet.later"),
  };
}

export type SessionExpiredSheetCopy = ReturnType<
  typeof resolveSessionExpiredSheetCopy
>;

/** The card Step 1 shows once to a visitor who has just left an edited editor. It says the kitchen is kept in this
 *  browser and can be attached to an account, and never that it is saved in one (plan M8B Lot 2 section 14.2, U15-5). */
export function resolveVisitorAccountCardCopy(translate: ContentTranslator) {
  return {
    title: translate("visitorAccountCard.title"),
    body: translate("visitorAccountCard.body"),
    createAccount: translate("visitorAccountCard.createAccount"),
    notNow: translate("visitorAccountCard.notNow"),
  };
}

/** The question that attaches the browser's kitchens to the account just signed in, and its one answer. The count is a
 *  value, never a sentence of its own: each language agrees the whole sentence with it in the catalogue. */
export function resolveClaimDialogCopy(translate: ContentTranslator) {
  return {
    title: translate("claimDialog.title"),
    question: (count: number, strong: RichTagRenderer) =>
      translate.rich("claimDialog.question", { count, strong }),
    warning: translate("claimDialog.warning"),
    confirm: translate("claimDialog.confirm"),
    busy: translate("claimDialog.busy"),
    cancel: translate("claimDialog.cancel"),
    claimedTitle: (count: number, check: RichTagRenderer) =>
      translate.rich("claimDialog.claimedTitle", { count, check }),
    continueOn: translate("claimDialog.continue"),
    openKitchens: translate("claimDialog.openKitchens"),
  };
}

export type ClaimDialogCopy = ReturnType<typeof resolveClaimDialogCopy>;

/** The screen after a registration was accepted. The address is the one the person typed, passed as a value. */
export function resolveAccountCheckInboxCopy(translate: ContentTranslator) {
  return {
    headerTitle: translate("accountCheckInbox.headerTitle"),
    title: translate("accountCheckInbox.title"),
    body: (email: string, strong: RichTagRenderer) =>
      translate.rich("accountCheckInbox.body", { email, strong }),
    validity: translate("accountCheckInbox.validity"),
    retryOrLogIn: (link: RichTagRenderer) =>
      translate.rich("accountCheckInbox.retryOrLogIn", { link }),
    wrongAddress: translate("accountCheckInbox.wrongAddress"),
  };
}

export type AccountCheckInboxCopy = ReturnType<
  typeof resolveAccountCheckInboxCopy
>;

/** The stand-in for the privacy notice. `version` is the notice version the stub holds the place of. */
export function resolvePrivacyNoticeCopy(
  translate: ContentTranslator,
  version: string,
) {
  return {
    metaTitle: translate("privacyNotice.metaTitle", {
      brand: translate("brand"),
    }),
    badge: translate("privacyNotice.badge"),
    title: translate("privacyNotice.title"),
    placeholder: translate("privacyNotice.placeholder", { version }),
    backToConfigurator: translate("accountShell.backToConfigurator"),
  };
}

export type PrivacyNoticeCopy = ReturnType<typeof resolvePrivacyNoticeCopy>;

/** Resolves the content shape the pre-i18n models consume: every leaf comes from the active locale, and the
 *  closures keep the model-facing signatures while ICU does interpolation and plural selection. */
/** Walls are written in the order A, B, C and joined by the multiplication sign, which both shipped locales share. */
const PRESET_WALL_JOINER = " × ";

/**
 * The name a preset has when nobody typed one: its shape, its walls in whole millimetres and the kitchen's colour
 * (ADR 0112 Amendment A). Rendered here from the stored facts and never stored, so each locale reads its own words.
 * The colour is lower-cased after it is named, and a design that declares none simply leaves it out.
 */
export function resolvePresetName(
  translate: ContentTranslator,
  facts: PresetNameFacts,
): string {
  const shape = resolvePresetShapeName(translate, facts.shape);
  const walls = facts.wallsMm.join(PRESET_WALL_JOINER);
  if (facts.finish === undefined) {
    return translate("presetSave.generatedNameNoFinish", { shape, walls });
  }
  const finish = resolvePresetFinishName(translate, facts.finish);
  return translate("presetSave.generatedName", { shape, walls, finish });
}

function resolvePresetShapeName(
  translate: ContentTranslator,
  shape: PresetNameFacts["shape"],
): string {
  switch (shape) {
    case "linear":
      return translate("room.shapes.linear.name");
    case "L":
      return translate("room.shapes.L.name");
    case "U":
      return translate("room.shapes.U.name");
    default:
      return assertNever(shape);
  }
}

/** A palette entry by its approved name; a free colour has none, so by its value. */
function resolvePresetFinishName(
  translate: ContentTranslator,
  finish: Finish,
): string {
  const name =
    finish.kind === "palette-entry"
      ? resolveFinishName(translate, finish.entryId)
      : translate("globalSettings.pillColourValue", {
          colourValue: finish.value,
        });
  return name.toLowerCase();
}

/** The words every price figure is made of, which the configurator's bar and the account's kitchen cards share. */
export function resolvePriceCopy(translate: ContentTranslator) {
  return {
    startingPrefix: translate("price.startingPrefix"),
    amountWithCurrency: (amount: string) =>
      translate("price.amountWithCurrency", { amount }),
    overflowingTotalWarning: translate("price.overflowingTotalWarning"),
    emptyKitchenPrompt: translate("price.emptyKitchenPrompt"),
  };
}

export function resolveContent(translate: ContentTranslator) {
  return {
    // `cornerDirection` stays the second positional argument, so existing two-argument calls keep their meaning.
    // `wall` is third and read only by a refusal whose `sides` names one; a caller with no wall gets the default.
    rejection: (
      detail: RejectionDetail,
      cornerDirection?: CornerDirection,
      wall?: DesignWall,
    ) => resolveRejection(translate, detail, wall, cornerDirection),
    /** A domain descriptor resolved through `catalog.*` (see `resolveBodyLabel`). Held on `Content` because a
     *  model already threading the resolved content has no translator of its own. */
    bodyLabel: (label: BodyLabel) => resolveBodyLabel(translate, label),
    bandLabel: (band: Band) => resolveBandLabel(translate, band),
    finishName: (entryId: PaletteEntryId) =>
      resolveFinishName(translate, entryId),
    /** A price book row's rendered sentence (see `resolveBookText`): a descriptor resolver, not a content family. */
    bookText: (authored: string, key: string | undefined) =>
      resolveBookText(translate, authored, key),
    reviewRoomLine: (line: ReviewRoomLine) =>
      resolveReviewRoomLine(translate, line),
    contactFieldError: (code: ContactFieldCode) =>
      resolveContactFieldError(translate, code),
    contactOutcome: (notice: ContactOutcomeNotice) =>
      resolveContactOutcome(translate, notice),
    /** A saved kitchen's facts resolved to its generated preset name (a descriptor resolver, like `reviewRoomLine`). */
    presetName: (facts: PresetNameFacts) => resolvePresetName(translate, facts),
    brand: translate("brand"),
    configure: {
      step: translate("configure.step", { step: 2, totalSteps: 4 }),
      stepPill: translate("configure.stepPill", { step: 2, totalSteps: 4 }),
      title: translate("configure.title"),
      locale: translate("configure.locale"),
      localeMenu: translate("configure.localeMenu"),
      back: translate("configure.back"),
      backAction: translate("configure.backAction"),
      backConfirm: {
        title: translate("configure.backConfirm.title"),
        bodyClient: translate("configure.backConfirm.bodyClient"),
        bodyVisitor: translate("configure.backConfirm.bodyVisitor"),
        confirm: translate("configure.backConfirm.confirm"),
        stay: translate("configure.backConfirm.stay"),
      },
      reviewCta: translate("configure.reviewCta"),
      orbitHint: translate("configure.orbitHint"),
      cameraGroupLabel: translate("configure.cameraGroupLabel"),
      cameraPresets: {
        overview: translate("configure.cameraPresets.overview"),
        wallA: translate("configure.cameraPresets.wallA"),
        wallB: translate("configure.cameraPresets.wallB"),
        wallC: translate("configure.cameraPresets.wallC"),
      },
      loading: translate("configure.loading"),
      overflowWarning: translate("configure.overflowWarning"),
    },
    presetSave: {
      open: translate("presetSave.open"),
      intro: translate("presetSave.intro"),
      nameLabel: translate("presetSave.nameLabel"),
      confirm: translate("presetSave.confirm"),
      close: translate("presetSave.close"),
      waiting: translate("presetSave.waiting"),
      saving: translate("presetSave.saving"),
      saved: translate("presetSave.saved"),
      refusal: {
        findings: translate("presetSave.refusal.findings"),
        missingSink: translate("presetSave.refusal.missingSink"),
        missingHob: translate("presetSave.refusal.missingHob"),
        missingSinkAndHob: translate("presetSave.refusal.missingSinkAndHob"),
        stale: translate("presetSave.refusal.stale"),
        nameRefused: translate("presetSave.refusal.nameRefused"),
        imageRefused: translate("presetSave.refusal.imageRefused"),
        tooLarge: translate("presetSave.refusal.tooLarge"),
        presetLimit: translate("presetSave.refusal.presetLimit"),
        saveLimit: translate("presetSave.refusal.saveLimit"),
        unavailable: translate("presetSave.refusal.unavailable"),
        notSaved: translate("presetSave.refusal.notSaved"),
        failed: translate("presetSave.refusal.failed"),
      },
    },
    presetChooser: {
      heading: translate("presetChooser.heading"),
      waiting: translate("presetChooser.waiting"),
      preview: translate("presetChooser.preview"),
      adjusted: translate("presetChooser.adjusted"),
      skip: translate("presetChooser.skip"),
      previous: translate("presetChooser.previous"),
      next: translate("presetChooser.next"),
      close: translate("presetChooser.close"),
      select: translate("presetChooser.select"),
      selecting: translate("presetChooser.selecting"),
      selectFailed: translate("presetChooser.selectFailed"),
      selectLimitReached: translate("presetChooser.selectLimitReached"),
      composingNotice: translate("presetChooser.composingNotice"),
    },
    panel: {
      close: translate("panel.close"),
      done: translate("panel.done"),
      remove: translate("panel.remove"),
      headerMeta: (
        wall: string,
        bandLabel: string,
        widthMm: number,
        heightMm: number,
      ) =>
        translate("panel.headerMeta", {
          wall,
          bandLabel,
          widthMm,
          heightMm,
        }),
      replaceTitleOccupied: translate("panel.replaceTitleOccupied"),
      replaceTitleEmpty: translate("panel.replaceTitleEmpty"),
      bandWords: {
        base: {
          one: translate("panel.bandWords.base.one"),
          many: translate("panel.bandWords.base.many"),
        },
        wall: {
          one: translate("panel.bandWords.wall.one"),
          many: translate("panel.bandWords.wall.many"),
        },
        column: {
          one: translate("panel.bandWords.column.one"),
          many: translate("panel.bandWords.column.many"),
        },
      },
      countForBody: (count: number, bandWord: string, widthMm: number) =>
        translate("panel.countForBody", { count, bandWord, widthMm }),
      countForSlot: (count: number, widthMm: number, heightMm: number) =>
        translate("panel.countForSlot", { count, widthMm, heightMm }),
      noOffersForBody: (bandWord: string) =>
        translate("panel.noOffersForBody", { bandWord }),
      noOffersForSlot: (widthMm: number, heightMm: number) =>
        translate("panel.noOffersForSlot", { widthMm, heightMm }),
      noOffersTooWide: (widthMm: number, maxWidthMm: number) =>
        translate("panel.noOffersTooWide", { widthMm, maxWidthMm }),
      noOffersTooNarrow: (widthMm: number, minWidthMm: number) =>
        translate("panel.noOffersTooNarrow", { widthMm, minWidthMm }),
      offerSize: (widthMm: number, heightMm: number) =>
        translate("panel.offerSize", { widthMm, heightMm }),
      currentBadge: translate("panel.currentBadge"),
      probeUnavailable: translate("panel.probeUnavailable"),
      readOnlyNotice: translate("panel.readOnlyNotice"),
      readOnlyReason: translate("panel.readOnlyReason"),
      accessCheckingNotice: translate("panel.accessCheckingNotice"),
      accessCheckingReason: translate("panel.accessCheckingReason"),
      accessUncheckableNotice: translate("panel.accessUncheckableNotice"),
      accessUncheckableReason: translate("panel.accessUncheckableReason"),
      accessRetryLabel: translate("panel.accessRetryLabel"),
      saveConflictNotice: translate("panel.saveConflictNotice"),
      saveConflictReloadLabel: translate("panel.saveConflictReloadLabel"),
      saveConflictOverwriteLabel: translate("panel.saveConflictOverwriteLabel"),
      readOnlyRefusedNotice: translate("panel.readOnlyRefusedNotice"),
      saveFailedNotice: translate("panel.saveFailedNotice"),
      saveStoppedNotice: translate("panel.saveStoppedNotice"),
      // Drafted: the limit on saves paused the write until `time`; the change stays on screen and goes by itself.
      savePausedNotice: (time: string) =>
        translate("panel.savePausedNotice", { time }),
      finishTitle: translate("panel.finishTitle"),
      finishApproximationNote: translate("panel.finishApproximationNote"),
      finishPickerLabel: translate("panel.finishPickerLabel"),
      finishFollowsKitchen: translate("panel.finishFollowsKitchen"),
      handleTitle: translate("panel.handleTitle"),
      handleLabels: {
        steel: translate("panel.handleLabels.steel"),
        black: translate("panel.handleLabels.black"),
        push: translate("panel.handleLabels.push"),
      },
      handleDefaultNote: (label: string) =>
        translate("panel.handleDefaultNote", { label }),
      widthTitle: translate("panel.widthTitle"),
      widthValue: (widthMm: number) =>
        translate("panel.widthValue", { widthMm }),
      widthStepLabels: {
        narrower: translate("panel.widthStepLabels.narrower"),
        wider: translate("panel.widthStepLabels.wider"),
      },
      widthStepAriaLabels: {
        narrower: translate("panel.widthStepAriaLabels.narrower"),
        wider: translate("panel.widthStepAriaLabels.wider"),
      },
      widthStepNote: translate("panel.widthStepNote"),
      // ADR 0129 D8: the reflected sentence for a right-hand room. A separate leaf rather than an ICU selector,
      // because `widthStepNote` takes no runtime argument; `panel-model.ts` picks by `cornerDirectionOf(design.room)`.
      widthStepNoteRight: translate("panel.widthStepNoteRight"),
      widthChoiceNote: translate("panel.widthChoiceNote"),
      structuralTitle: translate("panel.structuralTitle"),
      structuralReasons: {
        corner: translate("panel.structuralReasons.corner"),
      },
    },
    price: resolvePriceCopy(translate),
    priceBreakdown: {
      title: translate("priceBreakdown.title"),
      disclaimer: translate("priceBreakdown.disclaimer"),
      note: translate("priceBreakdown.note"),
      close: translate("priceBreakdown.close"),
      placementLabel: (bodyLabel: string, widthMm: number) =>
        translate("priceBreakdown.placementLabel", { bodyLabel, widthMm }),
      groupHeading: (wall: string, bandWord: string) =>
        translate("priceBreakdown.groupHeading", { wall, bandWord }),
      bandHeadings: {
        base: translate("priceBreakdown.bandHeadings.base"),
        wall: translate("priceBreakdown.bandHeadings.wall"),
        column: translate("priceBreakdown.bandHeadings.column"),
      },
      wholeKitchenLabel: (categoryWord: string, tierName: string) =>
        translate("priceBreakdown.wholeKitchenLabel", {
          categoryWord,
          tierName,
        }),
      wholeKitchenCategories: {
        accessory: translate("priceBreakdown.wholeKitchenCategories.accessory"),
        hardware: translate("priceBreakdown.wholeKitchenCategories.hardware"),
        material: translate("priceBreakdown.wholeKitchenCategories.material"),
      },
      included: translate("priceBreakdown.included"),
      notIncluded: translate("priceBreakdown.notIncluded"),
    },
    review: {
      title: translate("review.title"),
      roundedUpNote: translate("review.roundedUpNote"),
      refusalReasons: {
        PRICING_FAILED: translate("review.refusalReasons.PRICING_FAILED"),
        NO_CABINET: translate("review.refusalReasons.NO_CABINET"),
        BODIES_PAST_WALL: translate("review.refusalReasons.BODIES_PAST_WALL"),
      },
    },
    reviewScreen: {
      callToAction: translate("reviewScreen.callToAction"),
      editGroup: translate("reviewScreen.editGroup"),
      changeSettings: translate("reviewScreen.changeSettings"),
      view3d: translate("reviewScreen.view3d"),
      saving: translate("reviewScreen.saving"),
      conflict: translate("reviewScreen.conflict"),
      openEditor: translate("reviewScreen.openEditor"),
      topBarTitle: translate("reviewScreen.topBarTitle"),
    },
    globalSettings: {
      open: translate("globalSettings.open"),
      title: translate("globalSettings.title"),
      appliesTo: (bodyCount: number) =>
        translate("globalSettings.appliesTo", { bodyCount }),
      groupHeadings: {
        material: translate("globalSettings.groupHeadings.material"),
        hardware: translate("globalSettings.groupHeadings.hardware"),
      },
      groupAnchors: {
        material: translate("globalSettings.groupAnchors.material"),
        hardware: translate("globalSettings.groupAnchors.hardware"),
      },
      tierDelta: (addedAmount: string) =>
        translate("globalSettings.tierDelta", { addedAmount }),
      materialWarning: translate("globalSettings.materialWarning"),
      applyRefused: (settingName: string, reason: string) =>
        translate("globalSettings.applyRefused", { settingName, reason }),
      pillMaterial: (tierName: string) =>
        translate("globalSettings.pillMaterial", { tierName }),
      pillColourValue: (colourValue: string) =>
        translate("globalSettings.pillColourValue", { colourValue }),
      pillHardware: (categoryWord: string, tierName: string) =>
        translate("globalSettings.pillHardware", { categoryWord, tierName }),
      pillDepth: (cabinetDepthMm: number) =>
        translate("globalSettings.pillDepth", { cabinetDepthMm }),
      /** The pill names every setting whether or not it draws it: `+N` is a visual economy a screen reader
       *  cannot read. */
      pillNameAllSettings: (settings: readonly string[]) =>
        translate("globalSettings.pillNameAllSettings", {
          openLabel: translate("globalSettings.open"),
          settings: settings.join(translate("globalSettings.pillNameJoin")),
        }),
      colourHeading: translate("globalSettings.colourHeading"),
      colourNote: translate("globalSettings.colourNote"),
      colourWarning: translate("globalSettings.colourWarning"),
      depthHeading: translate("globalSettings.depthHeading"),
      depthOption: (cabinetDepthMm: number) =>
        translate("globalSettings.depthOption", { cabinetDepthMm }),
      depthWarning: translate("globalSettings.depthWarning"),
      depthNote: translate("globalSettings.depthNote"),
      apply: translate("globalSettings.apply"),
      cancel: translate("globalSettings.cancel"),
      materialResetConfirm: {
        title: translate("globalSettings.materialResetConfirm.title"),
        body: (chosenCount: number) =>
          translate("globalSettings.materialResetConfirm.body", {
            chosenCount,
          }),
        globalBody: translate("globalSettings.materialResetConfirm.globalBody"),
        confirm: translate("globalSettings.materialResetConfirm.confirm"),
        back: translate("globalSettings.materialResetConfirm.back"),
      },
    },
    webglUnavailable: {
      titleMobile: translate("webglUnavailable.titleMobile"),
      titleDesktop: translate("webglUnavailable.titleDesktop"),
      bodyMobile: translate("webglUnavailable.bodyMobile"),
      bodyDesktop: translate("webglUnavailable.bodyDesktop"),
      contactLink: translate("webglUnavailable.contactLink"),
      noFakePreview: translate("webglUnavailable.noFakePreview"),
    },
    designLoadError: {
      title: translate("designLoadError.title"),
      bodyNotFound: translate("designLoadError.bodyNotFound"),
      bodyInvalid: translate("designLoadError.bodyInvalid"),
      // The "wrong browser" refusal (ADR 0114 decision 5).
      bodyUnavailable: translate("designLoadError.bodyUnavailable"),
      // A signed-in client's one sentence: it names no cause, so it tells nothing of why the design was refused.
      bodyClient: translate("designLoadError.bodyClient"),
      startOver: translate("designLoadError.startOver"),
      // The sentence a refused page read is answered with: the interceptor reads it from the catalogue itself.
      tooManyRequests: translate("designLoadError.tooManyRequests"),
      // The label of the one link on that page, which is the page's own word and not another surface's.
      tryAgain: translate("designLoadError.tryAgain"),
    },
    share: {
      title: translate("share.title"),
      description: translate("share.description"),
      create: translate("share.create"),
      reissue: translate("share.reissue"),
      active: translate("share.active"),
      reissueWarning: translate("share.reissueWarning"),
      shownOnce: translate("share.shownOnce"),
      copy: translate("share.copy"),
      copied: translate("share.copied"),
      revoke: translate("share.revoke"),
      revoked: translate("share.revoked"),
      error: translate("share.error"),
      retry: translate("share.retry"),
    },
    contact: {
      topBarTitle: translate("contact.topBarTitle"),
      heading: translate("contact.heading"),
      subheading: translate("contact.subheading"),
      headingNoDesign: translate("contact.headingNoDesign"),
      subheadingNoDesign: translate("contact.subheadingNoDesign"),
      nameLabel: translate("contact.nameLabel"),
      namePlaceholder: translate("contact.namePlaceholder"),
      phoneLabel: translate("contact.phoneLabel"),
      phonePlaceholder: translate("contact.phonePlaceholder"),
      localityLabel: translate("contact.localityLabel"),
      localityPlaceholder: translate("contact.localityPlaceholder"),
      emailLabel: translate("contact.emailLabel"),
      emailPlaceholder: translate("contact.emailPlaceholder"),
      channelLabel: translate("contact.channelLabel"),
      channels: {
        phone: translate("contact.channels.phone"),
        whatsapp: translate("contact.channels.whatsapp"),
        email: translate("contact.channels.email"),
      },
      // Q7 (b): a slot. The sentence and its marker are provisional until the owner supplies the privacy text.
      consent: translate("contact.consent"),
      consentProvisionalMarker: translate("contact.consentProvisionalMarker"),
      callToAction: translate("contact.callToAction"),
      sending: translate("contact.sending"),
      sendingLine: translate("contact.sendingLine"),
      sendingLineNoDesign: translate("contact.sendingLineNoDesign"),
      reviewLink: translate("contact.reviewLink"),
      retry: translate("contact.retry"),
      unavailable: translate("contact.unavailable"),
    },
    submissionResult: {
      topBarTitle: translate("submissionResult.topBarTitle"),
      sentHeading: translate("submissionResult.sentHeading"),
      referenceLabel: translate("submissionResult.referenceLabel"),
      copy: translate("submissionResult.copy"),
      copied: translate("submissionResult.copied"),
      designLinkLabel: translate("submissionResult.designLinkLabel"),
      designLinkNote: translate("submissionResult.designLinkNote"),
      channelLine: (line: SubmissionChannelLine) =>
        resolveSubmissionChannelLine(translate, line),
      channelLineWithoutValue: translate(
        "submissionResult.channelLineWithoutValue",
      ),
      savedSentence: translate("submissionResult.savedSentence"),
      nextStepsTitle: translate("submissionResult.nextStepsTitle"),
      // Q9: the three steps are a slot. The sentences and their marker are provisional until the owner confirms them.
      nextStepsProvisionalMarker: translate(
        "submissionResult.nextStepsProvisionalMarker",
      ),
      nextStepVerify: translate("submissionResult.nextStepVerify"),
      nextStepFinalPrice: translate("submissionResult.nextStepFinalPrice"),
      nextStepMeasure: translate("submissionResult.nextStepMeasure"),
      backToDesign: translate("submissionResult.backToDesign"),
      reviewLink: translate("submissionResult.reviewLink"),
      sendOnWhatsapp: translate("submissionResult.sendOnWhatsapp"),
      openWhatsapp: translate("submissionResult.openWhatsapp"),
      whatsappMessageToShop: (parts: ShopWhatsappMessageParts) =>
        resolveShopWhatsappMessage(translate, parts),
      noRequest: translate("submissionResult.noRequest"),
      notShown: translate("submissionResult.notShown"),
      alreadySentHeading: translate("submissionResult.alreadySentHeading"),
      alreadySentAdvice: (phone: string) =>
        resolveAlreadySentAdvice(translate, phone),
      alreadySentChangedKitchen: translate(
        "submissionResult.alreadySentChangedKitchen",
      ),
      callShop: translate("submissionResult.callShop"),
      failureHeading: translate("submissionResult.failureHeading"),
      failureLostConnection: translate(
        "submissionResult.failureLostConnection",
      ),
      failureNotSent: translate("submissionResult.failureNotSent"),
      failureKept: translate("submissionResult.failureKept"),
      failureKeptNoDesign: translate("submissionResult.failureKeptNoDesign"),
      keptTitle: translate("submissionResult.keptTitle"),
      keptContact: translate("submissionResult.keptContact"),
      waitingForConnection: translate("submissionResult.waitingForConnection"),
      retryAutomatically: translate("submissionResult.retryAutomatically"),
    },
    leadNotice: {
      subject: (reference: string) =>
        translate("leadNotice.subject", { reference }),
      line: (label: string, value: string) =>
        translate("leadNotice.line", { label, value }),
      figure: (label: string, amount: string) =>
        translate("leadNotice.figure", { label, amount }),
      labels: {
        reference: translate("leadNotice.labels.reference"),
        locale: translate("leadNotice.labels.locale"),
        name: translate("leadNotice.labels.name"),
        phone: translate("leadNotice.labels.phone"),
        locality: translate("leadNotice.labels.locality"),
        channel: translate("leadNotice.labels.channel"),
        email: translate("leadNotice.labels.email"),
        room: translate("leadNotice.labels.room"),
        price: translate("leadNotice.labels.price"),
      },
      channels: {
        phone: translate("leadNotice.channels.phone"),
        whatsapp: translate("leadNotice.channels.whatsapp"),
        email: translate("leadNotice.channels.email"),
      },
      callbackLine: translate("leadNotice.callbackLine"),
      emptyValue: translate("leadNotice.emptyValue"),
      tagline: translate("leadNotice.tagline"),
      heading: translate("leadNotice.heading"),
      kitchen: {
        button: translate("leadNotice.kitchen.button"),
        note: translate("leadNotice.kitchen.note"),
        unavailable: translate("leadNotice.kitchen.unavailable"),
        linkLabel: translate("leadNotice.kitchen.linkLabel"),
      },
      clientHeading: translate("leadNotice.clientHeading"),
      actions: {
        call: translate("leadNotice.actions.call"),
        whatsapp: translate("leadNotice.actions.whatsapp"),
        email: translate("leadNotice.actions.email"),
      },
      summaryHeading: translate("leadNotice.summaryHeading"),
      groupCount: (heading: string, count: number) =>
        translate("leadNotice.groupCount", { heading, count }),
      appendixHeading: translate("leadNotice.appendixHeading"),
      revisionLabel: translate("leadNotice.revisionLabel"),
      noReply: translate("leadNotice.noReply"),
      preheader: (parts: NoticePreheaderParts) =>
        resolveNoticePreheader(translate, parts),
    },
  };
}

export type Content = ReturnType<typeof resolveContent>;
