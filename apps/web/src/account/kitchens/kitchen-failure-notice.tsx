"use client";

import { useAccountKitCopy } from "@/i18n/use-content";

import { FormNotice, RateLimitNotice } from "../account-form-parts";
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
