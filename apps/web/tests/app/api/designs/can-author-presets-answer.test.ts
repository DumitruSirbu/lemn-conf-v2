import { KITCHEN_L_DESIGN } from "@lemnaria/configurator-domain";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ownerVisitorCookiePair } from "../../../support/owned-design-lookup";
import {
  AUTHOR_DESIGN_ID as DESIGN_ID,
  AUTHOR_WRITE_COOKIE_NAME,
  AUTHOR_WRITE_TOKEN,
  freshPresetAuthorWorld,
  requestCarrying,
  type PresetAuthorWorld,
} from "../../../support/preset-author-world";

vi.mock("@/lib/server/account/session-store-instance", () =>
  import("../../../support/preset-author-world").then((world) =>
    world.presetAuthorSessionStoreModule(),
  ),
);

vi.mock("@/lib/server/repository", () => ({
  getRepository: () => ({
    loadOwned: () =>
      Promise.resolve({
        kind: "found",
        design: KITCHEN_L_DESIGN,
        revision: "1",
      }),
  }),
}));

const { GET } = await import("../../../../src/app/api/designs/[id]/route");

/**
 * `canAuthorPresets` in `GET /api/designs/{id}`: the same answer the preset save route acts on, so
 * the editor shows "Salvează ca preset" to exactly the requests the save would accept. A design's write token alone is
 * not enough any more, and a session alone never is.
 */

const WRITE_TOKEN_COOKIE = `${AUTHOR_WRITE_COOKIE_NAME}=${AUTHOR_WRITE_TOKEN}`;

let world: PresetAuthorWorld;

beforeEach(() => {
  world = freshPresetAuthorWorld();
});

async function canAuthorPresetsFor(cookies: string[]): Promise<unknown> {
  const response = await GET(
    requestCarrying(
      cookies.join("; "),
      `https://example.test/api/designs/${DESIGN_ID}`,
    ),
    { params: Promise.resolve({ id: DESIGN_ID }) },
  );
  expect(response.status).toBe(200);
  return ((await response.json()) as { canAuthorPresets: unknown })
    .canAuthorPresets;
}

describe("GET /api/designs/{id}: canAuthorPresets", () => {
  it("is true for the design's author holding an administrator session (the control)", async () => {
    const administrator = await world.signIn({ role: "administrator" });

    const answer = await canAuthorPresetsFor([
      ownerVisitorCookiePair(),
      WRITE_TOKEN_COOKIE,
      administrator.cookie,
    ]);

    expect(answer).toBe(true);
  });

  it.each(["client", "operator"] as const)(
    "is false for the design's author signed in as a %s",
    async (role) => {
      const session = await world.signIn({ role });

      const answer = await canAuthorPresetsFor([
        ownerVisitorCookiePair(),
        WRITE_TOKEN_COOKIE,
        session.cookie,
      ]);

      expect(answer).toBe(false);
    },
  );

  it("is false for the design's author with no session", async () => {
    const answer = await canAuthorPresetsFor([
      ownerVisitorCookiePair(),
      WRITE_TOKEN_COOKIE,
    ]);

    expect(answer).toBe(false);
  });

  it("is false for an administrator who does not hold the design's write token", async () => {
    const administrator = await world.signIn({ role: "administrator" });

    const answer = await canAuthorPresetsFor([
      ownerVisitorCookiePair(),
      administrator.cookie,
    ]);

    expect(answer).toBe(false);
  });

  it("is false when the session store cannot be asked, and the read itself still answers", async () => {
    const administrator = await world.signIn({ role: "administrator" });
    world.breakSessionLookups();

    const answer = await canAuthorPresetsFor([
      ownerVisitorCookiePair(),
      WRITE_TOKEN_COOKIE,
      administrator.cookie,
    ]);

    expect(answer).toBe(false);
  });
});
