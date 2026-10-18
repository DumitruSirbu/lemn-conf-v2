import type { PrivacyNoticeCopy } from "@/i18n/content";
import type { AppLocale } from "@/i18n/routing";

import styles from "./account.module.css";

// The stand-in for the privacy notice that the register page links to. It states that the notice is not yet published
// and which version it holds the place of; it carries no legal text, because the draft is not publishable. A document
// of its own with plain anchors, like every account page. The launch gate that publishes the real notice replaces it.

export interface PrivacyNoticeStubProps {
  readonly locale: AppLocale;
  readonly copy: PrivacyNoticeCopy;
}

export function PrivacyNoticeStub({ locale, copy }: PrivacyNoticeStubProps) {
  return (
    <main className={styles.stubScreen}>
      <div className={styles.card}>
        <div className={styles.pane}>
          <p className={styles.badge}>{copy.badge}</p>
          <div className={styles.head}>
            <h1 className={styles.heading}>{copy.title}</h1>
            <p className={styles.lead}>{copy.placeholder}</p>
          </div>
        </div>
        <div className={styles.actions}>
          <a className={styles.secondary} href={`/${locale}`}>
            {copy.backToConfigurator}
          </a>
        </div>
      </div>
    </main>
  );
}
