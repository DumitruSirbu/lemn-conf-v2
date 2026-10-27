import { pendingPriceCountOf } from "./cabinet-list-model";
import type { PublishPageInput, VersionDetailInput } from "./publish-model";

// The one place the publish and history screens' facts come from, and the count of waiting prices every staff page shows.
// R3 replaces this file's bodies with the server read of the active version, the draft, the availability head and the
// versions (`PriceBookStore.readActive`, `readDraft`, `listVersions`, `readVersion`), answering `unavailable` when the store
// cannot be read or no version is active, and `import "server-only"` goes on top then. Until then a production build
// answers `unavailable` and any other build answers an invented sample, so no real price is ever claimed.
//
// The sample is loaded on the first non-production read and not when this module loads: this module is on the path of every
// staff page (the frame's count), and a sample that cannot be built must never take those pages down with it.

export type PublishPageRead =
  | { readonly kind: "ready"; readonly input: PublishPageInput }
  | { readonly kind: "unavailable" };

export type VersionDetailRead =
  | { readonly kind: "ready"; readonly input: VersionDetailInput }
  | { readonly kind: "not-found" }
  | { readonly kind: "unavailable" };

export async function readPublishPage(): Promise<PublishPageRead> {
  if (isProductionBuild()) return { kind: "unavailable" };
  const { SAMPLE_PUBLISH_PAGE } = await import("./publish-sample");
  return { kind: "ready", input: SAMPLE_PUBLISH_PAGE };
}

export async function readVersionDetail(
  versionId: string,
): Promise<VersionDetailRead> {
  if (isProductionBuild()) return { kind: "unavailable" };
  const { sampleVersionDetail } = await import("./publish-sample");
  const input = sampleVersionDetail(versionId);
  return input === undefined ? { kind: "not-found" } : { kind: "ready", input };
}

/**
 * How many prices the draft holds, or nothing when that cannot be known. The staff frame draws a number, or the
 * "all published" line for a known zero, and draws nothing at all for an unknown count: an unreadable store is never
 * reported as an empty draft.
 */
export async function readPendingPriceCount(): Promise<number | undefined> {
  if (isProductionBuild()) return undefined;
  const { SAMPLE_PUBLISH_PAGE } = await import("./publish-sample");
  return pendingPriceCountOf(SAMPLE_PUBLISH_PAGE.state.draft);
}

function isProductionBuild(): boolean {
  return process.env.NODE_ENV === "production";
}
