import type { ReactNode } from "react";

import styles from "./staff-kitchen.module.css";

/** A titled box of the kitchen page's middle column, with an optional tag beside the title. */
export function Card({
  title,
  tag,
  className,
  testId,
  children,
}: {
  readonly title: string;
  readonly tag?: string | undefined;
  /** Placement of the card in its column; the look of the box stays this component's. */
  readonly className?: string | undefined;
  readonly testId: string;
  readonly children: ReactNode;
}) {
  return (
    <section
      className={[styles.card, className]
        .filter((name) => name !== undefined)
        .join(" ")}
      data-testid={testId}
    >
      <div className={styles.cardHead}>
        <h2 className={styles.cardTitle}>{title}</h2>
        {tag === undefined ? null : (
          <span className={styles.cardTag}>{tag}</span>
        )}
      </div>
      {children}
    </section>
  );
}
