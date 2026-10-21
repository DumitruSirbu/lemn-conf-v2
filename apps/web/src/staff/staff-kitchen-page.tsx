"use client";

import { useState, type ReactNode } from "react";

import { kitchenSummaryOf, type Design } from "@lemnaria/configurator-domain";

import { FormNotice, OutcomeHero } from "@/account/account-form-parts";
import {
  formatRelativeAge,
  relativeAgeOf,
} from "@/account/kitchens/relative-age";
import type { StaffKitchenCopy, StaffKitchensCopy } from "@/i18n/content";
import type { AppLocale } from "@/i18n/routing";
import {
  useStaffKitchenCopy,
  useStaffKitchensCopy,
  useStaffShellCopy,
} from "@/i18n/use-content";

import styles from "./staff-kitchen.module.css";
import listStyles from "./staff-kitchens.module.css";
import { FailedKitchens } from "./staff-kitchens-states";
import type {
  StaffClientWire,
  StaffKitchenRequestWire,
  StaffKitchenStatusWire,
  StaffKitchenWire,
} from "./staff-kitchens-wire-contract";
import { StaffKitchenSummary, StaffKitchenView } from "./staff-kitchen-view";
import {
  StaffForbiddenScreen,
  StaffShell,
  staffPathOf,
  type StaffShellContext,
} from "./staff-shell";
import shellStyles from "./staff.module.css";
import { useStaffKitchen, type StaffKitchenState } from "./use-staff-kitchen";

// One client's kitchen, read-only (Lot 3 frames S3A to S3C, S3H and S3I; the desktop frames are the same page in three
// columns). Three columns on a desktop: the kitchen and what it is made of; the status, the request, the client and the
// line that says the access is logged; and the notes. A phone stacks them in that reading order, with the summary after
// the client. Every string a client or a staff member typed (a name, an address, a phone, a reference, a note) is a React
// text child: nothing here builds markup from one, and no address or phone is made a link.
//
// The status control, the notes and the button that makes a hidden kitchen visible again belong to the next wave (L3-U4):
// the three slots at the foot of this file are where they go, and until then this page only reads.

export function StaffKitchenScreen({
  locale,
  context,
  designId,
}: {
  readonly locale: AppLocale;
  readonly context: StaffShellContext;
  readonly designId: string;
}) {
  const reading = useStaffKitchen(locale, designId);
  if (reading.state.phase === "forbidden") {
    return (
      <StaffForbiddenScreen locale={locale} page="kitchens" context={context} />
    );
  }
  return (
    <StaffShell locale={locale} page="kitchens" context={context}>
      <section className={styles.page} data-testid="staff-kitchen-page">
        <StaffKitchenStates
          locale={locale}
          state={reading.state}
          onRetry={reading.retry}
        />
      </section>
    </StaffShell>
  );
}

function StaffKitchenStates({
  locale,
  state,
  onRetry,
}: {
  readonly locale: AppLocale;
  readonly state: StaffKitchenState;
  readonly onRetry: () => void;
}) {
  const copy = useStaffKitchenCopy();
  switch (state.phase) {
    case "loading":
      return (
        <>
          <KitchenHeader locale={locale} title={copy.title} />
          <LoadingKitchen />
        </>
      );
    case "failed":
      return (
        <>
          <KitchenHeader locale={locale} title={copy.title} />
          <FailedKitchens failure={state.failure} onRetry={onRetry} />
        </>
      );
    case "not-found":
      return <KitchenNotAvailable locale={locale} />;
    case "ready":
      return <ReadyKitchen locale={locale} kitchen={state.kitchen} />;
    case "forbidden":
      return null;
  }
}

function KitchenHeader({
  locale,
  title,
  sub,
}: {
  readonly locale: AppLocale;
  readonly title: string;
  readonly sub?: string | undefined;
}) {
  const shell = useStaffShellCopy();
  return (
    <header className={styles.header}>
      <a className={styles.back} href={staffPathOf(locale, "kitchens")}>
        {shell.pages.kitchens}
      </a>
      <h1 className={styles.title}>{title}</h1>
      {sub === undefined ? null : <p className={styles.sub}>{sub}</p>}
    </header>
  );
}

/** Frame S3A: the three columns as grey boxes. The words are for a screen reader; the boxes are only for the eye. */
function LoadingKitchen() {
  const copy = useStaffKitchenCopy();
  return (
    <>
      <p role="status" className={listStyles.visuallyHidden}>
        {copy.loading}
      </p>
      <div
        className={styles.skeletonColumns}
        aria-hidden="true"
        data-testid="staff-kitchen-skeleton"
      >
        <span className={styles.skeletonView} />
        <span className={styles.skeletonBox} />
        <span className={styles.skeletonBox} />
      </div>
    </>
  );
}

/** Frame S3H: one answer for a kitchen that is missing and one the person may not open; it cannot tell them apart. */
function KitchenNotAvailable({ locale }: { readonly locale: AppLocale }) {
  const copy = useStaffKitchenCopy();
  const shell = useStaffShellCopy();
  return (
    <div
      className={shellStyles.forbidden}
      data-testid="staff-kitchen-not-found"
    >
      <OutcomeHero tone="error" title={copy.notFound.title}>
        {copy.notFound.body}
      </OutcomeHero>
      <a
        className={shellStyles.primaryLink}
        href={staffPathOf(locale, "kitchens")}
      >
        {shell.backTo(shell.pages.kitchens)}
      </a>
    </div>
  );
}

/** The copy of the kitchen on screen: the one the shop was sent when there is one, else the document as it stands now. */
interface ShownDesign {
  readonly design: Design;
  readonly source: "as-sent" | "current";
}

function shownDesignOf(
  kitchen: StaffKitchenWire["kitchen"],
): ShownDesign | undefined {
  if (kitchen.asSent !== null) {
    return { design: kitchen.asSent, source: "as-sent" };
  }
  return kitchen.design === null
    ? undefined
    : { design: kitchen.design, source: "current" };
}

function ReadyKitchen({
  locale,
  kitchen: wire,
}: {
  readonly locale: AppLocale;
  readonly kitchen: StaffKitchenWire;
}) {
  const copy = useStaffKitchenCopy();
  const lists = useStaffKitchensCopy();
  const [readAtMs] = useState(Date.now);
  const { kitchen } = wire;
  const shown = shownDesignOf(kitchen);
  const sentAt = kitchen.isSent ? kitchen.sentAt : null;
  return (
    <>
      <KitchenHeader
        locale={locale}
        title={titleOf(kitchen, shown, lists)}
        sub={subOf({
          copy,
          kitchen,
          client: wire.client,
          sentAt,
          readAtMs,
          locale,
        })}
      />
      {kitchen.isHidden ? <HiddenBanner /> : null}
      <div className={styles.columns}>
        <div className={styles.viewCell}>
          {shown === undefined ? (
            <CannotShowNotice />
          ) : (
            <StaffKitchenView
              key={kitchen.id}
              design={shown.design}
              isCurrentVariantOfSent={
                shown.source === "current" && wire.request !== null
              }
            />
          )}
        </div>
        <div className={styles.contactColumn}>
          <RequestStatus
            locale={locale}
            isSent={sentAt !== null}
            status={wire.status}
          />
          <RequestLine locale={locale} request={wire.request} />
          <ClientProfile client={wire.client} />
          <p className={styles.caption}>{copy.accessLogged}</p>
        </div>
        <div className={styles.summaryCell}>
          {shown === undefined ? null : (
            <StaffKitchenSummary
              design={shown.design}
              title={
                shown.source === "as-sent"
                  ? copy.summary.titleSent
                  : copy.summary.titleCurrent
              }
              noValue={lists.noValue}
            />
          )}
        </div>
        <StaffKitchenNotesSlot />
      </div>
    </>
  );
}

/** The client's name for it, else the one its facts generate, else a plain word. */
function titleOf(
  kitchen: StaffKitchenWire["kitchen"],
  shown: ShownDesign | undefined,
  lists: StaffKitchensCopy,
): string {
  if (kitchen.name !== null && kitchen.name.trim() !== "") return kitchen.name;
  if (shown === undefined) return lists.unnamedKitchen;
  return lists.kitchenName(kitchenSummaryOf(shown.design));
}

function subOf({
  copy,
  kitchen,
  client,
  sentAt,
  readAtMs,
  locale,
}: {
  readonly copy: StaffKitchenCopy;
  readonly kitchen: StaffKitchenWire["kitchen"];
  readonly client: StaffClientWire | null;
  readonly sentAt: string | null;
  readonly readAtMs: number;
  readonly locale: AppLocale;
}): string {
  if (sentAt !== null) {
    const date = dayOf(sentAt, locale);
    return client === null
      ? copy.sub.sentNoAccount(date)
      : copy.sub.sent({ email: isolated(client.email), date });
  }
  const when = formatRelativeAge(
    locale,
    relativeAgeOf(Date.parse(kitchen.updatedAt), readAtMs),
  );
  return client === null
    ? copy.sub.draftNoAccount(when)
    : copy.sub.draft({ email: isolated(client.email), when });
}

function HiddenBanner() {
  const copy = useStaffKitchenCopy();
  return (
    <div
      role="status"
      className={styles.banner}
      data-testid="staff-kitchen-hidden-banner"
    >
      <span className={styles.bannerMark} aria-hidden="true" />
      <span className={styles.bannerText}>{copy.hiddenBanner}</span>
      <StaffKitchenUnhideSlot />
    </div>
  );
}

/** A kitchen whose document this build cannot read: said once, in place of the picture, with the rest still shown. */
function CannotShowNotice() {
  const copy = useStaffKitchenCopy();
  return (
    <div data-testid="staff-kitchen-cannot-show">
      <FormNotice tone="warning" title={copy.cannotShow.title}>
        {copy.cannotShow.body}
      </FormNotice>
    </div>
  );
}

/** The request's status as a word. A stored status this build does not name is a neutral badge of its own and never
 *  takes the look of a new request. A draft has no request, so it has none, and says why. */
function RequestStatus({
  locale,
  isSent,
  status,
}: {
  readonly locale: AppLocale;
  readonly isSent: boolean;
  readonly status: StaffKitchenStatusWire | null;
}) {
  const copy = useStaffKitchenCopy();
  const lists = useStaffKitchensCopy();
  if (!isSent) {
    return (
      <p className={styles.draftNote} data-testid="staff-kitchen-no-status">
        {copy.draftNoStatus}
      </p>
    );
  }
  return (
    <Card title={lists.filters.statusLabel} testId="staff-kitchen-status">
      {status === null ? (
        <span>{lists.noValue}</span>
      ) : (
        <span
          className={listStyles.badge}
          data-kind="status"
          data-status={status.value}
        >
          {lists.statuses[status.value]}
        </span>
      )}
      <LastChange locale={locale} status={status} lists={lists} copy={copy} />
      <StaffKitchenStatusControlSlot />
    </Card>
  );
}

/** Who set the status and when. A kitchen that shows as new because no status was ever saved has no last change. */
function LastChange({
  locale,
  status,
  lists,
  copy,
}: {
  readonly locale: AppLocale;
  readonly status: StaffKitchenStatusWire | null;
  readonly lists: StaffKitchensCopy;
  readonly copy: StaffKitchenCopy;
}) {
  if (status?.changedAt == null) return null;
  const who = status.changedBy;
  const typedName = who?.name ?? who?.email ?? null;
  const name = typedName === null ? lists.noValue : isolated(typedName);
  return (
    <p className={styles.hint} data-testid="staff-kitchen-last-change">
      {copy.statusLastChange({
        name,
        when: dayAndTimeOf(status.changedAt, locale),
      })}
    </p>
  );
}

/** The request's reference and date. Its contact is in the shop's e-mail, which the application cannot read back
 *  (ADR 0153 decision 1), so it is not shown and the line says where it is. */
function RequestLine({
  locale,
  request,
}: {
  readonly locale: AppLocale;
  readonly request: StaffKitchenRequestWire | null;
}) {
  const copy = useStaffKitchenCopy();
  if (request === null) return null;
  return (
    <Card title={copy.request.title} testId="staff-kitchen-request">
      <p className={styles.requestLine}>
        {copy.request.line({
          reference: request.reference,
          date: dayAndTimeOf(request.sentAt, locale),
        })}
      </p>
      <p className={styles.hint}>{copy.request.contactNote}</p>
    </Card>
  );
}

/** The client's profile contact, as text. Neither the phone nor the address is a link to dial or to write: a staff screen
 *  does not do either on a click. */
function ClientProfile({
  client,
}: {
  readonly client: StaffClientWire | null;
}) {
  const copy = useStaffKitchenCopy();
  const lists = useStaffKitchensCopy();
  return (
    <Card
      title={copy.profile.title}
      tag={copy.profile.tag}
      testId="staff-kitchen-profile"
    >
      {client === null ? (
        <p className={styles.muted}>{lists.noAccount}</p>
      ) : (
        <dl className={styles.facts}>
          <ProfileFact label={copy.profile.email} value={client.email} />
          <ProfileFact
            label={copy.profile.name}
            value={client.name ?? lists.noValue}
          />
          <ProfileFact
            label={copy.profile.phone}
            value={client.phone ?? lists.noValue}
            sub={client.phone === null ? undefined : lists.phoneUnverified}
          />
        </dl>
      )}
    </Card>
  );
}

function ProfileFact({
  label,
  value,
  sub,
}: {
  readonly label: string;
  readonly value: string;
  readonly sub?: string | undefined;
}) {
  return (
    <div className={styles.fact}>
      <dt className={styles.factLabel}>{label}</dt>
      <dd className={styles.factValue}>
        {value}
        {sub === undefined ? null : (
          <span className={styles.factSub}>{sub}</span>
        )}
      </dd>
    </div>
  );
}

function Card({
  title,
  tag,
  testId,
  children,
}: {
  readonly title: string;
  readonly tag?: string;
  readonly testId: string;
  readonly children: ReactNode;
}) {
  return (
    <section className={styles.card} data-testid={testId}>
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

const FIRST_STRONG_ISOLATE = "\u2068";
const POP_DIRECTIONAL_ISOLATE = "\u2069";

/** A string somebody typed, fenced between isolate marks where it stands inside a sentence, so a right-to-left run left open
 *  in it cannot reorder the date or the minute beside it. (A value in an element of its own is isolated by the stylesheet.) */
export function isolated(typed: string): string {
  return `${FIRST_STRONG_ISOLATE}${typed}${POP_DIRECTIONAL_ISOLATE}`;
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

/** The day and the minute, as the frames write them ("18.10.2026, 14:22"), on the shop's clock. */
function dayAndTimeOf(instant: string, locale: AppLocale): string {
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Europe/Chisinau",
  }).format(new Date(instant));
}

// The three places the next wave (L3-U4) fills. Each is an empty, named region today, so nothing on this page promises a
// control that does not exist yet.

/** The status select with "Salvează" and its saved word (frames S3B, S3G), under the status the page reads. */
function StaffKitchenStatusControlSlot() {
  return <div data-slot="staff-kitchen-status-control" />;
}

/** "Fă-o din nou vizibilă" (frames S3D, S3E), in the hidden banner. */
function StaffKitchenUnhideSlot() {
  return <div data-slot="staff-kitchen-unhide" />;
}

/** The notes: the list newest first, the field, "Salvează nota" (frames S3B, S3F to S3F3), in the third column. */
function StaffKitchenNotesSlot() {
  return <div className={styles.notesColumn} data-slot="staff-kitchen-notes" />;
}
