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
import { formatRelativeAge } from "@/account/kitchens/relative-age";
import type { StaffChangesCopy } from "@/i18n/content";
import {
  useStaffChangesCopy,
  useStaffKitchenCopy,
  useStaffKitchensCopy,
} from "@/i18n/use-content";

import { KitchenEstimates } from "./kitchen-estimates";
import { SeenNotice } from "./kitchen-seen-notice";
import type { KitchenVersion } from "./kitchen-version-rows";
import {
  KitchenVersionCabinets,
  KitchenVersionSwitch,
  VersionedKitchenView,
} from "./kitchen-version-switch";
import { FailedKitchens } from "./staff-kitchens-states";
import type { StaffKitchenOpenedWire } from "./staff-kitchens-wire-contract";
import { OpenIn3dLink } from "./staff-kitchen-3d-link";
import { ClientProfile } from "./staff-kitchen-client";
import { dayOf, shopRelativeAgeOf } from "./staff-kitchen-dates";
import {
  modifiedSubLineOf,
  sentAtOf,
  subLineOf,
  titleOf,
  versionsOf,
} from "./staff-kitchen-facts";
import { RequestLine, RequestStatusCard } from "./staff-kitchen-request";
import { shownDesignOf } from "./shown-design";
import {
  CannotShowNotice,
  KitchenHeader,
  KitchenNotAvailable,
  LoadingKitchen,
} from "./staff-kitchen-states";
import { StaffKitchenSummary } from "./staff-kitchen-view";
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
import { useMarkSeen } from "./use-mark-seen";
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
  readonly kitchen: StaffKitchenOpenedWire;
  readonly editing: KitchenEditing;
}) {
  const copy = useStaffKitchenCopy();
  const lists = useStaffKitchensCopy();
  const changes = useStaffChangesCopy();
  const [readAtMs] = useState(Date.now);
  const [chosenVersion, setChosenVersion] = useState<KitchenVersion>(
    wire.changedAfterSeen ? "current" : "sent",
  );
  const titleRef = useRef<HTMLHeadingElement>(null);
  const unhide = useUnhide(wire.kitchen.id, editing);
  const seenMark = useMarkSeen({
    designId: wire.kitchen.id,
    displayedRevision: wire.displayedRevision,
    isChangedAfterSeen: wire.changedAfterSeen,
  });
  const { kitchen } = wire;
  const { asSent, design } = kitchen;
  const versions = useMemo(
    () => versionsOf({ asSent, design }),
    [asSent, design],
  );
  const shown = shownDesignOf(kitchen, chosenVersion);
  const shownVersion: KitchenVersion =
    shown?.source === "current" ? "current" : "sent";
  const versionLabels = versionLabelsOf({
    hasVersions: versions !== undefined,
    kitchen,
    changes,
    locale,
    readAtMs,
  });
  const modifiedSub = wire.changedAfterSeen
    ? modifiedSubLineOf({ changes, wire, locale, readAtMs })
    : undefined;
  return (
    <>
      <KitchenHeader
        locale={locale}
        title={titleOf(kitchen, shown, lists)}
        sub={modifiedSub ?? subLineOf({ copy, wire, locale, readAtMs })}
        titleRef={titleRef}
      />
      {kitchen.isHidden ? (
        <HiddenBanner unhide={unhide} returnFocusFallbackRef={titleRef} />
      ) : null}
      <UnhideAnnouncement announcement={unhide.announcement} />
      <SeenNotice mark={seenMark} />
      <div className={styles.columns}>
        <div className={styles.viewCell}>
          {versionLabels === undefined ? null : (
            <KitchenVersionSwitch
              shown={shownVersion}
              onChoose={setChosenVersion}
              labels={versionLabels}
            />
          )}
          {shown === undefined ? (
            <CannotShowNotice />
          ) : (
            <VersionedKitchenView
              design={shown.design}
              isCurrentVariantOfSent={
                shown.source === "current" && wire.request !== null
              }
            />
          )}
          {/* A page with no version switch has one readable copy, so the link names none. It sits under the
          picture so the three columns start level. */}
          {shown === undefined ? null : (
            <OpenIn3dLink
              locale={locale}
              kitchenId={kitchen.id}
              version={versionLabels === undefined ? undefined : shownVersion}
            />
          )}
          {versions === undefined || versionLabels === undefined ? null : (
            <KitchenVersionCabinets versions={versions} shown={shownVersion} />
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
          {wire.request === null ? null : <KitchenEstimates estimates={wire} />}
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
              omitsPrice={wire.request !== null}
              {...(versions === undefined
                ? {}
                : {
                    comparison: {
                      design:
                        shownVersion === "current"
                          ? versions.sent
                          : versions.current,
                      isShownCurrent: shownVersion === "current",
                    },
                  })}
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

/** The words of the version switch, once both copies can be read and the kitchen has a sent day to name the first by. */
function versionLabelsOf({
  hasVersions,
  kitchen,
  changes,
  locale,
  readAtMs,
}: {
  readonly hasVersions: boolean;
  readonly kitchen: StaffKitchenOpenedWire["kitchen"];
  readonly changes: StaffChangesCopy;
  readonly locale: AppLocale;
  readonly readAtMs: number;
}): Readonly<Record<KitchenVersion, string>> | undefined {
  const sentAt = sentAtOf(kitchen);
  if (!hasVersions || sentAt === null) return undefined;
  const modifiedAge = shopRelativeAgeOf(
    Date.parse(kitchen.updatedAt),
    readAtMs,
  );
  return {
    sent: changes.version.sent(dayOf(sentAt, locale)),
    current: changes.version.current(formatRelativeAge(locale, modifiedAge)),
  };
}
