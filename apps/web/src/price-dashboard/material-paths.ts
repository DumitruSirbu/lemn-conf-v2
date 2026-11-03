import { staffPathOf } from "@/staff/staff-paths";

// The materials pages' addresses. A material's stands under the list's, which the staff proxy already admits, in one
// segment whatever characters the tier id holds.

export function materialsPathOf(locale: string): string {
  return staffPathOf(locale, "materials");
}

export function materialPathOf(locale: string, tierId: string): string {
  return `${materialsPathOf(locale)}/${segmentOf(tierId)}`;
}

/** A URL parser reads `.` and `%2E` alike as a dot segment, so the ids `.` and `..` have their dots encoded twice. */
function segmentOf(tierId: string): string {
  const encoded = encodeURIComponent(tierId);
  return /^\.\.?$/.test(encoded) ? encoded.replaceAll(".", "%252E") : encoded;
}
