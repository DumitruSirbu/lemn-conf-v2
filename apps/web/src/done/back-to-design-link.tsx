"use client";

import type { DesignId } from "@lemnaria/configurator-domain";

import { Link } from "@/i18n/navigation";
import { useContent } from "@/i18n/use-content";
import { editorHref } from "@/review/design-hrefs";

import styles from "./done.module.css";

/** The way back to the design's editor, never prefetched: the confirmation's foot and the already-sent view's draw this
 *  one link, so the two cannot drift. */
export function BackToDesignLink({
  designId,
}: {
  readonly designId: DesignId;
}) {
  const content = useContent().submissionResult;
  return (
    <Link
      prefetch={false}
      className={styles.backToDesign}
      href={editorHref(designId)}
      data-testid="done-back-to-design"
    >
      {content.backToDesign}
    </Link>
  );
}
