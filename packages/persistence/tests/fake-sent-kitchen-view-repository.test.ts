import { randomBytes } from "node:crypto";

import { KITCHEN_L_DESIGN } from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { FakeSentKitchenViewRepository } from "../src/fake-sent-kitchen-view-repository.js";
import { SentKitchenViewRepositoryError } from "../src/sent-kitchen-view-repository.js";
import { rejectionOf } from "./support/rejection-of.js";
import {
  aViewOf,
  describeSentKitchenViewRepositoryContract,
} from "./support/sent-kitchen-view-repository-contract.js";

function newClientRequestId(): string {
  return `fake-view-${randomBytes(8).toString("hex")}`;
}

describe("FakeSentKitchenViewRepository", () => {
  describeSentKitchenViewRepositoryContract({
    createRepository: () => new FakeSentKitchenViewRepository(),
    newStoredClientRequestId: () => Promise.resolve(newClientRequestId()),
  });

  it("holds the hash with the request it was recorded for, for a test to read", async () => {
    const repository = new FakeSentKitchenViewRepository();
    const view = aViewOf(newClientRequestId());

    await repository.record(view);

    expect(repository.heldViews()).toEqual([{ ...view, isRevoked: false }]);
  });

  it("answers none for a revoked view, and keeps holding it", async () => {
    const repository = new FakeSentKitchenViewRepository();
    const view = aViewOf(newClientRequestId());
    await repository.record(view);

    repository.revoke(view.tokenHash);

    expect(await repository.load(view.tokenHash)).toEqual({ kind: "none" });
    expect(repository.heldViews()).toEqual([{ ...view, isRevoked: true }]);
  });

  it("revokes only the view it is handed", async () => {
    const repository = new FakeSentKitchenViewRepository();
    const clientRequestId = newClientRequestId();
    const revoked = aViewOf(clientRequestId);
    const kept = aViewOf(clientRequestId);
    await repository.record(revoked);
    await repository.record(kept);

    repository.revoke(revoked.tokenHash);

    expect(await repository.load(kept.tokenHash)).toEqual({
      kind: "found",
      design: KITCHEN_L_DESIGN,
    });
  });

  it("refuses, as the repository error, a request its reference says is not stored, and holds nothing", async () => {
    const stored = newClientRequestId();
    const repository = new FakeSentKitchenViewRepository({
      isRequestStored: (clientRequestId) => clientRequestId === stored,
    });

    const failure = await rejectionOf(
      repository.record(aViewOf(newClientRequestId())),
    );

    expect(failure).toBeInstanceOf(SentKitchenViewRepositoryError);
    expect((failure as SentKitchenViewRepositoryError).operation).toBe(
      "record a sent kitchen view",
    );
    expect(repository.heldViews()).toEqual([]);
    expect(await repository.record(aViewOf(stored))).toBe("recorded");
  });

  it("hands out copies, so what a test reads cannot change what it holds", async () => {
    const repository = new FakeSentKitchenViewRepository();
    const view = aViewOf(newClientRequestId());
    await repository.record(view);

    const [read] = repository.heldViews();
    (read as { isRevoked: boolean }).isRevoked = true;

    expect(await repository.load(view.tokenHash)).toEqual({
      kind: "found",
      design: KITCHEN_L_DESIGN,
    });
  });
});
