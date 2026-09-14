"use client";

import { useContent } from "@/i18n/use-content";
import { Link } from "@/i18n/navigation";

import styles from "./design-load-error.module.css";

export type DesignLoadFailureReason = "not-found" | "invalid";

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
      <p className={styles.text}>
        {reason === "not-found" ? copy.bodyNotFound : copy.bodyInvalid}
      </p>
      <Link className={styles.startOver} href="/configurator/room">
        {copy.startOver}
      </Link>
    </main>
  );
}
