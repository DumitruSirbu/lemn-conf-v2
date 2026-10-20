import "server-only";

import { after } from "next/server";

import { reportAccountEvent } from "@/lib/server/account/account-log";
import { createCustomerMailSender } from "@/lib/server/mail/create-customer-mail-sender";
import type { CustomerMailSender } from "@/lib/server/mail/customer-mail";
import {
  accountMailKey,
  buildAccountMail,
  type AccountMailRequest,
} from "@/lib/server/mail/account-mail-messages";
import {
  readPublicOrigin,
  type PublicOrigin,
} from "@/lib/server/public-origin";
import { sha256Hex } from "@/lib/server/sha256-hex";

// Account mail leaves after the response (ADR 0172 decision 5), so whether a mail was sent is not visible in the
// response time. The sender comes from `createCustomerMailSender` alone and the link's origin from `readPublicOrigin`
// alone: nothing a request carried reaches either.

/** What is needed to write and send an account mail, made before any row is changed. */
export interface AccountMailReadiness {
  readonly sender: CustomerMailSender;
  readonly origin: PublicOrigin;
}

export type AccountMailPreparation =
  | { readonly kind: "ready"; readonly readiness: AccountMailReadiness }
  | { readonly kind: "unavailable" };

/** One message to one person. A token travels as its value, which this module hashes for the idempotency key. */
export type AccountMailOrder =
  | {
      readonly kind:
        | "confirm-email"
        | "reset-password"
        | "email-change"
        | "email-changed";
      readonly recipient: string;
      readonly locale: string;
      readonly token: string;
    }
  | {
      readonly kind: "email-change-requested";
      readonly recipient: string;
      readonly locale: string;
      /** The address that was typed, which the mail names. */
      readonly requestedAddress: string;
    }
  | {
      readonly kind:
        | "already-registered"
        | "password-changed"
        | "email-change-reverted"
        | "email-change-address-in-use";
      readonly recipient: string;
      readonly locale: string;
    };

/**
 * Asks, from the environment alone and so the same for every address, whether a mail could be written and sent. When
 * it could not, the flow answers unavailable before any row changes, since a link that cannot be written is not worth
 * a row. The event is written down by kind and outcome only.
 */
export function prepareAccountMail(): AccountMailPreparation {
  const origin = readPublicOrigin(process.env);
  const creation = createCustomerMailSender(process.env);
  if (origin.status === "unavailable" || creation.kind === "unavailable") {
    reportAccountEvent({ event: "mail", outcome: "unavailable" });
    return { kind: "unavailable" };
  }
  return {
    kind: "ready",
    readiness: { sender: creation.sender, origin: origin.origin },
  };
}

/**
 * Queues the mail to run after the response. Neither the job nor the queueing throws, so nothing here can change that
 * response: `after` itself throws when it cannot schedule, and by then the row it follows is already written.
 */
export function queueAccountMail(
  readiness: AccountMailReadiness,
  order: AccountMailOrder,
): void {
  try {
    after(() => sendAccountMail(readiness, order));
  } catch {
    reportAccountEvent({ event: "mail", outcome: "unavailable" });
  }
}

async function sendAccountMail(
  { sender, origin }: AccountMailReadiness,
  order: AccountMailOrder,
): Promise<void> {
  try {
    const request = requestOf(order, origin);
    const content = buildAccountMail(request);
    const key = accountMailKey(order.kind, tokenHashOf(order));
    const outcome = await sender.send({
      key,
      recipient: order.recipient,
      ...content,
    });
    reportAccountEvent({
      event: "mail",
      outcome: outcome.ok ? "succeeded" : "unavailable",
    });
  } catch {
    // Every failure of the builders (a malformed origin or token, a missing copy key, a malformed hash) lands here with
    // its message dropped: those messages are ours, but a job that throws would reach the framework's log.
    reportAccountEvent({ event: "mail", outcome: "unavailable" });
  }
}

function requestOf(
  order: AccountMailOrder,
  origin: PublicOrigin,
): AccountMailRequest {
  const { kind, locale } = order;
  switch (kind) {
    case "confirm-email":
    case "reset-password":
    case "email-change":
    case "email-changed":
      return { kind, locale, link: { origin, token: order.token } };
    case "already-registered":
    case "email-change-address-in-use":
      return { kind, locale, link: { origin } };
    case "email-change-requested":
      return {
        kind,
        locale,
        link: { origin },
        requestedAddress: order.requestedAddress,
      };
    case "password-changed":
    case "email-change-reverted":
      return { kind, locale };
  }
}

function tokenHashOf(order: AccountMailOrder): string | undefined {
  return "token" in order ? sha256Hex(order.token) : undefined;
}
