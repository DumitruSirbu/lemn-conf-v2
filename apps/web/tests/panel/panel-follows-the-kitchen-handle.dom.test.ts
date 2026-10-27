// @vitest-environment happy-dom
//
// Wave H1b (M10): the panel's selection reads the kitchen's handle from the held design, through the real hook
// over the real store. A cabinet that chose no handle is marked with the one it follows, so the chip the customer
// sees is the handle the price bills and the scene draws (ADR 0092 Amendment C).
import {
  KITCHEN_L_DESIGN,
  type Design,
  type DesignId,
  type Handle,
  type SelectionMeta,
} from "@lemnaria/configurator-domain";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useSelectionMeta } from "@/panel/use-panel-view";
import { useConfiguratorStore } from "@/store/configurator-store";

/** A base cabinet that takes a handle and stands below the top row. */
const FOLLOWING_BODY_ID = "p0";
/** A top-row body: it never follows the kitchen. */
const TOP_ROW_BODY_ID = "p15";

let container: HTMLDivElement;
let root: Root;
let seen: SelectionMeta | undefined;

function MetaProbe() {
  seen = useSelectionMeta();
  return null;
}

function metaOf(placementId: string, design: Design): SelectionMeta {
  useConfiguratorStore.getState().hydrate({
    design,
    designId: "panel-handle" as DesignId,
    revision: "1",
    canWrite: true,
  });
  useConfiguratorStore
    .getState()
    .select({ kind: "placement", id: placementId });
  act(() => {
    root.render(createElement(MetaProbe));
  });
  if (!seen) throw new Error(`the hook described nothing for ${placementId}`);
  return seen;
}

function withKitchenHandle(handle: Handle): Design {
  return {
    ...KITCHEN_L_DESIGN,
    settings: { ...KITCHEN_L_DESIGN.settings, handle },
  };
}

function withTopRowHandle(topRowHandle: Handle): Design {
  return {
    ...KITCHEN_L_DESIGN,
    settings: { ...KITCHEN_L_DESIGN.settings, topRowHandle },
  };
}

beforeEach(() => {
  vi.stubGlobal("fetch", () => new Promise<Response>(() => undefined));
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  seen = undefined;
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

describe("the panel's selection follows the kitchen's handle", () => {
  it.each(["steel", "black", "push"] as const)(
    "marks %s on a cabinet that chose none, and leaves its own choice empty",
    (kitchenHandle) => {
      const meta = metaOf(FOLLOWING_BODY_ID, withKitchenHandle(kitchenHandle));

      expect(meta.defaultHandle).toBe(kitchenHandle);
      expect(meta.handle).toBeUndefined();
    },
  );

  it("marks the shipped steel when the kitchen has chosen none", () => {
    expect(metaOf(FOLLOWING_BODY_ID, KITCHEN_L_DESIGN).defaultHandle).toBe(
      "steel",
    );
  });

  it("leaves a top-row body on push whatever the kitchen chose", () => {
    expect(
      metaOf(TOP_ROW_BODY_ID, withKitchenHandle("black")).defaultHandle,
    ).toBe("push");
  });

  it.each(["steel", "black", "push"] as const)(
    "marks the kitchen's top-row handle %s on a top-row body that chose none (H2)",
    (topRowHandle) => {
      const meta = metaOf(TOP_ROW_BODY_ID, withTopRowHandle(topRowHandle));

      expect(meta.defaultHandle).toBe(topRowHandle);
      expect(meta.handle).toBeUndefined();
    },
  );

  it("leaves a cabinet below the top row on the kitchen's handle whatever the top-row handle chose (H2)", () => {
    expect(
      metaOf(FOLLOWING_BODY_ID, withTopRowHandle("black")).defaultHandle,
    ).toBe("steel");
  });

  it("re-describes the same top-row selection when the kitchen's top-row handle changes under it (H2)", () => {
    const before = metaOf(TOP_ROW_BODY_ID, withTopRowHandle("steel"));

    const after = metaOf(TOP_ROW_BODY_ID, withTopRowHandle("black"));

    expect([before.defaultHandle, after.defaultHandle]).toEqual([
      "steel",
      "black",
    ]);
  });

  it("re-describes the same selection when the kitchen's handle changes under it", () => {
    const before = metaOf(FOLLOWING_BODY_ID, withKitchenHandle("steel"));

    const after = metaOf(FOLLOWING_BODY_ID, withKitchenHandle("black"));

    expect([before.defaultHandle, after.defaultHandle]).toEqual([
      "steel",
      "black",
    ]);
  });
});
