import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FAKE_PRICE_BOOK_FLAG } from "@/lib/server/fake-price-book-flag";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";
import { readPublishPage } from "@/price-dashboard/publish-source";

import {
  captureConsole,
  freshAccountWorld,
  jsonOf,
} from "../../../support/account-world";
import { forgetHeldPriceStores } from "../../../support/held-price-stores";
import { publishDraft } from "../../../support/price-dashboard-requests";
import { freshStaffWorld, signedInAs } from "../../../support/staff-world";

vi.mock("@/lib/server/account/session-store-instance", () =>
  import("../../../support/account-world").then((world) =>
    world.sessionStoreModule(),
  ),
);
vi.mock("@/lib/server/staff/staff-audit-store-instance", () =>
  import("../../../support/staff-world").then((world) =>
    world.staffAuditStoreModule(),
  ),
);

/**
 * `POST /api/staff/prices/publish` and the publish page in production with no `DATABASE_URL`: the price root holds the
 * stores that answer "unavailable", so the publish judges nothing and writes nothing, and the page is drawn without facts.
 */

const A_PUBLISH_BODY = {
  expectedDraftRevision: "0",
  expectedActiveSequence: 1,
  expectedAvailabilityRevision: "0",
  label: "Autumn prices",
  note: "",
};

let cookie: string;

beforeEach(async () => {
  freshAccountWorld();
  freshStaffWorld();
  captureConsole();
  forgetHeldPriceStores();
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
  const { session } = await signedInAs(
    { role: "administrator" },
    "administrator@example.test",
  );
  cookie = session.cookie;
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("DATABASE_URL", undefined);
  vi.stubEnv("VERCEL_ENV", undefined);
  vi.stubEnv(FAKE_PRICE_BOOK_FLAG, undefined);
});

afterEach(() => {
  forgetHeldPriceStores();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("a publish in production with no database", () => {
  it("is a 503 that names nothing of the draft", async () => {
    const answer = await publishDraft({ cookie, json: A_PUBLISH_BODY });

    expect(answer.status).toBe(503);
    expect(await jsonOf(answer)).toEqual({ status: "unavailable" });
  });

  it("draws the page as unavailable, without throwing", async () => {
    const read = await readPublishPage();

    expect(read.kind).toBe("unavailable");
  });
});
