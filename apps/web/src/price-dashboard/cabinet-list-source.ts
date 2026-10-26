import type { CabinetListInput } from "./cabinet-list-model";
import { SAMPLE_CABINET_LIST } from "./cabinet-list-sample";

// THE SEAM LANE R FILLS. The cabinet list's page asks `readCabinetList()` for what it draws, and nothing else reaches the
// screen. When the dashboard's read route and the active-book reader exist (R1, R2), this function becomes the server
// read: it takes the active version and the draft (`DashboardStateWire`), builds one `CabinetRuleFacts` per cabinet rule
// with the default-size prices worked out by the domain (M2), and answers `ready`; a store that cannot be read, or no
// active version at all (A-10), answers `unavailable`. Until then a production build answers `unavailable` and any other
// build answers the invented sample, so no real price is ever claimed.

export type CabinetListRead =
  | { readonly kind: "ready"; readonly input: CabinetListInput }
  | { readonly kind: "unavailable" };

export function readCabinetList(): Promise<CabinetListRead> {
  const isProductionBuild = process.env.NODE_ENV === "production";
  return Promise.resolve(
    isProductionBuild
      ? { kind: "unavailable" }
      : { kind: "ready", input: SAMPLE_CABINET_LIST },
  );
}
