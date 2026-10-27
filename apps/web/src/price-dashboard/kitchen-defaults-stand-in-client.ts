import type { ItemRef } from "@lemnaria/configurator-domain";

import type {
  DefaultsSaveOutcome,
  KitchenDefaultsClient,
} from "./kitchen-defaults-client";
import {
  activeHandles,
  activeHardware,
  activeMaterials,
  colourOfferFor,
  depthOptions,
  type KitchenDefaultsPageInput,
} from "./kitchen-defaults-model";
import type {
  KitchenDefaultsSaveRequestWire,
  KitchenDefaultsWire,
} from "./price-dashboard-wire-contract";

// A client that keeps what the page showed in memory, for a build that has no server behind the screen yet. It holds no
// data of its own: it is seeded with the facts the page was given, so it can sit in a browser chunk and name no invented
// default. It is loaded only by `defaultKitchenDefaultsClient`, behind the production literal, and goes when R4b's client
// replaces it.

/**
 * A client over one in-memory copy of the screen's facts, which judges a save the way R4b's route will: both revisions
 * are compared before anything is written, and a value that is not on offer is refused with nothing written. Another
 * actor is a second call to `save` on the same client.
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
  const refused = firstItemNotOffered(current, request.defaults);
  if (refused !== undefined) return refused;
  return {
    kind: "saved",
    saved: {
      revision: String(Number(state.revision) + 1),
      availabilityRevision: state.availabilityRevision,
    },
  };
}

function firstItemNotOffered(
  current: KitchenDefaultsPageInput,
  defaults: KitchenDefaultsWire,
): DefaultsSaveOutcome | undefined {
  const { materialTierId, hardwareTierId, handle, topRowHandle } = defaults;
  if (
    !activeMaterials(current).some((tier) => tier.tierId === materialTierId)
  ) {
    return {
      kind: "item-unavailable",
      item: { kind: "material", tierId: materialTierId },
    };
  }
  if (!activeHardware(current).some((tier) => tier.tierId === hardwareTierId)) {
    return {
      kind: "item-unavailable",
      item: { kind: "hardware", tierId: hardwareTierId },
    };
  }
  const handles = activeHandles(current);
  const offHandle = [handle, topRowHandle].find(
    (held) => !handles.includes(held),
  );
  if (offHandle !== undefined) {
    return {
      kind: "item-unavailable",
      item: { kind: "handle", handle: offHandle },
    };
  }
  const switchedOffColour = switchedOffColourOf(current, defaults);
  if (switchedOffColour !== undefined) {
    return { kind: "item-unavailable", item: switchedOffColour };
  }
  return refusedInput(current, defaults);
}

function switchedOffColourOf(
  current: KitchenDefaultsPageInput,
  { finish }: KitchenDefaultsWire,
): ItemRef | undefined {
  if (finish.kind !== "palette-entry") return undefined;
  return current.disabled.find(
    (item) => item.kind === "finish" && item.finishId === finish.entryId,
  );
}

function refusedInput(
  current: KitchenDefaultsPageInput,
  defaults: KitchenDefaultsWire,
): DefaultsSaveOutcome | undefined {
  if (!depthOptions().includes(defaults.cabinetDepthMm)) {
    return {
      kind: "invalid",
      issues: [{ field: "cabinetDepthMm", code: "UNKNOWN_VALUE" }],
    };
  }
  const offer = colourOfferFor(current, defaults.materialTierId);
  const { finish } = defaults;
  const isOffered =
    offer.kind === "free"
      ? finish.kind === "free-colour"
      : offer.kind === "palette" &&
        finish.kind === "palette-entry" &&
        offer.entryIds.includes(finish.entryId);
  return isOffered
    ? undefined
    : {
        kind: "invalid",
        issues: [{ field: "finish", code: "FINISH_NOT_IN_PALETTE" }],
      };
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
