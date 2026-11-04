"use client";

import { useStaffChangesCopy } from "@/i18n/use-content";

import styles from "./staff-kitchen.module.css";
import type { SeenMark } from "./use-mark-seen";

// What opening a changed kitchen came to (frame D10B): marked seen, or why it was not. The region stays mounted so the
// words are announced when they arrive; until then it is empty and takes no room.

export function SeenNotice({ mark }: { readonly mark: SeenMark }) {
  const copy = useStaffChangesCopy();
  const sentences = {
    marked: copy.markedSeen,
    "changed-again": copy.changedWhileOpen,
    failed: copy.markSeenFailed,
  } as const;
  return (
    <div
      role="status"
      className={mark.kind === "idle" ? styles.liveRegion : styles.announcement}
      data-tone={mark.kind === "marked" ? undefined : "warning"}
      data-testid="staff-kitchen-seen-notice"
    >
      {mark.kind === "idle" ? null : sentences[mark.kind]}
    </div>
  );
}
