// Adversarial QA on M5 wave 5D's `widthOptionsFor` (ADR 0034).
//
// The implementer's suite proves the query agrees with `setWidth` **on the widths it publishes**.
// The claim ADR 0034 actually makes is stronger and has a second direction: a chip is free *if and
// only if* the command would succeed, which also forbids a width the command accepts and the row
// never mentions. That direction cannot be checked by iterating the row, so everything here sweeps
// widths the row does **not** contain as well.
//
// The rest is the ground a per-fixture table misses: an unaligned column, an odd-parity width, a
// design that has already been resized once, purity and determinism, and the three shapes that must
// produce no section at all.
import { describe, expect, it } from "vitest";

import { setWidth } from "../../src/commands/set-width.js";
import type { Design, DesignPlacement } from "../../src/design.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import {
  widthOptionsFor,
  type WidthOption,
} from "../../src/queries/width-options.js";
import type { BodyCatalog } from "../../src/void-engine.js";
import { clearBodies, OCCURRED_AT } from "../support/commands.js";
import { createFakeProbe } from "../support/fake-probe.js";
import {
  advanceWithColumns,
  createWorld,
  type KitchenWorld,
} from "../support/kitchen-world.js";
import { syntheticWorld } from "../support/synthetic-world.js";

function kitchen(): KitchenWorld {
  return createWorld(KITCHEN_L_DESIGN, KITCHEN_L_BODY_CATALOG);
}

/** `A|2.00` emptied through the real delete — the only shipped fixture in which any chip is free. */
function kitchenWithEmptyColumn(): KitchenWorld {
  return clearBodies(kitchen(), ["p1", "p12", "p18"]);
}

function optionsFor(world: KitchenWorld, placementId: string): WidthOption[] {
  return widthOptionsFor({
    design: world.design,
    catalog: world.catalog,
    columns: world.columns,
    target: { kind: "placement", id: placementId },
    probe: createFakeProbe(),
  });
}

function commandAccepts(
  world: KitchenWorld,
  placementId: string,
  widthMm: number,
): boolean {
  return setWidth({
    design: world.design,
    catalog: world.catalog,
    columns: world.columns,
    target: { kind: "placement", id: placementId },
    widthMm,
    probe: createFakeProbe(),
    occurredAt: OCCURRED_AT,
  }).ok;
}

function placementAt(
  id: string,
  alongMm: number,
  widthMm: number,
  buildId = "base-panbank",
): DesignPlacement {
  return {
    id,
    wall: "A",
    alongMm,
    y0Mm: 0,
    body: { buildId, widthMm, heightMm: 860 },
  };
}

function catalogWith(
  buildId: string,
  overrides: Partial<NonNullable<ReturnType<BodyCatalog["get"]>>>,
): BodyCatalog {
  const base = KITCHEN_L_BODY_CATALOG.get(buildId);
  if (!base) throw new Error(`no catalogue entry ${buildId}`);
  return new Map(KITCHEN_L_BODY_CATALOG).set(buildId, {
    ...base,
    ...overrides,
  });
}

/** Wider than any catalogue set, on whole millimetres and on the odd ones between them: the sweep
 *  has to be able to find a width the command accepts that the row never offered, and such a width
 *  would by definition not be in any list a test could copy from production. */
const SWEPT_WIDTHS_MM: readonly number[] = (() => {
  const widths = new Set<number>();
  for (let widthMm = 100; widthMm <= 1200; widthMm += 5) widths.add(widthMm);
  for (const anchor of [200, 300, 400, 450, 500, 560, 600, 700, 800, 900]) {
    for (const offset of [-1, 0, 1]) widths.add(anchor + offset);
  }
  return [...widths].sort((left, right) => left - right);
})();

describe("the iff, in the direction iterating the row cannot see", () => {
  // **The under-offer direction.** ADR 0034's Context names it as one of the two defects the wave
  // closes — `A|3.20` accepted 300 and the panel did not offer it — so a test that only walks the
  // published row would have read green through exactly the bug the wave exists to fix.
  it.each([
    ["the shipped kitchen", kitchen, 0],
    ["a kitchen with an emptied column", kitchenWithEmptyColumn, 3],
  ])(
    "publishes an available chip for every width the command accepts, in %s",
    (_name, build: () => KitchenWorld, expectedAccepted: number) => {
      const world = build();
      const missing: string[] = [];
      let accepted = 0;
      for (const record of world.records) {
        const offered = new Map(
          optionsFor(world, record.id).map((option) => [
            option.widthMm,
            option.verdict.status,
          ]),
        );
        for (const widthMm of SWEPT_WIDTHS_MM) {
          if (!commandAccepts(world, record.id, widthMm)) continue;
          accepted += 1;
          if (offered.get(widthMm) !== "available") {
            missing.push(
              `${record.id}@${String(widthMm)} → ${offered.get(widthMm) ?? "no chip"}`,
            );
          }
        }
      }
      expect(missing).toEqual([]);
      // The acceptance count, pinned per world rather than floored: the shipped kitchen abuts no
      // empty column and accepts nothing, and the emptied one accepts the three taps ADR 0034
      // names. A floor of zero here would have let the sweep pass while finding nothing to compare.
      expect(accepted).toBe(expectedAccepted);
    },
  );

  // The over-offer direction, restated over a swept range rather than over the row: nothing the row
  // calls `available` may be refused, and nothing it calls `refused` may be accepted.
  it("never calls a width available that the command refuses", () => {
    const world = kitchenWithEmptyColumn();
    const disagreements: string[] = [];
    for (const record of world.records) {
      for (const option of optionsFor(world, record.id)) {
        if (option.verdict.status === "current") continue;
        const accepts = commandAccepts(world, record.id, option.widthMm);
        if (accepts !== (option.verdict.status === "available")) {
          disagreements.push(
            `${record.id}@${String(option.widthMm)} says ${option.verdict.status}, command says ${String(accepts)}`,
          );
        }
      }
    }
    expect(disagreements).toEqual([]);
  });
});

describe("exactly one active chip, on every body that renders a section", () => {
  /** Every shape of column the engine can be standing in when the panel opens. Each is asked the
   *  same question, because §9's "one active chip" is not contingent on how far the command gets. */
  function worlds(): readonly [string, KitchenWorld][] {
    const resized = (() => {
      const world = kitchenWithEmptyColumn();
      const result = setWidth({
        design: world.design,
        catalog: world.catalog,
        columns: world.columns,
        target: { kind: "placement", id: "p11" },
        widthMm: 600,
        probe: createFakeProbe(),
        occurredAt: OCCURRED_AT,
      });
      if (!result.ok)
        throw new Error(`fixture resize refused: ${result.reason.code}`);
      return advanceWithColumns(world, result.design, result.effect.columns);
    })();
    return [
      ["as shipped", kitchen()],
      ["with a column emptied", kitchenWithEmptyColumn()],
      ["after one resize has already been applied", resized],
      ["with a column holding two widths", unalignedColumnWorld()],
    ];
  }

  it.each(worlds())("holds %s", (_name, world: KitchenWorld) => {
    let sections = 0;
    for (const record of world.records) {
      const options = optionsFor(world, record.id);
      if (options.length === 0) continue;
      sections += 1;
      const current = options.filter(
        (option) => option.verdict.status === "current",
      );
      expect([record.id, current.map((option) => option.widthMm)]).toEqual([
        record.id,
        [record.widthMm],
      ]);
    }
    expect(sections).toBeGreaterThan(0);
  });
});

/** A column holding a 400 mm body under a 600 mm one — reachable with one ordinary insert, and the
 *  shape `resolveColumnExtent` refuses. Every width is refused before the requested one is even
 *  looked at, which is precisely where reading `active` out of a refusal code would lose it. */
function unalignedColumnWorld(): KitchenWorld {
  return syntheticWorld([
    placementAt("wide", 1000, 600),
    {
      ...placementAt("narrow", 1000, 400),
      y0Mm: 1500,
      body: { buildId: "wall-cabinet", widthMm: 400, heightMm: 700 },
    },
  ]);
}

describe("a column whose members are not flush", () => {
  it("still renders a row, every chip refused with the engine's own reason", () => {
    const world = unalignedColumnWorld();
    const options = optionsFor(world, "wide");
    expect(options.length).toBeGreaterThan(1);
    const refusals = options
      .filter((option) => option.verdict.status === "refused")
      .map((option) =>
        option.verdict.status === "refused" ? option.verdict.reason.code : "",
      );
    expect(new Set(refusals)).toEqual(new Set(["COLUMN_MEMBERS_UNALIGNED"]));
  });

  // The two members stand at different widths, so each reads its **own** active chip — the fact is
  // about the body, and a column-level answer would put the active chip on the wrong one.
  it("gives each member its own active chip", () => {
    const world = unalignedColumnWorld();
    for (const [id, widthMm] of [
      ["wide", 600],
      ["narrow", 400],
    ] as const) {
      const current = optionsFor(world, id).find(
        (option) => option.verdict.status === "current",
      );
      expect([id, current?.widthMm]).toEqual([id, widthMm]);
    }
  });
});

describe("an odd-parity width is refused, never offered", () => {
  /** Two 600 mm columns, the right one emptied, and a catalogue that lists an odd width. §2 stores
   *  `alongMm` as an integer and half of an odd delta is not one, so `NON_INTEGER_MILLIMETRES` is
   *  the refusal — a width that is otherwise perfectly legal for every member of the column. */
  function oddWidthWorld(): KitchenWorld {
    const catalog = catalogWith("base-panbank", {
      sizesMm: [400, 555, 600, 800],
      sizesAreStandardLadder: false,
    });
    const design: Design = {
      room: { shape: "L", widthMm: 3600, depthMm: 2400, heightMm: 2600 },
      presetId: null,
      placements: [
        placementAt("left", 1000, 600),
        placementAt("right", 1600, 600),
      ],
      createdAt: OCCURRED_AT,
      updatedAt: OCCURRED_AT,
    };
    return clearBodies(createWorld(design, catalog), ["right"]);
  }

  it("offers the odd width as a blocked chip carrying NON_INTEGER_MILLIMETRES", () => {
    const world = oddWidthWorld();
    const odd = optionsFor(world, "left").find(
      (option) => option.widthMm === 555,
    );
    expect(odd?.verdict.status).toBe("refused");
    if (odd?.verdict.status !== "refused") return;
    expect(odd.verdict.reason.code).toBe("NON_INTEGER_MILLIMETRES");
    expect(commandAccepts(world, "left", 555)).toBe(false);
  });

  // Non-vacuity: the same column reaches even widths freely, so 555's refusal is about its parity
  // and not about the fixture having nowhere to grow.
  it("accepts the even widths beside it, so the refusal is about the parity", () => {
    const world = oddWidthWorld();
    const free = optionsFor(world, "left")
      .filter((option) => option.verdict.status === "available")
      .map((option) => option.widthMm);
    expect(free).toEqual([400, 800]);
  });
});

describe("no section at all, and the ways to get there", () => {
  it.each(["p2", "p5", "p6", "p7", "p13"])(
    "publishes nothing for the fixedWidth body %s, which resolves a perfectly good set",
    (id) => {
      const world = kitchen();
      expect(optionsFor(world, id)).toEqual([]);
    },
  );

  it("publishes nothing when the resolved entry's floor empties its set", () => {
    const world = createWorld(
      KITCHEN_L_DESIGN,
      catalogWith("wall-cabinet", { minWidthMm: 900 }),
    );
    expect(optionsFor(world, "p8")).toEqual([]);
  });

  it.each(["", "p8 ", "P8", "no-such-placement"])(
    "publishes nothing for the unresolvable target %o",
    (id) => {
      expect(optionsFor(kitchen(), id)).toEqual([]);
    },
  );
});

describe("asking is not editing, and asking twice gives the same answer", () => {
  it("mutates neither the design, the records nor the frozen column map", () => {
    const world = kitchenWithEmptyColumn();
    const design = JSON.stringify(world.design);
    const records = JSON.stringify(world.records);
    const columnKeys = [...world.columns.keys()];
    const columns = JSON.stringify([...world.columns.values()]);

    for (const record of world.records) optionsFor(world, record.id);

    expect(JSON.stringify(world.design)).toBe(design);
    expect(JSON.stringify(world.records)).toBe(records);
    expect([...world.columns.keys()]).toEqual(columnKeys);
    expect(JSON.stringify([...world.columns.values()])).toBe(columns);
  });

  // Determinism, and independence from call order: the panel memoises on its inputs, so a query
  // that answered differently on a second call would leave the chips whatever the last render made
  // them.
  it("answers identically on a second call, and in reverse order", () => {
    const world = kitchenWithEmptyColumn();
    const first = world.records.map((record) => optionsFor(world, record.id));
    const reversed = [...world.records]
      .reverse()
      .map((record) => optionsFor(world, record.id))
      .reverse();
    expect(reversed).toEqual(first);
  });
});

describe("a refused chip carries the engine's refusal unchanged", () => {
  // The implementer's suite checks one body. This checks every refused chip in the kitchen, code and
  // params alike — a query that re-derived a reason would agree on the common codes and diverge on
  // the ones that carry a member's label or a size list.
  it("matches the command's code and params on every refused chip in the kitchen", () => {
    const world = kitchen();
    let refusals = 0;
    for (const record of world.records) {
      for (const option of optionsFor(world, record.id)) {
        if (option.verdict.status !== "refused") continue;
        const command = setWidth({
          design: world.design,
          catalog: world.catalog,
          columns: world.columns,
          target: { kind: "placement", id: record.id },
          widthMm: option.widthMm,
          probe: createFakeProbe(),
          occurredAt: OCCURRED_AT,
        });
        expect([record.id, option.widthMm, command.ok]).toEqual([
          record.id,
          option.widthMm,
          false,
        ]);
        if (command.ok) continue;
        expect([record.id, option.widthMm, option.verdict.reason]).toEqual([
          record.id,
          option.widthMm,
          command.reason,
        ]);
        refusals += 1;
      }
    }
    expect(refusals).toBe(45);
  });
});

describe("the column that refuses before it looks at the width", () => {
  // `A|2.60` holds the hob base `p2` and the hood `p13` beside the wall cabinet `p19`, and both are
  // `fixedWidth`. So `p19`'s row is refused by `COLUMN_MEMBER_NOT_RESIZABLE` — a fact about its
  // neighbours, decided before the requested width is looked at and long before empty space is
  // scanned for. This is the exact path on which reading `active` out of `WIDTH_UNCHANGED` would
  // leave the section with no active chip, so the code is pinned rather than left as prose.
  it("refuses p19 for its immovable column-mates, and still marks its own width current", () => {
    const options = optionsFor(kitchen(), "p19");
    const codes = options.map((option) =>
      option.verdict.status === "refused"
        ? option.verdict.reason.code
        : "current",
    );
    expect(new Set(codes)).toEqual(
      new Set(["current", "COLUMN_MEMBER_NOT_RESIZABLE"]),
    );
    expect(
      options.find((option) => option.verdict.status === "current")?.widthMm,
    ).toBe(600);
  });

  // The fallback `columnWidthChoices` takes when the column cannot be resolved: the selected body's
  // own set, so the customer still sees the widths their cabinet is made in — each disabled and each
  // saying what is in the way, rather than the section vanishing.
  it("falls back to the selected body's own set rather than to no section", () => {
    expect(
      optionsFor(kitchen(), "p19").map((option) => option.widthMm),
    ).toEqual([200, 300, 400, 600, 800]);
  });
});
