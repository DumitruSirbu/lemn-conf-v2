import { migrateDesign } from "@lemnaria/configurator-domain";

import {
  SentKitchenViewRepositoryError,
  requireValidSentKitchenView,
} from "./sent-kitchen-view-repository.js";
import type {
  SentKitchenViewLookup,
  SentKitchenViewRecording,
  SentKitchenViewRepository,
  SentKitchenViewToRecord,
} from "./sent-kitchen-view-repository.js";

export interface FakeSentKitchenViewRepositoryOptions {
  /** Whether the contact request a view names is stored, standing for the table's reference to it. The fake holds no
   *  requests, so by default every one counts as stored; a test wires its contact store here to see the ordering. */
  readonly isRequestStored?: (clientRequestId: string) => boolean;
}

/** What the fake holds for one link, for a test to read. The Neon repository has no such reading. */
export interface HeldSentKitchenView extends SentKitchenViewToRecord {
  readonly isRevoked: boolean;
}

/**
 * In-memory `SentKitchenViewRepository` for tests that need the port's contract without a database. It refuses what
 * the shared check refuses, and a request `isRequestStored` denies as the repository error the Neon reference gives;
 * it cannot stand for any other refusal of a server.
 */
export class FakeSentKitchenViewRepository
  implements SentKitchenViewRepository
{
  private readonly viewsByTokenHash = new Map<string, HeldSentKitchenView>();
  private readonly isRequestStored: (clientRequestId: string) => boolean;

  constructor({
    isRequestStored = () => true,
  }: FakeSentKitchenViewRepositoryOptions = {}) {
    this.isRequestStored = isRequestStored;
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- a refusal rejects, as the Neon repository's does.
  async record(
    view: SentKitchenViewToRecord,
  ): Promise<SentKitchenViewRecording> {
    requireValidSentKitchenView(view);
    if (!this.isRequestStored(view.clientRequestId)) {
      throw new SentKitchenViewRepositoryError("record a sent kitchen view");
    }
    const held = this.viewsByTokenHash.get(view.tokenHash);
    if (held !== undefined) {
      return held.clientRequestId === view.clientRequestId
        ? "recorded"
        : "taken";
    }
    this.viewsByTokenHash.set(view.tokenHash, {
      tokenHash: view.tokenHash,
      clientRequestId: view.clientRequestId,
      schemaVersion: view.schemaVersion,
      document: view.document,
      isRevoked: false,
    });
    return "recorded";
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- see record.
  async load(tokenHash: string): Promise<SentKitchenViewLookup> {
    const held = this.viewsByTokenHash.get(tokenHash);
    if (held === undefined || held.isRevoked) return { kind: "none" };
    return {
      kind: "found",
      design: migrateDesign(held.schemaVersion, JSON.parse(held.document)),
    };
  }

  /** Test support only, standing for the owner's revocation by hand: the port has no revoke. */
  revoke(tokenHash: string): void {
    const held = this.viewsByTokenHash.get(tokenHash);
    if (held !== undefined) {
      this.viewsByTokenHash.set(tokenHash, { ...held, isRevoked: true });
    }
  }

  /** Copies, so a test cannot change what the fake holds through what it read. */
  heldViews(): readonly HeldSentKitchenView[] {
    return [...this.viewsByTokenHash.values()].map((held) => ({ ...held }));
  }
}
