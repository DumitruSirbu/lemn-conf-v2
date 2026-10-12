"use client";

import type { DesignId } from "@lemnaria/configurator-domain";
import type { ComponentProps } from "react";

import { Link } from "@/i18n/navigation";

type ReviewLinkProps = Omit<
  ComponentProps<typeof Link>,
  "href" | "prefetch" | "replace"
> & { readonly designId: DesignId };

/**
 * The one way from the contact page to the design's review: a client navigation that pushes a history entry and asks
 * the server for the review's page, so the review shows the stored copy and not the one this page was opened from.
 * Never prefetched, never a step back, and never a replacement of this page's entry.
 */
export function ReviewLink({ designId, ...anchorProps }: ReviewLinkProps) {
  return (
    <Link prefetch={false} href={`/d/${designId}/review`} {...anchorProps} />
  );
}
