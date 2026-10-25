import "server-only";

import type { DesignClaimRepository } from "@lemnaria/persistence";
import { NeonConfigurationRepository } from "@lemnaria/persistence";

let designClaimRepository: DesignClaimRepository | undefined;

/**
 * The claim port's one instance, made on first use and never at import or build. A module of its own beside the account
 * store's, so a test that fakes `repository.ts` whole does not take the claim with it, and so `SharedRepository` (which
 * every design test double implements) does not grow a method none of them uses.
 */
export function getDesignClaimRepository(): DesignClaimRepository {
  designClaimRepository ??= new NeonConfigurationRepository();
  return designClaimRepository;
}
