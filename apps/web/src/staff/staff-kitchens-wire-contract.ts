import type {
  Design,
  NoteTextRefusalCode,
  RequestStatus,
  StaffKitchenQueryField,
  StaffKitchenQueryRefusalCode,
} from "@lemnaria/configurator-domain";

// What `GET /api/staff/kitchens` and `GET /api/staff/kitchens/{id}` answer and the staff pages that read them expect,
// once. It lives outside `lib/server` because the client bundle may not import a server-only module, and holds types
// only. No account id appears anywhere in it: a person is named by the e-mail and the name staff see (ADR 0173).

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

/** What a staff write's body can be refused for: the note's text, by the domain's own codes and the store's repeat of its
 *  check, and the status, by whether it was given, was text and is in the list. */
export type StaffWriteIssue =
  | {
      readonly field: "text";
      readonly code: NoteTextRefusalCode | "NOTE_TEXT_NOT_JUDGED";
    }
  | {
      readonly field: "status";
      readonly code: "REQUIRED" | "NOT_TEXT" | "STATUS_NOT_IN_LIST";
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
