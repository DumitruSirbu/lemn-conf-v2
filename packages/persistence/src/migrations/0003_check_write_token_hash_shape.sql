-- ADR 0019 decision 1, stated where the data lives. `requireSha256Digest` in the repository is the
-- only thing that currently keeps a degenerate value out of this column, and application code is
-- not on the path a manual insert or a restore takes. A value that is not a digest — `''` above
-- all, since `'' = ''` is true in SQL — makes the authorisation predicate satisfiable by a
-- guessable value, which is the one property the column exists to deny.
--
-- NULL is still accepted: rows minted before 0002 carry it and fail closed, which is correct.
--
-- Wrapped in a DO block rather than written as a bare `add constraint`, because Postgres has no
-- `add constraint if not exists` and this runner re-runs every file on every invocation. The
-- alternative — `drop constraint if exists` followed by `add` — would leave the table briefly
-- unconstrained on each run, which is a strange thing to do to a security control.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'write_token_hash_is_sha256'
      and conrelid = 'designs'::regclass
  ) then
    alter table designs add constraint write_token_hash_is_sha256
      check (write_token_hash is null or write_token_hash ~ '^[0-9a-f]{64}$');
  end if;
end $$;
