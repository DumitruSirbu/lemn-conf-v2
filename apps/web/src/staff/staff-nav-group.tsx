"use client";

import { useId } from "react";

import accountStyles from "@/account/account.module.css";

import styles from "./staff.module.css";

// A run of staff pages under one heading, drawn as the desktop's navigation lists it and as the phone's sheet does.

/** How many prices await publication, drawn beside a page's name. */
export interface StaffNavBadge {
  readonly count: number;
}

export interface StaffNavItem {
  readonly key: string;
  readonly href: string;
  readonly label: string;
  /** What a screen reader says for the link when the drawn label and badge are not all of it. */
  readonly accessibleName?: string | undefined;
  readonly isCurrent: boolean;
  readonly badge?: StaffNavBadge | undefined;
}

/** Pages standing under one heading. A group with no heading is drawn as a list with nothing above it. */
export interface StaffNavGroup {
  readonly key: string;
  readonly heading: string | undefined;
  readonly items: readonly StaffNavItem[];
}

/** The number is drawn and not read: the link's accessible name says what it means. */
export function NavBadge({ badge }: { readonly badge: StaffNavBadge }) {
  return (
    <span className={styles.badge} aria-hidden="true">
      {badge.count}
    </span>
  );
}

export function NavGroup({ group }: { readonly group: StaffNavGroup }) {
  const headingId = useId();
  return (
    <div className={styles.navGroup}>
      {group.heading === undefined ? null : (
        <p id={headingId} className={styles.groupHeading}>
          {group.heading}
        </p>
      )}
      <ul
        className={styles.navItems}
        aria-labelledby={group.heading === undefined ? undefined : headingId}
      >
        {group.items.map((item) => (
          <li key={item.key}>
            <a
              className={styles.navItem}
              href={item.href}
              aria-label={item.accessibleName}
              aria-current={item.isCurrent ? "page" : undefined}
            >
              <span className={styles.rowLabel}>{item.label}</span>
              {item.badge === undefined ? null : (
                <NavBadge badge={item.badge} />
              )}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SheetGroup({ group }: { readonly group: StaffNavGroup }) {
  const headingId = useId();
  const isNamed = group.heading !== undefined;
  return (
    <div
      className={accountStyles.menuRows}
      role={isNamed ? "group" : undefined}
      aria-labelledby={isNamed ? headingId : undefined}
    >
      {group.heading === undefined ? null : (
        <p id={headingId} className={styles.groupHeading}>
          {group.heading}
        </p>
      )}
      {group.items.map((item) => (
        <SheetLinkRow
          key={item.key}
          href={item.href}
          label={item.label}
          accessibleName={item.accessibleName}
          isCurrent={item.isCurrent}
          badge={item.badge}
        />
      ))}
    </div>
  );
}

export function SheetLinkRow({
  href,
  label,
  accessibleName,
  isCurrent,
  badge,
}: {
  readonly href: string;
  readonly label: string;
  readonly accessibleName?: string | undefined;
  readonly isCurrent: boolean;
  readonly badge?: StaffNavBadge | undefined;
}) {
  return (
    <a
      className={accountStyles.menuRow}
      href={href}
      aria-label={accessibleName}
      aria-current={isCurrent ? "page" : undefined}
    >
      <span className={styles.rowLabel}>
        {label}
        {badge === undefined ? null : <NavBadge badge={badge} />}
      </span>
      <span className={accountStyles.menuRowMark} aria-hidden="true" />
    </a>
  );
}
