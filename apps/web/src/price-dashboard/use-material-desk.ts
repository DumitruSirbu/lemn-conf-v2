"use client";

import { useCallback, useMemo } from "react";

import type { DeletableItemRef } from "@lemnaria/configurator-domain";

import { defaultItemLifecycleClient } from "./default-item-lifecycle-client";
import type { ItemLifecycleClient } from "./item-lifecycle-client";
import {
  deriveMaterials,
  type MaterialDerivation,
  type MaterialPageInput,
} from "./material-model";
import type { PriceDraftClient } from "./price-draft-client";
import { useMaterialUsage, type MaterialUsage } from "./use-material-usage";
import {
  useItemAvailability,
  type ItemAvailabilityDesk,
} from "./use-item-availability";
import { usePriceDraft, type PriceDraft } from "./use-price-draft";

// What the two materials screens hold in common: the draft of prices, what is switched off, and the materials worked out
// from both again after every write. A deletion is a change of the draft; a switch is not. A material is never created in
// the draft, so no deletion ever takes one back out of it.

export interface MaterialDesk {
  readonly draft: PriceDraft;
  readonly availability: ItemAvailabilityDesk;
  readonly derivation: MaterialDerivation;
  /** How many saved kitchens use each material that is switched off, and the page's own material, where that could be
   *  counted. */
  readonly usage: MaterialUsage;
}

export function useMaterialDesk({
  page,
  client,
  lifecycleClient,
  ownTierId,
}: {
  readonly page: MaterialPageInput;
  /** The routes the draft is written through; the fetching client when left out. */
  readonly client: PriceDraftClient | undefined;
  /** Where a switch is written and the saved kitchens are counted; the page's own stand-in when left out. */
  readonly lifecycleClient: ItemLifecycleClient | undefined;
  /** The material a page is about, whose use is counted whether or not it is switched off. */
  readonly ownTierId?: string | undefined;
}): MaterialDesk {
  const draft = usePriceDraft({ initial: page.state, client });
  const { change } = draft;
  const derivation = useMemo(() => deriveMaterials(draft.state), [draft.state]);
  const lifecycle = useMemo(
    () =>
      lifecycleClient ??
      defaultItemLifecycleClient({
        book: page.state.active.book,
        availability: page.state.active.availability,
        defaults: page.defaults,
        usage: page.sampleUsage ?? [],
      }),
    [lifecycleClient, page],
  );
  const deleteFromDraft = useCallback(
    (item: DeletableItemRef) =>
      change({ address: { kind: "item-deleted", item }, value: true }),
    [change],
  );
  const isDraftOnly = useCallback(() => false, []);
  const availability = useItemAvailability({
    observed: draft.state.active.availability,
    book: draft.state.active.book,
    defaults: page.defaults,
    client: lifecycle,
    deleteFromDraft,
    isDraftOnly,
  });
  const usage = useMaterialUsage({
    client: lifecycle,
    book: draft.state.active.book,
    availability: availability.availability,
    alsoCount: ownTierId,
  });
  return { draft, availability, derivation, usage };
}
