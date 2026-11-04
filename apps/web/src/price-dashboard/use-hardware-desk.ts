"use client";

import { useCallback, useMemo } from "react";

import type { DeletableItemRef } from "@lemnaria/configurator-domain";

import {
  deriveHardware,
  hardwareClassOf,
  type HardwareDerivation,
  type HardwarePageInput,
} from "./hardware-model";
import type { ItemLifecycleClient } from "./item-lifecycle-client";
import type { PriceDraftClient } from "./price-draft-client";
import { useLifecycleClient } from "./use-lifecycle-client";
import {
  useItemAvailability,
  type ItemAvailabilityDesk,
} from "./use-item-availability";
import { usePriceDraft, type PriceDraft } from "./use-price-draft";

// What the two hardware screens hold in common: the draft of prices, what is switched off, and the classes worked out from
// both again after every write. A deletion is a change of the draft, which for a class only the draft holds takes it out; a switch is not.

export interface HardwareDesk {
  readonly draft: PriceDraft;
  readonly availability: ItemAvailabilityDesk;
  readonly derivation: HardwareDerivation;
}

export function useHardwareDesk({
  page,
  client,
  lifecycleClient,
}: {
  readonly page: HardwarePageInput;
  /** The routes the draft is written through; the fetching client when left out. */
  readonly client: PriceDraftClient | undefined;
  /** Where a switch is written and the saved kitchens are counted; the page's own stand-in when left out. */
  readonly lifecycleClient: ItemLifecycleClient | undefined;
}): HardwareDesk {
  const draft = usePriceDraft({ initial: page.state, client });
  const { change, revert } = draft;
  const derivation = useMemo(() => deriveHardware(draft.state), [draft.state]);
  const lifecycle = useLifecycleClient(page, lifecycleClient);
  const isDraftOnly = useCallback(
    (item: DeletableItemRef) => isCreatedInDraft(derivation, item),
    [derivation],
  );
  const deleteFromDraft = useCallback(
    (item: DeletableItemRef) =>
      item.kind === "hardware" && isDraftOnly(item)
        ? revert({
            kind: "change",
            address: { kind: "hardware-tier-created", tierId: item.tierId },
          })
        : change({ address: { kind: "item-deleted", item }, value: true }),
    [change, revert, isDraftOnly],
  );
  const availability = useItemAvailability({
    observed: draft.state.active.availability,
    book: draft.state.active.book,
    defaults: page.defaults,
    client: lifecycle,
    deleteFromDraft,
    isDraftOnly,
  });
  return { draft, availability, derivation };
}

function isCreatedInDraft(
  derivation: HardwareDerivation,
  item: DeletableItemRef,
): boolean {
  return (
    derivation.kind === "ready" &&
    item.kind === "hardware" &&
    hardwareClassOf(derivation, item.tierId)?.isCreated === true
  );
}
