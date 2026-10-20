// The one request the undo page makes: where it goes and what it carries (Lot 2 plan 14.3.3). The token and the new
// password are in the JSON body of a POST to the revert route and in no address, and the answer is classified by the
// flow's own rule.
import { describe, expect, it, vi } from "vitest";

import {
  sendSignedInRequest,
  type FetchAccount,
} from "@/account/send-account-request";

const TOKEN = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde";
const NEW_PASSWORD = "a brand new passphrase";

function answering(status: number, body: unknown): FetchAccount {
  return vi.fn(() =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
    ),
  );
}

describe("the undo request", () => {
  it("is a JSON POST to the revert route, with the token and the new password in the body only", async () => {
    const fetchAccount = answering(200, { status: "email-reverted" });

    const outcome = await sendSignedInRequest(
      {
        flow: "revert-email",
        body: { token: TOKEN, newPassword: NEW_PASSWORD },
      },
      fetchAccount,
    );

    expect(outcome).toEqual({ kind: "email-reverted" });
    expect(fetchAccount).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(fetchAccount).mock.calls[0] ?? [];
    expect(url).toBe("/api/account/email-change/revert");
    expect(url).not.toContain(TOKEN);
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual({ "content-type": "application/json" });
    expect(init?.referrerPolicy).toBe("same-origin");
    expect(JSON.parse(init?.body as string)).toEqual({
      token: TOKEN,
      newPassword: NEW_PASSWORD,
    });
  });

  it("classifies a refused link by the flow's own rule", async () => {
    const outcome = await sendSignedInRequest(
      {
        flow: "revert-email",
        body: { token: TOKEN, newPassword: NEW_PASSWORD },
      },
      answering(400, { status: "link-invalid" }),
    );

    expect(outcome).toEqual({ kind: "link-invalid" });
  });

  it("tells a request that got no answer as `unanswered`, not as a throw", async () => {
    const outcome = await sendSignedInRequest(
      {
        flow: "revert-email",
        body: { token: TOKEN, newPassword: NEW_PASSWORD },
      },
      () => Promise.reject(new Error("offline")),
    );

    expect(outcome).toEqual({ kind: "unanswered" });
  });
});
