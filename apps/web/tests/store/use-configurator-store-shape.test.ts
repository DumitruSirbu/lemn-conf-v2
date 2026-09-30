// `useConfiguratorStore` is built by hand (ADR 0133) rather than by zustand's `create`, so that its
// server snapshot can come from a provider. Every call site treats it as a bound zustand store, so its
// surface must stay exactly a bound store's: this pins the key set against a real `create()` result,
// which is what a zustand upgrade that adds a member would otherwise change silently.
import { create } from "zustand";
import { describe, expect, it } from "vitest";

import { useConfiguratorStore } from "@/store/configurator-store";

describe("useConfiguratorStore's surface", () => {
  it("has exactly the members a bound zustand store has", () => {
    const bound = create(() => ({}));

    expect(Object.keys(useConfiguratorStore).sort()).toEqual(
      Object.keys(bound).sort(),
    );
  });

  it("answers getState, getInitialState, setState and subscribe from the one session store", () => {
    const seen: number[] = [];
    const stop = useConfiguratorStore.subscribe(() => seen.push(1));

    useConfiguratorStore.setState({ saveStatus: "idle" });
    stop();

    expect(useConfiguratorStore.getState().saveStatus).toBe("idle");
    expect(useConfiguratorStore.getInitialState()).toBeDefined();
    expect(seen).toEqual([1]);
  });
});
