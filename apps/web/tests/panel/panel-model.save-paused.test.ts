// A write the limit on saves holds is an armed retry with a stated time, and the editor says that time: a pause, told
// as information, with nothing to press. A failure with no time is the failure it was, and the time means nothing in
// any other status.
import { describe, expect, it } from "vitest";

import { clockTimeOf } from "@/i18n/clock-time";
import { describePanel, type OpenPanel } from "@/panel/panel-model";
import type { SaveStatus } from "@/persistence/save-coalescer";

import { readSource } from "../lib/server/server-source-support";
import { PAL_KITCHEN } from "../support/panel-material";
import { ro } from "../support/romanian-content";
import { occupiedMeta, offers } from "../support/selection-meta";
import { noWidthIsFree } from "../support/width-options";

const RESUMES_AT_MS = new Date(2026, 9, 10, 14, 5).getTime();

function panelFor(
  saveStatus: SaveStatus,
  saveResumesAtMs?: number | null,
): OpenPanel {
  const meta = occupiedMeta();
  const panel = describePanel({
    content: ro,
    material: PAL_KITCHEN,
    meta,
    offers: offers(3),
    rejection: null,
    widthOptions: noWidthIsFree(meta.widthMm, meta.sizesMm),
    buildableWidthSpanMm: undefined,
    isBodyProbeAttached: true,
    canWrite: true,
    saveStatus,
    saveResumesAtMs,
  });
  if (panel.kind !== "open") throw new Error("expected an open panel");
  return panel;
}

describe("the editor's notice for a write the limit on saves holds", () => {
  it("says the stated time, as a pause told as information, with nothing to press", () => {
    const { notice } = panelFor("error", RESUMES_AT_MS);

    expect(notice?.kind).toBe("save-paused");
    expect(notice?.tone).toBe("info");
    expect(notice?.message).toBe(ro.panel.savePausedNotice("14:05"));
    expect(notice?.message).toContain("14:05");
    expect(notice?.actions).toBeUndefined();
  });

  it("states the time the clock helper tells for the instant, whatever the instant", () => {
    const { notice } = panelFor("error", RESUMES_AT_MS + 61_000);

    expect(notice?.message).toBe(
      ro.panel.savePausedNotice(clockTimeOf(RESUMES_AT_MS + 61_000)),
    );
  });

  it.each([
    ["no time", undefined],
    ["a null time", null],
  ])("is the failure it was when the error carries %s", (_label, time) => {
    const { notice } = panelFor("error", time);

    expect(notice?.kind).toBe("save-failed");
    expect(notice?.message).toBe(ro.panel.saveFailedNotice);
  });

  it.each(["idle", "saving", "stopped", "conflict"] as const)(
    "ignores a time left beside %s, which means nothing there",
    (status) => {
      const { notice } = panelFor(status, RESUMES_AT_MS);

      expect(notice?.kind).not.toBe("save-paused");
    },
  );

  it("tells a refused design what it was told before, not the pause", () => {
    const { notice } = panelFor("unauthorized", RESUMES_AT_MS);

    expect(notice?.kind).toBe("read-only-refused");
  });
});

describe("who decides that a write is paused", () => {
  it.each(["panel/panel-model.ts", "app/d/[id]/review/review-screen.tsx"])(
    "reads source: %s asks pausedUntilMs and compares no time itself",
    (file) => {
      const source = readSource(file);

      expect(source).toMatch(/\bpausedUntilMs\(/);
      expect(source).not.toMatch(/ResumesAtMs\s*[!=]==?\s*(null|undefined)/);
      expect(source).not.toMatch(/resumesAtMs\s*[!=]==?\s*(null|undefined)/);
    },
  );
});
