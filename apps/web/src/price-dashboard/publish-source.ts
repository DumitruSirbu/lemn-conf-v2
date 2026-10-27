import { pendingPriceCountOf } from "./cabinet-list-model";
import { isProductionBuild } from "./is-production-build";
import type { PublishPageInput, VersionDetailInput } from "./publish-model";

// A production build answers `unavailable`, never a sample; the sample is loaded on a non-production read only, because
// this module is on the path of every staff page (the frame's count). see plan M10 §10, wave U5.

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
