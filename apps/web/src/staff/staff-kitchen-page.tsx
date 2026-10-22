"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";

import { useReloadOnPageRestore } from "@/account/use-claim";
import type { AppLocale } from "@/i18n/routing";
import { useStaffKitchenCopy, useStaffKitchensCopy } from "@/i18n/use-content";

import { FailedKitchens } from "./staff-kitchens-states";
import type { StaffKitchenWire } from "./staff-kitchens-wire-contract";
import { ClientProfile } from "./staff-kitchen-client";
import {
  shownDesignOf,
  sentAtOf,
  subLineOf,
  titleOf,
} from "./staff-kitchen-facts";
import { RequestLine, RequestStatusCard } from "./staff-kitchen-request";
import {
  CannotShowNotice,
  KitchenHeader,
  KitchenNotAvailable,
  LoadingKitchen,
} from "./staff-kitchen-states";
import { StaffKitchenSummary, StaffKitchenView } from "./staff-kitchen-view";
import { StaffNotes } from "./staff-notes";
import {
  StaffForbiddenScreen,
  StaffShell,
  type StaffShellContext,
} from "./staff-shell";
import styles from "./staff-kitchen.module.css";
import { HiddenBanner, UnhideAnnouncement } from "./unhide-banner";
import {
  useStaffKitchen,
  type StaffKitchenReading,
  type StaffKitchenState,
} from "./use-staff-kitchen";
import type { KitchenEditing } from "./use-one-write-at-a-time";
import { useUnhide } from "./use-unhide";

// One client's kitchen (frames S3A to S3C, S3H and S3I; the desktop frames are the same page in three columns). Three
// columns on a desktop: the kitchen and what it is made of; the status, the request, the client and the line that says the
// access is logged; and the notes. A phone stacks them in that reading order, with the summary after the client. Every
// string a client or a staff member typed (a name, an address, a phone, a reference, a note) is a React text child: nothing
// here builds markup from one, and no address or phone is made a link.
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
  // A kitchen restored from the browser's cache is read again: it must not be shown from memory to a person who has signed out.
  useReloadOnPageRestore();
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
          <KitchenHeader
            locale={locale}
            title={copy.title}
            sub={copy.loadingSub}
          />
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
  return (
    <>
      <KitchenHeader
        locale={locale}
        title={titleOf(kitchen, shown, lists)}
        sub={subLineOf({ copy, wire, locale, readAtMs })}
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
          <RequestStatusCard
            locale={locale}
            designId={kitchen.id}
            isSent={sentAtOf(kitchen) !== null}
            status={wire.status}
            editing={editing}
            titleRef={titleRef}
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
