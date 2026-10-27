import { createHash } from "node:crypto";

import {
  CURRENT_SCHEMA_VERSION,
  InvalidDesignError,
  KITCHEN_L_DESIGN,
  canonicalSerializeDesign,
  type Design,
} from "@lemnaria/configurator-domain";
import { FakeSentKitchenViewRepository } from "@lemnaria/persistence";
import { isValidElement, type ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PRICE_STORES_GLOBAL_KEY } from "@/lib/server/price-stores";

import { withoutPriceBook } from "../support/price-book-wrapper";

const loadShared = vi.hoisted(() => vi.fn());
const reportDesignFailure = vi.hoisted(() => vi.fn());
const designLoadError = vi.hoisted(() => vi.fn(() => null));
const sharedDesignView = vi.hoisted(() => vi.fn(() => null));
const sentKitchenViews = vi.hoisted(() => ({
  repository: undefined as FakeSentKitchenViewRepository | undefined,
}));

vi.mock("@/lib/server/repository", () => ({
  getShareLinkRepository: () => ({ loadShared }),
  getSentKitchenViewRepository: () => sentKitchenViews.repository,
}));
vi.mock("@/lib/server/design-failure-log", () => ({
  reportDesignFailure,
}));
vi.mock("@/app/d/[id]/design-load-error", () => ({
  DesignLoadError: designLoadError,
}));
vi.mock("@/app/s/[token]/shared-design-view", () => ({
  SharedDesignView: sharedDesignView,
}));

const { default: SharedDesignPage } = await import(
  "@/app/[locale]/s/[token]/page"
);

const WELL_FORMED_TOKEN = "abcDEF123456";
const OTHER_WELL_FORMED_TOKEN = "zyxWVU654321";
const MALFORMED_TOKEN = "not-a-token";
const SHA256_HEX = /^[0-9a-f]{64}$/;

function resetDoubles(): void {
  loadShared.mockReset();
  reportDesignFailure.mockReset();
  designLoadError.mockClear();
  sharedDesignView.mockClear();
  sentKitchenViews.repository = new FakeSentKitchenViewRepository();
}

function sentKitchenViewsOf(): FakeSentKitchenViewRepository {
  if (sentKitchenViews.repository === undefined)
    throw new Error("the frozen views' fake is made before each test");
  return sentKitchenViews.repository;
}

describe("the share view's page component (M7 wave 7E3c D6)", () => {
  beforeEach(resetDoubles);

  it("issues no query for a malformed token (criterion 10)", async () => {
    const frozenLoad = vi.spyOn(sentKitchenViewsOf(), "load");

    const page = await SharedDesignPage({
      params: Promise.resolve({ token: MALFORMED_TOKEN }),
    });

    expect(loadShared).not.toHaveBeenCalled();
    expect(frozenLoad).not.toHaveBeenCalled();
    if (!isValidElement(page)) throw new Error("expected an element");
    expect(page.type).toBe(designLoadError);
    expect(page.props).toEqual({ reason: "not-found" });
  });

  it("hashes a well-formed token and looks it up", async () => {
    loadShared.mockResolvedValue({ kind: "none" });

    await SharedDesignPage({
      params: Promise.resolve({ token: WELL_FORMED_TOKEN }),
    });

    // The digest is taken here with the platform's own hash, not with the module the page calls: computed by that
    // module, a hash function that returned its input would agree with itself.
    const digest = createHash("sha256").update(WELL_FORMED_TOKEN).digest("hex");
    expect(digest).toMatch(SHA256_HEX);
    expect(loadShared).toHaveBeenCalledTimes(1);
    expect(loadShared).toHaveBeenCalledWith(digest);
  });

  // Coordinator's ruling, 2026-09-23 (recorded in the page's own doc comment): criterion 10's
  // identity is required between an **unknown** and a **revoked** token — both well-formed, both
  // awaited through `loadShared` — which a production build measured byte-identical. A malformed
  // token is accepted as *not* required to match those two at the byte level (it skips the query
  // and diverges only in Next's internal RSC chunk numbering); this suite still pins it at the
  // React-element level, which is what a page render can assert.
  it("renders the same unavailable response for an unknown token as for a revoked one (criterion 10)", async () => {
    loadShared.mockResolvedValue({ kind: "none" });
    const unknownPage = await SharedDesignPage({
      params: Promise.resolve({ token: WELL_FORMED_TOKEN }),
    });
    const revokedPage = await SharedDesignPage({
      params: Promise.resolve({ token: OTHER_WELL_FORMED_TOKEN }),
    });

    if (!isValidElement(unknownPage) || !isValidElement(revokedPage))
      throw new Error("expected both to be elements");
    expect(unknownPage.type).toBe(revokedPage.type);
    expect(unknownPage.props).toEqual(revokedPage.props);
  });

  it("renders the same element type and props for a malformed token as for a well-formed but unknown one", async () => {
    loadShared.mockResolvedValue({ kind: "none" });
    const malformedPage = await SharedDesignPage({
      params: Promise.resolve({ token: MALFORMED_TOKEN }),
    });
    const nonePage = await SharedDesignPage({
      params: Promise.resolve({ token: WELL_FORMED_TOKEN }),
    });

    if (!isValidElement(malformedPage) || !isValidElement(nonePage))
      throw new Error("expected both to be elements");
    expect(malformedPage.type).toBe(nonePage.type);
    expect(malformedPage.props).toEqual(nonePage.props);
  });

  it("mounts SharedDesignView keyed by the token, with the migrated design and nothing else identifying it (criterion 13)", async () => {
    loadShared.mockResolvedValue({ kind: "found", design: KITCHEN_L_DESIGN });

    const page = withoutPriceBook(
      await SharedDesignPage({
        params: Promise.resolve({ token: WELL_FORMED_TOKEN }),
      }),
    );

    if (!isValidElement(page)) throw new Error("expected an element");
    expect(page.type).toBe(sharedDesignView);
    expect(page.key).toBe(WELL_FORMED_TOKEN);
    // `key` never reaches `props` — React strips it — so this also proves the token itself is not
    // handed to the component as ordinary data.
    expect(page.props).toEqual({ design: KITCHEN_L_DESIGN });
  });

  it("logs a defect of the price book under the price book's own cause and never as share-read, then rethrows", async () => {
    loadShared.mockResolvedValue({ kind: "found", design: KITCHEN_L_DESIGN });
    const written = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    Reflect.set(
      globalThis,
      PRICE_STORES_GLOBAL_KEY,
      Promise.resolve({
        priceBook: {
          readActive: () => Promise.reject(new TypeError("a defect")),
        },
        availability: {},
      }),
    );
    try {
      await expect(
        SharedDesignPage({
          params: Promise.resolve({ token: WELL_FORMED_TOKEN }),
        }),
      ).rejects.toThrow("a defect");
    } finally {
      Reflect.deleteProperty(globalThis, PRICE_STORES_GLOBAL_KEY);
    }

    expect(reportDesignFailure).not.toHaveBeenCalled();
    expect(written.mock.calls.map((call) => call[1] as unknown)).toEqual([
      { event: "no-price-book", cause: "unexpected" },
    ]);
    written.mockRestore();
  });

  it('renders reason="invalid" for a stored document that fails migration, without logging it', async () => {
    loadShared.mockRejectedValue(new InvalidDesignError("bad document"));

    const page = await SharedDesignPage({
      params: Promise.resolve({ token: WELL_FORMED_TOKEN }),
    });

    if (!isValidElement(page)) throw new Error("expected an element");
    expect(page.type).toBe(designLoadError);
    expect(page.props).toEqual({ reason: "invalid" });
    expect(reportDesignFailure).not.toHaveBeenCalled();
  });

  it("logs a driver failure as share-read, carrying no id, and rethrows (criterion 15)", async () => {
    const failure = new Error("connection reset");
    loadShared.mockRejectedValue(failure);

    await expect(
      SharedDesignPage({
        params: Promise.resolve({ token: WELL_FORMED_TOKEN }),
      }),
    ).rejects.toBe(failure);

    // `reportDesignFailure`'s own signature carries no id parameter at all (criterion 15) — the
    // call above is the whole of what this line can log.
    expect(reportDesignFailure).toHaveBeenCalledWith("share-read", failure);
    expect(reportDesignFailure).toHaveBeenCalledTimes(1);
  });
});

const CLIENT_REQUEST_ID = "req_7Hq2Lw9Zp4Xc8Vb3";

function digestOf(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Records the kitchen as sent under `token`'s hash, as the shop's notice does. */
async function recordSentKitchen(
  token: string,
  document = canonicalSerializeDesign(KITCHEN_L_DESIGN),
): Promise<void> {
  await sentKitchenViewsOf().record({
    tokenHash: digestOf(token),
    clientRequestId: CLIENT_REQUEST_ID,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    document,
  });
}

async function renderPageFor(token: string): Promise<ReactElement> {
  const page = withoutPriceBook(
    await SharedDesignPage({ params: Promise.resolve({ token }) }),
  );
  if (!isValidElement(page)) throw new Error("expected an element");
  return page;
}

describe("the share view's page: the frozen copy sent to the shop", () => {
  beforeEach(resetDoubles);

  it("renders a token that names no share link but a frozen copy as the read-only view of that copy", async () => {
    loadShared.mockResolvedValue({ kind: "none" });
    await recordSentKitchen(WELL_FORMED_TOKEN);

    const page = await renderPageFor(WELL_FORMED_TOKEN);

    expect(page.type).toBe(sharedDesignView);
    expect(page.key).toBe(WELL_FORMED_TOKEN);
    expect(page.props).toEqual({ design: KITCHEN_L_DESIGN });
  });

  it("asks the share link first and then the frozen copy, each with the token's hash", async () => {
    loadShared.mockResolvedValue({ kind: "none" });
    const frozenLoad = vi.spyOn(sentKitchenViewsOf(), "load");

    await renderPageFor(WELL_FORMED_TOKEN);

    expect(loadShared.mock.calls).toEqual([[digestOf(WELL_FORMED_TOKEN)]]);
    expect(frozenLoad.mock.calls).toEqual([[digestOf(WELL_FORMED_TOKEN)]]);
    expect(loadShared.mock.invocationCallOrder[0]).toBeLessThan(
      frozenLoad.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it("does not ask the frozen copy when the share link is found", async () => {
    loadShared.mockResolvedValue({ kind: "found", design: KITCHEN_L_DESIGN });
    const frozenLoad = vi.spyOn(sentKitchenViewsOf(), "load");

    await renderPageFor(WELL_FORMED_TOKEN);

    expect(frozenLoad).not.toHaveBeenCalled();
  });

  it("renders the share link's design, not the frozen copy's, when one hash names both", async () => {
    const liveDesign = { liveDesign: true } as unknown as Design;
    loadShared.mockResolvedValue({ kind: "found", design: liveDesign });
    await recordSentKitchen(WELL_FORMED_TOKEN);

    const page = await renderPageFor(WELL_FORMED_TOKEN);

    expect(page.props).toEqual({ design: liveDesign });
  });

  it("renders unknown, revoked-share and revoked-frozen tokens as one not-found, each after both lookups (criterion 12)", async () => {
    const unknownToken = WELL_FORMED_TOKEN;
    const revokedShareToken = OTHER_WELL_FORMED_TOKEN;
    const revokedFrozenToken = "Frozen000001";
    loadShared.mockResolvedValue({ kind: "none" });
    await recordSentKitchen(revokedFrozenToken);
    sentKitchenViewsOf().revoke(digestOf(revokedFrozenToken));
    const frozenLoad = vi.spyOn(sentKitchenViewsOf(), "load");

    const pages = [];
    for (const token of [unknownToken, revokedShareToken, revokedFrozenToken]) {
      pages.push(await renderPageFor(token));
    }

    for (const page of pages) {
      expect(page.type).toBe(designLoadError);
      expect(page.props).toEqual({ reason: "not-found" });
      expect(page.key).toBeNull();
    }
    const lookedUp = [unknownToken, revokedShareToken, revokedFrozenToken].map(
      (token) => [digestOf(token)],
    );
    expect(loadShared.mock.calls).toEqual(lookedUp);
    expect(frozenLoad.mock.calls).toEqual(lookedUp);
  });

  it('renders reason="invalid" for a frozen copy that fails migration, without logging it', async () => {
    loadShared.mockResolvedValue({ kind: "none" });
    await recordSentKitchen(WELL_FORMED_TOKEN, "{}");

    const page = await renderPageFor(WELL_FORMED_TOKEN);

    expect(page.type).toBe(designLoadError);
    expect(page.props).toEqual({ reason: "invalid" });
    expect(reportDesignFailure).not.toHaveBeenCalled();
  });

  it("logs a failed frozen lookup as share-read and rethrows it", async () => {
    loadShared.mockResolvedValue({ kind: "none" });
    const failure = new Error("connection reset");
    vi.spyOn(sentKitchenViewsOf(), "load").mockRejectedValue(failure);

    await expect(renderPageFor(WELL_FORMED_TOKEN)).rejects.toBe(failure);

    expect(reportDesignFailure.mock.calls).toEqual([["share-read", failure]]);
  });
});
