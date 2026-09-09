import { useContent } from "@/i18n/use-content";
import { Link } from "@/i18n/navigation";

import styles from "./webgl-unavailable.module.css";

/**
 * Frames 2F / D2F. There is no non-3D configuration, so this is an exit rather than a degraded
 * mode: it explains that configuration happens in the model, offers two named ways to continue,
 * shows no price, and renders no stand-in preview of a configuration that was never made.
 */
export function WebGLUnavailable({ titleMobile }: { titleMobile?: string }) {
  const ro = useContent();
  return (
    <main className={styles.screen} data-testid="webgl-unavailable">
      <header className={styles.header}>
        <span className={styles.brand}>{ro.brand}</span>
        <span className={styles.step}>{ro.configure.step}</span>
      </header>
      <div className={styles.body}>
        <div className={styles.panel}>
          <h1 className={styles.title}>
            <span className={styles.mobileOnly}>
              {titleMobile ?? ro.webglUnavailable.titleMobile}
            </span>
            <span className={styles.desktopOnly}>
              {ro.webglUnavailable.titleDesktop}
            </span>
          </h1>
          <p className={styles.text}>
            <span className={styles.mobileOnly}>
              {ro.webglUnavailable.bodyMobile}
            </span>
            <span className={styles.desktopOnly}>
              {ro.webglUnavailable.bodyDesktop}
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
              {ro.webglUnavailable.emailLink}
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
              {ro.webglUnavailable.contactLink}
              <span className={styles.arrow} aria-hidden="true">
                →
              </span>
            </Link>
          </div>
          <p className={styles.footnote}>{ro.webglUnavailable.noFakePreview}</p>
        </div>
      </div>
    </main>
  );
}
