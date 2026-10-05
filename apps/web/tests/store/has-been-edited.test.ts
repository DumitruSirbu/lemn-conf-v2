// M7C C1 S4 (Q10): `hasBeenEdited` is what lets the editor's Back ask only when there is something
// to lose. It is the store's one answer to "has the customer changed this design since it was
// loaded", so what is pinned here is exactly the three things that move it.
import {
  buildKitchenLBodyCatalog,
  KITCHEN_L_DESIGN,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { createConfiguratorStore } from "../../src/store/configurator-store";
import { createFakeProbeFactory } from "../support/fake-body-probe";

const HOB_HOST_ID = "p2";

function createStore() {
  return createConfiguratorStore({
    design: KITCHEN_L_DESIGN,
    catalogAt: buildKitchenLBodyCatalog,
    now: () => "2026-08-25T12:00:00.000Z",
    probeAt: createFakeProbeFactory(),
  });
}

describe("hasBeenEdited", () => {
  it("is false for a design nobody has touched", () => {
    expect(createStore().getState().hasBeenEdited).toBe(false);
  });

  it("stays false through a selection and through a refused command", () => {
    const store = createStore();

    store.getState().select({ kind: "placement", id: HOB_HOST_ID });
    store.getState().deselect();
    store.getState().remove();

    expect(store.getState().lastRejection?.code).toBe("TARGET_NOT_FOUND");
    expect(store.getState().hasBeenEdited).toBe(false);
  });

  it("becomes true when a command is applied", () => {
    const store = createStore();

    store.getState().select({ kind: "placement", id: HOB_HOST_ID });
    store.getState().remove();

    expect(store.getState().hasBeenEdited).toBe(true);
  });

  it("is cleared when another design is loaded, because a loaded design is not yet edited", () => {
    const store = createStore();
    store.getState().select({ kind: "placement", id: HOB_HOST_ID });
    store.getState().remove();

    store.getState().hydrate({
      design: KITCHEN_L_DESIGN,
      designId: "another-design",
      revision: "1",
      canWrite: true,
    });

    expect(store.getState().hasBeenEdited).toBe(false);
  });
});
