/** The budget for a test that forgets ledger rows, or drops the ledger, and then re-applies migrations. Its work grows
 *  with every migration added, unlike the package's 30 s `testTimeout`, which is sized for a handful of round trips.
 *  At 29 migrations the WEB-003 backfill took 16.8 s locally and over 30 s from a CI runner (runs 43196066536,
 *  43217351639), and the write-token re-application timed out in run 43222906519. A timed-out test is not stopped:
 *  its `finally` repair keeps running beside the next test, so a short budget turns one slow test into a cascade.
 *  A genuine hang still fails. */
export const REAPPLY_MIGRATIONS_TEST_TIMEOUT_MS = 120_000;
