import { useContent } from "@/i18n/use-content";
import { Link } from "@/i18n/navigation";

import styles from "./webgl-unavailable.module.css";

/**
 * Frames 2F / D2F. There is no non-3D configuration, so this is an exit rather than a degraded
 * mode: it explains that configuration happens in the model, offers two named ways to continue,
 * shows no price, and renders no stand-in preview of a configuration that was never made.
 */
export function WebGLUnavailable({ titleMobile }: { titleMobile?: string }) {
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
              {titleMobile ?? content.webglUnavailable.titleMobile}
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
            <Link
              className={styles.path}
              href={{
                pathname: "/configurator/contact",
                query: { intent: "link" },
              }}
            >
              {content.webglUnavailable.emailLink}
              <span className={styles.arrow} aria-hidden="true">
                →
              </span>
            </Link>
            <Link
              className={styles.path}
              href={{
                pathname: "/configurator/contact",
                query: { intent: "callback" },
              }}
            >
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
