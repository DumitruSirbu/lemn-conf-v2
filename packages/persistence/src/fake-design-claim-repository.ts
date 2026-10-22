import type { DesignId } from "@lemnaria/configurator-domain";

import { requireAccountIdShape } from "./account-id-shape.js";
import type {
  DesignClaimRepository,
  VisitorDesignsClaim,
} from "./neon-configuration-repository.js";
import { requireSha256Digest } from "./sha256-digest.js";

/** A design row as far as claiming sees it. `accountId` is `undefined` for a design no account holds. */
export interface HeldClaimableDesign {
  readonly id: DesignId;
  readonly visitorHash: string;
  accountId: string | undefined;
}

/**
 * In-memory `DesignClaimRepository` with the Neon one's contract: a claim sets the account on unclaimed designs of the
 * visitor and on nothing else, and a design with an account is never touched. `FakeConfigurationRepository` holds no
 * visitor or account, so claiming has this fake of its own; a test seeds the rows it needs with `seed`.
 */
export class FakeDesignClaimRepository implements DesignClaimRepository {
  private readonly designs: HeldClaimableDesign[] = [];

  /** Test setup: a design the visitor holds, claimed by `accountId` when one is given. */
  seed(design: {
    id: DesignId;
    visitorHash: string;
    accountId?: string;
  }): void {
    this.designs.push({
      id: design.id,
      visitorHash: design.visitorHash,
      accountId: design.accountId,
    });
  }

  /** The account a design is held by, or `undefined` for an unclaimed or unknown design. */
  accountOf(id: DesignId): string | undefined {
    return this.designs.find((design) => design.id === id)?.accountId;
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- the contract is asynchronous; the fake is not.
  async countClaimable(visitorHash: string): Promise<number> {
    requireSha256Digest(visitorHash, "visitor hash", "count claimable designs");
    return this.unclaimedOf(visitorHash).length;
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- see countClaimable.
  async claimVisitorDesigns({
    visitorHash,
    accountId,
  }: VisitorDesignsClaim): Promise<readonly DesignId[]> {
    requireSha256Digest(visitorHash, "visitor hash", "claim designs");
    requireAccountIdShape(accountId, "claim designs");
    const claimed = this.unclaimedOf(visitorHash);
    for (const design of claimed) design.accountId = accountId;
    return claimed.map((design) => design.id);
  }

  private unclaimedOf(visitorHash: string): HeldClaimableDesign[] {
    return this.designs.filter(
      (design) =>
        design.visitorHash === visitorHash && design.accountId === undefined,
    );
  }
}
