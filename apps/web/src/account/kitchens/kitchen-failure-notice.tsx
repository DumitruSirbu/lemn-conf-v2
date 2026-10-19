"use client";

import { useAccountKitCopy, useAccountKitchensCopy } from "@/i18n/use-content";

import { FormNotice, RateLimitNotice } from "../account-form-parts";
import styles from "./kitchens.module.css";
import type { ListFailure } from "./use-kitchens";

/** Why a request about the kitchens could not be had, as the notice that tells it: the wait of a limit, the service not
 *  being there, no answer at all, or a request that could not be sent. */
export function FailureNotice({ failure }: { readonly failure: ListFailure }) {
  const kit = useAccountKitCopy();
  switch (failure.kind) {
    case "rate-limited":
      return <RateLimitNotice notice={failure.notice} />;
    case "unavailable":
      return (
        <FormNotice tone="error" title={kit.unavailable.title}>
          {kit.unavailable.body}
        </FormNotice>
      );
    case "offline":
      return (
        <FormNotice tone="error" title={kit.offline.title}>
          {kit.offline.body}
        </FormNotice>
      );
    case "failed":
      return (
        <FormNotice tone="error" title={kit.requestFailed.title}>
          {kit.requestFailed.body}
        </FormNotice>
      );
  }
}

/** A failure that stays until the person closes it or the next act succeeds: the one a toast is too short to tell. */
export function DismissibleFailureNotice({
  failure,
  onDismiss,
}: {
  readonly failure: ListFailure;
  readonly onDismiss: () => void;
}) {
  const copy = useAccountKitchensCopy();
  return (
    <div className={styles.dismissibleNotice}>
      <FailureNotice failure={failure} />
      <button
        type="button"
        className={styles.noticeDismiss}
        onClick={onDismiss}
      >
        {copy.actions.close}
      </button>
    </div>
  );
}
