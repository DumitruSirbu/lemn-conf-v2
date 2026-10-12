"use client";

import type { ComponentProps } from "react";

import { Link } from "@/i18n/navigation";

type StartLinkProps = Omit<
  ComponentProps<typeof Link>,
  "href" | "prefetch" | "replace"
>;

/**
 * The way back to the start of the configurator, `/{locale}`, which is the resume route (D3/D4). `prefetch={false}`:
 * Next prefetches a visible `Link` by requesting its target ahead of a click, and that route looks the visitor up and,
 * on a well-formed cookie matching nothing, sends the clear as a side effect of the customer merely looking at this
 * link (review round 1, L1.7).
 */
export function StartLink(anchorProps: StartLinkProps) {
  return <Link prefetch={false} href="/" {...anchorProps} />;
}
