import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";

// How a token page gets its single-use token. The e-mail's link carries it after `#`, which the browser never sends to a
// server or in a `Referer`. The page reads it once and takes it out of the address at the same moment, so it is never
// left in the address bar, a history entry or a bookmark. From then on it lives in a ref: not in state, not in a
// prop, not in an attribute, and in no request but the one POST body.
//
// The address is removed twice, because the Next router copies it while it still holds the fragment. It keeps two
// copies: its state's `canonicalUrl`, which every `refresh` and server action writes back into the address, and the
// route it learned for this path, which any soft navigation to this same path (`replace`, `push`, a `Link`) writes
// back. The first removal is immediate and invisible to the router; the second tells the router, through its own
// patched `history.replaceState`, which ends the first copy. Nothing public ends the second, so a token page, and the
// claim dialog opened from one, make no router action (plan M8B-login-register-plan, L14b acceptance 6).

/** Exactly the 43 characters a minted token has (`mintEmailToken`: 32 bytes, base64url), after `#t=`. */
const FRAGMENT_TOKEN_PATTERN = /^#t=([A-Za-z0-9_-]{43})$/;

export type FragmentRead =
  | { readonly kind: "token"; readonly token: string }
  | { readonly kind: "none" };

const NO_TOKEN: FragmentRead = { kind: "none" };

/** The pieces of `window` this reads, so the read can be driven without a browser. */
export interface FragmentSource {
  readonly location: Pick<Location, "hash" | "pathname" | "search">;
  readonly history: Pick<History, "replaceState">;
}

/**
 * Reads the token from the fragment and removes the fragment. Anything in the fragment is removed, a malformed one
 * included, since a fragment that is not a token may still be part of one. The replacement keeps the path and the
 * query and drops nothing else. The router's history patch is installed in a passive effect, after the layout effect
 * this runs in, so this removal is the browser's alone: `tellRouterTheFragmentIsGone` is the second half.
 */
export function takeTokenFromFragment(source: FragmentSource): FragmentRead {
  const { hash, pathname, search } = source.location;
  if (hash === "") return NO_TOKEN;
  const token = FRAGMENT_TOKEN_PATTERN.exec(hash)?.[1];
  source.history.replaceState(null, "", pathname + search);
  return token === undefined ? NO_TOKEN : { kind: "token", token };
}

/**
 * Replaces the address with itself, without the fragment, through the router's patched `history.replaceState`: the
 * patch hands the new address to the router, which then holds one with no fragment. Once the router is mounted, it
 * is the only call that can end the router's copy; asking `location.hash` first is no test, as the address no longer
 * has one.
 */
export function tellRouterTheFragmentIsGone(source: FragmentSource): void {
  const { pathname, search } = source.location;
  source.history.replaceState(null, "", pathname + search);
}

/**
 * `reading` is what the server renders and the client hydrates with: the form, because the server cannot see the
 * fragment. The status leaves it once, in the layout effect, before the first paint the person can act on.
 */
export type FragmentTokenStatus = "reading" | "present" | "absent";

export interface FragmentToken {
  readonly status: FragmentTokenStatus;
  /** The token, for the one request that sends it. Empty until the status is `present`, and after `discard`. */
  readonly tokenRef: RefObject<string | undefined>;
  readonly discard: () => void;
}

/**
 * Reads the fragment once on mount. A ref guards the read: under React Strict Mode the effect runs twice, and the
 * second run would find the fragment already gone and wrongly report no token. The router is told in the effect that
 * follows the status change: the layout effect's state update renders again only after the first commit's passive
 * effects have run, and the router's history patch is one of them.
 */
export function useFragmentToken(): FragmentToken {
  const tokenRef = useRef<string | undefined>(undefined);
  const hasReadRef = useRef(false);
  const hadFragmentRef = useRef(false);
  const [status, setStatus] = useState<FragmentTokenStatus>("reading");

  useLayoutEffect(() => {
    if (hasReadRef.current) return;
    hasReadRef.current = true;
    hadFragmentRef.current = window.location.hash !== "";
    const read = takeTokenFromFragment(window);
    tokenRef.current = read.kind === "token" ? read.token : undefined;
    setStatus(read.kind === "token" ? "present" : "absent");
  }, []);

  useEffect(() => {
    if (status === "reading" || !hadFragmentRef.current) return;
    hadFragmentRef.current = false;
    tellRouterTheFragmentIsGone(window);
  }, [status]);

  const discard = useCallback(() => {
    tokenRef.current = undefined;
  }, []);

  return { status, tokenRef, discard };
}
