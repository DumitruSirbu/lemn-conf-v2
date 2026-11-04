"use client";

import { useTranslations } from "next-intl";
import { useId, useRef, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

import type { ItemRef } from "@lemnaria/configurator-domain";

import { AccountDialog } from "@/account/account-dialog";
import { FormNotice } from "@/account/account-form-parts";
import type { ContentTranslator } from "@/i18n/content";

import styles from "./item-dialogs.module.css";
import type { ItemFailure, ItemFlow, UsageStand } from "./item-flows";
import { itemFailureWords } from "./item-lifecycle-words";
import type { ItemAvailabilityDesk } from "./use-item-availability";

// The questions asked before an item is switched off or on or deleted, drawn the same for every kind of item: a dialog is
// told the item's name and the names of what remains, and the words are the lifecycle leaves'. Each opens on its cancel (or,
// where it has none, on its one button), so a press that follows an accidental open leaves things as they were. A
// switch-off and a switch-on say they apply at once; a deletion says it waits for publication.

const OPTION_SEPARATOR = ", ";

export interface ItemDialogsProps {
  readonly desk: Pick<
    ItemAvailabilityDesk,
    "flow" | "failure" | "isBusy" | "confirm" | "dismiss"
  >;
  /** The item's name as the screen shows it. */
  readonly nameOf: (item: ItemRef) => string;
  /** Where focus goes on close when the control that opened the dialog is gone (Safari and Firefox do not focus a button on click). */
  readonly returnFocusFallbackRef: RefObject<HTMLElement | null>;
}

export function ItemDialogs({
  desk,
  nameOf,
  returnFocusFallbackRef,
}: ItemDialogsProps) {
  const { flow } = desk;
  if (flow.kind === "closed") return null;
  return (
    <InMain>
      <FlowDialog
        flow={flow}
        desk={desk}
        nameOf={nameOf}
        returnFocusFallbackRef={returnFocusFallbackRef}
      />
    </InMain>
  );
}

export interface ItemDeskNoticeProps {
  readonly desk: Pick<
    ItemAvailabilityDesk,
    "flow" | "failure" | "isReading" | "readingItem"
  >;
}

/** What the desk says where no dialog is open: that the saved kitchens are being counted, and the answer to a
 *  confirmation after which its dialog closed. */
export function ItemDeskNotice({ desk }: ItemDeskNoticeProps) {
  const translate = useTranslations();
  if (desk.isReading) {
    return (
      <FormNotice tone="info">
        {translate(
          desk.readingItem?.kind === "accessory"
            ? "priceDashboard.lifecycle.countingAccessory"
            : "priceDashboard.lifecycle.counting",
        )}
      </FormNotice>
    );
  }
  if (desk.flow.kind !== "closed") return null;
  return <FailureNotice failure={desk.failure} />;
}

/** Drawn into the frame's `<main>`, so the page behind goes inert. */
function InMain({ children }: { readonly children: ReactNode }) {
  return createPortal(
    children,
    document.querySelector("main") ?? document.body,
  );
}

interface FlowDialogProps {
  readonly flow: Exclude<ItemFlow, { readonly kind: "closed" }>;
  readonly desk: ItemDialogsProps["desk"];
  readonly nameOf: (item: ItemRef) => string;
  readonly returnFocusFallbackRef: RefObject<HTMLElement | null>;
}

function FlowDialog(props: FlowDialogProps) {
  switch (props.flow.kind) {
    case "deactivate":
      return <DeactivateDialog {...props} flow={props.flow} />;
    case "activate":
      return <ActivateDialog {...props} flow={props.flow} />;
    case "last-active-option":
      return <LastActiveDialog {...props} flow={props.flow} />;
    case "delete":
      return <DeleteDialog {...props} flow={props.flow} />;
    case "delete-blocked":
      return <DeleteBlockedDialog {...props} flow={props.flow} />;
  }
}

type FlowOf<Kind extends ItemFlow["kind"]> = Extract<
  ItemFlow,
  { readonly kind: Kind }
>;

function DeactivateDialog({
  flow,
  desk,
  nameOf,
  returnFocusFallbackRef,
}: FlowDialogProps & { readonly flow: FlowOf<"deactivate"> }) {
  const translate = useTranslations();
  const happensId = useId();
  const { item, remaining, usage } = flow;
  return (
    <AccountDialog
      kind="destructive"
      confirmTone="primary"
      title={translate("priceDashboard.lifecycle.deactivateTitle", {
        name: nameOf(item),
      })}
      alsoDescribedById={happensId}
      returnFocusFallbackRef={returnFocusFallbackRef}
      confirm={{
        label: translate("priceDashboard.lifecycle.deactivateConfirm"),
        busyLabel: translate("priceDashboard.lifecycle.working"),
        isBusy: desk.isBusy,
        isOff: usage.kind !== "counted",
        onPress: desk.confirm,
      }}
      cancel={{
        label: translate("priceDashboard.common.cancel"),
        onPress: desk.dismiss,
      }}
    >
      <WhatHappens
        id={happensId}
        lines={deactivationLines({
          translate,
          item,
          usage,
          remainingNames: remaining.map(nameOf),
        })}
      />
      <UsageNotice usage={usage} item={item} />
      <FailureNotice failure={desk.failure} />
    </AccountDialog>
  );
}

function ActivateDialog({
  flow,
  desk,
  nameOf,
  returnFocusFallbackRef,
}: FlowDialogProps & { readonly flow: FlowOf<"activate"> }) {
  const translate = useTranslations();
  return (
    <AccountDialog
      kind="destructive"
      confirmTone="primary"
      title={translate("priceDashboard.lifecycle.activateTitle", {
        name: nameOf(flow.item),
      })}
      description={translate(
        flow.item.kind === "accessory"
          ? "priceDashboard.lifecycle.activateAccessoryBody"
          : "priceDashboard.lifecycle.activateBody",
      )}
      returnFocusFallbackRef={returnFocusFallbackRef}
      confirm={{
        label: translate("priceDashboard.lifecycle.activateConfirm"),
        busyLabel: translate("priceDashboard.lifecycle.working"),
        isBusy: desk.isBusy,
        onPress: desk.confirm,
      }}
      cancel={{
        label: translate("priceDashboard.common.cancel"),
        onPress: desk.dismiss,
      }}
    >
      <FailureNotice failure={desk.failure} />
    </AccountDialog>
  );
}

/** Nothing is asked: the one button closes it, and it is where focus starts. */
function LastActiveDialog({
  flow,
  desk,
  nameOf,
  returnFocusFallbackRef,
}: FlowDialogProps & { readonly flow: FlowOf<"last-active-option"> }) {
  const translate = useTranslations();
  return (
    <ClosingDialog
      title={translate("priceDashboard.lifecycle.lastActiveTitle", {
        name: nameOf(flow.item),
      })}
      description={translate("priceDashboard.lifecycle.lastActiveBody")}
      onClose={desk.dismiss}
      returnFocusFallbackRef={returnFocusFallbackRef}
    />
  );
}

function DeleteDialog({
  flow,
  desk,
  nameOf,
  returnFocusFallbackRef,
}: FlowDialogProps & { readonly flow: FlowOf<"delete"> }) {
  const translate = useTranslations();
  return (
    <AccountDialog
      kind="destructive"
      title={translate("priceDashboard.lifecycle.deleteTitle", {
        name: nameOf(flow.item),
      })}
      description={translate(deleteBodyLeafOf(flow))}
      returnFocusFallbackRef={returnFocusFallbackRef}
      confirm={{
        label: translate("priceDashboard.common.delete"),
        busyLabel: translate("priceDashboard.lifecycle.working"),
        isBusy: desk.isBusy,
        isOff: flow.usage.kind !== "counted",
        onPress: desk.confirm,
      }}
      cancel={{
        label: translate("priceDashboard.common.cancel"),
        onPress: desk.dismiss,
      }}
    >
      <UsageNotice usage={flow.usage} item={flow.item} />
      <FailureNotice failure={desk.failure} />
    </AccountDialog>
  );
}

function deleteBodyLeafOf({
  item,
  isDraftOnly,
}: FlowOf<"delete">):
  | "priceDashboard.lifecycle.deleteBody"
  | "priceDashboard.lifecycle.deleteCreatedBody"
  | "priceDashboard.lifecycle.deleteCreatedAccessoryBody" {
  if (!isDraftOnly) return "priceDashboard.lifecycle.deleteBody";
  return item.kind === "accessory"
    ? "priceDashboard.lifecycle.deleteCreatedAccessoryBody"
    : "priceDashboard.lifecycle.deleteCreatedBody";
}

/** A deletion that a use forbids. Where the item is on, switching it off is offered instead; where it already is off,
 *  there is nothing to offer and the dialog only closes. */
function DeleteBlockedDialog({
  flow,
  desk,
  nameOf,
  returnFocusFallbackRef,
}: FlowDialogProps & { readonly flow: FlowOf<"delete-blocked"> }) {
  const translate = useTranslations();
  const name = nameOf(flow.item);
  const title = translate("priceDashboard.lifecycle.deleteBlockedTitle", {
    name,
  });
  const description = deleteBlockedWords(translate, flow, name);
  if (!flow.isOn) {
    return (
      <ClosingDialog
        title={title}
        description={description}
        onClose={desk.dismiss}
        returnFocusFallbackRef={returnFocusFallbackRef}
      />
    );
  }
  return (
    <AccountDialog
      kind="destructive"
      confirmTone="primary"
      title={title}
      description={description}
      returnFocusFallbackRef={returnFocusFallbackRef}
      confirm={{
        label: translate("priceDashboard.lifecycle.deactivateInstead"),
        busyLabel: translate("priceDashboard.lifecycle.working"),
        isBusy: desk.isBusy,
        onPress: desk.confirm,
      }}
      cancel={{
        label: translate("priceDashboard.common.cancel"),
        onPress: desk.dismiss,
      }}
    />
  );
}

/** Why the deletion is forbidden and the way on. An accessory has no alternative to choose: its customer is told it was
 *  removed. A count is said only where one was had; a server's refusal names none. */
function deleteBlockedWords(
  translate: ContentTranslator,
  { item, isOn, count }: FlowOf<"delete-blocked">,
  name: string,
): string {
  const isAccessory = item.kind === "accessory";
  if (!isOn) {
    return translate(
      isAccessory
        ? "priceDashboard.lifecycle.deleteBlockedAccessoryInactiveBody"
        : "priceDashboard.lifecycle.deleteBlockedInactiveBody",
      { name },
    );
  }
  if (count === undefined) {
    return translate(
      isAccessory
        ? "priceDashboard.lifecycle.deleteBlockedAccessoryUncountedBody"
        : "priceDashboard.lifecycle.deleteBlockedUncountedBody",
      { name },
    );
  }
  return translate(
    isAccessory
      ? "priceDashboard.lifecycle.deleteBlockedAccessoryBody"
      : "priceDashboard.lifecycle.deleteBlockedBody",
    { name, count },
  );
}

function ClosingDialog({
  title,
  description,
  onClose,
  returnFocusFallbackRef,
}: {
  readonly title: string;
  readonly description: string;
  readonly onClose: () => void;
  readonly returnFocusFallbackRef: RefObject<HTMLElement | null>;
}) {
  const translate = useTranslations();
  const closeRef = useRef<HTMLButtonElement>(null);
  return (
    <AccountDialog
      kind="destructive"
      confirmTone="quiet"
      title={title}
      description={description}
      confirmRef={closeRef}
      initialFocusRef={closeRef}
      returnFocusFallbackRef={returnFocusFallbackRef}
      confirm={{
        label: translate("priceDashboard.common.close"),
        busyLabel: translate("priceDashboard.common.close"),
        isBusy: false,
        onPress: onClose,
      }}
      dismiss={onClose}
    />
  );
}

function WhatHappens({
  id,
  lines,
}: {
  readonly id: string;
  readonly lines: readonly string[];
}) {
  const translate = useTranslations();
  return (
    <section id={id} className={styles.happens}>
      <h3 className={styles.happensTitle}>
        {translate("priceDashboard.lifecycle.whatHappens")}
      </h3>
      <ul className={styles.happensList}>
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </section>
  );
}

/** What a switch-off does, in the order the person reads it: who is affected, what customers can no longer do, what a
 *  saved kitchen is asked, that it applies now and what stays on offer. A line about use is left out where nobody could
 *  be counted or none use the item. An accessory is earned, not chosen, so it is told as one. */
function deactivationLines({
  translate,
  item,
  usage,
  remainingNames,
}: {
  readonly translate: ContentTranslator;
  readonly item: ItemRef;
  readonly usage: UsageStand;
  readonly remainingNames: readonly string[];
}): readonly string[] {
  const count = usage.kind === "counted" ? usage.count : 0;
  const isUsed = count > 0;
  const isAccessory = item.kind === "accessory";
  return [
    ...(isUsed
      ? [
          translate(
            isAccessory
              ? "priceDashboard.lifecycle.usedByAccessory"
              : "priceDashboard.lifecycle.usedBy",
            { count },
          ),
        ]
      : []),
    translate(
      isAccessory
        ? "priceDashboard.lifecycle.clientsNoLongerGetAccessory"
        : "priceDashboard.lifecycle.clientsCannotChoose",
    ),
    ...(isUsed
      ? [
          translate(
            isAccessory
              ? "priceDashboard.lifecycle.accessoryRemovedExplained"
              : "priceDashboard.lifecycle.replacementExplained",
          ),
        ]
      : []),
    translate("priceDashboard.lifecycle.appliesImmediately"),
    ...(remainingNames.length === 0
      ? []
      : [
          translate("priceDashboard.lifecycle.remaining", {
            options: remainingNames.join(OPTION_SEPARATOR),
          }),
        ]),
  ];
}

/** Said where the saved kitchens could not be counted: nothing is claimed about them, and the act waits. */
function UsageNotice({
  usage,
  item,
}: {
  readonly usage: UsageStand;
  readonly item: ItemRef;
}) {
  const translate = useTranslations();
  if (usage.kind === "counted") return null;
  return (
    <FormNotice tone="error">
      {translate(
        item.kind === "accessory"
          ? "priceDashboard.lifecycle.usageUnavailableAccessory"
          : "priceDashboard.lifecycle.usageUnavailable",
      )}
    </FormNotice>
  );
}

function FailureNotice({
  failure,
}: {
  readonly failure: ItemFailure | undefined;
}) {
  const translate = useTranslations();
  if (failure === undefined) return null;
  return (
    <FormNotice tone="error">{itemFailureWords(translate, failure)}</FormNotice>
  );
}
