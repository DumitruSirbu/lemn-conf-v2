import "server-only";

import {
  validateContactSubmission,
  type ContactSubmissionRequest,
} from "@lemnaria/configurator-domain";

import type { ContactRefusal } from "@/lib/server/contact/contact-responses";
import { CONTACT_LEAST_FORM_TIME_MS } from "@/lib/server/rate-limit/limit-policy";

export type ParsedRequest =
  | { readonly kind: "request"; readonly request: ContactSubmissionRequest }
  | { readonly kind: "refused"; readonly refusal: ContactRefusal };

/**
 * The body's text as the domain's one definition of a request. A text that does not parse is validated as nothing,
 * which the schema refuses as not an object, so the refusal always lists at least one issue, each a field and a code
 * and never a value.
 */
export function parseContactRequest(
  text: string,
  servedLocales: readonly string[],
): ParsedRequest {
  const validated = validateContactSubmission(
    jsonOrUndefined(text),
    servedLocales,
  );
  return validated.ok
    ? { kind: "request", request: validated.request }
    : {
        kind: "refused",
        refusal: { code: "CONTACT_INVALID", issues: validated.issues },
      };
}

function jsonOrUndefined(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/** The honeypot was filled, or the form was sent faster than a person fills it: one refusal, which says neither. */
export function isRejectedAsAutomatic(
  request: ContactSubmissionRequest,
): boolean {
  return (
    request.isHoneypotFilled || request.elapsedMs < CONTACT_LEAST_FORM_TIME_MS
  );
}
