import type { _Translator, Messages } from "next-intl";

import type {
  Band,
  BodyLabel,
  CornerDirection,
  DesignWall,
  EmptySpaceSide,
  PaletteEntryId,
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

/** Resolves the content shape the pre-i18n models consume: every leaf comes from the active locale, and the
 *  closures keep the model-facing signatures while ICU does interpolation and plural selection. */
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
        body: translate("configure.backConfirm.body"),
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
    price: {
      startingPrefix: translate("price.startingPrefix"),
      amountWithCurrency: (amount: string) =>
        translate("price.amountWithCurrency", { amount }),
      overflowingTotalWarning: translate("price.overflowingTotalWarning"),
      emptyKitchenPrompt: translate("price.emptyKitchenPrompt"),
    },
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
      emailLink: translate("webglUnavailable.emailLink"),
      contactLink: translate("webglUnavailable.contactLink"),
      noFakePreview: translate("webglUnavailable.noFakePreview"),
    },
    designLoadError: {
      title: translate("designLoadError.title"),
      bodyNotFound: translate("designLoadError.bodyNotFound"),
      bodyInvalid: translate("designLoadError.bodyInvalid"),
      // The "wrong browser" refusal (ADR 0114 decision 5).
      bodyUnavailable: translate("designLoadError.bodyUnavailable"),
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
    contactPlaceholder: {
      title: translate("contactPlaceholder.title"),
      body: translate("contactPlaceholder.body"),
      back: translate("contactPlaceholder.back"),
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
    },
  };
}

export type Content = ReturnType<typeof resolveContent>;
