import "server-only";

import { createTranslator } from "next-intl";

import { resolveContent, type Content } from "@/i18n/content";
import { routing } from "@/i18n/routing";
import roMessages from "@/messages/ro.json";
import { getContactSubmissionStore } from "@/lib/server/contact/contact-submission-store-instance";
import { makeContactJudge } from "@/lib/server/contact/judge-contact-request";
import type { SubmitContactPorts } from "@/lib/server/contact/submit-contact";
import { readDigester } from "@/lib/server/digest/digest-secret";
import { loadOwnedDesign } from "@/lib/server/load-owned-design";
import { createMailSender } from "@/lib/server/mail/create-mail-sender";
import { NOTICE_LOCALE } from "@/lib/server/mail/lead-notification";
import type { HeaderReader } from "@/lib/server/rate-limit/network-source";
import { shippedPriceBook } from "@/lib/server/shipped-price-book";

/**
 * The contact request's production ports, made for one request and held nowhere: the route calls this once, inside its
 * guard, and nothing here is kept at module level, so a request that cannot be given its ports leaves nothing for the
 * next to inherit. The book is the one book of the request: its version is what the digest covers and its prices are
 * what the snapshot is priced under.
 */
export function makeContactProductionPorts(
  headers: HeaderReader,
): SubmitContactPorts {
  return {
    store: getContactSubmissionStore(),
    createSender: () => createMailSender(process.env),
    book: shippedPriceBook(),
    digester: readDigester(process.env),
    noticeContent: noticeContent(),
    servedLocales: routing.locales,
    loadOwned: loadOwnedDesign,
    makeJudge: (instant) =>
      makeContactJudge({ environment: process.env, headers, instant }),
    now: () => new Date(),
  };
}

/** The shop's notice is written in its own language, whatever the customer's, never through the request's locale. */
function noticeContent(): Content {
  return resolveContent(
    createTranslator({ locale: NOTICE_LOCALE, messages: roMessages }),
  );
}
