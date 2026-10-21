// The three requests the staff kitchen page makes besides reading (Lot 3 wave L3-U4): where each goes, how, and what it
// carries. The note's text is in the JSON body of a POST and in no address; the status is a PUT; the unhide sends an empty
// JSON body. An id that is not a design id is never put in an address, and nothing is sent for it.
import { describe, expect, it, vi } from "vitest";

import {
  sendSignedInRequest,
  type FetchAccount,
} from "@/account/send-account-request";

const KITCHEN = "k00000000000000000001";

function answering(status: number, body?: unknown): FetchAccount {
  return vi.fn(() =>
    Promise.resolve(
      new Response(body === undefined ? null : JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
    ),
  );
}

function sent(fetchAccount: FetchAccount): { url: string; init: RequestInit } {
  const [url, init] = vi.mocked(fetchAccount).mock.calls[0] ?? [];
  return { url: url ?? "", init: init ?? {} };
}

describe("the staff note request", () => {
  it("is a JSON POST to the kitchen's notes route, with the text in the body only", async () => {
    const fetchAccount = answering(201, {
      note: {
        id: "n1",
        text: "Am sunat",
        createdAt: "2026-10-19T11:41:00.000Z",
        author: { email: "a@lemnaria.md", name: null },
      },
    });

    const outcome = await sendSignedInRequest(
      { flow: "staff-note", id: KITCHEN, text: "Am sunat" },
      fetchAccount,
    );

    expect(outcome.kind).toBe("note-added");
    const { url, init } = sent(fetchAccount);
    expect(url).toBe(`/api/staff/kitchens/${KITCHEN}/notes`);
    expect(url).not.toContain("Am%20sunat");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "content-type": "application/json" });
    expect(init.referrerPolicy).toBe("same-origin");
    expect(JSON.parse(init.body as string)).toEqual({ text: "Am sunat" });
  });
});

describe("the staff status request", () => {
  it("is a JSON PUT to the kitchen's status route, with the status in the body only", async () => {
    const fetchAccount = answering(200, {
      status: "closed",
      changedBy: null,
      changedAt: null,
    });

    const outcome = await sendSignedInRequest(
      { flow: "staff-status", id: KITCHEN, status: "closed" },
      fetchAccount,
    );

    expect(outcome.kind).toBe("status-saved");
    const { url, init } = sent(fetchAccount);
    expect(url).toBe(`/api/staff/kitchens/${KITCHEN}/status`);
    expect(init.method).toBe("PUT");
    expect(init.headers).toEqual({ "content-type": "application/json" });
    expect(init.referrerPolicy).toBe("same-origin");
    expect(JSON.parse(init.body as string)).toEqual({ status: "closed" });
  });
});

describe("the staff unhide request", () => {
  it("is a JSON POST with an empty object to the kitchen's unhide route", async () => {
    const fetchAccount = answering(204);

    const outcome = await sendSignedInRequest(
      { flow: "staff-unhide", id: KITCHEN },
      fetchAccount,
    );

    expect(outcome.kind).toBe("succeeded");
    const { url, init } = sent(fetchAccount);
    expect(url).toBe(`/api/staff/kitchens/${KITCHEN}/unhide`);
    expect(init.method).toBe("POST");
    expect(init.referrerPolicy).toBe("same-origin");
    expect(JSON.parse(init.body as string)).toEqual({});
  });
});

describe("an id that names no kitchen", () => {
  it.each([
    "../../etc",
    "short",
    `${KITCHEN}/notes`,
    `${KITCHEN}?x=1`,
    `${KITCHEN}\n`,
    "",
  ])("sends nothing for %j and tells it as the one refusal", async (id) => {
    for (const request of [
      { flow: "staff-note", id, text: "x" },
      { flow: "staff-status", id, status: "new" },
      { flow: "staff-unhide", id },
    ] as const) {
      const fetchAccount = answering(204);

      const outcome = await sendSignedInRequest(request, fetchAccount);

      expect(outcome.kind).toBe("kitchen-unavailable");
      expect(fetchAccount).not.toHaveBeenCalled();
    }
  });
});

describe("a request that got no answer", () => {
  it("is `unanswered` and not a throw, for each write", async () => {
    const offline: FetchAccount = () =>
      Promise.reject(new TypeError("offline"));

    for (const request of [
      { flow: "staff-note", id: KITCHEN, text: "x" },
      { flow: "staff-status", id: KITCHEN, status: "new" },
      { flow: "staff-unhide", id: KITCHEN },
    ] as const) {
      expect((await sendSignedInRequest(request, offline)).kind).toBe(
        "unanswered",
      );
    }
  });
});
