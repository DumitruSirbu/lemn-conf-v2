import { staffPathOf } from "@/staff/staff-paths";

// All three stand under the publish page's address, which the staff proxy already admits (`catalog/publish/{id}`).

const HISTORY_SEGMENT = "history";

export function publishPathOf(locale: string): string {
  return staffPathOf(locale, "publish");
}

export function historyPathOf(locale: string): string {
  return `${publishPathOf(locale)}/${HISTORY_SEGMENT}`;
}

export function versionPathOf(locale: string, versionId: string): string {
  return `${publishPathOf(locale)}/${encodeURIComponent(versionId)}`;
}
