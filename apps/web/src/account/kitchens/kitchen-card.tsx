"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  type RefObject,
} from "react";

import type { Content } from "@/i18n/content";
import type { AppLocale } from "@/i18n/routing";
import { useAccountKitchensCopy } from "@/i18n/use-content";
import { priceFloorOf } from "@/price/price-book-root";

import { KitchenOverlays } from "./kitchen-overlays";
import type { KitchenChoice } from "./kitchen-menu";
import {
  returnFocusTargetOf,
  useKitchenSurface,
  type KitchenSurfaceControls,
} from "./kitchen-surface";
import type { ListedKitchen } from "./kitchens-answer";
import { RenameKitchenForm } from "./rename-kitchen-form";
import type { KitchenActions } from "./use-kitchen-actions";
import { describeKitchenPrice, type KitchenPrice } from "./kitchen-summary";
import { formatRelativeAge, relativeAgeOf } from "./relative-age";
import styles from "./kitchens.module.css";
import type { CardFocusRequest } from "./use-kitchens";

// One kitchen of the list (ContBlocks2's card). It opens the kitchen by a full document load: the editor is a page with
// a policy of its own, and an account page never makes a client-side navigation. The thumbnail is a placeholder until the
// product renders pictures (plan C2). The price is the configurator bar's own, worked out from the kitchen's stored
// document in the browser; a kitchen whose document cannot be priced shows none. Beside "Deschide" stands the "⋯" that
// opens the card's menu (rename, copy, share, delete or hide); what the menu leads to is drawn in the screen's `<main>`.

export interface KitchenCardProps {
  readonly kitchen: ListedKitchen;
  readonly locale: AppLocale;
  /** The moment the list was read, which "modified 2 days ago" is told against. */
  readonly readAtMs: number;
  /** Takes focus once per request: the first kitchen of a page the person asked for, or the last one shown when that
   *  page added none. */
  readonly focusRequest: CardFocusRequest | undefined;
  readonly actions: KitchenActions;
  /** Where focus goes when an act removes this card while a dialog of it is open. */
  readonly listFocusRef: RefObject<HTMLElement | null>;
}

export function KitchenCard({
  kitchen,
  locale,
  readAtMs,
  focusRequest,
  actions,
  listFocusRef,
}: KitchenCardProps) {
  const copy = useAccountKitchensCopy();
  const nameId = useId();
  const openRef = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    if (focusRequest !== undefined) openRef.current?.focus();
  }, [focusRequest]);
  const name = kitchen.name ?? copy.kitchenName(kitchen.summary);
  const age = relativeAgeOf(kitchen.updatedAtMs, readAtMs);
  const price = useMemo(
    () => priceOfKitchen(kitchen, copy.price),
    [kitchen, copy.price],
  );
  return (
    <li className={styles.item}>
      <article className={styles.card} aria-labelledby={nameId}>
        <div className={styles.cardMain}>
          <span className={styles.thumb} aria-hidden="true" />
          <div className={styles.cardInfo}>
            <StatusBadge isSent={kitchen.isSent} />
            <h2 id={nameId} className={styles.name}>
              {name}
            </h2>
            <span className={styles.meta}>{copy.meta(kitchen.summary)}</span>
            <div className={styles.cardFoot}>
              <time className={styles.modified} dateTime={kitchen.updatedAtIso}>
                {copy.modified(formatRelativeAge(locale, age))}
              </time>
              {price === undefined ? null : <PriceLine price={price} />}
            </div>
          </div>
        </div>
        <CardActions
          kitchen={kitchen}
          kitchenName={name}
          href={`/${locale}/d/${kitchen.id}`}
          openRef={openRef}
          actions={actions}
          listFocusRef={listFocusRef}
        />
      </article>
    </li>
  );
}

interface CardActionsProps {
  readonly kitchen: ListedKitchen;
  readonly kitchenName: string;
  readonly href: string;
  readonly openRef: RefObject<HTMLAnchorElement | null>;
  readonly actions: KitchenActions;
  readonly listFocusRef: RefObject<HTMLElement | null>;
}

/** The foot of the card: "Deschide" and "⋯", or, while the name is being changed, its field. The surfaces the "⋯" opens
 *  hang off it, since the button is what they return focus to. */
function CardActions({
  kitchen,
  kitchenName,
  href,
  openRef,
  actions,
  listFocusRef,
}: CardActionsProps) {
  const copy = useAccountKitchensCopy();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const controls = useKitchenSurface(triggerRef);
  const { surface, openOverlay, close } = controls;
  const returnFocusRef = useMemo(
    () => returnFocusTargetOf(triggerRef, listFocusRef),
    [listFocusRef],
  );
  useFocusTriggerWhenRenameEnds(surface.kind === "rename", triggerRef);
  const choose = useCallback(
    (choice: KitchenChoice) => {
      chooseFromMenu(choice, controls, () => {
        actions.duplicate(kitchen, kitchenName);
      });
    },
    [controls, actions, kitchen, kitchenName],
  );

  if (surface.kind === "rename") {
    return (
      <RenameKitchenForm
        kitchen={kitchen}
        kitchenName={kitchenName}
        actions={actions}
        onDone={close}
      />
    );
  }
  return (
    <div className={styles.actionsRow}>
      <a
        ref={openRef}
        className={styles.open}
        href={href}
        aria-label={copy.openNamed(kitchenName)}
      >
        {copy.open}
      </a>
      <button
        ref={triggerRef}
        type="button"
        className={styles.dots}
        aria-label={copy.actions.moreFor(kitchenName)}
        aria-haspopup="dialog"
        aria-expanded={surface.kind === "menu"}
        onClick={() => {
          openOverlay("menu");
        }}
      />
      <KitchenOverlays
        surface={surface}
        kitchen={kitchen}
        kitchenName={kitchenName}
        actions={actions}
        onChoose={choose}
        onClose={close}
        returnFocusRef={returnFocusRef}
      />
    </div>
  );
}

/** A row of the menu: the menu goes, and what the row asks for takes its place. */
function chooseFromMenu(
  choice: KitchenChoice,
  { openOverlay, beginRename, close }: KitchenSurfaceControls,
  duplicate: () => void,
): void {
  switch (choice) {
    case "rename":
      beginRename();
      return;
    case "duplicate":
      close();
      duplicate();
      return;
    case "share":
    case "delete":
    case "hide":
      openOverlay(choice);
      return;
  }
}

/** The field that was pressed away has taken focus with it; the "⋯" it grew from is where the person is. */
function useFocusTriggerWhenRenameEnds(
  isRenaming: boolean,
  triggerRef: RefObject<HTMLElement | null>,
): void {
  const wasRenamingRef = useRef(false);
  useEffect(() => {
    if (wasRenamingRef.current && !isRenaming) triggerRef.current?.focus();
    wasRenamingRef.current = isRenaming;
  }, [isRenaming, triggerRef]);
}

function priceOfKitchen(
  kitchen: ListedKitchen,
  priceCopy: Content["price"],
): KitchenPrice | undefined {
  return kitchen.document === undefined
    ? undefined
    : describeKitchenPrice(priceFloorOf(kitchen.document), priceCopy);
}

/** "De la 28 000 MDL", and under it the configurator's own line when the total is flagged. */
function PriceLine({ price }: { readonly price: KitchenPrice }) {
  return (
    <div className={styles.priceBlock}>
      <span className={styles.price}>
        {price.figure.label} {price.figure.amountText}
      </span>
      {price.overflowWarning === undefined ? null : (
        <span className={styles.priceWarning}>{price.overflowWarning}</span>
      )}
    </div>
  );
}

/** "Trimisă" for a kitchen whose request was sent, "Ciornă" for every other. Kitchens sent before the sent mark was
 *  written carry no mark and read as drafts until the owner-run backfill (see the Lot 2 plan, O11). */
function StatusBadge({ isSent }: { readonly isSent: boolean }) {
  const copy = useAccountKitchensCopy();
  return isSent ? (
    <span className={styles.badge} data-kind="sent">
      {copy.sentBadge}
    </span>
  ) : (
    <span className={styles.badge} data-kind="draft">
      {copy.draftBadge}
    </span>
  );
}
