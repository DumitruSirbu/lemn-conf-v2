-- M8 wave 8E. One row per bucket per fixed window: the hit counter behind the application's rate
-- limiter (ADR 0019 decision 3 and 5; Postgres rather than Redis, its Alternative 4).
--
-- `bucket_key` is the SHA-256 digest of the bucket's identity and nothing else: the table holds no raw
-- address and no e-mail. The check constraint is `0006`'s shape, so a degenerate key (`''`, a raw
-- address) is refused by the database and not only by the code that normally writes it.
--
-- The window is part of the primary key, so a new window is a new row. A count therefore comes from
-- the current window alone: an expired row the nightly prune has not reached yet (late, missing or
-- run twice) is never read by a later window's hit. `window_end` is stored beside `window_start`
-- because windows are not all the same length (a calendar day in Chisinau is 23, 24 or 25 hours);
-- a row is expired from `window_end` on, and the index serves the prune.
--
-- **APPLY THIS BEFORE THE CODE THAT COUNTS WITH IT SHIPS, AND BEFORE THE GRANT.** The grant on this
-- table (select, insert, update and delete, because the prune deletes) is a separate step by the
-- owner that this screen does not recognise, as for `0006`.
--
-- Once applied anywhere, this file's bytes are frozen, comments included: the ledger checksums the
-- whole file. A change is a new migration.
create table if not exists rate_limit_counters (
  bucket_key text not null
    constraint rate_limit_counters_bucket_key_is_sha256 check (bucket_key ~ '^[0-9a-f]{64}$'),
  window_start timestamptz not null,
  window_end timestamptz not null,
  hits integer not null
    constraint rate_limit_counters_hits_is_positive check (hits > 0),
  primary key (bucket_key, window_start),
  constraint rate_limit_counters_window_is_not_empty check (window_end > window_start)
);
create index if not exists rate_limit_counters_window_end
  on rate_limit_counters (window_end);
