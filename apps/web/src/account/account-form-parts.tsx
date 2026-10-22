"use client";

import { useEffect, useId, useState, type ReactNode, type Ref } from "react";

import { useIsHydrated } from "@/components/use-is-hydrated";
import type {
  AccountRateLimitNotice,
  AccountRateLimitSentence,
  RichTagRenderer,
} from "@/i18n/content";
import { useAccountKitCopy } from "@/i18n/use-content";

import styles from "./account.module.css";
import { TurnstileWidget, type TurnstileAction } from "./turnstile-widget";

// The parts every account page is made of. They draw what they are given and decide nothing: which message, which
// field and when a form may send belong to the page's form. Links are plain anchors, since an account page is a
// document of its own and never a client-side navigation.

/** A tagged span of a message, drawn as the element it names. */
export const renderStrong: RichTagRenderer = (chunks) => (
  <strong>{chunks}</strong>
);

export interface AccountFormProps {
  /** Called on every submit, after the browser's own submission is cancelled. The form decides whether to send. */
  readonly onSubmit: () => void;
  readonly isBusy: boolean;
  readonly children: ReactNode;
}

export function AccountForm({ onSubmit, isBusy, children }: AccountFormProps) {
  return (
    <form
      method="post"
      noValidate
      className={styles.form}
      aria-busy={isBusy ? true : undefined}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      {children}
    </form>
  );
}

interface FieldIds {
  readonly inputId: string;
  readonly hintId: string;
  readonly errorId: string;
  readonly describedBy: string | undefined;
}

/** The ids a field's input points at: its refusal first, then the hint, each only while it is drawn. */
function useFieldIds(hasHint: boolean, hasError: boolean): FieldIds {
  const inputId = useId();
  const hintId = useId();
  const errorId = useId();
  const described = [hasError ? errorId : "", hasHint ? hintId : ""].filter(
    (id) => id !== "",
  );
  return {
    inputId,
    hintId,
    errorId,
    describedBy: described.length === 0 ? undefined : described.join(" "),
  };
}

interface FieldFrameProps {
  readonly label: string;
  readonly ids: FieldIds;
  readonly hint: string | undefined;
  readonly error: string | undefined;
  /** The password's live length, shown opposite the label. */
  readonly count?: string | undefined;
  readonly children: ReactNode;
}

/** The label, the box the control sits in, then the refusal and the hint. The refusal is announced when it appears. */
function FieldFrame({
  label,
  ids,
  hint,
  error,
  count,
  children,
}: FieldFrameProps) {
  return (
    <div className={styles.field} data-invalid={error !== undefined}>
      <div className={styles.labelRow}>
        <label className={styles.label} htmlFor={ids.inputId}>
          {label}
        </label>
        {count === undefined ? null : (
          <span className={styles.count}>{count}</span>
        )}
      </div>
      <div className={styles.control}>{children}</div>
      {error === undefined ? null : (
        <InlineRefusal id={ids.errorId}>{error}</InlineRefusal>
      )}
      {hint === undefined ? null : <FormHint id={ids.hintId}>{hint}</FormHint>}
    </div>
  );
}

/** A refusal drawn under what it is about, announced when it appears: a field's, or the challenge slot's. */
export function InlineRefusal({
  id,
  children,
}: {
  readonly id?: string;
  readonly children: ReactNode;
}) {
  return (
    <p id={id} className={styles.fieldError} role="alert">
      <span className={styles.fieldErrorMark} aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

/** A quiet line under a field or a button; the control it explains points at it with `aria-describedby`. */
export function FormHint({
  id,
  children,
}: {
  readonly id: string;
  readonly children: ReactNode;
}) {
  return (
    <p id={id} className={styles.hint}>
      {children}
    </p>
  );
}

export interface TextFieldProps {
  readonly label: string;
  readonly name: string;
  readonly type: "email" | "tel" | "text";
  readonly autoComplete: "email" | "tel" | "name" | "street-address" | "off";
  /** Capitals a name or an address begins its words with; an address, a number and the like stay as typed. */
  readonly autoCapitalize?: "off" | "words";
  /** Underlines misspellings; on for a name and an address, off for an e-mail address and a number. */
  readonly spellCheck?: boolean;
  readonly placeholder?: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly hint?: string;
  /** The refusal's sentence. Its presence marks the field invalid; it never repeats the value. */
  readonly error?: string;
  readonly inputRef?: Ref<HTMLInputElement>;
}

export function TextField(props: TextFieldProps) {
  const { label, hint, error, onChange } = props;
  const ids = useFieldIds(hint !== undefined, error !== undefined);
  return (
    <FieldFrame label={label} ids={ids} hint={hint} error={error}>
      <input
        ref={props.inputRef}
        id={ids.inputId}
        className={styles.input}
        name={props.name}
        type={props.type}
        autoComplete={props.autoComplete}
        autoCapitalize={props.autoCapitalize ?? "off"}
        spellCheck={props.spellCheck ?? false}
        placeholder={props.placeholder}
        value={props.value}
        aria-invalid={error === undefined ? undefined : true}
        aria-describedby={ids.describedBy}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
    </FieldFrame>
  );
}

export interface PasswordFieldProps {
  readonly label: string;
  readonly name: string;
  /** Register and reset choose a password; login and confirm enter the one that exists. */
  readonly autoComplete: "new-password" | "current-password";
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly hint?: string;
  readonly count?: string;
  readonly error?: string;
  readonly inputRef?: Ref<HTMLInputElement>;
}

/** A password box with a show / hide control inside its edge, in place of a "repeat the password" field. */
export function PasswordField(props: PasswordFieldProps) {
  const { label, hint, error, count, onChange } = props;
  const copy = useAccountKitCopy();
  const [isShown, setIsShown] = useState(false);
  const ids = useFieldIds(hint !== undefined, error !== undefined);
  return (
    <FieldFrame label={label} ids={ids} hint={hint} error={error} count={count}>
      <input
        ref={props.inputRef}
        id={ids.inputId}
        className={styles.input}
        name={props.name}
        type={isShown ? "text" : "password"}
        autoComplete={props.autoComplete}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        value={props.value}
        aria-invalid={error === undefined ? undefined : true}
        aria-describedby={ids.describedBy}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
      <button
        type="button"
        className={styles.toggle}
        aria-label={isShown ? copy.hidePasswordName : copy.showPasswordName}
        onClick={() => {
          setIsShown((wasShown) => !wasShown);
        }}
      >
        {isShown ? copy.hidePassword : copy.showPassword}
      </button>
    </FieldFrame>
  );
}

export interface FormNoticeProps {
  /** Set where a dialog names the notice among its descriptions (`aria-describedby`). */
  readonly id?: string;
  readonly tone: "error" | "warning" | "info" | "success";
  readonly title?: string;
  readonly children: ReactNode;
  /** The form moves focus here when the notice replaces the person's place: the summary of several refused fields. */
  readonly ref?: Ref<HTMLDivElement> | undefined;
  /** The notice stands inside a live region that is mounted before its words come (a status region the screen keeps),
   *  which does the announcing; it then carries no role of its own and is not announced twice. */
  readonly isInLiveRegion?: boolean;
}

/** A form-level message in a live region. An error interrupts (`alert`); the other tones wait their turn (`status`). */
export function FormNotice({
  id,
  tone,
  title,
  children,
  ref,
  isInLiveRegion = false,
}: FormNoticeProps) {
  return (
    <div
      id={id}
      ref={ref}
      className={styles.notice}
      data-tone={tone}
      role={roleOf(tone, isInLiveRegion)}
      tabIndex={-1}
    >
      <span className={styles.noticeMark} aria-hidden="true" />
      <div className={styles.noticeText}>
        {title === undefined ? null : (
          <span className={styles.noticeTitle}>{title}</span>
        )}
        <span className={styles.noticeBody}>{children}</span>
      </div>
    </div>
  );
}

function roleOf(
  tone: FormNoticeProps["tone"],
  isInLiveRegion: boolean,
): "alert" | "status" | undefined {
  if (isInLiveRegion) return undefined;
  return tone === "error" ? "alert" : "status";
}

/** The sentence for a limited request, in the warning tone. The same words for every address (plan section 5). A short
 *  wait is counted down here and nowhere else: the submit button only stays off for it. */
export function RateLimitNotice({
  notice,
  ref,
  isInLiveRegion = false,
}: {
  readonly notice: AccountRateLimitNotice;
  readonly ref?: Ref<HTMLDivElement> | undefined;
  readonly isInLiveRegion?: boolean;
}) {
  return notice.kind === "countdown" ? (
    <CountdownRateLimitNotice
      endsAtMs={notice.endsAtMs}
      ref={ref}
      isInLiveRegion={isInLiveRegion}
    />
  ) : (
    <SentenceRateLimitNotice
      sentence={notice}
      ref={ref}
      isInLiveRegion={isInLiveRegion}
    />
  );
}

function SentenceRateLimitNotice({
  sentence,
  ref,
  isInLiveRegion,
}: {
  readonly sentence: AccountRateLimitSentence;
  readonly ref?: Ref<HTMLDivElement> | undefined;
  readonly isInLiveRegion: boolean;
}) {
  const copy = useAccountKitCopy();
  return (
    <FormNotice tone="warning" ref={ref} isInLiveRegion={isInLiveRegion}>
      {copy.rateLimit(sentence, renderStrong)}
    </FormNotice>
  );
}

/**
 * The ticking time is hidden from assistive technology and a sentence fixed at mount stands in for it, so the live
 * region announces the limit once, not every second. The same element then says the wait is over, which is the second
 * and last announcement.
 */
function CountdownRateLimitNotice({
  endsAtMs,
  ref,
  isInLiveRegion,
}: {
  readonly endsAtMs: number;
  readonly ref?: Ref<HTMLDivElement> | undefined;
  readonly isInLiveRegion: boolean;
}) {
  const copy = useAccountKitCopy();
  const remaining = useSecondsUntil(endsAtMs);
  const [announcedMinutes] = useState(() =>
    Math.max(1, Math.ceil(secondsUntil(endsAtMs) / SECONDS_PER_MINUTE)),
  );
  if (remaining === 0) {
    return (
      <FormNotice tone="info" ref={ref} isInLiveRegion={isInLiveRegion}>
        {copy.rateLimitReady}
      </FormNotice>
    );
  }
  const minutes = Math.floor(remaining / SECONDS_PER_MINUTE);
  const secondsPart = String(remaining % SECONDS_PER_MINUTE).padStart(
    SECOND_DIGITS,
    "0",
  );
  return (
    <FormNotice tone="warning" ref={ref} isInLiveRegion={isInLiveRegion}>
      <span aria-hidden="true">
        {copy.rateLimitCountdown(minutes, secondsPart, renderStrong)}
      </span>
      <span className={styles.visuallyHidden}>
        {copy.rateLimit(
          { kind: "minutes", minutes: announcedMinutes },
          renderStrong,
        )}
      </span>
    </FormNotice>
  );
}

export interface OutcomeHeroProps {
  readonly tone: "success" | "error" | "neutral";
  /** The neutral tone's mark: a letter for "check your e-mail", a question mark for a page that does not exist. */
  readonly glyph?: "mail" | "question";
  readonly title: string;
  readonly children: ReactNode;
  /** The title takes focus when this screen replaces the form, so a screen reader starts at its first word. */
  readonly headingRef?: Ref<HTMLHeadingElement>;
}

/** The state that ends a page: a mark, the page's heading and the sentence under it. It replaces the form, whose own
 *  heading goes with it, so this is the page's one `h1`. */
export function OutcomeHero(props: OutcomeHeroProps) {
  return (
    <section
      className={styles.hero}
      data-tone={props.tone}
      data-glyph={props.glyph}
    >
      <span className={styles.heroMark} aria-hidden="true" />
      <h1 ref={props.headingRef} tabIndex={-1} className={styles.heroTitle}>
        {props.title}
      </h1>
      <p className={styles.heroBody}>{props.children}</p>
    </section>
  );
}

/** "Did the e-mail not arrive?": a titled list of what to try. */
export function HelpList({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <div className={styles.help}>
      <p className={styles.helpTitle}>{title}</p>
      <ul className={styles.helpItems}>{children}</ul>
    </div>
  );
}

export function HelpItem({ children }: { readonly children: ReactNode }) {
  return <li className={styles.helpItem}>{children}</li>;
}

/** A plain anchor: a full document load, at least as tall as a touch target. */
export function AccountLink({
  href,
  children,
}: {
  readonly href: string;
  readonly children: ReactNode;
}) {
  return (
    <a href={href} className={styles.link}>
      {children}
    </a>
  );
}

/** The links that belong to the fields above them, in one row under the last of them. */
export function FieldLinks({ children }: { readonly children: ReactNode }) {
  return <div className={styles.fieldLinks}>{children}</div>;
}

/** A link set inside a sentence. `isNewTab` opens the destination beside the form, so what was typed survives. */
export function InlineLink({
  href,
  isNewTab = false,
  children,
}: {
  readonly href: string;
  readonly isNewTab?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <a
      href={href}
      className={styles.inlineLink}
      {...(isNewTab ? { target: "_blank", rel: "noopener" } : {})}
    >
      {children}
    </a>
  );
}

/** An action of the page that reads as a link: it changes what the page shows and is no address. */
export function LinkButton({
  onClick,
  children,
}: {
  readonly onClick: () => void;
  readonly children: ReactNode;
}) {
  return (
    <button type="button" className={styles.linkButton} onClick={onClick}>
      {children}
    </button>
  );
}

/** The sentence above the primary action that names the notice the person is shown. */
export function LegalLine({ children }: { readonly children: ReactNode }) {
  return <p className={styles.legal}>{children}</p>;
}

export interface ChallengeFieldProps {
  readonly siteKey: string | undefined;
  readonly nonce: string | undefined;
  readonly action: TurnstileAction;
  readonly onTokenChange: (token: string | null) => void;
  readonly resetCount: number;
  /** The server refused the last token: said under the slot, where the person looks for the challenge. */
  readonly isRefused: boolean;
  /** Called once the slot shows its "unavailable" copy, so the page can stop saying it waits for a challenge. */
  readonly onUnavailable?: () => void;
}

/** The Turnstile slot with its three states drawn in the page's words: loading, unavailable and refused. */
export function ChallengeField(props: ChallengeFieldProps) {
  const copy = useAccountKitCopy();
  return (
    <div className={styles.challengeArea}>
      <TurnstileWidget
        siteKey={props.siteKey}
        nonce={props.nonce}
        action={props.action}
        onTokenChange={props.onTokenChange}
        resetCount={props.resetCount}
        loadingContent={
          <div className={styles.challengeLoading}>
            {copy.challenge.loading}
          </div>
        }
        unavailableContent={
          <UnavailableChallenge onShown={props.onUnavailable}>
            {copy.challenge.unavailable}
          </UnavailableChallenge>
        }
      />
      {props.isRefused ? (
        <InlineRefusal>{copy.challenge.failed}</InlineRefusal>
      ) : null}
    </div>
  );
}

/** The slot's "unavailable" notice, which tells the page it was drawn: the widget decides this on its own. */
function UnavailableChallenge({
  onShown,
  children,
}: {
  readonly onShown: (() => void) | undefined;
  readonly children: ReactNode;
}) {
  useEffect(() => {
    onShown?.();
  }, [onShown]);
  return <FormNotice tone="warning">{children}</FormNotice>;
}

/** A limit the button stays off for: it ends at an instant, which the notice counts down to. */
export interface SubmitWait {
  readonly endsAtMs: number;
}

/** The limit a feedback states, if it is a short one: the button keeps its label and is off until it ends. */
export function waitOfFeedback(feedback: {
  readonly kind: string;
  readonly notice?: AccountRateLimitNotice;
}): SubmitWait | undefined {
  if (
    feedback.kind !== "rate-limited" ||
    feedback.notice?.kind !== "countdown"
  ) {
    return undefined;
  }
  return { endsAtMs: feedback.notice.endsAtMs };
}

/**
 * The whole of the limit a feedback states, whatever form the notice tells it in: a countdown, whole minutes or a clock
 * time. A control that must not be pressed before the limit ends (the staff screens' retry and "load more") stays off for
 * all of it; the account forms' submit buttons keep to `waitOfFeedback`, which holds them for a short wait only. An
 * unreadable `Retry-After` states no end and holds nothing.
 */
export function fullWaitOfFeedback(feedback: {
  readonly kind: string;
  readonly notice?: AccountRateLimitNotice;
}): SubmitWait | undefined {
  const { notice } = feedback;
  if (feedback.kind !== "rate-limited" || notice?.kind === "unreadable") {
    return undefined;
  }
  return notice?.endsAtMs === undefined
    ? undefined
    : { endsAtMs: notice.endsAtMs };
}

export interface SubmitButtonProps {
  readonly label: string;
  readonly busyLabel: string;
  readonly isBusy: boolean;
  /** Not ready to send: no token yet, or a refusal the person has still to answer. */
  readonly isOff: boolean;
  /** A limit being counted down in the notice: the button is off until it ends and keeps its label. */
  readonly wait?: SubmitWait;
  /** The id of the line that says why the button is off. */
  readonly describedBy?: string;
}

/**
 * The page's one primary action. It is `disabled` until hydrated and `aria-disabled` after, so it stays reachable with
 * its reason beside it; a press while it is off is cancelled here, so no form needs to check twice.
 */
export function SubmitButton(props: SubmitButtonProps) {
  const { label, busyLabel, isBusy, isOff, wait, describedBy } = props;
  const isHydrated = useIsHydrated();
  const isWaiting = useSecondsUntil(wait?.endsAtMs) > 0;
  const isUnavailable = isOff || isBusy || isWaiting;
  return (
    <button
      type="submit"
      className={styles.submit}
      disabled={!isHydrated}
      aria-disabled={isHydrated && isUnavailable ? true : undefined}
      aria-busy={isBusy ? true : undefined}
      aria-describedby={describedBy}
      onClick={(event) => {
        if (isUnavailable) event.preventDefault();
      }}
    >
      {isBusy ? <span className={styles.spinner} aria-hidden="true" /> : null}
      {isBusy ? busyLabel : label}
    </button>
  );
}

export interface ChallengedSubmitProps {
  readonly label: string;
  readonly busyLabel: string;
  readonly isBusy: boolean;
  /** Whether a challenge token is held. The server refuses a request without one. */
  readonly hasToken: boolean;
  /** Whether the challenge slot says it cannot load: no token will come, and the page must not say one is awaited. */
  readonly isChallengeUnavailable: boolean;
  readonly wait?: SubmitWait | undefined;
}

/** The primary action of a form that sends a challenge token and, while it waits for one, the line that says why the
 *  button is off. A limit being counted down is the reason then, and the notice above already says it. */
export function ChallengedSubmit(props: ChallengedSubmitProps) {
  const { label, busyLabel, isBusy, hasToken, isChallengeUnavailable, wait } =
    props;
  const copy = useAccountKitCopy();
  const reasonId = useId();
  const isLimited = useSecondsUntil(wait?.endsAtMs) > 0;
  const isExplainingWait =
    !hasToken && !isBusy && !isChallengeUnavailable && !isLimited;
  return (
    <>
      <SubmitButton
        label={label}
        busyLabel={busyLabel}
        isBusy={isBusy}
        isOff={!hasToken}
        {...(wait === undefined ? {} : { wait })}
        {...(isExplainingWait ? { describedBy: reasonId } : {})}
      />
      {isExplainingWait ? (
        <FormHint id={reasonId}>{copy.challenge.waiting}</FormHint>
      ) : null}
    </>
  );
}

const COUNTDOWN_TICK_MS = 250;
const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const SECOND_DIGITS = 2;

/** Whole seconds until the instant, or none when there is no instant or it has gone by. */
function secondsUntil(endsAtMs: number | undefined): number {
  if (endsAtMs === undefined) return 0;
  return Math.max(0, Math.ceil((endsAtMs - Date.now()) / MS_PER_SECOND));
}

/** Whole seconds left, counted against the clock rather than by ticks, so a background tab catches up. Every reader of
 *  one instant agrees without sharing a timer. */
export function useSecondsUntil(endsAtMs: number | undefined): number {
  const [remaining, setRemaining] = useState(() => secondsUntil(endsAtMs));

  useEffect(() => {
    if (endsAtMs === undefined) return;
    const tick = () => {
      const left = secondsUntil(endsAtMs);
      setRemaining(left);
      if (left === 0) window.clearInterval(timerId);
    };
    const timerId = window.setInterval(tick, COUNTDOWN_TICK_MS);
    tick();
    return () => {
      window.clearInterval(timerId);
    };
  }, [endsAtMs]);

  return endsAtMs === undefined ? 0 : remaining;
}
