import "server-only";

import {
  buildDigestModel,
  chisinauDayKey,
  type DigestKitchenInput,
  type DigestModel,
} from "@lemnaria/configurator-domain";
import type {
  DigestedKitchen,
  DigestEligibleKitchen,
  KitchenChangeStore,
} from "@lemnaria/persistence";

import type { StaffChangeDigestCopy } from "@/i18n/content";
import type { MailSenderCreation } from "@/lib/server/mail/create-mail-sender";
import type {
  MailFailureKind,
  MailMessage,
  MailSender,
} from "@/lib/server/mail/mail-sender";
import {
  composeBoundedStaffChangeDigest,
  type StaffChangeDigestInput,
} from "@/lib/server/mail/staff-change-digest";
import type { ReadPublicOriginOutcome } from "@/lib/server/public-origin";

/** Stable, so a status monitor and a log search find the same failure. Never an exception's message. */
export const DIGEST_FAILURE_CODES = [
  "DIGEST_MAIL_UNAVAILABLE",
  "DIGEST_ORIGIN_UNAVAILABLE",
  "DIGEST_STORE_UNAVAILABLE",
  "DIGEST_CLAIM_FAILED",
  "DIGEST_LIST_FAILED",
  "DIGEST_COMPOSE_FAILED",
  "DIGEST_ROWS_MALFORMED",
  "DIGEST_SEND_FAILED",
  "DIGEST_RECORD_FAILED",
] as const;
export type DigestFailureCode = (typeof DIGEST_FAILURE_CODES)[number];

export type StaffChangeDigestOutcome =
  | {
      readonly status: "sent";
      readonly kitchenCount: number;
      /** Present only when rows were left for the next e-mail because the message was full. */
      readonly waitingCount?: number;
      /** Present only when rows were left out for lack of a customer name or reference (they stay eligible). */
      readonly skippedCount?: number;
    }
  | { readonly status: "nothing-to-send" }
  | { readonly status: "already-claimed" }
  | {
      readonly status: "failed";
      readonly errorCode: DigestFailureCode;
      /** From the mail port's closed list, when the send was refused. */
      readonly mailFailure?: MailFailureKind;
    };

/** Everything the run touches, so a test hands it fakes and production hands it the real ones. */
export interface StaffChangeDigestPorts {
  /** Opened inside the run, so a store that cannot be made is a failure with a code and not an unhandled throw. */
  readonly openStore: () => KitchenChangeStore;
  readonly now: () => Date;
  readonly createSender: () => MailSenderCreation;
  readonly readPublicOrigin: () => ReadPublicOriginOutcome;
  readonly copy: () => StaffChangeDigestCopy;
}

/**
 * One day's digest (ADR 0178 A-13). The sender, the origin and the copy are resolved before the day is claimed, so a missing
 * configuration does not use the day up. The claim comes before the send, and the entries are written only after a
 * send the mail port accepted, so a refused send loses the day and its kitchens stay eligible for the next one. The
 * run reads one instant, takes no input from a request, and writes no staff audit row (it has no actor).
 *
 * The message lists as many kitchens as its size budget holds, latest change first, and entries are recorded for
 * exactly those, so the rest stay eligible. A row that cannot be described (no customer name or reference, an instant
 * that is not one) is left out and stays eligible; it never stops the others, and a day of nothing but such rows
 * answers `DIGEST_ROWS_MALFORMED`.
 */
export async function runStaffChangeDigest(
  ports: StaffChangeDigestPorts,
): Promise<StaffChangeDigestOutcome> {
  const now = ports.now();
  const creation = await attempt("DIGEST_MAIL_UNAVAILABLE", () =>
    Promise.resolve(ports.createSender()),
  );
  if (creation.kind === "failure") return creation.outcome;
  if (creation.value.kind === "unavailable") {
    return failed("DIGEST_MAIL_UNAVAILABLE");
  }
  const origin = await attempt("DIGEST_ORIGIN_UNAVAILABLE", () =>
    Promise.resolve(ports.readPublicOrigin()),
  );
  if (origin.kind === "failure") return origin.outcome;
  if (origin.value.status === "unavailable") {
    return failed("DIGEST_ORIGIN_UNAVAILABLE");
  }

  const copy = await attempt("DIGEST_COMPOSE_FAILED", () =>
    Promise.resolve(ports.copy()),
  );
  if (copy.kind === "failure") return copy.outcome;

  const opened = await attempt("DIGEST_STORE_UNAVAILABLE", () =>
    Promise.resolve(ports.openStore()),
  );
  if (opened.kind === "failure") return opened.outcome;
  const store = opened.value;

  const claim = await attempt("DIGEST_CLAIM_FAILED", () =>
    store.claimDigestDay(chisinauDayKey(now.getTime())),
  );
  if (claim.kind === "failure") return claim.outcome;
  if (claim.value.kind === "already-claimed")
    return { status: "already-claimed" };

  const eligible = await attempt("DIGEST_LIST_FAILED", () =>
    store.listDigestEligible(now),
  );
  if (eligible.kind === "failure") return eligible.outcome;

  const message = composeOf(eligible.value, {
    origin: origin.value.origin,
    dayKey: claim.value.roundId,
    nowMs: now.getTime(),
    copy: copy.value,
  });
  if (message.kind === "failure") return message.outcome;
  if (message.value === undefined) return { status: "nothing-to-send" };

  const sent = await sendOf(creation.value.sender, message.value.message);
  if (sent !== undefined) return sent;
  return recordOf(store, claim.value.roundId, message.value);
}

type Attempted<Value> =
  | { readonly kind: "value"; readonly value: Value }
  | { readonly kind: "failure"; readonly outcome: StaffChangeDigestOutcome };

function failed(
  errorCode: DigestFailureCode,
  mailFailure?: MailFailureKind,
): StaffChangeDigestOutcome {
  return mailFailure === undefined
    ? { status: "failed", errorCode }
    : { status: "failed", errorCode, mailFailure };
}

/** The cause is dropped here: what a caller sees of a failed step is its code. */
async function attempt<Value>(
  errorCode: DigestFailureCode,
  step: () => Promise<Value>,
): Promise<Attempted<Value>> {
  try {
    return { kind: "value", value: await step() };
  } catch {
    return { kind: "failure", outcome: failed(errorCode) };
  }
}

interface ComposedDigest {
  readonly message: MailMessage;
  /** Exactly the rows the message lists. */
  readonly entries: readonly DigestedKitchen[];
  readonly waitingCount: number;
  readonly skippedCount: number;
}

type ComposeContext = Omit<StaffChangeDigestInput, "model">;

function composeOf(
  eligible: readonly DigestEligibleKitchen[],
  context: ComposeContext,
): Attempted<ComposedDigest | undefined> {
  try {
    if (eligible.length === 0) return { kind: "value", value: undefined };
    const entriesByDesign = revisionsByDesign(eligible);
    const describable = eligible.filter(isDescribable);
    if (describable.length === 0) {
      return { kind: "failure", outcome: failed("DIGEST_ROWS_MALFORMED") };
    }
    const model = buildDigestModel(describable.map(kitchenInputOf));
    if (model.kind === "nothing-to-send") {
      return { kind: "failure", outcome: failed("DIGEST_ROWS_MALFORMED") };
    }
    const { message, includedRowCount } = composeBoundedStaffChangeDigest({
      ...context,
      model,
    });
    return {
      kind: "value",
      value: {
        message,
        entries: entriesOf(model, includedRowCount, entriesByDesign),
        waitingCount: model.rows.length - includedRowCount,
        skippedCount: eligible.length - describable.length,
      },
    };
  } catch {
    return { kind: "failure", outcome: failed("DIGEST_COMPOSE_FAILED") };
  }
}

/** Whether the domain can describe the row: a row it throws for must not stop the others. */
function isDescribable(kitchen: DigestEligibleKitchen): boolean {
  try {
    buildDigestModel([kitchenInputOf(kitchen)]);
    return true;
  } catch {
    return false;
  }
}

/** One revision per design. A design listed twice under two revisions is refused: which one the e-mail stands for is
 *  not known, and recording the wrong one would hide a change. */
function revisionsByDesign(
  eligible: readonly DigestEligibleKitchen[],
): ReadonlyMap<string, DigestedKitchen> {
  const byDesign = new Map<string, DigestedKitchen>();
  for (const { designId, revision } of eligible) {
    const held = byDesign.get(designId);
    if (held !== undefined && held.revision !== revision) {
      throw new RangeError("A design was listed under two revisions");
    }
    byDesign.set(designId, { designId, revision });
  }
  return byDesign;
}

/** Exactly the e-mail's listed rows, each with the revision the store returned for its design. */
function entriesOf(
  model: DigestModel,
  listedCount: number,
  byDesign: ReadonlyMap<string, DigestedKitchen>,
): readonly DigestedKitchen[] {
  return model.rows.slice(0, listedCount).map((row) => {
    const entry = byDesign.get(row.designId);
    if (entry === undefined) {
      throw new RangeError("A digest row has no revision from the store");
    }
    return entry;
  });
}

function kitchenInputOf(kitchen: DigestEligibleKitchen): DigestKitchenInput {
  const shared = {
    designId: kitchen.designId,
    ...(kitchen.kitchenName === undefined
      ? {}
      : { kitchenName: kitchen.kitchenName }),
    sentAtMs: kitchen.sentAt.getTime(),
    updatedAtMs: kitchen.updatedAt.getTime(),
  };
  return kitchen.customerName === undefined
    ? { ...shared, reference: kitchen.reference }
    : { ...shared, customerName: kitchen.customerName };
}

async function sendOf(
  sender: MailSender,
  message: MailMessage,
): Promise<StaffChangeDigestOutcome | undefined> {
  const sent = await attempt("DIGEST_SEND_FAILED", () => sender.send(message));
  if (sent.kind === "failure") return sent.outcome;
  return sent.value.ok
    ? undefined
    : failed("DIGEST_SEND_FAILED", sent.value.kind);
}

/** The mail has gone: a failure here is reported, and the claimed day stands, so nothing is sent twice today. */
async function recordOf(
  store: KitchenChangeStore,
  roundId: string,
  composed: ComposedDigest,
): Promise<StaffChangeDigestOutcome> {
  const recorded = await attempt("DIGEST_RECORD_FAILED", () =>
    store.recordDigested(roundId, composed.entries),
  );
  if (recorded.kind === "failure") return recorded.outcome;
  return {
    status: "sent",
    kitchenCount: composed.entries.length,
    ...(composed.waitingCount > 0
      ? { waitingCount: composed.waitingCount }
      : {}),
    ...(composed.skippedCount > 0
      ? { skippedCount: composed.skippedCount }
      : {}),
  };
}
