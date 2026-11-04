import {
  INITIAL_REQUEST_STATUS,
  STAFF_KITCHEN_PAGE_SIZE,
  staffKitchenOffsetOf,
} from "@lemnaria/configurator-domain";
import type { Design, StaffKitchenQuery } from "@lemnaria/configurator-domain";

import type { DesignRevision } from "./design-revision.js";
import { isChangedAfterSeen } from "./fake-dashboard-support.js";
import type { StaffAuditAccountRef } from "./staff-audit-store.js";
import {
  NOTES_READ_LIMIT,
  foldRomanianSearchText,
  isWellFormedDesignId,
  requireValidStaffKitchenQuery,
  shownStaffStatusOf,
} from "./staff-kitchen-reader.js";
import type {
  StaffKitchenClient,
  StaffKitchenDetail,
  StaffKitchenNote,
  StaffKitchenPage,
  StaffKitchenReader,
  StaffKitchenReading,
  StaffKitchenSentTotal,
  StaffKitchenStatus,
  StaffListedKitchen,
} from "./staff-kitchen-reader.js";

/** A row of `accounts`, with the columns the reader never selects left out. */
export interface PlantedStaffAccount {
  readonly id: string;
  readonly email: string;
  /** What the e-mail search reads. Defaults to the e-mail in lower case, which the real normal form need not equal. */
  readonly emailNormalForm?: string;
  readonly name: string | null;
  readonly phone: string | null;
}

/** A row of `designs`. `design` is `null` for a document this build cannot read. */
export interface PlantedStaffKitchen {
  readonly id: string;
  readonly name: string | null;
  readonly design: Design | null;
  readonly accountId: string | null;
  readonly sentAt: Date | null;
  readonly updatedAt: Date;
  readonly isHidden: boolean;
  readonly isDeletedByClient: boolean;
  /** `designs.revision`; `"1"`, where every design starts (`0004`), when a test does not say. */
  readonly revision?: DesignRevision;
}

/**
 * A row of `contact_submissions`, with the columns the application role cannot read left out: it may read
 * `design_revision` and, since `0026`, `priced`, of which the reader takes the total and the currency.
 */
export interface PlantedStaffRequest {
  readonly clientRequestId: string;
  readonly designId: string;
  readonly reference: string;
  readonly createdAt: Date;
  /** The design revision the request was sent at. Absent: no revision, so with no seen mark the kitchen is not changed.
  /** */
  readonly designRevision?: DesignRevision;
  /** The total stored in the snapshot. Absent or `null`: the request stored no snapshot, as an intent request. */
  readonly pricedTotal?: StaffKitchenSentTotal | null;
}

/** What the reader needs of the seen marks: `FakeKitchenChangeStore` holds them. */
export interface SeenRevisionSource {
  heldSeenRevision(designId: string): DesignRevision | undefined;
}

export interface FakeStaffKitchenReaderOptions {
  /** The seen marks to judge "changed after seen" against. Absent: nothing was ever seen. */
  readonly seen?: SeenRevisionSource;
}

const FIRST_REVISION: DesignRevision = "1";

/** A row of `contact_submission_views`. */
export interface PlantedStaffSentCopy {
  readonly clientRequestId: string;
  readonly createdAt: Date;
  /** Breaks a tie in `createdAt`, larger first. */
  readonly tokenHash?: string;
  readonly isRevoked: boolean;
  /** `null` for a copy this build cannot read. */
  readonly design: Design | null;
}

/** A row of `design_request_states`; `status` is the stored text, whatever it is. */
export interface PlantedStaffStatus {
  readonly designId: string;
  readonly status: string;
  readonly changedByAccountId: string;
  readonly changedAt: Date;
}

/** A row of `design_notes`. */
export interface PlantedStaffNote {
  readonly id: string;
  readonly designId: string;
  readonly authorAccountId: string;
  readonly text: string;
  readonly createdAt: Date;
}

/**
 * In-memory `StaffKitchenReader` with `NeonStaffKitchenReader`'s contract: client-deleted kitchens and visitors'
 * unsent drafts are never listed or read, hidden kitchens are, a stored status outside the list reads as
 * `unrecognised`, and the latest request and its newest unrevoked copy are the ones shown. It cannot stand for the
 * database's text collation (ties break by code-unit order of `id`), for its case folding (the search lower-cases in
 * JavaScript), or for the microsecond clock (it holds milliseconds). Nothing here is written by a method of the
 * port; a test plants rows the way a script around the store would.
 */
export class FakeStaffKitchenReader implements StaffKitchenReader {
  private readonly accounts = new Map<string, PlantedStaffAccount>();
  private readonly kitchens = new Map<string, PlantedStaffKitchen>();
  private readonly requests: PlantedStaffRequest[] = [];
  private readonly sentCopies: PlantedStaffSentCopy[] = [];
  private readonly statuses = new Map<string, PlantedStaffStatus>();
  private readonly notes: PlantedStaffNote[] = [];
  private readonly seen: SeenRevisionSource | undefined;

  constructor({ seen }: FakeStaffKitchenReaderOptions = {}) {
    this.seen = seen;
  }

  plantAccount(account: PlantedStaffAccount): void {
    this.accounts.set(account.id, account);
  }

  /** Leaves every row that names the account, as an erasure would. */
  removeAccount(accountId: string): void {
    this.accounts.delete(accountId);
  }

  plantKitchen(kitchen: PlantedStaffKitchen): void {
    this.kitchens.set(kitchen.id, kitchen);
  }

  plantRequest(request: PlantedStaffRequest): void {
    this.requests.push(request);
  }

  plantSentCopy(copy: PlantedStaffSentCopy): void {
    this.sentCopies.push(copy);
  }

  plantStatus(status: PlantedStaffStatus): void {
    this.statuses.set(status.designId, status);
  }

  plantNote(note: PlantedStaffNote): void {
    this.notes.push(note);
  }

  listPage(query: StaffKitchenQuery): Promise<StaffKitchenPage> {
    try {
      requireValidStaffKitchenQuery(query);
      return Promise.resolve(this.pageOf(query));
    } catch (refusal) {
      return Promise.reject(refusal as Error);
    }
  }

  readOne(designId: string): Promise<StaffKitchenReading> {
    const kitchen = this.kitchens.get(designId);
    if (
      !isWellFormedDesignId(designId) ||
      kitchen === undefined ||
      !isReadable(kitchen)
    ) {
      return Promise.resolve({ kind: "none" });
    }
    return Promise.resolve({ kind: "found", kitchen: this.detailOf(kitchen) });
  }

  private pageOf(query: StaffKitchenQuery): StaffKitchenPage {
    const matching = [...this.kitchens.values()]
      .filter((kitchen) => this.isMatching(kitchen, query))
      .sort(this.byChangedFirstThenOrderOf(query.segment));
    const offset = staffKitchenOffsetOf(query.page);
    return {
      total: matching.length,
      changedCount: [...this.kitchens.values()].filter((kitchen) =>
        this.isChangedAfterSeen(kitchen),
      ).length,
      page: query.page,
      pageSize: STAFF_KITCHEN_PAGE_SIZE,
      kitchens: matching
        .slice(offset, offset + STAFF_KITCHEN_PAGE_SIZE)
        .map((kitchen) => this.listedOf(kitchen)),
    };
  }

  private isMatching(
    kitchen: PlantedStaffKitchen,
    { segment, status, search, onlyChanged }: StaffKitchenQuery,
  ): boolean {
    const account = this.accountOf(kitchen);
    return (
      !kitchen.isDeletedByClient &&
      isInSegment(kitchen, segment) &&
      (status === null || this.storedStatusOf(kitchen) === status) &&
      (search === null || isFoundBy(search, account)) &&
      (onlyChanged !== true || this.isChangedAfterSeen(kitchen))
    );
  }

  /** The kitchens staff have not seen at their current revision first, then the segment's own order. */
  private byChangedFirstThenOrderOf(
    segment: StaffKitchenQuery["segment"],
  ): (left: PlantedStaffKitchen, right: PlantedStaffKitchen) => number {
    const inSegmentOrder = byOrderOf(segment);
    return (left, right) => {
      const byChange =
        Number(this.isChangedAfterSeen(right)) -
        Number(this.isChangedAfterSeen(left));
      return byChange !== 0 ? byChange : inSegmentOrder(left, right);
    };
  }

  /** Not deleted by its client, sent, and not at the revision staff last saw (or the one it was sent at). */
  private isChangedAfterSeen(kitchen: PlantedStaffKitchen): boolean {
    return (
      !kitchen.isDeletedByClient &&
      isChangedAfterSeen({
        isSent: kitchen.sentAt !== null,
        revision: kitchen.revision ?? FIRST_REVISION,
        seenRevision: this.seen?.heldSeenRevision(kitchen.id),
        latestSubmissionRevision: this.latestRequestOf(kitchen.id)
          ?.designRevision,
      })
    );
  }

  private listedOf(kitchen: PlantedStaffKitchen): StaffListedKitchen {
    const isSent = kitchen.sentAt !== null;
    return {
      id: kitchen.id,
      name: kitchen.name,
      design: kitchen.design,
      client: clientOf(this.accountOf(kitchen)),
      isSent,
      isHidden: kitchen.isHidden,
      sentAt: kitchen.sentAt,
      updatedAt: kitchen.updatedAt,
      requestStatus: shownStaffStatusOf({
        isSent,
        storedStatus: this.statuses.get(kitchen.id)?.status ?? null,
      }),
      isChangedSinceSeen: this.isChangedAfterSeen(kitchen),
    };
  }

  private detailOf(kitchen: PlantedStaffKitchen): StaffKitchenDetail {
    const isSent = kitchen.sentAt !== null;
    const latestRequest = this.latestRequestOf(kitchen.id);
    return {
      id: kitchen.id,
      name: kitchen.name,
      revision: kitchen.revision ?? FIRST_REVISION,
      isChangedSinceSeen: this.isChangedAfterSeen(kitchen),
      design: kitchen.design,
      isSent,
      isHidden: kitchen.isHidden,
      sentAt: kitchen.sentAt,
      updatedAt: kitchen.updatedAt,
      client: clientOf(this.accountOf(kitchen)),
      request:
        latestRequest === undefined
          ? null
          : {
              reference: latestRequest.reference,
              sentAt: latestRequest.createdAt,
            },
      sentTotal: latestRequest?.pricedTotal ?? null,
      asSent: this.asSentOf(latestRequest),
      status: this.statusOf(kitchen.id, isSent),
      notes: this.notesOf(kitchen.id),
      notesTruncated: this.heldNotesOf(kitchen.id).length > NOTES_READ_LIMIT,
    };
  }

  private asSentOf(request: PlantedStaffRequest | undefined): Design | null {
    if (request === undefined) return null;
    const newest = this.sentCopies
      .filter(
        (copy) =>
          copy.clientRequestId === request.clientRequestId && !copy.isRevoked,
      )
      .sort(
        (left, right) =>
          right.createdAt.getTime() - left.createdAt.getTime() ||
          compareText(right.tokenHash ?? "", left.tokenHash ?? ""),
      )[0];
    return newest?.design ?? null;
  }

  private statusOf(
    designId: string,
    isSent: boolean,
  ): StaffKitchenStatus | null {
    const held = this.statuses.get(designId);
    const value = shownStaffStatusOf({
      isSent,
      storedStatus: held?.status ?? null,
    });
    if (value === null) return null;
    return {
      value,
      change:
        held === undefined
          ? null
          : {
              by: this.accountRefOf(held.changedByAccountId),
              at: held.changedAt,
            },
    };
  }

  private heldNotesOf(designId: string): readonly PlantedStaffNote[] {
    return this.notes
      .filter((note) => note.designId === designId)
      .sort(newestNoteFirst);
  }

  private notesOf(designId: string): readonly StaffKitchenNote[] {
    return this.heldNotesOf(designId)
      .slice(0, NOTES_READ_LIMIT)
      .map((note) => ({
        id: note.id,
        text: note.text,
        createdAt: note.createdAt,
        author: this.accountRefOf(note.authorAccountId),
      }));
  }

  private latestRequestOf(designId: string): PlantedStaffRequest | undefined {
    return this.requests
      .filter((request) => request.designId === designId)
      .sort(
        (left, right) =>
          right.createdAt.getTime() - left.createdAt.getTime() ||
          compareText(right.clientRequestId, left.clientRequestId),
      )[0];
  }

  /** What `coalesce(status, 'new')` gives: the stored text, or `new` where no row is held. */
  private storedStatusOf(kitchen: PlantedStaffKitchen): string {
    return this.statuses.get(kitchen.id)?.status ?? INITIAL_REQUEST_STATUS;
  }

  private accountOf(
    kitchen: PlantedStaffKitchen,
  ): PlantedStaffAccount | undefined {
    return kitchen.accountId === null
      ? undefined
      : this.accounts.get(kitchen.accountId);
  }

  private accountRefOf(accountId: string): StaffAuditAccountRef {
    const account = this.accounts.get(accountId);
    return {
      id: accountId,
      email: account?.email ?? null,
      name: account?.name ?? null,
    };
  }
}

/** Every segment's rows, and the reading's: a kitchen its client deleted, and a visitor's unsent draft, are neither. */
function isReadable(kitchen: PlantedStaffKitchen): boolean {
  return !kitchen.isDeletedByClient && isInSegment(kitchen, "all");
}

function isInSegment(
  kitchen: PlantedStaffKitchen,
  segment: StaffKitchenQuery["segment"],
): boolean {
  const isSent = kitchen.sentAt !== null;
  const hasAccount = kitchen.accountId !== null;
  switch (segment) {
    case "sent":
      return isSent;
    case "drafts":
      return !isSent && hasAccount;
    case "all":
      return isSent || hasAccount;
  }
}

function isFoundBy(
  search: string,
  account: PlantedStaffAccount | undefined,
): boolean {
  if (account === undefined) return false;
  const emailNormalForm = account.emailNormalForm ?? account.email;
  const foldedName = foldRomanianSearchText(account.name ?? "").toLowerCase();
  return (
    emailNormalForm.toLowerCase().includes(search.toLowerCase()) ||
    foldedName.includes(foldRomanianSearchText(search).toLowerCase())
  );
}

function clientOf(
  account: PlantedStaffAccount | undefined,
): StaffKitchenClient | null {
  if (account === undefined) return null;
  const { id, email, name, phone } = account;
  return { id, email, name, phone };
}

function byOrderOf(
  segment: StaffKitchenQuery["segment"],
): (left: PlantedStaffKitchen, right: PlantedStaffKitchen) => number {
  return (left, right) => {
    const byTime = sortedAtOf(right, segment) - sortedAtOf(left, segment);
    return byTime !== 0 ? byTime : compareText(right.id, left.id);
  };
}

/** The instant the segment walks: the sent segment holds only sent kitchens. */
function sortedAtOf(
  kitchen: PlantedStaffKitchen,
  segment: StaffKitchenQuery["segment"],
): number {
  const instant = segment === "sent" ? kitchen.sentAt : kitchen.updatedAt;
  return instant?.getTime() ?? Number.NEGATIVE_INFINITY;
}

function newestNoteFirst(
  left: PlantedStaffNote,
  right: PlantedStaffNote,
): number {
  return (
    right.createdAt.getTime() - left.createdAt.getTime() ||
    compareText(right.id, left.id)
  );
}

function compareText(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}
