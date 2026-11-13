import { staffPathOf } from "@/staff/staff-paths";

import { segmentOf } from "./path-segment";

// The materials pages' addresses. A material's stands under the list's, which the staff proxy already admits, in one
// segment whatever characters the tier id holds.

export function materialsPathOf(locale: string): string {
  return staffPathOf(locale, "materials");
}

export function materialPathOf(locale: string, tierId: string): string {
  return `${materialsPathOf(locale)}/${segmentOf(tierId)}`;
}
