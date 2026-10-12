import {
  CONSENT_TEXT_VERSIONS,
  validateContactFields,
  validateContactSubmission,
  type ConsentTextVersion,
  type ContactChannel,
  type ContactFieldCode,
  type ContactFieldsInput,
  type ContactIntent,
  type ContactSubmissionRequest,
  type DesignReference,
  type SubmissionIssue,
  type SubmissionTarget,
} from "@lemnaria/configurator-domain";

import { routing, type AppLocale } from "@/i18n/routing";

// The contact form as a value: what the customer typed, which errors are showing, and the body that is sent. No
// React and no copy. Every rule is the domain's: a field is judged by `validateContactFields` and the whole body by
// `validateContactSubmission`, so the form holds no rule, no length and no code list of its own.

/** The form's fields in the order a refused submit looks for the first invalid one. */
export const CONTACT_FORM_FIELDS = [
  "name",
  "phone",
  "locality",
  "email",
  "consent",
] as const;
export type ContactFormField = (typeof CONTACT_FORM_FIELDS)[number];
export type ContactTextField = Exclude<ContactFormField, "consent">;

/** The consent text this form shows; the request states which one, and the domain refuses any not published. */
export const SHOWN_CONSENT_TEXT_VERSION: ConsentTextVersion =
  CONSENT_TEXT_VERSIONS[0];

export interface ContactFormValues {
  readonly name: string;
  readonly phone: string;
  readonly locality: string;
  readonly channel: ContactChannel;
  /** Kept while another channel is chosen, so choosing e-mail again finds it; it is sent only for e-mail. */
  readonly email: string;
  readonly consent: boolean;
  readonly honeypot: string;
}

/** The code each showing error carries; the screen finds its sentence by the code, never shows it. */
export type ContactFormErrors = Readonly<
  Partial<Record<ContactFormField, ContactFieldCode>>
>;

export interface ContactFormState {
  readonly values: ContactFormValues;
  readonly errors: ContactFormErrors;
}

export type ContactFormEvent =
  | {
      readonly type: "text-changed";
      readonly field: ContactTextField;
      readonly text: string;
    }
  | { readonly type: "consent-changed"; readonly isGiven: boolean }
  | { readonly type: "channel-chosen"; readonly channel: ContactChannel }
  | { readonly type: "honeypot-filled"; readonly text: string }
  | { readonly type: "field-left"; readonly field: ContactFormField }
  | { readonly type: "submit-pressed" };

export const INITIAL_CONTACT_FORM: ContactFormState = {
  values: {
    name: "",
    phone: "",
    locality: "",
    channel: "phone",
    email: "",
    consent: false,
    honeypot: "",
  },
  errors: {},
};

export function isContactFormField(text: string): text is ContactFormField {
  return CONTACT_FORM_FIELDS.some((field) => field === text);
}

/**
 * A field's error is judged when the field is left, each time it is left. While it has focus a showing error clears
 * as soon as the value is valid, and none appears or changes. A refused submit shows the first invalid field's error
 * and the consent's, and no error for a field never left.
 */
export function reduceContactForm(
  state: ContactFormState,
  event: ContactFormEvent,
): ContactFormState {
  switch (event.type) {
    case "text-changed":
      return afterEdit(
        { ...state.values, [event.field]: event.text },
        state,
        event.field,
      );
    case "consent-changed":
      return afterEdit(
        { ...state.values, consent: event.isGiven },
        state,
        "consent",
      );
    case "channel-chosen":
      return chooseChannel(state, event.channel);
    case "honeypot-filled":
      return { ...state, values: { ...state.values, honeypot: event.text } };
    case "field-left":
      return afterLeaving(state, event.field);
    case "submit-pressed":
      return afterSubmitPressed(state);
  }
}

/** The one error a field has, or none; an e-mail the channel does not use is never judged. */
export function judgeFormField(
  values: ContactFormValues,
  field: ContactFormField,
): ContactFieldCode | undefined {
  return judgeFormFields(values)[field];
}

export function firstInvalidField(
  values: ContactFormValues,
): ContactFormField | undefined {
  return firstFieldOf(judgeFormFields(values));
}

function afterEdit(
  editedValues: ContactFormValues,
  state: ContactFormState,
  field: ContactFormField,
): ContactFormState {
  const isErrorShowing = state.errors[field] !== undefined;
  const isStillInvalid = judgeFormField(editedValues, field) !== undefined;
  const errors =
    isErrorShowing && !isStillInvalid
      ? withoutError(state.errors, field)
      : state.errors;
  return { values: editedValues, errors };
}

function chooseChannel(
  state: ContactFormState,
  channel: ContactChannel,
): ContactFormState {
  const errors =
    channel === "email" ? state.errors : withoutError(state.errors, "email");
  return { values: { ...state.values, channel }, errors };
}

function afterLeaving(
  state: ContactFormState,
  field: ContactFormField,
): ContactFormState {
  const code = judgeFormField(state.values, field);
  const errors =
    code === undefined
      ? withoutError(state.errors, field)
      : { ...state.errors, [field]: code };
  return { ...state, errors };
}

function afterSubmitPressed(state: ContactFormState): ContactFormState {
  const judged = judgeFormFields(state.values);
  const first = firstFieldOf(judged);
  if (first === undefined) return state;
  const shown: ContactFormErrors = {
    ...state.errors,
    ...errorsOf(judged, [first, "consent"]),
  };
  return { ...state, errors: shown };
}

function judgeFormFields(values: ContactFormValues): ContactFormErrors {
  const validation = validateContactFields(contactFieldsOf(values));
  if (validation.ok) return {};
  return validation.issues.reduce<ContactFormErrors>(
    (errors, { field, code }) =>
      isContactFormField(field) ? { ...errors, [field]: code } : errors,
    {},
  );
}

function firstFieldOf(errors: ContactFormErrors): ContactFormField | undefined {
  return CONTACT_FORM_FIELDS.find((field) => errors[field] !== undefined);
}

function errorsOf(
  errors: ContactFormErrors,
  fields: readonly ContactFormField[],
): ContactFormErrors {
  return fields.reduce<ContactFormErrors>((picked, field) => {
    const code = errors[field];
    return code === undefined ? picked : { ...picked, [field]: code };
  }, {});
}

function withoutError(
  errors: ContactFormErrors,
  field: ContactFormField,
): ContactFormErrors {
  return Object.fromEntries(
    Object.entries(errors).filter(([name]) => name !== field),
  );
}

/** The contact part of the body, as typed: the server trims and judges it again. */
export interface ContactBodyFields extends ContactFieldsInput {
  readonly name: string;
  readonly phone: string;
  readonly locality: string;
  readonly channel: ContactChannel;
  /** Present exactly when the channel is e-mail: an address the customer did not choose to be written to is not sent. */
  readonly email?: string;
  readonly consent: boolean;
  readonly consentTextVersion: ConsentTextVersion;
}

function contactFieldsOf(values: ContactFormValues): ContactBodyFields {
  const fields = {
    name: values.name,
    phone: values.phone,
    locality: values.locality,
    channel: values.channel,
    consent: values.consent,
    consentTextVersion: SHOWN_CONSENT_TEXT_VERSION,
  };
  return values.channel === "email"
    ? { ...fields, email: values.email }
    : fields;
}

/** The request body as the route reads it: a design reference or an intent, never both, and no price. */
export interface ContactSubmissionBody {
  readonly contact: ContactBodyFields;
  readonly design?: DesignReference;
  readonly intent?: ContactIntent;
  readonly clientRequestId: string;
  readonly locale: AppLocale;
  readonly honeypot: string;
  readonly elapsedMs: number;
}

export interface SubmissionInput {
  readonly values: ContactFormValues;
  readonly target: SubmissionTarget;
  readonly locale: AppLocale;
  readonly clientRequestId: string;
  readonly elapsedMs: number;
}

/** The body to send with the request the domain read from it, or the issues that refused it and nothing to send. */
export type PreparedSubmission =
  | {
      readonly ok: true;
      readonly body: ContactSubmissionBody;
      readonly request: ContactSubmissionRequest;
    }
  | { readonly ok: false; readonly issues: readonly SubmissionIssue[] };

export function prepareSubmission(input: SubmissionInput): PreparedSubmission {
  const body: ContactSubmissionBody = {
    contact: contactFieldsOf(input.values),
    ...targetPartOf(input.target),
    clientRequestId: input.clientRequestId,
    locale: input.locale,
    honeypot: input.values.honeypot,
    elapsedMs: input.elapsedMs,
  };
  const judgement = validateContactSubmission(body, routing.locales);
  return judgement.ok
    ? { ok: true, body, request: judgement.request }
    : { ok: false, issues: judgement.issues };
}

function targetPartOf(
  target: SubmissionTarget,
): Pick<ContactSubmissionBody, "design" | "intent"> {
  return target.kind === "design"
    ? { design: { id: target.design.id, revision: target.design.revision } }
    : { intent: target.intent };
}

/** Milliseconds from a clock that never goes back, such as `performance.now`. */
export type MonotonicClock = () => number;

/** Whole milliseconds since the form's first render, read again for every send. */
export function measureElapsedMs(
  startedAtMs: number,
  clock: MonotonicClock,
): number {
  const elapsedMs = Math.floor(clock() - startedAtMs);
  if (!Number.isFinite(elapsedMs)) {
    throw new RangeError("measureElapsedMs: the clock did not read a number");
  }
  return Math.max(0, elapsedMs);
}
