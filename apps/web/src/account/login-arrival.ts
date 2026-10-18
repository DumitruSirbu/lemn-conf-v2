// Why a person was sent to the login page, when something sent them. The address says it as `?reason=`, and that is all
// it says: it selects a note from a closed list and never carries a value the person typed, an address or a way back.

export type LoginArrival = "session-expired";

const KNOWN_ARRIVALS: readonly LoginArrival[] = ["session-expired"];

/** A reason outside the list, repeated or empty is no reason: the page then shows nothing extra. */
export function loginArrivalOf(
  reason: string | readonly string[] | undefined,
): LoginArrival | undefined {
  return typeof reason === "string"
    ? KNOWN_ARRIVALS.find((arrival) => arrival === reason)
    : undefined;
}
