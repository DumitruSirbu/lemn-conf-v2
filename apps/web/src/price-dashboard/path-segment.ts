/**
 * One id as one path segment, whatever characters it holds. A URL parser reads `.` and `%2E` alike as a dot segment and
 * climbs out of the list's address, so the ids `.` and `..` have their dots encoded twice and name no item.
 */
export function segmentOf(id: string): string {
  const encoded = encodeURIComponent(id);
  return /^\.\.?$/.test(encoded) ? encoded.replaceAll(".", "%252E") : encoded;
}
