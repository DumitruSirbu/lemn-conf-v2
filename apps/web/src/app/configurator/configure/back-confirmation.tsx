"use client";

import {
  isSessionAnswerDefinite,
  useAccountSession,
} from "@/account/session/use-account-session";
import { ConfirmationDialog } from "@/settings/confirmation-dialog";
import { useContent } from "@/i18n/use-content";
import { useRouter } from "@/i18n/navigation";
import { useConfiguratorStore } from "@/store/configurator-store";

import { recordEditedEditorLeft } from "./back-guard";

const TEST_ID_PREFIX = "back-confirm";

/**
 * The question both back links ask before leaving for Step 1. Mounted only while it is open, which
 * is also what keeps the router hook out of every render that is not a confirmation.
 *
 * Confirming is the same navigation the link would have made and nothing else: no request, and the
 * design stays at its own link (ADR 0111 decision 5).
 */
export function BackConfirmation({
  roomHref,
  onStay,
}: {
  readonly roomHref: string;
  readonly onStay: () => void;
}) {
  const router = useRouter();

  return (
    <BackConfirmationDialog
      onConfirm={() => {
        router.push(roomHref);
      }}
      onStay={onStay}
    />
  );
}

/**
 * The same question, for a caller that leaves some other way than a link — the browser's Back
 * (`use-back-guard.ts`). The wording is the one set of leaves, whoever asks.
 *
 * Leaving loses nothing under autosave, so the body says what is kept, and what is kept differs by who is asking
 * (plan M8B Lot 2 section 14.2, U15-3): `bodyClient` only on a definite signed-in client answer, `bodyVisitor` on every
 * other state, the pending, the failed and the signed-out ones included.
 *
 * Confirming also tells Step 1 that an edited editor has been left (`recordEditedEditorLeft`, U15-4), whichever way the
 * customer leaves: the link's navigation and the browser's Back both end here.
 */
export function BackConfirmationDialog({
  onConfirm,
  onStay,
}: {
  readonly onConfirm: () => void;
  readonly onStay: () => void;
}) {
  const { backConfirm } = useContent().configure;
  const body = useIsDefiniteClient()
    ? backConfirm.bodyClient
    : backConfirm.bodyVisitor;

  return (
    <ConfirmationDialog
      view={{
        title: backConfirm.title,
        body,
        confirmLabel: backConfirm.confirm,
        backLabel: backConfirm.stay,
      }}
      testIdPrefix={TEST_ID_PREFIX}
      onConfirm={() => {
        recordEditedEditorLeft(useConfiguratorStore.getState());
        onConfirm();
      }}
      onStay={onStay}
    />
  );
}

/**
 * Whether the server has said, on this document, that a client is signed in. The session state tells a client from
 * staff by `design.read.own`, which the role holds as a pair with `design.edit.own` (`capabilities.ts`,
 * `CLIENT_DESIGN_CAPABILITIES`), so a `client` state is a `design.edit.own` holder. An answer that is not the server's
 * (pending, or a failed read standing in as anonymous) is not enough.
 */
function useIsDefiniteClient(): boolean {
  const session = useAccountSession();
  return session.kind === "client" && isSessionAnswerDefinite();
}
