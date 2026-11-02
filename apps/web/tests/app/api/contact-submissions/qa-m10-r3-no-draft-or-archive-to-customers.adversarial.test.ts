import { KITCHEN_L_DESIGN } from "@lemnaria/configurator-domain";
import { FakeContactSubmissionStore } from "@lemnaria/persistence";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeMailSender } from "@/lib/server/mail/fake-mail-sender";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";

import { bodyOf } from "../../../lib/server/contact/submit-contact-harness";
import { freshAccountWorld, jsonOf } from "../../../support/account-world";
import {
  publishBody,
  publishDraft,
} from "../../../support/price-dashboard-requests";
import {
  freshPriceDashboardWorld,
  type PriceDashboardWorld,
} from "../../../support/price-dashboard-world";
import {
  ANCHOR_ADDRESS,
  VERSIONED_BOOK,
  putChange,
} from "../../../support/price-versions";
import { freshStaffWorld, signedInAs } from "../../../support/staff-world";

/**
 * R-d's must-not, through the one non-staff route that reads the price stores: with archived versions and a pending draft
 * in the stores, a design's contact request is priced at the active version alone, and nothing it answers, stores or mails
 * names an archived version, a version's label or note, or a pending price.
 */

const fakes = vi.hoisted(() => ({
  store: undefined as unknown,
  sender: undefined as unknown,
}));

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
vi.mock("@/lib/server/price-stores", () =>
  import("../../../support/price-dashboard-world").then((world) =>
    world.priceStoresModule(),
  ),
);
vi.mock("@/lib/server/contact/contact-submission-store-instance", () => ({
  getContactSubmissionStore: () => fakes.store,
}));
vi.mock("@/lib/server/contact/sent-mark-store-instance", () =>
  import("../../../support/sent-mark-store-fake").then((fake) =>
    fake.fakeSentMarkStoreModule(),
  ),
);
vi.mock("@/lib/server/mail/create-mail-sender", () => ({
  createMailSender: () => ({ kind: "sender", sender: fakes.sender }),
}));
vi.mock("@/lib/server/load-owned-design", () => ({
  loadOwnedDesign: () =>
    Promise.resolve({
      kind: "found",
      design: KITCHEN_L_DESIGN,
      revision: "1",
    }),
}));

const { POST } = await import(
  "../../../../src/app/api/contact-submissions/route"
);

let store: FakeContactSubmissionStore;
let sender: ReturnType<typeof createFakeMailSender>;
let prices: PriceDashboardWorld;

beforeEach(async () => {
  freshAccountWorld();
  freshStaffWorld();
  prices = await freshPriceDashboardWorld({ book: VERSIONED_BOOK });
  store = new FakeContactSubmissionStore();
  sender = createFakeMailSender();
  fakes.store = store;
  fakes.sender = sender;
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const SECOND_LABEL = "SECOND-LABEL-MARKER-61";
const SECOND_NOTE = "SECOND-NOTE-MARKER-62";
const THIRD_LABEL = "THIRD-LABEL-MARKER-63";
const PENDING_ANCHOR = 777_770;

async function publishAnchorWithText(
  cookie: string,
  anchorMinor: number,
  label: string,
  note: string,
): Promise<string> {
  await putChange(cookie, ANCHOR_ADDRESS, anchorMinor);
  const answer = await publishDraft({
    cookie,
    json: await publishBody({ label, note }),
  });
  expect(answer.status).toBe(200);
  return ((await jsonOf(answer)) as { versionId: string }).versionId;
}

function post(body: string): Promise<Response> {
  return POST(
    new NextRequest("https://lemnaria.test/api/contact-submissions", {
      method: "POST",
      body,
      headers: {
        "sec-fetch-site": "same-origin",
        "content-type": "application/json",
      },
    }),
  );
}

describe("a design's contact request with archived versions and a pending draft in the stores", () => {
  it("is priced at the active version alone, and nothing it answers, stores or mails names the archive, a label, a note or a pending price", async () => {
    const { session } = await signedInAs({ role: "administrator" });
    const secondId = await publishAnchorWithText(
      session.cookie,
      520_000,
      SECOND_LABEL,
      SECOND_NOTE,
    );
    const thirdId = await publishAnchorWithText(
      session.cookie,
      540_000,
      THIRD_LABEL,
      "",
    );
    await putChange(session.cookie, ANCHOR_ADDRESS, PENDING_ANCHOR);
    const firstId = prices.versionId ?? "never";

    const answer = await post(bodyOf());

    expect(answer.status).toBe(200);
    const [held] = store.heldSubmissions();
    expect(held?.submission.snapshot?.priced.pricingVersion).toBe(thirdId);
    const everythingTheCustomerSideHolds = JSON.stringify([
      await answer.clone().text(),
      store.heldSubmissions(),
      sender.sent,
    ]);
    for (const forbidden of [
      firstId,
      secondId,
      SECOND_LABEL,
      SECOND_NOTE,
      THIRD_LABEL,
      String(PENDING_ANCHOR),
    ]) {
      expect(everythingTheCustomerSideHolds).not.toContain(forbidden);
    }
  });

  it("is priced at the new version straight after a publish and at the old one straight before it", async () => {
    const { session } = await signedInAs({ role: "administrator" });
    await putChange(session.cookie, ANCHOR_ADDRESS, 520_000);
    const beforePublish = await post(bodyOf());
    const heldBefore = store.heldSubmissions().length;

    const secondId = await publishAnchorWithText(
      session.cookie,
      520_000,
      SECOND_LABEL,
      "",
    );
    const afterPublish = await post(
      bodyOf({ clientRequestId: "req_zzzzzzzzzzzzzzzz" }),
    );

    expect(beforePublish.status).toBe(200);
    expect(afterPublish.status).toBe(200);
    const pricedAt = store
      .heldSubmissions()
      .map(({ submission }) => submission.snapshot?.priced.pricingVersion);
    expect(heldBefore).toBe(1);
    expect(pricedAt).toEqual([prices.versionId, secondId]);
  });
});
