"use client";

import type { ReactNode } from "react";

import { formatRelativeAge } from "@/account/kitchens/relative-age";
import type { StaffAuditCopy, StaffKitchensCopy } from "@/i18n/content";
import type { AppLocale } from "@/i18n/routing";
import { useStaffAuditCopy, useStaffKitchensCopy } from "@/i18n/use-content";

import { isolated } from "./bidi-isolate";
import { dayAndTimeOf, shopRelativeAgeOf } from "./staff-kitchen-dates";
import styles from "./staff-audit.module.css";
import listStyles from "./staff-kitchens.module.css";
import type {
  StaffAuditEntryWire,
  StaffAuditEventWire,
} from "./staff-kitchens-wire-contract";
import type { StaffAuditListing } from "./staff-audit-listing";

// The rows of the audit log (frames S8B and DS8B): a table on a desktop, cards on a phone, both drawn from the same facts.
// Every string a person typed (an address, a kitchen's name) or the database holds (an action code this build does not
// know) is a React text child inside a first-strong isolate: nothing here builds markup from one, and a name that
// reorders text cannot reorder the words around it.

/** What a row says, worked out once for the table and the cards. */
interface RowFacts {
  readonly event: StaffAuditEventWire;
  readonly when: string;
  readonly whenIso: string;
  readonly ago: string;
  readonly who: string;
  readonly action: string;
  /** The code of an action this build does not name, as text; `undefined` for one it does. */
  readonly unknownCode: string | undefined;
  /** What the action touched: the kitchen, or what the action says when it touched none. */
  readonly object: string;
  /** The client's address and the action's codes and counts, in that order. */
  readonly objectDetails: readonly string[];
}

/** The facts of every row of the listing, with the words they are told in. */
function useRowFacts(
  locale: AppLocale,
  { events, readAtMs }: StaffAuditListing,
): readonly RowFacts[] {
  const copy = useStaffAuditCopy();
  const kitchensCopy = useStaffKitchensCopy();
  return events.map((event) =>
    factsOf({ event, locale, readAtMs, copy, kitchensCopy }),
  );
}

function factsOf({
  event,
  locale,
  readAtMs,
  copy,
  kitchensCopy,
}: {
  readonly event: StaffAuditEventWire;
  readonly locale: AppLocale;
  readonly readAtMs: number;
  readonly copy: StaffAuditCopy;
  readonly kitchensCopy: StaffKitchensCopy;
}): RowFacts {
  const label = actionLabelOf(event.entry, copy);
  const detail = detailOf(event.entry, copy, kitchensCopy);
  const clientEmail = event.subject?.email ?? null;
  const clientAddress = clientEmail === null ? [] : [isolated(clientEmail)];
  const objectOf = objectWordsOf({ event, detail, kitchensCopy });
  return {
    event,
    when: dayAndTimeOf(event.occurredAt, locale),
    whenIso: event.occurredAt,
    ago: formatRelativeAge(
      locale,
      shopRelativeAgeOf(Date.parse(event.occurredAt), readAtMs),
    ),
    who:
      event.actor.email === null
        ? kitchensCopy.noValue
        : isolated(event.actor.email),
    action: label.text,
    unknownCode: label.code,
    object: objectOf.primary,
    objectDetails: [...clientAddress, ...objectOf.detail],
  };
}

/** The words for an action, found by asking the closed `Map`; a code that is not in it is never looked up any other way,
 *  so `constructor` and `__proto__` are a code like any other. */
function actionLabelOf(
  entry: StaffAuditEntryWire,
  copy: StaffAuditCopy,
): { readonly text: string; readonly code: string | undefined } {
  const known =
    entry.kind === "recognised"
      ? copy.actionLabels.get(entry.action)
      : undefined;
  return known === undefined
    ? { text: copy.unknownAction, code: isolated(entry.action) }
    : { text: known, code: undefined };
}

/** What the action's codes say: the change of status, or the page a list was served as. Nothing a person typed. */
function detailOf(
  entry: StaffAuditEntryWire,
  copy: StaffAuditCopy,
  kitchensCopy: StaffKitchensCopy,
): string | undefined {
  if (entry.kind !== "recognised") return undefined;
  switch (entry.action) {
    case "status-changed":
      return copy.details.statusChanged({
        from: kitchensCopy.statuses[entry.detail.from],
        to: kitchensCopy.statuses[entry.detail.to],
      });
    case "kitchens-listed":
      return entry.detail.hasSearch
        ? copy.details.pageWithSearch(entry.detail)
        : copy.details.page(entry.detail);
    case "audit-viewed": {
      const { hasActorFilter, hasActionFilter, hasDateFilter } = entry.detail;
      return hasActorFilter || hasActionFilter || hasDateFilter
        ? copy.details.pageWithFilters(entry.detail)
        : copy.details.page(entry.detail);
    }
    default:
      return undefined;
  }
}

/** The kitchen's name stands first; a row that names no kitchen (a list, the log itself, a kitchen the client deleted)
 *  says what it did instead, or a dash. */
function objectWordsOf({
  event,
  detail,
  kitchensCopy,
}: {
  readonly event: StaffAuditEventWire;
  readonly detail: string | undefined;
  readonly kitchensCopy: StaffKitchensCopy;
}): { readonly primary: string; readonly detail: readonly string[] } {
  const { kitchen } = event;
  if (kitchen === null) {
    return { primary: detail ?? kitchensCopy.noValue, detail: [] };
  }
  const name = kitchen.name;
  const primary =
    name === null || name.trim() === "" ? kitchensCopy.noValue : isolated(name);
  return { primary, detail: detail === undefined ? [] : [detail] };
}

export function AuditTable({
  locale,
  listing,
}: {
  readonly locale: AppLocale;
  readonly listing: StaffAuditListing;
}) {
  const copy = useStaffAuditCopy();
  const rows = useRowFacts(locale, listing);
  return (
    <div
      className={listStyles.tableScroll}
      role="region"
      tabIndex={0}
      aria-label={copy.title}
    >
      <table className={styles.table} data-testid="staff-audit-table">
        <thead>
          <tr>
            <th scope="col">{copy.columns.when}</th>
            <th scope="col">{copy.columns.who}</th>
            <th scope="col">{copy.columns.action}</th>
            <th scope="col">{copy.columns.object}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((facts) => (
            <tr key={facts.event.id} data-testid="staff-audit-row">
              <td>
                <WhenWords facts={facts} />
              </td>
              <td>
                <span className={listStyles.breakable}>{facts.who}</span>
              </td>
              <td>
                <ActionWords facts={facts} />
              </td>
              <td>
                <ObjectWords facts={facts} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AuditCards({
  locale,
  listing,
}: {
  readonly locale: AppLocale;
  readonly listing: StaffAuditListing;
}) {
  const copy = useStaffAuditCopy();
  const rows = useRowFacts(locale, listing);
  return (
    <ul className={styles.cards} data-testid="staff-audit-cards">
      {rows.map((facts) => (
        <li
          key={facts.event.id}
          className={styles.card}
          tabIndex={-1}
          data-event-id={facts.event.id}
          data-testid="staff-audit-row"
        >
          <dl className={styles.cardFacts}>
            <CardFact label={copy.columns.when}>
              <WhenWords facts={facts} />
            </CardFact>
            <CardFact label={copy.columns.who}>
              <span className={listStyles.breakable}>{facts.who}</span>
            </CardFact>
            <CardFact label={copy.columns.action}>
              <ActionWords facts={facts} />
            </CardFact>
            <CardFact label={copy.columns.object}>
              <ObjectWords facts={facts} />
            </CardFact>
          </dl>
        </li>
      ))}
    </ul>
  );
}

function CardFact({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}) {
  return (
    <div className={styles.cardFact}>
      <dt className={styles.cardLabel}>{label}</dt>
      <dd className={styles.cardValue}>{children}</dd>
    </div>
  );
}

function WhenWords({ facts }: { readonly facts: RowFacts }) {
  return (
    <>
      <time dateTime={facts.whenIso} className={styles.when}>
        {facts.when}
      </time>
      <span className={listStyles.sub}>{facts.ago}</span>
    </>
  );
}

function ActionWords({ facts }: { readonly facts: RowFacts }) {
  return (
    <>
      <span className={styles.action}>{facts.action}</span>
      {facts.unknownCode === undefined ? null : (
        <span className={listStyles.sub} data-testid="staff-audit-code">
          {facts.unknownCode}
        </span>
      )}
    </>
  );
}

function ObjectWords({ facts }: { readonly facts: RowFacts }) {
  return (
    <>
      <span className={listStyles.breakable}>{facts.object}</span>
      {facts.objectDetails.length === 0 ? null : (
        <span className={listStyles.sub}>
          {facts.objectDetails.map((part, index) => (
            <span
              key={`${String(index)}:${part}`}
              className={index === 0 ? undefined : listStyles.afterDot}
            >
              {part}
            </span>
          ))}
        </span>
      )}
    </>
  );
}
