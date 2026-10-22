"use client";

import { FailureNotice } from "./kitchen-failure-notice";
import type { RemoveStatus } from "./use-remove-kitchen";

/** What the last attempt left in the dialog: nothing before one and while it is out, the reason after a failure. */
export function RemoveFailureNotice({
  status,
}: {
  readonly status: RemoveStatus;
}) {
  return status.kind === "failed" ? (
    <FailureNotice failure={status.failure} />
  ) : null;
}
