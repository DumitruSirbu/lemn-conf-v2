// Adversarial QA on M5B wave 5B5 / ADR 0049, panel half: the `meta.canWidth` gate is gone from
// `collectOfferedSections`, and the domain's published options are now the sole author of whether a
// `LĂȚIME` section exists.
//
// That is a widened contract, and the risk it carries is a section appearing where one should not.
// The implementer's suite pins five ids and a seeded list; this sweeps **every selection the store
// can be in** — every placement and every void, on the shipped design and on three designs reached
// by the customer's own taps — and asserts the section's existence against the domain's answer
// rather than against a list.
//
// Criterion 2 has no renderer to click in (M4 wave 4A: this suite has no jsdom). What it has instead
// is the store, so the last describe drives the action the click would have driven and shows exactly
// what the `disabled` attribute is holding back.
import {
  columnWidthChoices,
  deriveColumns,
  derivePlacementRecords,
  describeSelection,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  offersFor,
  recomputeVoids,
  widthOptionsFor,
  widthStepsFor,
  type CommandTarget,
  type Design,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { ro } from "@/content/ro";
import { describePanel, type WidthSection } from "@/panel/panel-model";
import {
  createConfiguratorStore,
  type ConfiguratorState,
} from "@/store/configurator-store";

import { createFakeBodyProbe } from "../support/fake-body-probe";

const PROBE = createFakeBodyProbe();
const OCCURRED_AT = "2026-08-30T12:00:00.000Z";

/** ADR 0011 Gap D: columns are load-time state, frozen from the whole design. Every world below
 *  derives its own, so a design reached by deleting three bodies keeps the openings the delete
 *  freed rather than collapsing them. */
function worldFrom(design: Design) {
  const records = derivePlacementRecords(design, KITCHEN_L_BODY_CATALOG);
  const columns = deriveColumns(
    derivePlacementRecords(KITCHEN_L_DESIGN, KITCHEN_L_BODY_CATALOG),
  );
  return {
    design,
    catalog: KITCHEN_L_BODY_CATALOG,
    records,
    columns,
    voids: recomputeVoids(records, columns),
  };
}

type World = ReturnType<typeof worldFrom>;

/** The whole path `use-panel-view.ts` runs, with nothing stubbed: both width queries and the ranges
 *  come from the engine, and the panel renders what they answered. */
function panelAt(world: World, target: CommandTarget, canWrite = true) {
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
    canWrite,
    saveStatus: "idle",
  });
}

function widthSectionAt(
  world: World,
  target: CommandTarget,
  canWrite = true,
): WidthSection | undefined {
  const panel = panelAt(world, target, canWrite);
  if (panel.kind !== "open") return undefined;
  const section = panel.sections.find(
    (candidate) => candidate.kind === "width",
  );
  return section?.kind === "width" ? section : undefined;
}

function everyTarget(world: World): CommandTarget[] {
  return [
    ...world.records.map(
      (record) => ({ kind: "placement", id: record.id }) as const,
    ),
    ...world.voids.map((record) => ({ kind: "void", id: record.id }) as const),
  ];
}

// -------------------------------------------------------------------------------------------
// The designs a customer can actually be looking at, not only the seeded one.
// -------------------------------------------------------------------------------------------

function storeFor(design: Design = KITCHEN_L_DESIGN) {
  return createConfiguratorStore({
    design,
    catalog: KITCHEN_L_BODY_CATALOG,
    now: () => OCCURRED_AT,
    bodyProbe: createFakeBodyProbe(),
  });
}

type Store = ReturnType<typeof storeFor>;

function removeById(store: Store, placementId: string) {
  store.getState().select({ kind: "placement", id: placementId });
  store.getState().remove();
}

/** `A|2.00` emptied through the store's own delete — report item 9's own sequence ("removed a tall
 *  cabinet and inserted a regular one in its place") is a delete followed by a selection, and it is
 *  the state that produced the vanished section. */
function emptiedColumnDesign(): Design {
  const store = storeFor();
  for (const id of ["p1", "p12", "p18"]) removeById(store, id);
  return store.getState().design;
}

/** A design that has already been resized once, so the sweep is not only looking at load-time
 *  widths — a resized column re-files its members and is the one operation that moves them. */
function resizedDesign(): Design {
  const store = storeFor(emptiedColumnDesign());
  store.getState().select({ kind: "placement", id: "p11" });
  store.getState().setWidth(750);
  return store.getState().design;
}

const WORLDS: readonly (readonly [string, () => World])[] = [
  ["the shipped kitchen", () => worldFrom(KITCHEN_L_DESIGN)],
  ["a kitchen with an emptied column", () => worldFrom(emptiedColumnDesign())],
  ["a kitchen already resized once", () => worldFrom(resizedDesign())],
];

// -------------------------------------------------------------------------------------------
// The widened contract: what may now gain a section, and what still may not.
// -------------------------------------------------------------------------------------------

describe("the section exists exactly where the domain published widths", () => {
  it.each(WORLDS)(
    "renders LĂȚIME iff widthOptionsFor is non-empty, across every selection in %s",
    (_name, build) => {
      const world = build();
      const disagreements: string[] = [];
      let withSection = 0;

      for (const target of everyTarget(world)) {
        const published = widthOptionsFor({
          design: world.design,
          catalog: world.catalog,
          columns: world.columns,
          target,
          probe: PROBE,
        });
        const section = widthSectionAt(world, target);
        if ((section !== undefined) !== published.length > 0) {
          disagreements.push(
            `${target.kind}:${target.id} published=${String(published.length)} section=${String(section !== undefined)}`,
          );
        }
        if (section) withSection += 1;
      }

      expect(disagreements).toEqual([]);
      // Non-vacuity: the sweep has to have seen both answers, or it proves nothing about either.
      expect(withSection).toBeGreaterThan(0);
      expect(withSection).toBeLessThan(everyTarget(world).length);
    },
  );

  /** §9's *"empty voids hide Finisaj, Mâner, Lățime"*, which ADR 0049 leaves untouched and which the
   *  removed `meta.canWidth` gate used to be one of two things enforcing. The remaining author is
   *  the domain, so this asks the question through the real path on every void the three designs
   *  hold rather than at the panel's own seam. */
  it.each(WORLDS)(
    "gives no width section to any void in %s",
    (_name, build) => {
      const world = build();
      const voids = world.voids;
      for (const record of voids) {
        const target = { kind: "void", id: record.id } as const;
        expect([record.id, widthSectionAt(world, target)]).toEqual([
          record.id,
          undefined,
        ]);
      }
      // The emptied and resized designs must actually hold voids, or this asserts nothing at all.
      expect(voids.length).toBeGreaterThanOrEqual(0);
    },
  );

  it("holds voids in the designs the sweep above relies on", () => {
    expect(worldFrom(emptiedColumnDesign()).voids.length).toBeGreaterThan(0);
    expect(worldFrom(resizedDesign()).voids.length).toBeGreaterThan(0);
  });

  /** §11 row 16, and the one section the width section could have displaced. `collectSections`
   *  renders the structural explanation only when the offered list is **empty**, so a corner that
   *  gained a width section would silently lose the sentence that explains it is a corner. */
  it.each(WORLDS)(
    "still explains a corner rather than sizing it, in %s",
    (_name, build) => {
      const world = build();
      let corners = 0;
      for (const record of world.records) {
        const target = { kind: "placement", id: record.id } as const;
        const panel = panelAt(world, target);
        if (panel.kind !== "open") continue;
        const structural = panel.sections.find(
          (section) => section.kind === "structural",
        );
        if (!structural) continue;
        expect([record.id, widthSectionAt(world, target)]).toEqual([
          record.id,
          undefined,
        ]);
        corners += 1;
      }
      expect(corners).toBe(4);
    },
  );
});

// -------------------------------------------------------------------------------------------
// What the fixed-width section is, on every body that has one.
// -------------------------------------------------------------------------------------------

describe("a fixed-width section is one active chip that nothing can enable", () => {
  it.each(WORLDS)(
    "gives every unresizable body one disabled active chip with a reason, in %s",
    (_name, build) => {
      const world = build();
      let bodies = 0;

      for (const record of world.records) {
        if (!record.fixedWidth) continue;
        const target = { kind: "placement", id: record.id } as const;
        const section = widthSectionAt(world, target);
        if (!section) continue;

        if (section.control !== "choice") {
          throw new Error(`${record.id} got a ${section.control}`);
        }
        expect([
          record.id,
          section.chips.map((chip) => [
            chip.widthMm,
            chip.state,
            chip.isDisabled,
            chip.reason !== undefined,
          ]),
        ]).toEqual([record.id, [[record.widthMm, "active", true, true]]]);
        // §9 puts the active chip's number in the value label, and the two are read from different
        // places — the chip from the domain's option, the label from `meta.widthMm`.
        expect([record.id, section.valueLabel]).toEqual([
          record.id,
          ro.panel.widthValue(record.widthMm),
        ]);
        bodies += 1;
      }

      // Four, not five: ADR 0048 took the seeded pantry `p6` off the `fixedWidth` list, so it
      // renders the 400–800 stepper instead of a single active chip. The four that remain are each
      // fixed by an appliance.
      expect(bodies).toBe(4);
    },
  );

  /** **The state is what makes the chip unclickable, and it is `active` in both editabilities.**
   *  `isWidthChipDisabled` enables exactly `free`, so a fixed chip that ever reported `free` would
   *  be clickable in a writable panel. Asked in both modes, because read-only is applied first and
   *  could otherwise be the only reason the assertion above passes. */
  it.each([true, false])(
    "never publishes a free chip, with canWrite=%s",
    (canWrite) => {
      const world = worldFrom(KITCHEN_L_DESIGN);
      let chips = 0;
      for (const record of world.records) {
        if (!record.fixedWidth) continue;
        const section = widthSectionAt(
          world,
          { kind: "placement", id: record.id },
          canWrite,
        );
        if (section?.control !== "choice") continue;
        for (const chip of section.chips) {
          expect([record.id, chip.state, chip.isDisabled]).toEqual([
            record.id,
            "active",
            true,
          ]);
          chips += 1;
        }
      }
      expect(chips).toBe(4);
    },
  );

  /** A locked panel replaces the engine's sentence with its own on every chip including `active`
   *  (`panel-model.ts`' own note), so the fixed chip must not be the one that leaks the width
   *  vocabulary into a browser that cannot write. */
  it("replaces the engine's reason with the panel's when the panel is read-only", () => {
    const world = worldFrom(KITCHEN_L_DESIGN);
    const section = widthSectionAt(
      world,
      { kind: "placement", id: "p2" },
      false,
    );
    if (section?.control !== "choice") throw new Error("expected chips");
    const reason = section.chips[0]?.reason;
    expect(reason).toBeDefined();
    expect(reason).not.toContain("lățimea");
  });

  /** The section is a section, not a banner. §9's rejection banner is a separate section fed by the
   *  store's `lastRejection`, and simply selecting a fixed-width cabinet must not raise one —
   *  criterion 2's "produces no rejection banner" begins before any click. */
  it("raises no rejection section merely by being selected", () => {
    const panel = panelAt(worldFrom(KITCHEN_L_DESIGN), {
      kind: "placement",
      id: "p2",
    });
    if (panel.kind !== "open") throw new Error("expected an open panel");
    expect(
      panel.sections.filter((section) => section.kind === "rejection"),
    ).toEqual([]);
  });
});

// -------------------------------------------------------------------------------------------
// Criterion 2, as far as a suite with no renderer can take it — and what it is holding back.
// -------------------------------------------------------------------------------------------

const UNTOUCHED_BY_A_REFUSAL = [
  "design",
  "records",
  "columns",
  "voids",
  "selection",
] as const;

function snapshotOf(state: ConfiguratorState) {
  return UNTOUCHED_BY_A_REFUSAL.map((key) => state[key]);
}

/** **This is the coverage gap made explicit rather than papered over.** `WidthChoiceView` renders a
 *  native `<button disabled={chip.isDisabled}>` whose only handler is `onClick`, and a disabled
 *  button takes neither a pointer activation nor a keyboard one — so the chip above cannot reach
 *  this action. What it *would* reach is asserted here, on the store, so the value of the `disabled`
 *  attribute is a measured fact and not an assumption: the command refuses, and the refusal is a
 *  banner. The literal click belongs in `tests/e2e/editor-panel.e2e.spec.ts`, which is the only
 *  suite in this app that has a DOM. */
describe("what the disabled chip is holding back, driven through the store", () => {
  it.each([600, 550, 650, 800, 300])(
    "refuses %s on the hob base and changes nothing, whichever width reached it",
    (widthMm) => {
      const store = storeFor();
      store.getState().select({ kind: "placement", id: "p2" });
      const before = snapshotOf(store.getState());

      store.getState().setWidth(widthMm);

      expect(snapshotOf(store.getState())).toEqual(before);
      expect(store.getState().lastRejection).not.toBeNull();
    },
  );

  it.each(["p2", "p5", "p6", "p7", "p13"])(
    "refuses the very width its own chip publishes, on %s",
    (id) => {
      const store = storeFor();
      const record = store
        .getState()
        .records.find((candidate) => candidate.id === id);
      if (!record) throw new Error(`no record ${id}`);
      store.getState().select({ kind: "placement", id });
      const before = snapshotOf(store.getState());

      store.getState().setWidth(record.widthMm);

      expect(snapshotOf(store.getState())).toEqual(before);
      expect(store.getState().lastRejection).not.toBeNull();
    },
  );
});
