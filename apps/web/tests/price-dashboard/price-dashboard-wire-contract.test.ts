// M10 X0: the dashboard's wire contract holds only codes (ADR 0095 decision 3), closed lists with no duplicate, and no
// Russian authored text (A-21). It is types and lists, so these checks read the lists and the source.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  KITCHEN_DEFAULTS_FIELDS,
  type DraftChange,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import {
  BULK_REFUSAL_CODES,
  DASHBOARD_CONFLICTS,
  DEFAULTS_REFUSAL_CODES,
  DRAFT_CHANGE_REFUSAL_CODES,
  KITCHEN_DEFAULTS_MEMBERS,
  MAX_USAGE_ITEMS,
  NUMBER_REFUSAL_CODES,
  PUBLISH_TEXT_REFUSAL_CODES,
  TEXT_REFUSAL_CODES,
  type CreateAccessoryRequestWire,
  type CreateHardwareClassRequestWire,
  type DraftChangeRequestWire,
  type PublishRequestWire,
} from "@/price-dashboard/price-dashboard-wire-contract";

const CONTRACT_SOURCE = readFileSync(
  path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../src/price-dashboard/price-dashboard-wire-contract.ts",
  ),
  "utf8",
);

const REFUSAL_LISTS = [
  ["NUMBER_REFUSAL_CODES", NUMBER_REFUSAL_CODES],
  ["TEXT_REFUSAL_CODES", TEXT_REFUSAL_CODES],
  ["DRAFT_CHANGE_REFUSAL_CODES", DRAFT_CHANGE_REFUSAL_CODES],
  ["BULK_REFUSAL_CODES", BULK_REFUSAL_CODES],
  ["DEFAULTS_REFUSAL_CODES", DEFAULTS_REFUSAL_CODES],
  ["PUBLISH_TEXT_REFUSAL_CODES", PUBLISH_TEXT_REFUSAL_CODES],
] as const;

describe("the dashboard wire contract's closed lists", () => {
  it.each(REFUSAL_LISTS)(
    "%s holds upper-case codes, each once, and is frozen",
    (_name, list) => {
      const codes: readonly string[] = list;

      expect(codes.length).toBeGreaterThan(0);
      expect(new Set(codes).size).toBe(codes.length);
      expect(codes.every((code) => /^[A-Z][A-Z_]+$/.test(code))).toBe(true);
      expect(Object.isFrozen(list)).toBe(true);
    },
  );

  it("names each conflict as a state of the data, in lower-case words", () => {
    const conflicts: readonly string[] = DASHBOARD_CONFLICTS;

    expect(new Set(conflicts).size).toBe(conflicts.length);
    expect(conflicts.every((word) => /^[a-z]+(-[a-z]+)+$/.test(word))).toBe(
      true,
    );
    expect(conflicts).toContain("changed-meanwhile");
    expect(conflicts).toContain("no-active-version");
  });

  it("lets a draft change be refused for the closed reasons of a number and of a text", () => {
    const refusals: readonly string[] = DRAFT_CHANGE_REFUSAL_CODES;

    for (const code of [...NUMBER_REFUSAL_CODES, ...TEXT_REFUSAL_CODES]) {
      expect(refusals).toContain(code);
    }
    expect(refusals).toContain("TEXT_STATES_AN_AMOUNT");
  });

  it("maps each of the six defaults' members to one audit code, none twice", () => {
    const codes = Object.values(KITCHEN_DEFAULTS_MEMBERS);

    expect([...codes].sort()).toEqual([...KITCHEN_DEFAULTS_FIELDS].sort());
  });

  it("bounds a usage question", () => {
    expect(Number.isSafeInteger(MAX_USAGE_ITEMS)).toBe(true);
    expect(MAX_USAGE_ITEMS).toBeGreaterThanOrEqual(1);
  });
});

describe("the security amendments' shapes", () => {
  it("lists the five states the amendment adds to the closed refusal list", () => {
    const conflicts: readonly string[] = DASHBOARD_CONFLICTS;

    for (const word of [
      "displayed-revision-ahead",
      "item-unavailable",
      "availability-changed-meanwhile",
      "unknown-version",
      "revision-ahead",
    ]) {
      expect(conflicts).toContain(word);
    }
  });

  it("creates a class or an accessory without an id, because the server mints it (F5)", () => {
    const hardwareClass: CreateHardwareClassRequestWire = {
      expectedDraftRevision: "1",
      value: { name: "x", description: "y" },
      rates: {
        perHingeMinor: 1,
        perDrawerMinor: 2,
        perPushToOpenMinor: 3,
        perLiftMinor: 0,
      },
    };
    const accessory: CreateAccessoryRequestWire = {
      expectedDraftRevision: "1",
      value: { linkedBuildId: "base-sink", perUnitMinor: 1, name: "x" },
    };
    // @ts-expect-error a class is created with all four rates, so the draft never holds one without them
    const withoutRates: CreateHardwareClassRequestWire = {
      expectedDraftRevision: "1",
      value: { name: "x", description: "y" },
    };

    expect([hardwareClass, accessory, withoutRates]).toHaveLength(3);
  });

  it("does not let an ordinary change request carry a creation, which has no id to address it by", () => {
    const creation = {
      address: { kind: "hardware-tier-created", tierId: "hardware.x" },
      value: { name: "x", description: "y" },
    } as const satisfies DraftChange;
    const request: DraftChangeRequestWire = {
      expectedDraftRevision: "1",
      // @ts-expect-error a creation has its own request
      change: creation,
    };

    expect(request.expectedDraftRevision).toBe("1");
  });

  it("lets a publish request carry no book: the server computes it from the stored draft (F10)", () => {
    const request: PublishRequestWire = {
      expectedDraftRevision: "1",
      expectedActiveSequence: 3,
      label: "x",
      note: "y",
      provisional: true,
      // @ts-expect-error a publish request carries no book
      book: {},
    };

    expect(Object.keys(request)).not.toContain("versionId");
  });
});

describe("the dashboard wire contract's source", () => {
  const code = CONTRACT_SOURCE.replace(/\/\*[\s\S]*?\*\//g, "").replace(
    /\/\/.*$/gm,
    "",
  );

  it("has no Russian authored-text member: created rows are Romanian only (A-21)", () => {
    expect(code).not.toMatch(/\b(ru|russian|nameRu|descriptionRu)\b/i);
  });

  it("carries no sentence: every string literal in it is a code or an id", () => {
    const literals = [...code.matchAll(/"([^"\n]*)"/g)].map(
      (match) => match[1],
    );
    const sentences = literals.filter((literal) => /\s/.test(literal ?? ""));

    expect(sentences).toEqual([]);
  });

  it("states no `active` member in the book payload: availability travels beside the book (A-17)", () => {
    const payload = /export interface DashboardBookPayload \{[\s\S]*?\n\}/.exec(
      code,
    )?.[0];

    expect(payload).toBeDefined();
    expect(payload).not.toMatch(/\bactive\b/);
    expect(payload).toMatch(/availability: CatalogueAvailability/);
  });
});
