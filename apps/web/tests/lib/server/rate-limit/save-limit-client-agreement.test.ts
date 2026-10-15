// The server's refusal of a save and the browser's reading of it are two modules that must agree on a code, a status
// and a window. The browser's side is the one the server imports, as for the mint, so the two cannot name different
// codes; what is held here is what no import can: that the browser's own window is the policy's, and that the wait the
// server tells is the wait the browser reads.
import { describe, expect, it } from "vitest";

import {
  SAVE_LIMIT_REACHED_CODE as CODE_THE_BROWSER_READS,
  SAVE_LIMIT_REACHED_STATUS,
  SAVE_WINDOW_SECONDS,
  saveWaitSecondsFrom,
} from "@/persistence/design-request-errors";
import {
  longestWaitSecondsOf,
  SAVE_BY_BLOCK_POLICY,
  SAVE_BY_CREDENTIAL_POLICY,
} from "@/lib/server/rate-limit/limit-policy";
import {
  LIMIT_REACHED_STATUS,
  SAVE_LIMIT_REACHED_CODE as CODE_THE_SERVER_SENDS,
  saveLimitReachedResponse,
} from "@/lib/server/rate-limit/rate-limited-response";

import { readSource } from "../server-source-support";

describe("a save's refusal, as the server tells it and the browser reads it", () => {
  it("sends the code the browser reads, with the status it reads, in the body of the answer", async () => {
    const response = saveLimitReachedResponse(60);

    expect(CODE_THE_SERVER_SENDS).toBe(CODE_THE_BROWSER_READS);
    expect(response.status).toBe(SAVE_LIMIT_REACHED_STATUS);
    expect(LIMIT_REACHED_STATUS).toBe(SAVE_LIMIT_REACHED_STATUS);
    expect(((await response.json()) as { code: string }).code).toBe(
      CODE_THE_BROWSER_READS,
    );
  });

  it("gives the browser's window the policy's own length, and a save's two policies one window", () => {
    expect(SAVE_WINDOW_SECONDS).toBe(
      longestWaitSecondsOf(SAVE_BY_BLOCK_POLICY.window),
    );
    expect(SAVE_BY_CREDENTIAL_POLICY.window).toEqual(
      SAVE_BY_BLOCK_POLICY.window,
    );
    expect(longestWaitSecondsOf(SAVE_BY_CREDENTIAL_POLICY.window)).toBe(
      SAVE_WINDOW_SECONDS,
    );
  });

  it("is read by the browser as the very wait the server tells, from one second to the whole window", () => {
    for (let wait = 1; wait <= SAVE_WINDOW_SECONDS; wait += 1) {
      const told = saveLimitReachedResponse(wait).headers.get("Retry-After");

      expect(saveWaitSecondsFrom(told)).toBe(wait);
    }
  });

  it("refuses to tell a wait the browser would not believe: past the window the server answers no refusal", () => {
    expect(() => saveLimitReachedResponse(SAVE_WINDOW_SECONDS + 1)).toThrow();
  });

  it("reads source: takes the save's code from the browser's module and writes no second copy", () => {
    const source = readSource("lib/server/rate-limit/rate-limited-response.ts");

    expect(source).toMatch(
      /SAVE_LIMIT_REACHED_CODE,?\s*\}\s*from\s*"@\/persistence\/design-request-errors"/,
    );
    expect(source).not.toMatch(/SAVE_LIMIT_REACHED_CODE\s*=/);
  });
});
