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

## Diagnostics

```bash
rtk --version
rtk gain --project
rtk gain --history
rtk proxy <command>
```

Do not use compressed output when exact full output is part of the requested artifact or evidence.
