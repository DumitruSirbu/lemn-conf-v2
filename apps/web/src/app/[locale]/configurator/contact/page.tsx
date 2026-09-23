import { getTranslations } from "next-intl/server";

import { resolveContent } from "@/i18n/content";
import { Link } from "@/i18n/navigation";

/**
 * Placeholder destination for the two continuation paths on the WebGL-unavailable exit. The real
 * contact step is a later milestone; this exists so those paths lead somewhere honest instead of
 * a 404.
 */
export default async function ContactPage() {
  const translate = await getTranslations();
  const content = resolveContent(translate);
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
        {content.contactPlaceholder.title}
      </h1>
      <p
        style={{
          margin: 0,
          font: "400 13.5px/1.6 var(--font-ui)",
          color: "var(--ink-muted)",
        }}
      >
        {content.contactPlaceholder.body}
      </p>
      <Link
        href="/"
        style={{ font: "700 14px/1 var(--font-ui)", color: "var(--accent)" }}
      >
        {content.contactPlaceholder.back}
      </Link>
    </main>
  );
}
