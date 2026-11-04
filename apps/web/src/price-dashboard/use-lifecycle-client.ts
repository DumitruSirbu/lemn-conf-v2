"use client";

import { useMemo } from "react";

import type {
  ItemUsageCounts,
  NewKitchenSettings,
} from "@lemnaria/configurator-domain";

import { defaultItemLifecycleClient } from "./default-item-lifecycle-client";
import type { ItemLifecycleClient } from "./item-lifecycle-client";
import type { DashboardStateWire } from "./price-dashboard-wire-contract";

// The lifecycle client of an item screen: the one handed in, else the page's own, seeded with what the page showed.

interface LifecyclePage {
  readonly state: DashboardStateWire;
  readonly defaults: NewKitchenSettings | undefined;
  readonly sampleUsage?: ItemUsageCounts | undefined;
}

export function useLifecycleClient(
  page: LifecyclePage,
  lifecycleClient: ItemLifecycleClient | undefined,
): ItemLifecycleClient {
  return useMemo(
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
}
