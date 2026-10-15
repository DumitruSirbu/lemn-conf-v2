// @vitest-environment happy-dom
//
// The two answers both hydrators of a design step ask the session store before they load a page's copy over it:
// whether the store already holds the newest copy (ADR 0148 E3), and what it already knows about write access
// (E3a). Each case is one state of the store against one page.
import { KITCHEN_L_DESIGN, type DesignId } from "@lemnaria/configurator-domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useConfiguratorStore } from "@/store/configurator-store";
import { holdsTheNewestCopy, writeAccessHeldFor } from "@/store/newest-copy";

const DESIGN_ID = "design-in-the-store" as DesignId;
const ANOTHER_DESIGN_ID = "another-design" as DesignId;

function holdCleanCopy(revision: string | null): void {
  useConfiguratorStore.getState().hydrate({
    design: KITCHEN_L_DESIGN,
    designId: DESIGN_ID,
    revision: revision ?? "1",
    canWrite: true,
  });
  if (revision === null) useConfiguratorStore.setState({ revision: null });
}

function holdUnsavedEdit(revision: string): void {
  holdCleanCopy(revision);
  useConfiguratorStore.setState({
    design: { ...KITCHEN_L_DESIGN, presetId: "edited-and-not-yet-saved" },
  });
}

function pageAt(designId: DesignId, revision: string) {
  return { designId, revision };
}

beforeEach(() => {
  useConfiguratorStore.setState({ designId: null, revision: null });
});

describe("holdsTheNewestCopy", () => {
  it.each([
    ["5", "5", true],
    ["6", "5", true],
    ["4", "5", false],
    ["9", "10", false],
  ])(
    "a clean store at revision %s against a page at %s is kept: %s",
    (held, page, expected) => {
      holdCleanCopy(held);

      expect(
        holdsTheNewestCopy(
          useConfiguratorStore.getState(),
          pageAt(DESIGN_ID, page),
        ),
      ).toBe(expected);
    },
  );

  it("a clean store holding no revision is replaced by the page", () => {
    holdCleanCopy(null);

    expect(
      holdsTheNewestCopy(
        useConfiguratorStore.getState(),
        pageAt(DESIGN_ID, "1"),
      ),
    ).toBe(false);
  });

  it("a store holding an unsaved edit is kept even when the page is newer", () => {
    holdUnsavedEdit("2");

    expect(
      holdsTheNewestCopy(
        useConfiguratorStore.getState(),
        pageAt(DESIGN_ID, "9"),
      ),
    ).toBe(true);
  });

  it("a store holding another design is replaced, edit or no edit", () => {
    holdUnsavedEdit("9");

    expect(
      holdsTheNewestCopy(
        useConfiguratorStore.getState(),
        pageAt(ANOTHER_DESIGN_ID, "1"),
      ),
    ).toBe(false);
  });
});

describe("writeAccessHeldFor", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([true, false, "checking"] as const)(
    "carries the %s answer the store holds for this design",
    (held) => {
      holdCleanCopy("3");
      useConfiguratorStore.setState({ canWrite: held });

      expect(writeAccessHeldFor(DESIGN_ID)).toBe(held);
    },
  );

  it("is still being checked for a design the store does not hold", () => {
    holdCleanCopy("3");

    expect(writeAccessHeldFor(ANOTHER_DESIGN_ID)).toBe("checking");
  });

  it("never reads the store on the server, where a request must not read another's", () => {
    holdCleanCopy("3");
    vi.stubGlobal("window", undefined);

    expect(writeAccessHeldFor(DESIGN_ID)).toBe("checking");
  });
});
