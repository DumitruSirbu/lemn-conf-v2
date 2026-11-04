import { describe, expect, it } from "vitest";

import { KITCHEN_L_DESIGN } from "@lemnaria/configurator-domain";
import type {
  StaffKitchenDetail,
  StaffKitchenNote,
  StaffKitchenPage,
} from "@lemnaria/persistence";

import {
  staffChangedCountResponse,
  staffInvalidQueryResponse,
  staffKitchenListResponse,
  staffKitchenResponse,
  staffSeenMarkedResponse,
} from "@/lib/server/staff/staff-responses";
import type {
  StaffInvalidQueryWire,
  StaffKitchenEstimatesWire,
} from "@/staff/staff-kitchens-wire-contract";

/**
 * The staff answers are shaped member by member. These tests hand the builders reader objects that carry members the
 * contract does not name (an account id, a postal address, a credential) and require that none comes out, so a column
 * the reader gains later reaches no response until it is named in `staff-responses.ts`.
 */

const WHEN = new Date("2026-10-18T09:00:00.000Z");
const UNNAMED_MEMBERS = {
  accountId: "LEAK-account-id-000000",
  postalAddress: "LEAK Strada Secreta 7",
  passwordHash: "LEAK-argon2id-hash",
  visitorHash: "LEAK-visitor-hash",
};

function leaky<Value extends object>(value: Value): Value {
  return { ...value, ...UNNAMED_MEMBERS };
}

const CLIENT = leaky({
  id: "LEAK-client-id-0000000",
  email: "client@example.test",
  name: "Ana Client",
  phone: "+37369000000",
});
const STAFF_PERSON = leaky({
  id: "LEAK-staff-id-00000000",
  email: "staff@example.test",
  name: null,
});

const LISTED = leaky({
  id: "kitchenid000000000001",
  name: "Bucataria",
  design: leaky(KITCHEN_L_DESIGN),
  client: CLIENT,
  isSent: true,
  isHidden: false,
  sentAt: WHEN,
  updatedAt: WHEN,
  requestStatus: "new" as const,
  isChangedSinceSeen: false,
  seenAt: null,
});

const DETAIL: StaffKitchenDetail = leaky({
  id: "kitchenid000000000001",
  name: "Bucataria",
  revision: "7",
  isChangedSinceSeen: false,
  sentTotal: null,
  design: KITCHEN_L_DESIGN,
  isSent: true,
  isHidden: true,
  sentAt: WHEN,
  updatedAt: WHEN,
  client: CLIENT,
  request: leaky({ reference: "LM-2026-0042", sentAt: WHEN }),
  asSent: KITCHEN_L_DESIGN,
  status: leaky({
    value: "contacted" as const,
    change: leaky({ by: STAFF_PERSON, at: WHEN }),
  }),
  notes: [
    leaky({
      id: "noteid00000000000001",
      text: "Suna marti",
      createdAt: WHEN,
      author: STAFF_PERSON,
    }),
  ],
  notesTruncated: false,
});

const ESTIMATES: StaffKitchenEstimatesWire = {
  sentEstimate: { totalMinor: 1_234_500, currency: "MDL" },
  currentEstimate: { totalMinor: 1_300_000, currency: "MDL" },
};

const THUMBNAIL_MEMBERS = [
  "columnExtents",
  "emptyColumns",
  "placements",
  "room",
  "settings",
];

function firstNoteOf(detail: StaffKitchenDetail): StaffKitchenNote {
  const [note] = detail.notes;
  if (note === undefined) throw new Error("the fixture holds no note");
  return note;
}

async function bodyOf(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

function keysOf(value: unknown): string[] {
  return Object.keys(value as object).sort();
}

describe("the list answer", () => {
  const page: StaffKitchenPage = {
    total: 1,
    changedCount: 4,
    page: 1,
    pageSize: 20,
    kitchens: [LISTED],
  };

  it("names its members at every level and leaves out every member the contract does not name", async () => {
    const body = await bodyOf(staffKitchenListResponse(page));
    const [row] = body.kitchens as Record<string, unknown>[];

    expect(keysOf(body)).toEqual([
      "changedCount",
      "kitchens",
      "page",
      "pageSize",
      "total",
    ]);
    expect(keysOf(row)).toEqual([
      "changedAfterSeen",
      "client",
      "design",
      "id",
      "isHidden",
      "isSent",
      "name",
      "requestStatus",
      "seenAt",
      "sentAt",
      "updatedAt",
    ]);
    expect(keysOf(row?.client)).toEqual(["email", "name", "phone"]);
    expect(JSON.stringify(body)).not.toContain("LEAK");
  });

  it("sends the menu's count as the page's own and each row's mark from the reader's judgement, never judged here", async () => {
    const body = await bodyOf(
      staffKitchenListResponse({
        ...page,
        kitchens: [LISTED, { ...LISTED, isChangedSinceSeen: true }],
      }),
    );

    expect(body.changedCount).toBe(4);
    expect(
      (body.kitchens as { changedAfterSeen: boolean }[]).map(
        (row) => row.changedAfterSeen,
      ),
    ).toEqual([false, true]);
  });

  it("sends when staff last saw each row as ISO text, and null where no mark counts", async () => {
    const body = await bodyOf(
      staffKitchenListResponse({
        ...page,
        kitchens: [LISTED, { ...LISTED, seenAt: WHEN }],
      }),
    );

    expect(
      (body.kitchens as { seenAt: unknown }[]).map((row) => row.seenAt),
    ).toEqual([null, WHEN.toISOString()]);
  });

  it("sends the thumbnail the room, the cabinets and the colour of the document, and not its identity or timestamps", async () => {
    const body = await bodyOf(staffKitchenListResponse(page));
    const [row] = body.kitchens as { design: Record<string, unknown> }[];

    const sent = keysOf(row?.design);
    expect(sent).toEqual(expect.arrayContaining(["placements", "room"]));
    expect(THUMBNAIL_MEMBERS).toEqual(expect.arrayContaining(sent));
    expect(row?.design).not.toHaveProperty("presetId");
    expect(row?.design).not.toHaveProperty("createdAt");
    expect(row?.design).not.toHaveProperty("updatedAt");
  });

  it("sends a null design and a null client as null", async () => {
    const body = await bodyOf(
      staffKitchenListResponse({
        ...page,
        kitchens: [{ ...LISTED, design: null, client: null, sentAt: null }],
      }),
    );

    expect(body.kitchens).toEqual([
      expect.objectContaining({ design: null, client: null, sentAt: null }),
    ]);
  });

  it("answers instants as ISO text and is private, no-store", async () => {
    const response = staffKitchenListResponse(page);

    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(
      ((await bodyOf(response)).kitchens as { updatedAt: string }[])[0]
        ?.updatedAt,
    ).toBe(WHEN.toISOString());
  });
});

describe("the kitchen answer", () => {
  it("names its members at every level, keeps the e-mails staff are meant to see, and leaves out every other member", async () => {
    const body = await bodyOf(staffKitchenResponse(DETAIL, ESTIMATES));
    const { kitchen, client, request, status, notes } = body as {
      kitchen: unknown;
      client: unknown;
      request: unknown;
      status: { changedBy: unknown };
      notes: { author: unknown }[];
    };

    expect(keysOf(body)).toEqual([
      "changedAfterSeen",
      "client",
      "currentEstimate",
      "displayedRevision",
      "kitchen",
      "notes",
      "notesTruncated",
      "request",
      "sentEstimate",
      "status",
    ]);
    expect(keysOf(kitchen)).toEqual([
      "asSent",
      "design",
      "id",
      "isHidden",
      "isSent",
      "name",
      "sentAt",
      "updatedAt",
    ]);
    expect(keysOf(client)).toEqual(["email", "name", "phone"]);
    expect(keysOf(request)).toEqual(["reference", "sentAt"]);
    expect(keysOf(status)).toEqual(["changedAt", "changedBy", "value"]);
    expect(status.changedBy).toEqual({
      email: "staff@example.test",
      name: null,
    });
    expect(keysOf(notes[0])).toEqual(["author", "createdAt", "id", "text"]);
    expect(notes[0]?.author).toEqual({
      email: "staff@example.test",
      name: null,
    });
    expect(JSON.stringify(body)).not.toContain("LEAK");
  });

  it("sends a status nobody has changed with no author and no instant", async () => {
    const body = await bodyOf(
      staffKitchenResponse(
        {
          ...DETAIL,
          status: { value: "new", change: null },
        },
        ESTIMATES,
      ),
    );

    expect(body.status).toEqual({
      value: "new",
      changedBy: null,
      changedAt: null,
    });
  });

  it("sends an author who no longer resolves with a null e-mail", async () => {
    const body = await bodyOf(
      staffKitchenResponse(
        {
          ...DETAIL,
          notes: [
            {
              ...firstNoteOf(DETAIL),
              author: { id: "gone", email: null, name: null },
            },
          ],
        },
        ESTIMATES,
      ),
    );

    expect((body.notes as { author: unknown }[])[0]?.author).toEqual({
      email: null,
      name: null,
    });
  });
});

describe("the kitchen answer's mark, revision and estimates", () => {
  it("sends the displayed revision as the reader read it, the mark as the reader judged it, and the estimates as given", async () => {
    const body = await bodyOf(
      staffKitchenResponse({ ...DETAIL, isChangedSinceSeen: true }, ESTIMATES),
    );

    expect(body).toMatchObject({
      changedAfterSeen: true,
      displayedRevision: "7",
      ...ESTIMATES,
    });
  });

  it("sends a refused current estimate as its code and a missing sent estimate as null", async () => {
    const estimates: StaffKitchenEstimatesWire = {
      sentEstimate: null,
      currentEstimate: { refused: "REPLACEMENT_REQUIRED" },
    };

    const body = await bodyOf(staffKitchenResponse(DETAIL, estimates));

    expect(body.sentEstimate).toBeNull();
    expect(body.currentEstimate).toEqual({ refused: "REPLACEMENT_REQUIRED" });
  });
});

describe("the seen answer and the changed count answer", () => {
  it.each([true, false])(
    "sends the store's flag %s as the one member of the seen answer",
    async (changedAfterSeen) => {
      const response = staffSeenMarkedResponse(changedAfterSeen);

      expect(response.status).toBe(200);
      expect(await bodyOf(response)).toEqual({ changedAfterSeen });
    },
  );

  it("sends the count as the one member of its answer, private and no-store", async () => {
    const response = staffChangedCountResponse(9);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await bodyOf(response)).toEqual({ count: 9 });
  });
});

describe("the refused query answer", () => {
  it("names the member and the code of each issue and nothing the person typed", async () => {
    const response = staffInvalidQueryResponse([
      {
        field: "q",
        code: "TOO_LONG",
        ...{ value: "LEAK typed text" },
      } as never,
    ]);

    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const expected = {
      status: "invalid-input",
      issues: [{ field: "q", code: "TOO_LONG" }],
    } satisfies StaffInvalidQueryWire;
    expect(await bodyOf(response)).toEqual(expected);
  });
});
