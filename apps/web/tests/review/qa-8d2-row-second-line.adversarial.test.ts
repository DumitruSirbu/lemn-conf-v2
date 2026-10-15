// A review row's second line, checked by a second route that shares nothing with the code that writes it: the
// kitchens are dressed here, straight into their documents, and every expected word comes from a table written out
// below, copied from the two catalogues. A wrong pairing of an entry and its word in the code cannot hide behind the
// same lookup, and a line that states something the body does not wear fails.
import {
  CURRENT_SCHEMA_VERSION,
  migrateDesign,
  type Design,
  type DesignPlacement,
  type Finish,
  type Handle,
  type PaletteEntryId,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { describeReview, type AvailableReview } from "@/review/review-model";

import {
  CATALOGUES,
  contentFor,
  type CatalogueLocale,
} from "../support/catalogues";
import { priceAndProject } from "../support/generated-kitchens";
import { pastTheWall } from "../support/review-edits";
import { VARIED_ARMS, variedKitchensOf } from "../support/varied-kitchens";

/* eslint-disable no-restricted-syntax -- the approved words are the subject: written out whole, so that no resolver supplies the expected side. */
const FINISH_WORDS: Readonly<
  Record<PaletteEntryId, Readonly<Record<CatalogueLocale, string>>>
> = {
  "pal.alb": { ro: "Alb", ru: "Белый" },
  "pal.stejar-bardolino": {
    ro: "Stejar Bardolino Natur",
    ru: "Дуб Бардолино натуральный",
  },
  "pal.stejar-halifax": {
    ro: "Stejar Halifax Natur",
    ru: "Дуб Галифакс натуральный",
  },
  "pal.antracit": { ro: "Antracit", ru: "Антрацит" },
  "pal.gri-havanna": { ro: "Gri Havanna", ru: "Серый Гавана" },
  "pal.nuc-warmia": { ro: "Nuc Warmia Maro", ru: "Орех Вармия коричневый" },
  "veneer.stejar": { ro: "Stejar", ru: "Дуб" },
  "veneer.nuc": { ro: "Nuc", ru: "Орех" },
};

const HANDLE_WORDS: Readonly<
  Record<Handle, Readonly<Record<CatalogueLocale, string>>>
> = {
  steel: { ro: "Bară inox", ru: "Ручка-рейлинг из нержавеющей стали" },
  black: { ro: "Bară neagră", ru: "Чёрная ручка-рейлинг" },
  push: { ro: "Push-to-open", ru: "Push-to-open" },
};

const MILLIMETRES: Readonly<Record<CatalogueLocale, string>> = {
  ro: "mm",
  ru: "мм",
};
/* eslint-enable no-restricted-syntax */

const MATERIALS = [
  "material.melamine",
  "material.painted-mdf",
  "material.veneer",
] as const;
type MaterialTier = (typeof MATERIALS)[number];

/** What each material lets a body wear, written out: the decors, any colour at all, the two woods. */
const OWN_FINISHES: Readonly<Record<MaterialTier, readonly Finish[]>> = {
  "material.melamine": [
    { kind: "palette-entry", entryId: "pal.alb" },
    { kind: "palette-entry", entryId: "pal.stejar-bardolino" },
    { kind: "palette-entry", entryId: "pal.stejar-halifax" },
    { kind: "palette-entry", entryId: "pal.antracit" },
    { kind: "palette-entry", entryId: "pal.gri-havanna" },
    { kind: "palette-entry", entryId: "pal.nuc-warmia" },
  ],
  "material.painted-mdf": [
    { kind: "free-colour", value: "#b8c4a1" },
    { kind: "free-colour", value: "#000000" },
    { kind: "free-colour", value: "#FFFFFF" },
    { kind: "free-colour", value: "#12ab9F" },
  ],
  "material.veneer": [
    { kind: "palette-entry", entryId: "veneer.stejar" },
    { kind: "palette-entry", entryId: "veneer.nuc" },
  ],
};
const HANDLES: readonly Handle[] = ["steel", "black", "push"];

/** A small repeatable draw, so the kitchens are the same on every run and differ from one another. */
function drawsFrom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

/** The body with neither a finish nor a handle of its own. */
function undressed(body: DesignPlacement["body"]): DesignPlacement["body"] {
  const bare = { ...body };
  delete bare.finish;
  delete bare.handle;
  return bare;
}

type Dress = "nothing" | "a finish" | "a handle" | "both";
const DRESSES: readonly Dress[] = ["nothing", "a finish", "a handle", "both"];

/**
 * The kitchen in `material`, with the kitchen's own colour set or not, and each body drawn one of four dresses.
 * Written straight into the document and then read back through the load seam, which is what a review opened from
 * its address shows: a finish on a body that cannot choose one does not survive it, so what is left is what each
 * body really carries.
 */
function dressed(design: Design, material: MaterialTier, seed: number): Design {
  const draw = drawsFrom(seed);
  const pick = <Item>(items: readonly Item[]): Item => {
    const item = items[Math.floor(draw() * items.length)];
    if (item === undefined) throw new Error("nothing to pick from");
    return item;
  };
  const kitchenFinish = draw() < 0.5 ? undefined : pick(OWN_FINISHES[material]);
  const placements = design.placements.map((placement) => {
    const dress = pick(DRESSES);
    const bare = undressed(placement.body);
    return {
      ...placement,
      body: {
        ...bare,
        ...(dress === "a finish" || dress === "both"
          ? { finish: pick(OWN_FINISHES[material]) }
          : {}),
        ...(dress === "a handle" || dress === "both"
          ? { handle: pick(HANDLES) }
          : {}),
      },
    };
  });
  const settings = { ...design.settings };
  delete settings.finish;
  return loadedOrAsWritten({
    ...design,
    placements,
    settings: {
      ...settings,
      materialTierId: material,
      ...(kitchenFinish === undefined ? {} : { finish: kitchenFinish }),
    },
  });
}

/** The document as the load seam hands it on. */
function loadedOrAsWritten(design: Design): Design {
  return migrateDesign(CURRENT_SCHEMA_VERSION, design);
}

function reviewIn(locale: CatalogueLocale, design: Design): AvailableReview {
  const messages = CATALOGUES.find(([name]) => name === locale)?.[1];
  if (messages === undefined) throw new Error(`no ${locale} catalogue`);
  const view = describeReview({
    content: contentFor(locale, messages),
    ...priceAndProject(design),
  });
  if (view.kind !== "available") throw new Error("the kitchen has no review");
  return view;
}

/** What the second line must say for this body, from its document and the table above alone. */
function factsOf(
  placement: DesignPlacement,
  locale: CatalogueLocale,
): string[] {
  const { finish, handle, widthMm } = placement.body;
  return [
    `${String(widthMm)} ${MILLIMETRES[locale]}`,
    ...(finish === undefined
      ? []
      : [
          finish.kind === "palette-entry"
            ? FINISH_WORDS[finish.entryId][locale]
            : finish.value,
        ]),
    ...(handle === undefined ? [] : [HANDLE_WORDS[handle][locale]]),
  ];
}

const KITCHENS_PER_ARM = 9;

/** Every arm's first kitchens, each in each material, each dressed by its own draw. */
const DRESSED_KITCHENS: readonly Design[] = VARIED_ARMS.flatMap(
  (arm, armIndex) =>
    variedKitchensOf(arm)
      .slice(0, KITCHENS_PER_ARM)
      .flatMap(({ design }, index) =>
        MATERIALS.map((material, materialIndex) =>
          dressed(
            design,
            material,
            armIndex * 1000 + index * 10 + materialIndex,
          ),
        ),
      ),
);

describe.each(["ro", "ru"] as const)("a row's second line, in %s", (locale) => {
  it("states every body's width, and its own finish and handle exactly when its document carries them", () => {
    const seen = {
      bodies: 0,
      widthOnly: 0,
      finishes: new Map<string, number>(),
      freeColours: 0,
      handles: new Map<string, number>(),
      both: 0,
    };
    for (const design of DRESSED_KITCHENS) {
      const { rowDetails } = reviewIn(locale, design);
      expect(Object.keys(rowDetails).sort()).toEqual(
        design.placements.map((placement) => placement.id).sort(),
      );
      for (const placement of design.placements) {
        const { finish, handle } = placement.body;
        seen.bodies += 1;
        if (finish === undefined && handle === undefined) seen.widthOnly += 1;
        if (finish !== undefined && handle !== undefined) seen.both += 1;
        if (finish?.kind === "palette-entry")
          seen.finishes.set(
            finish.entryId,
            (seen.finishes.get(finish.entryId) ?? 0) + 1,
          );
        if (finish?.kind === "free-colour") seen.freeColours += 1;
        if (handle !== undefined)
          seen.handles.set(handle, (seen.handles.get(handle) ?? 0) + 1);

        expect(
          rowDetails[placement.id]?.facts,
          `${placement.id} ${placement.body.buildId}`,
        ).toEqual(factsOf(placement, locale));
      }
    }

    // Each arm of the claim is exercised, and by more than a handful.
    expect(seen.bodies).toBeGreaterThan(1500);
    expect(seen.widthOnly).toBeGreaterThan(300);
    expect(seen.both).toBeGreaterThan(50);
    expect(seen.freeColours).toBeGreaterThan(50);
    expect([...seen.finishes.keys()].sort()).toEqual(
      Object.keys(FINISH_WORDS).sort(),
    );
    for (const count of seen.finishes.values())
      expect(count).toBeGreaterThanOrEqual(10);
    expect([...seen.handles.keys()].sort()).toEqual([...HANDLES].sort());
    for (const count of seen.handles.values())
      expect(count).toBeGreaterThanOrEqual(50);
    console.log(
      `SECOND_LINE ${locale} ${JSON.stringify({
        kitchens: DRESSED_KITCHENS.length,
        bodies: seen.bodies,
        widthOnly: seen.widthOnly,
        both: seen.both,
        freeColours: seen.freeColours,
        finishes: Object.fromEntries(seen.finishes),
        handles: Object.fromEntries(seen.handles),
      })}`,
    );
  });

  it("never states the kitchen's own colour on a body that has chosen none", () => {
    let followers = 0;
    for (const design of DRESSED_KITCHENS) {
      const kitchenFinish = design.settings?.finish;
      if (kitchenFinish === undefined) continue;
      const kitchenWord =
        kitchenFinish.kind === "palette-entry"
          ? FINISH_WORDS[kitchenFinish.entryId][locale]
          : kitchenFinish.value;
      const { rowDetails } = reviewIn(locale, design);
      for (const placement of design.placements) {
        if (placement.body.finish !== undefined) continue;
        followers += 1;
        expect(rowDetails[placement.id]?.facts).not.toContain(kitchenWord);
      }
    }
    expect(followers).toBeGreaterThan(300);
  });

  it("puts the name and the width together into exactly the row's own label, the name a refusal calls the body by", () => {
    for (const design of DRESSED_KITCHENS) {
      const review = reviewIn(locale, design);
      const rows = review.groups.flatMap((group) => group.rows);
      expect(rows).toHaveLength(design.placements.length);
      for (const row of rows) {
        const detail = review.rowDetails[row.key];
        const width = design.placements.find(
          (placement) => placement.id === row.key,
        )?.body.widthMm;
        expect(`${detail?.name ?? ""} ${String(width)}`, row.key).toBe(
          row.label,
        );
      }
    }
  });

  it("keeps one row for one body: as many rows as bodies, each with its own key, and none that counts several", () => {
    for (const design of DRESSED_KITCHENS) {
      const review = reviewIn(locale, design);
      const rows = review.groups.flatMap((group) => group.rows);
      expect(new Set(rows.map((row) => row.key)).size).toBe(
        design.placements.length,
      );
      for (const row of rows) {
        const detail = review.rowDetails[row.key];
        const drawn = [row.label, detail?.name ?? "", ...(detail?.facts ?? [])];
        for (const text of drawn) expect(text).not.toMatch(/\d\s*[×xX*]\s*\d/);
      }
    }
  });
});

/** The first body of `design` that carries a finish of its own. */
function firstWithItsOwnFinish(design: Design): DesignPlacement {
  const placement = design.placements.find(
    (candidate) => candidate.body.finish !== undefined,
  );
  if (placement === undefined) throw new Error("no body carries a finish");
  return placement;
}

function withBody(
  design: Design,
  id: string,
  change: (body: DesignPlacement["body"]) => DesignPlacement["body"],
): Design {
  return {
    ...design,
    placements: design.placements.map((placement) =>
      placement.id === id
        ? { ...placement, body: change(placement.body) }
        : placement,
    ),
  };
}

describe("a body's own colour against the kitchen's", () => {
  const melamine = DRESSED_KITCHENS.find(
    (design) =>
      design.settings?.materialTierId === "material.melamine" &&
      design.placements.some((placement) => placement.body.finish),
  );
  if (melamine === undefined)
    throw new Error("no melamine kitchen was dressed");
  const chooser = firstWithItsOwnFinish(melamine);
  const antracit: Finish = { kind: "palette-entry", entryId: "pal.antracit" };
  const halifax: Finish = {
    kind: "palette-entry",
    entryId: "pal.stejar-halifax",
  };
  const secondFactOf = (design: Design): string | undefined =>
    reviewIn("ro", design).rowDetails[chooser.id]?.facts[1];

  it("is stated when it is the same colour as the kitchen's: the body chose it, and the document says so", () => {
    const sameAsTheKitchen = withBody(
      { ...melamine, settings: { ...melamine.settings, finish: antracit } },
      chooser.id,
      (body) => ({ ...body, finish: antracit, handle: undefined }),
    );

    expect(secondFactOf(sameAsTheKitchen)).toBe(
      FINISH_WORDS["pal.antracit"].ro,
    );
  });

  it("stays the body's own when the kitchen's colour changes after it", () => {
    const own = withBody(melamine, chooser.id, (body) => ({
      ...body,
      finish: halifax,
      handle: undefined,
    }));
    const kitchenChanged: Design = {
      ...own,
      settings: { ...own.settings, finish: antracit },
    };

    expect(secondFactOf(kitchenChanged)).toBe(
      FINISH_WORDS["pal.stejar-halifax"].ro,
    );
  });

  it("is gone from the line once the body is put back on the kitchen's colour", () => {
    const followingAgain = withBody(
      { ...melamine, settings: { ...melamine.settings, finish: antracit } },
      chooser.id,
      undressed,
    );

    expect(
      reviewIn("ro", followingAgain).rowDetails[chooser.id]?.facts,
    ).toEqual([`${String(chooser.body.widthMm)} mm`]);
  });

  it("states the width the document holds after the body is made narrower", () => {
    const narrower = withBody(melamine, chooser.id, (body) => ({
      ...body,
      widthMm: body.widthMm - 50,
    }));

    expect(reviewIn("ro", narrower).rowDetails[chooser.id]?.facts[0]).toBe(
      `${String(chooser.body.widthMm - 50)} mm`,
    );
  });
});

describe("a refusal's names beside the rows' two lines", () => {
  it("calls each body past its wall by its row's whole label, so two bodies of one name and different widths are told apart and each names its own body", () => {
    let pairsToldApart = 0;
    for (const { design } of VARIED_ARMS.flatMap((arm) =>
      variedKitchensOf(arm).slice(0, KITCHENS_PER_ARM),
    )) {
      const twins = design.placements.filter(
        (placement, _index, all) =>
          all.filter((other) => other.body.buildId === placement.body.buildId)
            .length >= 2,
      );
      const [first, second] = twins.filter(
        (placement) => placement.body.buildId === twins[0]?.body.buildId,
      );
      if (first === undefined || second === undefined) continue;
      const narrowed = withBody(design, second.id, (body) => ({
        ...body,
        widthMm: body.widthMm - 50,
      }));
      const pastTheirWalls = pastTheWall(
        narrowed,
        new Set([first.id, second.id]),
      );

      const review = reviewIn("ro", pastTheirWalls);
      if (review.submit.kind !== "refused")
        throw new Error("the kitchen was not refused");
      const named = new Map(
        review.submit.bodies.map((body) => [body.placementId, body.label]),
      );
      const rowLabels = new Map(
        review.groups.flatMap((group) =>
          group.rows.map((row) => [row.key, row.label] as const),
        ),
      );

      expect([...named.keys()].sort()).toEqual([first.id, second.id].sort());
      for (const [placementId, label] of named)
        expect(label).toBe(rowLabels.get(placementId));
      expect(named.get(first.id)).not.toBe(named.get(second.id));
      expect(named.get(second.id)).toContain(String(second.body.widthMm - 50));
      pairsToldApart += 1;
    }
    expect(pairsToldApart).toBeGreaterThan(20);
  });
});
