import { KITCHEN_L_DESIGN } from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { hasUnsavedEdit } from "@/store/configurator-store";

describe("hasUnsavedEdit", () => {
  it("is false while the design on screen is the one the server last confirmed", () => {
    expect(
      hasUnsavedEdit({
        design: KITCHEN_L_DESIGN,
        savedDesign: KITCHEN_L_DESIGN,
      }),
    ).toBe(false);
  });

  it("is true once the design on screen is another object than the confirmed one", () => {
    expect(
      hasUnsavedEdit({
        design: { ...KITCHEN_L_DESIGN, presetId: "edited" },
        savedDesign: KITCHEN_L_DESIGN,
      }),
    ).toBe(true);
  });
});
