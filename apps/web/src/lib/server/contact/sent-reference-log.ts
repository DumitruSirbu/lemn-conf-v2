import "server-only";

// Handed only a cause from a closed list, so no thrown value, message, id, revision or reference can be written.

/** Why a read of a sent reference was not answered: a closed list, so the line can never carry a thrown value. */
export const SENT_REFERENCE_CAUSES = [
  "store-error",
  "deadline",
  "unexpected",
] as const;

export type SentReferenceCause = (typeof SENT_REFERENCE_CAUSES)[number];

/** Grepped for in a platform log view, so it is one literal. */
const SENT_REFERENCE_LABEL = "[sent-reference]";
const UNREAD_EVENT = "sent-reference-unread";
const UNEXPECTED_CAUSE: SentReferenceCause = "unexpected";

const causesWritten = new Set<SentReferenceCause>();

/** A read of a sent reference failed: written once per process and cause, so a flood buys one write. */
export function reportSentReferenceUnread(cause: SentReferenceCause): void {
  const known =
    SENT_REFERENCE_CAUSES.find((candidate) => candidate === cause) ??
    UNEXPECTED_CAUSE;
  if (causesWritten.has(known)) return;
  causesWritten.add(known);
  writeError({ event: UNREAD_EVENT, cause: known });
}

/** The write may not throw: nothing is left to report a failed write with. */
function writeError(line: Readonly<Record<string, string>>): void {
  try {
    console.error(SENT_REFERENCE_LABEL, JSON.stringify(line));
  } catch {
    // Nothing to fall back to, and nothing may escape.
  }
}
