# Vercel test site

Import the **repository root** from the `vercel-preview-setup` branch into
a **new test project**, not the live project. If Vercel's import screen only
offers the default branch, do not deploy the default branch expecting this
configuration: select the setup branch for the deployment. If this test
project treats the branch as Production, its environment and protection must
still be test-only. Check deployment protection before supplying real data.

- `konnected-insights` builds the Vite site at `/`. Clean browser routes
  serve `index.html`; URLs for static assets reach the original files.
- `api-server` serves `/api/*`, including `/api/__clerk`. Its Vercel entry is
  the exported Express app (`src/app.ts`), **not** the Replit server launcher.
  It does not seed the database, register scheduled jobs, or start a listener
  on import. No cron, daemon or separate mockup service is configured.
- Browser requests use the same origin. No private service binding is needed.

Set these in the Vercel test project's settings, not in Git:

| Variable | Use |
| --- | --- |
| `VITE_CLERK_PUBLISHABLE_KEY` | Test Clerk publishable key for the frontend build. |
| `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | Matching test Clerk tenant for the API. Configure allowed origins/redirects for the test domain. |
| `DATABASE_URL` | Isolated PostgreSQL database, with the app schema and the data you intend to test. **Never point this preview at the live database.** |

Optional integrations are not transferred. Leave production AI/mail/Drive
connections out. Explicitly testing manual AI features requires a compatible
provider endpoint and credentials, usage limits, and appropriate server-side
chat identity configuration. Starting a manual research or newsletter action
is not the same as running a scheduled job; do not rely on long background
actions completing in a request-based deployment.

Verify the preview before considering any migration:

1. `/api/healthz` returns `{"status":"ok"}` (reachability only, not database health).
2. Open and refresh a nested page such as `/future-of-work/finance`.
3. Open a known article and database-backed image from the **test** database.
4. Verify test staff sign-in and draft privacy. Confirm a saved test draft
   never appears on the original site.

This setup does not copy data, configure providers, activate schedules, or
switch domains. No recurring research or newsletter jobs should be added until
separately designed and verified for off-host execution.
