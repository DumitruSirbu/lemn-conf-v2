import { createRef, useEffect, type RefObject } from "react";

import type { FragmentTokenStatus } from "./fragment-token";

// Where focus goes on an account page: after an answer, and when a link that held a token starts the person at the
// password. The page's form names its targets; these only move focus to the one an answer asks for.

/** The elements an answer may send focus to, by the name the form's focus request uses. */
export type FocusTargets<Name extends string> = Readonly<
  Record<Name, RefObject<HTMLElement | null>>
>;

/** Which target an answer asks for. A new object for every answer, so focus moves once per answer. */
export interface FocusRequest<Name extends string> {
  readonly target: Name | "nowhere";
}

/** The two targets of a page that asks for one password: the field, and the notice that heads the form. */
export interface PasswordPageTargets {
  readonly password: RefObject<HTMLInputElement | null>;
  readonly notice: RefObject<HTMLDivElement | null>;
}

export function createPasswordPageTargets(): PasswordPageTargets {
  return {
    password: createRef<HTMLInputElement>(),
    notice: createRef<HTMLDivElement>(),
  };
}

/** After an answer, focus goes where the person must look: the field to correct or retype, or the notice that now heads
 *  the form. It moves once per answer, and never while the person types. */
export function useMoveFocusOnAnswer<Name extends string>(
  request: FocusRequest<Name> | undefined,
  targets: FocusTargets<Name>,
): void {
  useEffect(() => {
    if (request === undefined || request.target === "nowhere") return;
    targets[request.target].current?.focus();
  }, [request, targets]);
}

/** A link that held a token starts the person at the password. */
export function useFocusPasswordWhenReady(
  tokenStatus: FragmentTokenStatus,
  password: RefObject<HTMLInputElement | null>,
): void {
  useEffect(() => {
    if (tokenStatus === "present") password.current?.focus();
  }, [tokenStatus, password]);
}
