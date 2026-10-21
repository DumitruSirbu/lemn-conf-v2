"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  DesignSchema,
  isDesignId,
  isRequestStatus,
  type Design,
} from "@lemnaria/configurator-domain";

import {
  classifySignedInAnswer,
  rateLimitNoticeOf,
} from "@/account/account-answer";
import { loginPathWithReason } from "@/account/login-arrival";
import { leaveFor } from "@/account/on-signed-in";
import { NO_REFERRER_POLICY } from "@/account/send-account-request";
import type { AppLocale } from "@/i18n/routing";

import type {
  StaffClientWire,
  StaffKitchenNoteWire,
  StaffKitchenRequestWire,
  StaffKitchenStatusWire,
  StaffKitchenWire,
  StaffPersonWire,
} from "./staff-kitchens-wire-contract";
import type { ListFailure } from "./use-staff-kitchens";

// One client's kitchen for staff (Lot 3 frames S3A to S3I). The kitchen is asked for once when the page opens and again
// only when the person presses "Încearcă din nou": a `429` or `503` waits for them, and nothing is retried on its own. The
// answer is never kept anywhere but in this component's state: not in the address, the browser's storage or a log.

const STAFF_KITCHENS_ENDPOINT = "/api/staff/kitchens";
const UNRECOGNISED_STATUS = "unrecognised";

/** Why the kitchen could not be had, as the screen tells it (the list's own words for the same four causes). */
export type StaffKitchenFailure = ListFailure;

export type StaffKitchenState =
  | { readonly phase: "loading" }
  | { readonly phase: "failed"; readonly failure: StaffKitchenFailure }
  /** The one refusal: no such kitchen, or not one staff may open. The screen cannot tell which, and says so. */
  | { readonly phase: "not-found" }
  /** A live session that holds no right to read kitchens; the screen draws the staff frame's forbidden page. */
  | { readonly phase: "forbidden" }
  | { readonly phase: "ready"; readonly kitchen: StaffKitchenWire };

export interface StaffKitchenReading {
  readonly state: StaffKitchenState;
  /** "Încearcă din nou" after a failure: asks for the kitchen again. */
  readonly retry: () => void;
}

type KitchenStep =
  | { readonly kind: "kitchen"; readonly kitchen: StaffKitchenWire }
  | { readonly kind: "failed"; readonly failure: StaffKitchenFailure }
  | { readonly kind: "not-found" }
  | { readonly kind: "forbidden" }
  | { readonly kind: "sign-in" }
  | { readonly kind: "aborted" };

export function useStaffKitchen(
  locale: AppLocale,
  designId: string,
): StaffKitchenReading {
  const [state, setState] = useState<StaffKitchenState>({ phase: "loading" });
  const controllerRef = useRef<AbortController | undefined>(undefined);

  const read = useCallback(() => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    void readKitchen(designId, controller.signal).then((step) => {
      if (step.kind === "aborted") return;
      if (step.kind === "sign-in") {
        leaveFor(loginPathWithReason(locale, "session-expired"));
        return;
      }
      setState(stateAfter(step));
    });
  }, [designId, locale]);

  useEffect(() => {
    read();
    return () => {
      controllerRef.current?.abort();
    };
  }, [read]);

  const retry = useCallback(() => {
    setState({ phase: "loading" });
    read();
  }, [read]);

  return { state, retry };
}

function stateAfter(
  step: Exclude<KitchenStep, { kind: "sign-in" | "aborted" }>,
): StaffKitchenState {
  switch (step.kind) {
    case "kitchen":
      return { phase: "ready", kitchen: step.kitchen };
    case "failed":
      return { phase: "failed", failure: step.failure };
    case "not-found":
      return { phase: "not-found" };
    case "forbidden":
      return { phase: "forbidden" };
  }
}

async function readKitchen(
  designId: string,
  signal: AbortSignal,
): Promise<KitchenStep> {
  try {
    const response = await fetch(
      `${STAFF_KITCHENS_ENDPOINT}/${encodeURIComponent(designId)}`,
      { method: "GET", referrerPolicy: NO_REFERRER_POLICY, signal },
    );
    const body = await readJsonOrNothing(response);
    if (signal.aborted) return { kind: "aborted" };
    return stepOf(designId, {
      status: response.status,
      retryAfter: response.headers.get("retry-after"),
      body,
    });
  } catch {
    return signal.aborted
      ? { kind: "aborted" }
      : failedStep({ kind: "offline" });
  }
}

async function readJsonOrNothing(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function stepOf(
  designId: string,
  answer: Parameters<typeof classifySignedInAnswer>[1],
): KitchenStep {
  const outcome = classifySignedInAnswer("staff-kitchen", answer);
  switch (outcome.kind) {
    case "received": {
      const kitchen = staffKitchenFrom(outcome.body);
      return kitchen?.kitchen.id === designId
        ? { kind: "kitchen", kitchen }
        : failedStep({ kind: "failed" });
    }
    case "unauthenticated":
      return { kind: "sign-in" };
    case "forbidden":
      return { kind: "forbidden" };
    case "kitchen-unavailable":
      return { kind: "not-found" };
    case "rate-limited":
      return failedStep({
        kind: "rate-limited",
        notice: rateLimitNoticeOf(outcome.wait, Date.now()),
      });
    case "unavailable":
      return failedStep({ kind: "unavailable" });
    default:
      return failedStep({ kind: "failed" });
  }
}

function failedStep(failure: StaffKitchenFailure): KitchenStep {
  return { kind: "failed", failure };
}

/**
 * The kitchen the body holds, or nothing when any part of it is not what the contract says. A document this build cannot
 * read is not a failure: it reads as `null` and the page says so beside the rest, which is still there to read. A request
 * status this build does not name is `unrecognised`, never one it does.
 */
export function staffKitchenFrom(body: unknown): StaffKitchenWire | undefined {
  const kitchen = kitchenFrom(ownValueOf(body, "kitchen"));
  const client = clientFrom(ownValueOf(body, "client"));
  const request = requestFrom(ownValueOf(body, "request"));
  const status = statusFrom(ownValueOf(body, "status"));
  const notes = notesFrom(ownValueOf(body, "notes"));
  const notesTruncated = ownValueOf(body, "notesTruncated");
  if (kitchen === undefined || client === undefined) return undefined;
  if (request === undefined || status === undefined) return undefined;
  if (notes === undefined || typeof notesTruncated !== "boolean") {
    return undefined;
  }
  return {
    kitchen,
    client: client.value,
    request: request.value,
    status: status.value,
    notes,
    notesTruncated,
  };
}

function kitchenFrom(raw: unknown): StaffKitchenWire["kitchen"] | undefined {
  const id = ownValueOf(raw, "id");
  const name = ownValueOf(raw, "name");
  const isSent = ownValueOf(raw, "isSent");
  const isHidden = ownValueOf(raw, "isHidden");
  const sentAt = ownValueOf(raw, "sentAt");
  const updatedAt = ownValueOf(raw, "updatedAt");
  if (typeof id !== "string" || !isDesignId(id)) return undefined;
  if (name !== null && typeof name !== "string") return undefined;
  if (typeof isSent !== "boolean" || typeof isHidden !== "boolean") {
    return undefined;
  }
  if (sentAt !== null && !isInstant(sentAt)) return undefined;
  if (!isInstant(updatedAt)) return undefined;
  return {
    id,
    name,
    design: designFrom(ownValueOf(raw, "design")),
    asSent: designFrom(ownValueOf(raw, "asSent")),
    isSent,
    isHidden,
    sentAt,
    updatedAt,
  };
}

function designFrom(raw: unknown): Design | null {
  const parsed = DesignSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** `undefined` for a client the contract does not allow; `{ value: null }` for a sent kitchen no account owns. */
function clientFrom(
  raw: unknown,
): { readonly value: StaffClientWire | null } | undefined {
  if (raw === null) return { value: null };
  const email = ownValueOf(raw, "email");
  const name = ownValueOf(raw, "name");
  const phone = ownValueOf(raw, "phone");
  if (typeof email !== "string") return undefined;
  if (name !== null && typeof name !== "string") return undefined;
  if (phone !== null && typeof phone !== "string") return undefined;
  return { value: { email, name, phone } };
}

function requestFrom(
  raw: unknown,
): { readonly value: StaffKitchenRequestWire | null } | undefined {
  if (raw === null) return { value: null };
  const reference = ownValueOf(raw, "reference");
  const sentAt = ownValueOf(raw, "sentAt");
  if (typeof reference !== "string" || reference === "") return undefined;
  if (!isInstant(sentAt)) return undefined;
  return { value: { reference, sentAt } };
}

function statusFrom(
  raw: unknown,
): { readonly value: StaffKitchenStatusWire | null } | undefined {
  if (raw === null) return { value: null };
  const word = ownValueOf(raw, "value");
  const changedBy = ownValueOf(raw, "changedBy");
  const changedAt = ownValueOf(raw, "changedAt");
  if (typeof word !== "string") return undefined;
  const by = changedBy === null ? { value: null } : personFrom(changedBy);
  if (by === undefined) return undefined;
  if (changedAt !== null && !isInstant(changedAt)) return undefined;
  return {
    value: {
      value: isRequestStatus(word) ? word : UNRECOGNISED_STATUS,
      changedBy: by.value,
      changedAt,
    },
  };
}

function notesFrom(raw: unknown): readonly StaffKitchenNoteWire[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const notes = (raw as readonly unknown[]).map(noteFrom);
  return notes.every(isNote) ? notes : undefined;
}

function noteFrom(raw: unknown): StaffKitchenNoteWire | undefined {
  const id = ownValueOf(raw, "id");
  const text = ownValueOf(raw, "text");
  const createdAt = ownValueOf(raw, "createdAt");
  const author = personFrom(ownValueOf(raw, "author"));
  if (typeof id !== "string" || id === "" || typeof text !== "string") {
    return undefined;
  }
  if (!isInstant(createdAt) || author === undefined) return undefined;
  return { id, text, createdAt, author: author.value };
}

function isNote(
  note: StaffKitchenNoteWire | undefined,
): note is StaffKitchenNoteWire {
  return note !== undefined;
}

/** A person as it reads now: `null` members are an account that no longer resolves, not a failure. */
function personFrom(
  raw: unknown,
): { readonly value: StaffPersonWire } | undefined {
  const email = ownValueOf(raw, "email");
  const name = ownValueOf(raw, "name");
  if (email !== null && typeof email !== "string") return undefined;
  if (name !== null && typeof name !== "string") return undefined;
  return { value: { email, name } };
}

function isInstant(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

/** Only what the body's own object holds; anything that is not an object holds nothing. */
function ownValueOf(value: unknown, name: string): unknown {
  if (typeof value !== "object" || value === null) return undefined;
  return Object.hasOwn(value, name)
    ? (value as Readonly<Record<string, unknown>>)[name]
    : undefined;
}
