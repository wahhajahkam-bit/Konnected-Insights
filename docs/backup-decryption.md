# Manual encrypted PostgreSQL recovery

These tools are manual, not a scheduled backup service. A synthetic isolated
restore passed; **no runtime database export or real-data restore has been
performed by this implementation**. The owner must configure
`RECOVERY_BACKUP_PASSPHRASE` securely before any real export. Do not put it in chat,
GitHub, source, command arguments or shell history. Keep a recoverable copy
outside both the app and GitHub. See [the recovery plan](data-recovery.md) and
[GitHub backup security](github-backup-security.md).

## Export gates

Confirm the exact source environment/provider, full-database scope, authorized
readers, retention and private destination with the owner. A label is a human
declaration, **not automatic verification of database identity**. Development is
not a production backup. Configure a dedicated `RECOVERY_SOURCE_DATABASE_URL`
through a secure environment/secret facility; there is deliberately no fallback
to `DATABASE_URL` or inherited `PG*` connection variables.

Use Node.js 22+ and PostgreSQL tools compatible with the source server (tested
with PostgreSQL 16.10). Run from a trusted, access-controlled machine. Create a
private directory **outside the project, public routes and Git checkout**, with
mode 0700, sufficient disk space, and approved encrypted storage. Example paths
below are operator-chosen locations, not existing directories:

```sh
umask 077
node scripts/recovery-backup.mjs \
  --source-label production-owner-confirmed \
  --approve-runtime-export \
  --output /private/recovery/snapshot.knrb
```

Both environment variables must already be set securely. Do not paste connection
strings on the command line. The passphrase minimum is 24 characters (maximum
4096); length is not an entropy guarantee. Prefer a password-manager generated
random secret of at least 32 bytes or a comparably strong multiword passphrase.

The exporter streams a full `pg_dump --format=custom` directly into encryption;
no plaintext dump is written. It refuses to publish on dump failure and never
overwrites an existing destination. Credentials are passed only in the child
environment, not its arguments. Raw libpq errors are suppressed to avoid leaking
connection details. CLI errors are intentionally sanitized. No upload occurs in
this tool. Use the separate uploader only after repository privacy and exact
destination checks. Do not add archives to source commits.

## Custodian authentication and decryption

After downloading/reassembling the encrypted artifact, verify the upload
manifest's size and SHA-256. A checksum alone is not authentication. Provide
`RECOVERY_BACKUP_PASSPHRASE` via your secure environment facility, then:

```sh
umask 077
node scripts/recovery-decrypt.mjs \
  --input /private/recovery/snapshot.knrb \
  --output /private/recovery/authenticated.dump
```

Wrong keys, changed headers/ciphertext/tags, and truncation fail closed without
publishing a new plaintext file. The decryptor snapshots ciphertext into a private
0700 staging directory, authenticates in a first pass while discarding plaintext
in memory, then decrypts that same private snapshot in a second pass. No plaintext
file is created until authentication succeeds. Result and staged files are mode
0600; staging is removed on ordinary success/error. Existing files/symlinks are
never overwritten. Do not allow untrusted same-user processes or directory owners
on the recovery host; filesystem permissions cannot isolate those actors.

Restore only into a separately approved disposable database/cluster, with
workers, mail, AI, Clerk and other integrations disconnected. Set *isolated*
libpq connection environment variables through approved tooling; never reuse
the app's inherited environment. Then a custodian may run:

```sh
pg_restore --exit-on-error --no-owner --no-privileges \
  --dbname isolated_recovery /private/recovery/authenticated.dump
```

The example assumes the custodian has created a disposable database named
`isolated_recovery` on the approved isolated host. Confirm that host and database
before running; never pass a credential-bearing connection URL as `--dbname`.
It intentionally does not restore original ownership/ACLs: reconcile these
separately. Never use `--clean` against live data. A PostgreSQL archive can contain
executable database objects; restore only trusted archives in an isolated system.
Inspect the full archive inventory, constraints, counts, bytes, references and
operational states against the recovery plan before approving any real cutover.
Remove plaintext promptly after verification.

## Format and library API

Version 1 is binary: `KNRB0001` (8 ASCII bytes), random 32-byte salt, random
12-byte nonce, AES-256-GCM ciphertext, and 16-byte authentication tag. The complete
52-byte header is authenticated as AAD. Key derivation is scrypt with `N=32768`,
`r=8`, `p=1`, a 32-byte key and 64 MiB memory limit. Unknown versions are rejected;
KDF parameters are fixed, not accepted from attacker-controlled headers.
The archive itself does not encode source provenance; retain a separately
controlled manifest and operator approval record.

`scripts/recovery-crypto.mjs` exports:

- `encryptStream(readable, outputPath, passphrase, beforePublish?)`
- `decryptFile(inputPath, outputPath, passphrase)`
- `verifyEncryptedFile(inputPath, passphrase)` — authenticates, resolves with no
  plaintext return/output; needs writable private space beside the input.
- `validatePassphrase(passphrase)`

Publication uses same-filesystem hard links for atomic no-overwrite behavior;
the destination filesystem must support them. Verification requires an extra
ciphertext copy; decryption requires room for that copy plus plaintext.

## Repeatable synthetic evidence

```sh
node --test scripts/recovery-crypto.test.mjs
node scripts/recovery-drill.mjs
```

The first command tests binary/empty roundtrip, wrong passphrase, tampered
header/ciphertext/tag, truncation, weak-passphrase rejection, failed-dump
publication prevention, no overwrite, output permissions and staging cleanup.
The second creates its own temporary PostgreSQL cluster with no TCP listener,
an owner-only Unix socket, a new synthetic superuser, and source/restore fixture
databases. Its subprocess environment is constructed from scratch (only system
PATH is inherited); it does not read application credentials or connect to any
shared development/production database.

The drill passed on PostgreSQL 16.10: custom dump → encryption → authentication
→ decryption → `pg_restore`, followed by exact JSON/UUID/staff-placeholder/queue
comparisons, SHA-256 media checks for all three purposes including empty and
1 MiB values, media-reference resolution, FK rejection and sequence continuation.
The private cluster is stopped and all fixture/archive/staging files removed.
No app, worker or external service is started. The representative fixture schema
is based on the project's schema but is **not a full production schema clone**.

## Limits and incident handling

Synthetic success is not evidence of production recoverability, permissions
correctness at HTTP routes, or availability of legacy Drive bytes/Clerk accounts.
The dump excludes cluster-level roles and external storage/services. Real restore
testing, provenance/manifests, schedule/queue reconciliation, access-boundary
checks and custodian key recovery remain necessary.

Ordinary failures clean staging; forced termination, power loss or filesystem
failure can leave private staging or a synthetic cluster behind. SIGKILL cannot
be handled. Have the custodian inspect private `.recovery-*` staging directories
and `/tmp/recovery-drill-*` directories after interruptions, stop only the
identified drill cluster using its own data directory, and remove it. File
deletion is not assured physical erasure on SSDs/snapshots; use encrypted
temporary storage and approved retention controls. Secrets in JavaScript strings
and process environments cannot be reliably zeroized; run on a trusted host.
No retention service, scheduler or production restore/cutover is implemented.