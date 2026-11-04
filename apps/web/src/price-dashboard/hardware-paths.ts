import { staffPathOf } from "@/staff/staff-paths";

import { segmentOf } from "./path-segment";

// The hardware pages' addresses. A class's stands under the list's, which the staff proxy already admits, in one segment
// whatever characters the tier id holds.

/** The creation form's segment. A class's own id never takes it: the server mints each id in its own shape. */
const NEW_SEGMENT = "new";

export function hardwarePathOf(locale: string): string {
  return staffPathOf(locale, "hardware");
}

export function hardwareNewPathOf(locale: string): string {
  return `${hardwarePathOf(locale)}/${NEW_SEGMENT}`;
}

export function hardwareClassPathOf(locale: string, tierId: string): string {
  return `${hardwarePathOf(locale)}/${segmentOf(tierId)}`;
}
