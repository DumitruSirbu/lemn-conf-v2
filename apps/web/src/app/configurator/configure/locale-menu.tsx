"use client";

// The top bar's language control — frames 2A / D2A's chip, with the menu the owner's 2026-09-10
// ruling gives it. `i18n/use-locale-menu.ts` carries the ruling and what it supersedes.
//
// **The cell is this component's own** rather than the screen's, and that is structural: the popover
// is absolutely positioned against `.locale`, so the element that establishes the positioning context
// and the element that fills it belong in one file. It is still a direct grid item of `.screen` —
// `configure-screen.tsx` renders `<LocaleMenu />` with nothing around it — so the band's five-cell
// layout and its shared `border-bottom` are unchanged.
//
// **A button controlling a list of links, not a `role="menu"`.** The trigger opens something, so it
// is a button and says `aria-expanded`; each choice *is a URL*, so it stays an anchor and keeps its
// link semantics — shareable, openable in a new tab, announced as a link, and navigated client-side
// by next-intl so the store survives the switch. `role="menuitem"` would have taken all of that away
// to buy a keyboard convention this file implements anyway.
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type {
  FocusEvent as ReactFocusEvent,
  KeyboardEvent as ReactKeyboardEvent,
} from "react";

import { flagOf } from "@/i18n/locale-flags";
import { Link } from "@/i18n/navigation";
import { useContent } from "@/i18n/use-content";
import { focusIndexAfter, useLocaleMenu } from "@/i18n/use-locale-menu";

import styles from "./configure.module.css";

/** Closed, or the index the open menu is holding focus at. One value rather than two pieces of state
 *  because the second is meaningless without the first. */
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

  /** Escape leaves the customer where they started, so focus goes back to the control they opened.
   *  A chosen language navigates away and a dismissal by pointer or by Tab has already moved focus
   *  somewhere the customer chose, so neither of those comes through here. */
  const closeAndRestoreFocus = useCallback(() => {
    setState("closed");
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (state === "closed") return;
    optionRefs.current[state]?.focus();
  }, [state]);

  useEffect(() => {
    if (state === "closed") return undefined;
    const closeOnOutsidePointer = (event: PointerEvent): void => {
      const target = event.target;
      if (target instanceof Node && rootRef.current?.contains(target)) return;
      setState("closed");
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
    };
  }, [state]);

  function toggle(): void {
    setState(isOpen ? "closed" : menu.currentIndex);
  }

  /** Enter and Space are the button's own activation and reach `toggle`; these are the two keys a
   *  closed menu answers with a position rather than with "open at the current language". */
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
   * Tab closes the menu, and it closes it **here rather than on the keydown** — which is a measured
   * difference and not a style. Closing on `Tab`'s keydown unmounts the very element the browser is
   * about to move focus *from*, so sequential navigation restarts at the top of the document and the
   * customer is thrown to the first control on the page. Waiting until focus has actually left lets
   * the browser move first, and it covers Shift+Tab and every other way out for free.
   */
  function handleFocusLeaving(event: ReactFocusEvent<HTMLDivElement>): void {
    const movedTo = event.relatedTarget;
    if (movedTo instanceof Node && rootRef.current?.contains(movedTo)) return;
    close();
  }

  return (
    <div className={styles.locale} ref={rootRef} onBlur={handleFocusLeaving}>
      {/* The two-letter code is the frames' own and is **not** the accessible name: `RO` read aloud
          names neither the language of the page nor what the control does, and which language is
          current would otherwise be carried by the chip's colour alone. The caret finally means what
          it draws — `aria-expanded` is the same claim for a screen reader. */}
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
              {/* `lang` so the endonym is pronounced in its own language rather than in the page's,
                  and `aria-current` so the language already showing is marked by something other
                  than the weight it is drawn at.

                  **The flag is not that mark.** It says which language the row *is*, which is the
                  one thing the endonym beside it already says twice over; the state stays on
                  `aria-current` and on `.localeOptionCurrent`'s weight, where it was. */}
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
                onClick={close}
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
