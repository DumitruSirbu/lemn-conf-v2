"use client";

import { useTranslations } from "next-intl";
import { useCallback, useId, useRef, useState } from "react";

import { ActionThatMayBeOff } from "./action-that-may-be-off";
import { useCloseOnOutsideClick } from "./use-close-on-outside-click";

// "⋯": a disclosure of the actions that change what customers are offered, drawn the same for every kind of item. An
// action that cannot be taken stays in the list, off, with the reason under it. The screen hands in its own class
// names, so the menu takes the look of the list it is in.

export interface ItemRowMenuClasses {
  readonly rowMenu: string | undefined;
  readonly more: string | undefined;
  readonly menu: string | undefined;
  readonly menuItem: string | undefined;
  readonly menuEntry: string | undefined;
  readonly menuReason: string | undefined;
}

export interface ItemRowMenuEntry {
  readonly label: string;
  /** Why the entry is off; absent, it can be pressed. */
  readonly reason: string | undefined;
  readonly onPress: () => void;
}

export interface ItemRowMenuProps {
  /** The item's name as the screen shows it. */
  readonly name: string;
  readonly entries: readonly ItemRowMenuEntry[];
  /**
   * A dialog is open for an entry of this menu: it is drawn outside the menu, so a click in it is not an outside click,
   * and the menu stays, holding the entry that asked for focus to return to. */
  readonly isAsking: boolean;
  readonly classes: ItemRowMenuClasses;
}

export function ItemRowMenu({
  name,
  entries,
  isAsking,
  classes,
}: ItemRowMenuProps) {
  const translate = useTranslations();
  const menuId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => {
    setIsOpen(false);
  }, []);
  useCloseOnOutsideClick(wrapRef, isOpen && !isAsking, close);
  return (
    <div
      ref={wrapRef}
      className={classes.rowMenu}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !isOpen) return;
        event.stopPropagation();
        setIsOpen(false);
        buttonRef.current?.focus();
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        className={classes.more}
        aria-expanded={isOpen}
        aria-controls={menuId}
        aria-label={translate("priceDashboard.common.moreActionsFor", { name })}
        onClick={() => {
          setIsOpen((wasOpen) => !wasOpen);
        }}
      />
      {isOpen ? (
        <ul
          id={menuId}
          className={classes.menu}
          aria-label={translate("priceDashboard.common.actionsFor", { name })}
        >
          {entries.map((entry) => (
            <li key={entry.label} className={classes.menuItem}>
              <ActionThatMayBeOff
                reason={entry.reason}
                onPress={entry.onPress}
                buttonClassName={classes.menuEntry}
                noteClassName={classes.menuReason}
                noteTag="span"
                noteTestId="menu-reason"
              >
                {entry.label}
              </ActionThatMayBeOff>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
