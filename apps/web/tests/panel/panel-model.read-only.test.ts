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

import { ro } from "../support/romanian-content";

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
import { MDF_KITCHEN, PAL_KITCHEN } from "../support/panel-material";
import { pickerSectionOf, swatchSectionOf } from "../support/panel-sections";

/** The writable, healthy panel every case here varies from exactly one axis at a time.
 *
 *  **The material is one of those axes since wave 6R.** Every case below that does not name one is
 *  on PAL and reads `chips`; MDF renders a single colour input instead, and a rule asserted only
 *  over chips says nothing about it — which is how a live picker could ship on a read-only share
 *  link. `overrides` carries `material`, so a case names it exactly where it matters. */
function openPanel(
  meta: SelectionMeta,
  overrides: Partial<Parameters<typeof describePanel>[0]> = {},
): OpenPanel {
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

    expect(swatchSectionOf(panel).chips.every((chip) => chip.isDisabled)).toBe(
      true,
    );
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
    //
    // **The two literals are deliberate and load-bearing** — a *negative* claim about the source
    // wording, which no catalogue read can express. Wave 6B-j's allow-list, not a conversion.
    // eslint-disable-next-line no-restricted-syntax -- 6B-j allow-list: a negative claim about the source wording, which no catalogue read can express — see the note above.
    expect(ro.panel.readOnlyNotice).not.toContain("browserul în care");
    // eslint-disable-next-line no-restricted-syntax -- 6B-j allow-list: the second half of the same negative claim.
    expect(ro.panel.readOnlyNotice).not.toContain("a fost creată");
  });

  it("offers no edit while the write-access probe is still unanswered", () => {
    // Finding WEB-002, and the inversion of what this file used to assert. `/d/{id}` hydrates
    // `"checking"` because ADR 0019 decision 1's cookie could not reach the page's own request —
    // and an unanswered question satisfies nothing, which is exactly what §9's "never offer what
    // cannot be satisfied" forbids offering. The alternative shipped a believable but non-persisted
    // configuration: the reader edited, the write was refused, and the controls disabled only then.
    const panel = openPanel(occupiedMeta(), {
      canWrite: "checking",
      saveStatus: "idle",
    });

    expect(panel.notice?.kind).toBe("access-checking");
    // Not a fault: nothing has gone wrong, something is merely still in flight.
    expect(panel.notice?.tone).toBe("info");
    expect(panel.notice?.message).toBe(ro.panel.accessCheckingNotice);
    expect(swatchSectionOf(panel).chips.every((chip) => chip.isDisabled)).toBe(
      true,
    );
    expect(
      findSection(panel, "replace").rows.every((row) => row.isDisabled),
    ).toBe(true);
    expect(panel.footer.isRemoveDisabled).toBe(true);
  });

  it("renders the design while the probe is unanswered, rather than withholding it", () => {
    // The finding asks for the controls to wait, not for the page to. A blank panel behind a
    // spinner would be a second product change nobody asked for, and §9's header is a fact about
    // the selection that no access answer can alter.
    const panel = openPanel(occupiedMeta(), { canWrite: "checking" });

    expect(panel.header.label).toBe(ro.bodyLabel(occupiedMeta().label));
    expect(panel.sections).not.toHaveLength(0);
  });

  it("says the access check failed, retryably, rather than granting interactivity", () => {
    // The probe rejected — a dropped request, a blocked API, an offline browser. Nothing knows
    // whether this browser may write, so nothing may be offered; but the failure is transient by
    // nature, so the notice carries the one action that can change the answer.
    const panel = openPanel(occupiedMeta(), {
      canWrite: "check-failed",
      saveStatus: "idle",
    });

    expect(panel.notice?.kind).toBe("access-uncheckable");
    expect(panel.notice?.tone).toBe("error");
    expect(panel.notice?.message).toBe(ro.panel.accessUncheckableNotice);
    expect(panel.notice?.actions).toEqual([
      { kind: "retry-access-check", label: ro.panel.accessRetryLabel },
    ]);
    expect(swatchSectionOf(panel).chips.every((chip) => chip.isDisabled)).toBe(
      true,
    );
    expect(panel.footer.isRemoveDisabled).toBe(true);
  });

  it("offers a retry on no other notice, so the only actionable one is the one that is", () => {
    // A retry beside "you cannot edit this design" or beside a failed save would be a button that
    // cannot help — §9's own rule, applied to the notice rather than to a control. A conflict does
    // carry actions, but neither of them is this one: see the conflict tests.
    const unanswerable: readonly Parameters<typeof openPanel>[1][] = [
      { canWrite: false },
      { canWrite: true, saveStatus: "unauthorized" },
      { canWrite: true, saveStatus: "error" },
      { canWrite: true, saveStatus: "stopped" },
      { canWrite: "checking" },
    ];

    for (const overrides of unanswerable) {
      expect(openPanel(occupiedMeta(), overrides).notice?.actions).toBe(
        undefined,
      );
    }
    expect(unanswerable).toHaveLength(5);
  });

  it("takes the probe's answer as the thing that opens the panel", () => {
    // The other half of the wait: `true` is the only value that unlocks anything, and it must
    // actually unlock it — a check that never re-enables the controls is a read-only app.
    const panel = openPanel(occupiedMeta(), {
      canWrite: true,
      saveStatus: "idle",
    });

    expect(panel.notice).toBeUndefined();
    expect(swatchSectionOf(panel).chips.some((chip) => chip.isDisabled)).toBe(
      false,
    );
    expect(
      findSection(panel, "replace").rows.some((row) => row.isDisabled),
    ).toBe(false);
    expect(panel.footer.isRemoveDisabled).toBe(false);
  });

  it("never says 'Doar vizualizare' about a state nothing has answered", () => {
    // The reason travels with every greyed control (§13.1), and it is a different fact in each of
    // the three locked states. "Doar vizualizare" asserts a permission the page has been told
    // about; while the probe is out, nobody has told it anything.
    for (const canWrite of ["checking", "check-failed"] as const) {
      const panel = openPanel(occupiedMeta(), { canWrite });
      const reasons = stringsWithin(panel.sections);

      expect(reasons).not.toContain(ro.panel.readOnlyReason);
      expect(panel.footer.removeDisabledReason).not.toBe(
        ro.panel.readOnlyReason,
      );
    }
    expect(ro.panel.accessCheckingReason).not.toBe(ro.panel.readOnlyReason);
    expect(ro.panel.accessUncheckableReason).not.toBe(ro.panel.readOnlyReason);
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
    //
    // **The literal is deliberate and load-bearing** — a *negative* claim about the source wording,
    // which no catalogue read can express. Wave 6B-j's allow-list, not a conversion.
    // eslint-disable-next-line no-restricted-syntax -- 6B-j allow-list: a negative claim about the source wording: no reload is offered — see the note above.
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

  // The domain refusal this used to race against no longer reaches a row at all (owner,
  // 2026-09-10: an entry the engine refuses is absent, not disabled). What read-only still has to
  // beat is the row's **size line**, which is what an enabled row would otherwise be showing.
  it("puts read-only ahead of the size an offered row would otherwise show", () => {
    const replace = findSection(
      readOnlyPanel(occupiedMeta(), {
        offers: [offer({ buildsToWidthMm: 700, buildsToHeightMm: 1850 })],
      }),
      "replace",
    );

    expect(replace.rows[0]?.isDisabled).toBe(true);
    expect(replace.rows[0]?.secondaryLine).toBe(ro.panel.readOnlyReason);
    expect(replace.rows[0]?.secondaryLine).not.toBe(
      ro.panel.offerSize(700, 1850),
    );
  });

  it("disables every finish chip and gives each one its reason", () => {
    // §13.1: greyed and unclickable **with the reason**. A bare dimmed swatch says nothing about
    // why it stopped responding, and a disabled control is not focusable, so the reason has to be
    // on the chip rather than reachable from it.
    const finish = swatchSectionOf(readOnlyPanel());

    expect(finish.chips).not.toHaveLength(0);
    for (const chip of finish.chips) {
      expect(chip.isDisabled).toBe(true);
      expect(chip.reason).toBe(ro.panel.readOnlyReason);
    }
  });

  it("disables MDF's colour picker and gives it the same reason", () => {
    // §13.1 again, for the control that has no chips to carry it: on MDF the finish section *is*
    // one input, so the availability lands on the section itself. Every read-only case above is on
    // PAL and reads `chips`, which is why this went unasserted — and an MDF design opened from a
    // shared link is exactly the reachable state where a live colour input would be offered to a
    // browser that cannot write.
    const picker = pickerSectionOf(
      readOnlyPanel(occupiedMeta(), { material: MDF_KITCHEN }),
    );

    expect(picker.isDisabled).toBe(true);
    expect(picker.reason).toBe(ro.panel.readOnlyReason);
  });

  it("locks the picker in every state that locks a chip, each with that state's own reason", () => {
    // The four locked states, asserted on MDF because `describeChipAvailability` is threaded into
    // the picker section by the same spread and could be dropped from one and not the other.
    const locked = [
      [{ canWrite: false }, ro.panel.readOnlyReason],
      [{ canWrite: true, saveStatus: "unauthorized" }, ro.panel.readOnlyReason],
      [{ canWrite: "checking" }, ro.panel.accessCheckingReason],
      [{ canWrite: "check-failed" }, ro.panel.accessUncheckableReason],
    ] as const satisfies readonly (readonly [
      Parameters<typeof openPanel>[1],
      string,
    ])[];

    for (const [overrides, reason] of locked) {
      const picker = pickerSectionOf(
        openPanel(occupiedMeta(), { material: MDF_KITCHEN, ...overrides }),
      );

      expect([overrides, picker.isDisabled]).toEqual([overrides, true]);
      expect([overrides, picker.reason]).toEqual([overrides, reason]);
    }
    expect(locked).toHaveLength(4);
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

  it("disables the remove control without pretending the body cannot be deleted", () => {
    const footer = readOnlyPanel().footer;

    // `canDelete` is about the body, `isRemoveDisabled` about this browser. Hiding the control
    // would say the first when only the second is true.
    expect(footer.canDelete).toBe(true);
    expect(footer.isRemoveDisabled).toBe(true);
    // §13.1 again: the dimmed control carries its reason, exactly as the offer rows and chips do.
    expect(footer.removeDisabledReason).toBe(ro.panel.readOnlyReason);
  });

  it("still hides the remove control on a body that has no delete at all", () => {
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
        content: ro,
        material: PAL_KITCHEN,
        meta: undefined,
        offers: [],
        rejection: null,
        widthOptions: [],
        buildableWidthSpanMm: undefined,
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
    expect(swatchSectionOf(panel).chips.some((chip) => chip.isDisabled)).toBe(
      false,
    );
    expect(
      findSection(panel, "handle").chips.some((chip) => chip.isDisabled),
    ).toBe(false);
    expect(panel.footer.isRemoveDisabled).toBe(false);
    // No reason beside a control that works.
    expect(
      swatchSectionOf(panel).chips.every((chip) => chip.reason === undefined),
    ).toBe(true);
    expect(panel.footer.removeDisabledReason).toBeUndefined();
  });

  it("leaves MDF's picker live, with no reason beside a control that works", () => {
    // The anti-vacuity partner: a picker hard-coded to `isDisabled: true` would satisfy every case
    // above and would ship an MDF kitchen nobody can recolour.
    const picker = pickerSectionOf(
      openPanel(occupiedMeta(), {
        material: MDF_KITCHEN,
        saveStatus: "error",
      }),
    );

    expect(picker.isDisabled).toBe(false);
    expect(picker.reason).toBeUndefined();
  });

  it("keeps the offer size on the secondary line", () => {
    const replace = findSection(openPanel(occupiedMeta()), "replace");

    expect(replace.rows[0]?.secondaryLine).toBe(ro.panel.offerSize(600, 860));
  });
});

/**
 * WEB-003's notice. The stored design moved on while this browser was editing it, so the save was
 * refused rather than silently replacing the other tab's work.
 *
 * It is unlike every other notice in this file: nothing is lost yet, and the customer picks which
 * of the two versions survives. Against the pre-fix panel none of this exists — there was no
 * `conflict` save status to describe.
 */
describe("the panel when the stored design has moved on", () => {
  it("says what happened and offers both ways out, reload first", () => {
    // Reload is listed first because it is the conservative one: it keeps what is already stored,
    // and what it discards is still on screen while the customer decides.
    const panel = openPanel(occupiedMeta(), { saveStatus: "conflict" });

    expect(panel.notice?.kind).toBe("save-conflict");
    expect(panel.notice?.tone).toBe("error");
    expect(panel.notice?.message).toBe(ro.panel.saveConflictNotice);
    expect(panel.notice?.actions).toEqual([
      { kind: "reload-stored", label: ro.panel.saveConflictReloadLabel },
      { kind: "overwrite-stored", label: ro.panel.saveConflictOverwriteLabel },
    ]);
  });

  it("keeps the panel editable, because the edit on screen is real and still worth pushing", () => {
    // Greying the controls here would add a second thing to undo: the coalescer refuses further
    // writes rather than losing them, and overwriting sends whatever the design has become by the
    // time it is pressed.
    const panel = openPanel(occupiedMeta(), { saveStatus: "conflict" });

    expect(panel.footer.isRemoveDisabled).toBe(false);
    expect(swatchSectionOf(panel).chips.some((chip) => chip.isDisabled)).toBe(
      false,
    );
  });

  it("says nothing about a conflict on a panel that has no write credential at all", () => {
    // A read-only browser cannot have been refused for staleness, and the locked notice is the one
    // that explains why nothing responds.
    const panel = openPanel(occupiedMeta(), {
      canWrite: false,
      saveStatus: "conflict",
    });

    expect(panel.notice?.kind).toBe("read-only");
  });

  it("does not offer the access retry beside a conflict, which it could not resolve", () => {
    const panel = openPanel(occupiedMeta(), { saveStatus: "conflict" });

    expect(
      panel.notice?.actions?.some(
        (action) => action.kind === "retry-access-check",
      ),
    ).toBe(false);
  });
});
