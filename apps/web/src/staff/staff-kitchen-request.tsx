"use client";

import { useEffect, useRef, type RefObject } from "react";

import type { StaffKitchenCopy, StaffKitchensCopy } from "@/i18n/content";
import type { AppLocale } from "@/i18n/routing";
import { useStaffKitchenCopy, useStaffKitchensCopy } from "@/i18n/use-content";

import { isolated } from "./bidi-isolate";
import { Card } from "./staff-kitchen-card";
import { dayAndTimeOf } from "./staff-kitchen-dates";
import styles from "./staff-kitchen.module.css";
import listStyles from "./staff-kitchens.module.css";
import type {
  StaffKitchenRequestWire,
  StaffKitchenStatusWire,
} from "./staff-kitchens-wire-contract";
import { StaffStatusControl } from "./staff-status-control";
import type { KitchenEditing } from "./use-one-write-at-a-time";

/** The request's status as a word. A stored status this build does not name is a neutral badge of its own and never
 *  takes the look of a new request. A draft has no request, so it has none, and says why. */
export function RequestStatusCard({
  locale,
  designId,
  isSent,
  status,
  editing,
  titleRef,
}: {
  readonly locale: AppLocale;
  readonly designId: string;
  readonly isSent: boolean;
  readonly status: StaffKitchenStatusWire | null;
  readonly editing: KitchenEditing;
  readonly titleRef: RefObject<HTMLElement | null>;
}) {
  const copy = useStaffKitchenCopy();
  const lists = useStaffKitchensCopy();
  useFocusTitleWhenRequestGoes(isSent, titleRef);
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

/** A re-read can show that the kitchen is no sent request, and the control the person was on goes with it: focus would fall to
 *  the document, so it goes to the page's heading. */
function useFocusTitleWhenRequestGoes(
  isSent: boolean,
  titleRef: RefObject<HTMLElement | null>,
): void {
  const wasSentRef = useRef(isSent);
  useEffect(() => {
    if (wasSentRef.current && !isSent) titleRef.current?.focus();
    wasSentRef.current = isSent;
  }, [isSent, titleRef]);
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
export function RequestLine({
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
