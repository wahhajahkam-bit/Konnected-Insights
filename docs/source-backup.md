# GitHub source backups

Destination: https://github.com/ahkamkhalid-png/K-nnected-Insights  
Backup branch: **`source-backup`** (private repository). On 2026-09-22, with
separate user approval, GitHub `main` was replaced with the clean backup history.
See `docs/older-github-history-review.md` for the findings and verification.

## Important boundaries

Articles, editorial records, staff access and uploaded media need separate
recovery arrangements; see the [data and media recovery plan](data-recovery.md).
That plan requires explicit export/storage approval and an isolated restore drill.

GitHub currently refuses private-repository branch protections because of a
plan restriction; neither branch is server-protected. See the workspace-only
report `docs/github-history-safeguards.md` (not exported) for the verified limitation,
old-clone precautions, and settings proposed for separate approval after an
eligible plan is available. Local backup checks do not protect other clones.

This is a **manual source backup**, not automatic synchronization or a database,
editorial upload, deployment, or secret backup. Replit's internal `main` history
contains agent records and uploaded prompts. **Never push it to GitHub**, even
after adding ignore rules. Never use `git push --all`, `--mirror`, or force-push.

The first backup commit has no parents. Later backups have only the previous
verified clean backup as parent. Replit task branches and historical commits
are never uploaded. Routine backups do not modify GitHub `main`. The separately
approved cleanup removed the old lineage from branch history, not necessarily
from GitHub caches or existing clones. It does not authorize future force-pushes.

## Repeat a backup from the main Replit workspace

1. Finish and merge work into `main`; commit tracked changes. Do not run from
   an unfinished task branch. Untracked files are not backed up.
2. Run:

   ```sh
   node scripts/source-backup.mjs --prepare
   ```

3. Review `.local/source-backup/manifest.json`, especially new/changed source
   and assets. The policy has a limited credential-pattern check, **not a
   guarantee against all secrets or private data**. Review new content before
   each upload. It reads only committed main, never environment variable values.
4. Copy the reported digest and run:

   ```sh
   node scripts/source-backup.mjs --publish <reviewed-digest>
   ```

   This writes through the authorized Replit GitHub connector, without handling
   tokens or requiring a personal access token in chat. It requires the repository
   to remain private and the connection to have write permission.
5. Check the printed verified branch/commit and `.local/source-backup/receipt.json`.
   The command checks every uploaded file's Git blob hash and mode and confirms
   GitHub `main` is unchanged.

The main workspace has a `github-source` remote with the intended repository URL.
The post-merge setup script also installs this local remote configuration in the
main workspace after a task merge; it **does not upload or synchronize anything**.
The committed `docs/source-backup-receipt.json` bootstraps the last verified
backup commit when local configuration is absent. It is an internal verification
record, intentionally excluded from the source export. Existing local state is
never overwritten by setup.
Native HTTPS Git authentication is separate from the connector and was not
available during setup. The remote's direct push URL is deliberately disabled:
use the command above, not ordinary `git push` or Git-pane synchronization.
The command records its last verified backup in local Git configuration and
refuses unexpected remote changes. It does not configure `main` as an upstream.
Read-only `git fetch` needs your own GitHub Git authentication.

If upload fails before branch creation/update, only unreachable blobs/commits
may exist; no partial branch is published. If failure occurs after the ref write,
inspect `.local/source-backup/pending-verification.json` and the remote branch.
Do not delete the branch or clear its local tracking setting to bypass a conflict.
After moving to a new workspace, verify the existing backup branch and its history
before adopting its head as `sourceBackup.lastCommit`.

## Included and excluded

Included: application/backend/library source, tests and synthetic test fixtures,
package manifests, lockfile, schema migrations (not data dumps), required public
assets, published seed/fallback content, operational source documentation,
and selected workspace/build configuration. A generated backup README replaces
any workspace README. After the separately approved cleanup, GitHub `main`
also uses the clean snapshot README.

Excluded: `.agents`, `.local`, attached uploads and prompts, screenshots,
reference material, verification/evidence reports, dependencies, build output,
runtime uploads/backups, secret files, database dumps, and unsupported file types.
The export strips **all `[userenv...]` tables** from `.replit`, without changing
the live workspace's settings. Real database/editorial contents are not read.
Public assets under application `public` directories remain included because
the site needs them; raw attachment copies are not runtime dependencies.

The export allowlist lives in `scripts/source-backup-policy.mjs`. New root-level
files or document types need explicit review there. Ignore rules alone neither
remove already tracked files nor clean historical commits.

## Restore source

With GitHub access configured on the restoring machine:

```sh
git clone --single-branch --branch source-backup \
  https://github.com/ahkamkhalid-png/K-nnected-Insights.git
cd K-nnected-Insights
pnpm install --frozen-lockfile
```

Use Node 24 and pnpm. Workspace native package overrides target Linux x64.
Configure application secrets, database connection, authentication, integrations,
and editorial owner/access settings separately through secure configuration.
Restore database/editorial media separately if required. Do not infer that cloning
source restores user accounts, articles, uploads, runtime state, or a deployment.
See `replit.md` and package scripts for build/run commands.
