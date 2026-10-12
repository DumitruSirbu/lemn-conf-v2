import {
  classifyContactAnswer,
  FAILED_OUTCOME,
  type ContactAnswer,
  type ContactOutcome,
} from "./contact-answer";
import type { ContactSubmissionBody } from "./contact-form-model";

// The one request the contact form makes. It has no abort and no timer: the form's one-in-flight guard lasts until
// this settles, so it must last at least as long as the server may take, whatever that is. see M8 plan 8L.5.

/** A same-origin path, so the browser states the origin the route's cross-site guard reads. */
export const CONTACT_SUBMISSIONS_ENDPOINT = "/api/contact-submissions";

const JSON_MEDIA_TYPE = "application/json";

/** `fetch`, as far as this request uses it, so a test hands in its own. */
export type FetchContact = (
  url: string,
  init: RequestInit,
) => Promise<Response>;

/** Sends the body and says which class the answer is. A request that got no answer is a failure, not a throw. */
export async function sendContactRequest(
  body: ContactSubmissionBody,
  fetchContact: FetchContact,
): Promise<ContactOutcome> {
  const answer = await answerTo(body, fetchContact);
  return answer === undefined ? FAILED_OUTCOME : classifyContactAnswer(answer);
}

/** After these no send is offered: the request is stored, or the design it names is not one a send can mend. */
export function isFinalOutcome(outcome: ContactOutcome): boolean {
  return (
    outcome.kind === "sent" ||
    outcome.kind === "design-not-current" ||
    outcome.kind === "does-not-fit"
  );
}

async function answerTo(
  body: ContactSubmissionBody,
  fetchContact: FetchContact,
): Promise<ContactAnswer | undefined> {
  try {
    const response = await fetchContact(CONTACT_SUBMISSIONS_ENDPOINT, {
      method: "POST",
      headers: { "content-type": JSON_MEDIA_TYPE },
      body: JSON.stringify(body),
    });
    return {
      status: response.status,
      retryAfter: response.headers.get("retry-after"),
      body: await readJsonOrNothing(response),
    };
  } catch {
    return undefined;
  }
}

async function readJsonOrNothing(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}
