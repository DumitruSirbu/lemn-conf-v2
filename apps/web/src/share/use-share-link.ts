"use client";

import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import type { DesignId } from "@lemnaria/configurator-domain";

import {
  issueShareLink,
  revokeShareLink,
  shareLinkStatus,
} from "@/persistence/share-link-client";

import { absoluteShareAddress } from "./absolute-share-address";

// The state machine of one design's share link, for every surface that offers one: the editor's settings sheet and the
// account's kitchen list. The link is shown once and lives only in this state: never the store, Web Storage, the URL or
// a log.

/** How long *Copiat* replaces *Copiază* before reverting: long enough to read, short enough that a later copy
 *  shows the real button again. */
const COPY_FEEDBACK_MS = 2000;

/** The failed operation travels with the error, so a retry repeats *that* request: a failed status check retried
 *  as a create would mint a fresh link and kill the one the sheet found active. */
export type FailedShareOperation = "status" | "create" | "revoke";

export type ShareControlState =
  | { readonly kind: "checking" }
  | { readonly kind: "none"; readonly justRevoked: boolean }
  | { readonly kind: "active" }
  | {
      readonly kind: "just-issued";
      readonly path: string;
      readonly copied: boolean;
    }
  | {
      readonly kind: "error";
      readonly failedOperation: FailedShareOperation;
    };

export interface ShareLink {
  readonly state: ShareControlState;
  /** The read-only field that shows the new link, selected when it is copied. */
  readonly linkFieldRef: RefObject<HTMLInputElement | null>;
  readonly create: () => void;
  readonly revoke: () => void;
  /** Repeats whichever request failed. */
  readonly retryFailedOperation: () => void;
  readonly copy: (path: string) => void;
}

/** Reads the status on mount, as the surface's own open is the one moment it does, not a schedule: a poll must never
 *  second-guess a revoke or re-issue this hook performed. */
export function useShareLink(designId: DesignId): ShareLink {
  const [state, setState] = useState<ShareControlState>({ kind: "checking" });
  const linkFieldRef = useRef<HTMLInputElement>(null);
  const copyTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  useReadStatusOnOpen(designId, setState);

  useEffect(
    () => () => {
      if (copyTimeout.current !== undefined) clearTimeout(copyTimeout.current);
    },
    [],
  );

  function checkStatus(): void {
    setState({ kind: "checking" });
    shareLinkStatus(designId)
      .then((active) => {
        setState({ kind: active ? "active" : "none", justRevoked: false });
      })
      .catch(() => {
        setState({ kind: "error", failedOperation: "status" });
      });
  }

  function create(): void {
    setState({ kind: "checking" });
    issueShareLink(designId)
      .then((path) => {
        setState({ kind: "just-issued", path, copied: false });
      })
      .catch(() => {
        setState({ kind: "error", failedOperation: "create" });
      });
  }

  function revoke(): void {
    setState({ kind: "checking" });
    revokeShareLink(designId)
      .then(() => {
        setState({ kind: "none", justRevoked: true });
      })
      .catch(() => {
        setState({ kind: "error", failedOperation: "revoke" });
      });
  }

  /** Repeats whichever request failed: a status check retried as `create` would mint a fresh link, and a failed
   *  revoke retried as `create` would leave the link it meant to kill standing beside a second one. */
  function retryFailedOperation(): void {
    if (state.kind !== "error") return;
    if (state.failedOperation === "status") {
      checkStatus();
      return;
    }
    if (state.failedOperation === "revoke") {
      revoke();
      return;
    }
    create();
  }

  /** `copied` only follows a `writeText` that resolved. The field stays selected either way, so a browser that
   *  withheld clipboard access still lets the customer copy by hand. Both promise branches are handled, so a
   *  rejection is never unhandled. */
  function copy(path: string): void {
    linkFieldRef.current?.select();
    // `lib.dom.d.ts` declares `Navigator.clipboard` as always present, but without a secure context or permission it
    // is `undefined`: read through a narrower type so the runtime check is not "always true" to the compiler.
    const clipboard = (navigator as { clipboard?: Clipboard }).clipboard;
    if (clipboard === undefined) return;

    clipboard.writeText(absoluteShareAddress(path)).then(
      () => {
        setState((current) =>
          current.kind === "just-issued"
            ? { ...current, copied: true }
            : current,
        );
        if (copyTimeout.current !== undefined)
          clearTimeout(copyTimeout.current);
        copyTimeout.current = setTimeout(() => {
          setState((current) =>
            current.kind === "just-issued"
              ? { ...current, copied: false }
              : current,
          );
        }, COPY_FEEDBACK_MS);
      },
      () => {
        linkFieldRef.current?.select();
      },
    );
  }

  return { state, linkFieldRef, create, revoke, retryFailedOperation, copy };
}

function useReadStatusOnOpen(
  designId: DesignId,
  setState: Dispatch<SetStateAction<ShareControlState>>,
): void {
  useEffect(() => {
    let isCurrent = true;
    shareLinkStatus(designId)
      .then((active) => {
        if (isCurrent)
          setState({ kind: active ? "active" : "none", justRevoked: false });
      })
      .catch(() => {
        if (isCurrent) setState({ kind: "error", failedOperation: "status" });
      });
    return () => {
      isCurrent = false;
    };
  }, [designId, setState]);
}
