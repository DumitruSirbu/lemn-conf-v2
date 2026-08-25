"use client";

import type { Design, DesignId } from "@lemnaria/configurator-domain";

import { ConfigureScreen } from "@/app/configurator/configure/configure-screen";
import { useConfiguratorStore } from "@/store/configurator-store";

/** Replaces the store with a loaded design before the configurator screen mounts, so the first
 *  frame it renders is already the loaded design — never a flash of the seeded fixture. Hydrating
 *  during render (guarded by the id comparison, not an effect) is what makes that ordering hold:
 *  by the time `ConfigureScreen` reads the store for its own first render, this component's body
 *  has already run. */
export function HydrateAndConfigure({
  design,
  designId,
}: {
  design: Design;
  designId: DesignId;
}) {
  const currentDesignId = useConfiguratorStore((state) => state.designId);
  if (currentDesignId !== designId) {
    useConfiguratorStore.getState().hydrate(design, designId);
  }
  return <ConfigureScreen />;
}
