"use client";

import { useCallback, useMemo } from "react";

import type { DeletableItemRef } from "@lemnaria/configurator-domain";

import {
  deriveAccessories,
  isAccessoryCreatedInDraft,
  type AccessoryDerivation,
  type AccessoryPageInput,
} from "./accessory-model";
import type { ItemLifecycleClient } from "./item-lifecycle-client";
import type { PriceDraftClient } from "./price-draft-client";
import { useLifecycleClient } from "./use-lifecycle-client";
import {
  useItemAvailability,
  type ItemAvailabilityDesk,
} from "./use-item-availability";
import { usePriceDraft, type PriceDraft } from "./use-price-draft";

// What the accessory screens hold in common: the draft of prices, what is switched off, and the accessories worked out
// from both again after every write. A deletion is a change of the draft, which for an accessory only the draft knows
// takes its creation back out; a switch is not.

export interface AccessoryDesk {
  readonly draft: PriceDraft;
  readonly availability: ItemAvailabilityDesk;
  readonly derivation: AccessoryDerivation;
}

export function useAccessoryDesk({
  page,
  client,
  lifecycleClient,
}: {
  readonly page: AccessoryPageInput;
  /** The routes the draft is written through; the fetching client when left out. */
  readonly client: PriceDraftClient | undefined;
  /** Where a switch is written and the saved kitchens are counted; the page's own stand-in when left out. */
  readonly lifecycleClient: ItemLifecycleClient | undefined;
}): AccessoryDesk {
  const draft = usePriceDraft({ initial: page.state, client });
  const { change, revert, readNow } = draft;
  const derivation = useMemo(
    () => deriveAccessories(draft.state),
    [draft.state],
  );
  const lifecycle = useLifecycleClient(page, lifecycleClient);
  const isDraftOnly = useCallback(
    (item: DeletableItemRef) => isAccessoryCreatedInDraft(derivation, item),
    [derivation],
  );
  const isDraftOnlyNow = useCallback(
    (item: DeletableItemRef) =>
      isAccessoryCreatedInDraft(deriveAccessories(readNow()), item),
    [readNow],
  );
  const deleteFromDraft = useCallback(
    (item: DeletableItemRef) =>
      item.kind === "accessory" && isDraftOnly(item)
        ? revert({
            kind: "change",
            address: {
              kind: "accessory-created",
              accessoryId: item.accessoryId,
            },
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
    isDraftOnlyNow,
  });
  return { draft, availability, derivation };
}
