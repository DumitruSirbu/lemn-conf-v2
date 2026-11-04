import { KITCHEN_L_DESIGN, type Design } from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import {
  holdsDifferingRows,
  versionRowsOf,
  type KitchenVersion,
  type VersionRow,
} from "@/staff/kitchen-version-rows";

import roMessages from "../../src/messages/ro.json";
import { contentFor } from "../support/catalogues";

// The cabinet list of the version switch: the bodies of both copies, matched by the placement's id, with each one
// marked as the same, as differing, as new in the current copy, or as taken out of it.

const content = contentFor("ro", roMessages);
const SENT: Design = KITCHEN_L_DESIGN;
const [FIRST, SECOND, ...REST] = SENT.placements;
if (FIRST === undefined || SECOND === undefined) {
  throw new Error("the sample kitchen holds fewer than two bodies");
}

function without(design: Design, placementId: string): Design {
  return {
    ...design,
    placements: design.placements.filter(({ id }) => id !== placementId),
  };
}

function withBody(
  design: Design,
  placementId: string,
  change: (body: Design["placements"][number]) => Design["placements"][number],
): Design {
  return {
    ...design,
    placements: design.placements.map((placement) =>
      placement.id === placementId ? change(placement) : placement,
    ),
  };
}

function rows(
  current: Design,
  shown: KitchenVersion,
  sent: Design = SENT,
): readonly VersionRow[] {
  const listed = versionRowsOf({ versions: { sent, current }, shown, content });
  if (listed === undefined) throw new Error("the copies could not be listed");
  return listed;
}

function changeOf(list: readonly VersionRow[], placementId: string) {
  return list.find((row) => row.placementId === placementId)?.change;
}

describe("the cabinet list of the two copies", () => {
  it("lists every body once, all the same, when the copies share every one", () => {
    const list = rows(SENT, "current");

    expect(list).toHaveLength(SENT.placements.length);
    expect(list.every((row) => row.change === "same")).toBe(true);
    expect(holdsDifferingRows(list)).toBe(false);
  });

  it("names each body and gives its width and height, without the unit", () => {
    const list = rows(SENT, "sent");

    for (const placement of SENT.placements) {
      const row = list.find(({ placementId }) => placementId === placement.id);
      expect(row?.name).not.toBe("");
      expect(row?.size).toBe(
        `${String(placement.body.widthMm)} × ${String(placement.body.heightMm)}`,
      );
    }
  });

  it.each([
    [
      "a body that is wider",
      (placement: Design["placements"][number]) => ({
        ...placement,
        body: { ...placement.body, widthMm: placement.body.widthMm + 100 },
      }),
    ],
    [
      "a body that was moved along its wall",
      (placement: Design["placements"][number]) => ({
        ...placement,
        alongMm: placement.alongMm + 50,
      }),
    ],
    [
      "a body that was given a handle of its own",
      (placement: Design["placements"][number]) => ({
        ...placement,
        body: { ...placement.body, handle: "black" as const },
      }),
    ],
  ])("marks %s as differing, in either copy", (_name, change) => {
    const current = withBody(SENT, FIRST.id, change);

    for (const shown of ["sent", "current"] as const) {
      const list = rows(current, shown);
      expect(changeOf(list, FIRST.id)).toBe("differs");
      expect(changeOf(list, SECOND.id)).toBe("same");
      expect(holdsDifferingRows(list)).toBe(true);
    }
  });

  it("marks a body only the current copy holds as new, in either copy", () => {
    const sent = without(SENT, FIRST.id);

    expect(changeOf(rows(SENT, "current", sent), FIRST.id)).toBe("added");
    expect(changeOf(rows(SENT, "sent", sent), FIRST.id)).toBe("added");
  });

  it("marks a body only the copy as sent holds as taken out, in either copy", () => {
    const current = without(SENT, FIRST.id);

    expect(changeOf(rows(current, "sent"), FIRST.id)).toBe("removed");
    expect(changeOf(rows(current, "current"), FIRST.id)).toBe("removed");
  });

  it("lists the bodies of the copy on screen first, then the ones only the other copy holds", () => {
    const current = without(SENT, FIRST.id);

    const onScreen = rows(current, "current").map((row) => row.placementId);

    expect(onScreen.at(-1)).toBe(FIRST.id);
    expect(onScreen).toHaveLength(SENT.placements.length);
    expect(REST.length).toBeGreaterThan(0);
  });

  it("lists nothing when a body of either copy is one the catalogue does not hold", () => {
    const unknown = withBody(SENT, FIRST.id, (placement) => ({
      ...placement,
      body: { ...placement.body, buildId: "a-body-no-catalogue-holds" },
    }));

    expect(
      versionRowsOf({
        versions: { sent: SENT, current: unknown },
        shown: "current",
        content,
      }),
    ).toBeUndefined();
    expect(
      versionRowsOf({
        versions: { sent: unknown, current: SENT },
        shown: "sent",
        content,
      }),
    ).toBeUndefined();
  });
});
