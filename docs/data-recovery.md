# Editorial data and media recovery plan

Status: **GitHub destination and encrypted backup implementation approved;
real-data export blocked on secure passphrase/source configuration**.
No runtime data has been exported or restored under this plan. This document does
not change publishing, schedulers, database schemas or the GitHub backup process.

## Scope and recovery units

The [GitHub source snapshot](source-backup.md) recovers application code only.
Use the matching source revision with the following separately protected data:

| Unit | Contents | Recovery dependency |
| --- | --- | --- |
| Editorial content | `editorial_items`, including drafts, published collections, contributor records and embedded media references | Preserve UUIDs, slugs, source IDs and complete JSON, not just public articles |
| Uploaded media | `editorial_image_assets`, including binary bytes, MIME type, purpose and uploader metadata | Preserve asset UUIDs and purpose; content and assets must come from the same database snapshot |
| Research and operational records | Future-work versions/functions, evidence, decisions, queues, schedules, research logs; newsletter sources/runs; automation rules/runs/messages; AI usage and agent monitoring/audits | Keep FK dependencies, indexes, sequences and operational history together |
| Staff authorization | `editorial_staff`, including roles and external identity/invitation references | Highly restricted personal/security data; rows do not recreate Clerk accounts |
| External dependencies | Clerk tenant/configuration and legacy read-only Google Drive assets; other embedded external URLs | Not covered by a PostgreSQL dump |

Confirm the deployed schema and actual database provider before implementation.
The code inventory is not proof that production has exactly the same tables.
Prefer one consistent full application-database snapshot over independently
exported tables: relationships also live in JSON and are not all enforced by FKs.
If an owner excludes staff, evidence or operational data, label that backup
**partial** and document the resulting recovery limitations.

## Approval and storage decision

Before accessing/exporting runtime data, record approval for:

1. Exact source environment (production or development), scope and one-time versus
   scheduled operation. Development data is not a production recovery backup.
2. Named destination, owner/custodian, permitted readers and region if relevant.
3. Encryption/key custody, retention/deletion policy, cost and any third-party
   transfer. Keys must be recoverable independently of the app and backup store.
4. A separate disposable restore target, who may access it, and cleanup deadline.
5. Separate permission to copy legacy Drive bytes or export identity-provider
   data. Do not infer these permissions from database-export approval.

The owner selected the existing private repository
`ahkamkhalid-png/K-nnected-Insights` as the backup destination. Source snapshots
remain on `source-backup`. Runtime backups must be encrypted before upload and
kept separate from source snapshots; their decryption key must be retained
outside GitHub by the owner. Repository privacy and write access must be checked
at upload time. Git history retains older archives: deletion of a current file
alone does not implement retention or erase personal data from history.
Do not silently connect a new cloud provider, put unencrypted dumps in GitHub,
App Storage/public routes, or deliver sensitive archives through chat,
asset cards, workflow logs or source commits. `.gitignore` alone is not security.
Do not assume App Storage can be provisioned: new media currently uses PostgreSQL.

Suggested policy for approval, not an implemented guarantee: nightly snapshots,
seven daily and four weekly recovery points, a backup before major content/data
maintenance, a quarterly restore drill, and a target of at most 24 hours of data
loss with recovery within one business day. Establish actual timings with the
first drill. Keep the last verified backup until its replacement is verified.

## Export procedure after approval

- Use an authorized operator and supported PostgreSQL export tooling against the
  confirmed source, with credentials supplied through approved secret handling.
  Do not print credentials, connection strings, invitation tokens or record data.
- Take a consistent custom-format logical snapshot including schema, all
  application tables and binary media. Preserve constraints and identifiers;
  inspect schema coverage for tables not present in the source-code inventory.
  Never concatenate independent table queries and call them a consistent backup.
- Encrypt before transfer and avoid persistent plaintext staging. Use restricted
  temporary storage only if approved; clean it on success and failure. Do not
  place plaintext in the project, tracked or untracked.
- Store a restricted manifest alongside the encrypted archive: UTC snapshot time,
  environment, source revision, PostgreSQL/tool versions, table coverage/counts,
  asset count/byte totals, archive checksum and encryption/key reference (not key).
  Record omissions and legacy dependencies. Keep sensitive row-level manifests
  encrypted too.
- Verify the stored archive checksum and successful decryption by the custodian.
  A successful upload is not proof of recoverability; complete the isolated drill.

## Media and identity limitations

Database-backed uploads use UUIDs and purpose-specific storage routes. Preserve
the existing asset IDs so JSON references keep resolving. Public, evidence and
generated assets are not interchangeable: a restore must not make private
evidence public.

Legacy non-UUID media IDs resolve through read-only Google Drive access. A
database snapshot preserves references, not those bytes or connector access.
With separate consent, inventory referenced Drive IDs and required appProperties
(`konnectedEditorialImage` and purpose), then protect originals with a private
copy/backup. A copy with a new Drive ID is not a drop-in recovery: retain a secure
old-to-new mapping and plan an explicitly approved reference migration if the
original IDs cannot be recovered. Do not write to, move or delete originals.
Until byte recovery is tested, mark legacy media recovery as unverified.
External article, video and image URLs may disappear independently.

Clerk accounts and authentication configuration are external. Use a separate
test tenant for a future authenticated drill; never point a clone at production
identity or mail integrations. Verify owner/admin/editor access, disabled staff
and expired invitations without reviving old invitation claims. Reconcile staff
roles with the owner before real cutover. Database restore does not recreate
users, passwords, sessions, connector grants or secrets; reauthorize integrations
and configure secrets separately through approved tooling.

## Isolated restore drill

First prove the procedure using **synthetic data only**, with no app database
credentials and no real accounts or external connectors. The target must be a
separate disposable database, not a schema inside a live database. Test fixtures
must include linked drafts/published content, public/evidence/generated images,
research relationships, staff-role placeholders, and enabled/queued job states.

After separate export approval, repeat using an approved encrypted snapshot in
an equivalently restricted disposable environment:

1. Confirm target identity is distinct from both live production and shared
   development. Stop if target isolation cannot be proven. Record that check
   without credentials.
2. Restore to an empty target using compatible tooling. No destructive restore
   flags against a live database. Do not run the ordinary API startup or publish
   the clone: it may resume schedules, imports, AI calls or queued publication.
   Database-level checks come first; app checks require worker-free startup,
   outbound-network restrictions and test-only integrations.
3. Verify archive integrity/decryption; compare all table counts, IDs, FKs,
   uniqueness constraints and representative complete JSON. Compare media bytes
   by cryptographic hash, size, MIME and purpose, including empty/large values.
   Verify media references resolve, and report missing legacy objects separately.
4. With an isolated, worker-disabled app, check a draft and published article,
   public image delivery, private evidence authorization, generated-image access,
   staff permissions and failed/expired invitation handling. Nothing must publish,
   send mail, call paid AI or alter the real Drive/Clerk services.
5. Record a sanitized receipt: snapshot identifier, source revision, isolated
   target alias, checks/results, missing dependencies, elapsed time and operator
   approval. Never include article bodies, personal records or credentials.
6. Destroy the disposable database and staged plaintext at the agreed deadline;
   retain only the approved encrypted backup and sanitized receipt.

Pass requires both content and media integrity, correct access boundaries, no
external side effects and documented cleanup. Synthetic success alone is not
proof that production data or legacy Drive media is recoverable.

## Real incident and cutover

Obtain fresh owner approval for any production replacement. Agree the recovery
point and expected lost edits first; preserve the current state if feasible.
Quiesce writes/jobs, restore and validate off-line, reconcile schedules, queue
claims, pending imports and invitations, then explicitly authorize cutover.
Keep a rollback option. Re-enable jobs individually only after duplicate-run and
publication risks are resolved. Do not add automatic production DDL or startup
migration scripts; managed Replit production schema changes use the supported
Publish flow, while incident data recovery is a separately approved operation.

Replit's built-in recovery is complementary, not evidence of an independent
archive. Verify available recovery points, retention and target behavior in the
actual project before use; never initiate a live rollback as a restore drill.
Platform references:
- https://docs.replit.com/features/data-and-storage/data-recovery
- https://docs.replit.com/features/data-and-storage/development-and-production
- https://docs.replit.com/features/data-and-storage/work-with-your-data

## Current approval / evidence record

- Export scope: owner requested comprehensive encrypted backup; source
  environment/connection must still be explicitly identified before export.
- Private destination: owner-selected GitHub repository above; privacy and write
  access verified on 2026-09-22. Encryption key/custody setup pending.
- Retention and recovery objectives: proposed above, pending.
- Legacy Drive / Clerk: not included in PostgreSQL exports; independent
  authenticated access and recovery procedures still required.
- Synthetic isolated drill: passed on PostgreSQL 16.10 on 2026-09-22;
  independent temporary cluster, exact JSON/UUID and media-hash checks, FK and
  sequence checks, then cleanup. No application workers or live data used.
- Real-snapshot isolated drill: not run; secure key/source setup pending.
- Production changes: none authorized or performed.

Implementation and repository settings:
[GitHub backup security](github-backup-security.md).
Recovery commands: [decryption guide](backup-decryption.md).