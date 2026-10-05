"use client";

import { ConfirmationDialog } from "@/settings/confirmation-dialog";
import { useContent } from "@/i18n/use-content";
import { useRouter } from "@/i18n/navigation";

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
 */
export function BackConfirmationDialog({
  onConfirm,
  onStay,
}: {
  readonly onConfirm: () => void;
  readonly onStay: () => void;
}) {
  const { backConfirm } = useContent().configure;

  return (
    <ConfirmationDialog
      view={{
        title: backConfirm.title,
        body: backConfirm.body,
        confirmLabel: backConfirm.confirm,
        backLabel: backConfirm.stay,
      }}
      testIdPrefix={TEST_ID_PREFIX}
      onConfirm={onConfirm}
      onStay={onStay}
    />
  );
}
