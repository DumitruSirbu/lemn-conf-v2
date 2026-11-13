import { staffPathOf } from "@/staff/staff-paths";

import { segmentOf } from "./path-segment";

// The accessory pages' addresses. An accessory's stands under the list's, which the staff proxy already admits, in one
// segment whatever characters its id holds.

/** The creation form's segment. An accessory's own id never takes it: the server mints each id in its own shape. */
const NEW_SEGMENT = "new";

export function accessoriesPathOf(locale: string): string {
  return staffPathOf(locale, "accessories");
}

export function accessoryNewPathOf(locale: string): string {
  return `${accessoriesPathOf(locale)}/${NEW_SEGMENT}`;
}

export function accessoryPathOf(locale: string, accessoryId: string): string {
  return `${accessoriesPathOf(locale)}/${segmentOf(accessoryId)}`;
}
