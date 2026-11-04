import { staffPathOf } from "@/staff/staff-paths";

import { segmentOf } from "./path-segment";

// The cabinets' two addresses. A cabinet's stands under the list's, which the staff proxy already admits, in one
// segment whatever characters the rule id holds.

export function cabinetsPathOf(locale: string): string {
  return staffPathOf(locale, "cabinets");
}

export function cabinetPathOf(locale: string, ruleId: string): string {
  return `${cabinetsPathOf(locale)}/${segmentOf(ruleId)}`;
}
