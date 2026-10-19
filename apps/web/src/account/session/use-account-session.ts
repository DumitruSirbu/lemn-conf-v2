"use client";

import type { Capability } from "@lemnaria/configurator-domain";
import { useEffect, useSyncExternalStore } from "react";

import { NO_REFERRER_POLICY } from "../send-account-request";

// Who is signed in, asked of the server once per document and shared by every control that wants to know. The answer
// lives at module scope, not in a component: a language switch remounts the screen's subtree, the room-to-editor step is
// a client navigation, and StrictMode runs effects twice, and none of the three may send a second request. A page load
// is a new module, so a full-document navigation (every account page) asks again.
//
// Only a definite answer is kept. A request that failed shows as anonymous, which grants less, but is asked again by the
// next control to mount: a flaky network must not leave a signed-in person looking signed out until they reload.

const SESSION_ENDPOINT = "/api/account/session";

/** The capability only a client holds (ADR 0172 D7): a session without it is staff's. */
const CLIENT_CAPABILITY: Capability = "design.read.own";

/** What the header knows of the session. The role is never part of it: a client is told apart by the capability, and
 *  staff are not told apart from each other. */
export type AccountSessionState =
  | { readonly kind: "pending" }
  | { readonly kind: "anonymous" }
  | { readonly kind: "client"; readonly email: string }
  | { readonly kind: "staff" };

/** What a request came to: the state to show, and whether the server said it (a failure is shown but not kept). */
interface SessionAnswer {
  readonly state: AccountSessionState;
  readonly isDefinite: boolean;
}

const PENDING: AccountSessionState = { kind: "pending" };
const ANONYMOUS: AccountSessionState = { kind: "anonymous" };
const UNANSWERED: SessionAnswer = { state: ANONYMOUS, isDefinite: false };

let current: AccountSessionState = PENDING;
let hasDefiniteAnswer = false;
let isReading = false;
let latestReadId = 0;
let isListeningForPageRestore = false;
let wasSignedOutByPerson = false;
const listeners = new Set<() => void>();

export function useAccountSession(): AccountSessionState {
  useEffect(() => {
    void readSessionIfUnanswered();
  }, []);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** The person signed out here: anonymous is the truth now, and it needs no request to confirm it. */
export function markSignedOut(): void {
  latestReadId += 1;
  isReading = false;
  hasDefiniteAnswer = true;
  publish(ANONYMOUS);
}

/** The person chose to sign out on this document: anonymous is the truth, and it is not an expiry. A signed-in answer
 *  after it (a page restored from the cache, a refresh) withdraws the mark, since the session it was about is a new one. */
export function markSignedOutByPerson(): void {
  wasSignedOutByPerson = true;
  markSignedOut();
}

/** Whether the session on this document ended because its owner chose so. The editor's session-expiry notice reads it. */
export function isSignedOutByPerson(): boolean {
  return wasSignedOutByPerson;
}

/** Whether the state on show is something the server said, or the stand-in for a request that failed. A failed request
 *  reads as anonymous, which grants less but must not be taken for "the session has ended". */
export function isSessionAnswerDefinite(): boolean {
  return hasDefiniteAnswer;
}

/** Asks the server again, whatever was answered before (a session may have ended or begun elsewhere). */
export function refreshSession(): void {
  hasDefiniteAnswer = false;
  void readSession();
}

/** Forgets everything, as a fresh document would. For tests only: nothing in the application calls it. */
export function resetAccountSessionForTests(): void {
  current = PENDING;
  hasDefiniteAnswer = false;
  isReading = false;
  wasSignedOutByPerson = false;
  latestReadId += 1;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): AccountSessionState {
  return current;
}

/** The server and the first client render agree on pending, whatever the module already knows. */
function getServerSnapshot(): AccountSessionState {
  return PENDING;
}

async function readSessionIfUnanswered(): Promise<void> {
  listenForPageRestore();
  if (hasDefiniteAnswer || isReading) return;
  await readSession();
}

/** A page restored from the back-forward cache keeps this module as it was left, however long ago, so it asks again. */
function listenForPageRestore(): void {
  if (isListeningForPageRestore) return;
  isListeningForPageRestore = true;
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) refreshSession();
  });
}

/** The newest request is the one that counts: an older answer arriving late is dropped. */
async function readSession(): Promise<void> {
  latestReadId += 1;
  const readId = latestReadId;
  isReading = true;
  const answer = await askServerWho();
  if (readId !== latestReadId) return;
  isReading = false;
  hasDefiniteAnswer = answer.isDefinite;
  publish(answer.state);
}

function publish(next: AccountSessionState): void {
  if (next.kind === "client" || next.kind === "staff") {
    wasSignedOutByPerson = false;
  }
  current = next;
  for (const listener of listeners) listener();
}

/** A request that failed, was refused or answered with something unreadable shows as anonymous: the answer that grants
 *  less. */
async function askServerWho(): Promise<SessionAnswer> {
  try {
    const response = await fetch(SESSION_ENDPOINT, {
      referrerPolicy: NO_REFERRER_POLICY,
    });
    if (!response.ok) return UNANSWERED;
    const body: unknown = await response.json();
    return { state: describeSession(body), isDefinite: true };
  } catch {
    return UNANSWERED;
  }
}

/** The server's `{state, email, capabilities}` as the header's state, or anonymous for any other shape. */
export function describeSession(body: unknown): AccountSessionState {
  if (typeof body !== "object" || body === null) return ANONYMOUS;
  const { state, email, capabilities } = body as Record<string, unknown>;
  if (state !== "signed-in") return ANONYMOUS;
  if (typeof email !== "string" || !Array.isArray(capabilities)) {
    return ANONYMOUS;
  }
  return capabilities.includes(CLIENT_CAPABILITY)
    ? { kind: "client", email }
    : { kind: "staff" };
}
