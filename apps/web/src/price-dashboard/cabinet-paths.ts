import { staffPathOf } from "@/staff/staff-paths";

// The cabinets' two addresses. A cabinet's stands under the list's, which the staff proxy already admits, in one
// segment whatever characters the rule id holds.

export function cabinetsPathOf(locale: string): string {
  return staffPathOf(locale, "cabinets");
}

export function cabinetPathOf(locale: string, ruleId: string): string {
  return `${cabinetsPathOf(locale)}/${segmentOf(ruleId)}`;
}

/**
 * A URL parser reads `.` and `%2E` alike as a dot segment and climbs out of the cabinets' address, so the ids `.` and `..`
 * have no spelling of their own: their dots are encoded twice and the address names no cabinet, whose page says so.
 */
function segmentOf(ruleId: string): string {
  const encoded = encodeURIComponent(ruleId);
  return /^\.\.?$/.test(encoded) ? encoded.replaceAll(".", "%252E") : encoded;
}
