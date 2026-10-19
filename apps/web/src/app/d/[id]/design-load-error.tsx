"use client";

import { useLocale } from "next-intl";

import { accountPathOf } from "@/account/account-shell";
import { useAccountSession } from "@/account/session/use-account-session";
import { Link } from "@/i18n/navigation";
import { useAccountControlCopy, useContent } from "@/i18n/use-content";

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
 *  partial hydration or a silent redirect (M2 "Loading is fail-whole" acceptance criterion). A signed-in client is also
 *  offered their kitchens. That depends on the session alone, never on the reason, so what is drawn tells nothing about
 *  why the design was refused. */
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
      <MyKitchensAction />
      <Link className={styles.startOver} href="/configurator/room">
        {copy.startOver}
      </Link>
    </main>
  );
}

/** Only a client has a list of kitchens to go to. While the session is unknown, and for a visitor or staff, nothing is
 *  drawn. A plain anchor: the account pages are documents of their own. */
function MyKitchensAction() {
  const locale = useLocale();
  const session = useAccountSession();
  const copy = useAccountControlCopy();
  if (session.kind !== "client") return null;
  return (
    <a className={styles.myKitchens} href={accountPathOf(locale, "kitchens")}>
      {copy.myKitchens}
    </a>
  );
}
