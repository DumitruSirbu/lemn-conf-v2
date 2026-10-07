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

/** The writable, healthy panel every case varies from one axis at a time. `overrides.material` names the material:
 *  a rule asserted only over PAL chips says nothing about MDF's single colour input. */
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

/** Every string reachable inside a value, so "appears exactly once" is a claim about the whole panel. */
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
    // The load's answer is cookie presence, not proof the token is right; a 403 must move the panel to read-only.
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
    // The load said writable and the customer made an edit; the 403 answers it and no retry is coming, which
    // `readOnlyNotice` would not mention.
    const notice = openPanel(occupiedMeta(), {
      canWrite: true,
      saveStatus: "unauthorized",
    }).notice;

    expect(notice?.kind).toBe("read-only-refused");
    expect(notice?.message).toBe(ro.panel.readOnlyRefusedNotice);
    expect(notice?.message).not.toBe(ro.panel.readOnlyNotice);
    // The permanent-loss path must not read weaker than the retryable one, hence the error tone.
    expect(notice?.tone).toBe("error");
  });

  it("keeps the never-attempted copy when the load itself said read-only", () => {
    // `canWrite: false` disabled every control from the first frame, so claiming a lost edit would be false.
    const notice = readOnlyPanel(occupiedMeta(), {
      saveStatus: "unauthorized",
    }).notice;

    expect(notice?.kind).toBe("read-only");
    expect(notice?.tone).toBe("info");
    expect(notice?.message).toBe(ro.panel.readOnlyNotice);
  });

  it("names no way back that does not exist", () => {
    // The notice must be true of all three ways into read-only (expired cookie, cleared jar, shared link); an emailed
    // edit link is unbuilt (ADR 0115). The two literals are deliberate: a negative claim about the source wording,
    // which no catalogue read can express.
    // eslint-disable-next-line no-restricted-syntax -- 6B-j allow-list: a negative claim about the source wording, which no catalogue read can express — see the note above.
    expect(ro.panel.readOnlyNotice).not.toContain("browserul în care");
    // eslint-disable-next-line no-restricted-syntax -- 6B-j allow-list: the second half of the same negative claim.
    expect(ro.panel.readOnlyNotice).not.toContain("a fost creată");
  });

  it("offers no edit while the write-access probe is still unanswered", () => {
    // `/d/{id}` hydrates `"checking"`, and an unanswered question satisfies nothing, so no edit may be offered
    // (DEVELOPMENT-SPEC §9).
    const panel = openPanel(occupiedMeta(), {
      canWrite: "checking",
      saveStatus: "idle",
    });

    expect(panel.notice?.kind).toBe("access-checking");
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
    // The controls wait, not the page: the header is a fact about the selection that no access answer can alter.
    const panel = openPanel(occupiedMeta(), { canWrite: "checking" });

    expect(panel.header.label).toBe(ro.bodyLabel(occupiedMeta().label));
    expect(panel.sections).not.toHaveLength(0);
  });

  it("says the access check failed, retryably, rather than granting interactivity", () => {
    // The probe rejected, so nothing may be offered; the failure is transient, so the notice carries the one action
    // that can change the answer.
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
    // A retry beside any other notice would be a button that cannot help.
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
    // `true` is the only value that unlocks anything, and it must actually unlock it.
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
    // "Doar vizualizare" asserts a permission the page has been told about; while the probe is out, nobody has.
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
    // Built with a rejection so the panel carries every section kind §9 can produce.
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
    // `error` means a retry is armed with the unwritten state queued behind it; a reload would discard that edit.
    const notice = openPanel(occupiedMeta(), { saveStatus: "error" }).notice;

    expect(notice?.kind).toBe("save-failed");
    expect(notice?.message).toBe(ro.panel.saveFailedNotice);
    // "reîncarcă pagina" is the advice imperative; the copy's own "nu reîncărca pagina" is the negative and does
    // not match, so this pins that no reload is offered. The literal is deliberate: a negative claim about the
    // source wording, which no catalogue read can express.
    // eslint-disable-next-line no-restricted-syntax -- 6B-j allow-list: a negative claim about the source wording: no reload is offered — see the note above.
    expect(ro.panel.saveFailedNotice).not.toContain("reîncarcă pagina");
  });

  it("says a stopped save has stopped, rather than dressing it as a retry", () => {
    // `stopped` is terminal, so the retryable copy's "we are still trying" would be a promise the branch cannot keep.
    const notice = openPanel(occupiedMeta(), { saveStatus: "stopped" }).notice;

    expect(notice?.kind).toBe("save-stopped");
    expect(notice?.tone).toBe("error");
    expect(notice?.message).toBe(ro.panel.saveStoppedNotice);
    expect(notice?.message).not.toBe(ro.panel.saveFailedNotice);
  });

  it("leaves §9's rejection banner at the top of the body, above every section", () => {
    // The notice is about the panel, the banner about the edit just refused; the banner keeps its §9 position.
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

  // What read-only must beat is the row's size line, which an enabled row would otherwise show.
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
    // A disabled control is not focusable, so the reason has to be on the chip rather than reachable from it.
    const finish = swatchSectionOf(readOnlyPanel());

    expect(finish.chips).not.toHaveLength(0);
    for (const chip of finish.chips) {
      expect(chip.isDisabled).toBe(true);
      expect(chip.reason).toBe(ro.panel.readOnlyReason);
    }
  });

  it("disables MDF's colour picker and gives it the same reason", () => {
    // On MDF the finish section is one input, so the availability lands on the section itself; every case above is PAL.
    const picker = pickerSectionOf(
      readOnlyPanel(occupiedMeta(), { material: MDF_KITCHEN }),
    );

    expect(picker.isDisabled).toBe(true);
    expect(picker.reason).toBe(ro.panel.readOnlyReason);
  });

  it("locks the picker in every state that locks a chip, each with that state's own reason", () => {
    // Asserted on MDF because `describeChipAvailability` is threaded into the picker by the same spread and could be
    // dropped from one and not the other.
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

  // Read-only must beat the engine's reason for free widths: a customer who cannot write must not be told which
  // widths their cabinet could reach.
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

    // `canDelete` is about the body, `isRemoveDisabled` about this browser; hiding the control would say the first
    // when only the second is true.
    expect(footer.canDelete).toBe(true);
    expect(footer.isRemoveDisabled).toBe(true);
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
    expect(
      swatchSectionOf(panel).chips.every((chip) => chip.reason === undefined),
    ).toBe(true);
    expect(panel.footer.removeDisabledReason).toBeUndefined();
  });

  it("leaves MDF's picker live, with no reason beside a control that works", () => {
    // Anti-vacuity partner: a picker hard-coded to `isDisabled: true` would satisfy every case above.
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

/** The stored design moved on while this browser was editing, so the save was refused: nothing is lost yet and the
 *  customer picks which version survives. */
describe("the panel when the stored design has moved on", () => {
  it("says what happened and offers both ways out, reload first", () => {
    // Reload is first because it is the conservative one: it keeps what is stored, and what it discards is on screen.
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
    // Greying the controls would add a second thing to undo: the coalescer refuses further writes rather than
    // losing them.
    const panel = openPanel(occupiedMeta(), { saveStatus: "conflict" });

    expect(panel.footer.isRemoveDisabled).toBe(false);
    expect(swatchSectionOf(panel).chips.some((chip) => chip.isDisabled)).toBe(
      false,
    );
  });

  it("says nothing about a conflict on a panel that has no write credential at all", () => {
    // A read-only browser cannot have been refused for staleness; the locked notice explains why nothing responds.
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
