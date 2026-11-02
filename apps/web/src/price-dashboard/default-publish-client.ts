import type { PublishPageInput, VersionDetailInput } from "./publish-model";
import {
  lazyClient,
  UNAVAILABLE_PUBLISH_CLIENT,
  type PublishClient,
} from "./publish-client";

// The screens' client when none is handed in: nothing in a production build, an in-memory one elsewhere.
//
// The test is spelled out here, not asked of `is-production-build.ts`, which says why.

export type DefaultClientSource =
  | { readonly kind: "publish"; readonly input: PublishPageInput }
  | { readonly kind: "version"; readonly input: VersionDetailInput }
  /** A draft that cannot be read states no book to build a sample from: nothing is written. */
  | { readonly kind: "unreadable" };

export function defaultPublishClient(
  source: DefaultClientSource,
): PublishClient {
  if (process.env.NODE_ENV === "production") return UNAVAILABLE_PUBLISH_CLIENT;
  if (source.kind === "unreadable") return UNAVAILABLE_PUBLISH_CLIENT;
  return lazyClient(async () => {
    const sample = await import("./publish-sample-client");
    return source.kind === "publish"
      ? sample.makeSamplePublishClient({
          state: source.input.state,
          archived: new Map(),
          history: {
            versions: source.input.versions.versions,
            pageSize: source.input.versions.pageSize,
          },
        })
      : sample.makeSampleVersionClient(source.input);
  });
}
