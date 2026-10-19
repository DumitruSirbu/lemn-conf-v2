import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  InvalidDesignError,
  KITCHEN_L_DESIGN,
  type Design,
} from "@lemnaria/configurator-domain";
import type { DesignRevision } from "@lemnaria/persistence";
import { isValidElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import DesignPage from "../../src/app/[locale]/d/[id]/page";

/**
 * M7 wave 7E3b adversarial QA for `/[locale]/d/{id}` (criterion 1 and the page half of criterion
 * 2): every refusal case renders the one `"unavailable"` element, the no-cookie and malformed cases
 * never reach the repository, a stranger never reaches `InvalidDesignError`, and no web module can
 * reach the ungated `load` at all.
 */

const VISITOR_COOKIE_NAME = "__Host-lemnaria_visitor";
const OWNER_VALUE = "O".repeat(43);
/** Well-formed design ids (`isDesignId`: 21 characters of `A-Za-z0-9_-`, 8L.13): a row is reachable only through one. */
const OWNED_ROW_ID = "owned-row-0000000000A";
const OWNED_INVALID_ROW_ID = "owned-invalid-row-00B";
const NULL_OWNER_ROW_ID = "null-owner-row-00000C";
const NO_SUCH_ROW_ID = "no-such-row-00000000D";
const SOURCE_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../src",
);

type LoadOwnedResult =
  | { kind: "found"; design: Design; revision: DesignRevision }
  | { kind: "none" };

const state = vi.hoisted(() => ({
  cookieValue: undefined as string | undefined,
  cookieName: "__Host-lemnaria_visitor",
}));
const loadOwned = vi.hoisted(() =>
  vi.fn<
    (lookup: {
      id: string;
      accessor: { visitorHash?: string; accountId?: string };
    }) => Promise<LoadOwnedResult>
  >(),
);
const designLoadError = vi.hoisted(() => vi.fn(() => null));
const hydrateAndConfigure = vi.hoisted(() => vi.fn(() => null));

vi.mock("@/lib/server/repository", () => ({
  getRepository: () => ({ loadOwned }),
}));
vi.mock("@/app/d/[id]/hydrate-and-configure", () => ({
  HydrateAndConfigure: hydrateAndConfigure,
}));
vi.mock("@/app/d/[id]/design-load-error", () => ({
  DesignLoadError: designLoadError,
}));
vi.mock("next/headers", () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) =>
        name === state.cookieName && state.cookieValue !== undefined
          ? { value: state.cookieValue }
          : undefined,
    }),
}));

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** What the real `loadOwned` answers: `found` for the owner, `InvalidDesignError` only for the
 *  owner of an invalid row, and `none` for every other combination (Amendment H2). */
function ownerOnlyRepository(
  rows: Record<string, { ownerHash: string | null; isInvalid?: boolean }>,
): void {
  loadOwned.mockImplementation(({ id, accessor }) => {
    const row = rows[id];
    if (row === undefined || row.ownerHash !== accessor.visitorHash)
      return Promise.resolve({ kind: "none" });
    if (row.isInvalid === true)
      return Promise.reject(
        new InvalidDesignError("stored document is invalid"),
      );
    return Promise.resolve({
      kind: "found",
      design: KITCHEN_L_DESIGN,
      revision: "1",
    });
  });
}

async function renderPage(locale: "ro" | "ru", id: string): Promise<unknown> {
  return DesignPage({ params: Promise.resolve({ locale, id }) });
}

function reasonOf(element: unknown): unknown {
  if (!isValidElement<{ reason: string }>(element))
    throw new Error("the page returned a non-element");
  if (element.type !== designLoadError)
    throw new Error("the page rendered something other than DesignLoadError");
  return element.props;
}

beforeEach(() => {
  loadOwned.mockReset();
  state.cookieValue = undefined;
  state.cookieName = VISITOR_COOKIE_NAME;
  ownerOnlyRepository({
    [OWNED_ROW_ID]: { ownerHash: sha256Hex(OWNER_VALUE) },
    [OWNED_INVALID_ROW_ID]: {
      ownerHash: sha256Hex(OWNER_VALUE),
      isInvalid: true,
    },
    [NULL_OWNER_ROW_ID]: { ownerHash: null },
  });
});

describe("criterion 1 — the page gate, per refusal case and locale", () => {
  const cases: {
    name: string;
    cookie: string | undefined;
    cookieName?: string;
    id: string;
    reachesRepository: boolean;
  }[] = [
    {
      name: "no cookie",
      cookie: undefined,
      id: OWNED_ROW_ID,
      reachesRepository: false,
    },
    { name: "empty", cookie: "", id: OWNED_ROW_ID, reachesRepository: false },
    {
      name: "malformed (42 chars)",
      cookie: "O".repeat(42),
      id: OWNED_ROW_ID,
      reachesRepository: false,
    },
    {
      name: "malformed (illegal char)",
      cookie: `${"O".repeat(42)}.`,
      id: OWNED_ROW_ID,
      reachesRepository: false,
    },
    {
      name: "case-variant name",
      cookie: OWNER_VALUE,
      cookieName: "__host-lemnaria_visitor",
      id: OWNED_ROW_ID,
      reachesRepository: false,
    },
    {
      name: "foreign",
      cookie: "F".repeat(43),
      id: OWNED_ROW_ID,
      reachesRepository: true,
    },
    {
      name: "foreign, invalid document",
      cookie: "F".repeat(43),
      id: OWNED_INVALID_ROW_ID,
      reachesRepository: true,
    },
    {
      name: "nonexistent id",
      cookie: OWNER_VALUE,
      id: NO_SUCH_ROW_ID,
      reachesRepository: true,
    },
    {
      name: "null-owner row",
      cookie: OWNER_VALUE,
      id: NULL_OWNER_ROW_ID,
      reachesRepository: true,
    },
  ];

  for (const locale of ["ro", "ru"] as const)
    for (const testCase of cases)
      it(`${locale} / ${testCase.name}: renders exactly { reason: "unavailable" }`, async () => {
        state.cookieValue = testCase.cookie;
        state.cookieName = testCase.cookieName ?? VISITOR_COOKIE_NAME;

        const page = await renderPage(locale, testCase.id);

        expect(reasonOf(page)).toEqual({ reason: "unavailable" });
        expect(loadOwned).toHaveBeenCalledTimes(
          testCase.reachesRepository ? 1 : 0,
        );
        expect(hydrateAndConfigure).not.toHaveBeenCalled();
      });

  it("a segment that is not a design id's shape is refused as unavailable without reaching the repository", async () => {
    state.cookieValue = OWNER_VALUE;

    const page = await renderPage("ro", "owned-row");

    expect(reasonOf(page)).toEqual({ reason: "unavailable" });
    expect(loadOwned).not.toHaveBeenCalled();
  });

  it("the owner is served the editor with the stored design", async () => {
    state.cookieValue = OWNER_VALUE;

    const page = await renderPage("ro", OWNED_ROW_ID);

    if (!isValidElement(page)) throw new Error("non-element");
    expect(page.type).toBe(hydrateAndConfigure);
    expect(loadOwned).toHaveBeenCalledWith({
      id: OWNED_ROW_ID,
      accessor: { visitorHash: sha256Hex(OWNER_VALUE) },
    });
  });

  it("the owner of an invalid row, and only the owner, is told it is invalid", async () => {
    state.cookieValue = OWNER_VALUE;

    expect(reasonOf(await renderPage("ro", OWNED_INVALID_ROW_ID))).toEqual({
      reason: "invalid",
    });
  });

  it("a driver failure is rethrown, never mapped to the refusal", async () => {
    state.cookieValue = OWNER_VALUE;
    loadOwned.mockRejectedValue(new Error("connection reset"));

    await expect(renderPage("ro", OWNED_ROW_ID)).rejects.toThrow(
      "connection reset",
    );
  });
});

describe("criterion 1 must-not — no web module reaches the ungated read", () => {
  function sourceFiles(directory: string): string[] {
    return readdirSync(directory).flatMap((entry) => {
      const path = join(directory, entry);
      if (statSync(path).isDirectory()) return sourceFiles(path);
      return /\.(ts|tsx)$/.test(entry) ? [path] : [];
    });
  }

  it("no source file calls getRepository().load( or holds the repository and calls .load(", () => {
    const offenders = sourceFiles(SOURCE_DIR).filter((path) => {
      const source = readFileSync(path, "utf8");
      return (
        /getRepository\(\)\s*\.\s*load\s*\(/.test(source) ||
        (source.includes("getRepository(") && /\.load\s*\(/.test(source))
      );
    });

    expect(offenders).toEqual([]);
  });
});
