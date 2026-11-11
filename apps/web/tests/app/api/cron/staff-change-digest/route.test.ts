import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { KitchenChangeStore } from "@lemnaria/persistence";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createFakeMailSender,
  type FakeMailSender,
} from "@/lib/server/mail/fake-mail-sender";
import { PUBLIC_ORIGIN_VARIABLE } from "@/lib/server/public-origin-variable";

import {
  DRIVER_FAILURE_MARKER,
  freshAccountWorld,
} from "../../../../support/account-world";
import {
  currentSeenWorld,
  freshSeenWorld,
  plantSeenKitchen,
} from "../../../../support/staff-seen-world";

const mail = vi.hoisted(() => ({ sender: undefined as unknown }));
const store = vi.hoisted(() => ({ failClaim: false }));

vi.mock("@/lib/server/mail/create-mail-sender", () => ({
  createMailSender: () => ({ kind: "sender", sender: mail.sender }),
}));
vi.mock("@/lib/server/staff/kitchen-change-store-instance", () => ({
  getKitchenChangeStore: (): KitchenChangeStore => {
    const port = currentSeenWorld().port;
    return {
      ...port,
      claimDigestDay: (dayKey: string) =>
        store.failClaim
          ? Promise.reject(new Error(DRIVER_FAILURE_MARKER))
          : port.claimDigestDay(dayKey),
    };
  },
}));

const { GET } = await import("@/app/api/cron/staff-change-digest/route");

const CRON_SECRET = "cron-secret-for-the-digest-tests-8841";
const URL_OF_THE_ROUTE = "https://example.test/api/cron/staff-change-digest";
const RUN_INSTANT = new Date("2026-10-20T05:00:00.000Z");

let sender: FakeMailSender;

beforeEach(() => {
  freshAccountWorld();
  freshSeenWorld();
  sender = createFakeMailSender();
  mail.sender = sender;
  store.failClaim = false;
  vi.stubEnv("CRON_SECRET", CRON_SECRET);
  vi.stubEnv(PUBLIC_ORIGIN_VARIABLE, "https://lemnaria.example");
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(RUN_INSTANT);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function request(headers: Record<string, string>, query = ""): NextRequest {
  return new NextRequest(`${URL_OF_THE_ROUTE}${query}`, { headers });
}

const authorized = { authorization: `Bearer ${CRON_SECRET}` };

describe("GET /api/cron/staff-change-digest", () => {
  it.each([
    ["no authorization header", {}],
    ["a wrong secret", { authorization: "Bearer not-the-secret" }],
    ["the bare scheme", { authorization: "Bearer " }],
  ])("refuses %s and sends nothing", async (_name, headers) => {
    plantSeenKitchen({ revision: "6" });

    const answer = await GET(request(headers));

    expect(answer.status).toBe(401);
    expect(sender.sent).toHaveLength(0);
    expect(currentSeenWorld().store.heldRounds()).toEqual([]);
  });

  it("refuses everything when CRON_SECRET is not set, as on Preview", async () => {
    vi.stubEnv("CRON_SECRET", "");
    plantSeenKitchen({ revision: "6" });

    const answer = await GET(request({ authorization: "Bearer " }));

    expect(answer.status).toBe(401);
    expect(sender.sent).toHaveLength(0);
  });

  it("sends the day's digest once, takes the day from the server, and ignores the query", async () => {
    plantSeenKitchen({ revision: "6" });

    const first = await GET(
      request(authorized, "?day=2001-01-01&recipient=x%40y.z"),
    );
    const second = await GET(request(authorized));

    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ status: "sent", kitchenCount: 1 });
    expect(await second.json()).toEqual({ status: "already-claimed" });
    expect(sender.sent).toHaveLength(1);
    expect(
      currentSeenWorld()
        .store.heldRounds()
        .map((round) => round.dayKey),
    ).toEqual(["2026-10-20"]);
  });

  it("answers 200 and sends nothing when no kitchen is eligible", async () => {
    const answer = await GET(request(authorized));

    expect(answer.status).toBe(200);
    expect(await answer.json()).toEqual({ status: "nothing-to-send" });
    expect(sender.sent).toHaveLength(0);
  });

  it("answers a failing store 503 with a code, and writes no cause to the body or the log", async () => {
    store.failClaim = true;
    const logged = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const answer = await GET(request(authorized));
    const body = JSON.stringify(await answer.json());

    expect(answer.status).toBe(503);
    expect(body).toContain("DIGEST_CLAIM_FAILED");
    expect(body).not.toContain(DRIVER_FAILURE_MARKER);
    expect(JSON.stringify(logged.mock.calls)).not.toContain(
      DRIVER_FAILURE_MARKER,
    );
  });

  it("is scheduled once a day at 05:00 UTC, which is 08:00 in Chisinau in summer (OQ-10)", () => {
    const config = JSON.parse(
      readFileSync(join(process.cwd(), "vercel.json"), "utf8"),
    ) as { crons: { path: string; schedule: string }[] };

    expect(
      config.crons.filter(
        (cron) => cron.path === "/api/cron/staff-change-digest",
      ),
    ).toEqual([
      { path: "/api/cron/staff-change-digest", schedule: "0 5 * * *" },
    ]);
  });
});
