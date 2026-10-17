import {
  CURRENT_SCHEMA_VERSION,
  KITCHEN_L_DESIGN,
} from "@lemnaria/configurator-domain";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  NeonSentKitchenViewRepository,
  SentKitchenViewRepositoryError,
} from "../src/sent-kitchen-view-repository.js";
import {
  FAKE_MARKERS,
  markersFoundOn,
} from "./support/leaked-connection-markers.js";
import {
  answerWith,
  driver,
  failWith,
  resetDriver,
  throwSynchronously,
} from "./support/mocked-neon-driver.js";
import { rejectionOf } from "./support/rejection-of.js";
import {
  REFUSED_VIEWS,
  aViewOf,
} from "./support/sent-kitchen-view-repository-contract.js";
import {
  LOAD_VIEW_STATEMENT_TEXT,
  RECORD_VIEW_STATEMENT_TEXT,
} from "./support/sent-kitchen-view-statements.js";

vi.mock("@neondatabase/serverless", async (importOriginal) =>
  (await import("./support/mocked-neon-driver.js")).withMockedDriver(
    await importOriginal<object>(),
  ),
);

/** A well-formed address no driver is ever asked to reach: the driver is replaced. */
const UNREACHED_URL =
  "postgresql://owner:secret@host.neon.tech/neondb?sslmode=require";
const CLIENT_REQUEST_ID = "driver-view-request-0001";
const STORED_ROW = {
  schema_version: CURRENT_SCHEMA_VERSION,
  design_document: KITCHEN_L_DESIGN,
};

function aRepository(): NeonSentKitchenViewRepository {
  return new NeonSentKitchenViewRepository(UNREACHED_URL);
}

function sentText(index = 0): string {
  return (driver.statements[index]?.text ?? "").replace(/\s+/g, " ").trim();
}

function aLeakingDriverError(code: string): Error {
  const planted = `postgres://${FAKE_MARKERS.join("/")}`;
  return Object.assign(new Error(planted), {
    code,
    detail: planted,
    hint: planted,
    where: planted,
    constraint: planted,
  });
}

describe("NeonSentKitchenViewRepository with the driver replaced", () => {
  beforeEach(resetDriver);

  describe("record", () => {
    it("sends one statement: the insert that keeps a held hash, then whether the row is this request's", async () => {
      answerWith([{ is_recorded: true }]);

      await aRepository().record(aViewOf(CLIENT_REQUEST_ID));

      expect(driver.statements).toHaveLength(1);
      expect(sentText()).toBe(RECORD_VIEW_STATEMENT_TEXT);
    });

    it("sends the hash and the request twice, beside the version and the document text as it was handed in", async () => {
      answerWith([{ is_recorded: true }]);
      const view = aViewOf(CLIENT_REQUEST_ID);

      await aRepository().record(view);

      expect(driver.statements[0]?.values).toEqual([
        view.tokenHash,
        view.clientRequestId,
        view.schemaVersion,
        view.document,
        view.tokenHash,
        view.clientRequestId,
      ]);
    });

    it.each([
      [true, "recorded"],
      [false, "taken"],
    ])("answers is_recorded %s as %s", async (isRecorded, outcome) => {
      answerWith([{ is_recorded: isRecorded }]);

      expect(await aRepository().record(aViewOf(CLIENT_REQUEST_ID))).toBe(
        outcome,
      );
    });

    it.each(REFUSED_VIEWS)(
      "refuses %s before any statement is sent",
      async (_label, change) => {
        await rejectionOf(
          aRepository().record({
            ...aViewOf(CLIENT_REQUEST_ID),
            ...change,
          } as Parameters<NeonSentKitchenViewRepository["record"]>[0]),
        );

        expect(driver.statements).toEqual([]);
      },
    );

    it.each([
      ["no row", []],
      ["two rows", [{ is_recorded: true }, { is_recorded: true }]],
      ["not a list", { is_recorded: true }],
      ["a null row", [null]],
      ["a row with another key", [{ is_recorded: true, token_hash: "x" }]],
      ["a flag that is not a boolean", [{ is_recorded: "true" }]],
    ])("is the repository error for a reply of %s", async (_label, reply) => {
      answerWith(reply);

      const failure = await rejectionOf(
        aRepository().record(aViewOf(CLIENT_REQUEST_ID)),
      );

      expect(failure).toBeInstanceOf(SentKitchenViewRepositoryError);
      expect((failure as SentKitchenViewRepositoryError).operation).toBe(
        "record a sent kitchen view",
      );
    });

    it("repeats the statement after an empty reply, and answers the repeat's row", async () => {
      failWith(new SyntaxError("Unexpected end of JSON input"));
      answerWith([{ is_recorded: true }]);

      expect(await aRepository().record(aViewOf(CLIENT_REQUEST_ID))).toBe(
        "recorded",
      );
      expect(driver.statements).toHaveLength(2);
      expect(driver.statements[1]?.values).toEqual(
        driver.statements[0]?.values,
      );
    });
  });

  describe("load", () => {
    it("sends one statement, reading an unrevoked row by its hash and naming no request", async () => {
      answerWith([]);

      await aRepository().load("a".repeat(64));

      expect(driver.statements).toHaveLength(1);
      expect(sentText()).toBe(LOAD_VIEW_STATEMENT_TEXT);
      expect(driver.statements[0]?.values).toEqual(["a".repeat(64)]);
    });

    it("answers none for no row", async () => {
      answerWith([]);

      expect(await aRepository().load("a".repeat(64))).toEqual({
        kind: "none",
      });
    });

    it("answers the migrated design for the row", async () => {
      answerWith([STORED_ROW]);

      expect(await aRepository().load("a".repeat(64))).toEqual({
        kind: "found",
        design: KITCHEN_L_DESIGN,
      });
    });

    it.each([
      ["two rows", [STORED_ROW, STORED_ROW]],
      ["not a list", STORED_ROW],
      ["a row without the version", [{ design_document: KITCHEN_L_DESIGN }]],
      [
        "a version that is text",
        [{ ...STORED_ROW, schema_version: String(CURRENT_SCHEMA_VERSION) }],
      ],
      ["a document that is text", [{ ...STORED_ROW, design_document: "{}" }]],
      ["a row with another key", [{ ...STORED_ROW, client_request_id: "x" }]],
    ])("is the repository error for a reply of %s", async (_label, reply) => {
      answerWith(reply);

      const failure = await rejectionOf(aRepository().load("a".repeat(64)));

      expect(failure).toBeInstanceOf(SentKitchenViewRepositoryError);
      expect((failure as SentKitchenViewRepositoryError).operation).toBe(
        "load a sent kitchen view",
      );
    });
  });

  describe("a failure of the database", () => {
    it.each([
      ["record", () => aRepository().record(aViewOf(CLIENT_REQUEST_ID))],
      ["load", () => aRepository().load("a".repeat(64))],
    ])(
      "leaves %s as the repository error, carrying the driver's type and code and nothing it said",
      async (_operation, run) => {
        failWith(aLeakingDriverError("23503"));

        const failure = (await rejectionOf(
          run(),
        )) as SentKitchenViewRepositoryError;

        expect(failure).toBeInstanceOf(SentKitchenViewRepositoryError);
        expect(failure.cause).toEqual({ name: "Error", code: "23503" });
        expect(markersFoundOn(failure)).toEqual([]);
      },
    );

    it("is not repeated when the server refused the statement", async () => {
      failWith(aLeakingDriverError("23514"));
      answerWith([{ is_recorded: true }]);

      await rejectionOf(aRepository().record(aViewOf(CLIENT_REQUEST_ID)));

      expect(driver.statements).toHaveLength(1);
    });

    it("includes a driver that throws before it returns a promise", async () => {
      throwSynchronously(new Error("synchronous"));

      const failure = await rejectionOf(aRepository().load("a".repeat(64)));

      expect(failure).toBeInstanceOf(SentKitchenViewRepositoryError);
    });

    it("includes a reply whose row throws when it is read", async () => {
      answerWith([
        new Proxy(
          {},
          {
            ownKeys: () => {
              throw new Error(FAKE_MARKERS.join(" "));
            },
          },
        ),
      ]);

      const failure = await rejectionOf(aRepository().load("a".repeat(64)));

      expect(failure).toBeInstanceOf(SentKitchenViewRepositoryError);
      expect(markersFoundOn(failure)).toEqual([]);
    });
  });

  it("destroys nothing and writes nowhere but its own table", async () => {
    answerWith([{ is_recorded: true }]);
    answerWith([]);

    await aRepository().record(aViewOf(CLIENT_REQUEST_ID));
    await aRepository().load("a".repeat(64));

    const everything = `${sentText(0)} ${sentText(1)}`;
    expect(everything).not.toMatch(/\b(delete|truncate|drop|update)\b/);
    expect(everything).not.toMatch(/\b(designs|design_share_links)\b/);
    expect(everything).not.toMatch(/\bcontact_submissions\b/);
  });
});
