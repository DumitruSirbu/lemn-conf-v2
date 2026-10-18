import {
  classifyAccountAnswer,
  UNANSWERED_OUTCOME,
  type AccountAnswer,
  type AccountFlow,
  type AccountOutcome,
} from "./account-answer";

// The one request an account form makes. It has no abort and no timer: the form's one-in-flight guard lasts until
// this settles, so it must last at least as long as the server may take, whatever that is.

/** Same-origin paths, so the browser states the origin the routes' cross-site guard reads. */
const ACCOUNT_ENDPOINTS: Readonly<Record<AccountFlow, string>> = {
  register: "/api/account/register",
  login: "/api/account/login",
  "forgot-password": "/api/account/password-reset/request",
  "verify-email": "/api/account/verify-email",
  "reset-password": "/api/account/password-reset/complete",
};

const JSON_MEDIA_TYPE = "application/json";

/** Under the token pages' `no-referrer` a POST's `Origin` could read `null`, which the cross-site guard refuses;
 *  this per-request policy keeps the real origin on a same-origin request. */
const SAME_ORIGIN_REFERRER_POLICY: ReferrerPolicy = "same-origin";

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
  const answer = await answerTo(request, fetchAccount);
  return answer === undefined
    ? UNANSWERED_OUTCOME
    : classifyAccountAnswer(request.flow, answer);
}

async function answerTo(
  { flow, body }: AccountRequest,
  fetchAccount: FetchAccount,
): Promise<AccountAnswer | undefined> {
  try {
    const response = await fetchAccount(ACCOUNT_ENDPOINTS[flow], {
      method: "POST",
      headers: { "content-type": JSON_MEDIA_TYPE },
      body: JSON.stringify(body),
      referrerPolicy: SAME_ORIGIN_REFERRER_POLICY,
    });
    return {
      status: response.status,
      retryAfter: response.headers.get("retry-after"),
      body: await readJsonOrNothing(response),
    };
  } catch {
    return undefined;
  }
}

async function readJsonOrNothing(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}
