import {
  judgePassword,
  validateRegistration,
  type AccountIssue,
} from "@lemnaria/configurator-domain";

import type { AccountFieldIssue } from "@/i18n/content";
import { routing, type AppLocale } from "@/i18n/routing";

import { currentPrivacyNoticeVersion } from "./privacy-notice-version";

// What the register form checks before it sends. The rules are the domain's own, called as they are, so the form can
// refuse nothing the server would accept and accept nothing it would refuse on the same ground. The server stays the
// authority: the breach check, for one, exists only there.

/** What the person typed. Nothing here is trimmed or changed. */
export interface RegisterFields {
  readonly email: string;
  readonly password: string;
  readonly phone: string;
}

/** The values the request carries when every field passed. `phone` is left out when the person left it empty. */
export interface AcceptedRegistration {
  readonly email: string;
  readonly phone: string | undefined;
}

export type RegistrationJudgement =
  | { readonly kind: "accepted"; readonly registration: AcceptedRegistration }
  | { readonly kind: "refused"; readonly issues: readonly AccountFieldIssue[] };

export function judgeRegistration(
  fields: RegisterFields,
  locale: AppLocale,
): RegistrationJudgement {
  const registration = validateRegistration(
    {
      email: fields.email,
      phone: fields.phone,
      locale,
      privacyNoticeVersion: currentPrivacyNoticeVersion(),
    },
    routing.locales,
  );
  const issues = [
    ...(registration.ok ? [] : placeableIssuesOf(registration.issues)),
    ...passwordIssuesOf(fields),
  ];
  if (issues.length > 0 || !registration.ok) return { kind: "refused", issues };
  return {
    kind: "accepted",
    registration: {
      email: registration.registration.email,
      phone: registration.registration.phone?.entered,
    },
  };
}

/** `locale` and the notice version are the page's own values, so a refusal of either is not a field to correct. */
function placeableIssuesOf(
  issues: readonly AccountIssue[],
): readonly AccountFieldIssue[] {
  return issues.flatMap(({ field, code }) =>
    field === "email" || field === "phone" ? [{ field, code }] : [],
  );
}

function passwordIssuesOf(
  fields: RegisterFields,
): readonly AccountFieldIssue[] {
  if (fields.password === "") {
    return [{ field: "password", code: "PASSWORD_REQUIRED" }];
  }
  const judgement = judgePassword({
    password: fields.password,
    email: fields.email,
  });
  return judgement.ok ? [] : [{ field: "password", code: judgement.code }];
}
