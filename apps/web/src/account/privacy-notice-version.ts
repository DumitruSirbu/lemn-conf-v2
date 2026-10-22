import { PRIVACY_NOTICE_VERSIONS } from "@lemnaria/configurator-domain";

/**
 * The notice version a registration names and the notice page stands for: the first entry of the domain's closed
 * list, so what a new account records is always a notice that was shown. An empty list is a programming error.
 */
export function currentPrivacyNoticeVersion(): string {
  const [current] = PRIVACY_NOTICE_VERSIONS;
  if (current === undefined) {
    throw new Error("PRIVACY_NOTICE_VERSIONS is empty: no notice to name");
  }
  return current;
}
