// The golden corpus: one fixture per rendered Romanian output the phase is answerable for.
//
// **Two gates read these, and they ask different questions.** `GOLDEN_OUTPUT_SHA256` pins every
// fixture's rendered output — but what a moved hash *proves* differs by group, so it is not one gate
// standing over all three: it runs the rejection group's resolution path end to end and the content
// group's resolver, while for the catalog group it pins the door-count derivation and the declared
// width sets, not the label resolver. The divergence check reads `renderLegacy`, and by 6B-f only
// one group still has an independent second renderer to offer it:
//
// - **content**, both halves — `renderLegacy` is the content resolver's leaf or closure and
//   `renderCorrected` is a direct `translate(...)` against the catalogue tree. **Two authors**, so
//   the comparison catches a resolver that maps a leaf to the wrong key, and for the 23 function
//   families it catches an ICU argument named wrongly as well. **Do not delete these.** They look
//   like the two below and are not: this group is the only place the divergence check has anything
//   to compare, and removing it to "finish the job" would retire a live gate.
// - **rejection** — declares **no** `renderLegacy` since 6B-f. It had one, and it was the same
//   expression as `renderCorrected`: a guaranteed pass wearing the costume of a check, over the most
//   intricate resolution path in the phase (`resolveBodyLabel` running inside `resolveRejection`
//   before interpolation). Deleting it says "no legacy comparison here" instead of "compares itself
//   and passes"; the SHA manifest is the group's real gate and is untouched. It is a gate over the
//   *path*, not over the resolver's totality: these 41 fixtures carry two descriptors between them
//   (`base-cabinet` and `hood` below), so `resolveBodyLabel` is exercised for 2 of the 16 entries
//   and none of the 13 kinds. `body-label.test.ts` asks the totality question.
// - **catalog** — declares no `renderLegacy` either. Its witness *was* `describeBodyLabelAt`'s
//   Romanian, the last renderer authoring words the catalogue did not, and 6B-f moved the domain to
//   a `BodyLabel` descriptor. There is no second author left to disagree with, and the manifest does
//   not stand in for one: `renderCorrected` here is `correctedCatalogueLabel`, which reads
//   `catalog.entries.<buildId>` straight out of the tree and never calls `resolveBodyLabel` or
//   `describeBodyName`. These 98 hashes therefore move on an approved wording edit — an unapproved
//   one is the copy lock's to report, and the manifest says so rather than skipping — on
//   `doorCountFollowsWidth`, on `sizesMm` or on `deriveDoorCount`. They cannot move on an app-side
//   resolution defect, which is `body-label.test.ts`'s to catch.
//
// **Neither surviving absence is a repoint at `renderCorrected`.** A fixture comparing a resolver to
// itself is layer-3 shape sitting in a layer-4 gate, which is the defect the four-layer test model
// names — see `docs/milestones/M6B-internationalization.md` and `docs/WORKFLOW.md:444`.
import { createTranslator } from "next-intl";

import {
  describeBodyLabelAt,
  deriveDoorCount,
  INSERTABLE_BODY_DEFINITIONS,
  SAMPLE_PRICE_BOOK,
  type BodyLabel,
  type EmptySpaceSide,
  type RejectionCode,
  type RejectionDetail,
} from "@lemnaria/configurator-domain";

import { resolveContent } from "../../src/i18n/content";
import correctedRomanian from "../../src/messages/ro.json";
import { catalogueLeaves } from "../support/catalogues";
import { ro as romanianContent } from "../support/romanian-content";

export type GoldenFixtureGroup =
  | "content"
  | "rejection"
  | "catalog"
  | "room"
  | "review";

export interface GoldenFixture {
  readonly id: string;
  readonly group: GoldenFixtureGroup;
  readonly sourceKey: string;
  /** **A second, independent renderer of the same output — absent unless one genuinely exists.**
   *  Only the static content group has one; see this file's head comment for what each group
   *  declares and why the other two declare nothing rather than comparing themselves. */
  readonly renderLegacy?: () => string;
  readonly renderCorrected: () => string;
}

const translate = createTranslator({
  locale: "ro",
  messages: correctedRomanian,
});
const resolvedContent = resolveContent(translate);

function contentFixture(
  family: string,
  variant: string,
  renderLegacy: () => string,
  renderCorrected: () => string,
): GoldenFixture {
  return {
    id: `content.${family}.${variant}`,
    group: "content",
    sourceKey: family,
    renderLegacy,
    renderCorrected,
  };
}

const PLURAL_BOUNDARIES = [0, 1, 2, 19, 20, 100, 101] as const;

function insertableDefinition(buildId: string) {
  const entry = INSERTABLE_BODY_DEFINITIONS.find(
    ([candidateBuildId]) => candidateBuildId === buildId,
  );
  if (entry === undefined) {
    throw new Error(`Missing fixture catalogue entry ${buildId}`);
  }
  return entry[1];
}

function bodyLabelFromCatalogue(buildId: string, widthMm: number): BodyLabel {
  return describeBodyLabelAt(
    { buildId, definition: insertableDefinition(buildId) },
    widthMm,
  );
}

function requiredFixtureValue<T>(value: T | undefined, id: string): T {
  if (value === undefined) throw new Error(`Missing fixture value ${id}`);
  return value;
}

const BASE_BAND_WORD = romanianContent.panel.bandWords.base.one;

/**
 * The 27 function-valued content families. The gate compares this declaration to a runtime walk of
 * resolved Romanian content, so a newly introduced function cannot silently miss the oracle.
 */
export const CONTENT_FUNCTION_FAMILIES = [
  "panel.headerMeta",
  "panel.countForBody",
  "panel.countForSlot",
  "panel.noOffersForBody",
  "panel.noOffersForSlot",
  "panel.noOffersTooWide",
  "panel.noOffersTooNarrow",
  "panel.offerSize",
  "panel.handleDefaultNote",
  "panel.widthValue",
  "price.amountWithCurrency",
  "priceBreakdown.placementLabel",
  "priceBreakdown.groupHeading",
  "priceBreakdown.wholeKitchenLabel",
  "globalSettings.appliesTo",
  "globalSettings.tierDelta",
  "globalSettings.depthOption",
  "globalSettings.materialResetConfirm.body",
  "globalSettings.applyRefused",
  "globalSettings.pillMaterial",
  "globalSettings.pillColourValue",
  "globalSettings.pillHardware",
  "globalSettings.pillDepth",
  "globalSettings.pillNameAllSettings",
  "leadNotice.subject",
  "leadNotice.line",
  "leadNotice.figure",
] as const;

export const FUNCTION_CONTENT_FIXTURES: readonly GoldenFixture[] = [
  contentFixture(
    "panel.headerMeta",
    "wall-a-base-600x860",
    () => romanianContent.panel.headerMeta("A", BASE_BAND_WORD, 600, 860),
    () =>
      translate("panel.headerMeta", {
        wall: "A",
        bandLabel: BASE_BAND_WORD,
        widthMm: 600,
        heightMm: 860,
      }),
  ),
  ...PLURAL_BOUNDARIES.map((count) =>
    contentFixture(
      "panel.countForBody",
      `count-${String(count)}`,
      () => romanianContent.panel.countForBody(count, BASE_BAND_WORD, 600),
      () =>
        translate("panel.countForBody", {
          count,
          bandWord: BASE_BAND_WORD,
          widthMm: 600,
        }),
    ),
  ),
  ...[0, 1, 2, 20, 101].map((count) =>
    contentFixture(
      "panel.countForSlot",
      `count-${String(count)}`,
      () => romanianContent.panel.countForSlot(count, 700, 860),
      () =>
        translate("panel.countForSlot", {
          count,
          widthMm: 700,
          heightMm: 860,
        }),
    ),
  ),
  ...(
    [
      { id: "base", value: romanianContent.panel.bandWords.base.one },
      { id: "wall", value: romanianContent.panel.bandWords.wall.one },
      { id: "column", value: romanianContent.panel.bandWords.column.one },
    ] as const
  ).map(({ id, value: bandWord }) =>
    contentFixture(
      "panel.noOffersForBody",
      id,
      () => romanianContent.panel.noOffersForBody(bandWord),
      () => translate("panel.noOffersForBody", { bandWord }),
    ),
  ),
  contentFixture(
    "panel.noOffersForSlot",
    "200x700",
    () => romanianContent.panel.noOffersForSlot(200, 700),
    () => translate("panel.noOffersForSlot", { widthMm: 200, heightMm: 700 }),
  ),
  contentFixture(
    "panel.noOffersTooWide",
    "900-over-800",
    () => romanianContent.panel.noOffersTooWide(900, 800),
    () =>
      translate("panel.noOffersTooWide", {
        widthMm: 900,
        maxWidthMm: 800,
      }),
  ),
  contentFixture(
    "panel.noOffersTooNarrow",
    "150-under-200",
    () => romanianContent.panel.noOffersTooNarrow(150, 200),
    () =>
      translate("panel.noOffersTooNarrow", {
        widthMm: 150,
        minWidthMm: 200,
      }),
  ),
  ...(
    [
      [200, 700],
      [800, 2_200],
    ] as const
  ).map(([widthMm, heightMm]) =>
    contentFixture(
      "panel.offerSize",
      `${String(widthMm)}x${String(heightMm)}`,
      () => romanianContent.panel.offerSize(widthMm, heightMm),
      () => translate("panel.offerSize", { widthMm, heightMm }),
    ),
  ),
  ...(
    [
      { id: "steel", value: romanianContent.panel.handleLabels.steel },
      { id: "push", value: romanianContent.panel.handleLabels.push },
    ] as const
  ).map(({ id, value: label }) =>
    contentFixture(
      "panel.handleDefaultNote",
      id,
      () => romanianContent.panel.handleDefaultNote(label),
      () => translate("panel.handleDefaultNote", { label }),
    ),
  ),
  ...[200, 800, 1_200].map((widthMm) =>
    contentFixture(
      "panel.widthValue",
      String(widthMm),
      () => romanianContent.panel.widthValue(widthMm),
      () => translate("panel.widthValue", { widthMm }),
    ),
  ),
  // Already-grouped amounts, because the leaf joins a *string* to a currency and never formats a
  // number — the whole point of ADR 0095 Amendment C. Zero and the seeded kitchen's own figure, so
  // a reordering of the join is caught on the shape a customer actually reads.
  ...["0", "43 000", "1 000 000 000"].map((amount) =>
    contentFixture(
      "price.amountWithCurrency",
      amount.replaceAll(" ", "_"),
      () => romanianContent.price.amountWithCurrency(amount),
      () => translate("price.amountWithCurrency", { amount }),
    ),
  ),
  ...(
    [
      ["base-cabinet", 200],
      ["base-dishwasher", 600],
    ] as const
  ).map(([buildId, widthMm]) => {
    // The message takes a resolved string; the domain publishes a descriptor. Resolving it here is
    // the same resolve-then-interpolate order `priceBreakdown.placementLabel`'s production caller
    // uses, so the fixture exercises the seam rather than a shortcut around it.
    const bodyLabel = resolvedContent.bodyLabel(
      bodyLabelFromCatalogue(buildId, widthMm),
    );
    return contentFixture(
      "priceBreakdown.placementLabel",
      `${buildId}-${String(widthMm)}`,
      () => romanianContent.priceBreakdown.placementLabel(bodyLabel, widthMm),
      () =>
        translate("priceBreakdown.placementLabel", {
          bodyLabel,
          widthMm,
        }),
    );
  }),
  ...(
    [
      ["wall-a-base", "A", romanianContent.priceBreakdown.bandHeadings.base],
      ["wall-b-wall", "B", romanianContent.priceBreakdown.bandHeadings.wall],
      [
        "wall-a-column",
        "A",
        romanianContent.priceBreakdown.bandHeadings.column,
      ],
    ] as const
  ).map(([id, wall, bandWord]) =>
    contentFixture(
      "priceBreakdown.groupHeading",
      id,
      () => romanianContent.priceBreakdown.groupHeading(wall, bandWord),
      () => translate("priceBreakdown.groupHeading", { wall, bandWord }),
    ),
  ),
  ...(
    [
      [
        "material",
        romanianContent.priceBreakdown.wholeKitchenCategories.material,
        requiredFixtureValue(
          SAMPLE_PRICE_BOOK.material.tiers[0]?.name,
          "default material tier",
        ),
      ],
      [
        "hardware",
        romanianContent.priceBreakdown.wholeKitchenCategories.hardware,
        requiredFixtureValue(
          SAMPLE_PRICE_BOOK.hardware.tiers[1]?.name,
          "second hardware tier",
        ),
      ],
      [
        "accessory",
        romanianContent.priceBreakdown.wholeKitchenCategories.accessory,
        SAMPLE_PRICE_BOOK.accessories.dishDryingRack.name,
      ],
    ] as const
  ).map(([id, categoryWord, tierName]) =>
    contentFixture(
      "priceBreakdown.wholeKitchenLabel",
      id,
      () =>
        romanianContent.priceBreakdown.wholeKitchenLabel(
          categoryWord,
          tierName,
        ),
      () =>
        translate("priceBreakdown.wholeKitchenLabel", {
          categoryWord,
          tierName,
        }),
    ),
  ),
  ...PLURAL_BOUNDARIES.map((bodyCount) =>
    contentFixture(
      "globalSettings.appliesTo",
      `count-${String(bodyCount)}`,
      () => romanianContent.globalSettings.appliesTo(bodyCount),
      () => translate("globalSettings.appliesTo", { bodyCount }),
    ),
  ),
  ...[9_000, 18_000].map((addedAmount) =>
    contentFixture(
      "globalSettings.tierDelta",
      addedAmount === 9_000 ? "small-delta" : "large-delta",
      () => romanianContent.globalSettings.tierDelta(String(addedAmount)),
      () =>
        translate("globalSettings.tierDelta", {
          addedAmount: String(addedAmount),
        }),
    ),
  ),
  ...[600, 700].map((cabinetDepthMm) =>
    contentFixture(
      "globalSettings.depthOption",
      String(cabinetDepthMm),
      () => romanianContent.globalSettings.depthOption(cabinetDepthMm),
      () => translate("globalSettings.depthOption", { cabinetDepthMm }),
    ),
  ),
  contentFixture(
    "globalSettings.applyRefused",
    "material",
    () =>
      romanianContent.globalSettings.applyRefused(
        "Material",
        "Materialul ales nu mai este disponibil. Alege altă variantă.",
      ),
    () =>
      translate("globalSettings.applyRefused", {
        settingName: "Material",
        reason: "Materialul ales nu mai este disponibil. Alege altă variantă.",
      }),
  ),
  contentFixture(
    "globalSettings.pillMaterial",
    "pal-melaminat",
    () => romanianContent.globalSettings.pillMaterial("PAL melaminat"),
    () =>
      translate("globalSettings.pillMaterial", { tierName: "PAL melaminat" }),
  ),
  contentFixture(
    "globalSettings.pillColourValue",
    "free-colour",
    () => romanianContent.globalSettings.pillColourValue("#8A6E4B"),
    () =>
      translate("globalSettings.pillColourValue", { colourValue: "#8A6E4B" }),
  ),
  contentFixture(
    "globalSettings.pillHardware",
    "feronerie-hettich",
    () => romanianContent.globalSettings.pillHardware("Feronerie", "Hettich"),
    () =>
      translate("globalSettings.pillHardware", {
        categoryWord: "Feronerie",
        tierName: "Hettich",
      }),
  ),
  ...[600, 700].map((cabinetDepthMm) =>
    contentFixture(
      "globalSettings.pillDepth",
      String(cabinetDepthMm),
      () => romanianContent.globalSettings.pillDepth(cabinetDepthMm),
      () => translate("globalSettings.pillDepth", { cabinetDepthMm }),
    ),
  ),
  contentFixture(
    "globalSettings.pillNameAllSettings",
    "four-settings",
    () =>
      romanianContent.globalSettings.pillNameAllSettings([
        "PAL melaminat",
        "Alb",
        "Feronerie Hettich",
        "Adâncime 600",
      ]),
    () =>
      translate("globalSettings.pillNameAllSettings", {
        openLabel: translate("globalSettings.open"),
        settings: [
          "PAL melaminat",
          "Alb",
          "Feronerie Hettich",
          "Adâncime 600",
        ].join(translate("globalSettings.pillNameJoin")),
      }),
  ),
  ...[0, 1, 2, 20].map((chosenCount) =>
    contentFixture(
      "globalSettings.materialResetConfirm.body",
      `count-${String(chosenCount)}`,
      () =>
        romanianContent.globalSettings.materialResetConfirm.body(chosenCount),
      () =>
        translate("globalSettings.materialResetConfirm.body", { chosenCount }),
    ),
  ),
  contentFixture(
    "leadNotice.subject",
    "reference-token",
    () => romanianContent.leadNotice.subject("LM-TOKEN"),
    () => translate("leadNotice.subject", { reference: "LM-TOKEN" }),
  ),
  contentFixture(
    "leadNotice.line",
    "label-and-value",
    () => romanianContent.leadNotice.line("label-token", "value-token"),
    () =>
      translate("leadNotice.line", {
        label: "label-token",
        value: "value-token",
      }),
  ),
  contentFixture(
    "leadNotice.figure",
    "label-and-amount",
    () => romanianContent.leadNotice.figure("label-token", "43 000 MDL"),
    () =>
      translate("leadNotice.figure", {
        label: "label-token",
        amount: "43 000 MDL",
      }),
  ),
];

interface StaticContent {
  readonly path: string;
  readonly value: string;
}

function collectStaticContent(): readonly StaticContent[] {
  const leaves: StaticContent[] = [];
  function visit(value: unknown, path: string): void {
    if (typeof value === "string") {
      leaves.push({ path, value });
      return;
    }
    if (
      typeof value === "function" ||
      value === null ||
      typeof value !== "object" ||
      Array.isArray(value)
    ) {
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      visit(child, path === "" ? key : `${path}.${key}`);
    }
  }
  visit(romanianContent, "");
  return leaves;
}

export function correctedMessageAt(path: string): string {
  let cursor: unknown = correctedRomanian;
  for (const segment of path.split(".")) {
    if (
      cursor === null ||
      typeof cursor !== "object" ||
      Array.isArray(cursor)
    ) {
      throw new Error(`Corrected catalogue has no message at ${path}`);
    }
    cursor = (cursor as Readonly<Record<string, unknown>>)[segment];
  }
  if (typeof cursor !== "string") {
    throw new Error(`Corrected catalogue has no message leaf at ${path}`);
  }
  return cursor;
}

const translateRuntime = translate as unknown as (
  key: string,
  values?: Readonly<Record<string, string | number>>,
) => string;

const STATIC_RENDER_ARGUMENTS: Readonly<
  Record<string, Readonly<Record<string, string | number>>>
> = {
  "configure.step": { step: 2, totalSteps: 4 },
  "configure.stepPill": { step: 2, totalSteps: 4 },
};

export const STATIC_RENDER_ARGUMENT_PATHS = Object.keys(
  STATIC_RENDER_ARGUMENTS,
);

export const RESOLVED_STATIC_CONTENT = collectStaticContent();

export const STATIC_CONTENT_FIXTURES: readonly GoldenFixture[] =
  RESOLVED_STATIC_CONTENT.map(({ path, value }) => ({
    id: `content.static.${path}`,
    group: "content" as const,
    sourceKey: path,
    renderLegacy: () => value,
    renderCorrected: () => {
      const message = correctedMessageAt(path);
      const values = STATIC_RENDER_ARGUMENTS[path];
      if (values !== undefined) return translateRuntime(path, values);
      if (message.includes("{")) {
        throw new Error(
          `Static legacy message ${path} became ICU without an explicit rendered fixture`,
        );
      }
      return translateRuntime(path);
    },
  }));

export const CONTENT_FIXTURES: readonly GoldenFixture[] = [
  ...STATIC_CONTENT_FIXTURES,
  ...FUNCTION_CONTENT_FIXTURES,
];

/** **Step 1's leaves, and the arguments each ICU one is rendered with.**
 *
 *  `room.planWallLabel` was wave 7F1's only ICU leaf here. Since wave 7F2 S1b (ADR 0126) it reads
 *  *"A · 3600 mm"*: the wall letter and the whole millimetres arrive as arguments and ICU writes the
 *  number with `::group-off`, so the fixture passes a number, as the screen does.
 *
 *  Wave 7F4a's four are sub-state 1F's. `room.compose.roomSummary` takes its three lengths the same
 *  way since S1b, and `room.compose.rowWidth`'s millimetres are a body's declared width, also
 *  formatted by ICU itself.
 *
 *  **The argument *values* here are neutral tokens rather than the words the screen passes.** They
 *  are hash inputs: what the manifest pins is the sentence around them, and a Romanian role name
 *  spelled here would pin this file to the role catalogue as well as to the message. */
const ROOM_RENDER_ARGUMENTS: Readonly<
  Record<string, Readonly<Record<string, string | number>>>
> = {
  "room.planWallLabel": { wall: "A", millimetres: 3600 },
  "room.compose.roomSummary": {
    shape: "L",
    wallA: 3600,
    wallB: 2400,
    height: 2600,
  },
  "room.compose.roomSummaryLinear": {
    shape: "linear",
    wallA: 3600,
    height: 2600,
  },
  "room.compose.roomSummaryU": {
    shape: "U",
    wallA: 3600,
    wallB: 2400,
    wallC: 1200,
    height: 2600,
  },
  "room.compose.rowLabel": { role: "Sink", extent: "600" },
  "room.compose.rowWidth": { millimetres: 600 },
  "room.compose.dropped": { roles: "Fridge" },
  "room.planWallIssue.tooShort": { wall: "B" },
  "room.planWallIssue.tooLong": { wall: "B" },
};

/**
 * **M7 Step 1's copy, hashed straight from the catalogue (ADR 0113 decision 2).**
 *
 * A fourth group rather than rows in `content`, for the reason the head comment gives: these leaves
 * are not on `Content` — the room screen reads `room.*` through next-intl — so the static walk
 * cannot see them, and there is **no second author** to compare against. Declaring a `renderLegacy`
 * here would be a fixture comparing a resolver to itself, which is the shape this file refuses.
 * `GOLDEN_OUTPUT_SHA256` is this group's gate, exactly as it is the rejection group's.
 *
 * Built from `ro.json`'s own `room` subtree rather than from a hand-listed set, so a leaf added by a
 * later 7F slice arrives hashed instead of arriving unwatched.
 */
export const ROOM_FIXTURES: readonly GoldenFixture[] = catalogueLeaves(
  correctedRomanian.room,
).map(([path, message]) => {
  const sourceKey = `room.${path}`;
  return {
    id: sourceKey,
    group: "room" as const,
    sourceKey,
    renderCorrected: () => {
      const values = ROOM_RENDER_ARGUMENTS[sourceKey];
      if (values !== undefined) return translateRuntime(sourceKey, values);
      if (message.includes("{")) {
        throw new Error(
          `Room message ${sourceKey} is ICU without an explicit rendered fixture`,
        );
      }
      return translateRuntime(sourceKey);
    },
  };
});

export const ROOM_RENDER_ARGUMENT_PATHS = Object.keys(ROOM_RENDER_ARGUMENTS);

/** The review leaves `Content` reaches through `reviewRoomLine`, so the static walk cannot see them. Argument values
 *  are neutral tokens: the manifest pins the sentence around them, not the shape or corner words. */
const REVIEW_ROOM_LINE_ARGUMENTS: Readonly<
  Record<string, Readonly<Record<string, string | number>>>
> = {
  "review.roomLine.linear": { shape: "Shape", wallA: 3600, bodies: "Bodies" },
  "review.roomLine.L": {
    shape: "Shape",
    wallA: 3600,
    wallB: 2400,
    corner: "Corner",
    bodies: "Bodies",
  },
  "review.roomLine.U": {
    shape: "Shape",
    wallA: 3600,
    wallB: 2400,
    wallC: 1200,
    bodies: "Bodies",
  },
};

const REVIEW_LEAVES_ON_CONTENT: ReadonlySet<string> = new Set(
  RESOLVED_STATIC_CONTENT.map(({ path }) => path).filter((path) =>
    path.startsWith("review."),
  ),
);

export const REVIEW_LEAF_KEYS: readonly string[] = catalogueLeaves(
  correctedRomanian.review,
)
  .map(([path]) => `review.${path}`)
  .filter((sourceKey) => !REVIEW_LEAVES_ON_CONTENT.has(sourceKey));

export const REVIEW_FIXTURES: readonly GoldenFixture[] = [
  ...PLURAL_BOUNDARIES.map((bodyCount) => ({
    id: `review.bodyCount.count-${String(bodyCount)}`,
    group: "review" as const,
    sourceKey: "review.bodyCount",
    renderCorrected: () => translateRuntime("review.bodyCount", { bodyCount }),
  })),
  ...REVIEW_LEAF_KEYS.filter(
    (sourceKey) => sourceKey !== "review.bodyCount",
  ).map((sourceKey) => ({
    id: sourceKey,
    group: "review" as const,
    sourceKey,
    renderCorrected: () =>
      translateRuntime(sourceKey, REVIEW_ROOM_LINE_ARGUMENTS[sourceKey]),
  })),
];

type RejectionMessageKey = Exclude<
  keyof typeof correctedRomanian.rejection,
  "parts"
>;

interface RejectionFixture extends GoldenFixture {
  readonly code: RejectionCode;
  readonly messageKey: RejectionMessageKey;
  readonly detail: RejectionDetail;
  readonly coveredSideBranches?: readonly `${EmptySpaceSide["side"]}:${EmptySpaceSide["reason"]}`[];
  readonly widthClauseBranch?: "between" | "at" | "list";
}

function rejectionFixture(
  id: string,
  messageKey: RejectionMessageKey,
  detail: RejectionDetail,
  options: Pick<
    RejectionFixture,
    "coveredSideBranches" | "widthClauseBranch"
  > = {},
): RejectionFixture {
  return {
    id: `rejection.${id}`,
    group: "rejection",
    sourceKey: `rejection.${messageKey}`,
    code: detail.code,
    messageKey,
    detail,
    // No `renderLegacy`: there is no second renderer of a refusal, and binding one to this same
    // expression made the divergence check unfailable. `GOLDEN_OUTPUT_SHA256` pins the output.
    renderCorrected: () => resolvedContent.rejection(detail),
    ...options,
  };
}

const noParams = {};
const label = bodyLabelFromCatalogue("base-cabinet", 600);
const memberLabel = bodyLabelFromCatalogue("hood", 600);

export const REJECTION_FIXTURES: readonly RejectionFixture[] = [
  rejectionFixture("void-selected", "VOID_SELECTED", {
    code: "VOID_SELECTED",
    params: noParams,
  }),
  rejectionFixture("target-not-found", "TARGET_NOT_FOUND", {
    code: "TARGET_NOT_FOUND",
    params: noParams,
  }),
  rejectionFixture("invalid-occurred-at", "INVALID_OCCURRED_AT", {
    code: "INVALID_OCCURRED_AT",
    params: noParams,
  }),
  rejectionFixture("body-probe-unavailable", "BODY_PROBE_UNAVAILABLE", {
    code: "BODY_PROBE_UNAVAILABLE",
    params: noParams,
  }),
  rejectionFixture("accessory-not-deletable", "ACCESSORY_NOT_DELETABLE", {
    code: "ACCESSORY_NOT_DELETABLE",
    params: { label },
  }),
  rejectionFixture("not-deletable", "NOT_DELETABLE", {
    code: "NOT_DELETABLE",
    params: { label },
  }),
  rejectionFixture("not-in-library", "NOT_IN_LIBRARY", {
    code: "NOT_IN_LIBRARY",
    params: { buildId: "missing-build" },
  }),
  rejectionFixture("not-insertable", "NOT_INSERTABLE", {
    code: "NOT_INSERTABLE",
    params: { label },
  }),
  rejectionFixture("target-not-replaceable", "TARGET_NOT_REPLACEABLE", {
    code: "TARGET_NOT_REPLACEABLE",
    params: { label },
  }),
  rejectionFixture("band-mismatch-base", "BAND_MISMATCH", {
    code: "BAND_MISMATCH",
    params: { label, bodyBand: "wall", slotBand: "base" },
  }),
  rejectionFixture("band-mismatch-wall", "BAND_MISMATCH", {
    code: "BAND_MISMATCH",
    params: { label, bodyBand: "base", slotBand: "wall" },
  }),
  rejectionFixture("width-too-large", "WIDTH_TOO_LARGE", {
    code: "WIDTH_TOO_LARGE",
    params: { label, requiredMm: 800, availableMm: 750 },
  }),
  rejectionFixture("width-too-small", "WIDTH_TOO_SMALL", {
    code: "WIDTH_TOO_SMALL",
    params: { label, requiredMm: 560, availableMm: 550 },
  }),
  rejectionFixture(
    "width-too-small-unknown-floor",
    "WIDTH_TOO_SMALL_UNKNOWN_FLOOR",
    {
      code: "WIDTH_TOO_SMALL",
      params: { label, availableMm: 550 },
    },
  ),
  rejectionFixture(
    "width-not-supported-body-range",
    "WIDTH_NOT_SUPPORTED_BODY",
    {
      code: "WIDTH_NOT_SUPPORTED",
      params: {
        label,
        sizesMm: [200, 250, 300],
        widthRangesMm: [{ minMm: 200, maxMm: 800 }],
        boundScope: "body",
        availableMm: 175,
      },
    },
    { widthClauseBranch: "between" },
  ),
  rejectionFixture(
    "width-not-supported-column-list",
    "WIDTH_NOT_SUPPORTED_COLUMN",
    {
      code: "WIDTH_NOT_SUPPORTED",
      params: {
        label,
        sizesMm: [450, 600],
        boundScope: "column",
        availableMm: 550,
      },
    },
    { widthClauseBranch: "list" },
  ),
  rejectionFixture(
    "width-not-supported-no-width",
    "WIDTH_NOT_SUPPORTED_NO_WIDTH",
    {
      code: "WIDTH_NOT_SUPPORTED",
      params: {
        label,
        sizesMm: [],
        widthRangesMm: [],
        boundScope: "column",
        availableMm: 600,
      },
    },
  ),
  rejectionFixture(
    "width-not-supported-mixed-ranges",
    "WIDTH_NOT_SUPPORTED_BODY",
    {
      code: "WIDTH_NOT_SUPPORTED",
      params: {
        label,
        sizesMm: [300, 450, 500, 550, 600],
        widthRangesMm: [
          { minMm: 300, maxMm: 300 },
          { minMm: 450, maxMm: 600 },
        ],
        boundScope: "body",
        availableMm: 700,
      },
    },
    { widthClauseBranch: "at" },
  ),
  rejectionFixture("opening-too-short", "OPENING_TOO_SHORT", {
    code: "OPENING_TOO_SHORT",
    params: { availableMm: 150, minimumMm: 200 },
  }),
  rejectionFixture("height-exceeds-level", "HEIGHT_EXCEEDS_LEVEL", {
    code: "HEIGHT_EXCEEDS_LEVEL",
    params: { label, requiredMm: 2_200, availableMm: 700 },
  }),
  rejectionFixture("height-too-large", "HEIGHT_TOO_LARGE", {
    code: "HEIGHT_TOO_LARGE",
    params: { label, requiredMm: 860, availableMm: 700 },
  }),
  rejectionFixture("no-snap-position", "NO_SNAP_POSITION", {
    code: "NO_SNAP_POSITION",
    params: { label },
  }),
  rejectionFixture("built-size-mismatch", "BUILT_SIZE_MISMATCH", {
    code: "BUILT_SIZE_MISMATCH",
    params: { label, requiredMm: 600, builtMm: 599 },
  }),
  rejectionFixture("measurement-unusable", "MEASUREMENT_UNUSABLE", {
    code: "MEASUREMENT_UNUSABLE",
    params: { label, field: "widthM" },
  }),
  rejectionFixture("column-mismatch", "COLUMN_MISMATCH", {
    code: "COLUMN_MISMATCH",
    params: { label },
  }),
  rejectionFixture("not-resizable-fixed", "NOT_RESIZABLE", {
    code: "NOT_RESIZABLE",
    params: { label, cause: "fixed" },
  }),
  rejectionFixture("not-resizable-unresolvable", "NOT_RESIZABLE", {
    code: "NOT_RESIZABLE",
    params: { label, cause: "unresolvable" },
  }),
  rejectionFixture("width-unchanged", "WIDTH_UNCHANGED", {
    code: "WIDTH_UNCHANGED",
    params: { label, widthMm: 600 },
  }),
  rejectionFixture(
    "no-empty-space",
    "NO_EMPTY_SPACE",
    {
      code: "NO_EMPTY_SPACE",
      params: {
        label,
        requestedMm: 650,
        deltaMm: 50,
        sides: [
          { side: "right", reason: "absent" },
          { side: "left", reason: "too_narrow" },
        ],
      },
    },
    { coveredSideBranches: ["right:absent", "left:too_narrow"] },
  ),
  rejectionFixture(
    "column-member-not-resizable",
    "COLUMN_MEMBER_NOT_RESIZABLE",
    {
      code: "COLUMN_MEMBER_NOT_RESIZABLE",
      params: { label, memberLabel },
    },
  ),
  rejectionFixture(
    "dependent-member-not-rebuildable",
    "DEPENDENT_MEMBER_NOT_REBUILDABLE",
    {
      code: "DEPENDENT_MEMBER_NOT_REBUILDABLE",
      params: { label, memberLabel },
    },
  ),
  rejectionFixture(
    "resize-opens-gap",
    "RESIZE_OPENS_GAP",
    {
      code: "RESIZE_OPENS_GAP",
      params: {
        label,
        requestedMm: 550,
        deltaMm: -50,
        sides: [
          { side: "right", reason: "opens_a_gap" },
          { side: "left", reason: "key_taken" },
        ],
      },
    },
    { coveredSideBranches: ["right:opens_a_gap", "left:key_taken"] },
  ),
  rejectionFixture(
    "column-key-collision",
    "COLUMN_KEY_COLLISION",
    {
      code: "COLUMN_KEY_COLLISION",
      params: {
        label,
        requestedMm: 550,
        deltaMm: -50,
        sides: [
          { side: "right", reason: "key_taken" },
          { side: "left", reason: "absent" },
        ],
      },
    },
    { coveredSideBranches: ["right:key_taken", "left:absent"] },
  ),
  rejectionFixture("column-hood-floor", "COLUMN_HOOD_FLOOR", {
    code: "COLUMN_HOOD_FLOOR",
    params: { label, requestedMm: 550, hoodWidthMm: 600 },
  }),
  rejectionFixture("non-integer-millimetres", "NON_INTEGER_MILLIMETRES", {
    code: "NON_INTEGER_MILLIMETRES",
    params: { field: "widthMm", valueMm: 599.5 },
  }),
  rejectionFixture("finish-not-supported", "FINISH_NOT_SUPPORTED", {
    code: "FINISH_NOT_SUPPORTED",
    params: { label },
  }),
  rejectionFixture("finish-not-offered", "FINISH_NOT_OFFERED", {
    code: "FINISH_NOT_OFFERED",
    params: noParams,
  }),
  rejectionFixture("handle-not-supported", "HANDLE_NOT_SUPPORTED", {
    code: "HANDLE_NOT_SUPPORTED",
    params: { label },
  }),
  rejectionFixture("unknown-material-tier", "UNKNOWN_MATERIAL_TIER", {
    code: "UNKNOWN_MATERIAL_TIER",
    params: noParams,
  }),
  rejectionFixture("unknown-hardware-tier", "UNKNOWN_HARDWARE_TIER", {
    code: "UNKNOWN_HARDWARE_TIER",
    params: noParams,
  }),
  rejectionFixture("unknown-cabinet-depth", "UNKNOWN_CABINET_DEPTH", {
    code: "UNKNOWN_CABINET_DEPTH",
    params: noParams,
  }),
];

const catalogueEntryMessages: Readonly<Record<string, string>> =
  correctedRomanian.catalog.entries;

function correctedCatalogueLabel(
  buildId: string,
  definition: (typeof INSERTABLE_BODY_DEFINITIONS)[number][1],
  widthMm: number,
): string {
  const name = catalogueEntryMessages[buildId];
  if (name === undefined) {
    throw new Error(`No corrected catalogue message for ${buildId}`);
  }
  if (definition.doorCountFollowsWidth !== true) return name;
  return translate("catalog.bodyLabelWithDoors", {
    name,
    doors: deriveDoorCount(widthMm),
  });
}

export const CATALOGUE_FIXTURES: readonly GoldenFixture[] =
  INSERTABLE_BODY_DEFINITIONS.flatMap(([buildId, definition]) => {
    if (definition.sizesMm === undefined) {
      throw new Error(
        `Insertable catalogue entry ${buildId} has no offered widths`,
      );
    }
    return definition.sizesMm.map((widthMm) => ({
      id: `catalog.${buildId}.${String(widthMm)}`,
      group: "catalog" as const,
      sourceKey: `catalog.entries.${buildId}`,
      renderCorrected: () =>
        correctedCatalogueLabel(buildId, definition, widthMm),
    }));
  });

export const GOLDEN_FIXTURES: readonly GoldenFixture[] = [
  ...CONTENT_FIXTURES,
  ...ROOM_FIXTURES,
  ...REVIEW_FIXTURES,
  ...REJECTION_FIXTURES,
  ...CATALOGUE_FIXTURES,
];

/** Not content families: they resolve a **domain descriptor** — a `RejectionDetail`, a `BodyLabel`,
 *  a `Band` — through the catalogue rather than standing for an entry the legacy content module once
 *  held. The walk below is the oracle for that module's 23 function-valued families, so a resolver
 *  counted among them would fail the coverage gate for a family that never existed. */
const DESCRIPTOR_RESOLVERS: ReadonlySet<string> = new Set([
  "rejection",
  "bodyLabel",
  "bandLabel",
  // Wave 6B-f2's two, on the same footing: a `PaletteEntryId` and a price book row's `nameKey` are
  // descriptors the domain publishes, not entries the legacy content module ever held.
  "finishName",
  "bookText",
  // A room's walls and body count, resolved through the catalogue; the leaves are not on `Content`.
  "reviewRoomLine",
]);

export function collectContentFunctionFamilies(): readonly string[] {
  const families: string[] = [];
  function visit(value: unknown, path: string): void {
    if (typeof value === "function") {
      if (DESCRIPTOR_RESOLVERS.has(path)) return;
      families.push(path);
      return;
    }
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      visit(child, path === "" ? key : `${path}.${key}`);
    }
  }
  visit(romanianContent, "");
  return families.sort();
}

export const REJECTION_CATALOGUE_MESSAGE_KEYS = Object.keys(
  correctedRomanian.rejection,
).filter((key) => key !== "parts");

export const REJECTION_CODES = [
  "VOID_SELECTED",
  "TARGET_NOT_FOUND",
  "INVALID_OCCURRED_AT",
  "BODY_PROBE_UNAVAILABLE",
  "ACCESSORY_NOT_DELETABLE",
  "NOT_DELETABLE",
  "NOT_IN_LIBRARY",
  "NOT_INSERTABLE",
  "TARGET_NOT_REPLACEABLE",
  "BAND_MISMATCH",
  "WIDTH_TOO_LARGE",
  "WIDTH_TOO_SMALL",
  "WIDTH_NOT_SUPPORTED",
  "OPENING_TOO_SHORT",
  "HEIGHT_EXCEEDS_LEVEL",
  "HEIGHT_TOO_LARGE",
  "NO_SNAP_POSITION",
  "BUILT_SIZE_MISMATCH",
  "MEASUREMENT_UNUSABLE",
  "COLUMN_MISMATCH",
  "NOT_RESIZABLE",
  "WIDTH_UNCHANGED",
  "NO_EMPTY_SPACE",
  "COLUMN_MEMBER_NOT_RESIZABLE",
  "DEPENDENT_MEMBER_NOT_REBUILDABLE",
  "RESIZE_OPENS_GAP",
  "COLUMN_KEY_COLLISION",
  "COLUMN_HOOD_FLOOR",
  "NON_INTEGER_MILLIMETRES",
  "FINISH_NOT_SUPPORTED",
  "FINISH_NOT_OFFERED",
  "HANDLE_NOT_SUPPORTED",
  "UNKNOWN_MATERIAL_TIER",
  "UNKNOWN_HARDWARE_TIER",
  "UNKNOWN_CABINET_DEPTH",
] as const satisfies readonly RejectionCode[];

// The `satisfies` above rejects invented codes; this reverse check rejects a new union member that
// has not been added to the runtime coverage surface.
const REJECTION_CODE_EXHAUSTIVENESS: Record<
  Exclude<RejectionCode, (typeof REJECTION_CODES)[number]>,
  never
> = {};
void REJECTION_CODE_EXHAUSTIVENESS;
