"use client";

import { CONTACT_CHANNELS } from "@lemnaria/configurator-domain";
import {
  createRef,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
  type RefObject,
} from "react";

import type { Content } from "@/i18n/content";
import { useContent } from "@/i18n/use-content";

import {
  firstInvalidField,
  type ContactFormField,
  type ContactFormState,
  type ContactFormValues,
  type ContactTextField,
} from "./contact-form-model";
import {
  ContactOutcome,
  isSendOff,
  outcomeToShow,
  useIsWaitingForTheLimit,
  useIssuesBesideFields,
} from "./contact-outcome";
import styles from "./contact.module.css";
import type {
  ContactFormEdit,
  ContactSubmission,
  RefusedPress,
} from "./use-contact-submission";
import { useKeepFocusAbove } from "./use-keep-focus-above";

// Frames 4A and 4B: the fields, the consent beside the call to action, and the errors beside what they are about. What
// the customer typed lives in `useContactSubmission`'s memory and nowhere else; this file only draws it and reports
// each keystroke, leave and press back. It does not know whether it sits in the design's form or the callback's.

/** A field no browser autofills and no person sees: a name that is not a contact field's, so a fill that reads names
 *  leaves it empty and a script that fills every input does not. */
const HONEYPOT_FIELD_NAME = "reference_note";

interface InputTraits {
  readonly type: "text" | "tel" | "email";
  readonly autoComplete: string;
  readonly inputMode: "text" | "tel" | "email";
  readonly autoCapitalize: "none" | "words";
}

const TEXT_FIELD_TRAITS: Readonly<Record<ContactTextField, InputTraits>> = {
  name: {
    type: "text",
    autoComplete: "name",
    inputMode: "text",
    autoCapitalize: "words",
  },
  phone: {
    type: "tel",
    autoComplete: "tel",
    inputMode: "tel",
    autoCapitalize: "none",
  },
  locality: {
    type: "text",
    autoComplete: "address-level2",
    inputMode: "text",
    autoCapitalize: "words",
  },
  email: {
    type: "email",
    autoComplete: "email",
    inputMode: "email",
    autoCapitalize: "none",
  },
};

type FieldRefs = Readonly<
  Record<ContactFormField, RefObject<HTMLInputElement | null>>
>;

function createFieldRefs(): FieldRefs {
  return {
    name: createRef(),
    phone: createRef(),
    locality: createRef(),
    email: createRef(),
    consent: createRef(),
  };
}

export interface ContactFormProps {
  readonly submission: ContactSubmission;
  /** The line over the call to action while a request is out; it differs for a request with no design. */
  readonly sendingLine: string;
  /** The way to the review that fetches it, for the answers that send the customer there. */
  readonly reviewLink?: ReactNode;
  /** What stands above the fields: the heading, and for a design its card. */
  readonly children: ReactNode;
}

export function ContactForm({
  submission,
  sendingLine,
  reviewLink,
  children,
}: ContactFormProps) {
  const { form, phase, refusedPress, edit, press } = submission;
  const [fieldRefs] = useState(createFieldRefs);
  useFocusRefusedField(refusedPress, fieldRefs);
  const isLimitWaiting = useIsWaitingForTheLimit(phase);
  const issues = useIssuesBesideFields(phase, form.values);
  const shownForm = { ...form, errors: { ...issues, ...form.errors } };
  const isSending = phase.kind === "sending";
  const isOff = isSendOff(submission, isLimitWaiting);

  // The hook refuses a press in each of these cases too; this keeps the button's `aria-disabled` honest.
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isOff) press();
  };

  return (
    <form
      className={styles.form}
      noValidate
      aria-busy={isSending}
      onSubmit={handleSubmit}
    >
      <div className={styles.body} inert={isSending} data-dimmed={isSending}>
        {children}
        <Fields form={shownForm} edit={edit} fieldRefs={fieldRefs} />
      </div>
      <PinnedRegion
        submission={submission}
        form={shownForm}
        consentRef={fieldRefs.consent}
        status={{ isOff, isLimitWaiting, sendingLine, reviewLink }}
      />
    </form>
  );
}

/** A refused press moves focus to the first invalid field and scrolls its block, error included, clear of the pinned
 *  region; the viewport's scroll padding, kept by `useKeepFocusAbove`, is what "clear" is measured against. */
function useFocusRefusedField(
  refusedPress: RefusedPress | undefined,
  fieldRefs: FieldRefs,
): void {
  useEffect(() => {
    if (refusedPress === undefined) return;
    const input = fieldRefs[refusedPress.field].current;
    if (input === null) return;
    input.focus({ preventScroll: true });
    const block = input.closest("[data-field-block]") ?? input;
    block.scrollIntoView({ block: "nearest" });
  }, [refusedPress, fieldRefs]);
}

interface FieldsProps {
  readonly form: ContactFormState;
  readonly edit: (event: ContactFormEdit) => void;
  readonly fieldRefs: FieldRefs;
}

function Fields({ form, edit, fieldRefs }: FieldsProps) {
  return (
    <div className={styles.fields}>
      <TextField
        field="name"
        form={form}
        edit={edit}
        inputRef={fieldRefs.name}
      />
      <TextField
        field="phone"
        form={form}
        edit={edit}
        inputRef={fieldRefs.phone}
      />
      <TextField
        field="locality"
        form={form}
        edit={edit}
        inputRef={fieldRefs.locality}
      />
      <ChannelChooser channel={form.values.channel} edit={edit} />
      {form.values.channel === "email" ? (
        <TextField
          field="email"
          form={form}
          edit={edit}
          inputRef={fieldRefs.email}
        />
      ) : null}
      <Honeypot text={form.values.honeypot} edit={edit} />
    </div>
  );
}

interface TextFieldProps {
  readonly field: ContactTextField;
  readonly form: ContactFormState;
  readonly edit: (event: ContactFormEdit) => void;
  readonly inputRef: RefObject<HTMLInputElement | null>;
}

/** A label, an input and, once the field has been left invalid, the sentence beside it that the input points at. */
function TextField({ field, form, edit, inputRef }: TextFieldProps) {
  const content = useContent();
  const inputId = useId();
  const errorId = useId();
  const copy = copyOfTextField(content.contact, field);
  const traits = TEXT_FIELD_TRAITS[field];
  const code = form.errors[field];
  return (
    <div
      className={styles.field}
      data-field-block
      data-invalid={code !== undefined}
    >
      <label className={styles.label} htmlFor={inputId}>
        {copy.label}
      </label>
      <input
        ref={inputRef}
        id={inputId}
        className={styles.input}
        name={field}
        type={traits.type}
        autoComplete={traits.autoComplete}
        inputMode={traits.inputMode}
        autoCapitalize={traits.autoCapitalize}
        placeholder={copy.placeholder}
        value={form.values[field]}
        aria-invalid={code === undefined ? undefined : true}
        aria-describedby={code === undefined ? undefined : errorId}
        onChange={(event) => {
          edit({ type: "text-changed", field, text: event.target.value });
        }}
        onBlur={() => {
          edit({ type: "field-left", field });
        }}
      />
      {code === undefined ? null : (
        <FieldError id={errorId} sentence={content.contactFieldError(code)} />
      )}
    </div>
  );
}

function copyOfTextField(
  copy: Content["contact"],
  field: ContactTextField,
): { readonly label: string; readonly placeholder: string } {
  switch (field) {
    case "name":
      return { label: copy.nameLabel, placeholder: copy.namePlaceholder };
    case "phone":
      return { label: copy.phoneLabel, placeholder: copy.phonePlaceholder };
    case "locality":
      return {
        label: copy.localityLabel,
        placeholder: copy.localityPlaceholder,
      };
    case "email":
      return { label: copy.emailLabel, placeholder: copy.emailPlaceholder };
  }
}

/** The sentence an error is, announced when it appears, with a mark so it is never told by colour alone. */
function FieldError({
  id,
  sentence,
}: {
  readonly id: string;
  readonly sentence: string;
}) {
  return (
    <p id={id} className={styles.error} role="alert">
      <span className={styles.errorMark} aria-hidden="true">
        !
      </span>
      <span>{sentence}</span>
    </p>
  );
}

/** Frame 4A's three chips, as the radio group they are: one tab stop, arrows move the choice. */
function ChannelChooser({
  channel,
  edit,
}: {
  readonly channel: ContactFormValues["channel"];
  readonly edit: (event: ContactFormEdit) => void;
}) {
  const content = useContent();
  return (
    <fieldset className={styles.channels}>
      <legend className={styles.label}>{content.contact.channelLabel}</legend>
      <div className={styles.chips}>
        {CONTACT_CHANNELS.map((option) => (
          <label key={option} className={styles.chip}>
            <input
              type="radio"
              className={styles.chipInput}
              name="channel"
              value={option}
              checked={option === channel}
              onChange={() => {
                edit({ type: "channel-chosen", channel: option });
              }}
            />
            <span className={styles.chipText}>
              {content.contact.channels[option]}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Out of sight, out of the tab order and out of the accessibility tree, and not `display: none`, which a script that
 *  fills what it can see would also skip. Its text is sent as the request's `honeypot`. */
function Honeypot({
  text,
  edit,
}: {
  readonly text: string;
  readonly edit: (event: ContactFormEdit) => void;
}) {
  return (
    <div className={styles.honeypot} aria-hidden="true">
      <input
        type="text"
        name={HONEYPOT_FIELD_NAME}
        tabIndex={-1}
        autoComplete="off"
        value={text}
        onChange={(event) => {
          edit({ type: "honeypot-filled", text: event.target.value });
        }}
      />
    </div>
  );
}

interface PinnedStatus {
  readonly isOff: boolean;
  readonly isLimitWaiting: boolean;
  readonly sendingLine: string;
  readonly reviewLink: ReactNode;
}

/** Pinned to the foot of the viewport: the answer's sentence and the unsaved edit's above the consent and the call to
 *  action, so the button is never off without its reason standing in the same region. While a request is out the
 *  consent is dimmed and inert with the body, as frame 4C draws it, and the line says not to close the page. */
function PinnedRegion({
  submission,
  form,
  consentRef,
  status,
}: {
  readonly submission: ContactSubmission;
  readonly form: ContactFormState;
  readonly consentRef: RefObject<HTMLInputElement | null>;
  readonly status: PinnedStatus;
}) {
  const { phase, saveWait, edit, press } = submission;
  const regionRef = useRef<HTMLDivElement>(null);
  const ctaRef = useRef<HTMLButtonElement>(null);
  const saveWaitSentenceId = useId();
  const outcomeSentenceId = useId();
  useKeepFocusAbove(regionRef);
  const shownOutcome = outcomeToShow(phase, status.isLimitWaiting);
  const isSending = phase.kind === "sending";
  const reasonIds = [
    ...(saveWait.kind === "waiting" ? [saveWaitSentenceId] : []),
    ...(shownOutcome !== undefined && status.isOff ? [outcomeSentenceId] : []),
  ];
  // The retry button is gone once pressed, and focus goes to the button that took its place in the flow.
  const retry = () => {
    press();
    ctaRef.current?.focus();
  };
  return (
    <div className={styles.bottom} ref={regionRef} data-testid="contact-bottom">
      {shownOutcome === undefined ? null : (
        <ContactOutcome
          phase={shownOutcome}
          id={outcomeSentenceId}
          reviewLink={status.reviewLink}
          onRetry={retry}
        />
      )}
      {saveWait.kind === "waiting" ? (
        <p
          id={saveWaitSentenceId}
          className={saveWait.hasFailed ? styles.refusal : styles.waiting}
          data-testid="contact-save-wait"
        >
          {saveWait.sentence}
        </p>
      ) : null}
      <ConsentRow
        form={form}
        edit={edit}
        inputRef={consentRef}
        isSending={isSending}
      />
      {isSending ? (
        <p
          className={styles.sendingLine}
          role="status"
          data-testid="contact-sending-line"
        >
          {status.sendingLine}
        </p>
      ) : null}
      <CallToAction
        ctaRef={ctaRef}
        values={form.values}
        isOff={status.isOff}
        isSending={isSending}
        describedBy={reasonIds.length === 0 ? undefined : reasonIds.join(" ")}
      />
    </div>
  );
}

/** The consent and its sentence, which carries the visible mark that its wording is provisional. */
function ConsentRow({
  form,
  edit,
  inputRef,
  isSending,
}: {
  readonly form: ContactFormState;
  readonly edit: (event: ContactFormEdit) => void;
  readonly inputRef: RefObject<HTMLInputElement | null>;
  readonly isSending: boolean;
}) {
  const content = useContent();
  const checkboxId = useId();
  const errorId = useId();
  const code = form.errors.consent;
  return (
    <div
      className={styles.consent}
      data-invalid={code !== undefined}
      data-dimmed={isSending}
      inert={isSending}
      data-testid="contact-consent"
    >
      <div className={styles.consentRow}>
        <input
          ref={inputRef}
          id={checkboxId}
          className={styles.consentBox}
          type="checkbox"
          name="consent"
          checked={form.values.consent}
          aria-invalid={code === undefined ? undefined : true}
          aria-describedby={code === undefined ? undefined : errorId}
          onChange={(event) => {
            edit({ type: "consent-changed", isGiven: event.target.checked });
          }}
          onBlur={() => {
            edit({ type: "field-left", field: "consent" });
          }}
        />
        <label className={styles.consentLabel} htmlFor={checkboxId}>
          {content.contact.consent}{" "}
          <span className={styles.marker}>
            {content.contact.consentProvisionalMarker}
          </span>
        </label>
      </div>
      {code === undefined ? null : (
        <FieldError id={errorId} sentence={content.contactFieldError(code)} />
      )}
    </div>
  );
}

/** Pressable whenever a press can do something, because a refused press is how the customer is told which field to
 *  mend; off, and saying why, while an edit is unsaved, a request is out, or the answer was final or limited. While a
 *  request is out it shows the sending label and a spinner. It reads as ready once the form would be sent. */
function CallToAction({
  ctaRef,
  values,
  isOff,
  isSending,
  describedBy,
}: {
  readonly ctaRef: RefObject<HTMLButtonElement | null>;
  readonly values: ContactFormValues;
  readonly isOff: boolean;
  readonly isSending: boolean;
  readonly describedBy: string | undefined;
}) {
  const content = useContent();
  return (
    <button
      ref={ctaRef}
      type="submit"
      className={styles.cta}
      data-ready={firstInvalidField(values) === undefined}
      aria-disabled={isOff ? "true" : undefined}
      aria-describedby={describedBy}
      data-testid="contact-cta"
    >
      {isSending ? (
        <span className={styles.spinner} aria-hidden="true" />
      ) : null}
      {isSending ? content.contact.sending : content.contact.callToAction}
    </button>
  );
}
