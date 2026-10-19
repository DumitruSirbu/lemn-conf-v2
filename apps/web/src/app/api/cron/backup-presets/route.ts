import { NextResponse, type NextRequest } from "next/server";

import type { BackupStatus } from "@/lib/server/backup-presets";
import { runPresetsBackup } from "@/lib/server/backup-presets";
import { isAuthorizedCronRequest } from "@/lib/server/cron-auth";

// Talks to Postgres and Blob with Node's `crypto`; must not run on the Edge runtime.
export const runtime = "nodejs";
// Reads `request.headers` on every call and must never serve a cached/stale response.
export const dynamic = "force-dynamic";

/** The same answers as `backup-designs`: a backup that did not happen must not look like one that did. A failed export
 *  is `503`; a failed rotation is `200` (the snapshot was written) and shows in the body's `status`. */
const HTTP_STATUS_BY_BACKUP_STATUS: Record<BackupStatus, number> = {
  ok: 200,
  "rotation-failed": 200,
  "export-failed": 503,
};

/** Daily `presets`-table backup to Vercel Blob under `backups/presets/`, triggered by the cron declared in
 *  `vercel.json`. The body carries a stable error code, never an exception message. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!isAuthorizedCronRequest(request.headers)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runPresetsBackup();
  return NextResponse.json(result, {
    status: HTTP_STATUS_BY_BACKUP_STATUS[result.status],
  });
}
