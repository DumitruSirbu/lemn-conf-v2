import {
  CONTACT_INTENTS,
  type ContactIntent,
  type ContactSubmissionRequest,
  type SubmissionTarget,
} from "@lemnaria/configurator-domain";
import { useCallback, useMemo, useState } from "react";

import {
  rememberSentRequest,
  sentRequestFrom,
} from "@/done/sent-request-memory";
import type { AppLocale } from "@/i18n/routing";
import { usePriceBookRoot } from "@/price/price-book-provider";
import type { PriceBookRoot } from "@/price/price-book-root";
import { usePricedDesign } from "@/price/use-priced-design";
import { useSaveWait, type SaveWait } from "@/review/use-save-wait";
import {
  hasUnsavedEdit,
  useConfiguratorStore,
} from "@/store/configurator-store";

import type { ContactOutcome } from "./contact-answer";
import {
  firstInvalidField,
  INITIAL_CONTACT_FORM,
  measureElapsedMs,
  reduceContactForm,
  shownProfileAccountEmail,
  type ContactFormEvent,
  type ContactFormField,
  type ContactFormState,
  type MonotonicClock,
  type ProfileAccount,
} from "./contact-form-model";
import {
  generateRandomRequestId,
  historyAfterOutcome,
  historyAfterSend,
  NO_SEND_YET,
  prepareSend,
  type PreparedSend,
  type RequestIdGenerator,
  type SendHistory,
} from "./contact-request-identity";
import {
  BROWSER_CONNECTION,
  useRetryWhenOnline,
  type ConnectionPort,
} from "./retry-when-online";
import {
  isFinalOutcome,
  sendContactRequest,
  type FetchContact,
} from "./send-contact-request";

// The contact form's one place of memory: what was typed, the last send's id, and whether a request is out. Nothing
// here reaches a URL, a cookie, browser storage, the configurator store or a log; a typed value leaves this hook only
// in the body of the one request, and, once a design's request is sent, in the one entry `sent-request-memory` keeps
// for the confirmation page (the phone or the address, the channel, the reference: nothing else typed).

/** What the request is about: the design this store holds, or no design and an intent. */
export type ContactTarget =
  | { readonly kind: "design" }
  | { readonly kind: "intent"; readonly intent: ContactIntent };

/** Constants, so a caller's render does not hand the hook a new target each time. */
export const DESIGN_TARGET: ContactTarget = { kind: "design" };
export const CALLBACK_TARGET: ContactTarget = {
  kind: "intent",
  intent: CONTACT_INTENTS[0],
};

/** Everything the hook reads from outside React, so a test sets each one. Read once, at the first render. */
export interface ContactPorts {
  readonly fetchContact: FetchContact;
  readonly monotonicNow: MonotonicClock;
  /** Milliseconds since the epoch, as `Date.now`; a wait the limit told is measured on it. */
  readonly wallNowMs: () => number;
  readonly generateId: RequestIdGenerator;
  /** The browser's word on its connection; the one thing that retries a send that got no answer. */
  readonly connection: ConnectionPort;
}

const BROWSER_PORTS: ContactPorts = {
  fetchContact: (url, init) => fetch(url, init),
  monotonicNow: () => performance.now(),
  wallNowMs: () => Date.now(),
  generateId: generateRandomRequestId,
  connection: BROWSER_CONNECTION,
};

export interface ContactSubmissionOptions {
  readonly target: ContactTarget;
  readonly locale: AppLocale;
  readonly ports?: Partial<ContactPorts>;
}

export type UnsentOutcome = Exclude<ContactOutcome, { readonly kind: "sent" }>;

export type ContactSubmissionPhase =
  | { readonly kind: "idle" }
  | { readonly kind: "sending" }
  | { readonly kind: "sent"; readonly reference: string }
  | {
      readonly kind: "failed";
      readonly outcome: UnsentOutcome;
      /** Set only for a limited send: no send starts before this time. */
      readonly waitsUntilMs: number | undefined;
    };

/** A press the form refused; `pressNumber` tells two refusals of one field apart, so each moves focus again. */
export interface RefusedPress {
  readonly field: ContactFormField;
  readonly pressNumber: number;
}

export type ContactFormEdit = Exclude<
  ContactFormEvent,
  { readonly type: "submit-pressed" }
>;

export interface ContactSubmission {
  readonly form: ContactFormState;
  readonly phase: ContactSubmissionPhase;
  /** Whether the design on screen is the one the server holds; a press sends nothing while it is not. */
  readonly saveWait: SaveWait;
  readonly refusedPress: RefusedPress | undefined;
  readonly edit: (event: ContactFormEdit) => void;
  readonly press: () => void;
  /** Forgets the last send: the next one carries a new id, and the connection's return no longer resends the old one. */
  readonly resetRequestId: () => void;
  /** The account the form's profile line names, or none: a send names it exactly when the line is shown for it. */
  readonly showProfileAccount: (account: ProfileAccount | undefined) => void;
}

/** Mutable on purpose: a handler must read what the last handler wrote before React has rendered again. */
interface SessionMemory {
  form: ContactFormState;
  history: SendHistory;
  isSending: boolean;
  isFinished: boolean;
  waitsUntilMs: number | undefined;
  refusedPressCount: number;
  /** Whether the last send got no answer and nothing has been sent since. */
  hasUnansweredSend: boolean;
  profileAccount: ProfileAccount | undefined;
  /** A withdrawal of the profile's values that a send's hold put off, applied when the hold ends. */
  hasWithdrawalPending: boolean;
  /** Whether the last answer put the page on the failure screen, which has no fields to mend. */
  isOnFailureScreen: boolean;
}

const IDLE: ContactSubmissionPhase = { kind: "idle" };
const SENDING: ContactSubmissionPhase = { kind: "sending" };
/** A press nothing can be made of is told as the failure it is, and not left as a button that does nothing. */
const UNSENDABLE: ContactSubmissionPhase = {
  kind: "failed",
  outcome: { kind: "failed" },
  waitsUntilMs: undefined,
};

const NOTHING_TO_SAVE: SaveWait = { kind: "saved" };

const MILLISECONDS_PER_SECOND = 1000;

export function useContactSubmission(
  options: ContactSubmissionOptions,
): ContactSubmission {
  const { target, locale } = options;
  const [ports] = useState(() => ({ ...BROWSER_PORTS, ...options.ports }));
  const [startedAtMs] = useState(() => ports.monotonicNow());
  const [memory] = useState(newSessionMemory);
  const [form, setForm] = useState(memory.form);
  const [phase, setPhase] = useState(IDLE);
  const [refusedPress, setRefusedPress] = useState<RefusedPress | undefined>();
  const designSaveWait = useSaveWait();
  // A request with no design names nothing the store holds, so another design's unsaved edit is no reason to hold it.
  const saveWait = target.kind === "design" ? designSaveWait : NOTHING_TO_SAVE;
  const bookVersion = pricedVersionIdOf(usePriceBookRoot(), usePricedDesign());

  const edit = useCallback(
    (event: ContactFormEdit) => {
      if (isIdHeldBySend(memory) && deferProfileEvent(event, memory)) return;
      memory.form = reduceContactForm(memory.form, event);
      setForm(memory.form);
      if (event.type === "account-changed") {
        leaveFailureScreenWhenUnsendable(memory, { setPhase, setRefusedPress });
      }
    },
    [memory],
  );

  const resetRequestId = useCallback(() => {
    memory.history = NO_SEND_YET;
    applyPendingWithdrawal(memory, setForm);
  }, [memory]);
  const showProfileAccount = useCallback(
    (account: ProfileAccount | undefined) => {
      memory.profileAccount = account;
    },
    [memory],
  );

  const context = useMemo<PressContext>(
    () => ({
      memory,
      ports,
      startedAtMs,
      target,
      locale,
      bookVersion,
      show: { setForm, setPhase, setRefusedPress },
    }),
    [memory, ports, startedAtMs, target, locale, bookVersion],
  );
  const press = useCallback(() => {
    pressContact(context);
  }, [context]);
  const retryAfterUnansweredSend = useCallback(() => {
    if (canPressResendUnansweredSend(context)) pressContact(context);
  }, [context]);
  useRetryWhenOnline({
    connection: ports.connection,
    isWaitingForConnection: isUnanswered(phase),
    retry: retryAfterUnansweredSend,
  });

  return {
    form,
    phase,
    saveWait,
    refusedPress,
    edit,
    press,
    resetRequestId,
    showProfileAccount,
  };
}

/** While a send holds a reusable id, its values are the request's: a profile arriving does not change them, and one
 *  withdrawn waits until the hold ends, so Retry on the failure screen still sends what the send carried. An arrival
 *  means the profile is back, so nothing is left to withdraw. Whether the event was set aside is the answer. */
function deferProfileEvent(
  event: ContactFormEdit,
  memory: SessionMemory,
): boolean {
  if (event.type === "profile-arrived") {
    memory.hasWithdrawalPending = false;
    return true;
  }
  if (event.type !== "profile-withdrawn") return false;
  memory.hasWithdrawalPending = true;
  return true;
}

/** Another account is signed in and what the failure screen promised to keep is gone: Retry would send nothing, so the
 *  form comes back with its focus on the first field to fill, as a refused press puts it. A send that is out, a final
 *  answer and a wait the limit told are left as they are. */
function leaveFailureScreenWhenUnsendable(
  memory: SessionMemory,
  show: Pick<PressContext["show"], "setPhase" | "setRefusedPress">,
): void {
  if (!memory.isOnFailureScreen || memory.isSending || memory.isFinished)
    return;
  if (memory.waitsUntilMs !== undefined) return;
  const field = firstInvalidField(memory.form.values);
  if (field === undefined) return;
  memory.isOnFailureScreen = false;
  memory.refusedPressCount += 1;
  show.setPhase(IDLE);
  show.setRefusedPress({ field, pressNumber: memory.refusedPressCount });
}

/** The withdrawal a hold put off, once nothing holds the values any more: the id was reset or spent. */
function applyPendingWithdrawal(
  memory: SessionMemory,
  setForm: (form: ContactFormState) => void,
): void {
  if (!memory.hasWithdrawalPending || isIdHeldBySend(memory)) return;
  memory.hasWithdrawalPending = false;
  memory.form = reduceContactForm(memory.form, { type: "profile-withdrawn" });
  setForm(memory.form);
}

/** A send whose id a retry would keep: a fill that changed its fields would make the retry another request with another
 *  id, and the first may already be stored. */
function isIdHeldBySend(memory: SessionMemory): boolean {
  return memory.history.kind === "sent-before" && !memory.history.isIdSpent;
}

function isUnanswered(phase: ContactSubmissionPhase): boolean {
  return phase.kind === "failed" && phase.outcome.kind === "unanswered";
}

/**
 * Whether pressing now would send the unanswered send again: the last send got no answer, nothing was sent since, a
 * press is not refused for another reason, and the request as it now stands keeps that send's id, which is the
 * domain's own judgement that it is the same request. Read from the memory, which is written when the answer settles,
 * and not from what is rendered, which can lag it by a task: an event in that gap must not re-send an answered failure.
 * It touches no form state and shows nothing, so an event that sends nothing leaves the screen as it was.
 */
function canPressResendUnansweredSend(context: PressContext): boolean {
  const { memory, ports } = context;
  if (!memory.hasUnansweredSend) return false;
  if (isPressIgnored(memory, ports.wallNowMs())) return false;
  const target = readSubmissionTarget(context.target, context.bookVersion);
  if (target === undefined) return false;
  const prepared = prepareSendFromMemory(context, target);
  return (
    prepared.ok &&
    memory.history.kind === "sent-before" &&
    prepared.body.clientRequestId === memory.history.clientRequestId
  );
}

interface PressContext {
  readonly memory: SessionMemory;
  readonly ports: ContactPorts;
  readonly startedAtMs: number;
  readonly target: ContactTarget;
  readonly locale: AppLocale;
  readonly bookVersion: string | undefined;
  readonly show: {
    readonly setForm: (form: ContactFormState) => void;
    readonly setPhase: (phase: ContactSubmissionPhase) => void;
    readonly setRefusedPress: (refused: RefusedPress) => void;
  };
}

/** Everything a press does, in the press's own task: the guards, the judgement, the id, and the start of the send. */
function pressContact(context: PressContext): void {
  const { memory, ports, show } = context;
  if (isPressIgnored(memory, ports.wallNowMs())) return;
  const target = readSubmissionTarget(context.target, context.bookVersion);
  if (target === undefined) {
    // An unsaved design is told by the wait on screen; a saved one with no id, revision or book is not.
    if (!hasUnsavedEdit(useConfiguratorStore.getState())) {
      show.setPhase(UNSENDABLE);
    }
    return;
  }
  memory.form = reduceContactForm(memory.form, { type: "submit-pressed" });
  show.setForm(memory.form);
  const prepared = prepareSendFromMemory(context, target);
  if (prepared.ok) startSending(prepared, context);
  else refuse(context);
}

function prepareSendFromMemory(
  { memory, ports, startedAtMs, locale, bookVersion }: PressContext,
  target: SubmissionTarget,
): PreparedSend {
  return prepareSend({
    history: memory.history,
    submission: {
      values: memory.form.values,
      target,
      locale,
      elapsedMs: measureElapsedMs(startedAtMs, ports.monotonicNow),
      profileAccountEmail: shownProfileAccountEmail(
        memory.profileAccount,
        memory.form,
      ),
    },
    bookVersion: target.kind === "design" ? bookVersion : undefined,
    generateId: ports.generateId,
  });
}

function newSessionMemory(): SessionMemory {
  return {
    form: INITIAL_CONTACT_FORM,
    history: NO_SEND_YET,
    isSending: false,
    isFinished: false,
    waitsUntilMs: undefined,
    refusedPressCount: 0,
    hasUnansweredSend: false,
    profileAccount: undefined,
    hasWithdrawalPending: false,
    isOnFailureScreen: false,
  };
}

/** One request at a time; none after a final answer; none before a limited send's wait has passed. */
function isPressIgnored(memory: SessionMemory, nowMs: number): boolean {
  if (memory.isSending || memory.isFinished) return true;
  return memory.waitsUntilMs !== undefined && nowMs < memory.waitsUntilMs;
}

/**
 * What the request names, or nothing when it cannot be sent yet. For a design the id and the revision come from one
 * read of the store, the same read that finds nothing unsaved, so the revision sent is the one the card shows.
 */
function readSubmissionTarget(
  target: ContactTarget,
  bookVersion: string | undefined,
): SubmissionTarget | undefined {
  if (target.kind === "intent") {
    return { kind: "intent", intent: target.intent };
  }
  const session = useConfiguratorStore.getState();
  const { designId, revision } = session;
  const isSendable =
    !hasUnsavedEdit(session) &&
    designId !== null &&
    revision !== null &&
    bookVersion !== undefined;
  return isSendable
    ? { kind: "design", design: { id: designId, revision } }
    : undefined;
}

/**
 * The version id of the book the card's figure is priced under, from the root the page supplied; nothing when the card
 * has no figure. The server digests the same id (ADR 0157 decision 2), so a retry after a publish is a new request.
 */
function pricedVersionIdOf(
  root: PriceBookRoot,
  pricing: ReturnType<typeof usePricedDesign>,
): string | undefined {
  return root.kind === "active" && pricing.ok ? root.versionId : undefined;
}

function refuse({ memory, show }: PressContext): void {
  const field = firstInvalidField(memory.form.values);
  if (field === undefined) {
    // The domain refused a body no field accounts for: the customer has nothing to mend, and is told so.
    show.setPhase(UNSENDABLE);
    return;
  }
  memory.refusedPressCount += 1;
  show.setRefusedPress({ field, pressNumber: memory.refusedPressCount });
}

/** The guard is set here, in the press's own task and before `fetch` is called, so a second press finds it set. */
function startSending(
  prepared: Extract<PreparedSend, { readonly ok: true }>,
  { memory, ports, show }: PressContext,
): void {
  memory.isSending = true;
  memory.hasUnansweredSend = false;
  memory.history = historyAfterSend(prepared);
  show.setPhase(SENDING);
  void sendContactRequest(prepared.body, ports.fetchContact).then((outcome) => {
    rememberWhenSent(prepared.request, outcome);
    show.setPhase(settle(memory, outcome, ports.wallNowMs()));
    applyPendingWithdrawal(memory, show.setForm);
  });
}

/** The target and the reference come from this press's own request and its answer, so the entry names what was sent. */
function rememberWhenSent(
  request: ContactSubmissionRequest,
  outcome: ContactOutcome,
): void {
  if (outcome.kind !== "sent") return;
  const sent = sentRequestFrom(request, outcome.reference);
  if (sent !== undefined) rememberSentRequest(sent);
}

function settle(
  memory: SessionMemory,
  outcome: ContactOutcome,
  nowMs: number,
): ContactSubmissionPhase {
  memory.isSending = false;
  memory.hasUnansweredSend = outcome.kind === "unanswered";
  memory.history = historyAfterOutcome(memory.history, outcome);
  memory.isFinished = isFinalOutcome(outcome);
  memory.isOnFailureScreen = outcome.kind !== "sent";
  memory.waitsUntilMs =
    outcome.kind === "limited"
      ? nowMs + outcome.waitSeconds * MILLISECONDS_PER_SECOND
      : undefined;
  return outcome.kind === "sent"
    ? { kind: "sent", reference: outcome.reference }
    : { kind: "failed", outcome, waitsUntilMs: memory.waitsUntilMs };
}
