import Link from "next/link";

import { ro } from "@/content/ro";

import styles from "./webgl-unavailable.module.css";

/**
 * Frames 2F / D2F. There is no non-3D configuration, so this is an exit rather than a degraded
 * mode: it explains that configuration happens in the model, offers two named ways to continue,
 * shows no price, and renders no stand-in preview of a configuration that was never made.
 */
export function WebGLUnavailable() {
  const copy = ro.webglUnavailable;
  return (
    <main className={styles.screen} data-testid="webgl-unavailable">
      <header className={styles.header}>
        <span className={styles.brand}>{ro.brand}</span>
        <span className={styles.step}>{ro.configure.step}</span>
      </header>
      <div className={styles.body}>
        <div className={styles.panel}>
          <h1 className={styles.title}>
            <span className={styles.mobileOnly}>{copy.titleMobile}</span>
            <span className={styles.desktopOnly}>{copy.titleDesktop}</span>
          </h1>
          <p className={styles.text}>
            <span className={styles.mobileOnly}>{copy.bodyMobile}</span>
            <span className={styles.desktopOnly}>{copy.bodyDesktop}</span>
          </p>
          <div className={styles.paths}>
            <Link
              className={styles.path}
              href="/configurator/contact?intent=link"
            >
              {copy.emailLink}
              <span className={styles.arrow} aria-hidden="true">
                →
              </span>
            </Link>
            <Link
              className={styles.path}
              href="/configurator/contact?intent=callback"
            >
              {copy.contactLink}
              <span className={styles.arrow} aria-hidden="true">
                →
              </span>
            </Link>
          </div>
          <p className={styles.footnote}>{copy.noFakePreview}</p>
        </div>
      </div>
    </main>
  );
}
