import { isDesignId, type RequestStatus } from "@lemnaria/configurator-domain";

import {
  classifyAccountAnswer,
  classifySignedInAnswer,
  KITCHEN_UNAVAILABLE_OUTCOME,
  UNANSWERED_OUTCOME,
  type AccountAnswer,
  type AccountFlow,
  type AccountOutcome,
  type SignedInOutcome,
} from "./account-answer";

// The one request an account form makes, and the one request a signed-in screen makes. Neither has an abort or a timer:
// the one-in-flight guard of the form or the screen lasts until this settles, so it must last at least as long as the
// server may take, whatever that is.

/** Same-origin paths, so the browser states the origin the routes' cross-site guard reads. */
const ACCOUNT_ENDPOINTS: Readonly<Record<AccountFlow, string>> = {
  register: "/api/account/register",
  login: "/api/account/login",
  "forgot-password": "/api/account/password-reset/request",
  "verify-email": "/api/account/verify-email",
  "reset-password": "/api/account/password-reset/complete",
};

const KITCHENS_ENDPOINT = "/api/account/kitchens";
const STAFF_KITCHENS_ENDPOINT = "/api/staff/kitchens";
const PROFILE_ENDPOINT = "/api/account/profile";
const PASSWORD_ENDPOINT = "/api/account/password";
const EMAIL_CHANGE_ENDPOINT = "/api/account/email-change";
const CONFIRM_EMAIL_ENDPOINT = "/api/account/email-change/confirm";
const REVERT_EMAIL_ENDPOINT = "/api/account/email-change/revert";
const EXPORT_ENDPOINT = "/api/account/export";
const CLAIM_ENDPOINT = "/api/account/claim";
const LOGOUT_ENDPOINT = "/api/account/logout";
const EMPTY_JSON_BODY = {};
const JSON_MEDIA_TYPE = "application/json";

/** Under the token pages' `no-referrer` a POST's `Origin` could read `null`, which the cross-site guard refuses;
 *  this per-request policy keeps the real origin on a same-origin request. */
const SAME_ORIGIN_REFERRER_POLICY: ReferrerPolicy = "same-origin";

/** A read states no origin the guard needs (it reads `Sec-Fetch-Site`, which a page cannot suppress), and the page it
 *  is sent from may carry a secret in its address (the share view's token): none of it may go in `Referer`. */
export const NO_REFERRER_POLICY: ReferrerPolicy = "no-referrer";

export interface RegisterBody {
  readonly email: string;
  readonly password: string;
  /** Left out when the person left the field empty. */
  readonly phone?: string;
  readonly locale: string;
  readonly privacyNoticeVersion: string;
  readonly turnstileToken: string;
}

export interface LoginBody {
  readonly email: string;
  readonly password: string;
  readonly turnstileToken: string;
}

export interface ForgotPasswordBody {
  readonly email: string;
  readonly turnstileToken: string;
}

export interface VerifyEmailBody {
  readonly token: string;
  readonly password: string;
}

export interface ResetPasswordBody {
  readonly token: string;
  readonly newPassword: string;
}

export type AccountRequest =
  | { readonly flow: "register"; readonly body: RegisterBody }
  | { readonly flow: "login"; readonly body: LoginBody }
  | { readonly flow: "forgot-password"; readonly body: ForgotPasswordBody }
  | { readonly flow: "verify-email"; readonly body: VerifyEmailBody }
  | { readonly flow: "reset-password"; readonly body: ResetPasswordBody };

export interface ProfileBody {
  /** A member left out is unchanged; an empty text clears it. */
  readonly name?: string;
  readonly address?: string;
  readonly phone?: string;
}

export interface ChangePasswordBody {
  readonly currentPassword: string;
  readonly newPassword: string;
}

export interface ChangeEmailBody {
  readonly newEmail: string;
  readonly currentPassword: string;
}

export interface ConfirmEmailBody {
  readonly token: string;
}

export interface RevertEmailBody {
  readonly token: string;
  readonly newPassword: string;
}

export interface LogoutBody {
  readonly scope: "this-device" | "everywhere";
}

/** What is done to one of the account's kitchens. The names are composed by the screen from its catalogue: the server
 *  writes no sentence. */
export type KitchenAction =
  | { readonly kind: "rename"; readonly name: string }
  | { readonly kind: "duplicate"; readonly name: string }
  | { readonly kind: "delete" }
  | { readonly kind: "hide" };

export type SignedInRequest =
  | { readonly flow: "kitchens"; readonly cursor?: string }
  | {
      readonly flow: "kitchen-action";
      readonly id: string;
      readonly action: KitchenAction;
    }
  | { readonly flow: "profile"; readonly body: ProfileBody }
  | { readonly flow: "password"; readonly body: ChangePasswordBody }
  | { readonly flow: "email-change"; readonly body: ChangeEmailBody }
  | { readonly flow: "confirm-email"; readonly body: ConfirmEmailBody }
  | { readonly flow: "revert-email"; readonly body: RevertEmailBody }
  | { readonly flow: "export" }
  | { readonly flow: "claim"; readonly intent: "count" | "claim" }
  | { readonly flow: "logout"; readonly body: LogoutBody }
  /** What staff write on a client's kitchen. The text is sent as given: the caller has judged it. */
  | {
      readonly flow: "staff-note";
      readonly id: string;
      readonly text: string;
    }
  | {
      readonly flow: "staff-status";
      readonly id: string;
      readonly status: RequestStatus;
      /** The status the page last saw: the save is made against it, and a kitchen that has moved on refuses it. */
      readonly from: RequestStatus;
    }
  | { readonly flow: "staff-unhide"; readonly id: string };

/** One request as the browser sends it. Every method but `GET` sends a JSON body, `{}` when the request has none of
 *  its own: the account routes refuse a `POST`, `PATCH` or `DELETE` that is not JSON (plan lot 2, section 2.2). */
interface PlannedRequest {
  readonly method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  readonly path: string;
  readonly body?: object;
}

/** `fetch`, as far as this request uses it, so a caller may hand in its own. */
export type FetchAccount = (
  url: string,
  init: RequestInit,
) => Promise<Response>;

const browserFetch: FetchAccount = (url, init) => fetch(url, init);

/** Sends the body and says which class the answer is. A request that got no answer is `unanswered`, not a throw. */
export async function sendAccountRequest(
  request: AccountRequest,
  fetchAccount: FetchAccount = browserFetch,
): Promise<AccountOutcome> {
  const answer = await answerTo(formRequestPlan(request), fetchAccount);
  return answer === undefined
    ? UNANSWERED_OUTCOME
    : classifyAccountAnswer(request.flow, answer);
}

/**
 * The same for the signed-in area. The account is the session's: no request member names one. An id that does not
 * have a design id's shape names no kitchen, so it is answered as the server would answer it and never put in an
 * address (it could carry a path segment of its own).
 */
export async function sendSignedInRequest(
  request: SignedInRequest,
  fetchAccount: FetchAccount = browserFetch,
): Promise<SignedInOutcome> {
  if (namesAKitchen(request) && !isDesignId(request.id)) {
    return KITCHEN_UNAVAILABLE_OUTCOME;
  }
  const answer = await answerTo(signedInRequestPlan(request), fetchAccount);
  return answer === undefined
    ? UNANSWERED_OUTCOME
    : classifySignedInAnswer(request.flow, answer);
}

/** The requests that put a kitchen's id in the address. */
function namesAKitchen(
  request: SignedInRequest,
): request is Extract<SignedInRequest, { readonly id: string }> {
  return "id" in request;
}

/** What the export request came to: the file to hand the person, or an outcome the page draws. */
export type ExportAnswer =
  | {
      readonly kind: "file";
      readonly blob: Blob;
      /** Always a name this module accepts: the server's, when it is a plain `.json` name, else the fallback. */
      readonly fileName: string;
    }
  | { readonly kind: "refused"; readonly outcome: SignedInOutcome };

/** Where the export's file name falls back to when the answer names none this module accepts. */
export const EXPORT_FALLBACK_FILE_NAME = "lemnaria-account-data.json";

const SAFE_EXPORT_FILE_NAME = /^[A-Za-z0-9._-]{1,100}\.json$/;
const QUOTED_FILE_NAME = /filename="([^"]*)"/i;
const OK_STATUS = 200;

/**
 * The account export, which is the one answer of the area that is a file and not JSON the screen reads. A `200` with a
 * JSON media type is taken as a blob before anything reads its body, since a body can be read once; every other answer
 * is classified like any signed-in answer. The file is handed back and kept nowhere here.
 */
export async function sendExportRequest(
  fetchAccount: FetchAccount = browserFetch,
): Promise<ExportAnswer> {
  const planned = signedInRequestPlan({ flow: "export" });
  try {
    const response = await fetchAccount(planned.path, initOf(planned));
    return isExportFile(response)
      ? {
          kind: "file",
          blob: await response.blob(),
          fileName: exportFileNameOf(response.headers),
        }
      : { kind: "refused", outcome: await classifiedExportRefusal(response) };
  } catch {
    return { kind: "refused", outcome: UNANSWERED_OUTCOME };
  }
}

function isExportFile(response: Response): boolean {
  return (
    response.status === OK_STATUS &&
    (response.headers.get("content-type") ?? "").startsWith(JSON_MEDIA_TYPE)
  );
}

/** The server's name for the file is a header, so it is not trusted past a plain name: no path, no markup. */
function exportFileNameOf(headers: Headers): string {
  const named = QUOTED_FILE_NAME.exec(
    headers.get("content-disposition") ?? "",
  )?.[1];
  return named !== undefined && SAFE_EXPORT_FILE_NAME.test(named)
    ? named
    : EXPORT_FALLBACK_FILE_NAME;
}

async function classifiedExportRefusal(
  response: Response,
): Promise<SignedInOutcome> {
  return classifySignedInAnswer("export", {
    status: response.status,
    retryAfter: response.headers.get("retry-after"),
    body: await readJsonOrNothing(response),
  });
}

function formRequestPlan({ flow, body }: AccountRequest): PlannedRequest {
  return { method: "POST", path: ACCOUNT_ENDPOINTS[flow], body };
}

function signedInRequestPlan(request: SignedInRequest): PlannedRequest {
  switch (request.flow) {
    case "kitchens":
      return { method: "GET", path: kitchensPathOf(request.cursor) };
    case "kitchen-action":
      return kitchenActionPlan(request.id, request.action);
    case "profile":
      return { method: "PATCH", path: PROFILE_ENDPOINT, body: request.body };
    case "password":
      return { method: "POST", path: PASSWORD_ENDPOINT, body: request.body };
    case "email-change":
      return {
        method: "POST",
        path: EMAIL_CHANGE_ENDPOINT,
        body: request.body,
      };
    case "confirm-email":
      return {
        method: "POST",
        path: CONFIRM_EMAIL_ENDPOINT,
        body: request.body,
      };
    case "revert-email":
      return {
        method: "POST",
        path: REVERT_EMAIL_ENDPOINT,
        body: request.body,
      };
    case "export":
      return { method: "POST", path: EXPORT_ENDPOINT };
    case "claim":
      return {
        method: request.intent === "count" ? "GET" : "POST",
        path: CLAIM_ENDPOINT,
      };
    case "logout":
      return { method: "POST", path: LOGOUT_ENDPOINT, body: request.body };
    case "staff-note":
      return {
        method: "POST",
        path: staffKitchenPathOf(request.id, "notes"),
        body: { text: request.text },
      };
    case "staff-status":
      return {
        method: "PUT",
        path: staffKitchenPathOf(request.id, "status"),
        body: { status: request.status, from: request.from },
      };
    case "staff-unhide":
      return {
        method: "POST",
        path: staffKitchenPathOf(request.id, "unhide"),
      };
  }
}

function staffKitchenPathOf(
  id: string,
  member: "notes" | "status" | "unhide",
): string {
  return `${STAFF_KITCHENS_ENDPOINT}/${encodeURIComponent(id)}/${member}`;
}

function kitchensPathOf(cursor: string | undefined): string {
  return cursor === undefined
    ? KITCHENS_ENDPOINT
    : `${KITCHENS_ENDPOINT}?cursor=${encodeURIComponent(cursor)}`;
}

function kitchenActionPlan(id: string, action: KitchenAction): PlannedRequest {
  const path = `${KITCHENS_ENDPOINT}/${encodeURIComponent(id)}`;
  switch (action.kind) {
    case "rename":
      return { method: "PATCH", path, body: { name: action.name } };
    case "duplicate":
      return {
        method: "POST",
        path: `${path}/duplicate`,
        body: { name: action.name },
      };
    case "delete":
      return { method: "DELETE", path };
    case "hide":
      return { method: "POST", path: `${path}/hide` };
  }
}

async function answerTo(
  planned: PlannedRequest,
  fetchAccount: FetchAccount,
): Promise<AccountAnswer | undefined> {
  try {
    const response = await fetchAccount(planned.path, initOf(planned));
    return {
      status: response.status,
      retryAfter: response.headers.get("retry-after"),
      body: await readJsonOrNothing(response),
    };
  } catch {
    return undefined;
  }
}

function initOf({ method, body }: PlannedRequest): RequestInit {
  if (method === "GET") {
    return { method, referrerPolicy: NO_REFERRER_POLICY };
  }
  return {
    method,
    headers: { "content-type": JSON_MEDIA_TYPE },
    body: JSON.stringify(body ?? EMPTY_JSON_BODY),
    referrerPolicy: SAME_ORIGIN_REFERRER_POLICY,
  };
}

async function readJsonOrNothing(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}
