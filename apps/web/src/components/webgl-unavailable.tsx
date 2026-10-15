import { useContent } from "@/i18n/use-content";
import { Link } from "@/i18n/navigation";

import styles from "./webgl-unavailable.module.css";

/**
 * Frames 2F / D2F. There is no non-3D configuration, so this is an exit rather than a degraded
 * mode: it explains that configuration happens in the model, offers the callback form as the way
 * to continue, shows no price, and renders no stand-in preview of a configuration that was never
 * made. The frame's second path, the link by e-mail, is not drawn until the mail provider is live
 * (Q12 (ii), 8L.12).
 */
export function WebGLUnavailable() {
  const content = useContent();
  return (
    <main className={styles.screen} data-testid="webgl-unavailable">
      <header className={styles.header}>
        <span className={styles.brand}>{content.brand}</span>
        <span className={styles.step}>{content.configure.step}</span>
      </header>
      <div className={styles.body}>
        <div className={styles.panel}>
          <h1 className={styles.title}>
            <span className={styles.mobileOnly}>
              {content.webglUnavailable.titleMobile}
            </span>
            <span className={styles.desktopOnly}>
              {content.webglUnavailable.titleDesktop}
            </span>
          </h1>
          <p className={styles.text}>
            <span className={styles.mobileOnly}>
              {content.webglUnavailable.bodyMobile}
            </span>
            <span className={styles.desktopOnly}>
              {content.webglUnavailable.bodyDesktop}
            </span>
          </p>
          <div className={styles.paths}>
            <Link className={styles.path} href="/configurator/contact">
              {content.webglUnavailable.contactLink}
              <span className={styles.arrow} aria-hidden="true">
                →
              </span>
            </Link>
          </div>
          <p className={styles.footnote}>
            {content.webglUnavailable.noFakePreview}
          </p>
        </div>
      </div>
    </main>
  );
}
