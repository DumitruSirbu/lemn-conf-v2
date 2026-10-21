import type { Design, RequestStatus } from "@lemnaria/configurator-domain";

// What `GET /api/staff/kitchens` and `GET /api/staff/kitchens/{id}` answer and the staff pages that read them expect,
// once. It lives outside `lib/server` because the client bundle may not import a server-only module, and holds types
// only. No account id appears anywhere in it: a person is named by the e-mail and the name staff see (ADR 0173).

/** The kitchen's document as far as a list thumbnail draws it: the room, the cabinets and the colour. The stored
 *  document's identity and timestamps stay behind. */
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
