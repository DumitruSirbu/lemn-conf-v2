// A document with no kitchen handle reads exactly as it did before the kitchen handle existed. The
// oracle is a copy of the old rule, swept over the seeded and composed documents with and without own
// handles: `isPushToOpen`, `describeSelection`'s handle fields, and the hardware line's push-to-open count.
import { describe, expect, it } from "vitest";

import type { Handle } from "../../src/design.js";
import {
  countHardwareMechanisms,
  doorLeafHeightsMm,
  drawerCount,
  frontPopulationQueryFor,
  projectDesignForDisplay,
  type DisplayEntry,
} from "../../src/index.js";
import { isPushToOpen } from "../../src/push-to-open.js";
import { describeSelection } from "../../src/queries/describe-selection.js";
import { createWorld } from "../support/kitchen-world.js";
import {
  documentsWithNoKitchenHandle,
  type NamedDocument,
} from "./handle-document-facts.js";

const OLD_TOP_ROW_FLOOR_MM = 2_200;

function oldIsPushToOpen(front: {
  readonly y0Mm: number;
  readonly recordedHandle: Handle | undefined;
  readonly canHandle: boolean;
}): boolean {
  if (front.recordedHandle !== undefined && front.canHandle) {
    return front.recordedHandle === "push";
  }
  return front.y0Mm >= OLD_TOP_ROW_FLOOR_MM;
}

function oldDefaultHandle(y0Mm: number): Handle {
  return y0Mm >= OLD_TOP_ROW_FLOOR_MM ? "push" : "steel";
}

function entriesOf(document: NamedDocument): readonly DisplayEntry[] {
  return projectDesignForDisplay(document.design, document.catalog).flatMap(
    (group) => group.entries,
  );
}

function canHandleOf(entry: DisplayEntry, document: NamedDocument): boolean {
  return document.catalog.get(entry.buildId)?.canHandle === true;
}

describe("the documents swept", () => {
  it("are the seeded kitchen, every composed room and each with own handles dealt out", () => {
    const names = documentsWithNoKitchenHandle().map(
      (document) => document.name,
    );

    expect(names).toContain("seeded");
    expect(names).toContain("seeded+own-handles");
    expect(names.filter((name) => name.startsWith("generated-")).length).toBe(
      8,
    );
  });
});

describe.each(documentsWithNoKitchenHandle().map((d) => [d.name, d] as const))(
  "%s, with no kitchen handle",
  (_name, document) => {
    it("answers isPushToOpen as the old rule does, with the kitchen settings empty", () => {
      for (const entry of entriesOf(document)) {
        const front = {
          y0Mm: entry.y0Mm,
          recordedHandle: entry.handle,
          canHandle: canHandleOf(entry, document),
        };

        expect(isPushToOpen({ ...front, kitchenSettings: {} })).toBe(
          oldIsPushToOpen(front),
        );
      }
    });

    it("counts the hardware line's latches as the old rule does", () => {
      const entries = entriesOf(document);
      const oldCount = entries.reduce((total, entry) => {
        const query = frontPopulationQueryFor({
          body: entry,
          definition: document.catalog.get(entry.buildId) ?? {},
        });
        const fronts = doorLeafHeightsMm(query).length + drawerCount(query);
        const latched = oldIsPushToOpen({
          y0Mm: entry.y0Mm,
          recordedHandle: entry.handle,
          canHandle: canHandleOf(entry, document),
        });
        return latched ? total + fronts : total;
      }, 0);

      expect(
        countHardwareMechanisms(entries, document.catalog).pushToOpen,
      ).toBe(oldCount);
    });

    it("describes each placement's handle and default handle as the old rule does", () => {
      const world = createWorld(document.design, document.catalog);

      for (const record of world.records) {
        const target = { kind: "placement", id: record.id } as const;
        const meta = describeSelection({
          kitchenSettings: {},
          ...world,
          target,
        });

        expect(meta?.handle).toBe(record.handleMode);
        expect(meta?.defaultHandle).toBe(
          oldDefaultHandle(Math.round(record.frame.y0 * 1000)),
        );
      }
    });
  },
);
