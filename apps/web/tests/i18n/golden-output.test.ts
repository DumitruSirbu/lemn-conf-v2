import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { INSERTABLE_BODY_DEFINITIONS } from "@lemnaria/configurator-domain";

import correctedRomanian from "../../src/messages/ro.json";
import {
  CATALOGUE_FIXTURES,
  collectContentFunctionFamilies,
  CONTACT_FIXTURES,
  CONTACT_LEAF_KEYS,
  CONTACT_RENDER_ARGUMENT_PATHS,
  CONTENT_FIXTURES,
  CONTENT_FUNCTION_FAMILIES,
  correctedMessageAt,
  FUNCTION_CONTENT_FIXTURES,
  GOLDEN_FIXTURES,
  RESOLVED_STATIC_CONTENT,
  REJECTION_CATALOGUE_MESSAGE_KEYS,
  REJECTION_CODES,
  REJECTION_FIXTURES,
  REVIEW_FIXTURES,
  REVIEW_LEAF_KEYS,
  ROOM_FIXTURES,
  ROOM_RENDER_ARGUMENT_PATHS,
  STATIC_CONTENT_FIXTURES,
  STATIC_RENDER_ARGUMENT_PATHS,
} from "./golden-output-fixtures";
import { GOLDEN_OUTPUT_SHA256 } from "./golden-output-hashes";
import { isRomanianCopyApproved } from "../support/approved-romanian-messages";
import { catalogueLeaves } from "../support/catalogues";

const GATE_O1_SEMANTIC_CORRECTION_KEYS = [
  "globalSettings.materialResetConfirm.body",
  "designLoadError.bodyNotFound",
  "designLoadError.bodyInvalid",
  "designLoadError.startOver",
  "rejection.BODY_PROBE_UNAVAILABLE",
  "rejection.OPENING_TOO_SHORT",
  "rejection.NO_SNAP_POSITION",
  "rejection.MEASUREMENT_UNUSABLE",
  "rejection.COLUMN_MISMATCH",
  "rejection.COLUMN_MEMBER_NOT_RESIZABLE",
  "rejection.parts.emptySpaceSide",
] as const;

/** Gate O1 corrections still owned by a pre-extraction renderer. Empty after the rejection family
 * moved to the production content resolver in 6B-e. */
const STAGED_GATE_O1_SEMANTIC_CORRECTION_KEYS = [] as const;

/** One reviewed, deliberately accepted difference between a fixture's two renderers. */
interface StagedDivergence {
  readonly gateO1CorrectionKeys: readonly string[];
  readonly reason: string;
}

/**
 * Reviewed differences between a fixture's two renderers, accepted rather than repaired.
 *
 * **Empty since 6B-f, and empty for the reason the table existed rather than by being relaxed.** Its
 * last seven entries were the catalogue group, whose second renderer was `describeBodyLabelAt`'s
 * Romanian — the one author still writing words the catalogue did not. That wave moved the domain to
 * a `BodyLabel` descriptor and deleted the renderer with it, so those seven fixtures have nothing to
 * diverge from. Nothing is staged and nothing is waiting: a fixture that diverges from here on is an
 * unreviewed change, not a scheduled one.
 *
 * **What the check below still covers is the static content group, which is the only one with two
 * independent renderers** — the content resolver's leaf against a direct `translateRuntime(path)`.
 * A resolver that mapped a leaf to the wrong key fails there. The rejection and catalogue groups
 * declare no second renderer at all and are skipped; `GOLDEN_OUTPUT_SHA256` is their gate.
 */
const STAGED_LEGACY_DIVERGENCES: Readonly<Record<string, StagedDivergence>> =
  {};

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function sortedUnique(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort();
}

describe("golden-output fixture coverage", () => {
  it("covers exactly the 34 function-valued legacy content families", () => {
    const actualFamilies = collectContentFunctionFamilies();
    expect(actualFamilies).toEqual([...CONTENT_FUNCTION_FAMILIES].sort());
    expect(
      sortedUnique(
        FUNCTION_CONTENT_FIXTURES.map((fixture) => fixture.sourceKey),
      ),
    ).toEqual(actualFamilies);
  });

  it("covers every static legacy content leaf with rendered corrected output", () => {
    expect(STATIC_CONTENT_FIXTURES.map((fixture) => fixture.sourceKey)).toEqual(
      RESOLVED_STATIC_CONTENT.map(({ path }) => path),
    );
    const staticIcuPaths = RESOLVED_STATIC_CONTENT.flatMap(({ path }) =>
      correctedMessageAt(path).includes("{") ? [path] : [],
    );
    expect(STATIC_RENDER_ARGUMENT_PATHS.sort()).toEqual(staticIcuPaths.sort());
    for (const fixture of STATIC_CONTENT_FIXTURES) {
      expect(fixture.renderCorrected(), fixture.id).not.toBe("");
    }
  });

  it("covers every room leaf, with every ICU one given rendered arguments", () => {
    // Read out of `ro.json` rather than out of the fixture list, so a leaf a later 7F slice adds
    // without a fixture fails here instead of shipping unhashed (ADR 0113 decision 2).
    const roomKeys = catalogueLeaves(correctedRomanian.room).map(
      ([key]) => `room.${key}`,
    );
    expect(ROOM_FIXTURES.map((fixture) => fixture.sourceKey)).toEqual(roomKeys);
    const roomIcuKeys = catalogueLeaves(correctedRomanian.room).flatMap(
      ([key, message]) => (message.includes("{") ? [`room.${key}`] : []),
    );
    expect([...ROOM_RENDER_ARGUMENT_PATHS].sort()).toEqual(roomIcuKeys.sort());
    for (const fixture of ROOM_FIXTURES) {
      expect(fixture.renderCorrected(), fixture.id).not.toBe("");
      expect(fixture.renderCorrected(), fixture.id).not.toContain("{");
    }
  });

  it("covers every review leaf the content resolver does not carry as a static leaf", () => {
    const staticReviewPaths = RESOLVED_STATIC_CONTENT.map(
      ({ path }) => path,
    ).filter((path) => path.startsWith("review."));
    const allReviewKeys = catalogueLeaves(correctedRomanian.review).map(
      ([key]) => `review.${key}`,
    );
    expect(sortedUnique([...staticReviewPaths, ...REVIEW_LEAF_KEYS])).toEqual(
      sortedUnique(allReviewKeys),
    );
    expect(sortedUnique(REVIEW_FIXTURES.map((f) => f.sourceKey))).toEqual(
      sortedUnique(REVIEW_LEAF_KEYS),
    );
    for (const fixture of REVIEW_FIXTURES) {
      expect(fixture.renderCorrected(), fixture.id).not.toBe("");
      expect(fixture.renderCorrected(), fixture.id).not.toContain("{");
    }
  });

  it("covers every contact leaf the content resolver does not carry as a static leaf, with every ICU one given arguments", () => {
    const staticContactPaths = RESOLVED_STATIC_CONTENT.map(
      ({ path }) => path,
    ).filter((path) => path.startsWith("contact."));
    const allContactKeys = catalogueLeaves(correctedRomanian.contact).map(
      ([key]) => `contact.${key}`,
    );
    expect(sortedUnique([...staticContactPaths, ...CONTACT_LEAF_KEYS])).toEqual(
      sortedUnique(allContactKeys),
    );
    expect(sortedUnique(CONTACT_FIXTURES.map((f) => f.sourceKey))).toEqual(
      sortedUnique(CONTACT_LEAF_KEYS),
    );
    const contactIcuKeys = CONTACT_LEAF_KEYS.filter((key) =>
      correctedMessageAt(key).includes("{"),
    );
    expect([...CONTACT_RENDER_ARGUMENT_PATHS].sort()).toEqual(
      contactIcuKeys.sort(),
    );
    for (const fixture of CONTACT_FIXTURES) {
      expect(fixture.renderCorrected(), fixture.id).not.toBe("");
      expect(fixture.renderCorrected(), fixture.id).not.toContain("{");
    }
  });

  it("covers every rejection code and all 39 top-level rejection messages", () => {
    expect(
      sortedUnique(REJECTION_FIXTURES.map((fixture) => fixture.code)),
    ).toEqual([...REJECTION_CODES].sort());
    expect(
      sortedUnique(REJECTION_FIXTURES.map((fixture) => fixture.messageKey)),
    ).toEqual([...REJECTION_CATALOGUE_MESSAGE_KEYS].sort());
    expect(REJECTION_CODES).toHaveLength(36);
    expect(REJECTION_CATALOGUE_MESSAGE_KEYS).toHaveLength(39);
  });

  it("covers both band branches, all width-clause forms, and every side/reason branch", () => {
    const bandSlots = REJECTION_FIXTURES.filter(
      (fixture) => fixture.code === "BAND_MISMATCH",
    ).map((fixture) =>
      fixture.detail.code === "BAND_MISMATCH"
        ? fixture.detail.params.slotBand
        : "unreachable",
    );
    expect(sortedUnique(bandSlots)).toEqual(["base", "wall"]);
    expect(
      sortedUnique(
        REJECTION_FIXTURES.flatMap((fixture) =>
          fixture.widthClauseBranch === undefined
            ? []
            : [fixture.widthClauseBranch],
        ),
      ),
    ).toEqual(["at", "between", "list"]);

    const sideBranches = REJECTION_FIXTURES.flatMap(
      (fixture) => fixture.coveredSideBranches ?? [],
    );
    const branchPart = (branch: string, index: number): string => {
      const part = branch.split(":")[index];
      if (part === undefined)
        throw new Error(`Malformed side branch ${branch}`);
      return part;
    };
    expect(
      sortedUnique(sideBranches.map((branch) => branchPart(branch, 0))),
    ).toEqual(["left", "right"]);
    expect(
      sortedUnique(sideBranches.map((branch) => branchPart(branch, 1))),
    ).toEqual(["absent", "key_taken", "opens_a_gap", "too_narrow"]);
  });

  it("covers every insertable catalogue entry at every declared offered width", () => {
    const expectedIds = INSERTABLE_BODY_DEFINITIONS.flatMap(
      ([buildId, definition]) => {
        expect(definition.sizesMm, buildId).toBeDefined();
        return (definition.sizesMm ?? []).map(
          (widthMm) => `catalog.${buildId}.${String(widthMm)}`,
        );
      },
    );
    expect(CATALOGUE_FIXTURES.map((fixture) => fixture.id)).toEqual(
      expectedIds,
    );
    expect(
      sortedUnique(
        CATALOGUE_FIXTURES.map((fixture) =>
          fixture.sourceKey.replace("catalog.entries.", ""),
        ),
      ),
    ).toEqual(Object.keys(correctedRomanian.catalog.entries).sort());
  });

  it("has one unique stable id for every fixture", () => {
    // M7B U4 S3: +1 for `configure.cameraPresets.wallC`.
    // M7C C1 S3: +4 for the `configure.backConfirm.*` leaves.
    // M8 8C S1: +2 for `review.title` and `review.roundedUpNote`.
    // M8 8C S2: +3 for `review.refusalReasons.*`.
    // M8 8D S3: +4 for `reviewScreen.*`, the review screen's controls.
    // M8 8D S4: +1 for `reviewScreen.saving`.
    // M8 8D fix round: +2 for `reviewScreen.conflict` and `.openEditor`.
    // M8 8D review fix round: +1 for `reviewScreen.topBarTitle`.
    // +14 for the shop notice's labels, channels, callback line and dash (`leadNotice.*`).
    // +2 for `designLoadError.tooManyRequests` and `.tryAgain`.
    // M8 8L S2: +26 for the contact form's static leaves (`contact.*`).
    // M8 8L S6: -4 for the retired `contactPlaceholder.*` and `webglUnavailable.emailLink`.
    // M8 8M S4: +27 for the result screens' static leaves (`submissionResult.*`).
    // M8 8M2 S2: +3 for `submissionResult.alreadySentHeading`, `.alreadySentChangedKitchen` and `.callShop`.
    // +14 for the HTML notice's static leaves (`leadNotice.*`).
    // +2 for the done page's design link, `submissionResult.designLinkLabel` and `.designLinkNote`.
    // M8C P4: +20 for the save-as-preset button and dialog (`presetSave.*`).
    // M8C P6 security review: +1 for `presetSave.refusal.tooLarge`.
    // M8C P8: +11 for Step 1's preset wait, list and Preview pop-up (`presetChooser.*`).
    // +2 for the carousel Select's own failure sentences, `presetChooser.selectFailed` and `.selectLimitReached`.
    // Lot 2 tests round: +1 for `designLoadError.bodyClient`, the design-load error's sentence for a signed-in client.
    // Lot 2 U15c: +1 net for `configure.backConfirm.body`, replaced by `.bodyClient` and `.bodyVisitor`.
    expect(RESOLVED_STATIC_CONTENT).toHaveLength(260);
    // +3 for the notice's subject, line and figure.
    // +2 for `panel.savePausedNotice`'s two times.
    // M8 8M S4: +4 for `submissionResult.channelLine`'s three channels and `.whatsappMessage`.
    // M8 8M2 S2: +2 for `submissionResult.whatsappMessageToShop` and `.alreadySentAdvice`.
    // M8 8M2 S3: -1 for the retired `submissionResult.whatsappMessage`.
    // +6 for `leadNotice.groupCount`'s four counts and `.preheader` with and without a locality.
    expect(FUNCTION_CONTENT_FIXTURES).toHaveLength(75);
    // 7L S3: +2 for `room.suggestion.title` and `room.suggestion.switchToLinear`.
    // +1 for `room.compose.limitReached`.
    expect(ROOM_FIXTURES).toHaveLength(73);
    // M8 8C S1: the review leaves `Content` reaches through `reviewRoomLine`.
    expect(REVIEW_FIXTURES).toHaveLength(12);
    // M8 8L S2: the contact leaves reached by field code and by class of answer: 11 field errors, 7 outcomes.
    // M8 8M S4: -2 for the retired `contact.outcomes.sent` and `.failed`.
    expect(CONTACT_FIXTURES).toHaveLength(16);
    // M10 H1: +1 for `UNKNOWN_HANDLE`.
    expect(REJECTION_FIXTURES).toHaveLength(42);
    expect(INSERTABLE_BODY_DEFINITIONS).toHaveLength(16);
    expect(CATALOGUE_FIXTURES).toHaveLength(98);
    // 7L S3: +2 for `room.suggestion.title` and `room.suggestion.switchToLinear`.
    // M7B U4 S3: +1 for `configure.cameraPresets.wallC`.
    // M7C C1 S3: +4 for the `configure.backConfirm.*` leaves.
    // M8 8C S1: +2 for `review.title` and `review.roundedUpNote`, +12 for the review fixtures.
    // M8 8C S2: +3 for `review.refusalReasons.*`.
    // M8 8D S3: +4 for `reviewScreen.*`, the review screen's controls.
    // M8 8D S4: +1 for `reviewScreen.saving`.
    // M8 8D fix round: +2 for `reviewScreen.conflict` and `.openEditor`.
    // M8 8D review fix round: +1 for `reviewScreen.topBarTitle`.
    // +17 for the shop notice's static leaves and function fixtures.
    // +1 for `room.compose.limitReached`, +2 for `designLoadError.tooManyRequests` and `.tryAgain`.
    // +2 for `panel.savePausedNotice`'s two times.
    // M8 8L S2: +26 contact static leaves, +17 contact leaves reached by code or class of answer.
    // M8 8L S6: -4 for the retired `contactPlaceholder.*` and `webglUnavailable.emailLink`.
    // M8 8L fix-up: +1 for `contact.outcomes.limitedTomorrow`.
    // M8 8M S4: +27 static and +4 function fixtures for `submissionResult.*`, -2 for the retired contact outcomes.
    // M8 8M2 S2: +3 static and +2 function fixtures for `submissionResult.*`.
    // M8 8M2 S3: -1 function fixture for the retired `submissionResult.whatsappMessage`.
    // +14 static and +6 function fixtures for the HTML notice's `leadNotice.*` leaves.
    // +2 static fixtures for the done page's design link (`submissionResult.designLink*`).
    // M8C P4: +20 static fixtures for `presetSave.*`, +2 for the preset-name leaves `Content` reaches through `presetName`.
    // M8C P6 security review: +1 static fixture for `presetSave.refusal.tooLarge`.
    // M8C P8: +11 static fixtures for `presetChooser.*`.
    // +2 static fixtures for `presetChooser.selectFailed` and `.selectLimitReached`.
    // Lot 2 tests round: +1 static fixture for `designLoadError.bodyClient`.
    // Lot 2 U15c: +1 net static fixture for `configure.backConfirm.bodyClient` and `.bodyVisitor` replacing `.body`.
    // M10 H1: +1 rejection fixture for `UNKNOWN_HANDLE`.
    expect(GOLDEN_FIXTURES).toHaveLength(578);
    expect(new Set(GOLDEN_FIXTURES.map((fixture) => fixture.id)).size).toBe(
      GOLDEN_FIXTURES.length,
    );
  });
});

/** The precondition both golden gates stand on: these fixtures render `ro.json`, so an unapproved
 *  wording edit moves hashes for a reason the manifest cannot distinguish from a resolution defect.
 *
 *  **Asserted rather than skipped on.** It used to be an early `return`, which made a red copy lock
 *  render both gates below green in the same run — one failure hiding whatever the other would have
 *  said. Fix the copy lock first, then rebaseline the hashes explicitly. */
function expectApprovedRomanianCopy(): void {
  expect(
    isRomanianCopyApproved(correctedRomanian),
    "Romanian copy is unapproved: settle it against the copy lock before reading these hashes",
  ).toBe(true);
}

describe("corrected-source golden output", () => {
  it("matches the checked-in fixture-id to SHA-256 manifest", () => {
    expectApprovedRomanianCopy();

    const actual = Object.fromEntries(
      GOLDEN_FIXTURES.map((fixture) => [
        fixture.id,
        sha256(fixture.renderCorrected()),
      ]),
    );
    expect(actual).toEqual(GOLDEN_OUTPUT_SHA256);
  });

  it("agrees resolver against catalogue on every content leaf, with nothing unreviewed", () => {
    // Two assertions in one: the content group's resolver and the catalogue tree render every leaf
    // identically, and no group carries a divergence that is not in the reviewed table.
    //
    // A fixture declaring only `renderCorrected` has no second renderer and is skipped — never
    // compared against itself, which would pass unconditionally. The count below is what stops that
    // skip from quietly emptying the check: if the last second renderer is ever deleted, this fails
    // instead of passing over nothing.
    expectApprovedRomanianCopy();

    const divergentFixtures = GOLDEN_FIXTURES.flatMap((fixture) => {
      const renderLegacy = fixture.renderLegacy;
      if (renderLegacy === undefined) return [];
      return renderLegacy() === fixture.renderCorrected() ? [] : [fixture];
    });
    const comparedFixtures = GOLDEN_FIXTURES.filter(
      (fixture) => fixture.renderLegacy !== undefined,
    );
    expect(comparedFixtures.map((fixture) => fixture.group)).toEqual(
      comparedFixtures.map(() => "content"),
    );
    expect(comparedFixtures).toHaveLength(CONTENT_FIXTURES.length);

    const actualDivergenceKeys = sortedUnique(
      divergentFixtures.map((fixture) => fixture.sourceKey),
    );
    expect(actualDivergenceKeys).toEqual(
      Object.keys(STAGED_LEGACY_DIVERGENCES).sort(),
    );
    for (const fixture of divergentFixtures) {
      expect(
        STAGED_LEGACY_DIVERGENCES[fixture.sourceKey],
        fixture.id,
      ).toBeDefined();
    }
    for (const [sourceKey, divergence] of Object.entries(
      STAGED_LEGACY_DIVERGENCES,
    )) {
      expect(divergence.reason, sourceKey).not.toBe("");
      for (const correctionKey of divergence.gateO1CorrectionKeys) {
        expect(GATE_O1_SEMANTIC_CORRECTION_KEYS, sourceKey).toContain(
          correctionKey,
        );
      }
    }
    expect(
      sortedUnique(
        Object.values(STAGED_LEGACY_DIVERGENCES).flatMap(
          ({ gateO1CorrectionKeys }) => gateO1CorrectionKeys,
        ),
      ),
    ).toEqual([...STAGED_GATE_O1_SEMANTIC_CORRECTION_KEYS].sort());
  });
});
