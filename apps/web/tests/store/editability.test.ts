// **The one editability rule, and the proof that extracting it changed nothing** (M6-AUD-001).
//
// The predicate and its three sentences lived inside `panel-model.ts`, where only §9's panel could
// reach them — which is the audit's stated root cause for wave 6G's settings surface having no
// locked state at all. They moved to `store/editability.ts` in wave W2.
//
// Two things are asserted here, and the second is the one that makes the move safe: the rule itself
// over the whole `WriteAccess` × `SaveStatus` product, and that `describePanel` still answers
// exactly what the shared function does at every one of those pairs. A cross-check rather than a
// re-statement — if the extraction had drifted by one state, the panel's own suite could stay green
// while the two surfaces disagreed again.
import { describe, expect, it } from "vitest";

import { ro } from "@/content/ro";
import { ro as content } from "../support/romanian-content";
import type { SaveStatus } from "@/persistence/save-coalescer";
import { describeEditability } from "@/store/editability";
import type { WriteAccess } from "@/store/configurator-store";

import { describePanel } from "@/panel/panel-model";

import { PAL_KITCHEN } from "../support/panel-material";
import { occupiedMeta, offers } from "../support/selection-meta";
import { noWidthIsFree } from "../support/width-options";

const EVERY_WRITE_ACCESS: readonly WriteAccess[] = [
  true,
  false,
  "checking",
  "check-failed",
];

const EVERY_SAVE_STATUS: readonly SaveStatus[] = [
  "idle",
  "saving",
  "error",
  "stopped",
  "unauthorized",
  "conflict",
];

describe("whether a browser may be offered an edit", () => {
  it("unlocks only on an explicit true, so an unanswered probe is not an offer", () => {
    for (const canWrite of EVERY_WRITE_ACCESS) {
      const { isReadOnly } = describeEditability({
        canWrite,
        saveStatus: "idle",
      });
      expect(isReadOnly, String(canWrite)).toBe(canWrite !== true);
    }
  });

  it("locks a writable browser the moment a save has been refused as unauthorized", () => {
    for (const saveStatus of EVERY_SAVE_STATUS) {
      const { isReadOnly } = describeEditability({
        canWrite: true,
        saveStatus,
      });
      expect(isReadOnly, saveStatus).toBe(saveStatus === "unauthorized");
    }
  });

  it("gives the three locked states three different sentences, never one borrowed word", () => {
    const reasonFor = (canWrite: WriteAccess) =>
      describeEditability({ canWrite, saveStatus: "idle" }).disabledReason;

    expect(reasonFor(false)).toBe(ro.panel.readOnlyReason);
    expect(reasonFor("checking")).toBe(ro.panel.accessCheckingReason);
    expect(reasonFor("check-failed")).toBe(ro.panel.accessUncheckableReason);
    // "Doar vizualizare" asserts a permission the page has been told about. Saying it while the
    // probe is in flight would be a claim nothing has answered.
    expect(
      new Set([
        reasonFor(false),
        reasonFor("checking"),
        reasonFor("check-failed"),
      ]).size,
    ).toBe(3);
  });
});

describe("the panel's answer, after the rule moved out of it", () => {
  /** §9's panel with a body selected, so `describePanel` returns an open view whose footer states
   *  the two fields the extraction is about. Built from the panel suite's own fixtures, so this
   *  cross-check reads the shipped panel rather than a hand-shaped stand-in for it. */
  function openPanelAt(access: {
    readonly canWrite: WriteAccess;
    readonly saveStatus: SaveStatus;
  }) {
    const meta = occupiedMeta();
    return describePanel({
      content,
      material: PAL_KITCHEN,
      meta,
      offers: offers(3),
      rejection: null,
      widthOptions: noWidthIsFree(meta.widthMm, meta.sizesMm),
      isBodyProbeAttached: true,
      canWrite: access.canWrite,
      saveStatus: access.saveStatus,
    });
  }

  it("is identical to the shared rule at every access and save-status pair", () => {
    let checkedPairs = 0;
    for (const canWrite of EVERY_WRITE_ACCESS)
      for (const saveStatus of EVERY_SAVE_STATUS) {
        const shared = describeEditability({ canWrite, saveStatus });
        const panel = openPanelAt({ canWrite, saveStatus });
        if (panel.kind !== "open") throw new Error("expected an open panel");

        const label = `${String(canWrite)} / ${saveStatus}`;
        expect(panel.footer.isRemoveDisabled, label).toBe(shared.isReadOnly);
        expect(panel.footer.removeDisabledReason, label).toBe(
          shared.isReadOnly ? shared.disabledReason : undefined,
        );
        checkedPairs += 1;
      }

    // The loop is what the claim rests on, so its having run is asserted rather than assumed.
    expect(checkedPairs).toBe(
      EVERY_WRITE_ACCESS.length * EVERY_SAVE_STATUS.length,
    );
  });
});
