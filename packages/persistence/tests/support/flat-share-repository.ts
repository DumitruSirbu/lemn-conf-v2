import type { DesignId } from "@lemnaria/configurator-domain";

import type {
  NeonShareLinkRepository,
  ShareLinkCredentials,
} from "../../src/share-link-repository.js";

/** The pair of hashes the live suites have always passed, flat beside the design id. */
export interface FlatShareCredentials {
  readonly designId: DesignId;
  readonly writeTokenHash: string;
  readonly visitorHash: string;
}

/** The share repository as these suites were written: the flat write-token pair, converted to the credential union at
 *  the seam, so every case still states its credentials the way it always did. */
export function flatShareRepository(repository: NeonShareLinkRepository) {
  const writeTokenArm = ({
    designId,
    writeTokenHash,
    visitorHash,
  }: FlatShareCredentials): ShareLinkCredentials => ({
    designId,
    credential: { kind: "write-token", writeTokenHash, visitorHash },
  });
  return {
    issue: ({
      tokenHash,
      ...credentials
    }: FlatShareCredentials & { tokenHash: string }) =>
      repository.issue({ ...writeTokenArm(credentials), tokenHash }),
    revoke: (credentials: FlatShareCredentials) =>
      repository.revoke(writeTokenArm(credentials)),
    status: (credentials: FlatShareCredentials) =>
      repository.status(writeTokenArm(credentials)),
    loadShared: (tokenHash: string) => repository.loadShared(tokenHash),
  };
}

export type FlatShareRepository = ReturnType<typeof flatShareRepository>;
