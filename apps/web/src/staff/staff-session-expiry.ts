"use client";

import { useSyncExternalStore } from "react";

// Whether a staff request was refused because the session ended (Lot 3 frames S1C and S2F). Every staff request can be:
// the list, the kitchen and each write say so by raising it, and the staff frame draws the one sheet that tells the
// person, over the page, which stays as it is. The state lives at module scope for the reason `use-account-session.ts`
// gives: the readers and the frame are separate components of one document, and a page load is a new module.
//
// Nothing is kept of what the refused request carried. The readers that were refused hand over the way to ask again, and
// it is used once, when the person has said they are signed in again; a write hands over none, because the person
// presses the same button again.

/** What the sheet needs to know of the refusal. */
export interface StaffSessionExpiry {
  /** A person had typed something the page still holds, which the sheet then promises stays where it is. */
  readonly keepsTypedText: boolean;
}

export interface StaffSessionExpiryRaise {
  readonly keepsTypedText?: boolean;
  /** Asks for again what was refused. Called once, only after the person has signed in again. */
  readonly askAgain?: () => void;
}

let current: StaffSessionExpiry | undefined;
let pendingReads = new Set<() => void>();
const listeners = new Set<() => void>();

export function raiseStaffSessionExpired(
  raise: StaffSessionExpiryRaise = {},
): void {
  if (raise.askAgain !== undefined) pendingReads.add(raise.askAgain);
  const keepsTypedText =
    (current?.keepsTypedText ?? false) || raise.keepsTypedText === true;
  if (current?.keepsTypedText === keepsTypedText) return;
  publish({ keepsTypedText });
}

/** The person is signed in again: the sheet goes and every read that was refused is asked for once more. */
export function resolveStaffSessionExpired(): void {
  const reads = pendingReads;
  pendingReads = new Set();
  publish(undefined);
  for (const askAgain of reads) askAgain();
}

export function useStaffSessionExpiry(): StaffSessionExpiry | undefined {
  return useSyncExternalStore(
    subscribe,
    getStaffSessionExpiry,
    getServerSnapshot,
  );
}

/** Whether the session has been found ended, for a caller that is not a component. */
export function getStaffSessionExpiry(): StaffSessionExpiry | undefined {
  return current;
}

/** Forgets everything, as a fresh document would. For tests only: nothing in the application calls it. */
export function resetStaffSessionExpiryForTests(): void {
  current = undefined;
  pendingReads = new Set();
}

function publish(next: StaffSessionExpiry | undefined): void {
  current = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getServerSnapshot(): StaffSessionExpiry | undefined {
  return undefined;
}
