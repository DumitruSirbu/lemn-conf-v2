import type {
  AuditViewedDetail,
  Design,
  KitchensListedDetail,
  NoteTextRefusalCode,
  RequestStatus,
  RequestStatusRefusalCode,
  StaffAuditAction,
  StaffKitchenQueryField,
  StaffKitchenQueryRefusalCode,
  StatusChangedDetail,
} from "@lemnaria/configurator-domain";

// What `GET /api/staff/kitchens` and `GET /api/staff/kitchens/{id}` answer and the staff pages that read them expect,
// once. It lives outside `lib/server` because the client bundle may not import a server-only module, and holds types
// only. The audit actor's id is the only account id on the wire (ADR 0173, the audit page's residuals): every other
// person is named by the e-mail and the name staff see.

/** The kitchen's document as far as a list thumbnail draws it: the room, the cabinets and the colour. It is a `Pick`
 *  of `Design`, not a `Design`: the stored document's identity and timestamps stay behind. A renderer that needs a
 *  whole `Design` synthesises `presetId`, `createdAt` and `updatedAt` as placeholders in one adapter of its own; the
 *  wire does not widen. */
export type StaffThumbnailDesign = Pick<
  Design,
  "room" | "placements" | "emptyColumns" | "columnExtents" | "settings"
>;

/** The kitchen's client, from the profile. No postal address, id or credential. */
export interface StaffClientWire {
  readonly email: string;
  readonly name: string | null;
  readonly phone: string | null;
}

/** A staff member or client a row names, as it reads now: `null` where the account no longer resolves. */
export interface StaffPersonWire {
  readonly email: string | null;
  readonly name: string | null;
}

/** A sent kitchen's request status; `unrecognised` is a stored text this build does not name, and a draft has none. */
export type StaffRequestStatusWire = RequestStatus | "unrecognised" | null;

export interface StaffListedKitchenWire {
  readonly id: string;
  readonly name: string | null;
  /** `null` when this build cannot read the stored document. */
  readonly design: StaffThumbnailDesign | null;
  /** `null` for a sent kitchen no account owns. */
  readonly client: StaffClientWire | null;
  readonly isSent: boolean;
  readonly isHidden: boolean;
  /** ISO 8601, UTC, milliseconds. */
  readonly sentAt: string | null;
  readonly updatedAt: string;
  readonly requestStatus: StaffRequestStatusWire;
}

export interface StaffKitchenListWire {
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly kitchens: readonly StaffListedKitchenWire[];
}

export interface StaffKitchenRequestWire {
  readonly reference: string;
  readonly sentAt: string;
}

export interface StaffKitchenStatusWire {
  readonly value: RequestStatus | "unrecognised";
  /** `null` while no status has been saved and the kitchen shows as new. */
  readonly changedBy: StaffPersonWire | null;
  readonly changedAt: string | null;
}

export interface StaffKitchenNoteWire {
  readonly id: string;
  readonly text: string;
  readonly createdAt: string;
  readonly author: StaffPersonWire;
}

export interface StaffKitchenWire {
  readonly kitchen: {
    readonly id: string;
    readonly name: string | null;
    /** `null` when this build cannot read the stored document: the page says so and keeps the rest. */
    readonly design: Design | null;
    /** The kitchen as the shop's notice carried it; `null` when none exists or this build cannot read it. */
    readonly asSent: Design | null;
    readonly isSent: boolean;
    readonly isHidden: boolean;
    readonly sentAt: string | null;
    readonly updatedAt: string;
  };
  readonly client: StaffClientWire | null;
  readonly request: StaffKitchenRequestWire | null;
  /** `null` for a draft. */
  readonly status: StaffKitchenStatusWire | null;
  /** Newest first. */
  readonly notes: readonly StaffKitchenNoteWire[];
  /** True when the kitchen holds more notes than `notes` carries. */
  readonly notesTruncated: boolean;
}

/** `400` of the list: a member of the query and the domain's code for it. Never the value that was refused, because the
 *  search text is a client's name or address. */
export interface StaffInvalidQueryWire {
  readonly status: "invalid-input";
  readonly issues: readonly {
    readonly field: StaffKitchenQueryField;
    readonly code: StaffKitchenQueryRefusalCode;
  }[];
}

/** What a staff write's body can be refused for, by the domain's own codes. `NOTE_TEXT_NOT_JUDGED` is the store's
 *  refusal of a text the domain accepted: the two disagree, which is a defect of ours. */
export type StaffWriteIssue =
  | {
      readonly field: "text";
      readonly code: NoteTextRefusalCode | "NOTE_TEXT_NOT_JUDGED";
    }
  | {
      readonly field: "status";
      readonly code: RequestStatusRefusalCode;
    }
  | {
      /** The status the page last saw, which a save is made against. A page sends what it read, so a refusal of it is a
       *  defect of the page's and not a field a person can correct. */
      readonly field: "from";
      readonly code: RequestStatusRefusalCode;
    };

/** `400` of a staff write: the member the person can correct and a code. Never the value, because a note is a client's
 *  personal data. */
export interface StaffInvalidInputWire {
  readonly status: "invalid-input";
  readonly issues: readonly StaffWriteIssue[];
}

/** The words of a staff write's `409`: each is a state of the data, never a failure to answer. */
export type StaffWriteConflict =
  | "not-sent"
  | "not-hidden"
  | "changed-meanwhile"
  | "status-not-recognised";

export interface StaffConflictWire {
  readonly status: StaffWriteConflict;
}

/** `201` of a note: the note as it was stored. */
export interface StaffNoteAddedWire {
  readonly note: StaffKitchenNoteWire;
}

/** `200` of a status save: the status the kitchen shows after it, with who set it and when. A kitchen that shows `new`
 *  because no status was ever saved has no last change. */
export interface StaffStatusSavedWire {
  readonly status: RequestStatus;
  readonly changedBy: StaffPersonWire | null;
  readonly changedAt: string | null;
}

// ---------------------------------------------------------------------------------------------------------------------
// `GET /api/staff/audit`

/** The client a row concerns, as the log names it: the address alone. No name, phone, postal address or id. It is the
 *  one client address a row carries, and the one that outlives the kitchen: the store reads it from the row's own
 *  subject, while a kitchen's owner stops resolving when the kitchen is deleted. */
export interface StaffAuditClientWire {
  readonly email: string | null;
}

/** The kitchen a row names, as it reads now. `name` is `null` when the kitchen is gone, was deleted by its client, or
 *  has no name. The id is the design's, for a link to the staff kitchen page. Its owner is not named: the row's
 *  `subject` is the one client address. */
export interface StaffAuditKitchenWire {
  readonly id: string;
  readonly name: string | null;
}

/** What the row's action carries, in the shape of that action. Built member by member from the domain's reading. */
export type StaffAuditEntryWire =
  | {
      readonly kind: "recognised";
      readonly action: "status-changed";
      readonly detail: StatusChangedDetail;
    }
  | {
      readonly kind: "recognised";
      readonly action: "kitchens-listed";
      readonly detail: KitchensListedDetail;
    }
  | {
      readonly kind: "recognised";
      readonly action: "audit-viewed";
      readonly detail: AuditViewedDetail;
    }
  | {
      readonly kind: "recognised";
      readonly action: Exclude<
        StaffAuditAction,
        "status-changed" | "kitchens-listed" | "audit-viewed"
      >;
      readonly detail: null;
    }
  /** A row this build's domain refuses: its action code and nothing of its stored detail. */
  | { readonly kind: "unrecognised"; readonly action: string };

/** The staff member who acted, by id and address. The `id` is the one account id the audit answer carries: the page
 *  offers actors from the rows it shows and sends `actor=<id>` back as a filter. Only an administrator reaches this
 *  answer, the route fails closed, and ids are unguessable. The name is not sent: the page draws the address. */
export interface StaffAuditActorWire {
  readonly id: string;
  /** `null` when the account no longer resolves. */
  readonly email: string | null;
}

export interface StaffAuditEventWire {
  readonly id: string;
  /** ISO 8601, UTC, milliseconds. */
  readonly occurredAt: string;
  readonly entry: StaffAuditEntryWire;
  /** The staff member who acted; `id` is the row's even when the account no longer resolves. */
  readonly actor: StaffAuditActorWire;
  /** The client account the action concerned, by address as it reads now; `null` when the row names none. */
  readonly subject: StaffAuditClientWire | null;
  readonly kitchen: StaffAuditKitchenWire | null;
}

export interface StaffAuditPageWire {
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  /** Newest first. */
  readonly events: readonly StaffAuditEventWire[];
}

/** The members of the audit page's query that a person can get wrong. `range` is the two days together. */
export type StaffAuditQueryField =
  | "page"
  | "action"
  | "actor"
  | "from"
  | "to"
  | "range";

export type StaffAuditQueryRefusalCode =
  | "NOT_A_PAGE_NUMBER"
  | "UNKNOWN_VALUE"
  | "NOT_AN_ACCOUNT_ID"
  | "NOT_A_DATE"
  | "DATE_OUT_OF_RANGE"
  | "RANGE_INVERTED";

/** `400` of the audit page: a member of the query and a code for it. Never the value that was refused. */
export interface StaffAuditInvalidQueryWire {
  readonly status: "invalid-input";
  readonly issues: readonly {
    readonly field: StaffAuditQueryField;
    readonly code: StaffAuditQueryRefusalCode;
  }[];
}

// ---------------------------------------------------------------------------------------------------------------------
// Kitchens changed after staff saw them (M10 D10; plan §8.4 d, A-12)
//
// Standalone types beside the shapes above, none of which gains a member: a reader of the list or the kitchen as they
// stand is unaffected, and a screen that shows the mark reads the `Marked` form.

/** Whether the kitchen's revision differs from the one staff last saw, or else the one it was sent at. The comparison
 *  is made in SQL; the revision itself stays opaque. */
export interface StaffChangedMarkWire {
  readonly changedAfterSeen: boolean;
}

export type StaffListedKitchenMarkedWire = StaffListedKitchenWire &
  StaffChangedMarkWire;

/** The list with its marked rows, and the number of changed kitchens the menu counter shows. */
export interface StaffKitchenMarkedListWire
  extends Omit<StaffKitchenListWire, "kitchens"> {
  readonly changedCount: number;
  readonly kitchens: readonly StaffListedKitchenMarkedWire[];
}

/** The kitchen page, with the revision it displayed: what `StaffSeenRequestWire` sends back. */
export type StaffKitchenMarkedWire = StaffKitchenWire &
  StaffChangedMarkWire & { readonly displayedRevision: string };

/** Marks a kitchen as seen at the revision the page displayed. A save landing between load and mark keeps the mark. */
export interface StaffSeenRequestWire {
  readonly displayedRevision: string;
}

/** `200` of a seen mark: the kitchen's mark afterwards. The request status is untouched. */
export type StaffSeenMarkedWire = StaffChangedMarkWire;

/** `MISSING_VALUE` is absent or not text; `NOT_A_REVISION` is text that is not a digit string of the revision's shape
 *  (no leading zero, at most nineteen digits). Both are refused before the store (F9). */
export type StaffSeenRefusalCode = "MISSING_VALUE" | "NOT_A_REVISION";

/** `409` of a seen mark whose displayed revision is greater than the kitchen's current one, compared in SQL (F9). A
 *  kitchen deleted by its client or not sent is the byte-identical kitchen refusal, as for every staff route. */
export interface StaffSeenConflictWire {
  readonly status: "displayed-revision-ahead";
}

/** `400` of a seen mark: the member and a code. Never the value. */
export interface StaffSeenInvalidWire {
  readonly status: "invalid-input";
  readonly issues: readonly {
    readonly field: "displayedRevision";
    readonly code: StaffSeenRefusalCode;
  }[];
}

/** `200` of the changed-kitchens count behind the menu badge. */
export interface StaffChangedCountWire {
  readonly count: number;
}
