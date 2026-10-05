"use client";

// The top bar's language control; `i18n/use-locale-menu.ts` carries the menu's rules.
//
// The cell is this component's own: the popover is positioned against `.locale`, so the positioning
// context and what fills it belong in one file. It is still a direct grid item of `.screen`
// (`configure-screen.tsx` renders `<LocaleMenu />` bare), so the band's five-cell layout is unchanged.
//
// A button controlling a list of links, not a `role="menu"`: each choice is a URL, so it stays an
// anchor (shareable, openable in a new tab, announced as a link) and next-intl navigates it
// client-side so the store survives the switch. `role="menuitem"` would remove all of that.
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type {
  FocusEvent as ReactFocusEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
} from "react";

import { flagOf } from "@/i18n/locale-flags";
import { Link } from "@/i18n/navigation";
import { useContent } from "@/i18n/use-content";
import { focusIndexAfter, useLocaleMenu } from "@/i18n/use-locale-menu";
import { useDismissOnOutsidePointer } from "@/lib/use-dismiss-on-outside-pointer-or-escape";

import styles from "./configure.module.css";

/** Closed, or the index the open menu is holding focus at. */
type MenuState = number | "closed";

export function LocaleMenu() {
  const content = useContent();
  const menu = useLocaleMenu();
  const listId = useId();
  const triggerId = useId();
  const [state, setState] = useState<MenuState>("closed");
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const isOpen = state !== "closed";

  const close = useCallback(() => {
    setState("closed");
  }, []);

  /** For Escape and for choosing the language already showing: focus returns to the control opened.
   *  A different language navigates away, and a pointer or Tab dismissal has already moved focus. */
  const closeAndRestoreFocus = useCallback(() => {
    setState("closed");
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (state === "closed") return;
    optionRefs.current[state]?.focus();
  }, [state]);

  useDismissOnOutsidePointer({ rootRef, isOpen, dismiss: close });

  function toggle(): void {
    setState(isOpen ? "closed" : menu.currentIndex);
  }

  /** Enter and Space reach `toggle`; these two keys open a closed menu at a position instead. */
  function handleTriggerKey(
    event: ReactKeyboardEvent<HTMLButtonElement>,
  ): void {
    if (event.key === "Escape" && isOpen) {
      closeAndRestoreFocus();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    setState(event.key === "ArrowDown" ? 0 : menu.choices.length - 1);
  }

  function handleOptionKey(
    event: ReactKeyboardEvent<HTMLAnchorElement>,
    index: number,
  ): void {
    if (event.key === "Escape") {
      event.preventDefault();
      closeAndRestoreFocus();
      return;
    }
    const moved = focusIndexAfter(event.key, {
      index,
      count: menu.choices.length,
    });
    if (moved === undefined) return;
    event.preventDefault();
    setState(moved);
  }

  /**
   * Tab closes the menu here, not on its keydown: closing there unmounts the element the browser is
   * about to move focus from, so sequential navigation restarts at the top of the document. Waiting
   * until focus has left also covers Shift+Tab and every other way out.
   */
  function handleFocusLeaving(event: ReactFocusEvent<HTMLDivElement>): void {
    const movedTo = event.relatedTarget;
    if (movedTo instanceof Node && rootRef.current?.contains(movedTo)) return;
    close();
  }

  return (
    <div className={styles.locale} ref={rootRef} onBlur={handleFocusLeaving}>
      {/* The two-letter code is not the accessible name: `RO` read aloud names neither the page's
          language nor what the control does. `aria-expanded` states what the caret draws. */}
      <button
        type="button"
        id={triggerId}
        ref={triggerRef}
        className={styles.localeChip}
        aria-haspopup="true"
        aria-expanded={isOpen}
        aria-controls={listId}
        aria-label={content.configure.localeMenu}
        data-testid="top-bar-locale"
        onClick={toggle}
        onKeyDown={handleTriggerKey}
      >
        <span className={styles.localeCode}>{content.configure.locale}</span>
        <span className={styles.localeCaret} aria-hidden="true">
          ▾
        </span>
      </button>
      {isOpen ? (
        <ul
          id={listId}
          className={styles.localeList}
          aria-labelledby={triggerId}
          data-testid="top-bar-locale-list"
        >
          {menu.choices.map((choice, index) => (
            <li key={choice.locale}>
              {/* `lang` so the endonym is pronounced in its own language; `aria-current`, not the
                  flag, marks the language already showing. */}
              <Link
                href={menu.pathname}
                locale={choice.locale}
                lang={choice.locale}
                className={
                  choice.isCurrent
                    ? [styles.localeOption, styles.localeOptionCurrent].join(
                        " ",
                      )
                    : styles.localeOption
                }
                aria-current={choice.isCurrent ? "true" : undefined}
                data-testid={`top-bar-locale-option-${choice.locale}`}
                ref={(node) => {
                  optionRefs.current[index] = node;
                }}
                onClick={(event) => {
                  stayWhereTheCustomerIs(event, choice.isCurrent);
                  if (choice.isCurrent) closeAndRestoreFocus();
                  else close();
                }}
                onKeyDown={(event) => {
                  handleOptionKey(event, index);
                }}
              >
                {flagOf(choice.locale)}
                {choice.endonym}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * Choosing the language already showing navigates nowhere. By Next's source (`app-router.js:51-66`,
 * `segment-cache/navigation.js:461`) a soft navigation to the entry's own URL rewrites its state and
 * would strip the browser-Back guard's marker; that did not reproduce in Chromium, so this is a
 * precaution. A click that opens a new tab or window is left alone.
 */
function stayWhereTheCustomerIs(
  event: ReactMouseEvent<HTMLAnchorElement>,
  isCurrent: boolean,
): void {
  const isOpeningElsewhere =
    event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
  if (isCurrent && !isOpeningElsewhere) event.preventDefault();
}
