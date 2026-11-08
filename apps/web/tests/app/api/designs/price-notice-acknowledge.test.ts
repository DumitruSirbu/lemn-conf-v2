import { SAMPLE_PRICE_BOOK } from "@lemnaria/configurator-domain";
import { DashboardStoreError } from "@lemnaria/persistence";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { isVersionId } from "@/lib/server/price-dashboard/identifier-shape";

import {
  freshAccountWorld,
  jsonOf,
  limiterLedger,
} from "../../../support/account-world";
import {
  administrator,
  publishNextVersion,
} from "../../../support/availability-route-world";
import {
  freshPriceDashboardWorld,
  type PriceDashboardWorld,
} from "../../../support/price-dashboard-world";
import {
  NOTICE_DESIGN_ID,
  OWNER_WRITE_COOKIE,
  OWNER_WRITE_TOKEN_HASH,
  freshEditableDesigns,
  makePriceStoresReject,
  type StubEditableDesigns,
} from "../../../support/price-notice-stubs";
import { acknowledge, readNotice } from "../../../support/price-notice-world";

/**
 * M10 R5b-d, R5b-f and R5b-i at the acknowledgement route (ADR 0178, price-notice Amendment of 2026-11-08, ruling 5): the
 * body's order of refusals and the closed word of each, that the store is not called for a body it can be spared, that the
 * store's own two refusals leave the marker as it was, and that a `200` is the pair the marker then holds.
 */

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
vi.mock("@/lib/server/repository", () =>
  import("../../../support/price-notice-stubs").then((world) =>
    world.editableRepositoryModule(),
  ),
);

let priceWorld: PriceDashboardWorld;
let editable: StubEditableDesigns;
let head: string;
let recordAcknowledged: ReturnType<typeof spyOnRecordAcknowledged>;

function spyOnRecordAcknowledged(world: PriceDashboardWorld) {
  return vi.spyOn(world.stores.notices, "recordAcknowledged");
}

beforeEach(async () => {
  freshAccountWorld();
  limiterLedger.subjects.push({
    kind: "write-credential",
    subject: OWNER_WRITE_TOKEN_HASH,
  });
  priceWorld = await freshPriceDashboardWorld({ book: SAMPLE_PRICE_BOOK });
  editable = freshEditableDesigns();
  makePriceStoresReject(undefined);
  head = (await priceWorld.stores.availability.readCurrent()).revision;
  recordAcknowledged = spyOnRecordAcknowledged(priceWorld);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function displayed() {
  return { versionId: priceWorld.versionId, availabilityRevision: head };
}

function send(json: unknown, extra: { contentType?: string | null } = {}) {
  return acknowledge({ cookie: OWNER_WRITE_COOKIE, json, ...extra });
}

function marker() {
  return priceWorld.stores.notices.readAcknowledged(NOTICE_DESIGN_ID);
}

/** Nothing reached the port or the store: the body was refused where it was read. */
function expectNothingAsked(): void {
  expect(editable.calls).toEqual([]);
  expect(recordAcknowledged).not.toHaveBeenCalled();
}

describe("the media type and the bound", () => {
  it.each(["text/plain", "application/x-www-form-urlencoded", null])(
    "answers 415 for %s",
    async (contentType) => {
      const answer = await send(JSON.stringify(displayed()), { contentType });

      expect(answer.status).toBe(415);
      expect(await jsonOf(answer)).toEqual({
        status: "unsupported-media-type",
      });
      expectNothingAsked();
    },
  );

  it.each(["application/json; charset=utf-8", "APPLICATION/JSON"])(
    "reads a body sent as %s",
    async (contentType) => {
      const answer = await send(displayed(), { contentType });

      expect(answer.status).toBe(200);
    },
  );

  it("answers 413 for a body past a kilobyte, and the store is not called", async () => {
    const answer = await send({ ...displayed(), padding: "x".repeat(2_000) });

    expect(answer.status).toBe(413);
    expect(await jsonOf(answer)).toEqual({ status: "body-too-large" });
    expectNothingAsked();
  });
});

describe("a body that is not the object the route takes is 400 invalid-request, with nothing echoed", () => {
  it.each([
    ["an array", "[]"],
    ["a number", "3"],
    ["null", "null"],
    ["a string", '"text"'],
    ["text that is not JSON", "{versionId:"],
    ["an empty body", ""],
    ["an extra member", JSON.stringify({ ...{ versionId: "x" }, extra: 1 })],
    ["__proto__ as a member", '{"__proto__": {"versionId": "x"}}'],
  ])("for %s", async (_label, body) => {
    const answer = await send(body);

    expect(answer.status).toBe(400);
    expect(await jsonOf(answer)).toEqual({ status: "invalid-request" });
    expectNothingAsked();
  });

  it("for a body that names the design: the id is the path's, never the body's", async () => {
    const answer = await send({
      ...displayed(),
      designId: "another-designs-id",
    });

    expect(answer.status).toBe(400);
    expect(await jsonOf(answer)).toEqual({ status: "invalid-request" });
    expectNothingAsked();
  });
});

describe("a member that is missing or not text is 400 MISSING_VALUE, naming it", () => {
  it.each([
    [{}, ["versionId", "availabilityRevision"]],
    [{ versionId: priceVersion() }, ["availabilityRevision"]],
    [{ availabilityRevision: "0" }, ["versionId"]],
    [
      { versionId: 7, availabilityRevision: 0 },
      ["versionId", "availabilityRevision"],
    ],
    [{ versionId: null, availabilityRevision: "0" }, ["versionId"]],
  ])("for %j", async (body, fields) => {
    const answer = await send(body);

    expect(answer.status).toBe(400);
    expect(await jsonOf(answer)).toEqual({
      status: "invalid-input",
      issues: fields.map((field) => ({ field, code: "MISSING_VALUE" })),
    });
    expectNothingAsked();
  });
});

function priceVersion(): string {
  return "A".repeat(21);
}

describe("a member off its shape is 400 UNKNOWN_VALUE before the store", () => {
  it("refuses a version id of 20 characters, which the dashboard's own check admits", async () => {
    const twentyCharacters = "A".repeat(20);
    expect(isVersionId(twentyCharacters)).toBe(true);

    const answer = await send({ ...displayed(), versionId: twentyCharacters });

    expect(answer.status).toBe(400);
    expect(await jsonOf(answer)).toEqual({
      status: "invalid-input",
      issues: [{ field: "versionId", code: "UNKNOWN_VALUE" }],
    });
    expectNothingAsked();
  });

  it.each(["", "A".repeat(22), `${"A".repeat(20)}!`, `${"A".repeat(20)} `])(
    "refuses the version id %j",
    async (versionId) => {
      const answer = await send({ ...displayed(), versionId });

      expect(answer.status).toBe(400);
      expect(await jsonOf(answer)).toEqual({
        status: "invalid-input",
        issues: [{ field: "versionId", code: "UNKNOWN_VALUE" }],
      });
      expectNothingAsked();
    },
  );

  it.each([
    "",
    "-1",
    "01",
    "1.0",
    " 1",
    "1 ",
    "0x10",
    "9".repeat(20),
    "9223372036854775808",
  ])("refuses the availability revision %j", async (availabilityRevision) => {
    const answer = await send({ ...displayed(), availabilityRevision });

    expect(answer.status).toBe(400);
    expect(await jsonOf(answer)).toEqual({
      status: "invalid-input",
      issues: [{ field: "availabilityRevision", code: "UNKNOWN_VALUE" }],
    });
    expectNothingAsked();
  });

  it("names both members when both are off their shapes, versionId first", async () => {
    const answer = await send({
      versionId: "short",
      availabilityRevision: "-1",
    });

    expect(await jsonOf(answer)).toEqual({
      status: "invalid-input",
      issues: [
        { field: "versionId", code: "UNKNOWN_VALUE" },
        { field: "availabilityRevision", code: "UNKNOWN_VALUE" },
      ],
    });
  });

  it("takes the widest revision a database holds, and zero", async () => {
    expect(
      (await send({ ...displayed(), availabilityRevision: "0" })).status,
    ).toBe(200);
  });
});

describe("the store's own refusals leave the marker as it was", () => {
  beforeEach(async () => {
    await readNotice({ cookie: OWNER_WRITE_COOKIE });
  });

  it("answers 400 unknown-version for a minted-shaped id no version holds", async () => {
    const before = await marker();

    const answer = await send({ ...displayed(), versionId: priceVersion() });

    expect(answer.status).toBe(400);
    expect(await jsonOf(answer)).toEqual({ status: "unknown-version" });
    expect(await marker()).toEqual(before);
  });

  it("answers 400 revision-ahead for a revision past the head", async () => {
    const before = await marker();

    const answer = await send({
      ...displayed(),
      availabilityRevision: String(Number(head) + 1),
    });

    expect(answer.status).toBe(400);
    expect(await jsonOf(answer)).toEqual({ status: "revision-ahead" });
    expect(await marker()).toEqual(before);
  });
});

describe("a pair the store accepts", () => {
  it("answers 200 with the pair, which the marker then holds", async () => {
    const answer = await send(displayed());

    expect(answer.status).toBe(200);
    expect(await jsonOf(answer)).toEqual({ acknowledged: displayed() });
    expect(await marker()).toEqual({
      kind: "recorded",
      acknowledged: displayed(),
    });
  });

  it("accepts a version published after the page loaded, in the same world the editor prices under", async () => {
    const staff = await administrator();
    const next = await publishNextVersion(staff, {
      ...SAMPLE_PRICE_BOOK,
      amountsProvisional: !SAMPLE_PRICE_BOOK.amountsProvisional,
    });
    if (next.kind !== "ok") throw new Error("the second version was refused");
    const newHead = (await priceWorld.stores.availability.readCurrent())
      .revision;

    const answer = await send({
      versionId: next.versionId,
      availabilityRevision: newHead,
    });

    expect(answer.status).toBe(200);
  });

  it("replaces a marker the design holds, and moves no revision of any design", async () => {
    await readNotice({ cookie: OWNER_WRITE_COOKIE });
    const staff = await administrator();
    const next = await publishNextVersion(staff, SAMPLE_PRICE_BOOK);
    if (next.kind !== "ok") throw new Error("the second version was refused");
    const newHead = (await priceWorld.stores.availability.readCurrent())
      .revision;
    const second = { versionId: next.versionId, availabilityRevision: newHead };

    await send(second);

    expect(await marker()).toEqual({ kind: "recorded", acknowledged: second });
    expect(editable.calls.every((call) => call.id === NOTICE_DESIGN_ID)).toBe(
      true,
    );
  });
});

describe("the first open (R5b-f)", () => {
  it("records the root's own pair, which is the version and head the editor prices under", async () => {
    const recordIfAbsent = vi.spyOn(
      priceWorld.stores.notices,
      "recordIfAbsent",
    );

    await readNotice({ cookie: OWNER_WRITE_COOKIE });

    expect(recordIfAbsent).toHaveBeenCalledOnce();
    expect(recordIfAbsent).toHaveBeenCalledWith(NOTICE_DESIGN_ID, displayed());
  });

  it("leaves the pair an acknowledgement recorded: a later first-open insert never overwrites it", async () => {
    const staff = await administrator();
    const next = await publishNextVersion(staff, SAMPLE_PRICE_BOOK);
    if (next.kind !== "ok") throw new Error("the second version was refused");
    await send(displayed());

    await readNotice({ cookie: OWNER_WRITE_COOKIE });

    expect(await marker()).toEqual({
      kind: "recorded",
      acknowledged: displayed(),
    });
  });

  it("leaves one marker when two first opens race", async () => {
    await Promise.all([
      readNotice({ cookie: OWNER_WRITE_COOKIE }),
      readNotice({ cookie: OWNER_WRITE_COOKIE }),
    ]);

    expect(await marker()).toEqual({
      kind: "recorded",
      acknowledged: displayed(),
    });
  });
});

describe("a store that fails, or refuses a shape the reader had judged", () => {
  it("answers a store invalid-request as the same 400 UNKNOWN_VALUE, never a 5xx", async () => {
    recordAcknowledged.mockRejectedValueOnce(
      new DashboardStoreError(
        "record a design's acknowledged prices",
        "invalid-request",
      ),
    );

    const answer = await send(displayed());

    expect(answer.status).toBe(400);
    expect(await jsonOf(answer)).toEqual({
      status: "invalid-input",
      issues: [
        { field: "versionId", code: "UNKNOWN_VALUE" },
        { field: "availabilityRevision", code: "UNKNOWN_VALUE" },
      ],
    });
  });

  it("answers a store that is unavailable with the constant 503, and writes nothing", async () => {
    recordAcknowledged.mockRejectedValueOnce(
      new DashboardStoreError(
        "record a design's acknowledged prices",
        "unavailable",
      ),
    );

    const answer = await send(displayed());

    expect(answer.status).toBe(503);
    expect(await jsonOf(answer)).toEqual({ status: "unavailable" });
    expect(await marker()).toEqual({ kind: "never-recorded" });
  });
});
