import "server-only";

import {
  SentKitchenViewRepositoryError,
  type SentKitchenViewRepository,
  type SentKitchenViewToRecord,
} from "@lemnaria/persistence";

import { NOTICE_LOCALE } from "@/lib/server/mail/lead-notification";
import type { PublicOriginOutcome } from "@/lib/server/public-origin";
import { createShareToken, type ByteSource } from "@/lib/server/share-token";

/** How long the notice waits for the view's row before it is sent without the link: well inside the mail's own bound,
 *  so the link never costs the notice. */
export const KITCHEN_LINK_DEADLINE_MS = 2000;

/** Why a notice carries no kitchen link: a closed list, so the line can never carry a thrown value. `origin-unset`
 *  stands for an origin that is unset or unusable alike, as the reader tells them apart by no value. */
export const KITCHEN_LINK_CAUSES = [
  "origin-unset",
  "record-failed",
  "deadline",
  "unexpected",
] as const;

export type KitchenLinkCause = (typeof KITCHEN_LINK_CAUSES)[number];

export type SentKitchenLink =
  | { readonly kind: "link"; readonly url: string }
  | { readonly kind: "unavailable"; readonly cause: KitchenLinkCause };

/** The kitchen as it is being sent, for the request it is sent for. */
export type SentKitchen = Omit<SentKitchenViewToRecord, "tokenHash">;

export interface SentKitchenLinkPorts {
  readonly origin: PublicOriginOutcome;
  readonly repository: SentKitchenViewRepository;
  /** Defaults to `KITCHEN_LINK_DEADLINE_MS`. */
  readonly deadlineMs?: number;
  /** Defaults to the CSPRNG; a test hands in a fixed sequence to know the token. */
  readonly drawBytes?: ByteSource;
}

/**
 * A fresh view-only link to the kitchen as sent: a new token each call, only its hash stored, and the link answered
 * only when the row is this request's and was recorded in time. Anything else is `unavailable` with its cause, written
 * once per process and cause. It never throws, and nothing of the token, hash, request, origin or document is logged.
 * A deadline stops the wait, not the statement: a row recorded late is held by no notice.
 */
export async function mintSentKitchenLink(
  kitchen: SentKitchen,
  ports: SentKitchenLinkPorts,
): Promise<SentKitchenLink> {
  try {
    if (ports.origin.status !== "configured")
      return unavailable("origin-unset");
    const { token, hash } = createShareToken(ports.drawBytes);
    const recording = await beforeDeadline(
      ports.repository.record({ ...kitchen, tokenHash: hash }),
      ports.deadlineMs ?? KITCHEN_LINK_DEADLINE_MS,
    );
    if (recording !== "recorded") return unavailable("record-failed");
    return { kind: "link", url: kitchenUrlOf(ports.origin.origin, token) };
  } catch (failure) {
    return unavailable(causeOf(failure));
  }
}

function kitchenUrlOf(origin: string, token: string): string {
  return `${origin}/${NOTICE_LOCALE}/s/${token}`;
}

class RecordDeadlineExceeded extends Error {}

/** The record's own outcome if it comes in time, else a rejection; the timer is cleared whichever side wins. */
export async function beforeDeadline<Answer>(
  pending: Promise<Answer>,
  deadlineMs: number,
): Promise<Answer> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new RecordDeadlineExceeded());
    }, deadlineMs);
  });
  try {
    return await Promise.race([pending, deadline]);
  } finally {
    clearTimeout(timer);
  }
}

function causeOf(failure: unknown): KitchenLinkCause {
  if (failure instanceof RecordDeadlineExceeded) return "deadline";
  if (failure instanceof SentKitchenViewRepositoryError) return "record-failed";
  return "unexpected";
}

function unavailable(cause: KitchenLinkCause): SentKitchenLink {
  reportKitchenLinkUnavailable(cause);
  return { kind: "unavailable", cause };
}

/** Grepped for in a platform log view, so it is one literal. */
const KITCHEN_LINK_LABEL = "[sent-kitchen-link]";
const UNAVAILABLE_EVENT = "sent-kitchen-link-unavailable";

const causesWritten = new Set<KitchenLinkCause>();

/** Written once per process and cause, so a flood buys one write. Only this module names a cause, and only from the
 *  list. */
function reportKitchenLinkUnavailable(cause: KitchenLinkCause): void {
  if (causesWritten.has(cause)) return;
  causesWritten.add(cause);
  writeError({ event: UNAVAILABLE_EVENT, cause });
}

/** The write may not throw: the notice must still be sent. */
function writeError(line: Readonly<Record<string, string>>): void {
  try {
    console.error(KITCHEN_LINK_LABEL, JSON.stringify(line));
  } catch {
    // Nothing to fall back to, and nothing may escape.
  }
}
