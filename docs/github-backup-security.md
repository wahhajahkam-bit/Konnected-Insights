# GitHub backup security and coverage

Repository: `ahkamkhalid-png/K-nnected-Insights` (private).

## Repository settings verified on 2026-09-22

- Dependabot vulnerability alerts: enabled and verified.
- Dependabot automatic security-update pull requests: enabled, not paused.
  These propose fixes; they do not automatically merge or guarantee all
  vulnerabilities are fixed.
- GitHub rulesets and branch protection: **unavailable on the current plan**.
  GitHub returned HTTP 403 requiring an upgrade for this private repository.
  The repository was not made public and no paid feature was activated.
- At inspection, `main` and `source-backup` pointed at the previously verified
  clean source snapshot. This does not mean that GitHub has purged every cached
  old commit or that another client cannot reintroduce old history.

Until server-side protection is available, an authorized GitHub client can
still force-push or delete a branch. The backup tools refuse force-pushes,
unexpected source-branch heads and public repositories, but those checks are
not GitHub-enforced protection against other clients.

After upgrading, the owner can enable branch rules restricting deletion and
force-pushes for `main`, `source-backup` and (once created) `encrypted-backups`.
Keep permissions limited to trusted maintainers, require account two-factor
authentication and keep recovery codes outside GitHub. No account-level settings
have been changed on the owner's behalf.

## What is stored where

| Location | Coverage |
| --- | --- |
| `source-backup` branch | Reviewed application source, public assets, schema definitions, tests and these restore tools/instructions |
| `encrypted-backups` branch, once an export is made | Authenticated encrypted PostgreSQL archives, split into chunks, with checksums; no plaintext records or key |
| Owner's password manager | Encryption passphrase; **not** committed to either branch |

The runtime uploader creates an independent root commit for its first snapshot.
It never uses internal Replit ancestry as a parent and never writes `main` or
`source-backup`. New snapshots retain previous snapshot folders. There is **no
automatic retention/deletion** and no scheduled backup configured.

The first real encrypted snapshot is **pending secure passphrase and explicit
source connection setup**. Tools and a synthetic drill do not mean live data has
already been exported.

## Manual encrypted database backup

Prerequisites: Node.js, matching PostgreSQL `pg_dump`, installed project
dependencies, authorized GitHub connection, and a private destination.
Configure `RECOVERY_BACKUP_PASSPHRASE` and `RECOVERY_SOURCE_DATABASE_URL` through
the workspace's secure secrets form. Never paste values in chat or commands.
Use a long unique passphrase (at least 24 characters), and retain it outside both
Replit and GitHub. Confirm the source connection belongs to the intended
environment; the script deliberately does not default to the app's DATABASE_URL.

On a trusted machine, choose a private directory **outside the project**. Replace
the sample paths/alias below; the declared environment is not automatic proof of
which database is connected:

```sh
node scripts/recovery-backup.mjs \
  --approve-runtime-export \
  --source-label production-confirmed-alias \
  --output /absolute/private/backup.enc

node scripts/runtime-backup-github.mjs \
  --approve-upload /absolute/private/backup.enc production
```

The first command streams a consistent full-database `pg_dump` into authenticated
encryption. The second authenticates the encrypted archive before any upload,
checks repository privacy/write access, verifies uploaded chunk bytes, and
prints a receipt with the exact commit and snapshot folder. Retain that receipt.
The uploader has a 512 MiB archive limit; it fails rather than silently omitting
data. Larger datasets need a separately approved storage approach.

If an upload fails, some unreachable ciphertext blobs may have been written.
Inspect the branch before retrying: a connection can fail after the branch write.
Do not clear safeguards or force-push to work around a conflict.

Git stores historic encrypted versions. Deleting a current snapshot folder
does not remove it from history. Passphrase loss means permanent loss of access;
passphrase compromise affects every snapshot encrypted with that passphrase,
even after rotation. Plan retention/deletion and any history rewriting separately.

## Download and decrypt

See [backup-decryption.md](backup-decryption.md) for the encryption format,
passphrase entry and isolated PostgreSQL restore procedure.

Download the exact snapshot from the verified receipt using your authenticated
GitHub client. For example, clone the ciphertext branch into a private directory:

```sh
git clone --single-branch --branch encrypted-backups \
  https://github.com/ahkamkhalid-png/K-nnected-Insights.git \
  /absolute/private/encrypted-backups
```

From the source checkout with dependencies installed, reconstruct the selected
snapshot (replace `<snapshot-id>` with the receipt's folder):

```sh
node scripts/reassemble-backup.mjs \
  /absolute/private/encrypted-backups/snapshots/<snapshot-id> \
  /absolute/private/downloaded-backup.enc
```

Reassembly checks chunk order, sizes and SHA-256 checksums and refuses an
existing output file. It produces ciphertext, not a database. Then use the
decryption command in the linked guide; only the correct passphrase can
authenticate and recover the archive. Never restore directly into a live target
as a test.

## What “everything” cannot include automatically

- A full PostgreSQL archive includes article/draft JSON, PostgreSQL image bytes
  and metadata, staff authorization rows, research and operational records in
  that **one selected database**.
- It does not include a second environment's database. A development snapshot
  must never be described as a production snapshot.
- Legacy read-only Google Drive images are external. Their database references
  are not their bytes. Independent copies, ID mapping and a tested recovery
  remain necessary.
- Clerk accounts, provider configuration and connector grants are external.
  Staff rows do not recreate sign-in accounts or invitations.
- Secrets, credentials, private workspace prompts, agent history, caches and
  installed dependencies are intentionally excluded from source backups.
  Reconfigure secrets separately; reinstall dependencies from the lockfile.

See [data-recovery.md](data-recovery.md) for coverage, approvals and cutover safety.