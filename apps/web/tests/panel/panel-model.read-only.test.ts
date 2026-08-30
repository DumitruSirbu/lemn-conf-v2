// M4 Wave 4C: what §9's panel does when this browser cannot write, and how a write that failed is
// said.
//
// Three states that must never be confused. `read-only` is a statement of fact reachable in ordinary
// operation — ADR 0019 decision 1 makes the write credential a per-design cookie, so a 30-day
// expiry, a cleared jar or a shared link opened by someone who never held one all land here.
// `save-failed` is a fault a retry is still working on, and `save-stopped` is one nothing is working
// on any more — the copy for one is false of the other. The assertions below pin the distinctions,
// and pin that a read-only
// panel offers nothing it cannot perform (§9, "never offer what cannot be satisfied") rather than
// letting the customer discover it by tapping.
import { describe, expect, it } from "vitest";

import type { SaveStatus } from "@/persistence/save-coalescer";
import {
  describePanel,
  type OpenPanel,
  type PanelSection,
} from "@/panel/panel-model";

import { ro } from "@/content/ro";

import {
  occupiedMeta,
  offer,
  offers,
  REFUSAL,
  slotMeta,
} from "../support/selection-meta";

import type { SelectionMeta } from "@lemnaria/configurator-domain";

import {
  asWidthChoice,
  noWidthIsFree,
  widthOptionRow,
} from "../support/width-options";

/** The writable, healthy panel every case here varies from exactly one axis at a time. */
function openPanel(
  meta: SelectionMeta,
  overrides: Partial<Parameters<typeof describePanel>[0]> = {},
): OpenPanel {
  const panel = describePanel({
    meta,
    offers: offers(3),
    rejection: null,
    widthOptions: noWidthIsFree(meta.widthMm, meta.sizesMm),
    isBodyProbeAttached: true,
    canWrite: true,
    saveStatus: "idle",
    ...overrides,
  });
  if (panel.kind !== "open") throw new Error("expected an open panel");
  return panel;
}

function readOnlyPanel(
  meta: SelectionMeta = occupiedMeta(),
  overrides: Partial<Parameters<typeof describePanel>[0]> = {},
): OpenPanel {
  return openPanel(meta, { canWrite: false, ...overrides });
}

/** Every string reachable inside a value. Copy assertions go through this so "the notice appears
 *  exactly once" is a claim about the whole panel, not about the one field it happens to be read
 *  from — a duplicate pushed into a section's title or a row's secondary line would be caught. */
function stringsWithin(value: unknown): readonly string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(stringsWithin);
  if (value !== null && typeof value === "object")
    return Object.values(value).flatMap(stringsWithin);
  return [];
}

function findSection<TKind extends PanelSection["kind"]>(
  panel: OpenPanel,
  kind: TKind,
): Extract<PanelSection, { kind: TKind }> {
  const section = panel.sections.find(
    (candidate): candidate is Extract<PanelSection, { kind: TKind }> =>
      candidate.kind === kind,
  );
  if (!section) throw new Error(`expected a ${kind} section`);
  return section;
}

describe("the notice says which of the two situations this is", () => {
  it("says nothing at all when the browser can write and nothing has failed", () => {
    expect(openPanel(occupiedMeta()).notice).toBeUndefined();
  });

  it("says nothing while a save is in flight — 'saving' is not news", () => {
    expect(
      openPanel(occupiedMeta(), { saveStatus: "saving" }).notice,
    ).toBeUndefined();
  });

  it("states read-only as a fact, not as an error", () => {
    const notice = readOnlyPanel().notice;

    expect(notice).toEqual({
      kind: "read-only",
      tone: "info",
      message: ro.panel.readOnlyNotice,
    });
  });

  it("reads a failed write as a failure, and says what to do about it", () => {
    const notice = openPanel(occupiedMeta(), { saveStatus: "error" }).notice;

    expect(notice?.kind).toBe("save-failed");
    expect(notice?.tone).toBe("error");
    expect(notice?.message).toBe(ro.panel.saveFailedNotice);
  });

  it("treats an unauthorized save as read-only even when the load said canWrite", () => {
    // The load's answer is cookie *presence*, not proof the token is the right one. A 403 is the
    // proof, and it must move the panel to read-only rather than leaving it offering edits.
    const panel = openPanel(occupiedMeta(), {
      canWrite: true,
      saveStatus: "unauthorized",
    });

    expect(
      findSection(panel, "finish").chips.every((chip) => chip.isDisabled),
    ).toBe(true);
    expect(panel.footer.isRemoveDisabled).toBe(true);
  });

  it("says the refused edit is lost when the panel had believed it could write", () => {
    // The load said writable, so every control was live and the customer made an edit — the 403 is
    // that edit's answer. It is on screen, no retry is coming for it, and `readOnlyNotice` (written
    // for a browser that was never offered an edit at all) would not mention the loss.
    const notice = openPanel(occupiedMeta(), {
      canWrite: true,
      saveStatus: "unauthorized",
    }).notice;

    expect(notice?.kind).toBe("read-only-refused");
    expect(notice?.message).toBe(ro.panel.readOnlyRefusedNotice);
    expect(notice?.message).not.toBe(ro.panel.readOnlyNotice);
    // The permanent-loss path must not read weaker than the retryable one, which is why this is
    // the one read-only notice with the error tone.
    expect(notice?.tone).toBe("error");
  });

  it("says the same of an unauthorized save after a load that could not know", () => {
    // `/d/{id}` hydrates `"unknown"` and the panel stays interactive on purpose, so the edit-was-
    // -lost window is reachable from there too — and `"unknown"` must not fall through to the
    // never-attempted copy.
    const notice = openPanel(occupiedMeta(), {
      canWrite: "unknown",
      saveStatus: "unauthorized",
    }).notice;

    expect(notice?.kind).toBe("read-only-refused");
    expect(notice?.message).toBe(ro.panel.readOnlyRefusedNotice);
  });

  it("keeps the never-attempted copy when the load itself said read-only", () => {
    // `canWrite: false` disabled every control from the first frame, so nothing was attempted and
    // nothing was lost. Claiming a lost edit here would be false.
    const notice = readOnlyPanel(occupiedMeta(), {
      saveStatus: "unauthorized",
    }).notice;

    expect(notice?.kind).toBe("read-only");
    expect(notice?.tone).toBe("info");
    expect(notice?.message).toBe(ro.panel.readOnlyNotice);
  });

  it("names no way back that does not exist", () => {
    // Three ways to reach read-only (expired cookie, cleared jar, shared link) and the notice must
    // be true of all three. "Only the creating browser can edit" is true of the third and false of
    // the first two — the creating browser is read-only there too. ADR 0019 decision 8's emailed
    // edit link is M8 and unbuilt, so there is no route to offer.
    expect(ro.panel.readOnlyNotice).not.toContain("browserul în care");
    expect(ro.panel.readOnlyNotice).not.toContain("a fost creată");
  });

  it("leaves the panel interactive while the write-access probe is still unanswered", () => {
    // The whole purpose of `"unknown"` (ADR 0019 decision 1: `/d/{id}` cannot carry the cookie).
    // Disabling controls until the probe answers would tell a design's own author they may not
    // edit their own kitchen.
    const panel = openPanel(occupiedMeta(), {
      canWrite: "unknown",
      saveStatus: "idle",
    });

    expect(panel.notice).toBeUndefined();
    expect(
      findSection(panel, "finish").chips.some((chip) => chip.isDisabled),
    ).toBe(false);
    expect(
      findSection(panel, "replace").rows.some((row) => row.isDisabled),
    ).toBe(false);
    expect(panel.footer.isRemoveDisabled).toBe(false);
  });

  it("never dresses read-only as a failed save, whatever the status", () => {
    const statuses: readonly SaveStatus[] = [
      "idle",
      "saving",
      "error",
      "stopped",
      "unauthorized",
    ];

    for (const saveStatus of statuses) {
      expect(readOnlyPanel(occupiedMeta(), { saveStatus }).notice?.kind).toBe(
        "read-only",
      );
    }
  });

  it("is a single statement, never repeated per section", () => {
    // Built with a rejection so the panel carries every section kind §9 can produce, including the
    // one a read-only panel could most plausibly have the notice duplicated into.
    const panel = readOnlyPanel(occupiedMeta(), { rejection: REFUSAL });

    const occurrences = stringsWithin(panel).filter(
      (text) => text === ro.panel.readOnlyNotice,
    );
    expect(occurrences).toHaveLength(1);
    expect(panel.notice?.message).toBe(ro.panel.readOnlyNotice);
    expect(panel.sections).not.toHaveLength(0);
    for (const section of panel.sections) {
      expect(stringsWithin(section)).not.toContain(ro.panel.readOnlyNotice);
    }
  });

  it("says a retryable failure will be retried, without offering a reload that would lose it", () => {
    // `error` means a retry is armed and the unwritten state is queued behind it. Telling the
    // customer to reload here would discard exactly the edit that is about to be saved.
    const notice = openPanel(occupiedMeta(), { saveStatus: "error" }).notice;

    expect(notice?.kind).toBe("save-failed");
    expect(notice?.message).toBe(ro.panel.saveFailedNotice);
    // The advice form is the imperative "reîncarcă pagina"; the copy's own "nu reîncărca pagina"
    // is the negative imperative and does not match it. This pins that no reload is *offered*.
    expect(ro.panel.saveFailedNotice).not.toContain("reîncarcă pagina");
  });

  it("says a stopped save has stopped, rather than dressing it as a retry", () => {
    // `stopped` is terminal: nothing will ever write this design again from this session, so the
    // retryable copy's "we are still trying" would be a promise the branch cannot keep.
    const notice = openPanel(occupiedMeta(), { saveStatus: "stopped" }).notice;

    expect(notice?.kind).toBe("save-stopped");
    expect(notice?.tone).toBe("error");
    expect(notice?.message).toBe(ro.panel.saveStoppedNotice);
    expect(notice?.message).not.toBe(ro.panel.saveFailedNotice);
  });

  it("leaves §9's rejection banner at the top of the body, above every section", () => {
    // The notice is about the panel; the banner is about the edit that was just refused. They are
    // different things and the banner keeps its §9 position.
    const panel = openPanel(occupiedMeta(), {
      saveStatus: "error",
      rejection: REFUSAL,
    });

    expect(panel.sections[0]?.kind).toBe("rejection");
    expect(panel.notice?.kind).toBe("save-failed");
  });
});

describe("a read-only panel offers nothing it cannot perform", () => {
  it("disables every replace row and gives each one its reason", () => {
    const replace = findSection(readOnlyPanel(), "replace");

    expect(replace.rows).toHaveLength(3);
    for (const row of replace.rows) {
      expect(row.isDisabled).toBe(true);
      expect(row.secondaryLine).toBe(ro.panel.readOnlyReason);
    }
  });

  it("puts read-only ahead of 'the model is preparing' — the wait would never end", () => {
    const replace = findSection(
      readOnlyPanel(occupiedMeta(), { isBodyProbeAttached: false }),
      "replace",
    );

    expect(replace.rows[0]?.secondaryLine).toBe(ro.panel.readOnlyReason);
  });

  it("disables every finish chip and gives each one its reason", () => {
    // §13.1: greyed and unclickable **with the reason**. A bare dimmed swatch says nothing about
    // why it stopped responding, and a disabled control is not focusable, so the reason has to be
    // on the chip rather than reachable from it.
    const finish = findSection(readOnlyPanel(), "finish");

    expect(finish.chips).not.toHaveLength(0);
    for (const chip of finish.chips) {
      expect(chip.isDisabled).toBe(true);
      expect(chip.reason).toBe(ro.panel.readOnlyReason);
    }
  });

  it("disables every handle chip and gives each one its reason", () => {
    const handle = findSection(readOnlyPanel(), "handle");

    expect(handle.chips).not.toHaveLength(0);
    for (const chip of handle.chips) {
      expect(chip.isDisabled).toBe(true);
      expect(chip.reason).toBe(ro.panel.readOnlyReason);
    }
  });

  // **This is the day the note above predicted.** It read "weak by construction": M4 shipped no
  // resize, so every width chip was already unclickable and the test would have passed with the
  // read-only rule deleted. Wave 5D made `free` reachable, so the options handed in below contain
  // two widths the engine would accept — and the claim is now that read-only beats them.
  //
  // Asserted with the engine's reason **replaced** by the panel's, which is the half the sibling
  // finish and handle tests have always checked and this one did not: a customer who cannot write
  // must not be told which widths their cabinet could reach instead of being told they cannot edit.
  it("disables every width chip and gives each one its reason, free chips included", () => {
    const width = findSection(
      readOnlyPanel(occupiedMeta({ widthMm: 600 }), {
        widthOptions: widthOptionRow({
          currentMm: 600,
          freeMm: [400, 800],
          blockedMm: [300],
        }),
      }),
      "width",
    );

    expect(
      asWidthChoice(width).chips.filter((chip) => chip.state === "free"),
    ).toHaveLength(2);
    for (const chip of asWidthChoice(width).chips) {
      expect([chip.widthMm, chip.isDisabled]).toEqual([chip.widthMm, true]);
      expect([chip.widthMm, chip.reason]).toEqual([
        chip.widthMm,
        ro.panel.readOnlyReason,
      ]);
    }
  });

  it("disables Șterge corpul without pretending the body cannot be deleted", () => {
    const footer = readOnlyPanel().footer;

    // `canDelete` is about the body, `isRemoveDisabled` about this browser. Hiding the control
    // would say the first when only the second is true.
    expect(footer.canDelete).toBe(true);
    expect(footer.isRemoveDisabled).toBe(true);
    // §13.1 again: the dimmed control carries its reason, exactly as the offer rows and chips do.
    expect(footer.removeDisabledReason).toBe(ro.panel.readOnlyReason);
  });

  it("still hides Șterge corpul on a body that has no delete at all", () => {
    const footer = readOnlyPanel(occupiedMeta({ canDelete: false })).footer;

    expect(footer.canDelete).toBe(false);
    expect(footer.isRemoveDisabled).toBe(true);
  });
});

describe("read-only withholds nothing from the customer's eyes", () => {
  it("renders §9's sections exactly as a writable panel does", () => {
    const kindsOf = (panel: OpenPanel) =>
      panel.sections.map((section) => section.kind);

    expect(kindsOf(readOnlyPanel())).toEqual(
      kindsOf(openPanel(occupiedMeta())),
    );
  });

  it("keeps the derived count line and the ACTUAL badge", () => {
    const panel = readOnlyPanel(occupiedMeta(), {
      offers: [
        offer({ buildId: "base-cabinet" }),
        offer({ buildId: "base-drawers" }),
        offer({ buildId: "base-cabinet", isCurrent: true }),
      ],
    });
    const replace = findSection(panel, "replace");

    expect(replace.countLine).toBeDefined();
    expect(replace.rows.filter((row) => row.isCurrent)).toHaveLength(1);
  });

  it("keeps an empty slot's zero-result sentence rather than a bare disabled list", () => {
    const replace = findSection(
      readOnlyPanel(slotMeta(), { offers: [] }),
      "replace",
    );

    expect(replace.rows).toHaveLength(0);
    expect(replace.emptyLine).toBeDefined();
  });

  it("leaves the closed panel closed — a read-only browser with nothing selected sees no panel", () => {
    expect(
      describePanel({
        meta: undefined,
        offers: [],
        rejection: null,
        widthOptions: [],
        isBodyProbeAttached: true,
        canWrite: false,
        saveStatus: "unauthorized",
      }),
    ).toEqual({ kind: "closed" });
  });
});

describe("a writable panel is left alone", () => {
  it("enables every chip and row, and the failed-save notice changes none of that", () => {
    const panel = openPanel(occupiedMeta(), { saveStatus: "error" });

    expect(
      findSection(panel, "replace").rows.every((row) => row.isDisabled),
    ).toBe(false);
    expect(
      findSection(panel, "finish").chips.some((chip) => chip.isDisabled),
    ).toBe(false);
    expect(
      findSection(panel, "handle").chips.some((chip) => chip.isDisabled),
    ).toBe(false);
    expect(panel.footer.isRemoveDisabled).toBe(false);
    // No reason beside a control that works.
    expect(
      findSection(panel, "finish").chips.every(
        (chip) => chip.reason === undefined,
      ),
    ).toBe(true);
    expect(panel.footer.removeDisabledReason).toBeUndefined();
  });

  it("keeps the offer size on the secondary line", () => {
    const replace = findSection(openPanel(occupiedMeta()), "replace");

    expect(replace.rows[0]?.secondaryLine).toBe(ro.panel.offerSize(600, 860));
  });
});
