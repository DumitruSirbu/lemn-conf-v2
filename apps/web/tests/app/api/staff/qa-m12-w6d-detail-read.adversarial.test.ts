// Adversarial QA of M12 wave W6d at the routes: the staff detail read carries the stored per-cabinet amounts and the
// profile's postal address, and nothing else carries either (ADR 0185 decisions 4 and 7, Security read S1, S5;
// plan W6d-1, W6d-1b, W6d-3, W6d-4). The implementer's route tests assert the address on the detail and its absence
// from the list and the 3D bodies; the probes here are the places they do not look (the audit rows, the console, the
// account events, a search that names only the address, a draft) and the whole path from a hostile stored snapshot to
// the amount a row draws.
import { KITCHEN_L_DESIGN } from "@lemnaria/configurator-domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";
import { priceFloorOf } from "@/price/price-book-root";
import { describeLineAmount } from "@/price/starting-price";
import { describeCabinetList } from "@/staff/staff-cabinet-list-model";
import { staffKitchenFrom } from "@/staff/use-staff-kitchen";

import {
  accountRequest,
  aDesignId,
  captureConsole,
  freshAccountWorld,
  jsonOf,
} from "../../../support/account-world";
import { contentFor } from "../../../support/catalogues";
import { SAMPLE_PRICE_ROOT } from "../../../support/sample-price-root";
import {
  SENT_AT,
  freshStaffWorld,
  plantClient,
  plantKitchen,
  signedInAs,
  type StaffWorld,
} from "../../../support/staff-world";
import roMessages from "../../../../src/messages/ro.json";

vi.mock("@/lib/server/account/session-store-instance", () =>
  import("../../../support/account-world").then((world) =>
    world.sessionStoreModule(),
  ),
);
vi.mock("@/lib/server/staff/staff-kitchen-reader-instance", () =>
  import("../../../support/staff-world").then((world) =>
    world.staffKitchenReaderModule(),
  ),
);
vi.mock("@/lib/server/staff/staff-audit-store-instance", () =>
  import("../../../support/staff-world").then((world) =>
    world.staffAuditStoreModule(),
  ),
);

const { GET: GET_DETAIL } = await import("@/app/api/staff/kitchens/[id]/route");
const { GET: GET_3D } = await import("@/app/api/staff/kitchens/[id]/3d/route");
const { GET: GET_LIST } = await import("@/app/api/staff/kitchens/route");

const RLO = String.fromCodePoint(0x202e);
const LRI = String.fromCodePoint(0x2066);
const PDI = String.fromCodePoint(0x2069);
const ZWJ = String.fromCodePoint(0x200d);
const COMBINING_ACUTE = String.fromCodePoint(0x301);
const ASTRAL = String.fromCodePoint(0x1f3e0);
const NOT_TRIMMED = `  Str. ${RLO}Pacii${PDI} 1 ${LRI}ap. 2${PDI} ${ASTRAL}${ZWJ}e${COMBINING_ACUTE}  `;
const UNIQUE = "ZQW-w6d-only-the-address-holds-this";
const UNIQUE_ADDRESS = `Strada ${UNIQUE} 9`;
const content = contentFor("ro", roMessages);

let staffWorld: StaffWorld;
let console_: ReturnType<typeof captureConsole>;

beforeEach(() => {
  freshAccountWorld();
  staffWorld = freshStaffWorld();
  console_ = captureConsole();
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function requestOf(path: string, cookie: string) {
  return accountRequest(path, {
    cookie,
    headers: { "x-forwarded-for": "192.0.2.10" },
  });
}

async function operator() {
  const staff = await signedInAs({ role: "operator" }, "op@example.test");
  staffWorld.reader.plantAccount({
    id: staff.account.id,
    email: "op@example.test",
    name: "Operator",
    phone: null,
  });
  return staff;
}

function openDetail(id: string, cookie: string) {
  return GET_DETAIL(requestOf(`/api/staff/kitchens/${id}`, cookie), {
    params: Promise.resolve({ id }),
  });
}

function plantSentKitchen(options: {
  readonly address: string | null;
  readonly pricedLines?: unknown;
}) {
  const client = plantClient({ address: options.address });
  const kitchen = plantKitchen({
    accountId: client.id,
    design: KITCHEN_L_DESIGN,
  });
  const clientRequestId = aDesignId();
  staffWorld.reader.plantRequest({
    clientRequestId,
    designId: kitchen.id,
    reference: "LM-2026-0042",
    createdAt: SENT_AT,
    pricedTotal: { totalMinor: 5_000_000, currency: "MDL" },
    ...(options.pricedLines === undefined
      ? {}
      : { pricedLines: options.pricedLines }),
  });
  staffWorld.reader.plantSentCopy({
    clientRequestId,
    createdAt: SENT_AT,
    isRevoked: false,
    design: KITCHEN_L_DESIGN,
  });
  return { client, kitchen };
}

describe("the postal address on the detail read", () => {
  it("arrives exactly as stored, untrimmed, with bidi controls, joiners, combining marks and astral characters", async () => {
    const { session } = await operator();
    const { kitchen } = plantSentKitchen({ address: NOT_TRIMMED });

    const body = (await jsonOf(
      await openDetail(kitchen.id, session.cookie),
    )) as {
      client: { address: string };
    };

    expect(body.client.address).toBe(NOT_TRIMMED);
    expect(Array.from(body.client.address)).toEqual(Array.from(NOT_TRIMMED));
  });

  it("survives the page's own reading of the wire byte for byte, and is the client's alone", async () => {
    const { session } = await operator();
    const { kitchen } = plantSentKitchen({ address: NOT_TRIMMED });

    const wire = staffKitchenFrom(
      await jsonOf(await openDetail(kitchen.id, session.cookie)),
    );

    expect(wire?.client?.address).toBe(NOT_TRIMMED);
    expect(Object.keys(wire?.client ?? {}).sort()).toEqual([
      "address",
      "email",
      "name",
      "phone",
    ]);
  });

  it("is null for a profile that holds none, and a draft's detail carries it beside its empty lines", async () => {
    const { session } = await operator();
    const client = plantClient({ address: null });
    const withoutAddress = plantKitchen({ accountId: client.id });
    const owner = plantClient({ address: UNIQUE_ADDRESS });
    const draft = plantKitchen({ accountId: owner.id, isSent: false });

    const none = (await jsonOf(
      await openDetail(withoutAddress.id, session.cookie),
    )) as { client: { address: unknown } };
    const draftBody = (await jsonOf(
      await openDetail(draft.id, session.cookie),
    )) as {
      client: { address: unknown };
      sentCabinetLines: unknown;
      request: unknown;
      status: unknown;
    };

    expect(none.client.address).toBeNull();
    expect(draftBody.client.address).toBe(UNIQUE_ADDRESS);
    expect(draftBody.sentCabinetLines).toEqual([]);
    expect(draftBody.request).toBeNull();
    expect(draftBody.status).toBeNull();
  });

  it("is in no audit row, no console line and no account event that opening the kitchen leaves", async () => {
    const { session } = await operator();
    const { kitchen } = plantSentKitchen({
      address: UNIQUE_ADDRESS,
      pricedLines: [
        { kind: "cabinet", placementId: "base-1", amountMinor: 135_790_000 },
      ],
    });

    await openDetail(kitchen.id, session.cookie);
    await GET_3D(
      requestOf(`/api/staff/kitchens/${kitchen.id}/3d`, session.cookie),
      { params: Promise.resolve({ id: kitchen.id }) },
    );

    const rows = JSON.stringify(staffWorld.audit.heldEvents());
    const logged = console_.everything();
    for (const text of [rows, logged]) {
      expect(text).not.toContain(UNIQUE);
      expect(text).not.toContain("135790000");
      expect(text).not.toContain("135_790_000");
    }
    expect(staffWorld.audit.heldEvents().map((row) => row.action)).toEqual([
      "kitchen-opened",
      "kitchen-viewed-3d",
    ]);
  });

  it("is not on the 3D body, the list body, or a list a search names the address in, which finds nothing", async () => {
    const { session } = await operator();
    const { client, kitchen } = plantSentKitchen({ address: UNIQUE_ADDRESS });

    const threeD = await GET_3D(
      requestOf(`/api/staff/kitchens/${kitchen.id}/3d`, session.cookie),
      { params: Promise.resolve({ id: kitchen.id }) },
    );
    const everything = await GET_LIST(
      requestOf("/api/staff/kitchens", session.cookie),
    );
    const byAddress = await GET_LIST(
      requestOf(
        `/api/staff/kitchens?q=${encodeURIComponent(UNIQUE)}`,
        session.cookie,
      ),
    );

    expect(await threeD.text()).not.toContain(UNIQUE);
    const everythingBody = (await jsonOf(everything)) as {
      kitchens: { client: Record<string, unknown> | null }[];
    };
    expect(JSON.stringify(everythingBody)).not.toContain(UNIQUE);
    for (const row of everythingBody.kitchens) {
      expect(Object.keys(row.client ?? {})).not.toContain("address");
    }
    const found = (await jsonOf(byAddress)) as {
      total: number;
      kitchens: unknown[];
    };
    expect(found.total).toBe(0);
    expect(found.kitchens).toEqual([]);
    const control = (await jsonOf(
      await GET_LIST(
        requestOf(
          `/api/staff/kitchens?q=${encodeURIComponent(client.email)}`,
          session.cookie,
        ),
      ),
    )) as { total: number };
    expect(control.total).toBe(1);
  });
});

describe("the stored lines, from a hostile snapshot to the amount a row draws", () => {
  const FIRST = KITCHEN_L_DESIGN.placements[0]?.id ?? "";
  const SECOND = KITCHEN_L_DESIGN.placements[1]?.id ?? "";
  const THIRD = KITCHEN_L_DESIGN.placements[2]?.id ?? "";

  function drawnAmounts(
    wire: NonNullable<ReturnType<typeof staffKitchenFrom>>,
  ) {
    const list = describeCabinetList({
      shown: { design: KITCHEN_L_DESIGN, version: "sent" },
      other: undefined,
      content,
      priceBook: SAMPLE_PRICE_ROOT,
      sentLines: wire.sentCabinetLines,
    });
    if (list.kind !== "available") throw new Error("not listed");
    return new Map(
      list.groups
        .flatMap((group) => group.rows)
        .flatMap((row): [string, string][] =>
          row.amountText === undefined
            ? []
            : [[row.placementId, row.amountText]],
        ),
    );
  }

  it("draws the stored amounts of the readable cabinet lines only, whatever else the snapshot holds", async () => {
    const { session } = await operator();
    const { kitchen } = plantSentKitchen({
      address: null,
      pricedLines: [
        "junk",
        null,
        7,
        [{ kind: "cabinet", placementId: FIRST, amountMinor: 1 }],
        { kind: "depth", placementId: FIRST, amountMinor: 999_999_000 },
        { kind: "cabinet", placementId: FIRST, amountMinor: 654_320 },
        { kind: "cabinet", placementId: SECOND, amountMinor: -5 },
        { kind: "cabinet", placementId: THIRD, amountMinor: 1.5 },
        { kind: "cabinet", placementId: 12, amountMinor: 10_000 },
        { kind: "cabinet", amountMinor: 10_000 },
      ],
    });

    const wire = staffKitchenFrom(
      await jsonOf(await openDetail(kitchen.id, session.cookie)),
    );

    if (wire === undefined)
      throw new Error("the page could not read the answer");
    expect(wire.sentCabinetLines).toEqual([
      { placementId: FIRST, amountMinor: 654_320 },
    ]);
    expect([...drawnAmounts(wire).entries()]).toEqual([
      [FIRST, describeLineAmount(654_320)],
    ]);
  });

  it("is empty, and the page still reads, when the snapshot's lines are not an array", async () => {
    const { session } = await operator();
    for (const stored of [
      "cabinet",
      { kind: "cabinet", placementId: FIRST, amountMinor: 1 },
      12,
      null,
    ]) {
      const { kitchen } = plantSentKitchen({
        address: null,
        pricedLines: stored,
      });

      const wire = staffKitchenFrom(
        await jsonOf(await openDetail(kitchen.id, session.cookie)),
      );

      expect(wire?.sentCabinetLines, JSON.stringify(stored)).toEqual([]);
    }
  });

  it("leaves the sent total, the status and the audit row as they were for a kitchen whose lines are hostile", async () => {
    const { session } = await operator();
    const { kitchen } = plantSentKitchen({
      address: null,
      pricedLines: [{ kind: "cabinet", placementId: FIRST, amountMinor: 1 }],
    });

    await openDetail(kitchen.id, session.cookie);

    expect(staffWorld.audit.heldEvents()).toHaveLength(1);
    expect(staffWorld.audit.heldEvents()[0]).toMatchObject({
      action: "kitchen-opened",
      detail: null,
      designId: kitchen.id,
    });
  });
});

describe("a snapshot as the pricing writes it (the field names the statement and the reader depend on)", () => {
  it("is read back as the priced design's own cabinet lines, and a sent row draws what the same book prices today where that is not zero", async () => {
    const priced = priceFloorOf(SAMPLE_PRICE_ROOT, KITCHEN_L_DESIGN);
    if (priced === undefined)
      throw new Error("the sample book refused the kitchen");
    const stored = JSON.parse(JSON.stringify(priced.lines)) as unknown;
    const cabinetLines = priced.lines.filter((line) => line.kind === "cabinet");
    const { session } = await operator();
    const { kitchen } = plantSentKitchen({
      address: null,
      pricedLines: stored,
    });

    const wire = staffKitchenFrom(
      await jsonOf(await openDetail(kitchen.id, session.cookie)),
    );

    expect(cabinetLines.length).toBeGreaterThan(0);
    expect(wire?.sentCabinetLines).toEqual(
      cabinetLines.map(({ placementId, amountMinor }) => ({
        placementId,
        amountMinor,
      })),
    );
    const listOf = (version: "sent" | "current") => {
      const list = describeCabinetList({
        shown: { design: KITCHEN_L_DESIGN, version },
        other: undefined,
        content,
        priceBook: SAMPLE_PRICE_ROOT,
        sentLines: wire?.sentCabinetLines ?? [],
      });
      if (list.kind !== "available") throw new Error("not listed");
      return new Map(
        list.groups
          .flatMap((group) => group.rows)
          .map((row) => [row.placementId, row.amountText] as const),
      );
    };
    const sent = listOf("sent");
    const current = listOf("current");
    for (const { placementId, amountMinor } of cabinetLines) {
      if (amountMinor > 0) {
        expect(sent.get(placementId), placementId).toBe(
          describeLineAmount(amountMinor),
        );
        expect(sent.get(placementId), placementId).toBe(
          current.get(placementId),
        );
      } else {
        expect(sent.get(placementId), placementId).toBeUndefined();
      }
    }
  });
});
