"use client";

import { useRef, useState, useSyncExternalStore } from "react";

import type { KitchenViewed3dVersion } from "@lemnaria/configurator-domain";

import type { AppLocale } from "@/i18n/routing";
import { useStaffKitchenCopy } from "@/i18n/use-content";

import { Card } from "./staff-kitchen-card";
import styles from "./staff-kitchen.module.css";
import { staffKitchen3dPathOf } from "./staff-paths";

const WEB_ORIGIN_PATTERN = /^https?:\/\/[^/]+$/;

/** The names of the two answers in the link copy, so an outcome is also the key of its sentence. */
type CopyOutcome = "copied" | "copyRefused";

/** The outcome belongs to the address it was asked for, so a version switch does not keep announcing the old one. */
interface AddressCopy {
  readonly address: string;
  readonly outcome: CopyOutcome;
}

/**
 * The read-only link to the kitchen: its address as selectable text, a button that copies it, and the link that opens
 * it in a new tab, so this page stays where it is. `version` is the copy the version switch shows, and is absent when
 * the page has no switch. No share link is minted: the address is the staff 3D route, which only staff can open.
 */
export function OpenIn3dLink({
  locale,
  kitchenId,
  version,
}: {
  readonly locale: AppLocale;
  readonly kitchenId: string;
  readonly version: KitchenViewed3dVersion | undefined;
}) {
  const copy = useStaffKitchenCopy();
  const origin = usePageOrigin();
  const path = staffKitchen3dPathOf({ locale, kitchenId, version });
  const address = `${origin}${path}`;
  const [attempt, setAttempt] = useState<AddressCopy | null>(null);
  const latestPress = useRef(0);
  const outcome = attempt?.address === address ? attempt.outcome : null;

  async function copyAddress(): Promise<void> {
    latestPress.current += 1;
    const press = latestPress.current;
    // Emptying the region first lets a second identical answer be announced again.
    setAttempt(null);
    const answer = await writeToClipboard(address);
    if (press === latestPress.current) setAttempt({ address, outcome: answer });
  }

  return (
    <Card
      title={copy.link.title}
      tag={copy.link.badge}
      className={styles.linkCell}
      testId="staff-kitchen-link"
    >
      <p
        className={styles.linkAddress}
        data-testid="staff-kitchen-link-address"
      >
        {address}
      </p>
      <div className={styles.linkActions}>
        <button
          type="button"
          className={styles.linkCopy}
          onClick={() => void copyAddress()}
          data-testid="staff-kitchen-link-copy"
        >
          {copy.link.copy}
        </button>
        <a
          className={styles.open3d}
          href={path}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="staff-kitchen-open-3d"
        >
          {copy.open3d}
        </a>
      </div>
      <div>
        <p className={styles.hint}>{copy.link.note}</p>
        <p
          className={styles.linkOutcome}
          role="status"
          aria-live="polite"
          data-testid="staff-kitchen-link-outcome"
        >
          {outcome === null ? "" : copy.link[outcome]}
        </p>
      </div>
    </Card>
  );
}

/**
 * The origin the staff member is on. The server and the first client render use no origin, so the markup agrees and
 * nothing mismatches on hydration; the page's own origin follows. It is never taken from a request's `Host` or
 * `X-Forwarded-Host`, which a caller can forge. A page whose origin is not a web origin (a sandboxed document reads
 * "null") has none, and the address stays the path.
 */
function usePageOrigin(): string {
  return useSyncExternalStore(
    subscribeToNothing,
    readPageOrigin,
    noOriginOnServer,
  );
}

function subscribeToNothing(): () => void {
  return () => undefined;
}

function readPageOrigin(): string {
  const { origin } = window.location;
  return WEB_ORIGIN_PATTERN.test(origin) ? origin : "";
}

function noOriginOnServer(): string {
  return "";
}

/** A browser without the clipboard, a page it refuses, and a rejected write all answer `copyRefused`; nothing throws. */
async function writeToClipboard(text: string): Promise<CopyOutcome> {
  try {
    await navigator.clipboard.writeText(text);
    return "copied";
  } catch {
    return "copyRefused";
  }
}
