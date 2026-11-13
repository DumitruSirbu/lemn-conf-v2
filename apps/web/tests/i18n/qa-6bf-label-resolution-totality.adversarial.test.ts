// Adversarial QA for wave 6B-f: **every `BodyLabel` the domain can build resolves to a real word,
// in both locales, and to its *own* leaf.**
//
// The wave's own `body-label.test.ts` asserts entry resolution leaf-by-leaf but asks a weaker
// question of the thirteen kinds — it checks `isKnownKind(kind)` and never that
// `resolveBodyLabel(kindLabel(kind))` reaches `catalog.kinds.<kind>`. A kind with a leaf, a set
// membership and no `switch` arm therefore renders `catalog.unknownKind` with every gate green,
// which is the shape of the defect 6Z left for 6B-e (a 35th refusal code localized nowhere). The
// same hole exists for Russian: `content.test.ts` counts `bodyLabel` among the public functions but
// never calls it against `ru.json`.
//
// **Layer 4.** Neither side of an assertion is fed by the other: the descriptor comes from the
// domain, the expected string is read out of the message catalogue.
import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import {
  buildInsertableBodyDefinitions,
  buildKitchenLBodyCatalog,
  declaredCabinetDepthsMm,
  describeBodyLabelAt,
  describeBodyName,
  deriveDoorCount,
  EMPTY_SLOT_LABEL,
  entryLabel,
  isKnownKind,
  kindLabel,
  labelWithDoors,
  TWO_DOOR_MIN_WIDTH_MM,
  VOID_KIND,
  type BodyLabel,
  type RejectionDetail,
} from "@lemnaria/configurator-domain";

import {
  resolveBodyLabel,
  resolveRejection,
  type ContentTranslator,
} from "../../src/i18n/content";
import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";
import { REJECTION_FIXTURES } from "./golden-output-fixtures";

type MessageTree = typeof roMessages;

const LOCALES = [
  ["ro", roMessages],
  ["ru", ruMessages as MessageTree],
] as const;

type SupportedLocale = (typeof LOCALES)[number][0];

function translatorFor(
  locale: SupportedLocale,
  messages: MessageTree,
): ContentTranslator {
  return createTranslator({ locale, messages }) as ContentTranslator;
}

const CATALOGUE_KINDS = Object.keys(roMessages.catalog.kinds);
const CATALOGUE_ENTRIES = Object.keys(roMessages.catalog.entries);

function kindLeaf(messages: MessageTree, kind: string): string {
  const leaf = (messages.catalog.kinds as Readonly<Record<string, string>>)[
    kind
  ];
  if (leaf === undefined) throw new Error(`no catalog.kinds.${kind}`);
  return leaf;
}

function entryLeaf(messages: MessageTree, buildId: string): string {
  const leaf = (messages.catalog.entries as Readonly<Record<string, string>>)[
    buildId
  ];
  if (leaf === undefined) throw new Error(`no catalog.entries.${buildId}`);
  return leaf;
}

/** Every descriptor the shipped product can put in front of a customer: the §7 rows at every width
 *  the panel offers them at, and every seeded instance, at **both** declared cabinet depths. */
function everyReachableLabel(): readonly {
  readonly origin: string;
  readonly label: BodyLabel;
}[] {
  const reached: { origin: string; label: BodyLabel }[] = [];
  for (const cabinetDepthMm of declaredCabinetDepthsMm()) {
    for (const [buildId, definition] of buildInsertableBodyDefinitions(
      cabinetDepthMm,
    )) {
      const widths = [
        ...(definition.sizesMm ?? []),
        TWO_DOOR_MIN_WIDTH_MM - 1,
        TWO_DOOR_MIN_WIDTH_MM,
      ];
      for (const widthMm of widths) {
        reached.push({
          origin: `${String(cabinetDepthMm)}/${buildId}@${String(widthMm)}`,
          label: describeBodyLabelAt({ buildId, definition }, widthMm),
        });
      }
    }
    for (const [buildId, definition] of buildKitchenLBodyCatalog(
      cabinetDepthMm,
    )) {
      reached.push({
        origin: `${String(cabinetDepthMm)}/seeded/${buildId}`,
        label: describeBodyName({ buildId, definition }),
      });
    }
  }
  return reached;
}

const REACHABLE_LABELS = everyReachableLabel();

describe("6B-f: the kind arm reaches its own leaf, not merely a known kind", () => {
  it.each(LOCALES)(
    "resolves each of the thirteen kinds to catalog.kinds.<kind> in %s",
    (locale, messages) => {
      const translate = translatorFor(locale, messages);

      for (const kind of CATALOGUE_KINDS) {
        const expected =
          kind === "corner_wall_return_top"
            ? // The one leaf taking an argument; its row word is `band.top`, asserted in the wave's
              // own test. Here only the leaf identity is at stake.
              kindLeaf(messages, kind).replace("{rowWord}", messages.band.top)
            : kindLeaf(messages, kind);
        expect([
          locale,
          kind,
          resolveBodyLabel(translate, kindLabel(kind)),
        ]).toEqual([locale, kind, expected]);
      }
    },
  );

  it.each(LOCALES)(
    "gives the thirteen kinds thirteen distinct words in %s, none of them the fallback",
    (locale, messages) => {
      const translate = translatorFor(locale, messages);
      const rendered = CATALOGUE_KINDS.map((kind) =>
        resolveBodyLabel(translate, kindLabel(kind)),
      );

      expect([locale, new Set(rendered).size]).toEqual([
        locale,
        CATALOGUE_KINDS.length,
      ]);
      for (const [index, word] of rendered.entries())
        expect([locale, CATALOGUE_KINDS[index], word]).not.toEqual([
          locale,
          CATALOGUE_KINDS[index],
          messages.catalog.unknownKind,
        ]);
    },
  );

  it.each(LOCALES)(
    "resolves each of the sixteen entries to catalog.entries.<buildId> in %s",
    (locale, messages) => {
      const translate = translatorFor(locale, messages);

      for (const buildId of CATALOGUE_ENTRIES)
        expect([
          locale,
          buildId,
          resolveBodyLabel(translate, entryLabel(buildId)),
        ]).toEqual([locale, buildId, entryLeaf(messages, buildId)]);
    },
  );
});

describe("6B-f: totality over every descriptor the shipped product can build", () => {
  it("reaches every §7 row at every offered width and every seeded body", () => {
    // The sweep is worth nothing if it swept nothing: both declared depths, both catalogues.
    expect(REACHABLE_LABELS.length).toBeGreaterThan(200);
    expect(
      new Set(REACHABLE_LABELS.map(({ origin }) => origin.split("/")[0])).size,
    ).toBe(declaredCabinetDepthsMm().length);
  });

  it.each(LOCALES)("names every one of them in %s", (locale, messages) => {
    const translate = translatorFor(locale, messages);

    for (const { origin, label } of REACHABLE_LABELS) {
      const rendered = resolveBodyLabel(translate, label);
      expect([origin, rendered]).not.toEqual([origin, ""]);
      expect([origin, rendered]).not.toEqual([
        origin,
        messages.catalog.unknownKind,
      ]);
      expect(rendered, origin).not.toContain("catalog.");
      expect(rendered, origin).not.toContain("undefined");
      expect(rendered, origin).not.toContain("{");
      expect([origin, rendered.trim()]).toEqual([origin, rendered]);
    }
  });

  it("carries no kind the catalogue does not name", () => {
    for (const { origin, label } of REACHABLE_LABELS) {
      const inner = label.kind === "withDoors" ? label.name : label;
      if (inner.kind !== "bodyKind") continue;
      expect([origin, isKnownKind(inner.bodyKind)]).toEqual([origin, true]);
      expect([origin, CATALOGUE_KINDS]).toEqual([
        origin,
        expect.arrayContaining([inner.bodyKind]),
      ]);
    }
  });

  it("carries no build id the catalogue does not name", () => {
    for (const { origin, label } of REACHABLE_LABELS) {
      const inner = label.kind === "withDoors" ? label.name : label;
      if (inner.kind !== "entry") continue;
      expect([origin, CATALOGUE_ENTRIES]).toEqual([
        origin,
        expect.arrayContaining([inner.buildId]),
      ]);
    }
  });
});

describe("6B-f: the door-count wrapper across the counts Romanian and Russian inflect", () => {
  // `deriveDoorCount` answers 1 or 2 today, but the wrapper takes a number and ICU picks a branch
  // from it. Swept past every plural boundary either language has, so a count the catalogue cannot
  // inflect fails here rather than in front of a customer.
  const DOOR_COUNTS = [0, 1, 2, 4, 5, 11, 19, 20, 21, 100, 101, 111] as const;

  it.each(LOCALES)("renders every swept count in %s", (locale, messages) => {
    const translate = translatorFor(locale, messages);
    const name = resolveBodyLabel(translate, entryLabel("wall-cabinet"));

    for (const doors of DOOR_COUNTS) {
      const rendered = resolveBodyLabel(
        translate,
        labelWithDoors(entryLabel("wall-cabinet"), doors),
      );
      expect(rendered, `${locale}/${String(doors)}`).toContain(name);
      expect(rendered, `${locale}/${String(doors)}`).toContain(String(doors));
      expect(rendered, `${locale}/${String(doors)}`).not.toContain("{");
    }
  });

  it.each(LOCALES)(
    "wraps a kind descriptor as readily as an entry one in %s",
    (locale, messages) => {
      const translate = translatorFor(locale, messages);
      const wrapped = resolveBodyLabel(
        translate,
        labelWithDoors(kindLabel("wall_cabinet"), 2),
      );

      expect(wrapped).toContain(kindLeaf(messages, "wall_cabinet"));
      expect(wrapped).not.toBe(messages.catalog.unknownKind);
    },
  );

  it.each(LOCALES)(
    "counts the doors of the derived count at the threshold either side, in %s",
    (locale, messages) => {
      const translate = translatorFor(locale, messages);

      const narrow = resolveBodyLabel(
        translate,
        labelWithDoors(
          entryLabel("wall-cabinet"),
          deriveDoorCount(TWO_DOOR_MIN_WIDTH_MM - 1),
        ),
      );
      const wide = resolveBodyLabel(
        translate,
        labelWithDoors(
          entryLabel("wall-cabinet"),
          deriveDoorCount(TWO_DOOR_MIN_WIDTH_MM),
        ),
      );

      expect([locale, narrow]).not.toEqual([locale, wide]);
      expect(narrow, locale).toContain("1");
      expect(wide, locale).toContain("2");
      void messages;
    },
  );
});

describe("6B-f: the two payload-free cases", () => {
  it.each(LOCALES)(
    "resolves the empty slot to its own leaf in %s, never a body's",
    (locale, messages) => {
      const translate = translatorFor(locale, messages);
      const emptySlot = resolveBodyLabel(translate, EMPTY_SLOT_LABEL);

      expect([locale, emptySlot]).toEqual([locale, messages.catalog.emptySlot]);
      for (const kind of CATALOGUE_KINDS)
        expect([
          locale,
          kind,
          resolveBodyLabel(translate, kindLabel(kind)),
        ]).not.toEqual([locale, kind, emptySlot]);
    },
  );

  // `void-engine.ts` states this in as many words: `catalog.kinds` names no `void`, so a descriptor
  // built from `VOID_KIND` falls to `catalog.unknownKind`. Asserted so the comment stays true —
  // a `catalog.kinds.void` leaf added later would silently give voids two spellings.
  it.each(LOCALES)(
    "leaves VOID_KIND unnamed by the catalogue in %s",
    (locale, messages) => {
      const translate = translatorFor(locale, messages);

      expect([locale, isKnownKind(VOID_KIND)]).toEqual([locale, false]);
      expect([
        locale,
        resolveBodyLabel(translate, kindLabel(VOID_KIND)),
      ]).toEqual([locale, messages.catalog.unknownKind]);
    },
  );
});

describe("6B-f: a refusal's {label} resolves whatever descriptor case reaches it", () => {
  // The plan's own named risk: *"One missed arm passes a `BodyLabel` object into ICU and renders
  // `[object Object]` inside a quoted refusal."* The 41 golden fixtures all carry the same two
  // descriptors — `entry("base-cabinet")` wrapped in a door count, and `entry("hood")` — so the
  // three other cases have never been through `resolveRejection` at all. `describeRecordLabel`
  // publishes a `bodyKind` for every corner body, which is exactly a refusal a customer can reach
  // (`setWidth` on a wall corner return), so this is a live combination and not a synthetic one.
  /** The prefixes a rendered sentence proves nothing by containing, and everything by leaking. */
  const LEAKED_KEY_PATHS = [
    "catalog.entries.",
    "catalog.kinds.",
    "catalog.unknownKind",
    "catalog.emptySlot",
    "catalog.bodyLabelWithDoors",
  ] as const;

  const SUBSTITUTE_LABELS: readonly (readonly [string, BodyLabel])[] = [
    ["bodyKind/known", kindLabel("corner_wall_return")],
    ["bodyKind/unknown", kindLabel("qa_unheard_of_kind")],
    ["emptySlot", EMPTY_SLOT_LABEL],
    ["entry", entryLabel("tall-fridge-housing")],
    ["withDoors(bodyKind)", labelWithDoors(kindLabel("wall_cabinet"), 1)],
  ];

  /** Replaces whichever descriptor parameters this refusal declares. A refusal carrying neither is
   *  returned unchanged, and is still rendered — a sentence with no label must survive the sweep. */
  function withLabels(
    detail: RejectionDetail,
    label: BodyLabel,
  ): RejectionDetail {
    const parameters = detail.params as Readonly<Record<string, unknown>>;
    const substituted: Record<string, unknown> = { ...parameters };
    if ("label" in parameters) substituted.label = label;
    if ("memberLabel" in parameters) substituted.memberLabel = label;
    return { ...detail, params: substituted } as RejectionDetail;
  }

  it("has fixtures carrying a descriptor, so the substitution is not a no-op", () => {
    const carryingALabel = REJECTION_FIXTURES.filter((fixture) =>
      Object.hasOwn(fixture.detail.params, "label"),
    );

    expect(REJECTION_FIXTURES).toHaveLength(42);
    expect(carryingALabel.length).toBeGreaterThan(25);
  });

  it.each(LOCALES)(
    "renders all 42 refusals against all five descriptor cases in %s",
    (locale, messages) => {
      const translate = translatorFor(locale, messages);
      let rendered = 0;

      for (const fixture of REJECTION_FIXTURES) {
        for (const [caseName, label] of SUBSTITUTE_LABELS) {
          const where = `${locale}/${fixture.id}/${caseName}`;
          const sentence = resolveRejection(
            translate,
            withLabels(fixture.detail, label),
          );

          expect([where, sentence]).not.toEqual([where, ""]);
          expect(sentence, where).not.toContain("[object Object]");
          expect(sentence, where).not.toContain("undefined");
          expect(sentence, where).not.toContain("NaN");
          expect(sentence, where).not.toContain("{");
          expect(sentence, where).not.toContain("rejection.");
          // Not a bare `catalog.` — *"nu există în catalog."* is an owner-approved sentence. What
          // must never appear is a message *path*.
          for (const keyPath of LEAKED_KEY_PATHS)
            expect(sentence, `${where}/${keyPath}`).not.toContain(keyPath);
          rendered += 1;
        }
      }

      expect(rendered).toBe(
        REJECTION_FIXTURES.length * SUBSTITUTE_LABELS.length,
      );
    },
  );

  it.each(LOCALES)(
    "puts the substituted descriptor's own words into the sentence in %s",
    (locale, messages) => {
      // Anti-vacuity for the sweep above: a resolver that dropped `{label}` entirely would pass
      // every "does not contain" assertion. Checked on a refusal whose message is `„{label}” …`.
      const translate = translatorFor(locale, messages);
      const labelled = REJECTION_FIXTURES.find((fixture) =>
        Object.hasOwn(fixture.detail.params, "label"),
      );
      if (labelled === undefined)
        throw new Error("no labelled refusal fixture");

      for (const [caseName, label] of SUBSTITUTE_LABELS) {
        const expected = resolveBodyLabel(translate, label);
        expect(
          resolveRejection(translate, withLabels(labelled.detail, label)),
          `${locale}/${caseName}`,
        ).toContain(expected);
      }
    },
  );
});
