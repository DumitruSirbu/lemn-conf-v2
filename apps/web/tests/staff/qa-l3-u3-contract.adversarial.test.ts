// The staff kitchen's answer, from the route that writes it to the page that reads it (wave L3-U3). The two ends are written
// apart and tested apart; this joins them: whatever shape of kitchen the reader hands the route's builder, the body it makes
// is one the page's reader accepts, and the page's reader gets back the facts the reader started from, member by member.
import { KITCHEN_L_DESIGN } from "@lemnaria/configurator-domain";
import type { StaffKitchenDetail } from "@lemnaria/persistence";
import { describe, expect, it } from "vitest";

import { staffKitchenResponse } from "@/lib/server/staff/staff-responses";
import { staffKitchenFrom } from "@/staff/use-staff-kitchen";

const KITCHEN_ID = "kitchenid000000000001";
const SENT = new Date("2026-10-17T11:08:00.000Z");
const UPDATED = new Date("2026-10-19T09:00:00.000Z");
const CHANGED = new Date("2026-10-18T11:22:00.000Z");
const NOTES_AT_THE_LIMIT = 100;

const STAFF = {
  id: "staff-account-id-0001",
  email: "mihai@lemnaria.md",
  name: "Mihai Rusu",
};
const GONE = { id: "staff-account-id-0002", email: null, name: null };
const CLIENT = {
  id: "client-account-id-001",
  email: "ana@mail.md",
  name: "Ana Popescu",
  phone: "078900555",
};
const BARE_CLIENT = {
  id: "client-account-id-002",
  email: "bare@mail.md",
  name: null,
  phone: null,
};

type Detail = StaffKitchenDetail;
const VARIANTS: readonly (readonly [string, Partial<Detail>])[] = [
  ["a sent kitchen with everything", {}],
  [
    "a draft",
    { isSent: false, sentAt: null, request: null, status: null, asSent: null },
  ],
  ["a hidden kitchen", { isHidden: true }],
  ["a kitchen with no account", { client: null }],
  ["a client with no name and no phone", { client: BARE_CLIENT }],
  ["a document this build cannot read", { design: null, asSent: null }],
  ["a copy as sent this build cannot read", { asSent: null }],
  ["a kitchen nobody named", { name: null }],
  ["no request", { request: null }],
  ["a status nobody saved", { status: { value: "new", change: null } }],
  [
    "a status somebody saved",
    { status: { value: "closed", change: { by: STAFF, at: CHANGED } } },
  ],
  [
    "a status saved by an account that no longer resolves",
    { status: { value: "offer-sent", change: { by: GONE, at: CHANGED } } },
  ],
  [
    "a status this build does not name",
    { status: { value: "unrecognised", change: { by: STAFF, at: CHANGED } } },
  ],
  ["notes, the newest hundred of more", { notesTruncated: true }],
];

function detailWith(overrides: Partial<Detail>): Detail {
  const notes =
    overrides.notesTruncated === true
      ? Array.from({ length: NOTES_AT_THE_LIMIT }, (_, index) => ({
          id: `note-id-${String(index).padStart(11, "0")}`,
          text: `Nota ${String(index)}`,
          createdAt: new Date(CHANGED.getTime() - index * 60_000),
          author: index % 2 === 0 ? STAFF : GONE,
        }))
      : [];
  return {
    id: KITCHEN_ID,
    name: "Casa din Orhei",
    design: KITCHEN_L_DESIGN,
    asSent: KITCHEN_L_DESIGN,
    isSent: true,
    isHidden: false,
    sentAt: SENT,
    updatedAt: UPDATED,
    client: CLIENT,
    request: { reference: "LEM-2026-0417", sentAt: SENT },
    status: { value: "contacted", change: { by: STAFF, at: CHANGED } },
    notes,
    notesTruncated: false,
    ...overrides,
  };
}

async function wireOf(detail: Detail): Promise<unknown> {
  const response = staffKitchenResponse(detail);
  expect(response.status).toBe(200);
  return response.json();
}

describe.each(VARIANTS)("the route's answer for %s", (_, overrides) => {
  const detail = detailWith(overrides);

  it("is read by the page's reader", async () => {
    const kitchen = staffKitchenFrom(await wireOf(detail));

    expect(kitchen).toBeDefined();
  });

  it("is read back as the facts the route started from", async () => {
    const kitchen = staffKitchenFrom(await wireOf(detail));

    expect(kitchen?.kitchen).toMatchObject({
      id: detail.id,
      name: detail.name,
      isSent: detail.isSent,
      isHidden: detail.isHidden,
      sentAt: detail.sentAt?.toISOString() ?? null,
      updatedAt: detail.updatedAt.toISOString(),
    });
    expect(kitchen?.kitchen.design).toEqual(detail.design);
    expect(kitchen?.kitchen.asSent).toEqual(detail.asSent);
    expect(kitchen?.client).toEqual(
      detail.client === null
        ? null
        : {
            email: detail.client.email,
            name: detail.client.name,
            phone: detail.client.phone,
          },
    );
    expect(kitchen?.request).toEqual(
      detail.request === null
        ? null
        : {
            reference: detail.request.reference,
            sentAt: detail.request.sentAt.toISOString(),
          },
    );
    expect(kitchen?.status).toEqual(
      detail.status === null
        ? null
        : {
            value: detail.status.value,
            changedBy:
              detail.status.change === null
                ? null
                : {
                    email: detail.status.change.by.email,
                    name: detail.status.change.by.name,
                  },
            changedAt: detail.status.change?.at.toISOString() ?? null,
          },
    );
    expect(kitchen?.notes.map(({ id, text }) => [id, text])).toEqual(
      detail.notes.map(({ id, text }) => [id, text]),
    );
    expect(kitchen?.notesTruncated).toBe(detail.notesTruncated);
  });

  it("carries no account id, hash or other member the page's reader does not name", async () => {
    const body = JSON.stringify(await wireOf(detail));

    expect(body).not.toContain(CLIENT.id);
    expect(body).not.toContain(BARE_CLIENT.id);
    expect(body).not.toContain(STAFF.id);
    expect(body).not.toContain(GONE.id);
  });
});
