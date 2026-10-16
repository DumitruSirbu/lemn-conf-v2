import { randomBytes } from "node:crypto";

import {
  CURRENT_SCHEMA_VERSION,
  KITCHEN_L_DESIGN,
  canonicalSerializeDesign,
} from "@lemnaria/configurator-domain";
import type { Design } from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { SentKitchenViewRepositoryError } from "../../src/sent-kitchen-view-repository.js";
import type {
  SentKitchenViewRepository,
  SentKitchenViewToRecord,
} from "../../src/sent-kitchen-view-repository.js";
import { rejectionOf } from "./rejection-of.js";

export interface SentKitchenViewRepositoryContractSubject {
  readonly createRepository: () => SentKitchenViewRepository;
  /** A client request id the repository's reference accepts: a stored request for the Neon one. */
  readonly newStoredClientRequestId: () => Promise<string>;
}

/** Its own value, so a repository that answered the first kitchen for the second, or the reverse, would show. */
export const ANOTHER_KITCHEN: Design = {
  ...KITCHEN_L_DESIGN,
  presetId: "sent-kitchen-view-contract-another",
};

/** A random digest's shape, never reused: a collision with a row of another run is the hash space's, 2^-256. */
export function newTokenHash(): string {
  return randomBytes(32).toString("hex");
}

export function aViewOf(
  clientRequestId: string,
  design: Design = KITCHEN_L_DESIGN,
): SentKitchenViewToRecord {
  return {
    tokenHash: newTokenHash(),
    clientRequestId,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    document: canonicalSerializeDesign(design),
  };
}

/** A shape the shared check refuses, one part at a time, each beside an otherwise valid view. */
export const REFUSED_VIEWS: readonly (readonly [
  string,
  Partial<Record<keyof SentKitchenViewToRecord, unknown>>,
])[] = [
  ["a token hash that is not a digest", { tokenHash: "not-a-digest" }],
  ["an upper-case token hash", { tokenHash: "A".repeat(64) }],
  ["an empty token hash", { tokenHash: "" }],
  [
    "a client request id with a space",
    { clientRequestId: "a request id 0001" },
  ],
  ["a client request id of 15 characters", { clientRequestId: "a".repeat(15) }],
  ["a client request id of 65 characters", { clientRequestId: "a".repeat(65) }],
  ["schema version 0", { schemaVersion: 0 }],
  [
    "a schema version past the current one",
    { schemaVersion: CURRENT_SCHEMA_VERSION + 1 },
  ],
  ["a fractional schema version", { schemaVersion: 1.5 }],
  [
    "a schema version given as text",
    { schemaVersion: String(CURRENT_SCHEMA_VERSION) },
  ],
  ["a document that is not JSON", { document: "{not json" }],
  ["a document that is a JSON list", { document: "[]" }],
  ["a document that is JSON null", { document: "null" }],
  ["a document encoded twice", { document: JSON.stringify("{}") }],
  ["a document holding a NUL", { document: '{"a":"\u0000"}' }],
  ["a document given as an object", { document: {} }],
];

/** One behaviour for both repositories: what the Neon one does on the live test database, the fake does in memory. */
export function describeSentKitchenViewRepositoryContract({
  createRepository,
  newStoredClientRequestId,
}: SentKitchenViewRepositoryContractSubject): void {
  describe("the sent kitchen view repository contract", () => {
    it("loads the kitchen a recorded view holds", async () => {
      const repository = createRepository();
      const view = aViewOf(await newStoredClientRequestId());

      expect(await repository.record(view)).toBe("recorded");

      expect(await repository.load(view.tokenHash)).toEqual({
        kind: "found",
        design: KITCHEN_L_DESIGN,
      });
    });

    it("answers none for a hash no view was recorded under", async () => {
      expect(await createRepository().load(newTokenHash())).toEqual({
        kind: "none",
      });
    });

    it("answers none for a hash of the wrong shape, rather than refusing it", async () => {
      expect(await createRepository().load("not-a-digest")).toEqual({
        kind: "none",
      });
    });

    it("answers recorded again for the same hash and request, and keeps the first copy", async () => {
      const repository = createRepository();
      const first = aViewOf(await newStoredClientRequestId());
      await repository.record(first);

      const again = await repository.record({
        ...first,
        document: canonicalSerializeDesign(ANOTHER_KITCHEN),
      });

      expect(again).toBe("recorded");
      expect(await repository.load(first.tokenHash)).toEqual({
        kind: "found",
        design: KITCHEN_L_DESIGN,
      });
    });

    it("answers taken for a hash another request holds, and leaves that request's copy as it was", async () => {
      const repository = createRepository();
      const held = aViewOf(await newStoredClientRequestId());
      await repository.record(held);

      const outcome = await repository.record({
        ...aViewOf(await newStoredClientRequestId(), ANOTHER_KITCHEN),
        tokenHash: held.tokenHash,
      });

      expect(outcome).toBe("taken");
      expect(await repository.load(held.tokenHash)).toEqual({
        kind: "found",
        design: KITCHEN_L_DESIGN,
      });
    });

    it("keeps each of two links minted for one request, each opening its own copy", async () => {
      const repository = createRepository();
      const clientRequestId = await newStoredClientRequestId();
      const first = aViewOf(clientRequestId);
      const second = aViewOf(clientRequestId, ANOTHER_KITCHEN);

      await repository.record(first);
      await repository.record(second);

      expect(await repository.load(first.tokenHash)).toEqual({
        kind: "found",
        design: KITCHEN_L_DESIGN,
      });
      expect(await repository.load(second.tokenHash)).toEqual({
        kind: "found",
        design: ANOTHER_KITCHEN,
      });
    });

    it.each(REFUSED_VIEWS)(
      "refuses %s with its own refusal, not the repository error, and stores nothing",
      async (_label, change) => {
        const repository = createRepository();
        const view = {
          ...aViewOf(await newStoredClientRequestId()),
          ...change,
        } as SentKitchenViewToRecord;

        const refusal = await rejectionOf(repository.record(view));

        expect(refusal).toBeInstanceOf(Error);
        expect(refusal).not.toBeInstanceOf(SentKitchenViewRepositoryError);
        expect((refusal as Error).message).toMatch(
          /^Refusing to record a sent kitchen view: /,
        );
        if (typeof view.tokenHash === "string") {
          expect(await repository.load(view.tokenHash)).toEqual({
            kind: "none",
          });
        }
      },
    );

    it("refuses a view that is not an object", async () => {
      const refusal = await rejectionOf(
        createRepository().record(null as unknown as SentKitchenViewToRecord),
      );

      expect(refusal).not.toBeInstanceOf(SentKitchenViewRepositoryError);
      expect((refusal as Error).message).toMatch(/the view must be an object/);
    });
  });
}
