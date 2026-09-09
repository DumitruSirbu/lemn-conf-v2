import type { _Translator, Messages } from "next-intl";

import type {
  EmptySpaceSide,
  RejectionDetail,
} from "@lemnaria/configurator-domain";

export type ContentTranslator = _Translator<Messages>;

function assertNever(value: never): never {
  throw new Error(`Unhandled rejection descriptor: ${JSON.stringify(value)}`);
}

/** next-intl 4.14.2's generated argument parser types a select-only message as accepting no values.
 * An exact-value `selectordinal` keeps this one catalogue leaf typed without changing its output;
 * these numbers are only the adapter's exhaustive side/reason selector, never domain data. */
function resolveEmptySpaceSide(
  translate: ContentTranslator,
  side: EmptySpaceSide,
): string {
  switch (side.side) {
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
      return assertNever(side.side);
  }
}

function resolveEmptySpaceSides(
  translate: ContentTranslator,
  sides: readonly EmptySpaceSide[],
): string {
  return sides
    .map((side) => resolveEmptySpaceSide(translate, side))
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

/** Resolves a locale-free domain refusal through the active message catalogue. The exhaustive
 * literal-key switch keeps all 34 codes checked against both the domain union and generated ICU
 * argument declarations. */
export function resolveRejection(
  translate: ContentTranslator,
  detail: RejectionDetail,
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
        label: detail.params.label,
      });
    case "NOT_DELETABLE":
      return translate("rejection.NOT_DELETABLE", {
        label: detail.params.label,
      });
    case "NOT_IN_LIBRARY":
      return translate("rejection.NOT_IN_LIBRARY");
    case "NOT_INSERTABLE":
      return translate("rejection.NOT_INSERTABLE", {
        label: detail.params.label,
      });
    case "TARGET_NOT_REPLACEABLE":
      return translate("rejection.TARGET_NOT_REPLACEABLE", {
        label: detail.params.label,
      });
    case "BAND_MISMATCH":
      return translate("rejection.BAND_MISMATCH", {
        label: detail.params.label,
        slotBand: detail.params.slotBand,
      });
    case "WIDTH_TOO_LARGE":
      return translate("rejection.WIDTH_TOO_LARGE", {
        label: detail.params.label,
        requiredMm: detail.params.requiredMm,
        availableMm: detail.params.availableMm,
      });
    case "WIDTH_TOO_SMALL":
      return detail.params.requiredMm === undefined
        ? translate("rejection.WIDTH_TOO_SMALL_UNKNOWN_FLOOR", {
            label: detail.params.label,
          })
        : translate("rejection.WIDTH_TOO_SMALL", {
            label: detail.params.label,
            requiredMm: detail.params.requiredMm,
            availableMm: detail.params.availableMm,
          });
    case "WIDTH_NOT_SUPPORTED": {
      const hasNoWidth =
        detail.params.sizesMm.length === 0 &&
        (detail.params.widthRangesMm?.length ?? 0) === 0;
      if (hasNoWidth) {
        return translate("rejection.WIDTH_NOT_SUPPORTED_NO_WIDTH", {
          label: detail.params.label,
        });
      }
      const widthsMadeClause = resolveWidthsMadeClause(
        translate,
        detail.params,
      );
      return detail.params.boundScope === "column"
        ? translate("rejection.WIDTH_NOT_SUPPORTED_COLUMN", {
            label: detail.params.label,
            widthsMadeClause,
            availableMm: detail.params.availableMm,
          })
        : translate("rejection.WIDTH_NOT_SUPPORTED_BODY", {
            label: detail.params.label,
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
        label: detail.params.label,
        requiredMm: detail.params.requiredMm,
        availableMm: detail.params.availableMm,
      });
    case "HEIGHT_TOO_LARGE":
      return translate("rejection.HEIGHT_TOO_LARGE", {
        label: detail.params.label,
        requiredMm: detail.params.requiredMm,
        availableMm: detail.params.availableMm,
      });
    case "NO_SNAP_POSITION":
      return translate("rejection.NO_SNAP_POSITION", {
        label: detail.params.label,
      });
    case "BUILT_SIZE_MISMATCH":
      return translate("rejection.BUILT_SIZE_MISMATCH", {
        label: detail.params.label,
        builtMm: detail.params.builtMm,
        requiredMm: detail.params.requiredMm,
      });
    case "MEASUREMENT_UNUSABLE":
      return translate("rejection.MEASUREMENT_UNUSABLE", {
        label: detail.params.label,
      });
    case "COLUMN_MISMATCH":
      return translate("rejection.COLUMN_MISMATCH", {
        label: detail.params.label,
      });
    case "NOT_RESIZABLE":
      return translate("rejection.NOT_RESIZABLE", {
        label: detail.params.label,
      });
    case "WIDTH_UNCHANGED":
      return translate("rejection.WIDTH_UNCHANGED", {
        label: detail.params.label,
        widthMm: detail.params.widthMm,
      });
    case "NO_EMPTY_SPACE":
      return translate("rejection.NO_EMPTY_SPACE", {
        label: detail.params.label,
        requestedMm: detail.params.requestedMm,
        deltaMm: detail.params.deltaMm,
        sides: resolveEmptySpaceSides(translate, detail.params.sides),
      });
    case "COLUMN_MEMBER_NOT_RESIZABLE":
      return translate("rejection.COLUMN_MEMBER_NOT_RESIZABLE", {
        label: detail.params.label,
        memberLabel: detail.params.memberLabel,
      });
    case "DEPENDENT_MEMBER_NOT_REBUILDABLE":
      return translate("rejection.DEPENDENT_MEMBER_NOT_REBUILDABLE", {
        label: detail.params.label,
        memberLabel: detail.params.memberLabel,
      });
    case "RESIZE_OPENS_GAP":
      return translate("rejection.RESIZE_OPENS_GAP", {
        label: detail.params.label,
        sides: resolveEmptySpaceSides(translate, detail.params.sides),
      });
    case "COLUMN_KEY_COLLISION":
      return translate("rejection.COLUMN_KEY_COLLISION", {
        label: detail.params.label,
        requestedMm: detail.params.requestedMm,
        sides: resolveEmptySpaceSides(translate, detail.params.sides),
      });
    case "COLUMN_HOOD_FLOOR":
      return translate("rejection.COLUMN_HOOD_FLOOR", {
        label: detail.params.label,
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
        label: detail.params.label,
      });
    case "FINISH_NOT_OFFERED":
      return translate("rejection.FINISH_NOT_OFFERED");
    case "HANDLE_NOT_SUPPORTED":
      return translate("rejection.HANDLE_NOT_SUPPORTED", {
        label: detail.params.label,
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

/**
 * Resolves the content shape the pre-i18n models already consume. Every leaf comes from the active
 * request/provider locale; closures preserve the existing model-facing function signatures while
 * delegating interpolation and plural selection to ICU.
 */
export function resolveContent(translate: ContentTranslator) {
  return {
    rejection: (detail: RejectionDetail) => resolveRejection(translate, detail),
    brand: translate("brand"),
    configure: {
      step: translate("configure.step", { step: 2, totalSteps: 4 }),
      stepPill: translate("configure.stepPill", { step: 2, totalSteps: 4 }),
      title: translate("configure.title"),
      locale: translate("configure.locale"),
      back: translate("configure.back"),
      backAction: translate("configure.backAction"),
      reviewCta: translate("configure.reviewCta"),
      orbitHint: translate("configure.orbitHint"),
      cameraGroupLabel: translate("configure.cameraGroupLabel"),
      cameraPresets: {
        overview: translate("configure.cameraPresets.overview"),
        wallA: translate("configure.cameraPresets.wallA"),
        wallB: translate("configure.cameraPresets.wallB"),
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
      widthChoiceNote: translate("panel.widthChoiceNote"),
      structuralTitle: translate("panel.structuralTitle"),
      structuralReasons: {
        corner: translate("panel.structuralReasons.corner"),
      },
    },
    price: {
      startingPrefix: translate("price.startingPrefix"),
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
      /** The pill names every setting whether or not it draws it: `+N` is a visual economy and a
       *  swatch is not something a screen reader can read. The separator is a catalogue leaf for
       *  the reason every other join in this module is one. */
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
      startOver: translate("designLoadError.startOver"),
    },
    contactPlaceholder: {
      title: translate("contactPlaceholder.title"),
      body: translate("contactPlaceholder.body"),
      back: translate("contactPlaceholder.back"),
    },
  };
}

export type Content = ReturnType<typeof resolveContent>;
