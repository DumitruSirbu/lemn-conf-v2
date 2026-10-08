import { createHash } from "node:crypto";

import {
  InvalidDesignError,
  KITCHEN_L_DESIGN,
} from "@lemnaria/configurator-domain";
import { isValidElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const loadShared = vi.hoisted(() => vi.fn());
const reportDesignFailure = vi.hoisted(() => vi.fn());
const designLoadError = vi.hoisted(() => vi.fn(() => null));
const sharedDesignView = vi.hoisted(() => vi.fn(() => null));

vi.mock("@/lib/server/repository", () => ({
  getShareLinkRepository: () => ({ loadShared }),
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

describe("the share view's page component (M7 wave 7E3c D6)", () => {
  beforeEach(() => {
    loadShared.mockReset();
    reportDesignFailure.mockReset();
    designLoadError.mockClear();
    sharedDesignView.mockClear();
  });

  it("issues no query for a malformed token (criterion 10)", async () => {
    const page = await SharedDesignPage({
      params: Promise.resolve({ token: MALFORMED_TOKEN }),
    });

    expect(loadShared).not.toHaveBeenCalled();
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

    const page = await SharedDesignPage({
      params: Promise.resolve({ token: WELL_FORMED_TOKEN }),
    });

    if (!isValidElement(page)) throw new Error("expected an element");
    expect(page.type).toBe(sharedDesignView);
    expect(page.key).toBe(WELL_FORMED_TOKEN);
    // `key` never reaches `props` — React strips it — so this also proves the token itself is not
    // handed to the component as ordinary data.
    expect(page.props).toEqual({ design: KITCHEN_L_DESIGN });
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
