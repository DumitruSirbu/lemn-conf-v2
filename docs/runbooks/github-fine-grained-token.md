# Runbook — set up a GitHub fine-grained personal access token

Run this when `gh auth status` reports an invalid/expired token, or when provisioning `gh`/git
access on a new machine.

## 1. Create or renew the token

https://github.com/settings/tokens?type=beta

- Resource owner: your account
- Repository access: select `lemn-conf-v2` (or "All repositories" if broader access is needed)
- Permissions: Contents (read/write), Pull requests (read/write), Metadata (read, mandatory),
  Issues (read/write if needed)

## 2. Authenticate `gh` with the token

```bash
echo YOUR_TOKEN | gh auth login -h github.com --with-token
```

## 3. Verify

```bash
gh auth status
gh api repos/DumitruSirbu/lemn-conf-v2 --jq '.permissions'
```

Expected: `gh auth status` shows "Logged in", and the permissions object includes `push: true`.
