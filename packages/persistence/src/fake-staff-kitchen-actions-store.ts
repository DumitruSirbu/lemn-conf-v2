import { isRequestStatus } from "@lemnaria/configurator-domain";
import type { StaffAuditEntry } from "@lemnaria/configurator-domain";
import { nanoid } from "nanoid";

import type { FakeStaffAuditStore } from "./fake-staff-audit-store.js";
import type { SessionStore } from "./session-store.js";
import {
  StaffAuditStoreError,
  prepareStaffAuditRecord,
} from "./staff-audit-store.js";
import type {
  StaffAuditAccountRef,
  StaffAuditRecord,
} from "./staff-audit-store.js";
import {
  StaffKitchenActionError,
  actionErrorFromAudit,
  decideStatusSave,
  isActionableDesignId,
  requireJudgedNoteText,
  requireListedRequestStatus,
} from "./staff-kitchen-actions-store.js";
import type {
  AddStaffNoteRequest,
  AddStaffNoteResult,
  SavedRequestStatus,
  SetRequestStatusRequest,
  SetRequestStatusResult,
  StaffActingSession,
  StaffKitchenActionOperation,
  StaffKitchenActionsStore,
  UnhideKitchenRequest,
  UnhideKitchenResult,
} from "./staff-kitchen-actions-store.js";
import type { StaffKitchenNote } from "./staff-kitchen-reader.js";

/** A row of `designs`, with the columns these writes read or write. */
export interface HeldActionKitchen {
  readonly id: string;
  readonly accountId: string | null;
  readonly sentAt: Date | null;
  readonly isHidden: boolean;
  readonly isDeletedByClient: boolean;
}

/** A row of `design_request_states`; `status` is the stored text, whatever it is. */
export interface HeldRequestState {
  readonly designId: string;
  readonly status: string;
  readonly changedByAccountId: string;
  readonly changedAt: Date;
}

/** A row of `design_notes`. */
export interface HeldDesignNote {
  readonly id: string;
  readonly designId: string;
  readonly authorAccountId: string;
  readonly text: string;
  readonly createdAt: Date;
}

/** What the writes read from `accounts` to name an author: `undefined` is an account with no row. */
export interface ActionAccountDirectory {
  accountOf(
    accountId: string,
  ): { readonly email: string; readonly name: string | null } | undefined;
}

export interface FakeStaffKitchenActionsStoreOptions {
  /** The database's clock, for `created_at` and `changed_at`. */
  readonly now?: () => Date;
  /** The session table the actor is taken from, by the same liveness test the real statements repeat. */
  readonly sessions: SessionStore;
  /** The audit store each write commits its row to, as the Neon batch commits the audit insert. */
  readonly audit: FakeStaffAuditStore;
  readonly directory?: ActionAccountDirectory;
}

const NO_ACCOUNTS: ActionAccountDirectory = { accountOf: () => undefined };

/**
 * In-memory `StaffKitchenActionsStore` with `NeonStaffKitchenActionsStore`'s contract: the author and the changing
 * account are the account of the live session, a call with no live session writes nothing and throws `not-recorded`
 * before it learns anything of the kitchen, a client-deleted kitchen and a visitor's unsent draft are not found, a status
 * is saved only on a sent kitchen, a save of the status already shown and a second unhide write nothing and no audit row,
 * and the audit row is committed only after the change is made, with the refusals decided first, so a refusal leaves
 * neither. A status save finds the status moved when another save lands between its read and its write. It cannot stand
 * for the database's microsecond clock, for a retry after a lost acknowledgement, or for a transaction that fails halfway.
 */
export class FakeStaffKitchenActionsStore implements StaffKitchenActionsStore {
  private readonly kitchens = new Map<string, HeldActionKitchen>();
  private readonly states = new Map<string, HeldRequestState>();
  private readonly notes: HeldDesignNote[] = [];
  private readonly now: () => Date;
  private readonly sessions: SessionStore;
  private readonly audit: FakeStaffAuditStore;
  private readonly directory: ActionAccountDirectory;

  constructor({
    now = () => new Date(),
    sessions,
    audit,
    directory = NO_ACCOUNTS,
  }: FakeStaffKitchenActionsStoreOptions) {
    this.now = now;
    this.sessions = sessions;
    this.audit = audit;
    this.directory = directory;
  }

  plantKitchen(kitchen: HeldActionKitchen): void {
    this.kitchens.set(kitchen.id, { ...kitchen });
  }

  /** Writes a status row the way a script around the store would: any stored text. */
  plantStatus(state: HeldRequestState): void {
    this.states.set(state.designId, { ...state });
  }

  heldKitchen(designId: string): HeldActionKitchen | undefined {
    const kitchen = this.kitchens.get(designId);
    return kitchen === undefined ? undefined : { ...kitchen };
  }

  heldStatus(designId: string): HeldRequestState | undefined {
    const state = this.states.get(designId);
    return state === undefined ? undefined : { ...state };
  }

  /** Newest first, ties by id, as the reader lists them. */
  heldNotes(designId: string): readonly HeldDesignNote[] {
    return this.notes
      .filter((note) => note.designId === designId)
      .map((note) => ({ ...note }))
      .sort(newestFirst);
  }

  async addNote(request: AddStaffNoteRequest): Promise<AddStaffNoteResult> {
    const { session, designId, text } = request;
    requireJudgedNoteText(text);
    if (!isActionableDesignId(designId)) return { kind: "kitchen-not-found" };
    const record = recordOf(session, designId, {
      action: "note-added",
      detail: null,
    });
    const actorAccountId = await this.liveActorOf("add a staff note", record);
    const staged = await this.stage("add a staff note", record);
    if (!this.isVisible(designId)) return { kind: "kitchen-not-found" };
    const note: HeldDesignNote = {
      id: nanoid(),
      designId,
      authorAccountId: actorAccountId,
      text,
      createdAt: this.now(),
    };
    this.notes.push(note);
    staged.commit();
    return { kind: "added", note: this.noteOf(note) };
  }

  async setStatus(
    request: SetRequestStatusRequest,
  ): Promise<SetRequestStatusResult> {
    const { session, designId, status } = request;
    requireListedRequestStatus(status);
    if (!isActionableDesignId(designId)) return { kind: "kitchen-not-found" };
    const probe = recordOf(session, designId, {
      action: "status-changed",
      detail: { from: "new", to: status },
    });
    const actorAccountId = await this.liveActorOf(
      "set a request status",
      probe,
    );
    const decision = decideStatusSave({
      kitchen: this.statusFactsOf(designId),
      requested: status,
    });
    if (decision.kind === "unchanged") {
      return { kind: "unchanged", current: this.savedStatusOf(designId) };
    }
    if (decision.kind !== "write") return { kind: decision.kind };
    const staged = await this.stage(
      "set a request status",
      recordOf(session, designId, {
        action: "status-changed",
        detail: { from: decision.from, to: status },
      }),
    );
    if (this.storedStatusOf(designId) !== decision.expectedStored) {
      return { kind: "changed-meanwhile" };
    }
    this.states.set(designId, {
      designId,
      status,
      changedByAccountId: actorAccountId,
      changedAt: this.now(),
    });
    staged.commit();
    return { kind: "saved", saved: this.requiredSavedStatusOf(designId) };
  }

  async unhide(request: UnhideKitchenRequest): Promise<UnhideKitchenResult> {
    const { session, designId } = request;
    if (!isActionableDesignId(designId)) return { kind: "kitchen-not-found" };
    const record = recordOf(session, designId, {
      action: "kitchen-unhidden",
      detail: null,
    });
    await this.liveActorOf("unhide a kitchen", record);
    const staged = await this.stage("unhide a kitchen", record);
    const kitchen = this.kitchens.get(designId);
    if (kitchen === undefined || !this.isVisible(designId)) {
      return { kind: "kitchen-not-found" };
    }
    if (!kitchen.isHidden) return { kind: "not-hidden" };
    this.kitchens.set(designId, { ...kitchen, isHidden: false });
    staged.commit();
    return { kind: "unhidden" };
  }

  /** The record is checked, then the session is looked up: the account of a live session, or `not-recorded`. */
  private async liveActorOf(
    operation: StaffKitchenActionOperation,
    record: StaffAuditRecord,
  ): Promise<string> {
    const prepared = this.prepared(operation, record);
    const lookup = await this.sessions.findLive({
      tokenHash: prepared.sessionTokenHash,
      idleLifetimeSeconds: prepared.idleLifetimeSeconds,
    });
    if (lookup.kind === "none") {
      throw new StaffKitchenActionError(operation, "not-recorded");
    }
    return lookup.account.id;
  }

  private prepared(
    operation: StaffKitchenActionOperation,
    record: StaffAuditRecord,
  ): ReturnType<typeof prepareStaffAuditRecord> {
    try {
      return prepareStaffAuditRecord(record);
    } catch (refusal) {
      throw asActionError(operation, refusal);
    }
  }

  private async stage(
    operation: StaffKitchenActionOperation,
    record: StaffAuditRecord,
  ): ReturnType<FakeStaffAuditStore["stage"]> {
    try {
      return await this.audit.stage(record);
    } catch (refusal) {
      throw asActionError(operation, refusal);
    }
  }

  private isVisible(designId: string): boolean {
    const kitchen = this.kitchens.get(designId);
    return (
      kitchen !== undefined &&
      !kitchen.isDeletedByClient &&
      (kitchen.sentAt !== null || kitchen.accountId !== null)
    );
  }

  private statusFactsOf(designId: string) {
    const kitchen = this.kitchens.get(designId);
    if (kitchen === undefined || !this.isVisible(designId)) return null;
    return {
      isSent: kitchen.sentAt !== null,
      storedStatus: this.storedStatusOf(designId),
    };
  }

  private storedStatusOf(designId: string): string | null {
    return this.states.get(designId)?.status ?? null;
  }

  /** `null` when no row is held or its text is outside the list, as the Neon read answers. */
  private savedStatusOf(designId: string): SavedRequestStatus | null {
    const state = this.states.get(designId);
    if (state === undefined) return null;
    return readableSavedStatus(
      state,
      this.accountRefOf(state.changedByAccountId),
    );
  }

  private requiredSavedStatusOf(designId: string): SavedRequestStatus {
    const saved = this.savedStatusOf(designId);
    if (saved === null) {
      throw new StaffKitchenActionError(
        "set a request status",
        "unexpected-answer",
      );
    }
    return saved;
  }

  private noteOf(note: HeldDesignNote): StaffKitchenNote {
    return {
      id: note.id,
      text: note.text,
      createdAt: note.createdAt,
      author: this.accountRefOf(note.authorAccountId),
    };
  }

  private accountRefOf(accountId: string): StaffAuditAccountRef {
    const account = this.directory.accountOf(accountId);
    return {
      id: accountId,
      email: account?.email ?? null,
      name: account?.name ?? null,
    };
  }
}

function recordOf(
  session: StaffActingSession,
  designId: string,
  entry: StaffAuditEntry,
): StaffAuditRecord {
  return {
    sessionTokenHash: session.sessionTokenHash,
    idleLifetimeSeconds: session.idleLifetimeSeconds,
    entry,
    designId,
    subjectAccountId: null,
  };
}

function asActionError(
  operation: StaffKitchenActionOperation,
  refusal: unknown,
): unknown {
  return refusal instanceof StaffAuditStoreError
    ? actionErrorFromAudit(operation, refusal)
    : refusal;
}

function readableSavedStatus(
  state: HeldRequestState,
  by: StaffAuditAccountRef,
): SavedRequestStatus | null {
  const value = state.status;
  return isRequestStatus(value) ? { value, by, at: state.changedAt } : null;
}

function newestFirst(left: HeldDesignNote, right: HeldDesignNote): number {
  const byTime = right.createdAt.getTime() - left.createdAt.getTime();
  if (byTime !== 0) return byTime;
  if (left.id === right.id) return 0;
  return left.id < right.id ? 1 : -1;
}
