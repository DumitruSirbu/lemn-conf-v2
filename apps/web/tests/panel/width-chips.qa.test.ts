// Adversarial QA on wave 5D's width chips, in the one state the implementer's sweeps never enter:
// a kitchen where a chip is actually **free**.
//
// `width-chips.adversarial.test.ts` sweeps the shipped kitchen, which has no empty column at load,
// so its `free` count is zero — and its read-only sweep therefore proves only that already-disabled
// chips stay disabled. Everything below deletes a column first, so the `free` state exists and the
// rules about it are tested rather than skipped.
import {
  deriveColumns,
  derivePlacementRecords,
  describeSelection,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  offersFor,
  recomputeVoids,
  removePlacement,
  renderRejection,
  widthOptionsFor,
  type CommandTarget,
  type Design,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { ro } from "@/content/ro";
import { describePanel, type WidthSection } from "@/panel/panel-model";

import { createFakeBodyProbe } from "../support/fake-body-probe";

const PROBE = createFakeBodyProbe();
const OCCURRED_AT = "2026-08-25T12:00:00.000Z";

/** ADR 0011 Gap D: the extents are frozen from the **whole** design, then bodies are deleted
 *  through the real command — which is the only way an empty column exists at all. */
const SEEDED_COLUMNS = deriveColumns(
  derivePlacementRecords(KITCHEN_L_DESIGN, KITCHEN_L_BODY_CATALOG),
);

function designWithoutColumn(placementIds: readonly string[]): Design {
  return placementIds.reduce<Design>((design, id) => {
    const result = removePlacement({
      design,
      catalog: KITCHEN_L_BODY_CATALOG,
      target: { kind: "placement", id },
      occurredAt: OCCURRED_AT,
    });
    if (!result.ok) throw new Error(`fixture could not remove ${id}`);
    return result.design;
  }, KITCHEN_L_DESIGN);
}

function worldFrom(design: Design) {
  const records = derivePlacementRecords(design, KITCHEN_L_BODY_CATALOG);
  return {
    design,
    records,
    columns: SEEDED_COLUMNS,
    voids: recomputeVoids(records, SEEDED_COLUMNS),
    catalog: KITCHEN_L_BODY_CATALOG,
  };
}

type World = ReturnType<typeof worldFrom>;

/** `A|2.00` emptied through the real delete — the fixture ADR 0034 names as the one in which any
 *  chip goes free at all. */
const openKitchen = () => worldFrom(designWithoutColumn(["p1", "p12", "p18"]));

function optionsAt(world: World, target: CommandTarget) {
  return widthOptionsFor({
    design: world.design,
    catalog: world.catalog,
    columns: world.columns,
    target,
    probe: PROBE,
  });
}

function widthSectionAt(
  world: World,
  id: string,
  canWrite = true,
): WidthSection | undefined {
  const target: CommandTarget = { kind: "placement", id };
  const panel = describePanel({
    meta: describeSelection({ ...world, target }),
    offers: offersFor({ ...world, target }),
    rejection: null,
    widthOptions: optionsAt(world, target),
    isBodyProbeAttached: true,
    canWrite,
    saveStatus: "idle",
  });
  if (panel.kind !== "open") return undefined;
  const section = panel.sections.find(
    (candidate) => candidate.kind === "width",
  );
  return section?.kind === "width" ? section : undefined;
}

/** Every chip the emptied kitchen renders, flattened, so a sweep cannot pass by rendering nothing. */
function allChips(world: World, canWrite = true) {
  return world.records.flatMap((record) => {
    const section = widthSectionAt(world, record.id, canWrite);
    return (section?.chips ?? []).map((chip) => ({ id: record.id, chip }));
  });
}

describe("the free state exists, and the rules about it are the ones §9 wrote down", () => {
  // The precondition for every case in this file. If this ever falls to zero the sweeps below stop
  // testing anything, exactly as the shipped-kitchen sweeps already do.
  it("renders free chips once a column has been emptied", () => {
    const free = allChips(openKitchen()).filter(
      ({ chip }) => chip.state === "free",
    );
    expect(free.map(({ id, chip }) => `${id}@${String(chip.widthMm)}`)).toEqual(
      ["p0@600", "p11@600", "p17@600"],
    );
  });

  it("makes a free chip the only clickable one", () => {
    for (const { id, chip } of allChips(openKitchen())) {
      expect([id, chip.widthMm, chip.isDisabled]).toEqual([
        id,
        chip.widthMm,
        chip.state !== "free",
      ]);
    }
  });

  // §13.1's reason belongs beside a control that does not work. A clickable chip carrying one would
  // be the panel explaining a refusal it is not making.
  it("gives a reason to blocked chips and to nothing else", () => {
    for (const { id, chip } of allChips(openKitchen())) {
      expect([id, chip.widthMm, chip.reason === undefined]).toEqual([
        id,
        chip.widthMm,
        chip.state !== "blocked",
      ]);
    }
  });

  // ADR 0034 rule 4: the sentence is the engine's own, rendered through the one `renderRejection`.
  // Asserted against the detail the query published rather than against a copied string, so a panel
  // that re-worded a refusal fails here rather than reading plausibly.
  it("renders the engine's own sentence on every blocked chip", () => {
    const world = openKitchen();
    let blocked = 0;
    for (const record of world.records) {
      const section = widthSectionAt(world, record.id);
      if (!section) continue;
      const verdicts = new Map(
        optionsAt(world, { kind: "placement", id: record.id }).map((option) => [
          option.widthMm,
          option.verdict,
        ]),
      );
      for (const chip of section.chips) {
        if (chip.state !== "blocked") continue;
        const verdict = verdicts.get(chip.widthMm);
        if (verdict?.status !== "refused") {
          throw new Error(
            `no refusal behind ${record.id}@${String(chip.widthMm)}`,
          );
        }
        expect([record.id, chip.widthMm, chip.reason]).toEqual([
          record.id,
          chip.widthMm,
          renderRejection(verdict.reason),
        ]);
        blocked += 1;
      }
    }
    expect(blocked).toBeGreaterThan(20);
  });
});

describe("read-only wins over free, which is the case the shipped-kitchen sweep cannot reach", () => {
  it("disables the free chips too, and says so in the panel's own words", () => {
    const world = openKitchen();
    const writable = new Map(
      allChips(world).map(({ id, chip }) => [
        `${id}@${String(chip.widthMm)}`,
        chip,
      ]),
    );
    let freeChips = 0;
    for (const { id, chip } of allChips(world, false)) {
      const key = `${id}@${String(chip.widthMm)}`;
      expect([key, chip.isDisabled]).toEqual([key, true]);
      // The state itself is unchanged — read-only greys the control, it does not rewrite the
      // engine's verdict — and the reason is the panel's sentence rather than the engine's.
      expect([key, chip.state]).toEqual([key, writable.get(key)?.state]);
      expect([key, chip.reason === undefined]).toEqual([key, false]);
      if (chip.state === "free") freeChips += 1;
    }
    expect(freeChips).toBe(3);
  });

  it("never leaks a refusal sentence under read-only", () => {
    const world = openKitchen();
    const reasons = new Set(
      allChips(world, false).map(({ chip }) => chip.reason),
    );
    expect(reasons.size).toBe(1);
  });
});

describe("no probe means no section, not a section full of probe complaints", () => {
  // `use-panel-view.ts` publishes an empty list when no probe is attached, and the panel must lose
  // the section entirely — the replace list already carries the "model is preparing" sentence.
  it("drops the width section when the option list is empty", () => {
    const world = openKitchen();
    const target: CommandTarget = { kind: "placement", id: "p11" };
    const meta = describeSelection({ ...world, target });
    expect(meta?.canWidth).toBe(true);
    const panel = describePanel({
      meta,
      offers: offersFor({ ...world, target }),
      rejection: null,
      widthOptions: [],
      isBodyProbeAttached: false,
      canWrite: true,
      saveStatus: "idle",
    });
    if (panel.kind !== "open") throw new Error("expected an open panel");
    expect(panel.sections.some((section) => section.kind === "width")).toBe(
      false,
    );
  });
});

describe("the one-chip section the intersection produces", () => {
  // Recorded rather than judged. ADR 0034 decision 5 removes the one-chip section that came from an
  // *empty* set, but the column intersection produces one of its own: `A|2.00`'s three members
  // agree on 600 and nothing else, so each of them renders a section whose only chip is the width
  // they already have — a control with nothing to choose. It is what the decision as written says
  // should happen, and it is pinned here so the number is visible to review rather than inferred.
  it.each(["p1", "p12", "p18"])(
    "renders %s a section holding only its own width",
    (id) => {
      const section = widthSectionAt(worldFrom(KITCHEN_L_DESIGN), id);
      expect(section?.chips.map((chip) => [chip.widthMm, chip.state])).toEqual([
        [600, "active"],
      ]);
    },
  );
});

describe("the width section's note describes a feature that exists", () => {
  // **Logic review L1, and it was a blocker.** The note read "Lățimea se schimbă mutând granița cu
  // vecinul. **Nu este încă disponibilă în această versiune.**" — truthful while no resize command
  // existed, and a lie the moment wave 5D wired the chips: a clickable chip that performs the
  // resize, sitting directly above a sentence saying the feature is not available.
  //
  // **No test pinned the string**, which is exactly why 879 + 509 green said nothing about it. This
  // is that test. It is deliberately about the claim rather than the wording — a copy edit should
  // not fail it, but re-introducing an availability disclaimer must.
  it("never tells the customer the feature is unavailable", () => {
    expect(ro.panel.widthNote).not.toMatch(/nu este (încă )?disponibil/i);
    expect(ro.panel.widthNote).not.toMatch(/în această versiune/i);
  });

  // ADR 0031's rule, not §5.4's superseded donor rule: the width comes from empty space beside the
  // column, and §2's `MIN_W` floor is the number §9's own wording carries.
  it("states where the width actually comes from, and the floor", () => {
    expect(ro.panel.widthNote).toMatch(/spațiul liber/i);
    expect(ro.panel.widthNote).toContain("300");
  });

  // The note the customer reads is the one the model publishes — asserted through a real section so
  // a note changed in `ro.ts` and not wired here would still be caught.
  it("is the note the rendered width section carries", () => {
    const section = widthSectionAt(openKitchen(), "p0");
    expect(section?.note).toBe(ro.panel.widthNote);
  });
});
