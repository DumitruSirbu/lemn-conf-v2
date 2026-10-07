import { createHash } from "node:crypto";

import {
  assertDesignValidForCatalog,
  InvalidDesignError,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  validateDesignForCatalog,
  type Design,
} from "@lemnaria/configurator-domain";
import type { DesignRevision } from "@lemnaria/persistence";
import { isValidElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import DesignPage from "../../src/app/[locale]/d/[id]/page";
import ReviewPage from "../../src/app/[locale]/d/[id]/review/page";

/**
 * The review route is a second door to a design that opens only in its owning browser (ADR 0114 decision 5). This is
 * the editor page's gate table (`qa-7e3b-design-page-gate.adversarial.test.ts`) run against both doors: each case
 * must refuse the review exactly as it refuses the editor, class for class (Amendment H5), and the two doors must
 * answer one request with one thing. The no-cookie and malformed cases must issue no query.
 */

const VISITOR_COOKIE_NAME = "__Host-lemnaria_visitor";
const OWNER_VALUE = "O".repeat(43);

type LoadOwnedResult =
  | { kind: "found"; design: Design; revision: DesignRevision }
  | { kind: "none" };

type Door = "editor" | "review";

const state = vi.hoisted(() => ({
  cookieValue: undefined as string | undefined,
  cookieName: "__Host-lemnaria_visitor",
}));
const loadOwned = vi.hoisted(() =>
  vi.fn<
    (lookup: { id: string; visitorHash: string }) => Promise<LoadOwnedResult>
  >(),
);
const designLoadError = vi.hoisted(() => vi.fn(() => null));
const hydrateAndConfigure = vi.hoisted(() => vi.fn(() => null));
const hydrateAndReview = vi.hoisted(() => vi.fn(() => null));

vi.mock("@/lib/server/repository", () => ({
  getRepository: () => ({ loadOwned }),
}));
vi.mock("@/app/d/[id]/hydrate-and-configure", () => ({
  HydrateAndConfigure: hydrateAndConfigure,
}));
vi.mock("@/app/d/[id]/review/hydrate-and-review", () => ({
  HydrateAndReview: hydrateAndReview,
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

function designNamingAnUnknownBody(): Design {
  const [first, ...rest] = KITCHEN_L_DESIGN.placements;
  if (first === undefined) throw new Error("the fixture holds no placement");
  return {
    ...KITCHEN_L_DESIGN,
    placements: [
      {
        ...first,
        body: { ...first.body, buildId: "no-such-body-in-catalogue" },
      },
      ...rest,
    ],
  };
}

interface StoredRow {
  ownerHash: string | null;
  isInvalid?: boolean;
  hasUnknownBody?: boolean;
}

/** What the real `loadOwned` answers: `found` for the owner, the load seam's refusal only for the owner of a row it
 *  refuses (`assertDesignValidForCatalog`, run for real), and `none` for every other combination (Amendment H2). */
function ownerOnlyRepository(rows: Record<string, StoredRow>): void {
  loadOwned.mockImplementation(({ id, visitorHash }) => {
    const row = rows[id];
    if (row?.ownerHash !== visitorHash)
      return Promise.resolve({ kind: "none" });
    if (row.isInvalid === true)
      return Promise.reject(
        new InvalidDesignError("stored document is invalid"),
      );
    if (row.hasUnknownBody === true) {
      assertDesignValidForCatalog(
        designNamingAnUnknownBody(),
        KITCHEN_L_BODY_CATALOG,
      );
    }
    return Promise.resolve({
      kind: "found",
      design: KITCHEN_L_DESIGN,
      revision: "1",
    });
  });
}

async function renderDoor(
  door: Door,
  locale: "ro" | "ru",
  id: string,
): Promise<unknown> {
  const params = Promise.resolve({ locale, id });
  return door === "editor" ? DesignPage({ params }) : ReviewPage({ params });
}

function propsOfLoadError(element: unknown): unknown {
  if (!isValidElement<{ reason: string }>(element))
    throw new Error("the page returned a non-element");
  if (element.type !== designLoadError)
    throw new Error("the page rendered something other than DesignLoadError");
  return element.props;
}

beforeEach(() => {
  loadOwned.mockReset();
  hydrateAndConfigure.mockClear();
  hydrateAndReview.mockClear();
  state.cookieValue = undefined;
  state.cookieName = VISITOR_COOKIE_NAME;
  ownerOnlyRepository({
    "owned-row": { ownerHash: sha256Hex(OWNER_VALUE) },
    "owned-invalid-row": { ownerHash: sha256Hex(OWNER_VALUE), isInvalid: true },
    "owned-unknown-body-row": {
      ownerHash: sha256Hex(OWNER_VALUE),
      hasUnknownBody: true,
    },
    "null-owner-row": { ownerHash: null },
  });
});

describe("the gate, per refusal case, locale and door", () => {
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
      id: "owned-row",
      reachesRepository: false,
    },
    { name: "empty", cookie: "", id: "owned-row", reachesRepository: false },
    {
      name: "malformed (42 chars)",
      cookie: "O".repeat(42),
      id: "owned-row",
      reachesRepository: false,
    },
    {
      name: "malformed (illegal char)",
      cookie: `${"O".repeat(42)}.`,
      id: "owned-row",
      reachesRepository: false,
    },
    {
      name: "case-variant name",
      cookie: OWNER_VALUE,
      cookieName: "__host-lemnaria_visitor",
      id: "owned-row",
      reachesRepository: false,
    },
    {
      name: "foreign",
      cookie: "F".repeat(43),
      id: "owned-row",
      reachesRepository: true,
    },
    {
      name: "foreign, invalid document",
      cookie: "F".repeat(43),
      id: "owned-invalid-row",
      reachesRepository: true,
    },
    {
      name: "foreign, unknown body",
      cookie: "F".repeat(43),
      id: "owned-unknown-body-row",
      reachesRepository: true,
    },
    {
      name: "nonexistent id",
      cookie: OWNER_VALUE,
      id: "no-such-row",
      reachesRepository: true,
    },
    {
      name: "null-owner row",
      cookie: OWNER_VALUE,
      id: "null-owner-row",
      reachesRepository: true,
    },
  ];

  for (const door of ["editor", "review"] as const)
    for (const locale of ["ro", "ru"] as const)
      for (const testCase of cases)
        it(`${door} / ${locale} / ${testCase.name}: renders exactly { reason: "unavailable" }`, async () => {
          state.cookieValue = testCase.cookie;
          state.cookieName = testCase.cookieName ?? VISITOR_COOKIE_NAME;

          const page = await renderDoor(door, locale, testCase.id);

          expect(propsOfLoadError(page)).toEqual({ reason: "unavailable" });
          expect(loadOwned).toHaveBeenCalledTimes(
            testCase.reachesRepository ? 1 : 0,
          );
          expect(hydrateAndConfigure).not.toHaveBeenCalled();
          expect(hydrateAndReview).not.toHaveBeenCalled();
        });

  for (const locale of ["ro", "ru"] as const)
    for (const testCase of cases)
      it(`${locale} / ${testCase.name}: the two doors answer the same element`, async () => {
        state.cookieValue = testCase.cookie;
        state.cookieName = testCase.cookieName ?? VISITOR_COOKIE_NAME;

        const editor = await renderDoor("editor", locale, testCase.id);
        const review = await renderDoor("review", locale, testCase.id);

        expect(review).toEqual(editor);
      });
});

describe("the owner", () => {
  it("is served the review with the stored design", async () => {
    state.cookieValue = OWNER_VALUE;

    const page = await renderDoor("review", "ro", "owned-row");

    if (!isValidElement<Record<string, unknown>>(page))
      throw new Error("non-element");
    expect(page.type).toBe(hydrateAndReview);
    expect(page.props).toEqual({
      design: KITCHEN_L_DESIGN,
      designId: "owned-row",
      revision: "1",
    });
    expect(loadOwned).toHaveBeenCalledWith({
      id: "owned-row",
      visitorHash: sha256Hex(OWNER_VALUE),
    });
  });

  it("is told the row is invalid, on both doors, and only the owner", async () => {
    state.cookieValue = OWNER_VALUE;

    for (const door of ["editor", "review"] as const)
      expect(
        propsOfLoadError(await renderDoor(door, "ro", "owned-invalid-row")),
      ).toEqual({ reason: "invalid" });
  });
});

describe("a stored row the load seam refuses", () => {
  it("is the invalid page on both doors, through one function, and reaches no error boundary", async () => {
    state.cookieValue = OWNER_VALUE;

    const editor = await renderDoor("editor", "ro", "owned-unknown-body-row");
    const review = await renderDoor("review", "ro", "owned-unknown-body-row");

    expect(propsOfLoadError(review)).toEqual({ reason: "invalid" });
    expect(review).toEqual(editor);
    expect(hydrateAndReview).not.toHaveBeenCalled();
  });

  it("is refused by the real load seam, as UNKNOWN_BUILD_ID alone", () => {
    const issues = validateDesignForCatalog(
      designNamingAnUnknownBody(),
      KITCHEN_L_BODY_CATALOG,
    );

    expect(issues.map((issue) => issue.code)).toEqual(["UNKNOWN_BUILD_ID"]);
    expect(() => {
      assertDesignValidForCatalog(
        designNamingAnUnknownBody(),
        KITCHEN_L_BODY_CATALOG,
      );
    }).toThrow(InvalidDesignError);
  });
});

describe("a driver failure", () => {
  it.each(["editor", "review"] as const)(
    "is rethrown by the %s door, never mapped to a refusal",
    async (door) => {
      state.cookieValue = OWNER_VALUE;
      loadOwned.mockRejectedValue(new Error("connection reset"));

      await expect(renderDoor(door, "ro", "owned-row")).rejects.toThrow(
        "connection reset",
      );
    },
  );
});
