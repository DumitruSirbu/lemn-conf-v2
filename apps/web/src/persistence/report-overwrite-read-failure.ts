import { boundedFailureReason } from "@lemnaria/configurator-domain";

/** Grepped for in a platform log view, so it is one literal and not assembled. */
const SAVE_LOG_LABEL = "[save]";

/**
 * Writes down that the overwrite's re-read of the stored revision failed, in the shape the other client lines have;
 * `console` is the whole transport. The failure's message names the operation and a status and holds nothing of the
 * answer's body. Nothing may escape: a thrown value can define a throwing `message`, and this runs inside the very
 * path it reports on.
 */
export function reportOverwriteReadFailure(failure: unknown): void {
  try {
    console.warn(SAVE_LOG_LABEL, {
      event: "overwrite-read-failed",
      reason: boundedFailureReason(
        failure instanceof Error ? failure.message : String(failure),
      ),
    });
  } catch {
    // The only thing left to report a failed report with is the transport that just failed.
  }
}
