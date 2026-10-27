import { staffPathOf } from "@/staff/staff-paths";

// The addresses under "Publicare prețuri": the pending prices, the history of versions, and one version. Each is a full
// load of a staff page, like every link of the staff area. They stand under the publish page's own address, so the
// staff proxy already admits them (`catalog/publish/{id}`) and the navigation marks the publish page for all three.

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
