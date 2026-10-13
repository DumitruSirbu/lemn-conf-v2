-- M8 wave 8Q2. Where a browser's report of a blocked resource is kept: a ring of at most 10000 rows in
-- `csp_reports`, and a one-row `csp_report_cursor` that numbers the reports. ADR 0162 decisions 1 to 4; the
-- reduction itself is ADR 0161 decision 3 and is not widened here.
--
-- A row is the reduced record (directive, blocked, source, line, column, page, locale, origin, disposition,
-- status) plus three facts of the server's own: the slot, the report number and the time it was received, and the
-- writer mark. Nothing in it comes from `document-uri`, `referrer`, `script-sample`, `original-policy`, an
-- address, a bucket key, a user agent, a cookie, an id, a token, a query or a fragment. Every field is still what
-- a browser, or anyone, claimed: `origin = 'own'` means the report says so, not that it is so (ADR 0161
-- Amendment B).
--
-- **The ring.** `slot` is the key and is checked `0 <= slot < 10000`, so the table cannot hold more rows than that
-- whatever the traffic, the host or the scheduler. One statement of the application advances the cursor and
-- upserts the report into slot `report number mod 10000`, overwriting every column, so the oldest report is the
-- one replaced. The database never deletes a row. There is no sequence and no identity column: the unattended
-- screen refuses `create sequence`, and the seeded cursor below uses only shapes it recognises.
--
-- **The checks are shapes, not lists.** Lengths, integer ranges, the stable enumerations (`origin`, `disposition`),
-- the shape of `locale`, regular expressions that refuse a path, a query, a fragment, user-info, white space or a
-- control character or a backslash in the host of `blocked` and `source`, and any character an id or a token is made
-- of in `page`, with each page segment at most 20 characters. No check lists the page families or the directives:
-- those lists belong to the code and grow with it, and a list in this file would need a migration to grow. Two
-- table checks repeat ADR 0161's F2 and F3: `source` is null and `page` is `other` unless `origin` is `own`. A
-- third ties the slot to the report number, so a row cannot sit anywhere but where the ring puts it. No expression
-- contains a backslash (the unattended screen refuses one inside a quoted string), so a literal dot is written
-- `[.]` and the backslash is named, as `[.backslash.]`, inside a bracket expression.
--
-- `writer_mark` is a lowercase hex SHA-256 made by the application under a secret this database never holds, the
-- shape of `0003`'s and `0007`'s digests. It is one constant per environment and exists so that a test can remove
-- the rows it added and no others (ADR 0151).
--
-- **APPLY THIS BEFORE THE CODE THAT STORES WITH IT SHIPS, AND BEFORE THE GRANT.** The grant is a separate step by
-- the owner, as for `0006`, `0007` and `0008`: `grant` is not a shape the unattended screen recognises, and
-- whether `app_designs` exists on every database this file runs against is not something this file can assume.
-- This file carries none. The application role needs `SELECT`, `INSERT` and `UPDATE` on `csp_reports` and
-- `SELECT` and `UPDATE` on `csp_report_cursor`, and nothing else: no `DELETE`, no `TRUNCATE`, no grant option, and
-- nothing to `PUBLIC`. Until the table and the grant exist the application behaves as it did before this file.
--
-- Check the target database's ledger reads 1-8 before running, and 1-9 after (ADR 0020: verify by reading the
-- schema, never by this command's exit status).
--
-- **Once this file has been applied anywhere, its bytes are frozen, comments included.** The ledger records a
-- checksum over the whole file, so editing even a line of this header makes every later run refuse with
-- `MigrationChecksumMismatchError` against every database that already ran it. The fix is a new migration, never
-- an edit to this file and never relabelling the ledger.
create table if not exists csp_report_cursor (
  singleton boolean primary key default true
    constraint csp_report_cursor_is_one_row check (singleton),
  last_number bigint not null
    constraint csp_report_cursor_last_number_is_not_negative check (last_number >= 0)
);
insert into csp_report_cursor (singleton, last_number) values (true, 0) on conflict do nothing;
create table if not exists csp_reports (
  slot integer primary key
    constraint csp_reports_slot_is_within_capacity check (slot >= 0 and slot < 10000),
  report_number bigint not null
    constraint csp_reports_report_number_is_positive check (report_number > 0),
  received_at timestamptz not null,
  writer_mark text not null
    constraint csp_reports_writer_mark_is_sha256 check (writer_mark ~ '^[0-9a-f]{64}$'),
  directive text not null
    constraint csp_reports_directive_shape check (directive ~ '^[a-z-]{1,32}$'),
  blocked text not null
    constraint csp_reports_blocked_shape check (
      char_length(blocked) <= 255
      and blocked ~ '^(self|inline|eval|wasm-eval|other|data|blob|chrome-extension|moz-extension|safari-web-extension|https?://[^/?#@[:space:][:cntrl:][.backslash.]]+)$'
    ),
  source text
    constraint csp_reports_source_shape check (
      char_length(source) <= 255
      and source ~ '^(self|inline|eval|wasm-eval|other|data|blob|chrome-extension|moz-extension|safari-web-extension|https?://[^/?#@[:space:][:cntrl:][.backslash.]]+|/_next/static(/[A-Za-z0-9._~-]+)+[.]js)$'
    ),
  line_number integer
    constraint csp_reports_line_number_range check (line_number between 0 and 10000000),
  column_number integer
    constraint csp_reports_column_number_range check (column_number between 0 and 10000000),
  page text not null
    constraint csp_reports_page_shape check (
      char_length(page) <= 64 and page ~ '^(other|/[[]locale[]](/[]a-z[-]{1,20})*)$'
    ),
  locale text not null
    constraint csp_reports_locale_shape check (locale ~ '^([a-z]{2}|none)$'),
  origin text not null
    constraint csp_reports_origin_is_known check (origin in ('own', 'foreign', 'none')),
  disposition text not null
    constraint csp_reports_disposition_is_known check (disposition in ('enforce', 'report', 'other')),
  status_code integer
    constraint csp_reports_status_code_range check (status_code between 100 and 599),
  constraint csp_reports_slot_follows_report_number check (slot = report_number % 10000),
  constraint csp_reports_source_only_for_own check (source is null or origin = 'own'),
  constraint csp_reports_page_only_for_own check (page = 'other' or origin = 'own')
);
