import Link from "next/link";

import { ro } from "@/content/ro";

/**
 * Placeholder destination for the two continuation paths on the WebGL-unavailable exit. The real
 * contact step is a later milestone; this exists so those paths lead somewhere honest instead of
 * a 404.
 */
export default function ContactPage() {
  return (
    <main
      style={{
        padding: "26px 18px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <h1 style={{ margin: 0, font: "700 22px/1.25 var(--font-ui)" }}>
        {ro.contactPlaceholder.title}
      </h1>
      <p
        style={{
          margin: 0,
          font: "400 13.5px/1.6 var(--font-ui)",
          color: "var(--ink-muted)",
        }}
      >
        {ro.contactPlaceholder.body}
      </p>
      <Link
        href="/configurator/configure"
        style={{ font: "700 14px/1 var(--font-ui)", color: "var(--accent)" }}
      >
        {ro.contactPlaceholder.back}
      </Link>
    </main>
  );
}
