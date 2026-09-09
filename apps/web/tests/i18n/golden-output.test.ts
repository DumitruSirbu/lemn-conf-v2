import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { INSERTABLE_BODY_DEFINITIONS } from "@lemnaria/configurator-domain";

import correctedRomanian from "../../src/messages/ro.json";
import {
  CATALOGUE_FIXTURES,
  collectContentFunctionFamilies,
  CONTENT_FUNCTION_FAMILIES,
  correctedMessageAt,
  FUNCTION_CONTENT_FIXTURES,
  GOLDEN_FIXTURES,
  RESOLVED_STATIC_CONTENT,
  REJECTION_CATALOGUE_MESSAGE_KEYS,
  REJECTION_CODES,
  REJECTION_FIXTURES,
  STATIC_CONTENT_FIXTURES,
  STATIC_RENDER_ARGUMENT_PATHS,
} from "./golden-output-fixtures";
import { GOLDEN_OUTPUT_SHA256 } from "./golden-output-hashes";
import { isRomanianCopyApproved } from "../support/approved-romanian-messages";

const GATE_O1_SEMANTIC_CORRECTION_KEYS = [
  "globalSettings.materialResetConfirm.body",
  "designLoadError.bodyNotFound",
  "designLoadError.bodyInvalid",
  "designLoadError.startOver",
  "contactPlaceholder.body",
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

interface StagedDivergence {
  readonly gateO1CorrectionKeys: readonly string[];
  readonly reason: string;
}

/**
 * Reviewed differences between later-wave legacy renderers and the corrected source catalogue.
 * This list is temporary: 6B-e and 6B-f remove the remaining witnesses one family at a time.
 */
const PRE_GATE_O1_COLLECTION_DIFFERENCE = {
  gateO1CorrectionKeys: [],
  reason:
    "The collected catalogue already differed from the legacy witness before the owner's 12 semantic Gate O1 edits; the corrected catalogue is the baseline, and this staged entry must disappear with its extraction wave.",
} as const;

const STAGED_LEGACY_DIVERGENCES: Readonly<Record<string, StagedDivergence>> = {
  "catalog.entries.base-3drawer": PRE_GATE_O1_COLLECTION_DIFFERENCE,
  "catalog.entries.base-cabinet": PRE_GATE_O1_COLLECTION_DIFFERENCE,
  "catalog.entries.base-hob-2drawer": PRE_GATE_O1_COLLECTION_DIFFERENCE,
  "catalog.entries.base-hob-oven": PRE_GATE_O1_COLLECTION_DIFFERENCE,
  "catalog.entries.base-sink": PRE_GATE_O1_COLLECTION_DIFFERENCE,
  "catalog.entries.wall-cabinet": PRE_GATE_O1_COLLECTION_DIFFERENCE,
  "catalog.entries.wall-lift": PRE_GATE_O1_COLLECTION_DIFFERENCE,
};

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function sortedUnique(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort();
}

function flattenMessageKeys(
  tree: Readonly<Record<string, unknown>>,
  prefix = "",
): readonly string[] {
  return Object.entries(tree).flatMap(([key, value]) => {
    const path = prefix === "" ? key : `${prefix}.${key}`;
    if (typeof value === "string") return [path];
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      return flattenMessageKeys(
        value as Readonly<Record<string, unknown>>,
        path,
      );
    }
    throw new Error(`${path} is not a catalogue message or namespace`);
  });
}

describe("golden-output fixture coverage", () => {
  it("covers exactly the 23 function-valued legacy content families", () => {
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

  it("covers every rejection code and all 38 top-level rejection messages", () => {
    expect(
      sortedUnique(REJECTION_FIXTURES.map((fixture) => fixture.code)),
    ).toEqual([...REJECTION_CODES].sort());
    expect(
      sortedUnique(REJECTION_FIXTURES.map((fixture) => fixture.messageKey)),
    ).toEqual([...REJECTION_CATALOGUE_MESSAGE_KEYS].sort());
    expect(REJECTION_CODES).toHaveLength(35);
    expect(REJECTION_CATALOGUE_MESSAGE_KEYS).toHaveLength(38);
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
    expect(RESOLVED_STATIC_CONTENT).toHaveLength(105);
    expect(FUNCTION_CONTENT_FIXTURES).toHaveLength(56);
    expect(REJECTION_FIXTURES).toHaveLength(41);
    expect(INSERTABLE_BODY_DEFINITIONS).toHaveLength(16);
    expect(CATALOGUE_FIXTURES).toHaveLength(98);
    expect(GOLDEN_FIXTURES).toHaveLength(300);
    expect(new Set(GOLDEN_FIXTURES.map((fixture) => fixture.id)).size).toBe(
      GOLDEN_FIXTURES.length,
    );
  });
});

describe("corrected-source golden output", () => {
  it("matches the checked-in fixture-id to SHA-256 manifest", () => {
    // An unapproved wording edit belongs to the sole literal copy lock first. Once that corpus is
    // updated, this resumes and requires an explicit rendered-output hash rebaseline.
    if (!isRomanianCopyApproved(correctedRomanian)) return;

    const actual = Object.fromEntries(
      GOLDEN_FIXTURES.map((fixture) => [
        fixture.id,
        sha256(fixture.renderCorrected()),
      ]),
    );
    expect(actual).toEqual(GOLDEN_OUTPUT_SHA256);
  });

  it("keeps every legacy divergence explicit and reviewed", () => {
    // The divergence table records reviewed source/legacy differences, not pending copy edits.
    if (!isRomanianCopyApproved(correctedRomanian)) return;

    const divergentFixtures = GOLDEN_FIXTURES.flatMap((fixture) => {
      const legacy = fixture.renderLegacy();
      const corrected = fixture.renderCorrected();
      return legacy === corrected ? [] : [fixture];
    });
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

  it("records Gate O1's 12 semantic corrections distinctly", () => {
    expect(GATE_O1_SEMANTIC_CORRECTION_KEYS).toHaveLength(12);
    expect(new Set(GATE_O1_SEMANTIC_CORRECTION_KEYS).size).toBe(12);
    expect(flattenMessageKeys(correctedRomanian)).toEqual(
      expect.arrayContaining([...GATE_O1_SEMANTIC_CORRECTION_KEYS]),
    );
  });
});
