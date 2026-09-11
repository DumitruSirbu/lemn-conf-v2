// `resolveBodyLabel` — the app's half of ADR 0095 decision 4's label seam, and the only place a
// `BodyLabel` becomes words.
//
// **Layer 4, not layer 3.** The domain publishes a descriptor and this resolves it, so neither side
// of an assertion here is fed by the other: the expected side is either a `catalog.*` leaf read out
// of the catalogue tree or a sentinel written into a locale of this file's own making. The wording
// itself is pinned once, by the whole-file copy lock; what these tests answer is whether the right
// leaf is reached, whether every case has one, and whether a body with no leaf still gets a name.
import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import {
  EMPTY_SLOT_LABEL,
  entryLabel,
  INSERTABLE_BODY_DEFINITIONS,
  kindLabel,
  knownBodyKinds,
  labelWithDoors,
} from "@lemnaria/configurator-domain";

import {
  resolveBandLabel,
  resolveBodyLabel,
  type ContentTranslator,
} from "../../src/i18n/content";
import roMessages from "../../src/messages/ro.json";

const translate = createTranslator({
  locale: "ro",
  messages: roMessages,
}) as ContentTranslator;

const CATALOGUE_KINDS = Object.keys(roMessages.catalog.kinds);
const CATALOGUE_ENTRIES = Object.keys(roMessages.catalog.entries);

/** What `catalog.kinds.<kind>` reads once rendered, or `undefined` for a kind with no leaf at all —
 *  which is the failure the sweep below exists to show, so it is returned rather than thrown on.
 *
 *  ADR 0066's top return is the one kind leaf taking a parameter: it names the row it stands on, and
 *  that word is `band.top` rather than a second spelling of it — filled in from the same resolver
 *  the production path uses, and proved live by the sentinel test further down. */
function expectedKindLabel(kind: string): string | undefined {
  const leaf = (roMessages.catalog.kinds as Readonly<Record<string, string>>)[
    kind
  ];
  if (leaf === undefined) return undefined;
  return leaf.replace("{rowWord}", resolveBandLabel(translate, "top"));
}

/** Members every object literal inherits from `Object.prototype`. §11 row 24's fail-open shape, one
 *  layer along from `isKnownKind`: none of them is a body kind and none may render as a function. */
const INHERITED_KEYS = [
  "toString",
  "constructor",
  "valueOf",
  "hasOwnProperty",
  "__proto__",
];

describe("every case of the descriptor reaches its own catalogue leaf", () => {
  it("names all 16 insertable entries, and no two of them run out of leaves", () => {
    expect(CATALOGUE_ENTRIES).toHaveLength(16);
    expect(
      INSERTABLE_BODY_DEFINITIONS.map(([buildId]) => buildId).sort(),
    ).toEqual([...CATALOGUE_ENTRIES].sort());

    for (const buildId of CATALOGUE_ENTRIES)
      expect([
        buildId,
        resolveBodyLabel(translate, entryLabel(buildId)),
      ]).toEqual([
        buildId,
        (roMessages.catalog.entries as Readonly<Record<string, string>>)[
          buildId
        ],
      ]);
  });

  // Swept from the **domain's** set and not from the catalogue tree, because the two ways this can
  // break are opposite. A kind the domain knows with no leaf is invisible to a walk that starts at
  // the leaves — the 6Z shape, where a 35th refusal code reached a screen as an empty string. And a
  // kind that has a leaf but whose resolver arm points at another kind's leaf renders a plausible
  // wrong word: `corner_base_x` mapped to `catalog.kinds.base_cabinet` reads *Dulap bază*, which
  // §11 row 16 asked to say *corner*. Membership alone catches neither, so this resolves.
  it("names all 13 kinds the domain calls known, each at its own leaf", () => {
    const knownKinds = knownBodyKinds();

    expect(knownKinds).toHaveLength(13);
    expect([...knownKinds].sort()).toEqual([...CATALOGUE_KINDS].sort());

    for (const kind of knownKinds)
      expect([kind, resolveBodyLabel(translate, kindLabel(kind))]).toEqual([
        kind,
        expectedKindLabel(kind),
      ]);
  });

  it("resolves the empty slot to its own leaf, distinct from every body", () => {
    const emptySlot = resolveBodyLabel(translate, EMPTY_SLOT_LABEL);

    expect(emptySlot).toBe(roMessages.catalog.emptySlot);
    for (const buildId of CATALOGUE_ENTRIES)
      expect([
        buildId,
        resolveBodyLabel(translate, entryLabel(buildId)),
      ]).not.toEqual([buildId, emptySlot]);
  });

  // ADR 0033: the count wraps a name, and Romanian counts its nouns. One wrap deep, and the wrapped
  // name is resolved before it is interpolated — ICU cannot reference a sub-message by argument.
  it.each([1, 2])(
    "wraps the door count around the name it counts (%i)",
    (doors) => {
      const wrapped = resolveBodyLabel(
        translate,
        labelWithDoors(entryLabel("wall-cabinet"), doors),
      );

      expect(wrapped).toContain(
        resolveBodyLabel(translate, entryLabel("wall-cabinet")),
      );
      expect(wrapped).toContain(String(doors));
    },
  );

  it("renders one door and two doors as two different words", () => {
    const one = resolveBodyLabel(
      translate,
      labelWithDoors(entryLabel("wall-cabinet"), 1),
    );
    const two = resolveBodyLabel(
      translate,
      labelWithDoors(entryLabel("wall-cabinet"), 2),
    );

    expect(one).not.toBe(two);
    expect(one.replace("1", "2")).not.toBe(two);
  });
});

describe("a body the catalogue cannot name is still named", () => {
  // §11 row 24, and `rejection.ts`'s own stated fear: never a key path, never an empty string, and
  // never the raw kind id in front of a customer.
  it.each([...INHERITED_KEYS, "mystery_unit", "", "void", "base_cabinet_typo"])(
    "falls back to the unknown kind for %s",
    (bodyKind) => {
      expect([
        bodyKind,
        resolveBodyLabel(translate, kindLabel(bodyKind)),
      ]).toEqual([bodyKind, roMessages.catalog.unknownKind]);
    },
  );

  it("falls back for a build id the catalogue does not hold", () => {
    // Reachable: a `BodyCatalog` can arrive from outside TypeScript (ADR 0062's seam).
    expect(resolveBodyLabel(translate, entryLabel("qa-invented-row"))).toBe(
      roMessages.catalog.unknownKind,
    );
  });

  it("never renders a key path or an empty string for any case", () => {
    const everyCase = [
      EMPTY_SLOT_LABEL,
      ...CATALOGUE_ENTRIES.map((buildId) => entryLabel(buildId)),
      ...CATALOGUE_KINDS.map((kind) => kindLabel(kind)),
      kindLabel("mystery_unit"),
      labelWithDoors(entryLabel("base-cabinet"), 2),
    ];

    for (const label of everyCase) {
      const rendered = resolveBodyLabel(translate, label);
      expect([label, rendered]).not.toEqual([label, ""]);
      expect(rendered).not.toContain("catalog.");
      expect(rendered.trim()).toBe(rendered);
    }
  });
});

describe("ADR 0066: the two wall corner returns stay two lines", () => {
  it("resolves them to two different strings, neither the generic one", () => {
    const wallReturn = resolveBodyLabel(
      translate,
      kindLabel("corner_wall_return"),
    );
    const topReturn = resolveBodyLabel(
      translate,
      kindLabel("corner_wall_return_top"),
    );

    expect(wallReturn).not.toBe(topReturn);
    for (const rendered of [wallReturn, topReturn]) {
      expect(rendered).not.toBe(roMessages.catalog.unknownKind);
      expect(rendered).not.toBe(
        resolveBodyLabel(translate, kindLabel("wall_cabinet")),
      );
    }
  });

  // The top return's name states which row it stands on, and that word is `band.top` rather than a
  // second spelling of it. Falsified with a sentinel: set `band.top` and the kind leaf must follow.
  it("takes the top return's row word from band.top, live", () => {
    const sentinel = "QA-ROW-WORD";
    const sentinelTranslate = createTranslator({
      locale: "ro",
      messages: { ...roMessages, band: { ...roMessages.band, top: sentinel } },
    }) as ContentTranslator;

    expect(resolveBandLabel(sentinelTranslate, "top")).toBe(sentinel);
    expect(
      resolveBodyLabel(sentinelTranslate, kindLabel("corner_wall_return_top")),
    ).toContain(sentinel);
    // And the shipped catalogue agrees, so the sentinel above is not testing a branch nobody takes.
    expect(
      resolveBodyLabel(translate, kindLabel("corner_wall_return_top")),
    ).toContain(resolveBandLabel(translate, "top"));
  });
});

describe("the band word §9's header reads", () => {
  it.each(["base", "wall", "top", "column"] as const)(
    "resolves %s to its own leaf",
    (band) => {
      expect([band, resolveBandLabel(translate, band)]).toEqual([
        band,
        (roMessages.band as Readonly<Record<string, string>>)[band],
      ]);
    },
  );

  it("keeps the top row distinguishable from the wall row it normalises to", () => {
    expect(resolveBandLabel(translate, "top")).not.toBe(
      resolveBandLabel(translate, "wall"),
    );
  });
});
