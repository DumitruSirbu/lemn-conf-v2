// A row's two lines (frame 3A): the body's name, then its width and, exactly when the body carries its own, its
// finish and its handle. The expected side is built from the design and the catalogue's message files, not from the
// functions the model calls, so a line that says something the body does not wear fails here.
//
// What this cannot see: how the lines look on a phone (the visual pass's), and a free colour's name, which has none.
import {
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  freeColourFinish,
  KITCHEN_L_DESIGN,
  paletteFinish,
  type Design,
  type DesignPlacement,
  type Handle,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { describeReview, type AvailableReview } from "@/review/review-model";
import { createConfiguratorStore } from "@/store/configurator-store";

import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";
import { createFakeProbeFactory } from "../support/fake-body-probe";
import { priceAndProject } from "../support/generated-kitchens";
import { contentFor } from "../support/catalogues";
import { ARMS, composedKitchensOf } from "../support/swept-kitchens";

const OCCURRED_AT = "2026-10-08T09:00:00.000Z";
const CATALOGUES = [
  ["ro", roMessages],
  ["ru", ruMessages],
] as const;
const MM_WORD = { ro: "mm", ru: "мм" } as const;
const OWN_FINISHES = [
  paletteFinish("pal.alb"),
  paletteFinish("pal.antracit"),
  paletteFinish("veneer.stejar"),
  freeColourFinish("#a1b2c3"),
] as const;
const OWN_HANDLES: readonly Handle[] = ["steel", "black", "push"];

/** The design as the store's own commands leave it: every second body given a finish of its own and every third a
 *  handle, wherever the catalogue lets it. Refused commands change nothing. */
function withOwnAppearance(design: Design): Design {
  const store = createConfiguratorStore({
    design,
    catalogAt: buildKitchenLBodyCatalog,
    now: () => OCCURRED_AT,
    probeAt: createFakeProbeFactory(),
  });
  design.placements.forEach((placement, index) => {
    store.getState().select({ kind: "placement", id: placement.id });
    if (index % 2 === 0)
      store
        .getState()
        .setFinish(
          OWN_FINISHES[index % OWN_FINISHES.length] ?? OWN_FINISHES[0],
        );
    if (index % 3 === 0)
      store
        .getState()
        .setHandle(OWN_HANDLES[index % OWN_HANDLES.length] ?? "steel");
  });
  return store.getState().design;
}

function reviewOf(design: Design, locale: "ro" | "ru"): AvailableReview {
  const kitchen = priceAndProject(design);
  const view = describeReview({
    content: contentFor(
      locale,
      (locale === "ro" ? roMessages : ruMessages) as typeof roMessages,
    ),
    ...kitchen,
  });
  if (view.kind !== "available") throw new Error("the kitchen has no review");
  return view;
}

/** What the lines must say for this placement, from the document and the message files alone. */
function expectedFacts(
  placement: DesignPlacement,
  locale: "ro" | "ru",
  messages: typeof roMessages,
): string[] {
  const { finish, handle, widthMm } = placement.body;
  const facts = [`${String(widthMm)} ${MM_WORD[locale]}`];
  if (finish?.kind === "palette-entry") {
    const [family, key] = finish.entryId.split(".") as [
      "pal" | "veneer",
      string,
    ];
    facts.push((messages.finish[family] as Record<string, string>)[key] ?? "?");
  }
  if (finish?.kind === "free-colour") facts.push(finish.value);
  if (handle !== undefined) facts.push(messages.panel.handleLabels[handle]);
  return facts;
}

describe.each(CATALOGUES)("the second line, in %s", (locale, messages) => {
  const counts = { bodies: 0, ownFinish: 0, ownHandle: 0 };

  describe.each(ARMS)("in a $name room", (arm) => {
    const designs = composedKitchensOf(arm)
      .slice(0, 12)
      .map(({ design }) => withOwnAppearance(design));

    it("states each body's width, and its own finish and handle exactly when it carries them", () => {
      for (const design of designs) {
        const details = reviewOf(design, locale).rowDetails;
        for (const placement of design.placements) {
          counts.bodies += 1;
          if (placement.body.finish !== undefined) counts.ownFinish += 1;
          if (placement.body.handle !== undefined) counts.ownHandle += 1;

          expect(details[placement.id]?.facts, placement.id).toEqual(
            expectedFacts(placement, locale, messages as typeof roMessages),
          );
        }
      }
    });

    it("has one detail per body and none besides", () => {
      for (const design of designs) {
        expect(Object.keys(reviewOf(design, locale).rowDetails).sort()).toEqual(
          design.placements.map((placement) => placement.id).sort(),
        );
      }
    });
  });

  it("was swept over bodies that carry their own finish and their own handle, and bodies that carry neither", () => {
    expect(counts.bodies).toBeGreaterThan(200);
    expect(counts.ownFinish).toBeGreaterThan(20);
    expect(counts.ownHandle).toBeGreaterThan(20);
    expect(counts.ownFinish).toBeLessThan(counts.bodies);
  });
});

describe("three rows, spelled out", () => {
  const [first, second, third] = KITCHEN_L_DESIGN.placements;
  if (first === undefined || second === undefined || third === undefined)
    throw new Error("the seeded kitchen holds bodies");
  const secondId = second.id;
  const thirdId = third.id;

  function with3(design: Design): Design {
    return {
      ...design,
      placements: design.placements.map((placement) => {
        if (placement.id === secondId)
          return {
            ...placement,
            body: { ...placement.body, finish: paletteFinish("pal.antracit") },
          };
        if (placement.id === thirdId)
          return { ...placement, body: { ...placement.body, handle: "push" } };
        return placement;
      }),
    };
  }
  const design = with3(KITCHEN_L_DESIGN);

  it("names a body on the kitchen's own colour by its width alone", () => {
    expect(reviewOf(design, "ro").rowDetails[first.id]?.facts).toEqual([
      `${String(first.body.widthMm)} mm`,
    ]);
    expect(reviewOf(design, "ru").rowDetails[first.id]?.facts).toEqual([
      `${String(first.body.widthMm)} мм`,
    ]);
  });

  it("adds a body's own finish after its width, by the approved name", () => {
    expect(reviewOf(design, "ro").rowDetails[second.id]?.facts).toEqual([
      `${String(second.body.widthMm)} mm`,
      roMessages.finish.pal.antracit,
    ]);
    expect(reviewOf(design, "ru").rowDetails[second.id]?.facts).toEqual([
      `${String(second.body.widthMm)} мм`,
      ruMessages.finish.pal.antracit,
    ]);
  });

  it("adds a body's own handle after its width", () => {
    expect(reviewOf(design, "ro").rowDetails[third.id]?.facts).toEqual([
      `${String(third.body.widthMm)} mm`,
      roMessages.panel.handleLabels.push,
    ]);
    expect(reviewOf(design, "ru").rowDetails[third.id]?.facts).toEqual([
      `${String(third.body.widthMm)} мм`,
      ruMessages.panel.handleLabels.push,
    ]);
  });
});

describe("the first line and the refusal name the same body", () => {
  it("is the name without its width, and the row's label is that name and the width, as a refusal prints it", () => {
    const design = withOwnAppearance(KITCHEN_L_DESIGN);
    const review = reviewOf(design, "ro");
    const rows = review.groups.flatMap((group) => group.rows);

    expect(rows.length).toBe(design.placements.length);
    for (const row of rows) {
      const detail = review.rowDetails[row.key];
      const placement = design.placements.find((p) => p.id === row.key);
      expect(row.label).toBe(
        `${detail?.name ?? "?"} ${String(placement?.body.widthMm)}`,
      );
    }
  });

  it("never aggregates: one detail per body, whatever the names", () => {
    const design = KITCHEN_L_DESIGN;
    const names = reviewOf(design, "ro")
      .groups.flatMap((group) => group.rows)
      .map((row) => row.key);

    expect(new Set(names).size).toBe(design.placements.length);
    expect(cabinetDepthMmOf(design)).toBeGreaterThan(0);
  });
});
