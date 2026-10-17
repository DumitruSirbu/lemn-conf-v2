-- M8B wave L1. ADR 0169 decisions 1, 2, 7 and 10: a client account is an e-mail and a password, and the
-- table that holds it is the one place the application can be made to create or promote staff, so it is
-- built so that the application role cannot.
--
-- Why each column and check exists:
--
-- `id` is generated in code, as a design id is (`generate-design-id.ts`), and checked to the same
-- 21-character URL-safe shape so a stray value cannot become a key.
--
-- `email` is the address as typed and trimmed; `email_normal_form` is the domain's `countedFormOfAddress`
-- (lower case, nothing stripped) and carries the unique constraint, so two spellings of one address cannot
-- both register. Both are 3 to 254 characters, 254 being `CONTACT_EMAIL_MAX_LENGTH`. There is deliberately
-- no `email_normal_form = lower(email)` check: Postgres `lower()` and JavaScript `toLowerCase()` agree only
-- on what both treat alike, so the code is the one authority on the normal form and the database does not
-- second-guess it.
--
-- `email_verified_at` is null until the link in the confirmation mail is used.
--
-- `password_hash` is a PHC string for argon2id, with its parameters inside it, so raising them needs no
-- migration. The check is the string's shape and nothing about a password: a plaintext, an empty string or
-- a hash from another scheme is refused by the database as well as by the code. Written with `[$]` and not
-- a backslash, because the unattended screen refuses a backslash inside a quoted string.
--
-- `password_changed_at` is shown in the password-changed mail, and later sessions compare against it.
--
-- `role` is one of the owner's three names. It is the one list this migration enumerates; locale and token
-- purpose are shape checks so that a later wave adding a locale or a purpose drops nothing. **The
-- application role may read `role` (every request reads it) but is granted no INSERT or UPDATE on it** (the
-- grant below), so every account the application creates is a client and no bug or injection can promote
-- anyone.
--
-- `locale` is the language of the account's mail, a two-letter shape and not a list.
--
-- `phone` and `phone_normal_form` are optional, unverified, and set together or not at all; at most 32
-- characters, `CONTACT_PHONE_MAX_LENGTH`. `normalisePhoneNumber` makes the normal form.
--
-- `privacy_notice_version` names the notice that was shown at registration.
--
-- Not added, by ADR 0118 (no reader yet): name, address, disabled or invited-by marks, erasure marks. Each
-- is an additive column for the wave that reads it.
--
-- **APPLY THIS BEFORE THE CODE THAT READS IT SHIPS, AND BEFORE THE GRANT.** Registration, login and every
-- session read name this table and answer 500 against a database without it. The grant is a second,
-- separate step this migration does not perform: `grant` is not a shape the unattended screen recognises,
-- and whether `app_designs` exists on every database this file runs against is not something it can assume.
-- The grant, for the owner, is column-scoped: the application has no INSERT or UPDATE on `role` or
-- `created_at`, and may insert `id`, `email` and `email_normal_form` but never update them (no DELETE, no
-- TRUNCATE, no ALL, no WITH GRANT OPTION, nothing to PUBLIC):
--
--   GRANT SELECT ON TABLE public.accounts TO app_designs;
--   GRANT INSERT (id, email, email_normal_form, password_hash, locale, phone, phone_normal_form,
--     privacy_notice_version) ON TABLE public.accounts TO app_designs;
--   GRANT UPDATE (email_verified_at, password_hash, password_changed_at, updated_at, locale, phone,
--     phone_normal_form, privacy_notice_version) ON TABLE public.accounts TO app_designs;
--
-- The runbook (`applying-a-table-migration-and-its-application-role-grant.md`) carries the steps and
-- the checks that follow.
--
-- Check the target database's ledger reads 1-11 before running, and 1-12 after (ADR 0020: verify by
-- reading the schema, never by this command's exit status). Version 11 is wave M8C's
-- `0011_create_presets.sql`: this file is numbered after it and the runner refuses a gap.
--
-- **Once this file has been applied anywhere, its bytes are frozen, comments included.** The ledger records
-- a checksum over the whole file, so editing even a line of this header makes every later run refuse with
-- `MigrationChecksumMismatchError` against every database that already ran it. The fix is a new migration,
-- never an edit to this file and never relabelling the ledger.
create table if not exists accounts (
  id text primary key
    constraint accounts_id_shape check (id ~ '^[A-Za-z0-9_-]{21}$'),
  email text not null
    constraint accounts_email_length check (char_length(email) between 3 and 254),
  email_normal_form text not null
    constraint accounts_email_normal_form_is_unique unique
    constraint accounts_email_normal_form_length check (char_length(email_normal_form) between 3 and 254),
  email_verified_at timestamptz,
  password_hash text not null
    constraint accounts_password_hash_is_argon2id check (
      password_hash ~ '^[$]argon2id[$]v=19[$]m=[0-9]+,t=[0-9]+,p=[0-9]+[$][A-Za-z0-9+/]{16,}[$][A-Za-z0-9+/]{16,}$'
    ),
  password_changed_at timestamptz not null default now(),
  role text not null default 'client'
    constraint accounts_role_is_known check (role in ('client', 'operator', 'administrator')),
  locale text not null
    constraint accounts_locale_shape check (locale ~ '^[a-z]{2}$'),
  phone text,
  phone_normal_form text,
  privacy_notice_version text not null
    constraint accounts_privacy_notice_version_shape check (privacy_notice_version ~ '^[a-z0-9.-]{1,32}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint accounts_phone_is_set_with_its_normal_form check ((phone is null) = (phone_normal_form is null)),
  constraint accounts_phone_length check (
    char_length(phone) <= 32 and char_length(phone_normal_form) <= 32
  )
);
