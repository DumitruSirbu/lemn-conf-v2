-- ADR 0019 decision 1: split read from write. A design's write credential lives here as a SHA-256
-- hash and never as the token itself, so a database leak confers read access but no write access.
--
-- Nullable on purpose. Rows minted before this migration carry NULL, and `write_token_hash = $1`
-- is never true for NULL, so they fail closed: still readable by link, no longer writable.
alter table designs add column if not exists write_token_hash text;
