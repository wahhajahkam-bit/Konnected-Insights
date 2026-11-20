# Vercel test site

The protected Vercel test project builds the **repository root** from GitHub
`main`. Its Production environment must still use test-only settings. Do not
use a live database or move a production domain to this project.

- `konnected-insights` builds the Vite site at `/`. Clean browser routes
  serve `index.html`; URLs for static assets reach the original files.
- `api-server` serves `/api/*`, including `/api/__clerk`. Its Vercel entry is
  the exported Express app (`src/app.ts`), **not** the Replit server launcher.
  The service overrides the standalone package build; Vercel's Express builder
  bundles the app. Only the standalone host launcher (`src/standalone.ts`)
  requires PORT. The exported app does not seed the database, register scheduled jobs, or start a listener
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
