// The owner's preview of the shop's notice: renders each fixture through the builder the route uses and writes its
// HTML and text parts as files, sending nothing and reading no mail setting.
//
//   LEAD_NOTICE_PREVIEW_DIR=/some/folder pnpm --filter @lemnaria/web preview:lead-notice
//
// The folder travels by variable because Vitest reads a positional argument as a test-file filter. Unset, the files
// land in `testing-reports/lead-notice-preview/`, which git and Prettier both ignore; any other folder inside the
// repository is refused.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { composeLeadNotice } from "@/lib/server/mail/lead-notification";

import { LEAD_NOTICE_FIXTURES } from "../lib/server/mail/lead-notice-fixtures";
import { previewDirectoryFor } from "./preview-directory";

describe("the shop's notice, rendered for the owner", () => {
  const directory = previewDirectoryFor(process.env.LEAD_NOTICE_PREVIEW_DIR);
  mkdirSync(directory, { recursive: true });

  it.each(LEAD_NOTICE_FIXTURES)(
    "writes the $name notice's HTML and text parts",
    ({ name, input }) => {
      const message = composeLeadNotice(input);

      writeFileSync(join(directory, `${name}.html`), message.html ?? "");
      writeFileSync(
        join(directory, `${name}.txt`),
        `${message.subject}\n\n${message.text}\n`,
      );

      expect(message.html?.length ?? 0).toBeGreaterThan(0);
    },
  );
});
