import {
  CONTACT_INTENTS,
  type ContactIntent,
  type SubmissionTarget,
} from "@lemnaria/configurator-domain";
import { useCallback, useState } from "react";

import type { AppLocale } from "@/i18n/routing";
import { usePricedDesign } from "@/price/use-priced-design";
import { useSaveWait, type SaveWait } from "@/review/use-save-wait";
import { useConfiguratorStore } from "@/store/configurator-store";

import type { ContactOutcome } from "./contact-answer";
import {
  firstInvalidField,
  INITIAL_CONTACT_FORM,
  measureElapsedMs,
  reduceContactForm,
  type ContactFormEvent,
  type ContactFormField,
  type ContactFormState,
  type MonotonicClock,
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
  isFinalOutcome,
  sendContactRequest,
  type FetchContact,
} from "./send-contact-request";

// The contact form's one place of memory: what was typed, the last send's id, and whether a request is out. Nothing
// here reaches a URL, a cookie, browser storage, the configurator store or a log; a typed value leaves this hook only
// in the body of the one request.

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
}

const BROWSER_PORTS: ContactPorts = {
  fetchContact: (url, init) => fetch(url, init),
  monotonicNow: () => performance.now(),
  wallNowMs: () => Date.now(),
  generateId: generateRandomRequestId,
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
}

/** Mutable on purpose: a handler must read what the last handler wrote before React has rendered again. */
interface SessionMemory {
  form: ContactFormState;
  history: SendHistory;
  isSending: boolean;
  isFinished: boolean;
  waitsUntilMs: number | undefined;
  refusedPressCount: number;
}

const IDLE: ContactSubmissionPhase = { kind: "idle" };
const SENDING: ContactSubmissionPhase = { kind: "sending" };

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
  const saveWait = useSaveWait();
  const bookVersion = pricingVersionOf(usePricedDesign());

  const edit = useCallback(
    (event: ContactFormEdit) => {
      memory.form = reduceContactForm(memory.form, event);
      setForm(memory.form);
    },
    [memory],
  );

  const press = useCallback(() => {
    pressContact({
      memory,
      ports,
      startedAtMs,
      target,
      locale,
      bookVersion,
      show: { setForm, setPhase, setRefusedPress },
    });
  }, [memory, ports, startedAtMs, target, locale, bookVersion]);

  return { form, phase, saveWait, refusedPress, edit, press };
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
  if (target === undefined) return;
  memory.form = reduceContactForm(memory.form, { type: "submit-pressed" });
  show.setForm(memory.form);
  const prepared = prepareSend({
    history: memory.history,
    submission: {
      values: memory.form.values,
      target,
      locale: context.locale,
      elapsedMs: measureElapsedMs(context.startedAtMs, ports.monotonicNow),
    },
    bookVersion: target.kind === "design" ? context.bookVersion : undefined,
    generateId: ports.generateId,
  });
  if (prepared.ok) startSending(prepared, context);
  else refuse(context);
}

function newSessionMemory(): SessionMemory {
  return {
    form: INITIAL_CONTACT_FORM,
    history: NO_SEND_YET,
    isSending: false,
    isFinished: false,
    waitsUntilMs: undefined,
    refusedPressCount: 0,
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
  const { design, savedDesign, designId, revision } =
    useConfiguratorStore.getState();
  const isSendable =
    design === savedDesign &&
    designId !== null &&
    revision !== null &&
    bookVersion !== undefined;
  return isSendable
    ? { kind: "design", design: { id: designId, revision } }
    : undefined;
}

/** The version of the book the card's figure is priced under, from the same root that prices it. */
function pricingVersionOf(
  pricing: ReturnType<typeof usePricedDesign>,
): string | undefined {
  return pricing.ok ? pricing.priced.pricingVersion : undefined;
}

function refuse({ memory, show }: PressContext): void {
  const field = firstInvalidField(memory.form.values);
  if (field === undefined) return;
  memory.refusedPressCount += 1;
  show.setRefusedPress({ field, pressNumber: memory.refusedPressCount });
}

/** The guard is set here, in the press's own task and before `fetch` is called, so a second press finds it set. */
function startSending(
  prepared: Extract<PreparedSend, { readonly ok: true }>,
  { memory, ports, show }: PressContext,
): void {
  memory.isSending = true;
  memory.history = historyAfterSend(prepared);
  show.setPhase(SENDING);
  void sendContactRequest(prepared.body, ports.fetchContact).then((outcome) => {
    show.setPhase(settle(memory, outcome, ports.wallNowMs()));
  });
}

function settle(
  memory: SessionMemory,
  outcome: ContactOutcome,
  nowMs: number,
): ContactSubmissionPhase {
  memory.isSending = false;
  memory.history = historyAfterOutcome(memory.history, outcome);
  memory.isFinished = isFinalOutcome(outcome);
  memory.waitsUntilMs =
    outcome.kind === "limited"
      ? nowMs + outcome.waitSeconds * MILLISECONDS_PER_SECOND
      : undefined;
  return outcome.kind === "sent"
    ? { kind: "sent", reference: outcome.reference }
    : { kind: "failed", outcome, waitsUntilMs: memory.waitsUntilMs };
}
