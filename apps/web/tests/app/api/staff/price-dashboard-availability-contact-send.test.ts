import {
  KITCHEN_L_DESIGN,
  SAMPLE_PRICE_BOOK,
  validateContactSubmission,
  type ContactSubmissionRequest,
  type Design,
} from "@lemnaria/configurator-domain";
import type { DesignRevision } from "@lemnaria/persistence";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readActivePriceBook } from "@/lib/server/active-price-book";
import {
  prepareSubmission,
  type SubmissionSources,
} from "@/lib/server/contact/prepare-submission";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";

import { freshAccountWorld } from "../../../support/account-world";
import { setAvailability } from "../../../support/price-dashboard-requests";
import { freshPriceDashboardWorld } from "../../../support/price-dashboard-world";
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
vi.mock("@/lib/server/price-stores", () =>
  import("../../../support/price-dashboard-world").then((world) =>
    world.priceStoresModule(),
  ),
);

// A kitchen that uses an item switched off through the availability route after its page loaded can no longer be sent: the
// contact route's orchestration prices with the availability current at the send and refuses, and no snapshot is made.

const DESIGN_ID = "design0123456789abcde";
const DESIGN_REVISION: DesignRevision = "1";
const PAYLOAD_DIGEST = "d".repeat(64);
const PAINTED_MDF = "material.painted-mdf";

beforeEach(() => {
  freshAccountWorld();
  freshStaffWorld();
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function aDesignUsing(materialTierId: string): Design {
  return {
    ...KITCHEN_L_DESIGN,
    settings: { ...KITCHEN_L_DESIGN.settings, materialTierId },
  };
}

function theSendRequest(): ContactSubmissionRequest {
  const validated = validateContactSubmission(
    {
      contact: {
        name: "Ana Popescu",
        phone: "069 123 456",
        locality: "Chisinau",
        channel: "phone",
        consent: true,
        consentTextVersion: "placeholder",
      },
      design: { id: DESIGN_ID, revision: DESIGN_REVISION },
      clientRequestId: "request-id-00000001-0000000000000",
      locale: "ro",
      honeypot: "",
      elapsedMs: 12_000,
    },
    ["ro", "ru"],
  );
  if (!validated.ok) throw new Error("the fixture request was refused");
  return validated.request;
}

async function sourcesOfTheNextSend(
  design: Design,
): Promise<SubmissionSources> {
  const root = await readActivePriceBook();
  if (root.kind !== "active") throw new Error("the world has no book");
  return {
    book: root.book,
    bookVersionId: root.versionId,
    availability: root.availability,
    loadOwned: () =>
      Promise.resolve({ kind: "found", design, revision: DESIGN_REVISION }),
  };
}

describe("a kitchen sent after an item it uses was switched off", () => {
  it("is refused as not current, and no snapshot is made, where the same kitchen was priced before the switch", async () => {
    await freshPriceDashboardWorld({ book: SAMPLE_PRICE_BOOK });
    const { session } = await signedInAs(
      { role: "administrator" },
      "administrator@example.test",
    );
    const design = aDesignUsing(PAINTED_MDF);
    const before = await prepareSubmission(
      theSendRequest(),
      PAYLOAD_DIGEST,
      await sourcesOfTheNextSend(design),
    );
    const head = (await sourcesOfTheNextSend(design)).availability?.revision;

    const switched = await setAvailability({
      cookie: session.cookie,
      json: {
        expectedRevision: head,
        item: { kind: "material", tierId: PAINTED_MDF },
        active: false,
      },
    });
    const after = await prepareSubmission(
      theSendRequest(),
      PAYLOAD_DIGEST,
      await sourcesOfTheNextSend(design),
    );

    expect(before.kind).toBe("ready");
    expect(switched.status).toBe(200);
    expect(after).toEqual({
      kind: "refused",
      refusal: { code: "CONTACT_DESIGN_NOT_CURRENT" },
    });
  });

  it("is still sent when the item switched off is one it does not use", async () => {
    await freshPriceDashboardWorld({ book: SAMPLE_PRICE_BOOK });
    const { session } = await signedInAs(
      { role: "administrator" },
      "administrator@example.test",
    );
    const design = aDesignUsing("material.melamine");
    const head = (await sourcesOfTheNextSend(design)).availability?.revision;

    await setAvailability({
      cookie: session.cookie,
      json: {
        expectedRevision: head,
        item: { kind: "material", tierId: PAINTED_MDF },
        active: false,
      },
    });
    const after = await prepareSubmission(
      theSendRequest(),
      PAYLOAD_DIGEST,
      await sourcesOfTheNextSend(design),
    );

    expect(after.kind).toBe("ready");
  });
});
