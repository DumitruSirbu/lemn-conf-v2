import "server-only";

import { domainToASCII } from "node:url";

// A mailbox the library parses back to the very string it was given: dot-atom parts, one `@`.
const PLAIN_LOCAL_PART =
  /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;
// Checked before the name is converted, because the URL parser behind the conversion stops at `\`, `/`, `?` and `#`.
const DOMAIN_BEFORE_CONVERSION =
  /^[\p{L}\p{N}](?:[\p{L}\p{N}-]*[\p{L}\p{N}])?(?:\.[\p{L}\p{N}](?:[\p{L}\p{N}-]*[\p{L}\p{N}])?)*$/u;
// The last label starts with a letter: the URL parser rewrites a name ending in a number as an IPv4 address.
const PLAIN_ASCII_DOMAIN =
  /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)*[a-z](?:[a-z0-9-]*[a-z0-9])?$/;

// RFC 5321 section 4.5.3.1: past these the library refuses the envelope, so the reader must too.
const MAX_LOCAL_PART_LENGTH = 64;
const MAX_DOMAIN_LENGTH = 253;
const MAX_LABEL_LENGTH = 63;

/**
 * The one rule for what the mail adapter can write as an address: exactly one plain mailbox. The configuration reader
 * and the adapter both ask it, so a value the adapter would refuse unsent reads as unavailable instead of configured.
 * Answers the lower-case ASCII domain, which is also what a `msg-id` may hold, or `undefined` for anything else.
 */
export function asciiDomainOfPlainMailbox(address: string): string | undefined {
  const parts = address.split("@");
  const [localPart, domain] = parts;
  if (parts.length !== 2 || !isPlainLocalPart(localPart ?? "")) {
    return undefined;
  }
  const asciiDomain = asciiDomainOf(domain);
  return isPlainAsciiDomain(asciiDomain) ? asciiDomain : undefined;
}

function isPlainLocalPart(localPart: string): boolean {
  return (
    localPart.length <= MAX_LOCAL_PART_LENGTH &&
    PLAIN_LOCAL_PART.test(localPart)
  );
}

function isPlainAsciiDomain(asciiDomain: string): boolean {
  return (
    asciiDomain.length <= MAX_DOMAIN_LENGTH &&
    asciiDomain.split(".").every((label) => label.length <= MAX_LABEL_LENGTH) &&
    PLAIN_ASCII_DOMAIN.test(asciiDomain)
  );
}

function asciiDomainOf(domain: string | undefined): string {
  return domain !== undefined && DOMAIN_BEFORE_CONVERSION.test(domain)
    ? domainToASCII(domain)
    : "";
}
