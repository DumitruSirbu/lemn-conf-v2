/**
 * The two statements `NeonSentKitchenViewRepository` sends, in the form the mocked driver records them: whitespace
 * collapsed, each interpolated value as `?`. The driver test holds the repository to these texts exactly, and the
 * privilege test numbers their placeholders and asks the server to plan them, so the statements the role is shown able
 * to run are the ones the repository sends and not a copy that could drift.
 */
export const RECORD_VIEW_STATEMENT_TEXT =
  "with inserted as ( insert into contact_submission_views (token_hash, client_request_id, schema_version, " +
  "design_document) values (?, ?, ?, ?::jsonb) on conflict (token_hash) do nothing returning token_hash ) " +
  "select ( exists (select 1 from inserted) or exists ( select 1 from contact_submission_views " +
  "where token_hash = ? and client_request_id = ? ) ) as is_recorded";

export const LOAD_VIEW_STATEMENT_TEXT =
  "select schema_version, design_document from contact_submission_views " +
  "where token_hash = ? and revoked_at is null";
