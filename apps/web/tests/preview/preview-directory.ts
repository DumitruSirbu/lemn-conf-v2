import { isAbsolute, join, relative, resolve } from "node:path";

export const REPOSITORY_ROOT = resolve(import.meta.dirname, "../../../..");
/** Ignored by git and by Prettier, so a preview written here is never committed or formatted. */
export const IGNORED_REPORTS_DIR = join(REPOSITORY_ROOT, "testing-reports");
export const DEFAULT_PREVIEW_DIR = join(
  IGNORED_REPORTS_DIR,
  "lead-notice-preview",
);

export class PreviewDirectoryRefused extends Error {
  constructor() {
    super(
      "LEAD_NOTICE_PREVIEW_DIR names a folder inside the repository outside testing-reports/",
    );
    this.name = "PreviewDirectoryRefused";
  }
}

/** Where the preview writes: the named folder, or the ignored default; never a tracked folder of the repository. */
export function previewDirectoryFor(named: string | undefined): string {
  const directory =
    named === undefined || named === "" ? DEFAULT_PREVIEW_DIR : resolve(named);
  if (
    isInside(REPOSITORY_ROOT, directory) &&
    !isInside(IGNORED_REPORTS_DIR, directory)
  ) {
    throw new PreviewDirectoryRefused();
  }
  return directory;
}

function isInside(parent: string, child: string): boolean {
  const path = relative(parent, child);
  return path === "" || (!path.startsWith("..") && !isAbsolute(path));
}
