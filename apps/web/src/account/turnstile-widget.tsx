"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

// The Cloudflare Turnstile challenge on an account form (ADR 0169 D5). The page's server component reads the site key
// per request and the request's nonce (`NONCE_HEADER`) and hands both down; the widget hands the form a token and takes
// it back when the token is spent, expired or failed. The token is verified on the server with the same `action`.

/** The actions the server verifies (`expectedAction`): register, login and the reset request. */
export type TurnstileAction = "register" | "login" | "reset";

export interface TurnstileWidgetProps {
  /** `TURNSTILE_SITE_KEY`, read on the server. Missing or blank shows `unavailableContent`, never a widget. */
  readonly siteKey: string | undefined;
  /** The request's CSP nonce. Missing shows `unavailableContent`: the script could not run under the policy. */
  readonly nonce: string | undefined;
  readonly action: TurnstileAction;
  /** A fresh token, or `null` when the held one is gone (expired, failed, reset). */
  readonly onTokenChange: (token: string | null) => void;
  /** The form increments this after each submit: a token is single-use, so the challenge restarts. */
  readonly resetCount: number;
  /** The localised "challenge unavailable" copy, from the caller's catalogue. */
  readonly unavailableContent: ReactNode;
}

interface TurnstileRenderOptions {
  readonly sitekey: string;
  readonly action: TurnstileAction;
  readonly callback: (token: string) => void;
  readonly "expired-callback": () => void;
  readonly "error-callback": () => void;
}

interface TurnstileApi {
  render: (container: HTMLElement, options: TurnstileRenderOptions) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
}

type WindowWithTurnstile = Window & { turnstile?: TurnstileApi };

/** Exactly this URL: Cloudflare forbids proxying or caching it. `render=explicit` leaves rendering to this component. */
const TURNSTILE_SCRIPT_URL =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

export function TurnstileWidget(props: TurnstileWidgetProps): ReactNode {
  const { siteKey, nonce, unavailableContent } = props;
  if (isBlank(siteKey) || isBlank(nonce)) return unavailableContent;
  return <TurnstileChallenge {...props} siteKey={siteKey} nonce={nonce} />;
}

type TurnstileChallengeProps = TurnstileWidgetProps & {
  readonly siteKey: string;
  readonly nonce: string;
};

function TurnstileChallenge({
  siteKey,
  nonce,
  action,
  onTokenChange,
  resetCount,
  unavailableContent,
}: TurnstileChallengeProps): ReactNode {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onTokenChangeRef = useRef(onTokenChange);
  const [hasScriptFailed, setHasScriptFailed] = useState(false);

  useEffect(() => {
    onTokenChangeRef.current = onTokenChange;
  }, [onTokenChange]);

  useEffect(() => {
    let isCancelled = false;
    loadTurnstile(nonce)
      .then((api) => {
        const container = containerRef.current;
        if (isCancelled || container === null) return;
        widgetIdRef.current = api.render(container, {
          sitekey: siteKey,
          action,
          callback: (token) => {
            onTokenChangeRef.current(token);
          },
          "expired-callback": () => {
            onTokenChangeRef.current(null);
          },
          "error-callback": () => {
            onTokenChangeRef.current(null);
          },
        });
      })
      .catch(() => {
        if (!isCancelled) setHasScriptFailed(true);
      });
    return () => {
      isCancelled = true;
      removeWidget(widgetIdRef);
    };
  }, [siteKey, nonce, action]);

  useEffect(() => {
    if (resetCount === 0) return;
    resetWidget(widgetIdRef);
    onTokenChangeRef.current(null);
  }, [resetCount]);

  if (hasScriptFailed) return unavailableContent;
  return <div ref={containerRef} />;
}

function isBlank(value: string | undefined): value is undefined | "" {
  return value === undefined || value.trim() === "";
}

function readTurnstileApi(): TurnstileApi | undefined {
  return (window as WindowWithTurnstile).turnstile;
}

function removeWidget(widgetIdRef: { current: string | null }): void {
  const widgetId = widgetIdRef.current;
  if (widgetId === null) return;
  readTurnstileApi()?.remove(widgetId);
  widgetIdRef.current = null;
}

function resetWidget(widgetIdRef: { current: string | null }): void {
  const widgetId = widgetIdRef.current;
  if (widgetId === null) return;
  readTurnstileApi()?.reset(widgetId);
}

let pendingScriptLoad: Promise<TurnstileApi> | undefined;

/** One script element for the page's lifetime; a failed load is forgotten so a later mount may retry. */
function loadTurnstile(nonce: string): Promise<TurnstileApi> {
  const loaded = readTurnstileApi();
  if (loaded !== undefined) return Promise.resolve(loaded);
  pendingScriptLoad ??= appendTurnstileScript(nonce).catch(
    (failure: unknown) => {
      pendingScriptLoad = undefined;
      throw failure;
    },
  );
  return pendingScriptLoad;
}

function appendTurnstileScript(nonce: string): Promise<TurnstileApi> {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = TURNSTILE_SCRIPT_URL;
    script.nonce = nonce;
    script.async = true;
    script.onload = () => {
      const api = readTurnstileApi();
      if (api === undefined) reject(new Error("turnstile api missing"));
      else resolve(api);
    };
    script.onerror = () => {
      script.remove();
      reject(new Error("turnstile script failed to load"));
    };
    document.head.append(script);
  });
}
