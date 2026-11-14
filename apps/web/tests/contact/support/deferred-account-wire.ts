// A `fetch` for a contact page whose account reads can be held, answered out of order, or answered with raw text. The
// shared harness answers both reads at once, which cannot express a slow, late or reordered read; this can.
import { vi } from "vitest";

import { act } from "react";

import { CONTACT_SUBMISSIONS_ENDPOINT } from "@/contact/send-contact-request";

import {
  PROFILE_URL,
  responseOf,
  SESSION_URL,
  type ServerAnswer,
} from "../contact-screen-harness";

/** Text that is not what the route would send: an HTML page, an empty body, a number. */
export interface RawAnswer {
  readonly status: number;
  readonly text: string;
}

export type Reply = ServerAnswer | RawAnswer;
export type Mode = Reply | "hold";

interface Held {
  readonly resolve: (response: Response) => void;
  readonly reject: (reason: unknown) => void;
}

export class DeferredAccountWire {
  session: Mode = { status: 200, body: { state: "anonymous" } };
  profile: Mode = { status: 401, body: { status: "unauthenticated" } };
  /** Every URL requested, in order, the contact endpoint included. */
  readonly requested: string[] = [];
  readonly contactBodies: Record<string, unknown>[] = [];
  private readonly heldByUrl = new Map<string, Held[]>();

  install(): void {
    vi.stubGlobal("fetch", (url: string, init?: RequestInit) => {
      this.requested.push(url);
      if (url === SESSION_URL) return this.answerRead(this.session, url);
      if (url === PROFILE_URL) return this.answerRead(this.profile, url);
      if (
        url === CONTACT_SUBMISSIONS_ENDPOINT &&
        typeof init?.body === "string"
      ) {
        this.contactBodies.push(
          JSON.parse(init.body) as Record<string, unknown>,
        );
      }
      return this.hold(url);
    });
  }

  countOf(url: string): number {
    return this.requested.filter((requested) => requested === url).length;
  }

  heldCount(url: string): number {
    return this.heldByUrl.get(url)?.length ?? 0;
  }

  /** Answers a request held for `url`; the oldest unless `which` says the newest. */
  async answerHeld(
    url: string,
    reply: Reply,
    which: "oldest" | "newest" = "oldest",
  ): Promise<void> {
    const held = this.heldByUrl.get(url) ?? [];
    const target = which === "oldest" ? held.shift() : held.pop();
    if (target === undefined) throw new Error(`nothing is held for ${url}`);
    await act(async () => {
      settleHeld(target, reply);
      await macrotask();
    });
  }

  async answerContact(reply: Reply): Promise<void> {
    await this.answerHeld(CONTACT_SUBMISSIONS_ENDPOINT, reply);
  }

  private answerRead(mode: Mode, url: string): Promise<Response> {
    if (mode === "hold") return this.hold(url);
    return new Promise<Response>((resolve, reject) => {
      settleHeld({ resolve, reject }, mode);
    });
  }

  private hold(url: string): Promise<Response> {
    return new Promise<Response>((resolve, reject) => {
      const held = this.heldByUrl.get(url) ?? [];
      held.push({ resolve, reject });
      this.heldByUrl.set(url, held);
    });
  }
}

function settleHeld(held: Held, reply: Reply): void {
  if (reply === "network-failure") {
    held.reject(new TypeError("Failed to fetch"));
    return;
  }
  const text = "text" in reply ? reply.text : JSON.stringify(reply.body);
  held.resolve(responseOf(reply.status, text));
}

function macrotask(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

/** Lets the reads the page made, and the reads they led to, settle: a session read is followed by a profile read. */
export async function settleChainedReads(): Promise<void> {
  for (let round = 0; round < 3; round += 1) {
    await act(async () => {
      await macrotask();
    });
  }
}
