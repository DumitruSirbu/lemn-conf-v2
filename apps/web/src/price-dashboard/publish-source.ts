import type { AppLocale } from "@/i18n/routing";

import { pendingPriceCountOf } from "./cabinet-list-model";
import { isProductionBuild } from "./is-production-build";
import type { PublishPageInput, VersionDetailInput } from "./publish-model";

// A production build answers `unavailable`, never a sample; the sample is loaded on a non-production read only, because
// this module is on the path of every staff page (the frame's count). see plan M10 §10, wave U5.

export type PublishPageRead =
  | { readonly kind: "ready"; readonly input: PublishPageInput }
  /** The store holds a draft it cannot read; the revision is what giving it up is made at. */
  | { readonly kind: "draft-unreadable"; readonly draftRevision: string }
  | { readonly kind: "unavailable" };

export type VersionDetailRead =
  | { readonly kind: "ready"; readonly input: VersionDetailInput }
  | { readonly kind: "not-found" }
  | { readonly kind: "unavailable" };

/** The page's input, its cabinets named in the language of the route. */
export async function readPublishPage(
  locale: AppLocale,
): Promise<PublishPageRead> {
  if (isProductionBuild()) return { kind: "unavailable" };
  const { samplePublishPageIn } = await import("./publish-sample");
  return { kind: "ready", input: samplePublishPageIn(locale) };
}

export async function readVersionDetail(
  versionId: string,
  locale: AppLocale,
): Promise<VersionDetailRead> {
  if (isProductionBuild()) return { kind: "unavailable" };
  const { sampleVersionDetail } = await import("./publish-sample");
  const input = sampleVersionDetail(versionId, locale);
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
