import { KITCHEN_L_DESIGN } from "@lemnaria/configurator-domain";
import type {
  Design,
  RequestStatus,
  StaffKitchenQuery,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import {
  NOTES_READ_LIMIT,
  StaffKitchenReaderError,
} from "../../src/staff-kitchen-reader.js";
import type {
  StaffKitchenDetail,
  StaffKitchenPage,
  StaffKitchenReader,
  StaffListedKitchen,
} from "../../src/staff-kitchen-reader.js";
import { rejectionOf } from "./rejection-of.js";

export interface ClientAccount {
  readonly accountId: string;
  /** As typed: mixed case. The stored normal form is its lower case. */
  readonly email: string;
  readonly name: string | null;
  readonly phone: string | null;
}

export interface StaffAccount {
  readonly accountId: string;
  readonly email: string;
  readonly name: string | null;
}

export interface KitchenSpec {
  readonly client: ClientAccount | null;
  /** Defaults to a fresh id. */
  readonly id?: string;
  readonly name?: string | null;
  /** Defaults to `null`: a draft. */
  readonly sentAt?: Date | null;
  readonly updatedAt: Date;
  readonly isHidden?: boolean;
  readonly isDeletedByClient?: boolean;
  /** Defaults to `readable`. */
  readonly document?: "readable" | "unreadable";
}

export interface RequestSpec {
  readonly designId: string;
  readonly createdAt: Date;
  readonly clientRequestId?: string;
  /** The design revision the request was sent at; `"1"`, where every design starts, when absent. */
  readonly designRevision?: string;
  /** The total in the request's snapshot. Absent: the snapshot stored totals nothing it names (`{}`). */
  readonly pricedTotal?: {
    readonly totalMinor: number;
    readonly currency: "MDL";
  };
}

export interface SentCopySpec {
  readonly clientRequestId: string;
  readonly createdAt: Date;
  /** Sixty-four lower-case hex digits; defaults to a random one. */
  readonly tokenHash?: string;
  readonly isRevoked?: boolean;
  readonly design: Design | "unreadable";
}

export interface StatusSpec {
  readonly designId: string;
  /** The stored text, whatever it is. */
  readonly status: string;
  readonly changedBy: StaffAccount;
  readonly changedAt: Date;
}

export interface NoteSpec {
  readonly designId: string;
  readonly author: StaffAccount;
  readonly text: string;
  readonly createdAt: Date;
  readonly id?: string;
}

/**
 * What the contract needs of a reader's surroundings. The fake and the live test database each build one, so the same
 * assertions run against both. The live database is shared and other rows may sit in it, so every list assertion is
 * scoped either by `marker` (a search that only this world's accounts contain) or by an `era` (an instant later than
 * any other row's, which puts a row at the head of the segment it belongs to).
 */
export interface KitchenWorld {
  readonly reader: StaffKitchenReader;
  /** Lower-case letters and digits, in the e-mail and name of every account this world makes. */
  readonly marker: string;
  /** Twenty upper-case letters: an id ending in one more letter sorts the same under every collation. */
  readonly idPrefix: string;
  /** An instant later than every earlier call's and than any row not made by this world. */
  nextEra(): Date;
  aClient(spec?: {
    readonly name?: string | null;
    readonly phone?: string | null;
    /** What the e-mail search reads. Defaults to the e-mail in lower case. */
    readonly emailNormalForm?: string;
  }): Promise<ClientAccount>;
  aStaffMember(): Promise<StaffAccount>;
  aKitchen(spec: KitchenSpec): Promise<string>;
  /** Returns the reference of the request, which the world makes unique. */
  aRequest(spec: RequestSpec): Promise<{
    readonly clientRequestId: string;
    readonly reference: string;
  }>;
  aSentCopy(spec: SentCopySpec): Promise<void>;
  aStatus(spec: StatusSpec): Promise<void>;
  aNote(spec: NoteSpec): Promise<string>;
  /** `count` notes, the nth (from 0) written at `firstAt` plus n minutes with the text `note n`. */
  someNotes(spec: {
    readonly designId: string;
    readonly author: StaffAccount;
    readonly count: number;
    readonly firstAt: Date;
  }): Promise<void>;
  /** Removes the account's row, as an erasure would, leaving every row that names it. */
  removeAccount(accountId: string): Promise<void>;
  /**
   * The kitchen's client saves it once more: the revision it now has, as text. A new kitchen is at revision `"1"`. No
   * test does arithmetic on a revision; the fake counts and the live database moves its own column.
   */
  saveKitchen(designId: string): Promise<string>;
  /** A staff member opens the kitchen, which records the revision the page displayed as seen (A-12). */
  markSeen(designId: string, displayedRevision: string): Promise<void>;
}

export const CURRENT_DESIGN: Design = KITCHEN_L_DESIGN;
export const SENT_DESIGN: Design = {
  ...KITCHEN_L_DESIGN,
  updatedAt: "2026-09-09T09:09:09.000Z",
};
export const OLDER_SENT_DESIGN: Design = {
  ...KITCHEN_L_DESIGN,
  updatedAt: "2026-07-07T07:07:07.000Z",
};

const ONE_MINUTE_MS = 60_000;
const ROWS_ACROSS_TWO_PAGES = 27;
const PAGE_SIZE = 20;
const LAST_COUNTABLE_PAGE = Math.floor(Number.MAX_SAFE_INTEGER / PAGE_SIZE);
const INITIAL_STATUS: RequestStatus = "new";

function queryOf(
  overrides: Partial<StaffKitchenQuery> = {},
): StaffKitchenQuery {
  return { segment: "sent", status: null, search: null, page: 1, ...overrides };
}

function at(era: Date, minutes: number): Date {
  return new Date(era.getTime() + minutes * ONE_MINUTE_MS);
}

async function failureOf(
  pending: PromiseLike<unknown>,
): Promise<StaffKitchenReaderError> {
  const failure = await rejectionOf(pending);
  expect(failure).toBeInstanceOf(StaffKitchenReaderError);
  return failure as StaffKitchenReaderError;
}

async function foundKitchen(
  world: KitchenWorld,
  designId: string,
): Promise<StaffKitchenDetail> {
  const reading = await world.reader.readOne(designId);
  if (reading.kind !== "found") throw new Error("the kitchen was not found");
  return reading.kitchen;
}

function idsOf(page: StaffKitchenPage): readonly string[] {
  return page.kitchens.map((kitchen) => kitchen.id);
}

function listedOf(page: StaffKitchenPage, id: string): StaffListedKitchen {
  const listed = page.kitchens.find((kitchen) => kitchen.id === id);
  if (listed === undefined) throw new Error("the kitchen was not listed");
  return listed;
}

export function describeStaffKitchenReaderContract(
  suiteName: string,
  newWorld: () => Promise<KitchenWorld>,
): void {
  describe(`${suiteName}: segments`, () => {
    it("lists a sent kitchen under sent and all, and a draft under drafts and all", async () => {
      const world = await newWorld();
      const client = await world.aClient();
      const era = world.nextEra();
      const sent = await world.aKitchen({
        client,
        sentAt: at(era, 1),
        updatedAt: at(era, 1),
      });
      const draft = await world.aKitchen({ client, updatedAt: at(era, 2) });
      const scope = { search: world.marker };

      const inSent = idsOf(
        await world.reader.listPage(queryOf({ ...scope, segment: "sent" })),
      );
      const inDrafts = idsOf(
        await world.reader.listPage(queryOf({ ...scope, segment: "drafts" })),
      );
      const inAll = idsOf(
        await world.reader.listPage(queryOf({ ...scope, segment: "all" })),
      );

      expect(inSent).toEqual([sent]);
      expect(inDrafts).toEqual([draft]);
      expect(inAll).toEqual([draft, sent]);
    });

    it("lists a sent kitchen no account owns under sent and all, and never under drafts", async () => {
      const world = await newWorld();
      const era = world.nextEra();
      const lead = await world.aKitchen({
        client: null,
        sentAt: at(era, 1),
        updatedAt: at(era, 1),
      });

      const inSent = await world.reader.listPage(queryOf({ segment: "sent" }));
      const inAll = await world.reader.listPage(queryOf({ segment: "all" }));
      const inDrafts = await world.reader.listPage(
        queryOf({ segment: "drafts" }),
      );

      expect(listedOf(inSent, lead).client).toBeNull();
      expect(listedOf(inAll, lead).isSent).toBe(true);
      expect(idsOf(inDrafts)).not.toContain(lead);
    });

    it("lists a visitor's unsent draft under no segment", async () => {
      const world = await newWorld();
      const era = world.nextEra();
      const visitorDraft = await world.aKitchen({
        client: null,
        updatedAt: at(era, 1),
      });

      const pages = await Promise.all(
        (["sent", "drafts", "all"] as const).map((segment) =>
          world.reader.listPage(queryOf({ segment })),
        ),
      );

      for (const page of pages) expect(idsOf(page)).not.toContain(visitorDraft);
    });

    it("lists a kitchen its client hid under every segment it belongs to, marked hidden", async () => {
      const world = await newWorld();
      const client = await world.aClient();
      const era = world.nextEra();
      const hiddenSent = await world.aKitchen({
        client,
        sentAt: at(era, 1),
        updatedAt: at(era, 1),
        isHidden: true,
      });
      const scope = { search: world.marker };

      const inSent = await world.reader.listPage(
        queryOf({ ...scope, segment: "sent" }),
      );
      const inAll = await world.reader.listPage(
        queryOf({ ...scope, segment: "all" }),
      );

      expect(listedOf(inSent, hiddenSent).isHidden).toBe(true);
      expect(idsOf(inAll)).toEqual([hiddenSent]);
    });

    it("lists a kitchen its client deleted under no segment, sent or not", async () => {
      const world = await newWorld();
      const client = await world.aClient();
      const era = world.nextEra();
      await world.aKitchen({
        client,
        sentAt: at(era, 1),
        updatedAt: at(era, 1),
        isDeletedByClient: true,
      });
      await world.aKitchen({
        client,
        updatedAt: at(era, 2),
        isDeletedByClient: true,
      });

      for (const segment of ["sent", "drafts", "all"] as const) {
        const page = await world.reader.listPage(
          queryOf({ segment, search: world.marker }),
        );
        expect(page.kitchens).toEqual([]);
        expect(page.total).toBe(0);
      }
    });
  });

  describe(`${suiteName}: order`, () => {
    it("orders the sent segment by sent time and the others by change time, newest first", async () => {
      const world = await newWorld();
      const client = await world.aClient();
      const era = world.nextEra();
      const sentFirstChangedLast = await world.aKitchen({
        client,
        sentAt: at(era, 1),
        updatedAt: at(era, 9),
      });
      const sentLastChangedFirst = await world.aKitchen({
        client,
        sentAt: at(era, 5),
        updatedAt: at(era, 2),
      });
      const scope = { search: world.marker };

      const inSent = idsOf(
        await world.reader.listPage(queryOf({ ...scope, segment: "sent" })),
      );
      const inAll = idsOf(
        await world.reader.listPage(queryOf({ ...scope, segment: "all" })),
      );

      expect(inSent).toEqual([sentLastChangedFirst, sentFirstChangedLast]);
      expect(inAll).toEqual([sentFirstChangedLast, sentLastChangedFirst]);
    });

    it("breaks a tie in time by id, larger first, in the sent segment", async () => {
      const world = await newWorld();
      const client = await world.aClient();
      const instant = at(world.nextEra(), 1);
      const ids = ["A", "C", "B"].map((letter) => `${world.idPrefix}${letter}`);
      for (const id of ids) {
        await world.aKitchen({
          client,
          id,
          sentAt: instant,
          updatedAt: instant,
        });
      }

      const page = await world.reader.listPage(
        queryOf({ search: world.marker }),
      );

      expect(idsOf(page)).toEqual([
        `${world.idPrefix}C`,
        `${world.idPrefix}B`,
        `${world.idPrefix}A`,
      ]);
    });

    it("breaks a tie in time by id, larger first, in the drafts and all segments", async () => {
      const world = await newWorld();
      const client = await world.aClient();
      const instant = at(world.nextEra(), 1);
      const ids = ["B", "A", "C"].map((letter) => `${world.idPrefix}${letter}`);
      for (const id of ids)
        await world.aKitchen({ client, id, updatedAt: instant });
      const expected = [
        `${world.idPrefix}C`,
        `${world.idPrefix}B`,
        `${world.idPrefix}A`,
      ];

      for (const segment of ["drafts", "all"] as const) {
        const page = await world.reader.listPage(
          queryOf({ segment, search: world.marker }),
        );
        expect(idsOf(page)).toEqual(expected);
      }
    });
  });

  describe(`${suiteName}: pages`, () => {
    it("puts the larger ids on the first page when twenty-two kitchens share one time", async () => {
      const world = await newWorld();
      const client = await world.aClient();
      const instant = at(world.nextEra(), 1);
      const letters = "ABCDEFGHIJKLMNOPQRSTUV".split("");
      for (const letter of letters) {
        await world.aKitchen({
          client,
          id: `${world.idPrefix}${letter}`,
          updatedAt: instant,
        });
      }
      const descending = [...letters]
        .reverse()
        .map((letter) => `${world.idPrefix}${letter}`);
      const query = queryOf({ segment: "drafts", search: world.marker });

      const first = await world.reader.listPage({ ...query, page: 1 });
      const second = await world.reader.listPage({ ...query, page: 2 });

      expect(idsOf(first)).toEqual(descending.slice(0, PAGE_SIZE));
      expect(idsOf(second)).toEqual(descending.slice(PAGE_SIZE));
    });

    it("splits twenty-seven kitchens into pages of twenty and seven with the same total on each, no kitchen twice or missing", async () => {
      const world = await newWorld();
      const client = await world.aClient();
      const era = world.nextEra();
      const planted: string[] = [];
      for (let minute = 0; minute < ROWS_ACROSS_TWO_PAGES; minute += 1) {
        planted.push(
          await world.aKitchen({ client, updatedAt: at(era, minute) }),
        );
      }
      const query = queryOf({ segment: "drafts", search: world.marker });

      const first = await world.reader.listPage({ ...query, page: 1 });
      const second = await world.reader.listPage({ ...query, page: 2 });
      const third = await world.reader.listPage({ ...query, page: 3 });

      expect([
        first.kitchens.length,
        second.kitchens.length,
        third.kitchens.length,
      ]).toEqual([20, 7, 0]);
      expect([first.total, second.total, third.total]).toEqual([27, 27, 27]);
      expect([...idsOf(first), ...idsOf(second)]).toEqual(
        [...planted].reverse(),
      );
      expect([first.page, first.pageSize]).toEqual([1, PAGE_SIZE]);
    });

    it("answers a page past the last with no kitchens and the total, and the last countable page without failing", async () => {
      const world = await newWorld();
      const client = await world.aClient();
      await world.aKitchen({ client, updatedAt: world.nextEra() });

      const far = await world.reader.listPage(
        queryOf({
          segment: "drafts",
          search: world.marker,
          page: LAST_COUNTABLE_PAGE,
        }),
      );

      expect(far.kitchens).toEqual([]);
      expect(far.total).toBe(1);
    });

    it("refuses a page of zero, a status outside the sent segment and a search over a hundred code points before any read", async () => {
      const world = await newWorld();
      const refused: readonly StaffKitchenQuery[] = [
        queryOf({ page: 0 }),
        queryOf({ page: 1.5 }),
        queryOf({ segment: "drafts", status: "closed" }),
        queryOf({ segment: "all", status: "new" }),
        queryOf({ search: "a".repeat(101) }),
        queryOf({ search: "a\u0000b" }),
        queryOf({ segment: "everything" as StaffKitchenQuery["segment"] }),
      ];

      for (const query of refused) {
        const failure = await failureOf(world.reader.listPage(query));
        expect(failure.failure).toBe("invalid-query");
      }
    });
  });

  describe(`${suiteName}: search and status filter`, () => {
    it("matches the client's e-mail and name in any letter case", async () => {
      const world = await newWorld();
      const byName = await world.aClient({ name: `Maria Pop ${world.marker}` });
      const era = world.nextEra();
      const kitchen = await world.aKitchen({
        client: byName,
        sentAt: at(era, 1),
        updatedAt: at(era, 1),
      });

      const byEmailUpper = await world.reader.listPage(
        queryOf({ search: byName.email.toUpperCase() }),
      );
      const byNameMixed = await world.reader.listPage(
        queryOf({ search: `mARIA pOP ${world.marker}` }),
      );
      const byPartOfEmail = await world.reader.listPage(
        queryOf({ search: world.marker.slice(1, -1) }),
      );

      expect(idsOf(byEmailUpper)).toEqual([kitchen]);
      expect(idsOf(byNameMixed)).toEqual([kitchen]);
      expect(idsOf(byPartOfEmail)).toContain(kitchen);
    });

    it("does not fold accents", async () => {
      const world = await newWorld();
      const client = await world.aClient({
        name: `\u0218tefan Ionescu ${world.marker}`,
      });
      const era = world.nextEra();
      await world.aKitchen({
        client,
        sentAt: at(era, 1),
        updatedAt: at(era, 1),
      });

      const page = await world.reader.listPage(
        queryOf({ search: `Stefan Ionescu ${world.marker}` }),
      );

      expect(page.kitchens).toEqual([]);
    });

    it.each([
      ["a percent sign", "a%b", "axyb"],
      ["an underscore", "a_b", "axb"],
      ["a backslash", "a\\b", "ab"],
    ])(
      "reads %s in the search as that character and not as a pattern",
      async (_label, literal, lookalike) => {
        const world = await newWorld();
        const holdsLiteral = await world.aClient({
          name: `${world.marker}${literal}`,
        });
        const holdsLookalike = await world.aClient({
          name: `${world.marker}${lookalike}`,
        });
        const era = world.nextEra();
        const literalKitchen = await world.aKitchen({
          client: holdsLiteral,
          sentAt: at(era, 1),
          updatedAt: at(era, 1),
        });
        await world.aKitchen({
          client: holdsLookalike,
          sentAt: at(era, 2),
          updatedAt: at(era, 2),
        });

        const page = await world.reader.listPage(
          queryOf({ search: `${world.marker}${literal}` }),
        );

        expect(idsOf(page)).toEqual([literalKitchen]);
      },
    );

    it("matches no kitchen by its own name, and none that no account owns", async () => {
      const world = await newWorld();
      const era = world.nextEra();
      const client = await world.aClient({ name: "Someone Else" });
      await world.aKitchen({
        client,
        name: `Cucina ${world.marker}`,
        sentAt: at(era, 1),
        updatedAt: at(era, 1),
      });
      await world.aKitchen({
        client: null,
        name: `Lead ${world.marker}`,
        sentAt: at(era, 2),
        updatedAt: at(era, 2),
      });

      const page = await world.reader.listPage(
        queryOf({ search: `Cucina ${world.marker}` }),
      );
      const leadPage = await world.reader.listPage(
        queryOf({ search: `Lead ${world.marker}` }),
      );

      expect(page.kitchens).toEqual([]);
      expect(leadPage.kitchens).toEqual([]);
    });

    it("filters by status, counting a sent kitchen with no saved status as new and never a status outside the list", async () => {
      const world = await newWorld();
      const client = await world.aClient();
      const staff = await world.aStaffMember();
      const era = world.nextEra();
      const untouched = await world.aKitchen({
        client,
        sentAt: at(era, 1),
        updatedAt: at(era, 1),
      });
      const saidNew = await world.aKitchen({
        client,
        sentAt: at(era, 2),
        updatedAt: at(era, 2),
      });
      const contacted = await world.aKitchen({
        client,
        sentAt: at(era, 3),
        updatedAt: at(era, 3),
      });
      const strange = await world.aKitchen({
        client,
        sentAt: at(era, 4),
        updatedAt: at(era, 4),
      });
      const when = at(era, 10);
      await world.aStatus({
        designId: saidNew,
        status: "new",
        changedBy: staff,
        changedAt: when,
      });
      await world.aStatus({
        designId: contacted,
        status: "contacted",
        changedBy: staff,
        changedAt: when,
      });
      await world.aStatus({
        designId: strange,
        status: "from-a-later-build",
        changedBy: staff,
        changedAt: when,
      });
      const scope = { search: world.marker };

      const asNew = idsOf(
        await world.reader.listPage(
          queryOf({ ...scope, status: INITIAL_STATUS }),
        ),
      );
      const asContacted = idsOf(
        await world.reader.listPage(queryOf({ ...scope, status: "contacted" })),
      );
      const asClosed = idsOf(
        await world.reader.listPage(queryOf({ ...scope, status: "closed" })),
      );

      expect(asNew).toEqual([saidNew, untouched]);
      expect(asContacted).toEqual([contacted]);
      expect(asClosed).toEqual([]);
    });
  });

  describe(`${suiteName}: Romanian letters in the search`, () => {
    const S_COMMA_BELOW = String.fromCodePoint(0x218);
    const S_COMMA_BELOW_LOWER = String.fromCodePoint(0x219);
    const S_CEDILLA = String.fromCodePoint(0x15e);
    const S_CEDILLA_LOWER = String.fromCodePoint(0x15f);
    const T_COMMA_BELOW = String.fromCodePoint(0x21a);
    const T_CEDILLA = String.fromCodePoint(0x162);
    const T_CEDILLA_LOWER = String.fromCodePoint(0x163);
    const A_BREVE = String.fromCodePoint(0x103);
    const I_CIRCUMFLEX = String.fromCodePoint(0xee);

    it.each([
      [
        "a stored comma-below S, typed as a cedilla S",
        `${S_COMMA_BELOW}tefan`,
        `${S_CEDILLA}tefan`,
      ],
      [
        "a stored cedilla S, typed as a comma-below S",
        `${S_CEDILLA}tefan`,
        `${S_COMMA_BELOW}tefan`,
      ],
      [
        "a stored lower-case comma-below s, typed as a lower-case cedilla s",
        `Ma${S_COMMA_BELOW_LOWER}ina`,
        `MA${S_CEDILLA_LOWER}ina`,
      ],
      [
        "a stored cedilla t, typed as a comma-below T",
        `Ro${T_CEDILLA_LOWER}u`,
        `RO${T_COMMA_BELOW}U`,
      ],
      [
        "a stored comma-below T, typed as a cedilla t",
        `${T_COMMA_BELOW}ara`,
        `${T_CEDILLA_LOWER}ara`,
      ],
    ])("finds %s", async (_label, stored, typed) => {
      const world = await newWorld();
      const client = await world.aClient({ name: `${stored} ${world.marker}` });
      const era = world.nextEra();
      const kitchen = await world.aKitchen({
        client,
        sentAt: at(era, 1),
        updatedAt: at(era, 1),
      });

      const page = await world.reader.listPage(
        queryOf({ search: `${typed} ${world.marker}` }),
      );

      expect(idsOf(page)).toEqual([kitchen]);
    });

    it.each([
      ["S for a comma-below S", "Stefan", `${S_COMMA_BELOW}tefan`],
      ["T for a cedilla T", "Tara", `${T_CEDILLA}ara`],
      ["a for a breve a", `Pa${A_BREVE}un`, "Paun"],
      ["i for a circumflex i", `Ro${I_CIRCUMFLEX}u`, "Roiu"],
    ])("keeps %s distinct", async (_label, typedLetter, storedLetter) => {
      const world = await newWorld();
      const client = await world.aClient({
        name: `${storedLetter} ${world.marker}`,
      });
      const era = world.nextEra();
      await world.aKitchen({
        client,
        sentAt: at(era, 1),
        updatedAt: at(era, 1),
      });

      const page = await world.reader.listPage(
        queryOf({ search: `${typedLetter} ${world.marker}` }),
      );

      expect(page.kitchens).toEqual([]);
    });

    it("searches the stored e-mail normal form and not the e-mail as typed", async () => {
      const world = await newWorld();
      const client = await world.aClient({
        emailNormalForm: `normal-${world.marker}@example.invalid`,
      });
      const era = world.nextEra();
      const kitchen = await world.aKitchen({
        client,
        sentAt: at(era, 1),
        updatedAt: at(era, 1),
      });

      const byNormalForm = await world.reader.listPage(
        queryOf({ search: `normal-${world.marker}` }),
      );
      const byTypedForm = await world.reader.listPage(
        queryOf({ search: client.email.slice(0, client.email.indexOf("@")) }),
      );

      expect(idsOf(byNormalForm)).toEqual([kitchen]);
      expect(idsOf(byTypedForm).includes(kitchen)).toBe(false);
    });
  });

  describe(`${suiteName}: the document of a listed kitchen`, () => {
    it("is the stored design, and null where this build cannot read it", async () => {
      const world = await newWorld();
      const client = await world.aClient();
      const era = world.nextEra();
      const readable = await world.aKitchen({ client, updatedAt: at(era, 1) });
      const unreadable = await world.aKitchen({
        client,
        updatedAt: at(era, 2),
        document: "unreadable",
      });

      const page = await world.reader.listPage(
        queryOf({ segment: "drafts", search: world.marker }),
      );

      expect(listedOf(page, readable).design?.createdAt).toBe(
        CURRENT_DESIGN.createdAt,
      );
      expect(listedOf(page, unreadable).design).toBeNull();
    });
  });

  describe(`${suiteName}: the status a row shows`, () => {
    it("shows null for a draft, new for a sent kitchen with no saved status, the saved status, and unrecognised for a stored text outside the list", async () => {
      const world = await newWorld();
      const client = await world.aClient();
      const staff = await world.aStaffMember();
      const era = world.nextEra();
      const draft = await world.aKitchen({ client, updatedAt: at(era, 1) });
      const draftWithStrayRow = await world.aKitchen({
        client,
        updatedAt: at(era, 2),
      });
      const untouched = await world.aKitchen({
        client,
        sentAt: at(era, 3),
        updatedAt: at(era, 3),
      });
      const offered = await world.aKitchen({
        client,
        sentAt: at(era, 4),
        updatedAt: at(era, 4),
      });
      const strange = await world.aKitchen({
        client,
        sentAt: at(era, 5),
        updatedAt: at(era, 5),
      });
      const when = at(era, 10);
      await world.aStatus({
        designId: draftWithStrayRow,
        status: "closed",
        changedBy: staff,
        changedAt: when,
      });
      await world.aStatus({
        designId: offered,
        status: "offer-sent",
        changedBy: staff,
        changedAt: when,
      });
      await world.aStatus({
        designId: strange,
        status: "from-a-later-build",
        changedBy: staff,
        changedAt: when,
      });

      const page = await world.reader.listPage(
        queryOf({ segment: "all", search: world.marker }),
      );

      expect(listedOf(page, draft).sentAt).toBeNull();
      expect(listedOf(page, untouched).sentAt?.getTime()).toBe(
        at(era, 3).getTime(),
      );
      expect(listedOf(page, draft).requestStatus).toBeNull();
      expect(listedOf(page, draftWithStrayRow).requestStatus).toBeNull();
      expect(listedOf(page, untouched).requestStatus).toBe("new");
      expect(listedOf(page, offered).requestStatus).toBe("offer-sent");
      expect(listedOf(page, strange).requestStatus).toBe("unrecognised");
    });
  });

  describe(`${suiteName}: a row's client`, () => {
    it("carries the client's e-mail as typed, name and phone, and null for a kitchen no account owns", async () => {
      const world = await newWorld();
      const client = await world.aClient({
        name: `Ana ${world.marker}`,
        phone: "+37360111222",
      });
      const era = world.nextEra();
      const owned = await world.aKitchen({
        client,
        sentAt: at(era, 1),
        updatedAt: at(era, 1),
      });

      const page = await world.reader.listPage(
        queryOf({ search: world.marker }),
      );

      expect(listedOf(page, owned).client).toEqual({
        id: client.accountId,
        email: client.email,
        name: `Ana ${world.marker}`,
        phone: "+37360111222",
      });
    });

    it("keeps a kitchen whose account no longer resolves, with no client", async () => {
      const world = await newWorld();
      const client = await world.aClient();
      const era = world.nextEra();
      const orphan = await world.aKitchen({
        client,
        sentAt: at(era, 1),
        updatedAt: at(era, 1),
      });
      await world.removeAccount(client.accountId);

      const page = await world.reader.listPage(queryOf({ segment: "sent" }));

      expect(listedOf(page, orphan).client).toBeNull();
    });
  });

  describe(`${suiteName}: reading one kitchen`, () => {
    it("answers an unknown id, a malformed id, a kitchen its client deleted and a visitor's unsent draft with the same nothing", async () => {
      const world = await newWorld();
      const client = await world.aClient();
      const era = world.nextEra();
      const deletedSent = await world.aKitchen({
        client,
        sentAt: at(era, 1),
        updatedAt: at(era, 1),
        isDeletedByClient: true,
      });
      const deletedDraft = await world.aKitchen({
        client,
        updatedAt: at(era, 2),
        isDeletedByClient: true,
      });
      const visitorDraft = await world.aKitchen({
        client: null,
        updatedAt: at(era, 3),
      });
      const unknown = `${world.idPrefix}Z`;
      const malformed = ["", "a/b", "a b", "x".repeat(65), "a\u0000b", "é"];

      const readings = await Promise.all(
        [deletedSent, deletedDraft, visitorDraft, unknown, ...malformed].map(
          (id) => world.reader.readOne(id),
        ),
      );

      for (const reading of readings)
        expect(reading).toStrictEqual({ kind: "none" });
    });

    it("reads a kitchen its client hid, a draft, and a sent kitchen no account owns", async () => {
      const world = await newWorld();
      const client = await world.aClient();
      const era = world.nextEra();
      const hidden = await world.aKitchen({
        client,
        name: "Hidden",
        sentAt: at(era, 1),
        updatedAt: at(era, 1),
        isHidden: true,
      });
      const draft = await world.aKitchen({ client, updatedAt: at(era, 2) });
      const lead = await world.aKitchen({
        client: null,
        sentAt: at(era, 3),
        updatedAt: at(era, 3),
      });

      const hiddenDetail = await foundKitchen(world, hidden);
      const draftDetail = await foundKitchen(world, draft);
      const leadDetail = await foundKitchen(world, lead);

      expect([
        hiddenDetail.isHidden,
        hiddenDetail.isSent,
        hiddenDetail.name,
      ]).toEqual([true, true, "Hidden"]);
      expect([
        draftDetail.isSent,
        draftDetail.sentAt,
        draftDetail.client?.id,
      ]).toEqual([false, null, client.accountId]);
      expect([leadDetail.client, leadDetail.isSent]).toEqual([null, true]);
      expect(hiddenDetail.sentAt?.getTime()).toBe(at(era, 1).getTime());
      expect(hiddenDetail.updatedAt.getTime()).toBe(at(era, 1).getTime());
    });

    it("carries the document, and null in its place when this build cannot read it", async () => {
      const world = await newWorld();
      const client = await world.aClient();
      const era = world.nextEra();
      const readable = await world.aKitchen({ client, updatedAt: at(era, 1) });
      const unreadable = await world.aKitchen({
        client,
        updatedAt: at(era, 2),
        document: "unreadable",
      });

      const readableDetail = await foundKitchen(world, readable);
      const unreadableDetail = await foundKitchen(world, unreadable);

      expect(readableDetail.design?.createdAt).toBe(CURRENT_DESIGN.createdAt);
      expect(unreadableDetail.design).toBeNull();
      expect(unreadableDetail.id).toBe(unreadable);
    });

    it("carries the client's e-mail, name and phone", async () => {
      const world = await newWorld();
      const client = await world.aClient({
        name: "Ion Client",
        phone: "+37360123456",
      });
      const kitchen = await world.aKitchen({
        client,
        updatedAt: world.nextEra(),
      });

      const detail = await foundKitchen(world, kitchen);

      expect(detail.client).toEqual({
        id: client.accountId,
        email: client.email,
        name: "Ion Client",
        phone: "+37360123456",
      });
    });
  });

  describe(`${suiteName}: the latest request and the kitchen as sent`, () => {
    it("shows the reference and the date of the newest request only", async () => {
      const world = await newWorld();
      const client = await world.aClient();
      const era = world.nextEra();
      const kitchen = await world.aKitchen({
        client,
        sentAt: at(era, 1),
        updatedAt: at(era, 1),
      });
      const older = await world.aRequest({
        designId: kitchen,
        createdAt: at(era, 1),
      });
      const newer = await world.aRequest({
        designId: kitchen,
        createdAt: at(era, 5),
      });
      await world.aRequest({
        designId: await world.aKitchen({ client, updatedAt: at(era, 9) }),
        createdAt: at(era, 9),
      });

      const detail = await foundKitchen(world, kitchen);

      expect(detail.request).toEqual({
        reference: newer.reference,
        sentAt: at(era, 5),
      });
      expect(detail.request?.reference).not.toBe(older.reference);
    });

    it("breaks a tie between two requests of one time by request id, larger first", async () => {
      const world = await newWorld();
      const client = await world.aClient();
      const era = world.nextEra();
      const kitchen = await world.aKitchen({
        client,
        sentAt: at(era, 1),
        updatedAt: at(era, 1),
      });
      const instant = at(era, 3);
      const smaller = await world.aRequest({
        designId: kitchen,
        createdAt: instant,
        clientRequestId: `${world.idPrefix}AAAAAA`,
      });
      const larger = await world.aRequest({
        designId: kitchen,
        createdAt: instant,
        clientRequestId: `${world.idPrefix}BBBBBB`,
      });

      const detail = await foundKitchen(world, kitchen);

      expect(detail.request?.reference).toBe(larger.reference);
      expect(detail.request?.reference).not.toBe(smaller.reference);
    });

    it("has no request for a kitchen nobody asked about", async () => {
      const world = await newWorld();
      const client = await world.aClient();
      const kitchen = await world.aKitchen({
        client,
        updatedAt: world.nextEra(),
      });

      expect((await foundKitchen(world, kitchen)).request).toBeNull();
    });

    it("shows the newest unrevoked copy of the latest request, and falls back to nothing when the copies are revoked or belong to an older request", async () => {
      const world = await newWorld();
      const client = await world.aClient();
      const era = world.nextEra();
      const withCopies = await world.aKitchen({
        client,
        sentAt: at(era, 1),
        updatedAt: at(era, 1),
      });
      const olderRequest = await world.aRequest({
        designId: withCopies,
        createdAt: at(era, 1),
      });
      const latestRequest = await world.aRequest({
        designId: withCopies,
        createdAt: at(era, 5),
      });
      await world.aSentCopy({
        clientRequestId: olderRequest.clientRequestId,
        createdAt: at(era, 2),
        design: OLDER_SENT_DESIGN,
      });
      await world.aSentCopy({
        clientRequestId: latestRequest.clientRequestId,
        createdAt: at(era, 6),
        design: OLDER_SENT_DESIGN,
      });
      await world.aSentCopy({
        clientRequestId: latestRequest.clientRequestId,
        createdAt: at(era, 7),
        design: SENT_DESIGN,
      });
      await world.aSentCopy({
        clientRequestId: latestRequest.clientRequestId,
        createdAt: at(era, 8),
        design: CURRENT_DESIGN,
        isRevoked: true,
      });
      const copyOfOlderOnly = await world.aKitchen({
        client,
        sentAt: at(era, 1),
        updatedAt: at(era, 2),
      });
      const first = await world.aRequest({
        designId: copyOfOlderOnly,
        createdAt: at(era, 1),
      });
      await world.aRequest({
        designId: copyOfOlderOnly,
        createdAt: at(era, 4),
      });
      await world.aSentCopy({
        clientRequestId: first.clientRequestId,
        createdAt: at(era, 2),
        design: SENT_DESIGN,
      });
      const allRevoked = await world.aKitchen({
        client,
        sentAt: at(era, 1),
        updatedAt: at(era, 3),
      });
      const only = await world.aRequest({
        designId: allRevoked,
        createdAt: at(era, 1),
      });
      await world.aSentCopy({
        clientRequestId: only.clientRequestId,
        createdAt: at(era, 2),
        design: SENT_DESIGN,
        isRevoked: true,
      });

      const shown = await foundKitchen(world, withCopies);
      const onlyOlder = await foundKitchen(world, copyOfOlderOnly);
      const revoked = await foundKitchen(world, allRevoked);

      expect(shown.asSent?.updatedAt).toBe(SENT_DESIGN.updatedAt);
      expect(shown.design?.updatedAt).toBe(CURRENT_DESIGN.updatedAt);
      expect(onlyOlder.asSent).toBeNull();
      expect(revoked.asSent).toBeNull();
    });

    it("reads a copy this build cannot read as none", async () => {
      const world = await newWorld();
      const client = await world.aClient();
      const era = world.nextEra();
      const kitchen = await world.aKitchen({
        client,
        sentAt: at(era, 1),
        updatedAt: at(era, 1),
      });
      const request = await world.aRequest({
        designId: kitchen,
        createdAt: at(era, 1),
      });
      await world.aSentCopy({
        clientRequestId: request.clientRequestId,
        createdAt: at(era, 2),
        design: "unreadable",
      });

      expect((await foundKitchen(world, kitchen)).asSent).toBeNull();
    });
  });

  describe(`${suiteName}: two copies of one request made at the same time`, () => {
    const HASHES = ["1", "7", "8", "9"].map((digit) => digit.repeat(64));
    const [HASH_1, HASH_7, HASH_8, HASH_9] = HASHES as [
      string,
      string,
      string,
      string,
    ];

    it("shows the copy with the larger token hash, whichever was stored first", async () => {
      const world = await newWorld();
      const client = await world.aClient();
      const era = world.nextEra();
      const instant = at(era, 5);
      const storedSmallerFirst = await world.aKitchen({
        client,
        sentAt: at(era, 1),
        updatedAt: at(era, 1),
      });
      const storedLargerFirst = await world.aKitchen({
        client,
        sentAt: at(era, 2),
        updatedAt: at(era, 2),
      });
      const first = await world.aRequest({
        designId: storedSmallerFirst,
        createdAt: at(era, 3),
      });
      const second = await world.aRequest({
        designId: storedLargerFirst,
        createdAt: at(era, 3),
      });
      await world.aSentCopy({
        clientRequestId: first.clientRequestId,
        createdAt: instant,
        tokenHash: HASH_1,
        design: OLDER_SENT_DESIGN,
      });
      await world.aSentCopy({
        clientRequestId: first.clientRequestId,
        createdAt: instant,
        tokenHash: HASH_9,
        design: SENT_DESIGN,
      });
      await world.aSentCopy({
        clientRequestId: second.clientRequestId,
        createdAt: instant,
        tokenHash: HASH_8,
        design: SENT_DESIGN,
      });
      await world.aSentCopy({
        clientRequestId: second.clientRequestId,
        createdAt: instant,
        tokenHash: HASH_7,
        design: OLDER_SENT_DESIGN,
      });

      const smallerFirst = await foundKitchen(world, storedSmallerFirst);
      const largerFirst = await foundKitchen(world, storedLargerFirst);

      expect(smallerFirst.asSent?.updatedAt).toBe(SENT_DESIGN.updatedAt);
      expect(largerFirst.asSent?.updatedAt).toBe(SENT_DESIGN.updatedAt);
    });
  });

  describe(`${suiteName}: the status of one kitchen`, () => {
    it("is null for a draft, even with a stray row, and new with no change for a sent kitchen with none saved", async () => {
      const world = await newWorld();
      const client = await world.aClient();
      const staff = await world.aStaffMember();
      const era = world.nextEra();
      const draftWithStrayRow = await world.aKitchen({
        client,
        updatedAt: at(era, 1),
      });
      const untouched = await world.aKitchen({
        client,
        sentAt: at(era, 2),
        updatedAt: at(era, 2),
      });
      await world.aStatus({
        designId: draftWithStrayRow,
        status: "closed",
        changedBy: staff,
        changedAt: at(era, 3),
      });

      expect((await foundKitchen(world, draftWithStrayRow)).status).toBeNull();
      expect((await foundKitchen(world, untouched)).status).toEqual({
        value: "new",
        change: null,
      });
    });

    it("carries the saved status, who changed it and when", async () => {
      const world = await newWorld();
      const client = await world.aClient();
      const staff = await world.aStaffMember();
      const era = world.nextEra();
      const kitchen = await world.aKitchen({
        client,
        sentAt: at(era, 1),
        updatedAt: at(era, 1),
      });
      await world.aStatus({
        designId: kitchen,
        status: "offer-sent",
        changedBy: staff,
        changedAt: at(era, 4),
      });

      const detail = await foundKitchen(world, kitchen);

      expect(detail.status).toEqual({
        value: "offer-sent",
        change: {
          by: { id: staff.accountId, email: staff.email, name: staff.name },
          at: at(era, 4),
        },
      });
    });

    it("marks a stored status outside the list as unrecognised and does not read it as new", async () => {
      const world = await newWorld();
      const client = await world.aClient();
      const staff = await world.aStaffMember();
      const era = world.nextEra();
      const kitchen = await world.aKitchen({
        client,
        sentAt: at(era, 1),
        updatedAt: at(era, 1),
      });
      await world.aStatus({
        designId: kitchen,
        status: "from-a-later-build",
        changedBy: staff,
        changedAt: at(era, 4),
      });

      const detail = await foundKitchen(world, kitchen);

      expect(detail.status?.value).toBe("unrecognised");
      expect(detail.status?.change?.by.id).toBe(staff.accountId);
    });

    it("names the account that changed it with no e-mail or name once that account is gone", async () => {
      const world = await newWorld();
      const client = await world.aClient();
      const staff = await world.aStaffMember();
      const era = world.nextEra();
      const kitchen = await world.aKitchen({
        client,
        sentAt: at(era, 1),
        updatedAt: at(era, 1),
      });
      await world.aStatus({
        designId: kitchen,
        status: "closed",
        changedBy: staff,
        changedAt: at(era, 4),
      });
      await world.removeAccount(staff.accountId);

      const detail = await foundKitchen(world, kitchen);

      expect(detail.status?.change?.by).toEqual({
        id: staff.accountId,
        email: null,
        name: null,
      });
    });
  });

  describe(`${suiteName}: the notes of one kitchen`, () => {
    it("lists this kitchen's notes only, newest first, a tie in time broken by id with the larger first", async () => {
      const world = await newWorld();
      const client = await world.aClient();
      const staff = await world.aStaffMember();
      const era = world.nextEra();
      const kitchen = await world.aKitchen({ client, updatedAt: at(era, 1) });
      const other = await world.aKitchen({ client, updatedAt: at(era, 2) });
      const oldest = await world.aNote({
        designId: kitchen,
        author: staff,
        text: "oldest",
        createdAt: at(era, 1),
      });
      const tieSmaller = await world.aNote({
        designId: kitchen,
        author: staff,
        text: "tie small",
        createdAt: at(era, 3),
        id: `${world.idPrefix}A`,
      });
      const tieLarger = await world.aNote({
        designId: kitchen,
        author: staff,
        text: "tie large",
        createdAt: at(era, 3),
        id: `${world.idPrefix}B`,
      });
      const newest = await world.aNote({
        designId: kitchen,
        author: staff,
        text: "newest\nwith a line break",
        createdAt: at(era, 5),
      });
      await world.aNote({
        designId: other,
        author: staff,
        text: "someone else's",
        createdAt: at(era, 9),
      });

      const detail = await foundKitchen(world, kitchen);

      expect(detail.notes.map((note) => note.id)).toEqual([
        newest,
        tieLarger,
        tieSmaller,
        oldest,
      ]);
      expect(detail.notes[0]).toEqual({
        id: newest,
        text: "newest\nwith a line break",
        createdAt: at(era, 5),
        author: { id: staff.accountId, email: staff.email, name: staff.name },
      });
    });

    it("has no notes for a kitchen nobody wrote about, and names a gone author by id alone", async () => {
      const world = await newWorld();
      const client = await world.aClient();
      const staff = await world.aStaffMember();
      const era = world.nextEra();
      const quiet = await world.aKitchen({ client, updatedAt: at(era, 1) });
      const noted = await world.aKitchen({ client, updatedAt: at(era, 2) });
      await world.aNote({
        designId: noted,
        author: staff,
        text: "kept",
        createdAt: at(era, 3),
      });
      await world.removeAccount(staff.accountId);

      const quietDetail = await foundKitchen(world, quiet);
      const notedDetail = await foundKitchen(world, noted);

      expect(quietDetail.notes).toEqual([]);
      expect(notedDetail.notes[0]?.author).toEqual({
        id: staff.accountId,
        email: null,
        name: null,
      });
    });

    it("returns the newest hundred notes and says so when there are more, and all of them when there are not", async () => {
      const world = await newWorld();
      const client = await world.aClient();
      const staff = await world.aStaffMember();
      const era = world.nextEra();
      const exactly = await world.aKitchen({ client, updatedAt: at(era, 1) });
      const over = await world.aKitchen({ client, updatedAt: at(era, 2) });
      await world.someNotes({
        designId: exactly,
        author: staff,
        count: NOTES_READ_LIMIT,
        firstAt: at(era, 10),
      });
      await world.someNotes({
        designId: over,
        author: staff,
        count: NOTES_READ_LIMIT + 1,
        firstAt: at(era, 10),
      });

      const exactDetail = await foundKitchen(world, exactly);
      const overDetail = await foundKitchen(world, over);

      expect(exactDetail.notes).toHaveLength(NOTES_READ_LIMIT);
      expect(exactDetail.notesTruncated).toBe(false);
      expect(overDetail.notes).toHaveLength(NOTES_READ_LIMIT);
      expect(overDetail.notesTruncated).toBe(true);
      expect(overDetail.notes[0]?.text).toBe(
        `note ${String(NOTES_READ_LIMIT)}`,
      );
      expect(overDetail.notes.at(-1)?.text).toBe("note 1");
    });

    it("reads the notes of a kitchen its client hid", async () => {
      const world = await newWorld();
      const client = await world.aClient();
      const staff = await world.aStaffMember();
      const era = world.nextEra();
      const hidden = await world.aKitchen({
        client,
        sentAt: at(era, 1),
        updatedAt: at(era, 1),
        isHidden: true,
      });
      await world.aNote({
        designId: hidden,
        author: staff,
        text: "still here",
        createdAt: at(era, 2),
      });

      expect((await foundKitchen(world, hidden)).notes).toHaveLength(1);
    });
  });

  describeChangedAfterSeen(suiteName, newWorld);
  describeTheTotalSent(suiteName, newWorld);
}

/** A sent kitchen of the world's client, with the request it was sent by at revision 1: not changed. */
async function aSentKitchen(
  world: KitchenWorld,
  client: ClientAccount,
  sentAt: Date,
): Promise<string> {
  const kitchen = await world.aKitchen({
    client,
    sentAt,
    updatedAt: sentAt,
  });
  await world.aRequest({ designId: kitchen, createdAt: sentAt });
  return kitchen;
}

function describeChangedAfterSeen(
  suiteName: string,
  newWorld: () => Promise<KitchenWorld>,
): void {
  describe(`${suiteName}: changed after seen (ADR 0178 A-12)`, () => {
    it("shows a sent kitchen as not changed at the revision it was sent at, and as changed once it is saved again, on the list and on the page", async () => {
      const world = await newWorld();
      const client = await world.aClient();
      const kitchen = await aSentKitchen(world, client, at(world.nextEra(), 1));
      const scope = queryOf({ search: world.marker });

      const before = listedOf(await world.reader.listPage(scope), kitchen);
      const detailBefore = await foundKitchen(world, kitchen);
      const saved = await world.saveKitchen(kitchen);
      const after = listedOf(await world.reader.listPage(scope), kitchen);
      const detailAfter = await foundKitchen(world, kitchen);

      expect([
        before.isChangedSinceSeen,
        detailBefore.isChangedSinceSeen,
      ]).toEqual([false, false]);
      expect([
        after.isChangedSinceSeen,
        detailAfter.isChangedSinceSeen,
      ]).toEqual([true, true]);
      expect(detailBefore.revision).toBe("1");
      expect(detailAfter.revision).toBe(saved);
      expect(saved).not.toBe("1");
    });

    it("takes the revision of the kitchen's latest request as the one staff last saw until they open it: a kitchen sent again at its current revision is not changed", async () => {
      const world = await newWorld();
      const client = await world.aClient();
      const era = world.nextEra();
      const kitchen = await aSentKitchen(world, client, at(era, 1));
      const saved = await world.saveKitchen(kitchen);
      await world.aRequest({
        designId: kitchen,
        createdAt: at(era, 5),
        designRevision: saved,
      });
      const scope = queryOf({ search: world.marker });

      const sentAgain = listedOf(await world.reader.listPage(scope), kitchen);
      await world.saveKitchen(kitchen);
      const savedAfter = listedOf(await world.reader.listPage(scope), kitchen);

      expect(sentAgain.isChangedSinceSeen).toBe(false);
      expect(savedAfter.isChangedSinceSeen).toBe(true);
    });

    it("stops showing it changed once staff open the revision displayed, shows it again after the next save, and leaves a stale mark's older revision to the newer", async () => {
      const world = await newWorld();
      const client = await world.aClient();
      const kitchen = await aSentKitchen(world, client, at(world.nextEra(), 1));
      const scope = queryOf({ search: world.marker });
      const isChanged = async () =>
        listedOf(await world.reader.listPage(scope), kitchen)
          .isChangedSinceSeen;
      const second = await world.saveKitchen(kitchen);

      await world.markSeen(kitchen, second);
      const afterOpening = await isChanged();
      const third = await world.saveKitchen(kitchen);
      const afterNextSave = await isChanged();
      await world.markSeen(kitchen, "1");
      const afterStaleMark = await isChanged();
      const detailAfterStaleMark = await foundKitchen(world, kitchen);

      expect([
        afterOpening,
        afterNextSave,
        afterStaleMark,
        detailAfterStaleMark.isChangedSinceSeen,
      ]).toEqual([false, true, true, true]);
      // The page displays the kitchen's own revision, not the one staff last saw: it is what the next mark sends back.
      expect(detailAfterStaleMark.revision).toBe(third);
    });

    it("never shows a draft an account holds as changed, however often it is saved or opened", async () => {
      const world = await newWorld();
      const client = await world.aClient();
      const draft = await world.aKitchen({
        client,
        updatedAt: at(world.nextEra(), 1),
      });
      const scope = queryOf({ search: world.marker, segment: "drafts" });
      await world.saveKitchen(draft);
      await world.saveKitchen(draft);
      await world.markSeen(draft, "1");
      await world.saveKitchen(draft);

      const listed = listedOf(await world.reader.listPage(scope), draft);
      const detail = await foundKitchen(world, draft);

      expect([listed.isChangedSinceSeen, detail.isChangedSinceSeen]).toEqual([
        false,
        false,
      ]);
    });

    it("lists the changed kitchens alone when asked, under the sent and the all segments, and counts them whatever the query narrows to", async () => {
      const world = await newWorld();
      const client = await world.aClient();
      const era = world.nextEra();
      const changedNewer = await aSentKitchen(world, client, at(era, 5));
      const unchanged = await aSentKitchen(world, client, at(era, 9));
      const changedOlder = await aSentKitchen(world, client, at(era, 1));
      await world.saveKitchen(changedNewer);
      await world.saveKitchen(changedOlder);
      const scope = { search: world.marker };

      const onlyChangedInSent = await world.reader.listPage(
        queryOf({ ...scope, onlyChanged: true }),
      );
      const onlyChangedInAll = await world.reader.listPage(
        queryOf({ ...scope, segment: "all", onlyChanged: true }),
      );
      const everything = await world.reader.listPage(queryOf(scope));

      expect(idsOf(onlyChangedInSent)).toEqual([changedNewer, changedOlder]);
      expect(idsOf(onlyChangedInAll)).toEqual([changedNewer, changedOlder]);
      expect(onlyChangedInSent.total).toBe(2);
      expect(
        onlyChangedInSent.kitchens.every((row) => row.isChangedSinceSeen),
      ).toBe(true);
      expect(idsOf(everything)).toContain(unchanged);
      for (const page of [onlyChangedInSent, onlyChangedInAll, everything]) {
        expect(page.changedCount).toBeGreaterThanOrEqual(2);
      }
    });

    it("counts, in one snapshot with the page, exactly the kitchens that asking for the changed ones alone returns, over all its pages, however many other kitchens its client deleted or never sent", async () => {
      const world = await newWorld();
      const client = await world.aClient();
      const era = world.nextEra();
      const kitchen = await aSentKitchen(world, client, at(era, 1));
      await world.saveKitchen(kitchen);
      const deleted = await world.aKitchen({
        client,
        sentAt: at(era, 2),
        updatedAt: at(era, 2),
        isDeletedByClient: true,
      });
      await world.aRequest({ designId: deleted, createdAt: at(era, 2) });
      await world.saveKitchen(deleted);
      const draft = await world.aKitchen({ client, updatedAt: at(era, 3) });
      await world.saveKitchen(draft);

      for (const segment of ["sent", "all"] as const) {
        const page = await world.reader.listPage(
          queryOf({ segment, onlyChanged: true }),
        );
        expect(page.changedCount, segment).toBe(page.total);
        expect(page.total, segment).toBeGreaterThanOrEqual(1);
      }
    });

    it("counts the changed kitchens even when the query matches none of them: the count is the menu's and not the search's", async () => {
      const world = await newWorld();
      const client = await world.aClient();
      const kitchen = await aSentKitchen(world, client, at(world.nextEra(), 1));
      await world.saveKitchen(kitchen);

      const page = await world.reader.listPage(
        queryOf({ search: `${world.marker}-no-such-client` }),
      );

      expect(page.total).toBe(0);
      expect(page.kitchens).toEqual([]);
      expect(page.changedCount).toBeGreaterThanOrEqual(1);
    });

    it("puts the changed kitchens first, then each group in the segment's own order, and keeps that order across pages", async () => {
      const world = await newWorld();
      const client = await world.aClient();
      const era = world.nextEra();
      const unchangedNewest = await aSentKitchen(world, client, at(era, 9));
      const changedMiddle = await aSentKitchen(world, client, at(era, 5));
      const unchangedOldest = await aSentKitchen(world, client, at(era, 1));
      const changedOldest = await aSentKitchen(world, client, at(era, 2));
      await world.saveKitchen(changedMiddle);
      await world.saveKitchen(changedOldest);

      const page = await world.reader.listPage(
        queryOf({ search: world.marker }),
      );

      expect(idsOf(page)).toEqual([
        changedMiddle,
        changedOldest,
        unchangedNewest,
        unchangedOldest,
      ]);
    });

    it("brings a changed kitchen onto the first page ahead of a full page of newer unchanged ones: the order decides which rows a page holds, not only how they sit", async () => {
      const world = await newWorld();
      const client = await world.aClient();
      const era = world.nextEra();
      const changedOldest = await aSentKitchen(world, client, at(era, 1));
      await world.saveKitchen(changedOldest);
      const newer: string[] = [];
      for (let minute = 2; minute <= 21; minute += 1) {
        newer.push(await aSentKitchen(world, client, at(era, minute)));
      }
      const scope = queryOf({ search: world.marker });

      const first = await world.reader.listPage(scope);
      const second = await world.reader.listPage({ ...scope, page: 2 });

      expect(first.kitchens).toHaveLength(20);
      expect(first.total).toBe(21);
      expect(idsOf(first)[0]).toBe(changedOldest);
      expect(idsOf(second)).toEqual([newer[0]]);
    });

    it("counts neither a kitchen its client deleted nor a draft, and lists neither under the changed kitchens", async () => {
      const world = await newWorld();
      const client = await world.aClient();
      const era = world.nextEra();
      const deleted = await world.aKitchen({
        client,
        sentAt: at(era, 1),
        updatedAt: at(era, 1),
        isDeletedByClient: true,
      });
      await world.aRequest({ designId: deleted, createdAt: at(era, 1) });
      const draft = await world.aKitchen({ client, updatedAt: at(era, 2) });
      await world.saveKitchen(deleted);
      await world.saveKitchen(draft);

      for (const segment of ["sent", "drafts", "all"] as const) {
        const page = await world.reader.listPage(
          queryOf({ segment, search: world.marker, onlyChanged: true }),
        );
        expect(page.kitchens, segment).toEqual([]);
        expect(page.total, segment).toBe(0);
      }
    });

    it("refuses a flag that is not a boolean before any statement", async () => {
      const world = await newWorld();

      const failure = await failureOf(
        world.reader.listPage({
          ...queryOf(),
          onlyChanged: "true" as never,
        }),
      );

      expect(failure.failure).toBe("invalid-query");
    });
  });
}

function describeTheTotalSent(
  suiteName: string,
  newWorld: () => Promise<KitchenWorld>,
): void {
  describe(`${suiteName}: the total a request was sent at`, () => {
    it("is the stored total and currency of the newest request, never summed and never priced again, and null where the request stored none", async () => {
      const world = await newWorld();
      const client = await world.aClient();
      const era = world.nextEra();
      const priced = await world.aKitchen({
        client,
        sentAt: at(era, 1),
        updatedAt: at(era, 1),
      });
      const unpriced = await world.aKitchen({
        client,
        sentAt: at(era, 2),
        updatedAt: at(era, 2),
      });
      const never = await world.aKitchen({ client, updatedAt: at(era, 3) });
      await world.aRequest({
        designId: priced,
        createdAt: at(era, 1),
        pricedTotal: { totalMinor: 100_000, currency: "MDL" },
      });
      await world.aRequest({
        designId: priced,
        createdAt: at(era, 5),
        pricedTotal: { totalMinor: 123_450, currency: "MDL" },
      });
      await world.aRequest({ designId: unpriced, createdAt: at(era, 2) });

      expect((await foundKitchen(world, priced)).sentTotal).toEqual({
        totalMinor: 123_450,
        currency: "MDL",
      });
      expect((await foundKitchen(world, unpriced)).sentTotal).toBeNull();
      expect((await foundKitchen(world, never)).sentTotal).toBeNull();
    });

    it("is zero for a snapshot that totals nothing, which is a total and not an absence", async () => {
      const world = await newWorld();
      const client = await world.aClient();
      const era = world.nextEra();
      const kitchen = await world.aKitchen({
        client,
        sentAt: at(era, 1),
        updatedAt: at(era, 1),
      });
      await world.aRequest({
        designId: kitchen,
        createdAt: at(era, 1),
        pricedTotal: { totalMinor: 0, currency: "MDL" },
      });

      expect((await foundKitchen(world, kitchen)).sentTotal).toEqual({
        totalMinor: 0,
        currency: "MDL",
      });
    });
  });
}
