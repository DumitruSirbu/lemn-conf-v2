"use client";

import { judgeKitchenName } from "@lemnaria/configurator-domain";
import { useCallback, useMemo, useRef, useState } from "react";

import type { AccountFieldIssue, AccountKitchensCopy } from "@/i18n/content";
import type { AppLocale } from "@/i18n/routing";
import { useAccountKitchensCopy } from "@/i18n/use-content";

import { rateLimitNoticeOf, type SignedInOutcome } from "../account-answer";
import { loginPathWithReason } from "../login-arrival";
import { leaveFor } from "../on-signed-in";
import {
  sendSignedInRequest,
  type KitchenAction,
} from "../send-account-request";
import { copyNameOf } from "./kitchen-copy-name";
import type { ListedKitchen } from "./kitchens-answer";
import type { ListingChange } from "./listing-change";
import type { ListFailure } from "./use-kitchens";

// What a signed-in client does to the kitchens in their list (Lot 2 frames A9D to A9H and A17): rename, copy, delete a
// draft and hide a sent kitchen. Each act is one request; its answer is told to the list (so the cards follow without a
// new read), to the screen (a toast, or a notice above the list) and to the caller that asked (the form or dialog it
// stands in). The account is the session's: no request names one.

/** The copy that is being made, drawn as a busy card at the head of the list until the server answers. */
export interface PendingCopy {
  readonly name: string;
}

/** Answers every act can come to besides its own. */
type CommonResult =
  /** The document is on its way out (sign-in, or the forbidden screen): the caller stays as it is. */
  | { readonly kind: "left" }
  /** The kitchen is not the account's to act on any more (hidden, deleted, or never theirs): its card has been removed. */
  | { readonly kind: "gone" }
  | { readonly kind: "failed"; readonly failure: ListFailure };

export type RenameResult =
  | { readonly kind: "renamed" }
  | { readonly kind: "refused"; readonly issue: AccountFieldIssue }
  | CommonResult;

export type RemoveResult =
  | { readonly kind: "removed" }
  /** The server holds the kitchen as the other kind than the card did: the card has been corrected, nothing was removed. */
  | { readonly kind: "conflict" }
  | CommonResult;

export interface KitchenActions {
  readonly rename: (
    kitchen: ListedKitchen,
    name: string,
  ) => Promise<RenameResult>;
  /** `sourceName` is the name the card shows: the given one, or the one its facts generate. */
  readonly duplicate: (kitchen: ListedKitchen, sourceName: string) => void;
  readonly deleteDraft: (kitchen: ListedKitchen) => Promise<RemoveResult>;
  readonly hideSent: (kitchen: ListedKitchen) => Promise<RemoveResult>;
  /** A copy is out: a second would race the first, so the menus mark "Duplică" as busy meanwhile. */
  readonly isCopying: boolean;
}

/** What the screen draws of the acts that are not a form's or a dialog's own. */
export interface KitchenActionFeedback {
  /** What was done, in a sentence; `undefined` while nothing has been. */
  readonly toast: string | undefined;
  readonly clearToast: () => void;
  /** Why a copy could not be made, where a toast is too short to tell it. */
  readonly copyFailure: ListFailure | undefined;
  readonly pendingCopy: PendingCopy | undefined;
}

export interface KitchenActionsInput {
  readonly locale: AppLocale;
  readonly changeListing: (change: ListingChange) => void;
  readonly forbid: () => void;
}

export function useKitchenActions({
  locale,
  changeListing,
  forbid,
}: KitchenActionsInput): {
  readonly actions: KitchenActions;
  readonly feedback: KitchenActionFeedback;
} {
  const copy = useAccountKitchensCopy();
  const [toast, setToast] = useState<string | undefined>(undefined);
  const [copyFailure, setCopyFailure] = useState<ListFailure | undefined>(
    undefined,
  );
  const [pendingCopy, setPendingCopy] = useState<PendingCopy | undefined>(
    undefined,
  );
  const isCopyOutRef = useRef(false);

  const environment = useMemo<ActionEnvironment>(
    () => ({ locale, copy, changeListing, forbid, tell: setToast }),
    [locale, copy, changeListing, forbid],
  );

  const duplicate = useCallback(
    (kitchen: ListedKitchen, sourceName: string): void => {
      if (isCopyOutRef.current) return;
      const name = judgedCopyName(environment, sourceName);
      if (name === undefined) {
        setToast(copy.duplicate.failed);
        return;
      }
      isCopyOutRef.current = true;
      setCopyFailure(undefined);
      setPendingCopy({ name });
      void duplicateKitchen(environment, kitchen, name).then((result) => {
        isCopyOutRef.current = false;
        setPendingCopy(undefined);
        if (result.kind === "failed") {
          tellCopyFailure(result.failure, setToast, setCopyFailure, copy);
        }
      });
    },
    [environment, copy],
  );

  const actions = useMemo<KitchenActions>(
    () => ({
      rename: (kitchen, name) => renameKitchen(environment, kitchen, name),
      duplicate,
      deleteDraft: (kitchen) => deleteDraftKitchen(environment, kitchen),
      hideSent: (kitchen) => hideSentKitchen(environment, kitchen),
      isCopying: pendingCopy !== undefined,
    }),
    [environment, duplicate, pendingCopy],
  );

  const clearToast = useCallback(() => {
    setToast(undefined);
  }, []);

  return {
    actions,
    feedback: { toast, clearToast, copyFailure, pendingCopy },
  };
}

/** What an act needs of the screen it is made on. */
interface ActionEnvironment {
  readonly locale: AppLocale;
  readonly copy: AccountKitchensCopy;
  readonly changeListing: (change: ListingChange) => void;
  readonly forbid: () => void;
  /** Says what was done, in the toast. */
  readonly tell: (message: string) => void;
}

async function renameKitchen(
  environment: ActionEnvironment,
  kitchen: ListedKitchen,
  name: string,
): Promise<RenameResult> {
  const outcome = await sendKitchenAction(kitchen.id, { kind: "rename", name });
  if (outcome.kind === "renamed") {
    environment.changeListing({
      kind: "rename",
      id: kitchen.id,
      name: outcome.name,
    });
    return { kind: "renamed" };
  }
  const issue = firstIssueOf(outcome);
  if (issue !== undefined) return { kind: "refused", issue };
  return settleCommon(environment, kitchen.id, outcome);
}

type CopyResult = { readonly kind: "created" } | CommonResult;

async function duplicateKitchen(
  environment: ActionEnvironment,
  kitchen: ListedKitchen,
  name: string,
): Promise<CopyResult> {
  const outcome = await sendKitchenAction(kitchen.id, {
    kind: "duplicate",
    name,
  });
  if (outcome.kind !== "created") {
    return settleCommon(environment, kitchen.id, outcome);
  }
  environment.changeListing({
    kind: "prepend",
    kitchen: copyOf(kitchen, outcome.id, name),
  });
  environment.tell(environment.copy.duplicate.created);
  return { kind: "created" };
}

async function deleteDraftKitchen(
  environment: ActionEnvironment,
  kitchen: ListedKitchen,
): Promise<RemoveResult> {
  const outcome = await sendKitchenAction(kitchen.id, { kind: "delete" });
  const { copy } = environment;
  if (outcome.kind === "succeeded") {
    return removed(environment, kitchen.id, copy.remove.deleted);
  }
  if (outcome.kind === "conflict-sent") {
    return corrected(environment, kitchen.id, true, copy.remove.sentMeanwhile);
  }
  return settleCommon(environment, kitchen.id, outcome);
}

async function hideSentKitchen(
  environment: ActionEnvironment,
  kitchen: ListedKitchen,
): Promise<RemoveResult> {
  const outcome = await sendKitchenAction(kitchen.id, { kind: "hide" });
  const { copy } = environment;
  if (outcome.kind === "succeeded") {
    return removed(environment, kitchen.id, copy.remove.hidden);
  }
  if (outcome.kind === "conflict-not-sent") {
    return corrected(
      environment,
      kitchen.id,
      false,
      copy.remove.notSentMeanwhile,
    );
  }
  return settleCommon(environment, kitchen.id, outcome);
}

function removed(
  environment: ActionEnvironment,
  kitchenId: string,
  message: string,
): RemoveResult {
  environment.changeListing({ kind: "remove", id: kitchenId });
  environment.tell(message);
  return { kind: "removed" };
}

/** The server holds the kitchen as the other kind than the card did: the card is corrected and says why the act did not
 *  happen. */
function corrected(
  environment: ActionEnvironment,
  kitchenId: string,
  isSent: boolean,
  message: string,
): RemoveResult {
  environment.changeListing({ kind: "mark-sent", id: kitchenId, isSent });
  environment.tell(message);
  return { kind: "conflict" };
}

/** The answers every act can come to: the session ended, the account may not, the kitchen is gone, or the request could
 *  not be had. */
function settleCommon(
  environment: ActionEnvironment,
  kitchenId: string,
  outcome: SignedInOutcome,
): CommonResult {
  switch (outcome.kind) {
    case "unauthenticated":
      leaveFor(loginPathWithReason(environment.locale, "session-expired"));
      return { kind: "left" };
    case "forbidden":
      environment.forbid();
      return { kind: "left" };
    case "kitchen-unavailable":
      environment.changeListing({ kind: "remove", id: kitchenId });
      environment.tell(environment.copy.alreadyGone);
      return { kind: "gone" };
    default:
      return { kind: "failed", failure: failureOf(outcome) };
  }
}

/** The copy's name, in the form the server will keep, or nothing when it is not one it would keep. */
function judgedCopyName(
  environment: ActionEnvironment,
  sourceName: string,
): string | undefined {
  const judgement = judgeKitchenName(
    copyNameOf({
      sourceName,
      composeCopyName: environment.copy.duplicate.nameOf,
    }),
  );
  return judgement.ok ? judgement.name : undefined;
}

/** A failed copy says so in the toast when nothing more is known, and otherwise in a notice that can say why (a limit's
 *  wait, no connection). */
function tellCopyFailure(
  failure: ListFailure,
  tell: (message: string) => void,
  showNotice: (failure: ListFailure) => void,
  copy: AccountKitchensCopy,
): void {
  if (failure.kind === "failed") {
    tell(copy.duplicate.failed);
    return;
  }
  showNotice(failure);
}

function sendKitchenAction(
  id: string,
  action: KitchenAction,
): Promise<SignedInOutcome> {
  return sendSignedInRequest({ flow: "kitchen-action", id, action });
}

/** The refusal of the kitchen's name, if the answer was one: the first of the issues the classifier placed. */
function firstIssueOf(outcome: SignedInOutcome): AccountFieldIssue | undefined {
  return outcome.kind === "invalid-input" ? outcome.issues[0] : undefined;
}

/** Why an act that none of its own words explains could not be done. */
function failureOf(outcome: SignedInOutcome): ListFailure {
  switch (outcome.kind) {
    case "rate-limited":
      return {
        kind: "rate-limited",
        notice: rateLimitNoticeOf(outcome.wait, Date.now()),
      };
    case "unavailable":
      return { kind: "unavailable" };
    case "unanswered":
      return { kind: "offline" };
    default:
      return { kind: "failed" };
  }
}

/** The card of a copy just made: the source's facts and document (the server copies the stored document as it is), a
 *  new id and name, and no sent mark. */
function copyOf(
  source: ListedKitchen,
  id: string,
  name: string,
): ListedKitchen {
  const now = new Date();
  return {
    ...source,
    id,
    name,
    updatedAtMs: now.getTime(),
    updatedAtIso: now.toISOString(),
    isSent: false,
  };
}
