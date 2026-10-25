import "server-only";

import type {
  SentKitchenViewRepository,
  SentMarkStore,
} from "@lemnaria/persistence";
import { createTranslator, type IntlError } from "next-intl";

import { resolveContent, type Content } from "@/i18n/content";
import { routing } from "@/i18n/routing";
import roMessages from "@/messages/ro.json";
import { getContactSubmissionStore } from "@/lib/server/contact/contact-submission-store-instance";
import { makeContactJudge } from "@/lib/server/contact/judge-contact-request";
import { getSentMarkStore } from "@/lib/server/contact/sent-mark-store-instance";
import type { SubmitContactPorts } from "@/lib/server/contact/submit-contact";
import { readDigester } from "@/lib/server/digest/digest-secret";
import { loadOwnedDesign } from "@/lib/server/load-owned-design";
import { createMailSender } from "@/lib/server/mail/create-mail-sender";
import { NOTICE_LOCALE } from "@/lib/server/mail/lead-notification";
import { readPublicOrigin } from "@/lib/server/public-origin";
import type { HeaderReader } from "@/lib/server/rate-limit/network-source";
import { getSentKitchenViewRepository } from "@/lib/server/repository";
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
    sentMarks: sentMarksOnFirstUse(),
    createSender: () => createMailSender(process.env),
    book: shippedPriceBook(),
    digester: readDigester(process.env),
    noticeContent: noticeContent(),
    servedLocales: routing.locales,
    loadOwned: loadOwnedDesign,
    makeJudge: (instant) =>
      makeContactJudge({ environment: process.env, headers, instant }),
    now: () => new Date(),
    readPublicOrigin: () => readPublicOrigin(process.env),
    sentKitchenViews: sentKitchenViewsOnFirstUse(),
  };
}

/**
 * The frozen copies' instance, asked for only when a link is minted and inside the promise: a connection that cannot
 * be opened is then the record's rejection and a notice without the link, never a request refused before it is stored.
 */
function sentKitchenViewsOnFirstUse(): SentKitchenViewRepository {
  const instance = () => Promise.resolve().then(getSentKitchenViewRepository);
  return {
    record: (view) => instance().then((views) => views.record(view)),
    load: (tokenHash) => instance().then((views) => views.load(tokenHash)),
  };
}

/**
 * The sent mark's instance, asked for only when a design is marked and inside the promise: a connection that cannot be
 * opened is then the mark's rejection, which the caller writes as a line, and never a request refused before it is
 * stored.
 */
function sentMarksOnFirstUse(): SentMarkStore {
  return {
    markSent: (designId) =>
      Promise.resolve()
        .then(getSentMarkStore)
        .then((marks) => marks.markSent(designId)),
  };
}

/**
 * The shop's notice is written in its own language, whatever the customer's, never through the request's locale. The
 * translator's own handler writes a failed leaf to the console, outside the closed lists of lines, and answers the
 * leaf's path as text; this one throws instead, so a leaf that fails is the notice that cannot be built and the one
 * unavailable answer, and nothing is written of it.
 */
function noticeContent(): Content {
  return resolveContent(
    createTranslator({
      locale: NOTICE_LOCALE,
      messages: roMessages,
      onError: throwTheFailedLeaf,
    }),
  );
}

function throwTheFailedLeaf(failure: IntlError): never {
  throw failure;
}
