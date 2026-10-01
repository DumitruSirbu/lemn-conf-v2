# RTK — Rust Token Killer

Use RTK as the token-optimized proxy for supported shell commands in this repository.

## Rule

Prefix supported development commands with `rtk`, including Git, package-manager, build, test,
lint, formatter, search, and file-inspection commands.

```bash
rtk git status
rtk rg "pattern" src
rtk pnpm test
rtk npm run build
rtk pytest -q
```

If RTK does not support a required command, its filtering hides needed diagnostic detail, or the
proxied command fails unexpectedly, run the command directly and explain why when relevant.

**Exit codes are trustworthy; filtered output text is not.** Whenever the *absence* of content is the
signal — a diff that reports "identical", a lint or format probe that reports clean, a grep that
returns nothing — use `rtk proxy <command>`. Filtered output has falsely reported all four.
Instances and the parsing trap: `docs/best-practices/ci-and-local-gates.md`, *The `rtk` proxy*.

**A present value can be wrong too, so the test is what you will do with the output, not whether you
expect it to be empty:** any command whose output you are about to assert, cite or act on runs as
`rtk proxy`. See `docs/WORKFLOW.md`, **R9**.

## Diagnostics

```bash
rtk --version
rtk gain --project
rtk gain --history
rtk proxy <command>
```

Do not use compressed output when exact full output is part of the requested artifact or evidence.
