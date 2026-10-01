"use client";

import { useContent } from "@/i18n/use-content";
import { Link } from "@/i18n/navigation";

import styles from "./design-load-error.module.css";

/**
 * `"unavailable"` is M7 wave 7E3b's addition (ADR 0114 decision 5, Amendment D5): the design opened
 * only in its owning browser, and the refusal must not say which of "wrong browser", "no cookie" or
 * "unknown id" it was. `/[locale]/d/{id}` is its only caller — `/[locale]/s/{token}` keeps
 * `"not-found"`, because a revoked share link is not about a browser at all.
 */
export type DesignLoadFailureReason = "not-found" | "invalid" | "unavailable";

function bodyFor(
  reason: DesignLoadFailureReason,
  copy: ReturnType<typeof useContent>["designLoadError"],
): string {
  switch (reason) {
    case "not-found":
      return copy.bodyNotFound;
    case "invalid":
      return copy.bodyInvalid;
    case "unavailable":
      return copy.bodyUnavailable;
    default:
      return assertNever(reason);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled design-load failure reason: ${String(value)}`);
}

/** The recoverable, visible failure state the load-by-link route falls back to instead of a
 *  partial hydration or a silent redirect (M2 "Loading is fail-whole" acceptance criterion). */
export function DesignLoadError({
  reason,
}: {
  reason: DesignLoadFailureReason;
}) {
  const copy = useContent().designLoadError;
  return (
    <main className={styles.screen} data-testid="design-load-error">
      <h1 className={styles.title}>{copy.title}</h1>
      <p className={styles.text}>{bodyFor(reason, copy)}</p>
      <Link className={styles.startOver} href="/configurator/room">
        {copy.startOver}
      </Link>
    </main>
  );
}
