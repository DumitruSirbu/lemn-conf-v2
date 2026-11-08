import { KITCHEN_L_DESIGN } from "@lemnaria/configurator-domain";
import type {
  EditableDesignLookup,
  SaveCredential,
} from "@lemnaria/persistence";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST as ACKNOWLEDGE } from "@/app/api/designs/[id]/price-notice/acknowledge/route";

import {
  freshAccountWorld,
  limiterLedger,
  seedSession,
  seedVerifiedAccount,
  type AccountWorld,
} from "../../../support/account-world";
import { freshPriceDashboardWorld } from "../../../support/price-dashboard-world";
import {
  NOTICE_DESIGN_ID,
  OWNER_WRITE_COOKIE,
  OWNER_WRITE_TOKEN_HASH,
  VISITOR_COOKIE,
  WRITE_COOKIE_NAME,
  makePriceStoresReject,
} from "../../../support/price-notice-stubs";
import { cookieOf, readNotice } from "../../../support/price-notice-world";
import { signedInAs } from "../../../support/staff-world";

/**
 * M10 R5b-b, widened: the credential parity of the notice routes and the save over the cookies the first parity table does
 * not vary: an empty token, a token cookie named for another design, a cookie name in another case, a visitor cookie with
 * and without the token, and a session that has expired. For each request the save route and BOTH notice routes are asked,
 * and the credential each hands its port must be the same, which is `undefined` where the save answers no credential and the
 * notice routes answer `404` without asking.
 */

const captured = vi.hoisted(() => ({
  saved: [] as unknown[],
  read: [] as unknown[],
}));

vi.mock("@/lib/server/account/session-store-instance", () =>
  import("../../../support/account-world").then((world) =>
    world.sessionStoreModule(),
  ),
);
vi.mock("@/lib/server/price-stores", () =>
  import("../../../support/price-notice-stubs").then((world) =>
    world.rejectablePriceStoresModule(),
  ),
);
vi.mock("@/lib/server/repository", () => ({
  getRepository: () => ({
    saveAuthorized: ({ credential }: { credential: SaveCredential }) => {
      captured.saved.push(credential);
      return Promise.resolve({
        id: "saved",
        revision: "2",
        ownsVisitor: false,
      });
    },
  }),
  getEditableDesignRepository: () => ({
    loadEditable: ({ credential }: EditableDesignLookup) => {
      captured.read.push(credential);
      return Promise.resolve({ kind: "none" });
    },
  }),
}));

const { PUT: save } = await import(
  "../../../../src/app/api/designs/[id]/route"
);

const OTHER_DESIGN_COOKIE = `lemnaria_write_token_ZZZZZZZZZZZZZZZZZZZZZ=another-designs-token`;

const TOKEN_COOKIES: Record<string, string | undefined> = {
  "no token": undefined,
  "the right token": OWNER_WRITE_COOKIE,
  "an empty token": `${WRITE_COOKIE_NAME}=`,
  "a token named for another design": OTHER_DESIGN_COOKIE,
  "the token under an upper-case name": OWNER_WRITE_COOKIE.toUpperCase(),
  "the token cookie sent twice": cookieOf(
    OWNER_WRITE_COOKIE,
    OWNER_WRITE_COOKIE,
  ),
};

type SessionKind = "editing client" | "staff" | "none" | "expired client";
const SESSIONS: readonly SessionKind[] = [
  "editing client",
  "staff",
  "none",
  "expired client",
];

let accountWorld: AccountWorld;
let clientId: string;
const sessionCookies: Partial<Record<SessionKind, string>> = {};

beforeEach(async () => {
  accountWorld = freshAccountWorld();
  await freshPriceDashboardWorld();
  makePriceStoresReject(undefined);
  limiterLedger.subjects.push({
    kind: "write-credential",
    subject: OWNER_WRITE_TOKEN_HASH,
  });
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  const client = await seedVerifiedAccount({ email: "client@example.test" });
  clientId = client.id;
  const staff = await signedInAs({ role: "administrator" });
  sessionCookies["editing client"] = (await seedSession(client)).cookie;
  sessionCookies.staff = staff.session.cookie;
  sessionCookies["expired client"] = (await seedSession(client)).cookie;
});

function saveRequestWith(cookie: string) {
  return new NextRequest(
    `https://lemnaria.test/api/designs/${NOTICE_DESIGN_ID}`,
    {
      method: "PUT",
      headers: {
        cookie,
        "sec-fetch-site": "same-origin",
        "x-expected-revision": "1",
        "content-type": "application/json",
        "x-forwarded-for": "192.0.2.10",
      },
      body: JSON.stringify(KITCHEN_L_DESIGN),
    },
  );
}

interface Chosen {
  readonly saved: unknown;
  readonly read: unknown;
  readonly acknowledged: unknown;
}

async function credentialsChosenFor(cookie: string): Promise<Chosen> {
  captured.saved.length = 0;
  captured.read.length = 0;
  await save(saveRequestWith(cookie), {
    params: Promise.resolve({ id: NOTICE_DESIGN_ID }),
  });
  await readNotice({ cookie });
  const read = captured.read[0];
  captured.read.length = 0;
  const request = new NextRequest(
    `https://lemnaria.test/api/designs/${NOTICE_DESIGN_ID}/price-notice/acknowledge`,
    {
      method: "POST",
      headers: {
        cookie,
        "sec-fetch-site": "same-origin",
        "content-type": "application/json",
        "x-forwarded-for": "192.0.2.10",
      },
      body: JSON.stringify({
        versionId: "A".repeat(21),
        availabilityRevision: "0",
      }),
    },
  );
  await ACKNOWLEDGE(request, {
    params: Promise.resolve({ id: NOTICE_DESIGN_ID }),
  });
  return {
    saved: captured.saved[0],
    read,
    acknowledged: captured.read[0],
  };
}

describe("the notice routes and the save choose one credential over every cookie the first table leaves out", () => {
  const rows = Object.entries(TOKEN_COOKIES).flatMap(([tokenLabel, token]) =>
    SESSIONS.flatMap((session) =>
      [false, true].map(
        (withVisitor) => [tokenLabel, token, session, withVisitor] as const,
      ),
    ),
  );

  it.each(rows)(
    "with %s, a %s session and a visitor cookie: %s",
    async (_tokenLabel, token, session, withVisitor) => {
      if (session === "expired client")
        accountWorld.advance(1000 * 24 * 3600 * 1000);
      const cookie = cookieOf(
        token,
        session === "none" ? undefined : sessionCookies[session],
        withVisitor ? VISITOR_COOKIE : undefined,
      );

      const { saved, read, acknowledged } = await credentialsChosenFor(cookie);

      expect(read).toEqual(saved);
      expect(acknowledged).toEqual(saved);
      if (saved !== undefined && (saved as SaveCredential).kind === "account") {
        expect(saved).toEqual({ kind: "account", accountId: clientId });
      }
    },
  );

  it("covers at least one row each of a token credential, an account credential and none", async () => {
    const kinds = new Set<string>();
    for (const [, token, session] of rows) {
      if (session === "expired client") continue;
      const cookie = cookieOf(
        token,
        session === "none" ? undefined : sessionCookies[session],
      );
      const { saved } = await credentialsChosenFor(cookie);
      kinds.add(saved === undefined ? "none" : (saved as SaveCredential).kind);
    }

    expect([...kinds].sort()).toEqual(["account", "none", "write-token"]);
  });
});
