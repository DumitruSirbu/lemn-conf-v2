// M10 X0: the price dashboard's ports are contracts, and these checks hold the properties a contract can lose without
// any behaviour changing (plan §8.4 c, §10 X0 acceptance): no port signature mentions `null`, every answer that could
// be "absent" is a named special-case object, and the book is never a typed value in the store's signatures.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  ALREADY_CLAIMED,
  AVAILABILITY_CHANGED_MEANWHILE,
  AVAILABILITY_REVISION_NOT_FOUND,
  CHANGED_MEANWHILE,
  DashboardStoreError,
  DISPLAYED_REVISION_AHEAD,
  INITIAL_REVISION,
  NEVER_RECORDED,
  NO_ACTIVE_VERSION,
  NONE_SAVED,
  REVISION_AHEAD,
  UNKNOWN_VERSION,
  VERSION_NOT_FOUND,
  type KitchenChangeStore,
  type CatalogueAvailabilityStore,
  type KitchenDefaultsStore,
  type PriceBookStore,
  type PriceNoticeStore,
} from "../src/index.js";

const PORTS_SOURCE = readFileSync(
  path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../src/m10-ports.ts",
  ),
  "utf8",
);

function codeWithoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

const SPECIAL_CASES = [
  ["ALREADY_CLAIMED", ALREADY_CLAIMED, "already-claimed"],
  [
    "AVAILABILITY_CHANGED_MEANWHILE",
    AVAILABILITY_CHANGED_MEANWHILE,
    "availability-changed-meanwhile",
  ],
  [
    "DISPLAYED_REVISION_AHEAD",
    DISPLAYED_REVISION_AHEAD,
    "displayed-revision-ahead",
  ],
  ["REVISION_AHEAD", REVISION_AHEAD, "revision-ahead"],
  ["UNKNOWN_VERSION", UNKNOWN_VERSION, "unknown-version"],
  ["NO_ACTIVE_VERSION", NO_ACTIVE_VERSION, "no-active-version"],
  ["VERSION_NOT_FOUND", VERSION_NOT_FOUND, "version-not-found"],
  ["NONE_SAVED", NONE_SAVED, "none-saved"],
  ["NEVER_RECORDED", NEVER_RECORDED, "never-recorded"],
  ["CHANGED_MEANWHILE", CHANGED_MEANWHILE, "changed-meanwhile"],
  [
    "AVAILABILITY_REVISION_NOT_FOUND",
    AVAILABILITY_REVISION_NOT_FOUND,
    "availability-revision-not-found",
  ],
] as const;

describe("the M10 ports' signatures", () => {
  it("never mention null: an absent answer is a named special-case object", () => {
    const code = codeWithoutComments(PORTS_SOURCE);

    expect(code).not.toMatch(/\bnull\b/);
  });

  it("never name a book type: the book is unknown, and the domain parses it", () => {
    const code = codeWithoutComments(PORTS_SOURCE);

    expect(code).not.toMatch(/\bPriceBook\b(?!Store)/);
    expect(code).toMatch(/readonly book: unknown;/);
  });

  it("never carry an availability flag inside a book or a version", () => {
    const versionShapes = codeWithoutComments(PORTS_SOURCE).match(
      /export interface (ActivePriceVersion|StoredPriceVersion)[\s\S]*?\n}/g,
    );

    expect(versionShapes).toHaveLength(2);
    expect(versionShapes?.join("")).not.toMatch(/\bactive\??:/);
  });

  it("can be answered with the special-case objects alone, which the compiler checks here", async () => {
    const bookStore: Pick<PriceBookStore, "readActive" | "readVersion"> = {
      readActive: () => Promise.resolve(NO_ACTIVE_VERSION),
      readVersion: () => Promise.resolve(VERSION_NOT_FOUND),
    };
    const defaultsStore: Pick<KitchenDefaultsStore, "read"> = {
      read: () => Promise.resolve(NONE_SAVED),
    };
    const noticeStore: Pick<PriceNoticeStore, "readAcknowledged"> = {
      readAcknowledged: () => Promise.resolve(NEVER_RECORDED),
    };
    const availabilityStore: Pick<CatalogueAvailabilityStore, "readAt"> = {
      readAt: () => Promise.resolve(AVAILABILITY_REVISION_NOT_FOUND),
    };
    const changeStore: Pick<KitchenChangeStore, "claimDigestDay"> = {
      claimDigestDay: () => Promise.resolve(ALREADY_CLAIMED),
    };

    expect(await bookStore.readActive()).toBe(NO_ACTIVE_VERSION);
    expect(await bookStore.readVersion("v")).toBe(VERSION_NOT_FOUND);
    expect(await defaultsStore.read()).toBe(NONE_SAVED);
    expect(await noticeStore.readAcknowledged("d")).toBe(NEVER_RECORDED);
    expect(await availabilityStore.readAt("9")).toBe(
      AVAILABILITY_REVISION_NOT_FOUND,
    );
    expect(await changeStore.claimDigestDay("2026-10-26")).toBe(
      ALREADY_CLAIMED,
    );
  });

  it("takes an audit record on every staff write, and on none of the three writes that have no actor (A-22)", () => {
    const code = codeWithoutComments(PORTS_SOURCE);
    const requestsWithAudit = [
      ...code.matchAll(/export interface (\w+) \{[^}]*\baudit:/g),
    ].map((match) => match[1]);

    expect(requestsWithAudit.sort()).toEqual([
      "MarkKitchenSeenRequest",
      "PublishPriceBookRequest",
      "SaveKitchenDefaultsRequest",
      "SetItemActiveRequest",
      "WriteDraftRequest",
    ]);
    expect(code).toMatch(/recordDigested\(\s*roundId: string,/);
    expect(code).not.toMatch(/(recordDigested|claimDigestDay)\([^)]*\baudit\b/);
    expect(code).not.toMatch(
      /export interface PriceNoticeStore \{[^}]*\baudit\b/,
    );
  });

  it("makes a publish expect the active sequence and returns the one it created (F7)", () => {
    const code = codeWithoutComments(PORTS_SOURCE);

    expect(code).toMatch(/readonly expectedActiveSequence: number;/);
    expect(code).toMatch(/readonly sequenceNumber: number;/);
  });

  it("starts every revision at the one value a row that does not exist yet reads as", () => {
    expect(INITIAL_REVISION).toBe("0");
  });
});

describe("the special-case answers", () => {
  it.each(SPECIAL_CASES)(
    "%s is one frozen object with a kind a caller can switch on",
    (_name, answer, kind) => {
      expect(answer).toEqual({ kind });
      expect(Object.isFrozen(answer)).toBe(true);
    },
  );

  it("are distinct, so one cannot be mistaken for another", () => {
    const kinds = SPECIAL_CASES.map(([, answer]) => answer.kind);

    expect(new Set(kinds).size).toBe(SPECIAL_CASES.length);
  });
});

describe("DashboardStoreError", () => {
  it("states the operation and the kind of failure, and holds no value", () => {
    const error = new DashboardStoreError(
      "publish the price book",
      "database",
      {
        cause: new Error(
          "duplicate key value violates constraint with 'November adjustments'",
        ),
      },
    );

    expect(error.message).toBe(
      "The price dashboard store could not publish the price book: database.",
    );
    expect(error.message).not.toContain("November adjustments");
    expect(error.operation).toBe("publish the price book");
    expect(error.failure).toBe("database");
    expect(error.name).toBe("DashboardStoreError");
  });
});
