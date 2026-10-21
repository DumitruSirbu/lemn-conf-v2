"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  DesignSchema,
  isDesignId,
  type Design,
} from "@lemnaria/configurator-domain";

import { classifySignedInAnswer } from "@/account/account-answer";

import { withoutRepeatedNotes } from "./staff-note-rules";
import {
  askStaffRoute,
  failureOf,
  type StaffReadFailure,
} from "./staff-read-request";
import { raiseStaffSessionExpired } from "./staff-session-expiry";
import type {
  StaffKitchenNoteWire,
  StaffKitchenRequestWire,
  StaffKitchenStatusWire,
  StaffKitchenWire,
} from "./staff-kitchens-wire-contract";
import {
  clientFrom,
  isInstant,
  noteFrom,
  ownValueOf,
  personFrom,
  recognisedStatusOf,
} from "./staff-kitchens-wire-reading";

// One client's kitchen for staff (frames S3A to S3I). The kitchen is asked for once when the page opens and again
// only when the person presses "Încearcă din nou", or when a write of the page found the kitchen no longer as the page
// shows it (`refresh`): a `429` or `503` waits for them, and nothing is retried on its own. The answer is never kept
// anywhere but in this component's state: not in the address, the browser's storage or a log. A refused session is not
// a failure of the page: the staff frame tells it (`raiseStaffSessionExpired`) and the page stays as it is.

const STAFF_KITCHENS_ENDPOINT = "/api/staff/kitchens";

/** Why the kitchen could not be had, as the screen tells it (the list's own words for the same four causes). */
export type StaffKitchenFailure = StaffReadFailure;

export type StaffKitchenState =
  | { readonly phase: "loading" }
  | { readonly phase: "failed"; readonly failure: StaffKitchenFailure }
  /** The one refusal: no such kitchen, or not one staff may open. The screen cannot tell which, and says so. */
  | { readonly phase: "not-found" }
  /** A live session that holds no right to read kitchens; the screen draws the staff frame's forbidden page. */
  | { readonly phase: "forbidden" }
  | { readonly phase: "ready"; readonly kitchen: StaffKitchenWire };

/** A change the page makes to the kitchen it shows, from the answer of one of its writes. */
export type StaffKitchenEdit = (kitchen: StaffKitchenWire) => StaffKitchenWire;

export interface StaffKitchenReading {
  readonly state: StaffKitchenState;
  /** "Încearcă din nou" after a failure: asks for the kitchen again. */
  readonly retry: () => void;
  /** Asks for the kitchen again and leaves what is shown (and what the person typed) in place until it comes. Only a
   *  kitchen replaces it, or the answer that there is none; a failure changes nothing. Answers whether what is shown now
   *  is that answer: `false` for a read that failed, was overtaken by a write of the page, or was refused. */
  readonly refresh: () => Promise<boolean>;
  /** Shows the kitchen as a write of this page left it, without asking for it again. */
  readonly edit: (change: StaffKitchenEdit) => void;
}

type KitchenStep =
  | { readonly kind: "kitchen"; readonly kitchen: StaffKitchenWire }
  | { readonly kind: "failed"; readonly failure: StaffKitchenFailure }
  | { readonly kind: "not-found" }
  | { readonly kind: "forbidden" }
  | { readonly kind: "sign-in" }
  | { readonly kind: "aborted" };

/** `page` is the read the page opens with and "Încearcă din nou" repeats; `quiet` is a refresh behind a page that is
 *  already showing the kitchen. */
type ReadMode = "page" | "quiet";

/** What was read, and for which kitchen: an answer is shown only beside the id it answered. */
interface StateOfKitchen {
  readonly designId: string;
  readonly state: StaffKitchenState;
}

const LOADING: StaffKitchenState = { phase: "loading" };

export function useStaffKitchen(designId: string): StaffKitchenReading {
  const [held, setHeld] = useState<StateOfKitchen>({
    designId,
    state: LOADING,
  });
  const controllerRef = useRef<AbortController | undefined>(undefined);
  const editCountRef = useRef(0);

  const read = useCallback(
    function read(mode: ReadMode): Promise<boolean> {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      const editsAtAsking = editCountRef.current;
      return readKitchen(designId, controller.signal).then((step) => {
        if (step.kind === "aborted") return false;
        if (step.kind === "sign-in") {
          raiseStaffSessionExpired({
            askAgain: () => {
              // A page that has gone, or a newer read, has aborted this one: nothing is asked on its behalf.
              if (!controller.signal.aborted) void read(mode);
            },
          });
          return false;
        }
        // A write answered while this read was out is newer than the read's picture of the kitchen.
        if (mode === "quiet" && editCountRef.current !== editsAtAsking) {
          return false;
        }
        if (mode === "quiet" && step.kind === "failed") return false;
        setHeld({ designId, state: stateAfter(step) });
        return true;
      });
    },
    [designId],
  );

  useEffect(() => {
    void read("page");
    return () => {
      controllerRef.current?.abort();
    };
  }, [read]);

  const retry = useCallback(() => {
    setHeld({ designId, state: LOADING });
    void read("page");
  }, [designId, read]);

  const refresh = useCallback(() => read("quiet"), [read]);

  const edit = useCallback(
    (change: StaffKitchenEdit) => {
      editCountRef.current += 1;
      setHeld((current) =>
        current.designId === designId && current.state.phase === "ready"
          ? {
              designId,
              state: { phase: "ready", kitchen: change(current.state.kitchen) },
            }
          : current,
      );
    },
    [designId],
  );

  // A kitchen read for another id is never drawn under this one, whether or not the page remounts for the change.
  const state = held.designId === designId ? held.state : LOADING;
  return { state, retry, refresh, edit };
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
  const reading = await askStaffRoute(
    `${STAFF_KITCHENS_ENDPOINT}/${encodeURIComponent(designId)}`,
    signal,
  );
  switch (reading.kind) {
    case "aborted":
      return { kind: "aborted" };
    case "offline":
      return failedStep({ kind: "offline" });
    case "answered":
      return stepOf(designId, reading.answer);
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
    default:
      return failedStep(failureOf(outcome));
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
  const hasSentOnlyMembers = request.value !== null || status.value !== null;
  if (!kitchen.isSent && hasSentOnlyMembers) return undefined;
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
  // A kitchen is sent exactly when it has a sent day, and only a sent kitchen has a copy as sent.
  if (isSent !== (sentAt !== null)) return undefined;
  const rawAsSent = ownValueOf(raw, "asSent");
  if (!isSent && rawAsSent !== null && rawAsSent !== undefined) {
    return undefined;
  }
  return {
    id,
    name,
    design: designFrom(ownValueOf(raw, "design")),
    asSent: designFrom(rawAsSent),
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
      value: recognisedStatusOf(word),
      changedBy: by.value,
      changedAt,
    },
  };
}

function notesFrom(raw: unknown): readonly StaffKitchenNoteWire[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const notes = (raw as readonly unknown[]).map(noteFrom);
  return notes.every(isNote) ? withoutRepeatedNotes(notes) : undefined;
}

function isNote(
  note: StaffKitchenNoteWire | undefined,
): note is StaffKitchenNoteWire {
  return note !== undefined;
}
