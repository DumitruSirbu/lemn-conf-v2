import {
  KITCHEN_L_DESIGN,
  type Design,
  type DesignId,
} from "@lemnaria/configurator-domain";
import type { DesignRevision } from "@lemnaria/persistence";
import { isValidElement, type ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import DesignPage from "../../src/app/[locale]/d/[id]/page";

interface HydrateProps {
  readonly design: Design;
  readonly designId: DesignId;
  readonly revision: DesignRevision;
}

const loadDesign = vi.hoisted(() =>
  vi.fn<
    (id: string) => Promise<{ design: Design; revision: DesignRevision }>
  >(),
);
const hydrateAndConfigure = vi.hoisted(() => vi.fn(() => null));

vi.mock("@/lib/server/repository", () => ({
  getRepository: () => ({ load: loadDesign }),
}));
vi.mock("@/app/d/[id]/hydrate-and-configure", () => ({
  HydrateAndConfigure: hydrateAndConfigure,
}));
vi.mock("@/app/d/[id]/design-load-error", () => ({
  DesignLoadError: vi.fn(() => null),
}));

describe("localized shared-design route identity", () => {
  beforeEach(() => {
    loadDesign.mockReset();
    loadDesign.mockResolvedValue({
      design: KITCHEN_L_DESIGN,
      revision: "shared-revision",
    });
  });

  it("passes the same bare id and hydration identity through both locale-prefixed routes", async () => {
    const id = "same-shared-design";
    const pages: ReactElement<HydrateProps>[] = [];

    for (const locale of ["ro", "ru"] as const) {
      const page = await DesignPage({
        params: Promise.resolve({ locale, id }),
      });
      if (!isValidElement<HydrateProps>(page)) {
        throw new Error("Shared-design route returned a non-element");
      }
      pages.push(page);
    }

    expect(loadDesign.mock.calls).toEqual([[id], [id]]);
    for (const page of pages) {
      expect(page.type).toBe(hydrateAndConfigure);
      expect(page.props).toEqual({
        design: KITCHEN_L_DESIGN,
        designId: id,
        revision: "shared-revision",
      });
      expect(Object.keys(page.props).sort()).toEqual([
        "design",
        "designId",
        "revision",
      ]);
    }
    expect(pages[0]?.props).toEqual(pages[1]?.props);
  });
});
