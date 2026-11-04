import type {
  DefaultsSaveOutcome,
  KitchenDefaultsClient,
} from "./kitchen-defaults-client";
import {
  isDepthOffered,
  isFinishOffered,
  isHandleOffered,
  isHardwareOffered,
  isMaterialOffered,
  type KitchenDefaultsPageInput,
} from "./kitchen-defaults-model";
import type {
  KitchenDefaultsSaveRequestWire,
  KitchenDefaultsWire,
} from "./price-dashboard-wire-contract";

// A client that keeps what the page showed in memory, for a build with no server behind the screen. It holds no data of its
// own: it is seeded with the facts the page was given, so it can sit in a browser chunk and name no invented default.

/**
 * A client over one in-memory copy of the screen's facts, which judges a save the way a server would: both revisions are
 * compared before anything is written, and a value that is not on offer is refused with nothing written. Another actor is a
 * second call to `save` on the same client.
 */
export function inMemoryKitchenDefaultsClient(
  seed: KitchenDefaultsPageInput,
): KitchenDefaultsClient {
  let current = seed;
  return {
    save: (request) => {
      const outcome = judgedSave(current, request);
      if (outcome.kind === "saved")
        current = savedInto(current, request, outcome.saved.revision);
      return Promise.resolve(outcome);
    },
    readAgain: () => Promise.resolve(current),
  };
}

function judgedSave(
  current: KitchenDefaultsPageInput,
  request: KitchenDefaultsSaveRequestWire,
): DefaultsSaveOutcome {
  const { state } = current;
  const isStale =
    request.expectedRevision !== state.revision ||
    request.expectedAvailabilityRevision !== state.availabilityRevision;
  if (isStale) return { kind: "conflict" };
  const refusal = refusalOf(current, request.defaults);
  if (refusal !== undefined) return refusal;
  return {
    kind: "saved",
    saved: {
      revision: String(Number(state.revision) + 1),
      availabilityRevision: state.availabilityRevision,
    },
  };
}

function refusalOf(
  current: KitchenDefaultsPageInput,
  defaults: KitchenDefaultsWire,
): DefaultsSaveOutcome | undefined {
  const { materialTierId, hardwareTierId, handle, topRowHandle } = defaults;
  if (!isMaterialOffered(current, materialTierId)) {
    return unavailable({ kind: "material", tierId: materialTierId });
  }
  if (!isHardwareOffered(current, hardwareTierId)) {
    return unavailable({ kind: "hardware", tierId: hardwareTierId });
  }
  const offHandle = [handle, topRowHandle].find(
    (held) => !isHandleOffered(current, held),
  );
  if (offHandle !== undefined) {
    return unavailable({ kind: "handle", handle: offHandle });
  }
  if (!isDepthOffered(defaults.cabinetDepthMm)) {
    return invalid("cabinetDepthMm", "UNKNOWN_VALUE");
  }
  return refusalOfColour(current, defaults);
}

/** A colour the material has but that is switched off is an unavailable item; one it never had is malformed input. */
function refusalOfColour(
  current: KitchenDefaultsPageInput,
  defaults: KitchenDefaultsWire,
): DefaultsSaveOutcome | undefined {
  if (isFinishOffered(current, defaults)) return undefined;
  const { finish } = defaults;
  const isInPaletteButSwitchedOff =
    finish.kind === "palette-entry" &&
    isFinishOffered({ ...current, disabled: [] }, defaults);
  return isInPaletteButSwitchedOff
    ? unavailable({ kind: "finish", finishId: finish.entryId })
    : invalid("finish", "FINISH_NOT_IN_PALETTE");
}

function unavailable(
  item: Extract<DefaultsSaveOutcome, { kind: "item-unavailable" }>["item"],
): DefaultsSaveOutcome {
  return { kind: "item-unavailable", item };
}

function invalid(
  field: "cabinetDepthMm" | "finish",
  code: "UNKNOWN_VALUE" | "FINISH_NOT_IN_PALETTE",
): DefaultsSaveOutcome {
  return { kind: "invalid", issues: [{ field, code }] };
}

function savedInto(
  current: KitchenDefaultsPageInput,
  request: KitchenDefaultsSaveRequestWire,
  revision: string,
): KitchenDefaultsPageInput {
  return {
    ...current,
    state: {
      ...current.state,
      revision,
      saved: true,
      defaults: request.defaults,
    },
  };
}
