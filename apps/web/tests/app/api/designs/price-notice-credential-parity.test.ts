import { KITCHEN_L_DESIGN } from "@lemnaria/configurator-domain";
import type {
  EditableDesignLookup,
  SaveCredential,
} from "@lemnaria/persistence";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  freshAccountWorld,
  limiterLedger,
  seedSession,
  seedVerifiedAccount,
} from "../../../support/account-world";
import { freshPriceDashboardWorld } from "../../../support/price-dashboard-world";
import {
  NOTICE_DESIGN_ID,
  OWNER_WRITE_COOKIE,
  OWNER_WRITE_TOKEN_HASH,
  makePriceStoresReject,
} from "../../../support/price-notice-stubs";
import { cookieOf, readNotice } from "../../../support/price-notice-world";
import { signedInAs } from "../../../support/staff-world";

/** On a same-site request the notice routes read under the credential the save route passes to `saveAuthorized`. */

const captured = vi.hoisted(() => ({
  saved: [] as unknown[],
  read: [] as unknown[],
  isEditingDenied: false,
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
vi.mock("@/lib/server/account/require-capability", async (importOriginal) => {
  const original =
    await importOriginal<
      typeof import("@/lib/server/account/require-capability")
    >();
  return {
    ...original,
    isCapabilityHeld: (
      ...args: Parameters<typeof original.isCapabilityHeld>
    ) =>
      captured.isEditingDenied && args[1] === "design.edit.own"
        ? false
        : original.isCapabilityHeld(...args),
  };
});
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

type SessionKind = "editing client" | "reading-only client" | "staff" | "none";

const SESSIONS: readonly SessionKind[] = [
  "editing client",
  "reading-only client",
  "staff",
  "none",
];

let clientId: string;
let cookieOfSession: Record<SessionKind, string | undefined>;

beforeEach(async () => {
  freshAccountWorld();
  await freshPriceDashboardWorld();
  makePriceStoresReject(undefined);
  limiterLedger.subjects.push({
    kind: "write-credential",
    subject: OWNER_WRITE_TOKEN_HASH,
  });
  captured.saved.length = 0;
  captured.read.length = 0;
  captured.isEditingDenied = false;
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const client = await seedVerifiedAccount({ email: "client@example.test" });
  clientId = client.id;
  const staff = await signedInAs({ role: "administrator" });
  cookieOfSession = {
    "editing client": (await seedSession(client)).cookie,
    "reading-only client": (await seedSession(client)).cookie,
    staff: staff.session.cookie,
    none: undefined,
  };
});

function saveRequestWith(cookie: string, secFetchSite = "same-origin") {
  return new NextRequest(
    `https://lemnaria.test/api/designs/${NOTICE_DESIGN_ID}`,
    {
      method: "PUT",
      headers: {
        cookie,
        "sec-fetch-site": secFetchSite,
        "x-expected-revision": "1",
        "content-type": "application/json",
      },
      body: JSON.stringify(KITCHEN_L_DESIGN),
    },
  );
}

async function credentialsChosen(options: {
  hasToken: boolean;
  session: SessionKind;
  secFetchSite?: string;
}): Promise<{ saved: unknown; read: unknown }> {
  captured.saved.length = 0;
  captured.read.length = 0;
  captured.isEditingDenied = options.session === "reading-only client";
  const cookie = cookieOf(
    options.hasToken ? OWNER_WRITE_COOKIE : undefined,
    cookieOfSession[options.session],
  );
  await save(saveRequestWith(cookie, options.secFetchSite), {
    params: Promise.resolve({ id: NOTICE_DESIGN_ID }),
  });
  await readNotice({
    cookie,
    secFetchSite: options.secFetchSite ?? "same-origin",
  });
  return { saved: captured.saved[0], read: captured.read[0] };
}

describe("the notice routes choose the credential the save passes to saveAuthorized", () => {
  it.each(
    SESSIONS.flatMap((session) =>
      [true, false].map((hasToken) => [session, hasToken] as const),
    ),
  )("with %s and a token cookie present: %s", async (session, hasToken) => {
    const { saved, read } = await credentialsChosen({ hasToken, session });

    expect(read).toEqual(saved);
    expect(read).toEqual(expectedCredential(session, hasToken));
  });

  function expectedCredential(session: SessionKind, hasToken: boolean) {
    if (hasToken) return { kind: "write-token", hash: OWNER_WRITE_TOKEN_HASH };
    return session === "editing client"
      ? { kind: "account", accountId: clientId }
      : undefined;
  }
});

describe("the one difference: another site", () => {
  it("is accepted by the save on its token arm and refused by the notice routes, which ask nothing", async () => {
    const { saved, read } = await credentialsChosen({
      hasToken: true,
      session: "none",
      secFetchSite: "cross-site",
    });

    expect(saved).toEqual({
      kind: "write-token",
      hash: OWNER_WRITE_TOKEN_HASH,
    });
    expect(read).toBeUndefined();
  });
});
