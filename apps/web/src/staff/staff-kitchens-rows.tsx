"use client";

import {
  isDesignId,
  kitchenSummaryOf,
  type Design,
} from "@lemnaria/configurator-domain";

import { formatRelativeAge } from "@/account/kitchens/relative-age";
import type { StaffKitchensCopy } from "@/i18n/content";
import type { AppLocale } from "@/i18n/routing";
import { useStaffKitchensCopy } from "@/i18n/use-content";

import { dayOf, shopRelativeAgeOf } from "./staff-kitchen-dates";
import styles from "./staff-kitchens.module.css";
import type {
  StaffListedKitchenWire,
  StaffRequestStatusWire,
  StaffThumbnailDesign,
} from "./staff-kitchens-wire-contract";
import type { StaffKitchensListing } from "./use-staff-kitchens";

// The rows of the staff list (frames S2B and DS2B): a table on a desktop, cards on a phone, both drawn from the same facts.
// Every string a client typed (a name, an address, a phone) is a React text child: nothing here builds markup from one.

/** What a row says, worked out once for the table and the cards. */
interface RowFacts {
  readonly row: StaffListedKitchenWire;
  /** The full name: the stylesheet clips it to two lines, the text and the link's name never are. */
  readonly name: string;
  readonly href: string;
  readonly sentDate: string | undefined;
  readonly modifiedAgo: string;
  readonly modifiedAtIso: string;
}

function factsOf({
  row,
  locale,
  copy,
  readAtMs,
}: {
  readonly row: StaffListedKitchenWire;
  readonly locale: AppLocale;
  readonly copy: StaffKitchensCopy;
  readonly readAtMs: number;
}): RowFacts {
  const age = shopRelativeAgeOf(Date.parse(row.updatedAt), readAtMs);
  return {
    row,
    name: nameOf(row, copy),
    href: `/${locale}/staff/kitchens/${row.id}`,
    sentDate: row.sentAt === null ? undefined : dayOf(row.sentAt, locale),
    modifiedAgo: formatRelativeAge(locale, age),
    modifiedAtIso: row.updatedAt,
  };
}

/** The name the client gave, else the one the room's facts generate, else a plain word. */
function nameOf(row: StaffListedKitchenWire, copy: StaffKitchensCopy): string {
  if (row.name !== null && row.name.trim() !== "") return row.name;
  if (row.design === null) return copy.unnamedKitchen;
  return copy.kitchenName(
    kitchenSummaryOf(documentOfThumbnail(row.design, row.updatedAt)),
  );
}

/**
 * The name generator reads a whole document and the list carries only the part a thumbnail draws. The room and the
 * settings are the real ones; the preset id and the two timestamps are never read by it, so they are filled in from the row.
 */
function documentOfThumbnail(
  design: StaffThumbnailDesign,
  updatedAt: string,
): Design {
  return { ...design, presetId: null, createdAt: updatedAt, updatedAt };
}

export function KitchensTable({
  locale,
  listing,
}: {
  readonly locale: AppLocale;
  readonly listing: StaffKitchensListing;
}) {
  const copy = useStaffKitchensCopy();
  return (
    <div
      className={styles.tableScroll}
      role="region"
      tabIndex={0}
      aria-label={copy.title}
    >
      <table
        className={styles.table}
        aria-label={copy.title}
        data-testid="staff-kitchens-table"
      >
        <thead>
          <tr>
            <th scope="col">{copy.columns.image}</th>
            <th scope="col">{copy.columns.kitchen}</th>
            <th scope="col">{copy.columns.client}</th>
            <th scope="col">{copy.columns.phone}</th>
            <th scope="col">{copy.columns.state}</th>
            <th scope="col">{copy.columns.status}</th>
            <th scope="col">{copy.columns.sentAt}</th>
            <th scope="col">{copy.columns.modified}</th>
            <th scope="col">{copy.columns.action}</th>
          </tr>
        </thead>
        <tbody>
          {listing.rows.map((row) => (
            <TableRow
              key={row.id}
              facts={factsOf({ row, locale, copy, readAtMs: listing.readAtMs })}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TableRow({ facts }: { readonly facts: RowFacts }) {
  const copy = useStaffKitchensCopy();
  const { row } = facts;
  return (
    <tr data-testid="staff-kitchen-row">
      <td aria-hidden="true">
        <span className={styles.thumb} />
      </td>
      <th scope="row" className={styles.nameCell}>
        <span className={styles.clamped} title={facts.name}>
          {facts.name}
        </span>
      </th>
      <td>
        <ClientCell client={row.client} />
      </td>
      <td>
        <PhoneCell phone={row.client?.phone ?? null} />
      </td>
      <td>
        <KitchenBadges row={row} />
      </td>
      <td>
        <StatusCell row={row} />
      </td>
      <td>{facts.sentDate ?? copy.noValue}</td>
      <td>
        <time dateTime={facts.modifiedAtIso}>{facts.modifiedAgo}</time>
      </td>
      <td>
        <OpenLink facts={facts} />
      </td>
    </tr>
  );
}

export function KitchenCards({
  locale,
  listing,
}: {
  readonly locale: AppLocale;
  readonly listing: StaffKitchensListing;
}) {
  const copy = useStaffKitchensCopy();
  return (
    <ul className={styles.cards} data-testid="staff-kitchens-cards">
      {listing.rows.map((row) => (
        <KitchenCard
          key={row.id}
          facts={factsOf({ row, locale, copy, readAtMs: listing.readAtMs })}
        />
      ))}
    </ul>
  );
}

function KitchenCard({ facts }: { readonly facts: RowFacts }) {
  const copy = useStaffKitchensCopy();
  const { row } = facts;
  const phone = row.client?.phone ?? null;
  return (
    <li className={styles.card} data-testid="staff-kitchen-row">
      <div className={styles.cardMain}>
        <span className={styles.thumb} aria-hidden="true" />
        <div className={styles.cardInfo}>
          <div className={styles.badgeRow}>
            <KitchenBadges row={row} />
            <StatusBadges status={row.isSent ? row.requestStatus : null} />
          </div>
          <span className={styles.clamped} title={facts.name}>
            {facts.name}
          </span>
          <ClientLine client={row.client} />
          <span className={styles.line}>
            {phone === null ? (
              copy.noPhone
            ) : (
              <>
                {phone}
                <span className={styles.afterDot}>{copy.phoneUnverified}</span>
              </>
            )}
          </span>
          <span className={styles.line}>
            {facts.sentDate === undefined
              ? copy.modifiedAgo(facts.modifiedAgo)
              : copy.sentOn(facts.sentDate)}
          </span>
        </div>
      </div>
      <OpenLink facts={facts} />
    </li>
  );
}

function ClientCell({
  client,
}: {
  readonly client: StaffListedKitchenWire["client"];
}) {
  const copy = useStaffKitchensCopy();
  if (client === null)
    return <span className={styles.muted}>{copy.noAccount}</span>;
  return (
    <>
      <bdi className={styles.breakable}>{client.email}</bdi>
      {client.name === null ? null : (
        <bdi className={styles.sub}>{client.name}</bdi>
      )}
    </>
  );
}

function ClientLine({
  client,
}: {
  readonly client: StaffListedKitchenWire["client"];
}) {
  const copy = useStaffKitchensCopy();
  if (client === null)
    return <span className={styles.line}>{copy.noAccount}</span>;
  return (
    <span className={styles.line}>
      <bdi>{client.email}</bdi>
      {client.name === null ? null : (
        <bdi className={styles.afterDot}>{client.name}</bdi>
      )}
    </span>
  );
}

function PhoneCell({ phone }: { readonly phone: string | null }) {
  const copy = useStaffKitchensCopy();
  if (phone === null) return <>{copy.noValue}</>;
  return (
    <>
      <span className={styles.breakable}>{phone}</span>
      <span className={styles.sub}>{copy.phoneUnverified}</span>
    </>
  );
}

/** Sent or draft, and whether the client hid it. Each is a word; the colour and the mark only agree with it. */
function KitchenBadges({ row }: { readonly row: StaffListedKitchenWire }) {
  const copy = useStaffKitchensCopy();
  return (
    <span className={styles.badges}>
      <span className={styles.badge} data-kind={row.isSent ? "sent" : "draft"}>
        {row.isSent ? copy.badges.sent : copy.badges.draft}
      </span>
      {row.isHidden ? (
        <span className={styles.badge} data-kind="hidden">
          {copy.badges.hidden}
        </span>
      ) : null}
    </span>
  );
}

function StatusCell({ row }: { readonly row: StaffListedKitchenWire }) {
  const copy = useStaffKitchensCopy();
  if (!row.isSent || row.requestStatus === null) return <>{copy.noValue}</>;
  return <StatusBadges status={row.requestStatus} />;
}

/** The request's status as a word. A stored status this build does not name is a neutral badge of its own and never
 *  takes the look of a new request. */
function StatusBadges({ status }: { readonly status: StaffRequestStatusWire }) {
  const copy = useStaffKitchensCopy();
  if (status === null) return null;
  return (
    <span className={styles.badge} data-kind="status" data-status={status}>
      {copy.statuses[status]}
    </span>
  );
}

/** Only a kitchen with the id of a design can be opened: any other id the list names answers 404 by design, so its row
 *  is drawn without the link rather than with one that leads nowhere. */
function OpenLink({ facts }: { readonly facts: RowFacts }) {
  const copy = useStaffKitchensCopy();
  if (!isDesignId(facts.row.id)) return null;
  return (
    <a
      className={styles.open}
      href={facts.href}
      data-row-id={facts.row.id}
      aria-label={copy.openNamed(facts.name)}
    >
      {copy.open}
    </a>
  );
}
