"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";

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
import { dayAndTimeOf, dayOf, isolated } from "./staff-display";
import { StaffKitchenSummary, StaffKitchenView } from "./staff-kitchen-view";
import { StaffNotes } from "./staff-notes";
import {
  StaffForbiddenScreen,
  StaffShell,
  staffPathOf,
  type StaffShellContext,
} from "./staff-shell";
import { StaffStatusControl } from "./staff-status-control";
import shellStyles from "./staff.module.css";
import { HiddenBanner, UnhideAnnouncement } from "./unhide-banner";
import {
  useStaffKitchen,
  type StaffKitchenReading,
  type StaffKitchenState,
} from "./use-staff-kitchen";
import { useUnhide, type KitchenEditing } from "./use-staff-kitchen-actions";

// One client's kitchen, read-only (Lot 3 frames S3A to S3C, S3H and S3I; the desktop frames are the same page in three
// columns). Three columns on a desktop: the kitchen and what it is made of; the status, the request, the client and the
// line that says the access is logged; and the notes. A phone stacks them in that reading order, with the summary after
// the client. Every string a client or a staff member typed (a name, an address, a phone, a reference, a note) is a React
// text child: nothing here builds markup from one, and no address or phone is made a link.
//
// What staff write here (a note, a request status, making a hidden kitchen visible again) is the three components the page
// mounts in its columns and its banner; each makes its own request and hands the page the kitchen's new shape (`edit`) or asks
// for it again behind the page (`refresh`), so the page is never replaced under what a person is typing.

export function StaffKitchenScreen({
  locale,
  context,
  designId,
}: {
  readonly locale: AppLocale;
  readonly context: StaffShellContext;
  readonly designId: string;
}) {
  const reading = useStaffKitchen(designId);
  const heading = useHeadingFocusAfterRetry(reading);
  const { edit, refresh } = reading;
  const editing = useMemo(() => ({ edit, refresh }), [edit, refresh]);
  if (reading.state.phase === "forbidden") {
    return (
      <StaffForbiddenScreen
        locale={locale}
        page="kitchens"
        kitchenId={designId}
        context={context}
      />
    );
  }
  return (
    <StaffShell
      locale={locale}
      page="kitchens"
      kitchenId={designId}
      context={context}
    >
      <section
        ref={heading.pageRef}
        className={styles.page}
        data-testid="staff-kitchen-page"
      >
        <StaffKitchenStates
          locale={locale}
          state={reading.state}
          onRetry={heading.retry}
          editing={editing}
        />
      </section>
    </StaffShell>
  );
}

/**
 * The retry button is gone once the kitchen is asked for again, and focus would fall to the document. When the answer is
 * in, whatever it is, focus goes to the page's heading, which every state draws (a heading takes focus by script only).
 */
function useHeadingFocusAfterRetry(reading: StaffKitchenReading): {
  readonly pageRef: RefObject<HTMLElement | null>;
  readonly retry: () => void;
} {
  const pageRef = useRef<HTMLElement>(null);
  const isWatching = useRef(false);
  const { retry: askAgain, state } = reading;
  const retry = useCallback(() => {
    isWatching.current = true;
    askAgain();
  }, [askAgain]);
  useEffect(() => {
    if (!isWatching.current || state.phase === "loading") return;
    isWatching.current = false;
    pageRef.current?.querySelector("h1")?.focus();
  }, [state]);
  return { pageRef, retry };
}

function StaffKitchenStates({
  locale,
  state,
  onRetry,
  editing,
}: {
  readonly locale: AppLocale;
  readonly state: StaffKitchenState;
  readonly onRetry: () => void;
  readonly editing: KitchenEditing;
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
      return (
        <ReadyKitchen
          locale={locale}
          kitchen={state.kitchen}
          editing={editing}
        />
      );
    case "forbidden":
      return null;
  }
}

function KitchenHeader({
  locale,
  title,
  sub,
  titleRef,
}: {
  readonly locale: AppLocale;
  readonly title: string;
  readonly sub?: string | undefined;
  readonly titleRef?: RefObject<HTMLHeadingElement | null>;
}) {
  const shell = useStaffShellCopy();
  return (
    <header className={styles.header}>
      <a className={styles.back} href={staffPathOf(locale, "kitchens")}>
        {shell.pages.kitchens}
      </a>
      <h1 ref={titleRef} className={styles.title} tabIndex={-1}>
        {title}
      </h1>
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
  editing,
}: {
  readonly locale: AppLocale;
  readonly kitchen: StaffKitchenWire;
  readonly editing: KitchenEditing;
}) {
  const copy = useStaffKitchenCopy();
  const lists = useStaffKitchensCopy();
  const [readAtMs] = useState(Date.now);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const unhide = useUnhide(wire.kitchen.id, editing);
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
        titleRef={titleRef}
      />
      {kitchen.isHidden ? (
        <HiddenBanner unhide={unhide} returnFocusFallbackRef={titleRef} />
      ) : null}
      <UnhideAnnouncement announcement={unhide.announcement} />
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
            designId={kitchen.id}
            isSent={sentAt !== null}
            status={wire.status}
            editing={editing}
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
        <StaffNotes
          locale={locale}
          designId={kitchen.id}
          notes={wire.notes}
          isTruncated={wire.notesTruncated}
          editing={editing}
        />
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
  designId,
  isSent,
  status,
  editing,
}: {
  readonly locale: AppLocale;
  readonly designId: string;
  readonly isSent: boolean;
  readonly status: StaffKitchenStatusWire | null;
  readonly editing: KitchenEditing;
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
      <StaffStatusControl
        designId={designId}
        status={status}
        editing={editing}
      />
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
