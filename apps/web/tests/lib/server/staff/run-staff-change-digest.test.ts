import type {
  DigestEligibleKitchen,
  KitchenChangeStore,
} from "@lemnaria/persistence";
import { beforeEach, describe, expect, it } from "vitest";

import {
  createFakeMailSender,
  type FakeMailSender,
} from "@/lib/server/mail/fake-mail-sender";
import type { MailOutcome } from "@/lib/server/mail/mail-sender";
import { staffChangeDigestCopy } from "@/lib/server/mail/staff-change-digest";
import type { PublicOrigin } from "@/lib/server/public-origin";
import {
  runStaffChangeDigest,
  type StaffChangeDigestPorts,
} from "@/lib/server/staff/run-staff-change-digest";

import {
  DRIVER_FAILURE_MARKER,
  freshAccountWorld,
} from "../../../support/account-world";
import {
  currentSeenWorld,
  freshSeenWorld,
  plantSeenKitchen,
} from "../../../support/staff-seen-world";

const FIRST_RUN = new Date("2026-10-20T05:00:00.000Z");
const NEXT_DAY_RUN = new Date("2026-10-21T05:00:00.000Z");
const ORIGIN = "https://lemnaria.example" as PublicOrigin;
const REFUSED: MailOutcome = { ok: false, kind: "refused" };

let sender: FakeMailSender;
let runAt: Date;
let isMailConfigured: boolean;
let isOriginConfigured: boolean;

beforeEach(() => {
  freshAccountWorld();
  freshSeenWorld();
  sender = createFakeMailSender();
  runAt = FIRST_RUN;
  isMailConfigured = true;
  isOriginConfigured = true;
});

function portsOver(store: KitchenChangeStore): StaffChangeDigestPorts {
  return {
    openStore: () => store,
    now: () => runAt,
    createSender: () =>
      isMailConfigured
        ? { kind: "sender", sender }
        : { kind: "unavailable", variables: ["GOOGLE_EMAIL"] },
    readPublicOrigin: () =>
      isOriginConfigured
        ? { status: "configured", origin: ORIGIN }
        : {
            status: "unavailable",
            variable: "NEXT_PUBLIC_SITE_ORIGIN" as never,
          },
    copy: staffChangeDigestCopy,
  };
}

function run(store: KitchenChangeStore = currentSeenWorld().port) {
  return runStaffChangeDigest(portsOver(store));
}

/** A kitchen at revision 6 whose latest request carried revision 5: changed since sent, never seen. */
function plantChangedKitchen(revision = "6") {
  return plantSeenKitchen({ revision, customerName: "Ana Popescu" });
}

describe("the staff change digest run", () => {
  it("sends one e-mail for a day however many times the cron fires, and records exactly its rows", async () => {
    const first = plantChangedKitchen();
    const second = plantChangedKitchen("9");

    const firstRun = await run();
    const secondRun = await run();

    expect(firstRun).toEqual({ status: "sent", kitchenCount: 2 });
    expect(secondRun).toEqual({ status: "already-claimed" });
    expect(sender.sent).toHaveLength(1);
    expect(
      currentSeenWorld()
        .store.heldRounds()
        .map((round) => round.dayKey),
    ).toEqual(["2026-10-20"]);
    expect(
      [...currentSeenWorld().store.heldDigestEntries()].sort((a, b) =>
        a.designId.localeCompare(b.designId),
      ),
    ).toEqual(
      [
        { designId: first.designId, revision: "6" },
        { designId: second.designId, revision: "9" },
      ].sort((a, b) => a.designId.localeCompare(b.designId)),
    );
  });

  it("sends nothing on a day with nothing eligible", async () => {
    plantSeenKitchen({ revision: "5" });

    const outcome = await run();

    expect(outcome).toEqual({ status: "nothing-to-send" });
    expect(sender.sent).toHaveLength(0);
  });

  it("leaves out a kitchen its client deleted", async () => {
    plantSeenKitchen({ revision: "6", isDeletedByClient: true });

    expect(await run()).toEqual({ status: "nothing-to-send" });
    expect(sender.sent).toHaveLength(0);
  });

  it("does not list a kitchen again after a save that follows its digest, until it is seen and changed again", async () => {
    const kitchen = plantChangedKitchen();
    await run();
    runAt = NEXT_DAY_RUN;
    plantSeenKitchen({ ...kitchen, revision: "7" });

    const nextDay = await run();

    expect(nextDay).toEqual({ status: "nothing-to-send" });
    expect(sender.sent).toHaveLength(1);
  });

  it("loses the day when the mail is refused, records nothing, and lists the same kitchens the next day", async () => {
    sender = createFakeMailSender([REFUSED]);
    plantChangedKitchen();

    const lostDay = await run();
    runAt = NEXT_DAY_RUN;
    const nextDay = await run();

    expect(lostDay).toEqual({
      status: "failed",
      errorCode: "DIGEST_SEND_FAILED",
      mailFailure: "refused",
    });
    expect(nextDay).toEqual({ status: "sent", kitchenCount: 1 });
    expect(currentSeenWorld().store.heldDigestEntries()).toHaveLength(1);
    expect(sender.sent.map((message) => message.key)).toEqual([
      "staff-change-digest/2026-10-20",
      "staff-change-digest/2026-10-21",
    ]);
  });

  it("does not use the day up when the mail or the public origin is not configured", async () => {
    plantChangedKitchen();
    isMailConfigured = false;
    const noMail = await run();
    isMailConfigured = true;
    isOriginConfigured = false;
    const noOrigin = await run();

    expect(noMail).toEqual({
      status: "failed",
      errorCode: "DIGEST_MAIL_UNAVAILABLE",
    });
    expect(noOrigin).toEqual({
      status: "failed",
      errorCode: "DIGEST_ORIGIN_UNAVAILABLE",
    });
    expect(currentSeenWorld().store.heldRounds()).toEqual([]);
    expect(sender.sent).toHaveLength(0);
  });

  it("refuses to send when one design comes back under two revisions", async () => {
    plantChangedKitchen();
    const store = currentSeenWorld().port;
    const twice = async (
      now: Date,
    ): Promise<readonly DigestEligibleKitchen[]> => {
      const [row] = await store.listDigestEligible(now);
      if (row === undefined) throw new Error("no row");
      return [row, { ...row, revision: "7" }];
    };

    const outcome = await run({ ...store, listDigestEligible: twice });

    expect(outcome).toEqual({
      status: "failed",
      errorCode: "DIGEST_COMPOSE_FAILED",
    });
    expect(sender.sent).toHaveLength(0);
    expect(currentSeenWorld().store.heldDigestEntries()).toEqual([]);
  });

  it("lists a design once when the store returns it twice under the same revision", async () => {
    const kitchen = plantChangedKitchen();
    const store = currentSeenWorld().port;
    const doubled = async (
      now: Date,
    ): Promise<readonly DigestEligibleKitchen[]> => {
      const rows = await store.listDigestEligible(now);
      return [...rows, ...rows];
    };

    const outcome = await run({ ...store, listDigestEligible: doubled });

    expect(outcome).toEqual({ status: "sent", kitchenCount: 1 });
    expect(sender.sent).toHaveLength(1);
    expect(currentSeenWorld().store.heldDigestEntries()).toEqual([
      { designId: kitchen.designId, revision: "6" },
    ]);
  });

  it("claims nothing when the copy cannot be resolved, so a later run the same day still sends", async () => {
    plantChangedKitchen();
    let isCopyBroken = true;
    const ports = {
      ...portsOver(currentSeenWorld().port),
      copy: () => {
        if (isCopyBroken) throw new Error(DRIVER_FAILURE_MARKER);
        return staffChangeDigestCopy();
      },
    };

    const broken = await runStaffChangeDigest(ports);
    isCopyBroken = false;
    const repaired = await runStaffChangeDigest(ports);

    expect(broken).toEqual({
      status: "failed",
      errorCode: "DIGEST_COMPOSE_FAILED",
    });
    expect(JSON.stringify(broken)).not.toContain(DRIVER_FAILURE_MARKER);
    expect(repaired).toEqual({ status: "sent", kitchenCount: 1 });
    expect(sender.sent).toHaveLength(1);
  });

  it("answers a failing store with a code and never serialises the cause", async () => {
    const store = currentSeenWorld().port;
    const failing = {
      ...store,
      claimDigestDay: () => Promise.reject(new Error(DRIVER_FAILURE_MARKER)),
    };

    const outcome = await run(failing);

    expect(outcome).toEqual({
      status: "failed",
      errorCode: "DIGEST_CLAIM_FAILED",
    });
    expect(JSON.stringify(outcome)).not.toContain(DRIVER_FAILURE_MARKER);
  });

  it("reports a failed record after the mail went, and does not send again that day", async () => {
    plantChangedKitchen();
    const store = currentSeenWorld().port;
    const recordFails = {
      ...store,
      recordDigested: () => Promise.reject(new Error(DRIVER_FAILURE_MARKER)),
    };

    const outcome = await run(recordFails);
    const rerun = await run(recordFails);

    expect(outcome).toEqual({
      status: "failed",
      errorCode: "DIGEST_RECORD_FAILED",
    });
    expect(rerun).toEqual({ status: "already-claimed" });
    expect(sender.sent).toHaveLength(1);
  });
});
