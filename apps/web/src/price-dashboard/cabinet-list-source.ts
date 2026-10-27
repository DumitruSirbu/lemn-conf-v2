import type { CabinetListInput } from "./cabinet-list-model";

// The one place the cabinet list's facts come from. It is to become the server read of the active version and the draft,
// building one `CabinetRuleFacts` per cabinet rule with the default-size prices worked out by the domain, and answering
// `unavailable` when the store cannot be read or no version is active. Until then a production build answers
// `unavailable` and any other build answers an invented sample, so no real price is ever claimed.

export type CabinetListRead =
  | { readonly kind: "ready"; readonly input: CabinetListInput }
  | { readonly kind: "unavailable" };

export async function readCabinetList(): Promise<CabinetListRead> {
  const isProductionBuild = process.env.NODE_ENV === "production";
  if (isProductionBuild) return { kind: "unavailable" };
  const { SAMPLE_CABINET_LIST } = await import("./cabinet-list-sample");
  return { kind: "ready", input: SAMPLE_CABINET_LIST };
}
