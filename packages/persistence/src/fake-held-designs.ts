import { isBuiltInAccessoryId } from "@lemnaria/configurator-domain";
import type { ItemRef } from "@lemnaria/configurator-domain";

import { itemKeyOf } from "./fake-dashboard-support.js";

/**
 * A saved design as the usage fakes see it: the items it uses at any level, whether its client deleted it, and whether
 * the product can read it (an unreadable one uses nothing, and is counted in `unreadableDesigns` when a probe walks).
 */
export interface HeldDesignUsage {
  readonly designId: string;
  readonly uses: readonly ItemRef[];
  readonly isDeletedByClient: boolean;
  readonly isUnreadable?: boolean;
}

/**
 * The saved designs of a fake world, the table both the usage reader's fake and the price book's publish guard read. They
 * share one table so that a design planted once is counted by each, as the Neon stores count one `designs` table.
 */
export class FakeHeldDesigns {
  private readonly designs = new Map<string, HeldDesignUsage>();

  plant(design: HeldDesignUsage): void {
    this.designs.set(design.designId, structuredClone(design));
  }

  /**
   * How many designs their client has not deleted use the item. A tier or a linked accessory is read from the stored
   * document as written, so a design the product cannot open still counts; any other item is read by opening each
   * design, which leaves out one it cannot.
   */
  countUsing(item: ItemRef): number {
    const key = itemKeyOf(item);
    const isReadAsWritten = isReadFromTheStoredDocument(item);
    return [...this.designs.values()].filter(
      (design) =>
        !design.isDeletedByClient &&
        (isReadAsWritten || design.isUnreadable !== true) &&
        design.uses.some((used) => itemKeyOf(used) === key),
    ).length;
  }

  countUnreadable(): number {
    return [...this.designs.values()].filter(
      (design) => !design.isDeletedByClient && design.isUnreadable === true,
    ).length;
  }
}

function isReadFromTheStoredDocument(item: ItemRef): boolean {
  if (item.kind === "accessory") return !isBuiltInAccessoryId(item.accessoryId);
  return item.kind === "material" || item.kind === "hardware";
}
