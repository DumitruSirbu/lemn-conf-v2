import type { Design, DesignId } from "@lemnaria/configurator-domain";

import { requireAccountIdShape } from "./account-id-shape.js";
import {
  MAX_EXPORTED_KITCHENS,
  MAX_EXPORTED_NOTE_BYTES,
  MAX_EXPORTED_NOTES_IN_TOTAL,
  MAX_EXPORTED_NOTES_PER_KITCHEN,
  cursorTextOf,
  requireValidKitchenIdsForExport,
  requireValidKitchenName,
  requireValidKitchenPageRequest,
} from "./account-kitchen-store.js";
import type {
  AccountKitchenStore,
  ExportedKitchenNotes,
  ExportedNote,
  KitchenCursor,
  KitchenDeleteOutcome,
  KitchenDuplication,
  KitchenDuplicationOutcome,
  ExportSize,
  KitchenExport,
  KitchenHideOutcome,
  KitchenMark,
  KitchenPage,
  KitchenPageRequest,
  KitchenRename,
  KitchenRenameOutcome,
  ListedKitchen,
  SentMarkStore,
} from "./account-kitchen-store.js";
import { generateDesignId } from "./generate-design-id.js";

/** A design row as far as "My kitchens" sees it. The marks are the instants the columns hold. */
export interface HeldKitchen {
  readonly id: DesignId;
  readonly accountId: string;
  readonly design: Design;
  readonly name: string | undefined;
  readonly updatedAt: Date;
  readonly sentAt: Date | undefined;
  readonly hiddenAt: Date | undefined;
  readonly deletedAt: Date | undefined;
}

export interface FakeAccountKitchenStoreOptions {
  /** The database's clock. A test passes its own to order kitchens or to compare a mark's instant. */
  readonly now?: () => Date;
  /**
   * What `hide` and `markDeleted` do to the design's share links. Share links are a separate port, so a test passes a
   * function that revokes its own; with none, a mark revokes nothing.
   */
  readonly revokeShareLinksOf?: (designId: DesignId, at: Date) => void;
}

/** A row a test plants. Everything but the owner and the document defaults to the unmarked, unnamed, just-now row. */
export interface SeededKitchen {
  readonly id: DesignId;
  readonly accountId: string;
  readonly design: Design;
  readonly name?: string;
  readonly updatedAt?: Date;
  readonly sentAt?: Date;
  readonly hiddenAt?: Date;
  readonly deletedAt?: Date;
}

/** A row of `design_notes` a test plants. The author is held, and never read by a method of the port. */
export interface SeededNote {
  readonly designId: DesignId;
  readonly text: string;
  readonly createdAt: Date;
  /** Breaks a tie in `createdAt`, larger first. Defaults to a fresh id. */
  readonly id?: string;
  /** The staff member who wrote it. Held so a test can prove the export leaves it out. */
  readonly authorAccountId?: string;
}

interface HeldNote {
  readonly id: string;
  readonly designId: DesignId;
  readonly text: string;
  readonly createdAt: Date;
  readonly authorAccountId: string | undefined;
}

/**
 * In-memory `AccountKitchenStore` with `NeonAccountKitchenStore`'s contract: the same refusals, the same listed
 * predicate, the same `(updated_at desc, id desc)` order and keyset, and the same one outcome for a missing,
 * foreign, hidden or deleted kitchen. Each method finishes before the next starts, which is the atomicity the Neon
 * store gets from a locked transaction. It cannot stand for a retry after a lost acknowledgement, for the database's
 * microsecond clock (it holds milliseconds), or for the database's text collation: ties on `updated_at` break by
 * code-unit order of `id` here.
 */
export class FakeAccountKitchenStore implements AccountKitchenStore {
  private readonly kitchensById = new Map<DesignId, HeldKitchen>();
  private readonly notes: HeldNote[] = [];
  private readonly now: () => Date;
  private readonly revokeShareLinksOf: (designId: DesignId, at: Date) => void;

  constructor({
    now = () => new Date(),
    revokeShareLinksOf,
  }: FakeAccountKitchenStoreOptions = {}) {
    this.now = now;
    this.revokeShareLinksOf = revokeShareLinksOf ?? (() => undefined);
  }

  /** Test setup: plants a row, replacing any row with the same id. */
  seed(kitchen: SeededKitchen): void {
    this.kitchensById.set(kitchen.id, {
      id: kitchen.id,
      accountId: kitchen.accountId,
      design: structuredClone(kitchen.design),
      name: kitchen.name,
      updatedAt: kitchen.updatedAt ?? this.now(),
      sentAt: kitchen.sentAt,
      hiddenAt: kitchen.hiddenAt,
      deletedAt: kitchen.deletedAt,
    });
  }

  /** Test setup: plants a note on any design id, owned or not, as a script around the store would. */
  seedNote(note: SeededNote): void {
    this.notes.push({
      id: note.id ?? generateDesignId(),
      designId: note.designId,
      text: note.text,
      createdAt: new Date(note.createdAt),
      authorAccountId: note.authorAccountId,
    });
  }

  /** Test reading: the row as held, hidden and deleted ones included, or `undefined`. */
  held(id: DesignId): HeldKitchen | undefined {
    return this.kitchensById.get(id);
  }

  listPage(request: KitchenPageRequest): Promise<KitchenPage> {
    return settle(() => {
      requireValidKitchenPageRequest(request);
      const listed = this.listedNewestFirst(request.accountId);
      const remaining = listed.filter((kitchen) =>
        isAfterCursor(kitchen, request.after),
      );
      const page = remaining.slice(0, request.limit);
      const lastOfPage = page.at(-1);
      return {
        kitchens: page.map(listedKitchenFrom),
        nextCursor:
          remaining.length > request.limit && lastOfPage !== undefined
            ? cursorOf(lastOfPage)
            : null,
        total: listed.length,
        skippedCount: 0,
      };
    });
  }

  countListed(accountId: string): Promise<number> {
    return settle(() => {
      requireAccountIdShape(accountId, "count kitchens");
      return this.listedNewestFirst(accountId).length;
    });
  }

  measureExport(accountId: string): Promise<ExportSize> {
    return settle(() => {
      requireAccountIdShape(accountId, "measure an export");
      return this.exportableOf(accountId).length > MAX_EXPORTED_KITCHENS
        ? { kind: "too-many" }
        : { kind: "within-bound" };
    });
  }

  exportAll(accountId: string): Promise<KitchenExport> {
    return settle(() => {
      requireAccountIdShape(accountId, "export kitchens");
      const owned = this.exportableOf(accountId).sort(newestFirst);
      if (owned.length > MAX_EXPORTED_KITCHENS) return { kind: "too-many" };
      return {
        kind: "exported",
        kitchens: owned.map((kitchen) => ({
          id: kitchen.id,
          name: kitchen.name ?? null,
          updatedAt: new Date(kitchen.updatedAt),
          isSent: kitchen.sentAt !== undefined,
          isHidden: kitchen.hiddenAt !== undefined,
          design: structuredClone(kitchen.design),
        })),
      };
    });
  }

  exportNotes(
    accountId: string,
    designIds: readonly DesignId[],
  ): Promise<ReadonlyMap<DesignId, ExportedKitchenNotes>> {
    return settle(() => {
      requireAccountIdShape(accountId, "export kitchen notes");
      requireValidKitchenIdsForExport(designIds);
      const asked = new Set<string>(designIds);
      const ownedIds = new Set(
        this.exportableOf(accountId)
          .map(({ id }) => id)
          .filter((id) => asked.has(id)),
      );
      return exportedNotesByKitchen(
        this.notes
          .filter((note) => ownedIds.has(note.designId))
          .sort(newestNoteFirst),
      );
    });
  }

  rename({
    accountId,
    designId,
    name,
  }: KitchenRename): Promise<KitchenRenameOutcome> {
    return settle(() => {
      requireAccountIdShape(accountId, "rename a kitchen");
      requireValidKitchenName(name, "rename a kitchen");
      const kitchen = this.listedKitchenOf(accountId, designId);
      if (kitchen === undefined) return { kind: "none" };
      this.kitchensById.set(designId, { ...kitchen, name });
      return { kind: "renamed" };
    });
  }

  duplicate({
    accountId,
    designId,
    name,
  }: KitchenDuplication): Promise<KitchenDuplicationOutcome> {
    return settle(() => {
      requireAccountIdShape(accountId, "duplicate a kitchen");
      requireValidKitchenName(name, "duplicate a kitchen");
      const source = this.listedKitchenOf(accountId, designId);
      if (source === undefined) return { kind: "none" };
      const id = generateDesignId();
      this.seed({
        id,
        accountId,
        design: source.design,
        name,
        updatedAt: this.now(),
      });
      return { kind: "duplicated", id };
    });
  }

  hide({ accountId, designId }: KitchenMark): Promise<KitchenHideOutcome> {
    return settle(() => {
      requireAccountIdShape(accountId, "hide a kitchen");
      const kitchen = this.listedKitchenOf(accountId, designId);
      if (kitchen === undefined) return { kind: "none" };
      if (kitchen.sentAt === undefined) return { kind: "not-sent" };
      const at = this.now();
      this.markAndRevoke({ ...kitchen, hiddenAt: at }, at);
      return { kind: "hidden" };
    });
  }

  markDeleted({
    accountId,
    designId,
  }: KitchenMark): Promise<KitchenDeleteOutcome> {
    return settle(() => {
      requireAccountIdShape(accountId, "delete a kitchen");
      const kitchen = this.listedKitchenOf(accountId, designId);
      if (kitchen === undefined) return { kind: "none" };
      if (kitchen.sentAt !== undefined) return { kind: "sent" };
      const at = this.now();
      this.markAndRevoke({ ...kitchen, deletedAt: at }, at);
      return { kind: "deleted" };
    });
  }

  /** For `FakeSentMarkStore` only: `NeonSentMarkStore`'s statement, a no-op unless the row is an unsent, listed one. */
  stampSentIfDraft(designId: DesignId): void {
    const kitchen = this.kitchensById.get(designId);
    if (kitchen === undefined || kitchen.sentAt !== undefined) return;
    if (!isListed(kitchen)) return;
    this.kitchensById.set(designId, { ...kitchen, sentAt: this.now() });
  }

  private markAndRevoke(marked: HeldKitchen, at: Date): void {
    this.kitchensById.set(marked.id, marked);
    this.revokeShareLinksOf(marked.id, at);
  }

  private listedKitchenOf(
    accountId: string,
    designId: DesignId,
  ): HeldKitchen | undefined {
    const kitchen = this.kitchensById.get(designId);
    return kitchen?.accountId === accountId && isListed(kitchen)
      ? kitchen
      : undefined;
  }

  /** Not deleted; hidden ones are kept. */
  private exportableOf(accountId: string): HeldKitchen[] {
    return [...this.kitchensById.values()].filter(
      (kitchen) =>
        kitchen.accountId === accountId && kitchen.deletedAt === undefined,
    );
  }

  private listedNewestFirst(accountId: string): HeldKitchen[] {
    return [...this.kitchensById.values()]
      .filter((kitchen) => kitchen.accountId === accountId && isListed(kitchen))
      .sort(newestFirst);
  }
}

/** In-memory `SentMarkStore` over a `FakeAccountKitchenStore`'s rows, on that store's clock. */
export class FakeSentMarkStore implements SentMarkStore {
  constructor(private readonly kitchens: FakeAccountKitchenStore) {}

  markSent(designId: DesignId): Promise<void> {
    return settle(() => {
      this.kitchens.stampSentIfDraft(designId);
    });
  }
}

function isListed({ hiddenAt, deletedAt }: HeldKitchen): boolean {
  return hiddenAt === undefined && deletedAt === undefined;
}

function newestFirst(first: HeldKitchen, second: HeldKitchen): number {
  const byInstant = second.updatedAt.getTime() - first.updatedAt.getTime();
  if (byInstant !== 0) return byInstant;
  return first.id < second.id ? 1 : -1;
}

function newestNoteFirst(first: HeldNote, second: HeldNote): number {
  const byInstant = second.createdAt.getTime() - first.createdAt.getTime();
  if (byInstant !== 0) return byInstant;
  return first.id < second.id ? 1 : -1;
}

/** The newest `MAX_EXPORTED_NOTES_PER_KITCHEN` notes of each kitchen, from notes that are newest first, and the
 *  kitchens that hold more (the Neon statement's `windowed` and `has_more`). */
function newestKitchenNotes(newestFirst: readonly HeldNote[]): {
  readonly kept: readonly HeldNote[];
  readonly kitchensWithMore: ReadonlySet<DesignId>;
} {
  const seen = new Map<DesignId, number>();
  const kitchensWithMore = new Set<DesignId>();
  const kept = newestFirst.filter((note) => {
    const position = (seen.get(note.designId) ?? 0) + 1;
    seen.set(note.designId, position);
    if (position > MAX_EXPORTED_NOTES_PER_KITCHEN) {
      kitchensWithMore.add(note.designId);
    }
    return position <= MAX_EXPORTED_NOTES_PER_KITCHEN;
  });
  return { kept, kitchensWithMore };
}

/**
 * What the Neon statement's last step does: the first notes, newest first over all kitchens, keep their text while
 * they are within `MAX_EXPORTED_NOTES_IN_TOTAL` notes and `MAX_EXPORTED_NOTE_BYTES` of text (a running sum, so the
 * first note over the budget and every older one are withheld). A kitchen is truncated when it holds more than its
 * window or when any of its windowed notes was withheld.
 */
function exportedNotesByKitchen(
  newestFirst: readonly HeldNote[],
): ReadonlyMap<DesignId, ExportedKitchenNotes> {
  const { kept, kitchensWithMore } = newestKitchenNotes(newestFirst);
  const carried = new Map<DesignId, ExportedNote[]>();
  const withheld = new Set<DesignId>();
  let runningBytes = 0;
  kept.forEach((note, rank) => {
    runningBytes += new TextEncoder().encode(note.text).length;
    const held = carried.get(note.designId) ?? [];
    carried.set(note.designId, held);
    if (
      rank < MAX_EXPORTED_NOTES_IN_TOTAL &&
      runningBytes <= MAX_EXPORTED_NOTE_BYTES
    ) {
      held.push({ text: note.text, createdAt: new Date(note.createdAt) });
    } else {
      withheld.add(note.designId);
    }
  });
  return new Map(
    [...carried].map(([designId, notes]) => [
      designId,
      {
        notes,
        isTruncated: kitchensWithMore.has(designId) || withheld.has(designId),
      },
    ]),
  );
}

/** The row comparison `(updated_at, id) < (cursor.updated_at, cursor.id)` of the Neon statement. */
function isAfterCursor(
  kitchen: HeldKitchen,
  after: KitchenCursor | undefined,
): boolean {
  if (after === undefined) return true;
  const instant = cursorTextOf(kitchen.updatedAt);
  return (
    instant < after.updatedAt ||
    (instant === after.updatedAt && kitchen.id < after.id)
  );
}

function cursorOf(kitchen: HeldKitchen): KitchenCursor {
  return { updatedAt: cursorTextOf(kitchen.updatedAt), id: kitchen.id };
}

function listedKitchenFrom(kitchen: HeldKitchen): ListedKitchen {
  return {
    id: kitchen.id,
    name: kitchen.name ?? null,
    updatedAt: new Date(kitchen.updatedAt),
    isSent: kitchen.sentAt !== undefined,
    design: structuredClone(kitchen.design),
  };
}

function settle<Outcome>(compute: () => Outcome): Promise<Outcome> {
  try {
    return Promise.resolve(compute());
  } catch (failure) {
    return Promise.reject(
      failure instanceof Error ? failure : new Error("Unknown failure"),
    );
  }
}
