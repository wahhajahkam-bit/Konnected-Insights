# Newsletter sources

Staff manage sources at `/admin/newsletter-sources`. A source records its
sender email, subject hints, optional AI instructions and reference links, and
an explicit contributor assignment. The Gmail connection is the receiving
mailbox, not the sender address entered in this form.

New sources are paused. Use **Check now** to perform a bounded real Gmail check.
The result is persisted, including no matches, partial coverage, and errors.
Imports create unpublished drafts only. Missing images or other required fields
must be completed before publication. Contributor assignment is editorial
metadata, not independent identity verification.

Reference-only rules require an evidenced matching link. For a publication whose
edition links vary, provide subject hints and/or explicit AI instructions as
well as the publication reference. Emails and linked pages are never treated as
trusted instructions; the service does not scrape authenticated LinkedIn pages,
send mail, or modify the originals.

## Daily execution

Enabled sources are due daily at **02:00 UTC (06:00 Asia/Dubai)**. The API process
checks for due sources each minute. Database claims prevent duplicate concurrent
runs, and the newsletter advisory lock protects shared manual/scheduled dedup.

An in-process timer is **not an always-on guarantee**. A sleeping Autoscale
deployment or a stopped development workspace will not run it. For unattended
operation, use an always-on deployment or configure a Scheduled Deployment to
run the following against the same database and Gmail/AI integrations:

```sh
pnpm --filter @workspace/api-server run newsletter-sources:run-due
```

The command builds and runs the same due-source worker, then exits. It does not
enable any source or publish content. Running it more frequently than daily is
safe: each source's persisted due time controls its actual cadence.

Runs intentionally limit Gmail search pages and full-message/AI processing.
`hasMore` means coverage is incomplete, not that every edition was checked.
Narrow sender/subject hints when a source is too broad. A successful empty
result verifies connectivity and filtering, **not** extraction of a real edition.