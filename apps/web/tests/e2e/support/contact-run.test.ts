import {
  isClientRequestId,
  validateContactFields,
} from "@lemnaria/configurator-domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { makeContactJudge } from "@/lib/server/contact/judge-contact-request";
import {
  CONTACT_NEW_BY_ADDRESS_POLICY,
  E2E_RATE_LIMIT_POLICY_FLAG,
} from "@/lib/server/rate-limit/limit-policy";
import { getRateLimitStore } from "@/lib/server/rate-limit/rate-limit-store-instance";
import { sha256Hex } from "@/lib/server/sha256-hex";

const persistence = vi.hoisted(() => ({
  deletedCounterKeys: [] as (readonly string[])[],
  deletedIds: [] as (readonly string[])[],
  countedIds: [] as (readonly string[])[],
  rowsLeft: 0,
}));

vi.mock("@lemnaria/persistence", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@lemnaria/persistence")>()),
  deleteRateLimitCountersForTests: (keys: readonly string[]) => {
    persistence.deletedCounterKeys.push(keys);
    return Promise.resolve({ rowsRemoved: keys.length, counts: [] });
  },
  deleteContactSubmissionsForTests: (ids: readonly string[]) => {
    persistence.deletedIds.push(ids);
    return Promise.resolve(ids.length);
  },
  countContactSubmissionsForTests: (ids: readonly string[]) => {
    persistence.countedIds.push(ids);
    return Promise.resolve(persistence.rowsLeft);
  },
}));

const {
  addressKeyOf,
  countAndNoteStored,
  hashOfVisitorValue,
  newAddress,
  newName,
  newPhone,
  newRequestId,
  noteReplayOf,
  removeContactRun,
  startContactRun,
  triesKeyOf,
  visitorKeyOf,
} = await import("./contact-run");
const {
  bucketKeyOfTheRun,
  CONTACT_EVERY_REQUEST_TWIN,
  CONTACT_NEW_REQUEST_DAY_TWIN,
  CONTACT_NEW_REQUEST_HOUR_TWIN,
  RUN_SECRET_VARIABLE,
} = await import("./e2e-rate-limit-run");

const FAKE_SECRET =
  "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
const A_VISITOR_VALUE = "v".repeat(43);

beforeEach(() => {
  persistence.deletedCounterKeys.length = 0;
  persistence.deletedIds.length = 0;
  persistence.countedIds.length = 0;
  persistence.rowsLeft = 0;
  vi.stubEnv("TEST_WORKER_INDEX", "1");
  vi.stubEnv(RUN_SECRET_VARIABLE, FAKE_SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/** The keys the real judge counts one request of each kind under, as the server makes them. */
async function keysTheServerCounted(subjects: {
  clientRequestId: string;
  visitorHash: string;
  countedAddress: string;
}): Promise<readonly string[]> {
  const recording = vi.spyOn(getRateLimitStore(), "recordHits");
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const judge = makeContactJudge({
    environment: {
      DIGEST_SECRET: FAKE_SECRET,
      [E2E_RATE_LIMIT_POLICY_FLAG]: "1",
    },
    headers: new Headers(),
    instant: new Date("2026-07-15T12:20:00Z"),
  });

  await judge.everyRequest();
  await judge.triesOfStoredRequest(subjects.clientRequestId);
  await judge.newRequest({
    visitorHash: subjects.visitorHash,
    countedAddress: subjects.countedAddress,
  });

  return recording.mock.calls.flatMap(([buckets]) =>
    buckets.map(({ key }) => key),
  );
}

describe("the keys the run removes its counter rows by", () => {
  it("are exactly the six keys the server counts one request of each kind under", async () => {
    const run = startContactRun();
    const clientRequestId = newRequestId(run);
    const address = newAddress(run);
    const visitorHash = hashOfVisitorValue(A_VISITOR_VALUE);

    const counted = await keysTheServerCounted({
      clientRequestId,
      visitorHash,
      countedAddress: address.toLowerCase(),
    });

    expect([...counted].sort()).toEqual(
      [
        bucketKeyOfTheRun(FAKE_SECRET, CONTACT_EVERY_REQUEST_TWIN.policy.name),
        bucketKeyOfTheRun(
          FAKE_SECRET,
          CONTACT_NEW_REQUEST_HOUR_TWIN.policy.name,
        ),
        bucketKeyOfTheRun(
          FAKE_SECRET,
          CONTACT_NEW_REQUEST_DAY_TWIN.policy.name,
        ),
        triesKeyOf(clientRequestId),
        visitorKeyOf(visitorHash),
        addressKeyOf(address),
      ].sort(),
    );
  });

  it("name an address by the lower-case form the server counts, whatever case it was written in", () => {
    expect(addressKeyOf("Some.One@Example.INVALID")).toBe(
      addressKeyOf("some.one@example.invalid"),
    );
    expect(addressKeyOf("a@example.invalid")).not.toBe(
      addressKeyOf("b@example.invalid"),
    );
  });

  it("depend on the run's secret, so no other run's rows are named", () => {
    const before = triesKeyOf("e2e-aaaaaaaaaaaaaaaaaaaa");
    vi.stubEnv(RUN_SECRET_VARIABLE, "ff".repeat(32));

    expect(triesKeyOf("e2e-aaaaaaaaaaaaaaaaaaaa")).not.toBe(before);
  });

  it("hash a visitor's value as the server does", () => {
    expect(hashOfVisitorValue(A_VISITOR_VALUE)).toBe(
      sha256Hex(A_VISITOR_VALUE),
    );
  });

  it("refuse a text that is not a subject's shape rather than name a row", () => {
    expect(() => triesKeyOf("short")).toThrow();
    expect(() => visitorKeyOf("not-a-hash")).toThrow();
    expect(() => addressKeyOf("not an address")).toThrow();
    expect(CONTACT_NEW_BY_ADDRESS_POLICY.name).toContain("address");
  });
});

describe("what the run makes up", () => {
  it("makes request ids of the schema's shape, never the same twice, and remembers each", () => {
    const run = startContactRun();

    const ids = Array.from({ length: 500 }, () => newRequestId(run));

    expect(new Set(ids).size).toBe(500);
    expect(ids.every(isClientRequestId)).toBe(true);
    expect(run.requestIds).toEqual(ids);
  });

  it("makes a name, a phone and an address a contact form accepts, and an address in mixed case", () => {
    const run = startContactRun();
    const address = newAddress(run);

    const validation = validateContactFields({
      name: newName(),
      phone: newPhone(),
      locality: "Chisinau",
      channel: "email",
      email: address,
      consent: true,
      consentTextVersion: "placeholder",
    });

    expect(validation.ok).toBe(true);
    expect(address).not.toBe(address.toLowerCase());
    expect(run.addresses).toEqual([address]);
  });

  it("makes values that differ from one draw to the next", () => {
    const phones = new Set(Array.from({ length: 200 }, () => newPhone()));
    const names = new Set(Array.from({ length: 200 }, () => newName()));

    expect(phones.size).toBeGreaterThan(150);
    expect(names.size).toBe(200);
  });
});

describe("countAndNoteStored", () => {
  it("counts the one id and remembers it as stored only when it holds a row", async () => {
    const run = startContactRun();
    persistence.rowsLeft = 1;
    await countAndNoteStored(run, "e2e-stored-aaaaaaaaaaaa");
    persistence.rowsLeft = 0;
    await countAndNoteStored(run, "e2e-absent-aaaaaaaaaaaa");

    expect(persistence.countedIds).toEqual([
      ["e2e-stored-aaaaaaaaaaaa"],
      ["e2e-absent-aaaaaaaaaaaa"],
    ]);
    expect(run.storedIds).toEqual(["e2e-stored-aaaaaaaaaaaa"]);
  });
});

describe("removeContactRun", () => {
  it("hands each guarded function the run's own ids and keys and nothing else, and counts what is left", async () => {
    const run = startContactRun();
    const [first, second] = [newRequestId(run), newRequestId(run)];
    noteReplayOf(run, first);
    const address = newAddress(run);
    run.visitorHashes.push(hashOfVisitorValue(A_VISITOR_VALUE));

    const removal = await removeContactRun(run);

    expect(persistence.deletedCounterKeys).toEqual([
      [triesKeyOf(first)],
      [visitorKeyOf(hashOfVisitorValue(A_VISITOR_VALUE))],
      [addressKeyOf(address)],
    ]);
    expect(persistence.deletedIds).toEqual([[first, second]]);
    expect(persistence.countedIds).toEqual([[first, second]]);
    expect(removal).toEqual({
      requestRows: 2,
      triesRows: 1,
      visitorRows: 1,
      addressRows: 1,
      requestRowsLeft: 0,
    });
  });

  it("reports a row left behind rather than hiding it", async () => {
    const run = startContactRun();
    newRequestId(run);
    persistence.rowsLeft = 1;

    expect((await removeContactRun(run)).requestRowsLeft).toBe(1);
  });

  it("asks nothing of a run that wrote nothing", async () => {
    const removal = await removeContactRun(startContactRun());

    expect(persistence.deletedCounterKeys).toEqual([[], [], []]);
    expect(persistence.deletedIds).toEqual([[]]);
    expect(removal.requestRows).toBe(0);
  });
});
