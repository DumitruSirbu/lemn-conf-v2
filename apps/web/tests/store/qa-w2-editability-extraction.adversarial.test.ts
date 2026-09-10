// **Adversarial QA for wave W2, attack 1: the extraction has to be behaviour-preserving.**
//
// `store/editability.ts` was cut out of `panel/panel-model.ts` at commit `b6d7bd2`. The wave's own
// `tests/store/editability.test.ts` sweeps the whole `WriteAccess` × `SaveStatus` product and
// cross-checks the panel against `describeEditability` — but both sides of that cross-check call the
// **same moved function**, so it stays green under any drift the move introduced. It proves the
// panel consumes the shared rule; it cannot prove the shared rule is the rule the panel used to
// have.
//
// So this file holds the second half. The pre-move predicate and its three sentences are restated
// here verbatim from `panel-model.ts` at `6c44f5d` — the parent commit — and the shipped function is
// swept against them. A restatement is exactly what the codebase forbids in production and exactly
// what a regression gate needs: two independent authors of one answer, where disagreement is the
// signal.
//
// The product is swept whole, unreachable pairs included, because the rule is now **shared**: a pair
// the panel can never be in is one the settings sheet may reach, and a rule with a state nobody has
// characterised is how the two surfaces came to disagree in the first place.
import { describe, expect, it } from "vitest";

import { ro } from "../support/romanian-content";
import { ro as content } from "../support/romanian-content";
import type { SaveStatus } from "@/persistence/save-coalescer";
import { describePanel } from "@/panel/panel-model";
import type { WriteAccess } from "@/store/configurator-store";
import { describeEditability } from "@/store/editability";

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

interface Access {
  readonly canWrite: WriteAccess;
  readonly saveStatus: SaveStatus;
}

function everyAccessPair(): readonly Access[] {
  return EVERY_WRITE_ACCESS.flatMap((canWrite) =>
    EVERY_SAVE_STATUS.map((saveStatus) => ({ canWrite, saveStatus })),
  );
}

function labelFor(access: Access): string {
  return `${String(access.canWrite)} / ${access.saveStatus}`;
}

/** One object less one key. Written out rather than destructured, because a discarded binding is an
 *  unused variable and this suite's lint has no exemption for one. */
function withoutKey(value: object, dropped: string): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== dropped),
  );
}

/** `panel-model.ts`'s `isReadOnly` as it stood at `6c44f5d`, copied rather than imported. */
function wasReadOnlyBeforeW2(access: Access): boolean {
  return access.canWrite !== true || access.saveStatus === "unauthorized";
}

/** `panel-model.ts`'s `describeDisabledReason` as it stood at `6c44f5d`, copied rather than
 *  imported. The three `ro.panel` keys are read live: the move deliberately left the sentences where
 *  they were, so a test that inlined their text would be pinning the copy rather than the routing. */
function wasDisabledReasonBeforeW2(canWrite: WriteAccess): string {
  if (canWrite === "checking") return ro.panel.accessCheckingReason;
  if (canWrite === "check-failed") return ro.panel.accessUncheckableReason;
  return ro.panel.readOnlyReason;
}

/** §9's panel with a body selected, so the view is open and its footer and sections state what the
 *  rule decided. The panel suite's own fixtures, so this reads the shipped panel. */
function openPanelAt(access: Access) {
  const meta = occupiedMeta();
  const view = describePanel({
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
  if (view.kind !== "open")
    throw new Error(`the panel closed at ${labelFor(access)}`);
  return view;
}

describe("the predicate that moved out of panel-model.ts", () => {
  it("answers what it answered before the move, at every pair of the whole product", () => {
    const disagreements = everyAccessPair().filter(
      (access) =>
        describeEditability(access, ro.panel).isReadOnly !==
        wasReadOnlyBeforeW2(access),
    );

    expect(disagreements.map(labelFor)).toEqual([]);
  });

  it("gives the sentence it gave before the move, at every pair of the whole product", () => {
    const disagreements = everyAccessPair().filter(
      (access) =>
        describeEditability(access, ro.panel).disabledReason !==
        wasDisabledReasonBeforeW2(access.canWrite),
    );

    expect(disagreements.map(labelFor)).toEqual([]);
  });

  it("sweeps every pair the two unions can form, so neither list is short", () => {
    // The two loops above are the claim, so their extent is asserted rather than assumed. `4 × 6` is
    // written as a product of the lists rather than as 24: a fifth `WriteAccess` state must widen
    // the sweep instead of failing this line.
    expect(everyAccessPair().length).toBe(
      EVERY_WRITE_ACCESS.length * EVERY_SAVE_STATUS.length,
    );
    expect(new Set(everyAccessPair().map(labelFor)).size).toBe(
      everyAccessPair().length,
    );
  });
});

describe("the pairs the panel cannot reach but a shared rule can be asked about", () => {
  /** An unanswered access probe alongside a save that has already been refused. §9 cannot produce
   *  it — nothing was ever offered, so nothing was ever saved — but the rule is now shared, and a
   *  second surface that hydrates from a stored `saveStatus` can ask. */
  const UNREACHABLE_FOR_THE_PANEL: readonly Access[] = [
    { canWrite: "checking", saveStatus: "unauthorized" },
    { canWrite: "check-failed", saveStatus: "unauthorized" },
    { canWrite: false, saveStatus: "unauthorized" },
    { canWrite: "checking", saveStatus: "conflict" },
    { canWrite: false, saveStatus: "saving" },
  ];

  it("locks on every one of them, so the shared rule fails closed outside §9's reachable set", () => {
    for (const access of UNREACHABLE_FOR_THE_PANEL)
      expect(
        describeEditability(access, ro.panel).isReadOnly,
        labelFor(access),
      ).toBe(true);
  });

  it("reports the access probe's own sentence, never the refused save's, when both are true", () => {
    // Characterised rather than corrected. Where an unanswered probe meets a refused save the rule
    // reports the probe — "se verifică accesul" — and says nothing about the refusal. That is the
    // pre-move behaviour, kept: the second surface must not be told a save was refused for a design
    // whose access nobody has answered for yet. Pinned so a later change to it is a decision.
    expect(
      describeEditability(
        { canWrite: "checking", saveStatus: "unauthorized" },
        ro.panel,
      ).disabledReason,
    ).toBe(ro.panel.accessCheckingReason);
    expect(
      describeEditability(
        {
          canWrite: "check-failed",
          saveStatus: "unauthorized",
        },
        ro.panel,
      ).disabledReason,
    ).toBe(ro.panel.accessUncheckableReason);
  });
});

describe("§9's panel, after the rule left it", () => {
  it("decides every locked control from the shared answer and from nothing else about the pair", () => {
    // Stronger than comparing the footer alone: the whole view is compared, minus the notice, which
    // reads `canWrite` and `saveStatus` in its own right (`describeLockedNotice` tells four locked
    // states apart, and `save-failed` / `save-stopped` / `save-conflict` are not about editability).
    // Everything else the panel renders must be a function of `describeEditability`'s two fields, so
    // pairs sharing an answer must render identically.
    const byAnswer = new Map<string, { label: string; body: string }[]>();
    for (const access of everyAccessPair()) {
      const body = withoutKey(openPanelAt(access), "notice");
      const answer = JSON.stringify(describeEditability(access, ro.panel));
      byAnswer.set(answer, [
        ...(byAnswer.get(answer) ?? []),
        { label: labelFor(access), body: JSON.stringify(body) },
      ]);
    }

    for (const [answer, rendered] of byAnswer) {
      const first = rendered.at(0);
      if (!first) throw new Error(`no pair produced ${answer}`);
      const divergent = rendered.filter((one) => one.body !== first.body);
      expect(
        divergent.map((one) => one.label),
        `${answer} rendered differently at`,
      ).toEqual([]);
    }
    // Four distinct answers: writable, and the three locked sentences.
    expect(byAnswer.size).toBe(4);
  });

  it("carries the reason onto the remove action exactly where the rule says it is locked", () => {
    for (const access of everyAccessPair()) {
      const shared = describeEditability(access, ro.panel);
      const { footer } = openPanelAt(access);

      expect(footer.isRemoveDisabled, labelFor(access)).toBe(shared.isReadOnly);
      expect(footer.removeDisabledReason, labelFor(access)).toBe(
        shared.isReadOnly ? shared.disabledReason : undefined,
      );
    }
  });
});
