"use client";

import { useEffect, useRef, useSyncExternalStore, type RefObject } from "react";

import { kitchenSummaryOf, type Design } from "@lemnaria/configurator-domain";

import {
  formatRelativeAge,
  relativeAgeOf,
} from "@/account/kitchens/relative-age";
import type { StaffKitchensCopy } from "@/i18n/content";
import type { AppLocale } from "@/i18n/routing";
import { useStaffKitchensCopy } from "@/i18n/use-content";
import { matchesMedia } from "@/lib/matches-media";

import styles from "./staff-kitchens.module.css";
import { StaffKitchenFilters } from "./staff-kitchen-filters";
import {
  EmptyKitchens,
  FailedKitchens,
  LoadingKitchens,
  NoResults,
} from "./staff-kitchens-states";
import type {
  StaffListedKitchenWire,
  StaffRequestStatusWire,
  StaffThumbnailDesign,
} from "./staff-kitchens-wire-contract";
import { StaffPagination } from "./staff-pagination";
import {
  StaffForbiddenScreen,
  StaffShell,
  type StaffShellContext,
} from "./staff-shell";
import {
  useStaffKitchens,
  type MoreState,
  type RowFocusRequest,
  type StaffKitchens,
  type StaffKitchensListing,
} from "./use-staff-kitchens";

// "Bucătării clienți" (Lot 3 frames S2A to S2F, DS2A to DS2F): every client's kitchens, sent and draft, a page at a time.
// A desktop draws a table and numbered pages, a phone draws cards and "Încarcă mai multe"; both draw the same rows. Every
// string a client typed (a name, an address, a phone) is a React text child: nothing here builds markup from one.

/** Where the stylesheet turns the table on; the one number, in the one place the script has to know it. */
const DESKTOP_MEDIA_QUERY = "(min-width: 900px)";

export function StaffKitchensScreen({
  locale,
  context,
}: {
  readonly locale: AppLocale;
  readonly context: StaffShellContext;
}) {
  const kitchens = useStaffKitchens(locale);
  if (kitchens.state.phase === "forbidden") {
    return (
      <StaffForbiddenScreen locale={locale} page="kitchens" context={context} />
    );
  }
  return (
    <StaffShell locale={locale} page="kitchens" context={context}>
      <StaffKitchensContent locale={locale} kitchens={kitchens} />
    </StaffShell>
  );
}

function StaffKitchensContent({
  locale,
  kitchens,
}: {
  readonly locale: AppLocale;
  readonly kitchens: StaffKitchens;
}) {
  const copy = useStaffKitchensCopy();
  const countRef = useRef<HTMLParagraphElement>(null);
  const isPageJumpPending = useRef(false);
  const { state, goToPage } = kitchens;
  useEffect(() => {
    if (state.phase !== "ready" || !isPageJumpPending.current) return;
    isPageJumpPending.current = false;
    countRef.current?.focus();
  }, [state]);
  const jumpToPage = (page: number) => {
    isPageJumpPending.current = true;
    goToPage(page);
  };
  return (
    <section className={styles.page} data-testid="staff-kitchens-page">
      <h1 className={styles.heading}>{copy.title}</h1>
      <StaffKitchenFilters {...kitchens} />
      <div className={styles.results}>
        {state.phase === "loading" ? <LoadingKitchens /> : null}
        {state.phase === "failed" ? (
          <FailedKitchens failure={state.failure} onRetry={kitchens.retry} />
        ) : null}
        {state.phase === "ready" ? (
          <ListedKitchens
            locale={locale}
            listing={state.listing}
            more={state.more}
            countRef={countRef}
            kitchens={{ ...kitchens, goToPage: jumpToPage }}
          />
        ) : null}
      </div>
    </section>
  );
}

function ListedKitchens({
  locale,
  listing,
  more,
  countRef,
  kitchens,
}: {
  readonly locale: AppLocale;
  readonly listing: StaffKitchensListing;
  readonly more: MoreState;
  readonly countRef: RefObject<HTMLParagraphElement | null>;
  readonly kitchens: StaffKitchens;
}) {
  const copy = useStaffKitchensCopy();
  const isDesktop = useIsDesktop();
  if (listing.total === 0) {
    return listing.search !== null || listing.status !== null ? (
      <NoResults
        listing={listing}
        onClearSearch={kitchens.clearSearch}
        onClearStatus={() => {
          kitchens.chooseStatus(null);
        }}
      />
    ) : (
      <EmptyKitchens listing={listing} />
    );
  }
  return (
    <>
      <div className={styles.countRow}>
        <p
          ref={countRef}
          role="status"
          tabIndex={-1}
          className={styles.count}
          data-testid="staff-kitchens-count"
        >
          {copy.counts[listing.segment](listing.total)}
        </p>
        <span className={styles.sort}>
          {listing.segment === "sent" ? copy.sorts.sent : copy.sorts.modified}
        </span>
      </div>
      {isDesktop ? (
        <KitchensTable locale={locale} listing={listing} />
      ) : (
        <KitchenCards locale={locale} listing={listing} />
      )}
      <StaffPagination
        listing={listing}
        more={more}
        isDesktop={isDesktop}
        onGoToPage={kitchens.goToPage}
        onLoadMore={kitchens.loadMore}
      />
    </>
  );
}

function useIsDesktop(): boolean {
  return useSyncExternalStore(
    subscribeToDesktopWidth,
    () => matchesMedia(DESKTOP_MEDIA_QUERY),
    () => false,
  );
}

function subscribeToDesktopWidth(notify: () => void): () => void {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return () => undefined;
  }
  const query = window.matchMedia(DESKTOP_MEDIA_QUERY);
  query.addEventListener("change", notify);
  return () => {
    query.removeEventListener("change", notify);
  };
}

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
  const age = relativeAgeOf(Date.parse(row.updatedAt), readAtMs);
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

/** The day as dd.mm.yyyy on the shop's clock, whatever clock the browser keeps. */
function dayOf(instant: string, locale: AppLocale): string {
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Europe/Chisinau",
  }).format(new Date(instant));
}

function KitchensTable({
  locale,
  listing,
}: {
  readonly locale: AppLocale;
  readonly listing: StaffKitchensListing;
}) {
  const copy = useStaffKitchensCopy();
  return (
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
            focusRequest={focusRequestFor(row, listing)}
          />
        ))}
      </tbody>
    </table>
  );
}

function TableRow({
  facts,
  focusRequest,
}: {
  readonly facts: RowFacts;
  readonly focusRequest: RowFocusRequest | undefined;
}) {
  const copy = useStaffKitchensCopy();
  const { row } = facts;
  return (
    <tr data-testid="staff-kitchen-row">
      <td>
        <span className={styles.thumb} aria-hidden="true" />
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
        <OpenLink facts={facts} focusRequest={focusRequest} />
      </td>
    </tr>
  );
}

function KitchenCards({
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
          focusRequest={focusRequestFor(row, listing)}
        />
      ))}
    </ul>
  );
}

function KitchenCard({
  facts,
  focusRequest,
}: {
  readonly facts: RowFacts;
  readonly focusRequest: RowFocusRequest | undefined;
}) {
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
      <OpenLink facts={facts} focusRequest={focusRequest} />
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
      <span className={styles.breakable}>{client.email}</span>
      {client.name === null ? null : (
        <span className={styles.sub}>{client.name}</span>
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
      {client.email}
      {client.name === null ? null : (
        <span className={styles.afterDot}>{client.name}</span>
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

function OpenLink({
  facts,
  focusRequest,
}: {
  readonly facts: RowFacts;
  readonly focusRequest: RowFocusRequest | undefined;
}) {
  const copy = useStaffKitchensCopy();
  const linkRef = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    if (focusRequest !== undefined) linkRef.current?.focus();
  }, [focusRequest]);
  return (
    <a
      ref={linkRef}
      className={styles.open}
      href={facts.href}
      aria-label={copy.openNamed(facts.name)}
    >
      {copy.open}
    </a>
  );
}

function focusRequestFor(
  row: StaffListedKitchenWire,
  listing: StaffKitchensListing,
): RowFocusRequest | undefined {
  return listing.focusRequest?.rowId === row.id
    ? listing.focusRequest
    : undefined;
}
