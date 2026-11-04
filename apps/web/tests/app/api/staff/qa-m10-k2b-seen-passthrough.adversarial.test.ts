import type { KitchenChangeStore } from "@lemnaria/persistence";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";

import {
  aDesignId,
  captureConsole,
  freshAccountWorld,
  jsonOf,
} from "../../../support/account-world";
import { seenRequest } from "../../../support/staff-seen-world";
import { signedInAs } from "../../../support/staff-world";

const stub = vi.hoisted(() => ({
  answer: { kind: "ok", changedAfterSeen: false } as unknown,
  asked: [] as unknown[],
}));

vi.mock("@/lib/server/account/session-store-instance", () =>
  import("../../../support/account-world").then((world) =>
    world.sessionStoreModule(),
  ),
);
vi.mock("@/lib/server/staff/kitchen-change-store-instance", () => ({
  getKitchenChangeStore: (): KitchenChangeStore =>
    ({
      markSeen: (request: unknown) => {
        stub.asked.push(request);
        return Promise.resolve(stub.answer);
      },
    }) as unknown as KitchenChangeStore,
}));

const { POST } = await import("@/app/api/staff/kitchens/[id]/seen/route");

/**
 * Whether a marked kitchen still shows as changed is the store's answer, computed where the revisions are compared. The
 * route repeats it and adds to it nothing, so a store that says changed is read as changed whatever revision the page
 * sent, and one that says unchanged is read as unchanged.
 */

beforeEach(() => {
  freshAccountWorld();
  captureConsole();
  stub.asked.length = 0;
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function markAs(displayedRevision: string) {
  const { session } = await signedInAs({ role: "operator" });
  const id = aDesignId();
  return POST(
    seenRequest(id, {
      json: { displayedRevision },
      cookie: session.cookie,
    }),
    { params: Promise.resolve({ id }) },
  );
}

describe("the seen answer", () => {
  it.each([
    ["1", true],
    ["5", true],
    ["9223372036854775807", true],
    ["1", false],
    ["5", false],
    ["9223372036854775807", false],
  ])(
    "is the store's own judgement, displayed %s and judged %s, and nothing else",
    async (displayedRevision, changedAfterSeen) => {
      stub.answer = { kind: "ok", changedAfterSeen };

      const answer = await markAs(displayedRevision);

      expect(answer.status).toBe(200);
      expect(await jsonOf(answer)).toEqual({ changedAfterSeen });
    },
  );

  it("hands the store the revision exactly as the page sent it, as text", async () => {
    stub.answer = { kind: "ok", changedAfterSeen: false };

    await markAs("9007199254740993");

    expect(stub.asked).toHaveLength(1);
    expect(stub.asked[0]).toMatchObject({
      displayedRevision: "9007199254740993",
    });
  });
});
