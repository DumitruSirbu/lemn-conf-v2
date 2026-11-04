import { KITCHEN_L_DESIGN } from "@lemnaria/configurator-domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  FAKE_PRICE_BOOK_FLAG,
  FAKE_PRICE_BOOK_FLAG_ENABLED,
} from "@/lib/server/fake-price-book-flag";
import { PRICE_STORES_GLOBAL_KEY } from "@/lib/server/price-stores";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";

import {
  aDesignId,
  accountRequest,
  captureConsole,
  freshAccountWorld,
  jsonOf,
} from "../../../support/account-world";
import { emptied } from "../../../support/review-edits";
import {
  SENT_AT,
  freshStaffWorld,
  plantKitchen,
  signedInAs,
  type StaffWorld,
} from "../../../support/staff-world";

vi.mock("@/lib/server/account/session-store-instance", () =>
  import("../../../support/account-world").then((world) =>
    world.sessionStoreModule(),
  ),
);
vi.mock("@/lib/server/staff/staff-kitchen-reader-instance", () =>
  import("../../../support/staff-world").then((world) =>
    world.staffKitchenReaderModule(),
  ),
);
vi.mock("@/lib/server/staff/staff-audit-store-instance", () =>
  import("../../../support/staff-world").then((world) =>
    world.staffAuditStoreModule(),
  ),
);

const { GET } = await import("@/app/api/staff/kitchens/[id]/route");

// Adversarial QA of the estimate of the kitchen as it stands: every other price surface of the product refuses to price a
// kitchen that holds no cabinet, because the whole-kitchen lines an empty design still carries would read as a price over
// nothing. A client may take every cabinet out of a kitchen after sending it, and staff then open that kitchen.

let staffWorld: StaffWorld;

beforeEach(() => {
  freshAccountWorld();
  staffWorld = freshStaffWorld();
  captureConsole();
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
  vi.stubEnv(FAKE_PRICE_BOOK_FLAG, FAKE_PRICE_BOOK_FLAG_ENABLED);
  Reflect.deleteProperty(globalThis, PRICE_STORES_GLOBAL_KEY);
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, PRICE_STORES_GLOBAL_KEY);
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function openSentKitchenOf(
  design: typeof KITCHEN_L_DESIGN,
): Promise<{ currentEstimate: Record<string, unknown> }> {
  const staff = await signedInAs({ role: "operator" });
  staffWorld.reader.plantAccount({
    id: staff.account.id,
    email: "operator@example.test",
    name: "Operator Name",
    phone: null,
  });
  const { id } = plantKitchen({ design });
  staffWorld.reader.plantRequest({
    clientRequestId: aDesignId(),
    designId: id,
    reference: "LM-2026-0042",
    createdAt: SENT_AT,
    pricedTotal: { totalMinor: 1_234_500, currency: "MDL" },
  });
  const answer = await GET(
    accountRequest(`/api/staff/kitchens/${id}`, {
      cookie: staff.session.cookie,
      headers: { "x-forwarded-for": "192.0.2.10" },
    }),
    { params: Promise.resolve({ id }) },
  );
  expect(answer.status).toBe(200);
  return (await jsonOf(answer)) as { currentEstimate: Record<string, unknown> };
}

describe("the estimate of the kitchen as it stands", () => {
  it("is a figure for a kitchen that holds cabinets", async () => {
    const opened = await openSentKitchenOf(KITCHEN_L_DESIGN);

    expect(opened.currentEstimate).toMatchObject({
      currency: "MDL",
      totalMinor: expect.any(Number) as unknown,
    });
  });

  it("is no figure for a kitchen the client emptied after sending it", async () => {
    const opened = await openSentKitchenOf(emptied(KITCHEN_L_DESIGN));

    expect(opened.currentEstimate).not.toHaveProperty("totalMinor");
  });
});
