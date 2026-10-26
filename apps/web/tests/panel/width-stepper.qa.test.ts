import {
  buildableWidthSpanMm,
  cabinetDepthMmOf,
  columnWidthChoices,
  deriveColumns,
  derivePlacementRecords,
  describeSelection,
  entryLabel,
  insertBody,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  offersFor,
  recomputeVoids,
  removePlacement,
  setWidth,
  toMillimetres,
  widthOptionsFor,
  type Column,
  type CommandTarget,
  type Design,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { ro } from "../support/romanian-content";
import {
  describePanel,
  type ReplaceSection,
  type WidthStepperSection,
} from "@/panel/panel-model";
import { widthStepsFor, WIDTH_STEP_MM } from "@lemnaria/configurator-domain";

import { createFakeBodyProbe } from "../support/fake-body-probe";
import { PAL_KITCHEN } from "../support/panel-material";

const PROBE = createFakeBodyProbe();
const OCCURRED_AT = "2026-08-30T12:00:00.000Z";

/** Extents are frozen from the whole design at load (ADR 0011 Gap D); the walk carries the map forward from here. */
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

function panelAt(
  world: World,
  target: CommandTarget,
  direction?: "left" | "right",
) {
  const engineInput = {
    design: world.design,
    catalog: world.catalog,
    columns: world.columns,
    target,
    probe: PROBE,
  };
  return describePanel({
    content: ro,
    ...(direction === undefined ? {} : { direction }),
    material: PAL_KITCHEN,
    meta: describeSelection({ kitchenSettings: {}, ...world, target }),
    offers: offersFor({
      ...world,
      target,
      cabinetDepthMm: cabinetDepthMmOf(world.design),
    }),
    buildableWidthSpanMm: buildableWidthSpanMm(world.catalog),
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

function stepperAt(
  world: World,
  id: string,
  direction?: "left" | "right",
): WidthStepperSection | undefined {
  const panel = panelAt(world, { kind: "placement", id }, direction);
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
  // `setWidth` is the one command that returns a changed column map (ADR 0011 Gap D); re-deriving it would judge the
  // next step against a kitchen that never existed.
  return { design: result.design, columns: result.effect.columns };
}

/** The ten bodies whose `−50` the sweep in `width-stepper.test.ts` finds enabled. Named rather than discovered, so a
 *  walk that silently stopped visiting one fails here. */
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
  // The panel's answer comes from `widthStepsFor` and is checked against a separate `setWidth` run at the width the
  // rendered button carries, so the property cannot agree with itself.
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
      // The fact, not the copy: parsing `valueLabel` would break this test on a copy edit.
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

    // The walk ended at a bound, not at the loop guard, and each width is one step below the last (ADR 0035 decision
    // 1).
    expect([id, visited.length > 1]).toEqual([id, true]);
    expect([id, visited.length < 20]).toEqual([id, true]);
    expect([id, visited]).toEqual([
      id,
      visited.map((_, index) => (visited[0] ?? 0) - index * WIDTH_STEP_MM),
    ]);
  });
});

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

/** ADR 0035's column bound as one sentence shared by three floors and the ceiling; callers give only what varies. */
function columnBoundReason(bound: {
  readonly label: ReturnType<typeof entryLabel>;
  readonly minMm: number;
  readonly maxMm: number;
  readonly availableMm: number;
}): string {
  return ro.rejection({
    code: "WIDTH_NOT_SUPPORTED",
    params: {
      label: bound.label,
      sizesMm: [],
      widthRangesMm: [{ minMm: bound.minMm, maxMm: bound.maxMm }],
      boundScope: "column",
      availableMm: bound.availableMm,
    },
  });
}

describe("the four floors and the one ceiling, each said in the engine's own words", () => {
  // §7's 800 mm ceiling (ADR 0035 decision 2) is reachable at load: `p0`, `p11` and `p17` stand at 800.
  it("names the bound as a bound on the `+50` at 800 mm, never as a list", () => {
    const section = stepperAt(worldFrom(SEEDED_KITCHEN), "p11");
    if (!section) throw new Error("no stepper on p11");
    const wider = section.steps[1];
    expect(wider.widthMm).toBe(850);
    expect(wider.isDisabled).toBe(true);
    // `boundScope: "column"` attributes the bound to the column that owns it; asserting the descriptor fails if the
    // scope reverts to "body" under identical wording.
    expect(wider.reason).toBe(
      columnBoundReason({
        label: entryLabel("wall-cabinet"),
        minMm: 560,
        maxMm: 800,
        availableMm: 800,
      }),
    );
    // A bound is spoken as a bound: the list form would deny every width between the chips, which is false of
    // cabinetry.
    expect(wider.reason).not.toBe(
      ro.rejection({
        code: "WIDTH_NOT_SUPPORTED",
        params: {
          label: entryLabel("wall-cabinet"),
          sizesMm: [560, 800],
          boundScope: "column",
          availableMm: 800,
        },
      }),
    );
  });

  // The entry's own floor (ADR 0017): the sink's 560 mm aperture, stated by the range's `minMm` in the same sentence.
  it("names the sink's own 560 mm aperture on the `−50` that reaches it", () => {
    const section = walkToFloor("p11");
    expect(section.valueLabel).toBe("600 mm");
    expect(section.steps[0].reason).toBe(
      columnBoundReason({
        label: entryLabel("wall-cabinet"),
        minMm: 560,
        maxMm: 800,
        availableMm: 600,
      }),
    );
  });

  // §2's default floor (ADR 0035 decision 2): `p4`'s three-drawer base floors at 300 and the whole column follows it.
  it("names §2's 300 mm floor on the `−50` at 300", () => {
    const section = walkToFloor("p4");
    expect(section.valueLabel).toBe("300 mm");
    expect(section.steps[0].reason).toBe(
      columnBoundReason({
        label: entryLabel("base-3drawer"),
        minMm: 300,
        maxMm: 800,
        availableMm: 300,
      }),
    );
  });

  // The hood has its own rejection code so the sentence names it; `WIDTH_NOT_SUPPORTED` would state a minimum
  // without saying what set it. Unreachable as loaded (`p2` is `fixedWidth`), so it is reached in two taps: delete the
  // hob base, then insert a resizable base cabinet under the hood.
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

    // Both column members say it: the inserted base and `p19`, the wall cabinet above it; neither may narrow past the
    // hood.
    for (const id of [inserted.id, "p19"]) {
      const section = stepperAt(world, id);
      if (!section) throw new Error(`no stepper on ${id}`);
      expect([id, section.steps[0].widthMm]).toEqual([id, 550]);
      expect([id, section.steps[0].isDisabled]).toEqual([id, true]);
      expect(section.steps[0].reason, id).toContain("hota de deasupra");
      expect(section.steps[0].reason, id).toContain("600 mm");
    }
  });
});

describe("an opening no cabinet fits says so in one sentence, with no rows", () => {
  // An opening no cabinet fits shows no rows, only §9's zero-result sentence (ADR 0032 *Superseded*); its bound comes
  // from `buildableWidthSpanMm`. One press of `−50` vacates a selectable 50 mm strip.
  it("names the narrowest cabinet for a strip narrower than any of them", () => {
    const section = stepperAt(worldFrom(SEEDED_KITCHEN), "p4");
    if (!section) throw new Error("no stepper on p4");
    const shrunk = press(SEEDED_KITCHEN, "p4", section.steps[0].widthMm);
    if (!shrunk) throw new Error("p4 would not shrink");

    const world = worldFrom(shrunk);
    const strip = world.voids.find((record) => toMillimetres(record.w) === 50);
    if (!strip) throw new Error("the shrink opened no 50 mm strip");

    const replace = replaceAt(world, { kind: "void", id: strip.id });
    const span = buildableWidthSpanMm(world.catalog);

    expect(replace.rows).toEqual([]);
    expect(replace.countLine).toBeUndefined();
    expect(replace.emptyLine).toBe(
      ro.panel.noOffersTooNarrow(50, span?.minMm ?? -1),
    );
  });

  // A base standing below keeps the column whole, so no cabinet may be seated flush in the part of it that is free.
  it("names the widest cabinet for a span wider than every one of them in a column a standing body keeps whole", () => {
    const design: Design = {
      room: { shape: "L", widthMm: 3600, depthMm: 2400, heightMm: 2600 },
      presetId: null,
      placements: [
        {
          id: "standing-base",
          wall: "A",
          alongMm: 1000,
          y0Mm: 0,
          body: { buildId: "base-cabinet", widthMm: 600, heightMm: 860 },
        },
      ],
      columnExtents: [
        {
          wall: "A",
          alongMm: 1000,
          widthMm: 1200,
          y0Mm: 0,
          topMm: 2600,
          depthMm: 580,
        },
      ],
      createdAt: OCCURRED_AT,
      updatedAt: OCCURRED_AT,
    };
    const columns = deriveColumns(
      derivePlacementRecords(design, KITCHEN_L_BODY_CATALOG),
      design,
      design.room,
    );
    const world = worldFrom({ design, columns });
    const opening = world.voids.find(
      (record) => toMillimetres(record.w) === 1200,
    );
    if (!opening) throw new Error("no 1200 mm opening");

    const replace = replaceAt(world, { kind: "void", id: opening.id });
    const span = buildableWidthSpanMm(world.catalog);

    expect(replace.rows).toEqual([]);
    expect(replace.countLine).toBeUndefined();
    expect(replace.emptyLine).toBe(
      ro.panel.noOffersTooWide(1200, span?.maxMm ?? -1),
    );
  });
});

describe("a span wider than every cabinet offers each one that fits at its widest, and counts them (8U criterion 10)", () => {
  // The shipped kitchen holds no column over 800 mm, so this one is a synthetic 950 mm wall row.
  it("lists the wall rows the insert builds at 800 mm in a 950 mm span, under a count line derived from them", () => {
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

    const target = { kind: "void", id: opening.id } as const;
    const built = [...world.catalog.keys()].flatMap((buildId) => {
      const result = insertBody({
        design: world.design,
        catalog: world.catalog,
        columns: world.columns,
        voids: world.voids,
        target,
        buildId,
        probe: PROBE,
        occurredAt: OCCURRED_AT,
      });
      return result.ok
        ? [{ buildId, widthMm: result.design.placements.at(-1)?.body.widthMm }]
        : [];
    });
    const replace = replaceAt(world, target);

    expect(built.length).toBeGreaterThan(0);
    expect(built.map((entry) => entry.widthMm)).toEqual(
      built.map(() => buildableWidthSpanMm(world.catalog)?.maxMm),
    );
    expect(replace.rows.map((row) => row.buildId)).toEqual(
      built.map((entry) => entry.buildId),
    );
    expect(replace.countLine).toBe(
      ro.panel.countForSlot(built.length, 950, 700),
    );
    expect(replace.emptyLine).toBeUndefined();
  });
});

describe("§9's width copy describes the control that is actually there", () => {
  // A reintroduced unavailability disclaimer must fail here. The patterns are deliberate Romanian literals: they are
  // negative claims about the source wording, which a catalogue read cannot express.
  it("never tells the customer the feature is unavailable", () => {
    for (const note of [ro.panel.widthStepNote, ro.panel.widthChoiceNote]) {
      // eslint-disable-next-line no-restricted-syntax -- 6B-j allow-list: a negative claim about the source wording: a reintroduced unavailability disclaimer must fail here.
      expect(note).not.toMatch(/nu este (încă )?disponibil/i);
      // eslint-disable-next-line no-restricted-syntax -- 6B-j allow-list: the second negative claim of the same pin.
      expect(note).not.toMatch(/în această versiune/i);
    }
  });

  // "Sub 300 mm nu se coboară" is false as a universal: floors vary per column and live on the disabled `−50`.
  // `/spațiului liber/i` is a positive claim kept as a literal because reading the leaf back would be a tautology; it
  // matches the one noun phrase the claim cannot lose.
  it("states the step and where the width comes from, without claiming a universal floor", () => {
    expect(ro.panel.widthStepNote).toContain("50");
    // eslint-disable-next-line no-restricted-syntax -- 6B-j allow-list: a positive claim that the note keeps naming the free space, matched on the one noun phrase it cannot lose — the note above records why it is not a tautology.
    expect(ro.panel.widthStepNote).toMatch(/spațiului liber/i);
    expect(ro.panel.widthStepNote).not.toContain("300");
  });

  // `base-bottle-cargo` is cabinetry and discrete for ADR 0026's own reason, so "the appliance fixes it" would be
  // false.
  it("does not tell a bottle cargo that an appliance fixed its width", () => {
    expect(ro.panel.widthChoiceNote).not.toMatch(/electrocasnic/i);
  });

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

  // ADR 0129 D8: a right-hand room reads the reflected sentence; an absent direction means left (D2).
  it("reads the reflected widthStepNote on a right-hand room, on wall A", () => {
    const world = worldFrom(SEEDED_KITCHEN);

    const left = stepperAt(world, "p0", "left");
    const right = stepperAt(world, "p0", "right");
    const omitted = stepperAt(world, "p0");

    expect(left?.note).toBe(ro.panel.widthStepNote);
    expect(right?.note).toBe(ro.panel.widthStepNoteRight);
    expect(right?.note).not.toBe(left?.note);
    expect(omitted?.note).toBe(left?.note);
  });

  // Wall B's crossing is the opposite of wall A's (`crossesOnScreen` in `content.ts`), so the reflected note reads on a
  // left-hand wall-B stepper.
  it("reads the reflected widthStepNote on a left-hand room, on wall B", () => {
    const world = worldFrom(SEEDED_KITCHEN);
    const wallBStepperId = [
      "p5",
      "p6",
      "p7",
      "p9",
      "p21",
      "p22",
      "p23",
      "p24",
      "p26",
    ].find((id) => stepperAt(world, id, "left") !== undefined);
    if (!wallBStepperId)
      throw new Error("no stepped wall B body in the seeded kitchen");

    const left = stepperAt(world, wallBStepperId, "left");
    const right = stepperAt(world, wallBStepperId, "right");

    expect(left?.note).toBe(ro.panel.widthStepNoteRight);
    expect(right?.note).toBe(ro.panel.widthStepNote);
    expect(right?.note).not.toBe(left?.note);
  });

  it("labels the two buttons with the step and names what each one does", () => {
    const section = stepperAt(worldFrom(SEEDED_KITCHEN), "p0");
    if (!section) throw new Error("no stepper on p0");
    expect(section.steps.map((step) => [step.label, step.ariaLabel])).toEqual([
      [
        ro.panel.widthStepLabels.narrower,
        ro.panel.widthStepAriaLabels.narrower,
      ],
      [ro.panel.widthStepLabels.wider, ro.panel.widthStepAriaLabels.wider],
    ]);
    // Not vacuous: the two buttons must not have swapped, and the face must not be the name.
    expect(ro.panel.widthStepLabels.narrower).not.toBe(
      ro.panel.widthStepLabels.wider,
    );
    expect(ro.panel.widthStepAriaLabels.narrower).not.toBe(
      ro.panel.widthStepLabels.narrower,
    );
  });
});

describe("every discrete row is a well-formed set of chips", () => {
  // Swept because the shipped kitchen's three discrete rows are pinned only by enumeration; a fourth would go
  // unchecked.
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
