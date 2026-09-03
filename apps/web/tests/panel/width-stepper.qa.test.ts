// Adversarial pass on wave 5D2c's stepper, in the states the sweep next door cannot enter.
//
// **This file replaces `width-chips.qa.test.ts`.** That file's subject was a kitchen where a *chip*
// could be free; this one's is the two things a two-button control has that a thirteen-chip row did
// not: a **bound**, which is where ADR 0032's "disabled carrying its reason" finally has to produce
// four different sentences, and a **walk**, because the customer reaches a bound by pressing rather
// than by reading a row.
//
// The property is the one ADR 0035's consequences name: *at every reachable width, each button is
// enabled if and only if the step it offers succeeds.* It is asserted by actually walking, one press
// at a time, through every width the shipped kitchen can reach.
import {
  columnWidthChoices,
  deriveColumns,
  derivePlacementRecords,
  describeSelection,
  insertBody,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  offersFor,
  recomputeVoids,
  removePlacement,
  renderRejection,
  setWidth,
  toMillimetres,
  widthOptionsFor,
  type Column,
  type CommandTarget,
  type Design,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { ro } from "@/content/ro";
import {
  describePanel,
  type ReplaceSection,
  type WidthStepperSection,
} from "@/panel/panel-model";
import { widthStepsFor, WIDTH_STEP_MM } from "@lemnaria/configurator-domain";

import { createFakeBodyProbe } from "../support/fake-body-probe";

const PROBE = createFakeBodyProbe();
const OCCURRED_AT = "2026-08-30T12:00:00.000Z";

/** ADR 0011 Gap D: the extents are frozen from the whole design at load. A resize is the one command
 *  that returns a changed map, so the walk below carries the map forward rather than re-deriving it. */
const SEEDED_COLUMNS = deriveColumns(
  derivePlacementRecords(KITCHEN_L_DESIGN, KITCHEN_L_BODY_CATALOG),
  {},
  KITCHEN_L_DESIGN.room,
);

interface Kitchen {
  readonly design: Design;
  readonly columns: ReadonlyMap<string, Column>;
}

const SEEDED_KITCHEN: Kitchen = {
  design: KITCHEN_L_DESIGN,
  columns: SEEDED_COLUMNS,
};

function worldFrom(kitchen: Kitchen) {
  const records = derivePlacementRecords(
    kitchen.design,
    KITCHEN_L_BODY_CATALOG,
  );
  return {
    design: kitchen.design,
    records,
    columns: kitchen.columns,
    voids: recomputeVoids(records, kitchen.columns),
    catalog: KITCHEN_L_BODY_CATALOG,
  };
}

type World = ReturnType<typeof worldFrom>;

function panelAt(world: World, target: CommandTarget) {
  const engineInput = {
    design: world.design,
    catalog: world.catalog,
    columns: world.columns,
    target,
    probe: PROBE,
  };
  return describePanel({
    meta: describeSelection({ ...world, target }),
    offers: offersFor({ ...world, target }),
    rejection: null,
    widthOptions: widthOptionsFor(engineInput),
    widthSteps: widthStepsFor(engineInput),
    widthRanges:
      columnWidthChoices({
        design: world.design,
        catalog: world.catalog,
        target,
      })?.widthRangesMm ?? [],
    isBodyProbeAttached: true,
    canWrite: true,
    saveStatus: "idle",
  });
}

function stepperAt(world: World, id: string): WidthStepperSection | undefined {
  const panel = panelAt(world, { kind: "placement", id });
  if (panel.kind !== "open") return undefined;
  const section = panel.sections.find(
    (candidate) => candidate.kind === "width",
  );
  return section?.kind === "width" && section.control === "stepper"
    ? section
    : undefined;
}

function replaceAt(world: World, target: CommandTarget): ReplaceSection {
  const panel = panelAt(world, target);
  if (panel.kind !== "open") throw new Error("expected an open panel");
  const section = panel.sections.find(
    (candidate) => candidate.kind === "replace",
  );
  if (section?.kind !== "replace")
    throw new Error(`no replace section on ${target.id}`);
  return section;
}

/** One press, through the real command, carrying the changed column map forward the way the store
 *  does. `undefined` when the command refuses, which the walk treats as the end of that direction. */
function press(
  kitchen: Kitchen,
  id: string,
  widthMm: number,
): Kitchen | undefined {
  const result = setWidth({
    design: kitchen.design,
    catalog: KITCHEN_L_BODY_CATALOG,
    columns: kitchen.columns,
    target: { kind: "placement", id },
    widthMm,
    probe: PROBE,
    occurredAt: OCCURRED_AT,
  });
  if (!result.ok) return undefined;
  // ADR 0011 Gap D: `setWidth` is the one command that returns a changed column map, and the walk
  // has to carry it forward exactly as the store does — re-deriving would shrink every column to
  // what is left in it and the next step would be judged against a kitchen that never existed.
  return { design: result.design, columns: result.effect.columns };
}

// -------------------------------------------------------------------------------------------
// The property, walked rather than read.
// -------------------------------------------------------------------------------------------

/** The bodies the shipped kitchen renders a stepper on and that can actually move — the ten whose
 *  `−50` the sweep in `width-stepper.test.ts` finds enabled. Named rather than discovered, so a walk
 *  that silently stopped visiting one fails here instead of passing over nine. */
const WALKABLE_IDS = [
  "p0",
  "p4",
  "p8",
  "p10",
  "p11",
  "p14",
  "p15",
  "p16",
  "p17",
  "p20",
] as const;

describe("at every reachable width, a button is enabled iff its step succeeds", () => {
  // **ADR 0035's consequences, verbatim: "the `free`/`blocked` property test survives in a stronger
  // form."** 5D asked the question once per body, at the width the fixture happened to ship it at.
  // A stepper is reached by *pressing*, so the question has to be asked again after every press —
  // and the states a customer actually visits are the ones a shrink creates, which no fixture holds.
  //
  // Non-tautological by construction: the panel's answer comes from `widthStepsFor`, and the claim
  // is checked against a **separate** `setWidth` run at the width the rendered button carries. A
  // query that judged a different width than the button offers, or a panel that stopped consulting
  // it, fails here rather than agreeing with itself.
  it.each(WALKABLE_IDS)("holds all the way down from %s's own width", (id) => {
    let kitchen = SEEDED_KITCHEN;
    const visited: number[] = [];

    for (let pressCount = 0; pressCount < 20; pressCount += 1) {
      const world = worldFrom(kitchen);
      const section = stepperAt(world, id);
      if (!section)
        throw new Error(
          `no stepper on ${id} after ${String(pressCount)} presses`,
        );
      // **The fact, not the copy.** This used to parse `valueLabel`, so a copy edit to
      // `ro.panel.widthValue` would have broken the strongest test in the wave for a reason
      // unrelated to the property it asserts (5D2c clean-code review N8).
      const body = world.records.find((record) => record.id === id);
      if (!body) throw new Error(`no record ${id}`);
      visited.push(body.widthMm);

      for (const step of section.steps) {
        const attempt = press(kitchen, id, step.widthMm);
        expect([id, step.widthMm, step.isDisabled]).toEqual([
          id,
          step.widthMm,
          attempt === undefined,
        ]);
      }

      const narrower = section.steps[0];
      if (narrower.isDisabled) break;
      const next = press(kitchen, id, narrower.widthMm);
      if (!next) throw new Error("an enabled button refused the press");
      kitchen = next;
    }

    // The walk did real work and ended at a bound rather than at the loop guard. Every visited width
    // is one step below the last, which is ADR 0035 decision 1's relative stepping observed rather
    // than assumed.
    expect([id, visited.length > 1]).toEqual([id, true]);
    expect([id, visited.length < 20]).toEqual([id, true]);
    expect([id, visited]).toEqual([
      id,
      visited.map((_, index) => (visited[0] ?? 0) - index * WIDTH_STEP_MM),
    ]);
  });
});

// -------------------------------------------------------------------------------------------
// ADR 0032: a button at a bound is disabled CARRYING ITS REASON, and there are four of them.
// -------------------------------------------------------------------------------------------

/** Walks `id` down until the `−50` refuses, and returns the section standing at that floor. */
function walkToFloor(id: string): WidthStepperSection {
  let kitchen = SEEDED_KITCHEN;
  for (let step = 0; step < 20; step += 1) {
    const section = stepperAt(worldFrom(kitchen), id);
    if (!section) throw new Error(`no stepper on ${id}`);
    if (section.steps[0].isDisabled) return section;
    const next = press(kitchen, id, section.steps[0].widthMm);
    if (!next) throw new Error("an enabled button refused the press");
    kitchen = next;
  }
  throw new Error(`${id} never reached a floor`);
}

describe("the four floors and the one ceiling, each said in the engine's own words", () => {
  // **§7's 800 mm ceiling**, which ADR 0035 decision 2 made the bound every cabinetry row carries
  // and decision 5 confirmed for the hood as well ("for hood there should not be any >800 mm width
  // cabinet"). It is reachable at load — `p0`, `p11` and `p17` all stand at 800 — and it is the
  // most-read refusal in the whole stepper, which is why 5D2b's product-logic review R1.1 spent a
  // wave on the sentence: it used to list eleven chips and thereby deny 570, a width the cabinet is
  // genuinely built at.
  it("names the bound as a bound on the `+50` at 800 mm, never as a list", () => {
    const section = stepperAt(worldFrom(SEEDED_KITCHEN), "p11");
    if (!section) throw new Error("no stepper on p11");
    const wider = section.steps[1];
    expect(wider.widthMm).toBe(850);
    expect(wider.isDisabled).toBe(true);
    expect(wider.reason).toBe(
      // **"este într-o coloană care", since 2026-08-30.** This pin was the clearest statement of
      // 5D2c product-logic B1: 560 is the *sink's* floor from this column, and a wall cabinet is
      // built 200-800 — so under the body's name the sentence was false about the very cabinet it
      // named. It now attributes the bound to the column that owns it.
      "„Corp suspendat” este într-o coloană care se face între 560 și 800 mm, iar acum are 800 mm.",
    );
    // The half that was the blocker: a bound is spoken as a bound. "doar în 600 sau 650 sau …"
    // denies every width between the chips, which is materially false of a cabinetry row.
    expect(wider.reason).not.toContain("doar în");
  });

  // **The entry's own floor** (ADR 0017): the sink's 560 mm aperture bounds `A|1.30` from below, and
  // the same sentence carries it — the range's `minMm` is the floor, so one refusal states both ends.
  it("names the sink's own 560 mm aperture on the `−50` that reaches it", () => {
    const section = walkToFloor("p11");
    expect(section.valueLabel).toBe("600 mm");
    expect(section.steps[0].reason).toContain("între 560 și 800 mm");
  });

  // **§2's default floor**, which governs every entry that declares none of its own. `p4`'s
  // three-drawer base floors at 300 and the whole column follows it, which is ADR 0035 decision 2
  // turning ADR 0031 rule 5 into a bound rather than a list.
  it("names §2's 300 mm floor on the `−50` at 300", () => {
    const section = walkToFloor("p4");
    expect(section.valueLabel).toBe("300 mm");
    expect(section.steps[0].reason).toBe(
      "„Corp bază 3 sertare” este într-o coloană care se face între 300 și 800 mm, iar acum are 300 mm.",
    );
  });

  // **The hood's floor, new in wave 5D2b** (ADR 0035 decision 6 as amended 2026-08-29). It has its
  // own rejection code because the sentence has to name the hood: the floor is folded into the
  // column's bound, so `WIDTH_NOT_SUPPORTED` would state a minimum without saying what set it, and
  // the hood is the one thing the customer could delete to unlock the column.
  //
  // Unreachable in the shipped kitchen as loaded — `p2` is `fixedWidth` and freezes `A|2.60`
  // outright — so it is reached the way ADR 0035's 2026-08-30 correction says it is reached: in two
  // ordinary taps. Delete the hob base under the hood, put a resizable base cabinet back in the
  // opening, and the column is resizable with a 600 mm hood over it.
  it("names the hood on the `−50` of a column standing at the hood's width", () => {
    const cleared = removePlacement({
      design: KITCHEN_L_DESIGN,
      catalog: KITCHEN_L_BODY_CATALOG,
      target: { kind: "placement", id: "p2" },
      occurredAt: OCCURRED_AT,
    });
    if (!cleared.ok) throw new Error("could not clear the hob base");
    const opened = worldFrom({
      design: cleared.design,
      columns: SEEDED_COLUMNS,
    });
    const opening = opened.voids[0];
    if (!opening) throw new Error("clearing the hob base opened nothing");

    const filled = insertBody({
      ...opened,
      target: { kind: "void", id: opening.id },
      buildId: "base-3drawer",
      probe: PROBE,
      occurredAt: OCCURRED_AT,
    });
    if (!filled.ok) throw new Error("could not insert under the hood");

    const world = worldFrom({ design: filled.design, columns: SEEDED_COLUMNS });
    const inserted = world.records.find(
      (record) => !opened.records.some((older) => older.id === record.id),
    );
    if (!inserted) throw new Error("no inserted body");

    // Both members of the column say it, each about itself: the base that was just inserted, and
    // `p19`, the wall cabinet standing over it. Neither is the hood, and neither may narrow past it.
    for (const id of [inserted.id, "p19"]) {
      const section = stepperAt(world, id);
      if (!section) throw new Error(`no stepper on ${id}`);
      expect([id, section.steps[0].widthMm]).toEqual([id, 550]);
      expect([id, section.steps[0].isDisabled]).toEqual([id, true]);
      expect(section.steps[0].reason, id).toContain("hota de deasupra");
      expect(section.steps[0].reason, id).toContain("600 mm");
    }
  });

  // The reason is the engine's own sentence rather than a re-wording, asserted against the refusal
  // `setWidth` actually produced (ADR 0032 rule 2). A panel that paraphrased a refusal would read
  // plausibly and fail here.
  it("renders every refusal through the one renderRejection", () => {
    const world = worldFrom(SEEDED_KITCHEN);
    let refusals = 0;
    for (const record of world.records) {
      const section = stepperAt(world, record.id);
      if (!section) continue;
      for (const step of section.steps) {
        const result = setWidth({
          design: world.design,
          catalog: world.catalog,
          columns: world.columns,
          target: { kind: "placement", id: record.id },
          widthMm: step.widthMm,
          probe: PROBE,
          occurredAt: OCCURRED_AT,
        });
        if (result.ok) continue;
        expect([record.id, step.direction, step.reason]).toEqual([
          record.id,
          step.direction,
          renderRejection(result.reason),
        ]);
        refusals += 1;
      }
    }
    expect(refusals).toBe(18);
  });
});

// -------------------------------------------------------------------------------------------
// The two sentences wave 5D2c owes an opening no cabinet fits.
// -------------------------------------------------------------------------------------------

describe("an opening no cabinet fits says so, and does not ask for a delete", () => {
  // **ADR 0035 decision 7 created this state and this wave has to speak to it.** One press of `−50`
  // vacates a 50 mm strip, and until the next press absorbs it that strip is a selectable opening
  // `offersFor` answers with nothing offered. §9's "say what to clear" is wrong advice there: the
  // neighbours are what the strip was taken from, and clearing one gives a *wider* opening, not a
  // usable one at 50 mm.
  //
  // Suppressing the strip was tried in this milestone and reverted — a horizontal floor on void
  // emission also hides the 190–199 mm openings the bottle-cargo refusals are observed in — so the
  // honest answer is copy, and this is it.
  it("tells the customer a strip narrower than any cabinet may be left", () => {
    const section = stepperAt(worldFrom(SEEDED_KITCHEN), "p4");
    if (!section) throw new Error("no stepper on p4");
    const shrunk = press(SEEDED_KITCHEN, "p4", section.steps[0].widthMm);
    if (!shrunk) throw new Error("p4 would not shrink");

    const world = worldFrom(shrunk);
    const strip = world.voids.find((record) => toMillimetres(record.w) === 50);
    if (!strip) throw new Error("the shrink opened no 50 mm strip");

    const replace = replaceAt(world, { kind: "void", id: strip.id });
    expect(replace.rows).toEqual([]);
    expect(replace.emptyLine).toBe(
      "Deschiderea are 50 mm, mai puțin decât cel mai îngust corp din catalog (200 mm). Spațiul poate rămâne gol; se închide pe măsură ce lărgești corpul de lângă el.",
    );
    // The trap this copy exists to avoid, pinned as an anti-assertion: §9's ordinary sentence tells
    // the customer to delete a neighbour, which here makes the opening wider rather than fillable.
    expect(replace.emptyLine).not.toContain("Șterge");
  });

  // **ADR 0037's own paragraph, and the owner's answer to it: "ok to have empty space left."** An
  // opening over §7's 800 mm ceiling fits no cabinet at all, and §9's zero-result rule inverts —
  // clearing a neighbour makes it wider. The shipped kitchen holds no column that wide, so this is a
  // synthetic 950 mm one, the width 5D2a's QA measured as reachable.
  it("tells the customer a span wider than 800 mm may be left, and never says to clear more", () => {
    const design: Design = {
      room: { shape: "L", widthMm: 3600, depthMm: 2400, heightMm: 2600 },
      presetId: null,
      placements: [
        {
          id: "wide",
          wall: "A",
          alongMm: 1000,
          y0Mm: 1500,
          body: { buildId: "wall-2door-600", widthMm: 950, heightMm: 700 },
        },
      ],
      createdAt: OCCURRED_AT,
      updatedAt: OCCURRED_AT,
    };
    const columns = deriveColumns(
      derivePlacementRecords(design, KITCHEN_L_BODY_CATALOG),
      {},
      design.room,
    );
    const cleared = removePlacement({
      design,
      catalog: KITCHEN_L_BODY_CATALOG,
      target: { kind: "placement", id: "wide" },
      occurredAt: OCCURRED_AT,
    });
    if (!cleared.ok) throw new Error("could not clear the wide body");

    const world = worldFrom({ design: cleared.design, columns });
    const opening = world.voids.find(
      (record) => toMillimetres(record.w) === 950,
    );
    if (!opening) throw new Error("no 950 mm opening");

    const replace = replaceAt(world, { kind: "void", id: opening.id });
    expect(replace.rows).toEqual([]);
    expect(replace.emptyLine).toBe(
      "Deschiderea are 950 mm, mai mult decât cel mai lat corp din catalog (800 mm). Niciun corp nu o umple singur, iar ștergerea unui vecin ar lărgi-o și mai mult. Spațiul poate rămâne gol, sau îl poți împărți punând la loc un corp lângă el.",
    );
    expect(replace.emptyLine).not.toContain("Șterge un corp vecin");
  });
});

// -------------------------------------------------------------------------------------------
// The copy, pinned — because this milestone has shipped a false sentence behind a green suite twice.
// -------------------------------------------------------------------------------------------

describe("§9's width copy describes the control that is actually there", () => {
  // **The trap, recorded twice in this milestone.** M4's note said the resize was unavailable and
  // wave 5D made that a lie the day the chips became clickable; 5D2a shipped a refusal listing
  // thirteen widths while denying one the cabinet is built at. Neither was pinned. This is the pin,
  // and it is about the *claim* rather than the wording — a copy edit should not fail it, a
  // reintroduced disclaimer must.
  it("never tells the customer the feature is unavailable", () => {
    for (const note of [ro.panel.widthStepNote, ro.panel.widthChoiceNote]) {
      expect(note).not.toMatch(/nu este (încă )?disponibil/i);
      expect(note).not.toMatch(/în această versiune/i);
    }
  });

  // **The clause 5D's note carried and this wave had to remove.** "Sub 300 mm nu se coboară" is true
  // of most cabinetry and false as a universal: ADR 0026's bottle cargo reaches 200, ADR 0017's sink
  // column floors at 600, and since 5D2b a hood floors its column at its own width. The floor now
  // lives on the disabled `−50`, which states the one that applies to *this* column.
  it("states the step and where the width comes from, without claiming a universal floor", () => {
    expect(ro.panel.widthStepNote).toContain("50");
    expect(ro.panel.widthStepNote).toMatch(/spațiul liber/i);
    expect(ro.panel.widthStepNote).not.toContain("300");
  });

  // The discrete control says why it is discrete without naming a cause it does not always have:
  // `base-bottle-cargo` is cabinetry and discrete for ADR 0026's own reason, so "the appliance fixes
  // it" would be false on it.
  it("does not tell a bottle cargo that an appliance fixed its width", () => {
    expect(ro.panel.widthChoiceNote).not.toMatch(/electrocasnic/i);
  });

  // The note the customer reads is the one the model publishes, asserted through real sections of
  // both kinds — a note changed in `ro.ts` and not wired here would otherwise stay invisible.
  it("is the note each rendered control actually carries", () => {
    const world = worldFrom(SEEDED_KITCHEN);
    const stepper = stepperAt(world, "p0");
    expect(stepper?.note).toBe(ro.panel.widthStepNote);

    const panel = panelAt(world, { kind: "placement", id: "p1" });
    if (panel.kind !== "open") throw new Error("expected an open panel");
    const choice = panel.sections.find(
      (candidate) => candidate.kind === "width",
    );
    if (choice?.kind !== "width" || choice.control !== "choice")
      throw new Error("expected a discrete choice on p1");
    expect(choice.note).toBe(ro.panel.widthChoiceNote);
  });

  // ADR 0035 decision 1's labels, and the accessible name beside them. The button face says the size
  // of the step; the accessible name says what it steps.
  it("labels the two buttons with the step and names what each one does", () => {
    const section = stepperAt(worldFrom(SEEDED_KITCHEN), "p0");
    if (!section) throw new Error("no stepper on p0");
    expect(section.steps.map((step) => [step.label, step.ariaLabel])).toEqual([
      ["−50 mm", "Micșorează lățimea cu 50 mm"],
      ["+50 mm", "Mărește lățimea cu 50 mm"],
    ]);
  });
});

describe("every discrete row is a well-formed set of chips", () => {
  // **The one thing the retired chip tests genuinely lost** (5D2c clean-code review, item 6).
  // `width-chips.adversarial.test.ts` swept every rendered section for *ascending, duplicate-free,
  // exactly one active*. That invariant now survives only by enumeration: the shipped kitchen holds
  // exactly three discrete rows and all three are pinned by value. Fine today, and it stops being
  // fine the moment a fourth exists — with nothing failing when it does.
  //
  // A sweep rather than a fourth pinned row, because what is asserted is a property of the control
  // and not of the kitchen.
  it("renders them ascending, without duplicates, with exactly one active", () => {
    const world = worldFrom(SEEDED_KITCHEN);
    let sweptSections = 0;

    for (const record of world.records) {
      const panel = panelAt(world, { kind: "placement", id: record.id });
      if (panel.kind !== "open") continue;
      const section = panel.sections.find(
        (candidate) => candidate.kind === "width",
      );
      if (section?.kind !== "width" || section.control !== "choice") continue;
      sweptSections += 1;

      const widths = section.chips.map((chip) => chip.widthMm);
      expect([record.id, widths]).toEqual([
        record.id,
        [...widths].sort((a, b) => a - b),
      ]);
      expect([record.id, new Set(widths).size]).toEqual([
        record.id,
        widths.length,
      ]);
      expect([
        record.id,
        section.chips.filter((chip) => chip.state === "active").length,
      ]).toEqual([record.id, 1]);
    }

    // Non-vacuity: a sweep that found no discrete row would pass silently.
    expect(sweptSections).toBeGreaterThan(0);
  });
});
