import { NextResponse, type NextRequest } from "next/server";

import type { BackupStatus } from "@/lib/server/backup-designs";
import { runDesignsBackup } from "@/lib/server/backup-designs";
import { isAuthorizedCronRequest } from "@/lib/server/cron-auth";

// Talks to Postgres and Blob with Node's `crypto`; must not run on the Edge runtime.
export const runtime = "nodejs";
// Reads `request.headers` on every call and must never serve a cached/stale response.
export const dynamic = "force-dynamic";

/**
 * A backup that did not happen must not look like one that did.
 *
 * Answering 200 for every authorized call meant status-only monitoring could not tell a snapshot
 * from no snapshot, and nothing could retry or alert on it (finding DB-003). A failed export is
 * `503`: the recovery point does not exist, and that is a service failure. A failed rotation is
 * `200` — the snapshot was written — and is distinguished by the body's `status` field, because
 * expired backups lingering is a warning, not a lost recovery point.
 */
const HTTP_STATUS_BY_BACKUP_STATUS: Record<BackupStatus, number> = {
  ok: 200,
  "rotation-failed": 200,
  "export-failed": 503,
};

/** Daily `designs`-table backup to Vercel Blob, triggered by the cron declared in `vercel.json`.
 *  The body carries a stable error code, never an exception message: driver and storage errors
 *  carry endpoint and credential-adjacent detail that must not cross this boundary. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!isAuthorizedCronRequest(request.headers)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runDesignsBackup();
  return NextResponse.json(result, {
    status: HTTP_STATUS_BY_BACKUP_STATUS[result.status],
  });
}
