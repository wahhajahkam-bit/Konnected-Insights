import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

type AccessRole = 'admin' | 'editor';

const mutationMock = `
  window.automationWrites = window.automationWrites || [];
  const mutation = kind => ({
    isPending: false, isError: false, reset() {},
    mutate(payload, callbacks) {
      window.automationWrites.push({ kind, payload });
      if (callbacks && callbacks.onSuccess) callbacks.onSuccess();
      if (callbacks && callbacks.onSettled) callbacks.onSettled();
    }
  });
`;

async function mockClerk(page: Page) {
  await page.route('**/node_modules/.vite/deps/@clerk_react.js*', route => route.fulfill({
    contentType: 'application/javascript',
    body: `
      import React from '/node_modules/.vite/deps/react.js';
      export const useUser = () => ({ user: { id: 'staff-1', primaryEmailAddress: { emailAddress: 'staff@example.com' } } });
      export const useClerk = () => ({ signOut() {}, addListener() { return () => {}; } });
      export const useAuth = () => ({ isSignedIn: true, userId: 'staff-1' });
      export const ClerkProvider = ({ children }) => React.createElement(React.Fragment, null, children);
      export const Show = ({ children, when }) => when === 'signed-in' ? React.createElement(React.Fragment, null, children) : null;
      export const UserButton = () => null;
      export const SignIn = () => null;
      export const SignUp = () => null;
    `,
  }));
  await page.route('**/src/components/navbar.tsx*', route => route.fulfill({
    contentType: 'application/javascript',
    body: `export const Navbar = () => null;`,
  }));
  await page.route('**/src/components/metadata.tsx*', route => route.fulfill({
    contentType: 'application/javascript',
    body: `export const Metadata = () => null;`,
  }));
}

async function mockAutomationHub(page: Page, role: AccessRole, linkedInConfigured = true) {
  await mockClerk(page);
  await page.route('**/src/hooks/use-access.ts*', route => route.fulfill({
    contentType: 'application/javascript',
    body: `export const useEditorialAccess = () => ({ data: { allowed: true, role: '${role}', canManageStaff: ${role === 'admin'} }, isLoading: false, isError: false });`,
  }));
  await page.route('**/src/hooks/use-editorial-automation.ts*', route => route.fulfill({
    contentType: 'application/javascript',
    body: `
      ${mutationMock}
      window.ruleHookRequests = window.ruleHookRequests || [];
      const rule = {
        id: 'rule-1', name: 'Daily research', collection: 'newsletters',
        enabled: true, publishMode: 'draft', scheduleUtc: '02:00',
        lookbackDays: 3, maxItems: 5, search: 'subject:Research',
        senders: ['briefing@example.com'], createdAt: '2026-09-18T00:00:00.000Z'
      };
      export const useAutomationConnection = () => {
        window.ruleHookRequests.push('connection');
        return { data: { connected: true, email: 'automation@example.com' }, isLoading: false, refetch() {} };
      };
      export const useAutomationRules = () => {
        window.ruleHookRequests.push('rules');
        return { data: [rule], isLoading: false };
      };
      export const useCreateAutomationRule = () => mutation('rule-create');
      export const useUpdateAutomationRule = () => mutation('rule-update');
      export const useDeleteAutomationRule = () => mutation('rule-delete');
      export const useRunAutomationRule = () => mutation('rule-run');
      export const useAutomationRuns = id => {
        if (id) window.ruleHookRequests.push('history:' + id);
        return { data: [{ id: 'run-1', status: 'completed', startedAt: '2026-09-18T00:00:00.000Z', finishedAt: '2026-09-18T00:00:02.000Z', matched: 2, created: 1, skipped: 1, failed: 0 }], isLoading: false };
      };
    `,
  }));
  await page.route('**/src/hooks/use-newsletter-sources.ts*', route => route.fulfill({
    contentType: 'application/javascript',
    body: `
      ${mutationMock}
      const source = {
        id: 'source-1', version: 4, name: 'Research Briefing',
        senderEmail: 'briefing@example.com', subjectKeywords: ['Research'],
        instructions: '', referenceUrls: [], contributorId: 'contributor-1',
        enabled: true, createdAt: '2026-09-18T00:00:00.000Z',
        updatedAt: '2026-09-18T00:00:00.000Z'
      };
      export const useNewsletterSources = () => ({ data: { sources: [source], scheduleUtc: '02:00', mailbox: 'inbox@example.com' }, isLoading: false });
      export const useCreateNewsletterSource = () => mutation('source-create');
      export const useUpdateNewsletterSource = () => mutation('source-update');
      export const useDeleteNewsletterSource = () => mutation('source-delete');
      export const useCheckNewsletterSource = () => mutation('source-check');
    `,
  }));
  await page.route('**/src/hooks/use-editorial.ts*', route => route.fulfill({
    contentType: 'application/javascript',
    body: `
      ${mutationMock}
      export const useEditorialItems = collection => ({ data: collection === 'contributors' ? [{ id: 'contributor-1', title: 'Research Editor', slug: 'research-editor', status: 'published' }] : [], isLoading: false });
      export const useEditorialItem = () => ({ data: undefined, isLoading: false, isError: false });
      export const useCreateEditorialItem = () => mutation('editorial-create');
      export const useUpdateEditorialItem = () => mutation('editorial-update');
      export const useDeleteEditorialItem = () => mutation('editorial-delete');
      export const useReorderEditorialItems = () => mutation('editorial-reorder');
      export const useGenerateEventImage = () => mutation('event-image');
      export const useMarkEventEnded = () => mutation('event-ended');
      export const useGenerateEditorialContent = () => mutation('ai-autofill');
      export const useGenerateCoverImage = () => mutation('cover-image');
      export const useLinkedInIngestionStatus = () => ({
        data: ${linkedInConfigured ? `{
          configured: true, scheduleUtc: '03:00',
          lastRun: { status: 'succeeded', startedAt: '2026-09-18T03:00:00.000Z', completedAt: '2026-09-18T03:00:02.000Z',
            report: { fetched: 2, created: 1, skipped: 1, failed: 0, drafts: [{ id: 'draft-1', title: 'Imported LinkedIn draft' }], errors: [] } }
        }` : `{ configured: false, scheduleUtc: '03:00', lastRun: null }`},
        isLoading: false, isFetching: false, refetch() {}
      });
      export const useRunLinkedInIngestion = () => mutation('linkedin-run');
    `,
  }));
}

async function serveAutomationHarness(page: Page) {
  await page.route('**/__automation-hub-test*', route => route.fulfill({
    contentType: 'text/html',
    body: `
      <html><body><div id="root"></div>
      <script type="module">
        import RefreshRuntime from '/@react-refresh';
        RefreshRuntime.injectIntoGlobalHook(window);
        window.$RefreshReg$ = () => {};
        window.$RefreshSig$ = () => type => type;
        window.__vite_plugin_react_preamble_installed__ = true;
        const { default: React } = await import('/node_modules/.vite/deps/react.js');
        const { default: ReactDOM } = await import('/node_modules/.vite/deps/react-dom_client.js');
        const { default: AdminAutomation } = await import('/src/pages/admin-automation.tsx');
        ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(AdminAutomation));
      </script></body></html>`,
  }));
}

async function serveDeskHarness(page: Page) {
  await mockClerk(page);
  await page.route('**/src/hooks/use-access.ts*', route => route.fulfill({
    contentType: 'application/javascript',
    body: `export const useEditorialAccess = () => ({ data: { allowed: true, role: 'editor', canManageStaff: false }, isLoading: false });`,
  }));
  await page.route('**/src/hooks/use-editorial.ts*', route => route.fulfill({
    contentType: 'application/javascript',
    body: `
      ${mutationMock}
      window.linkedinStatusCalls = 0;
      const mutationWithAsync = kind => ({ ...mutation(kind), mutateAsync: async payload => ({ data: payload }) });
      export const useEditorialItems = () => ({ data: [], isLoading: false });
      export const useDeleteEditorialItem = () => mutation('delete');
      export const useReorderEditorialItems = () => mutation('reorder');
      export const useCreateEditorialItem = () => mutation('create');
      export const useUpdateEditorialItem = () => mutation('update');
      export const useGenerateEventImage = () => mutation('event-image');
      export const useMarkEventEnded = () => mutation('event-ended');
      export const useGenerateEditorialContent = () => mutation('ai-autofill');
      export const useGenerateCoverImage = () => mutationWithAsync('cover');
      export const useLinkedInIngestionStatus = () => {
        window.linkedinStatusCalls += 1;
        return { data: { configured: true }, isLoading: false };
      };
      export const useRunLinkedInIngestion = () => mutation('linkedin-run');
    `,
  }));
  await page.route('**/__automation-desk-test*', route => route.fulfill({
    contentType: 'text/html',
    body: `
      <html><body><div id="root"></div>
      <script type="module">
        import RefreshRuntime from '/@react-refresh';
        RefreshRuntime.injectIntoGlobalHook(window);
        window.$RefreshReg$ = () => {};
        window.$RefreshSig$ = () => type => type;
        window.__vite_plugin_react_preamble_installed__ = true;
        const { default: React } = await import('/node_modules/.vite/deps/react.js');
        const { default: ReactDOM } = await import('/node_modules/.vite/deps/react-dom_client.js');
        const { default: Admin } = await import('/src/pages/admin.tsx');
        ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(Admin));
      </script></body></html>`,
  }));
}

test.describe('Automation UI Validations', () => {
  test('Rule modal enforces sender/search narrowing and numeric constraints', async ({ page }) => {
    await page.route('**/src/hooks/use-editorial-automation.ts*', route => route.fulfill({
      contentType: 'application/javascript',
      body: `
        window.automationWrites = [];
        const mutation = kind => ({
          isPending: false, isError: false, reset() {},
          mutate(payload, callbacks) {
            window.automationWrites.push({ kind, payload });
            if (callbacks && callbacks.onSuccess) callbacks.onSuccess();
          }
        });
        export const useCreateAutomationRule = () => mutation('create');
        export const useUpdateAutomationRule = () => mutation('edit');
        export const useDeleteAutomationRule = () => mutation('delete');
        export const useRunAutomationRule = () => mutation('run');
        export const useAutomationConnection = () => ({ data: { connected: true, email: 'test@example.com' }, isLoading: false });
        export const useAutomationRules = () => ({ data: [], isLoading: false });
        export const useAutomationRuns = () => ({ data: [], isLoading: false });
      `,
    }));

    await page.route('**/__automation-ui-test', route => route.fulfill({
      contentType: 'text/html',
      body: `
        <html><body><div id="root"></div>
        <script type="module">
          import RefreshRuntime from '/@react-refresh';
          RefreshRuntime.injectIntoGlobalHook(window);
          window.$RefreshReg$ = () => {};
          window.$RefreshSig$ = () => type => type;
          window.__vite_plugin_react_preamble_installed__ = true;
          const { default: React } = await import('/node_modules/.vite/deps/react.js');
          const { default: ReactDOM } = await import('/node_modules/.vite/deps/react-dom_client.js');
          const { AutomationRuleDialog } = await import('/src/pages/admin-components/automation-rule-dialog.tsx');
          
          function TestWrapper() {
            const [open, setOpen] = React.useState(true);
            return React.createElement(AutomationRuleDialog, { 
              rule: null, 
              open: open, 
              onOpenChange: setOpen 
            });
          }

          ReactDOM.createRoot(document.getElementById('root')).render(
            React.createElement(TestWrapper)
          );
        </script></body></html>`,
    }));

    await page.goto('/__automation-ui-test');

    const save = page.getByRole('button', { name: 'Create Rule' });

    // Verify modal is open
    await expect(page.getByRole('heading', { name: /create automation rule/i })).toBeVisible();

    // Try to save empty form
    await save.click();
    
    // We expect rule name error
    await expect(page.getByText('Name is required')).toBeVisible();

    // Fill in required name but clear search/senders
    await page.fill('input[name="name"]', 'Test Rule');
    await page.fill('input[name="search"]', '');
    await page.fill('input[name="senders"]', '');
    await save.click();

    // Verify validation that at least one valid sender is required
    await expect(page.getByText('At least one sender is required')).toBeVisible();

    // Fill in invalid sender
    await page.fill('input[name="senders"]', 'invalid-email');
    await save.click();
    await expect(page.getByText('Must be a comma-separated list of valid email addresses')).toBeVisible();

    // Fix sender and add invalid number (decimal) to check integer constraint
    await page.fill('input[name="senders"]', 'valid@example.com');
    await page.fill('input[name="lookbackDays"]', '2.5');
    await save.click();
    await expect(page.getByText('Expected integer, received float')).toBeVisible();

    // Fix number constraint
    await page.fill('input[name="lookbackDays"]', '2');

    // Test automatic publish confirmation requirement
    // Need to select 'automatic' in Select
    await page.getByRole('combobox').filter({ hasText: 'Drafts' }).click();
    await page.getByRole('option', { name: 'Automatic' }).click();

    await save.click();
    await expect(page.getByText('You must confirm to enable automatic publishing.')).toBeVisible();

    // Check confirmation and ensure it works
    await page.getByRole('checkbox').click();
    
    // Verify it saves successfully
    await save.click();

    await expect.poll(() => page.evaluate(() => (window as any).automationWrites.length)).toBe(1);
    const write = await page.evaluate(() => (window as any).automationWrites[0]);
    expect(write.kind).toBe('create');
    expect(write.payload.name).toBe('Test Rule');
    expect(write.payload.senders).toEqual(['valid@example.com']);
    expect(write.payload.publishMode).toBe('automatic');
    expect(write.payload.confirmAutomaticPublishing).toBe(true);
  });
});

test.describe('Unified automation navigation', () => {
  test('source dirty guards cancel and discard without mutations, and save clears the guard', async ({ page }) => {
    await mockAutomationHub(page, 'admin');
    await serveAutomationHarness(page);
    await page.goto('/__automation-hub-test?section=email-sources');
    await page.getByRole('button', { name: /Research Briefing/ }).click();

    const writes = () => page.evaluate(() => (window as any).automationWrites || []);
    await page.getByLabel('Source Name').fill('Unsaved source');
    page.once('dialog', dialog => dialog.dismiss());
    await page.getByRole('link', { name: /LinkedIn Intake/ }).click();
    await expect(page).toHaveURL(/\?section=email-sources$/);
    await expect(page.getByLabel('Source Name')).toHaveValue('Unsaved source');
    expect(await writes()).toEqual([]);

    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('button', { name: /Research Briefing/ })).toBeVisible();
    await expect(page.getByLabel('Source Name')).toHaveCount(0);

    await page.getByRole('button', { name: /Research Briefing/ }).click();
    await expect(page.getByLabel('Source Name')).toHaveValue('Research Briefing');
    await page.getByLabel('Source Name').fill('Existing dirty');
    page.once('dialog', dialog => dialog.dismiss());
    await page.getByRole('button', { name: 'Add Source' }).click();
    await expect(page.getByLabel('Source Name')).toHaveValue('Existing dirty');
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'Add Source' }).click();
    await expect(page.getByRole('heading', { name: 'New Source' })).toBeVisible();
    await page.getByLabel('Source Name').fill('New dirty');
    page.once('dialog', dialog => dialog.dismiss());
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByLabel('Source Name')).toHaveValue('New dirty');
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByLabel('Source Name')).toHaveCount(0);

    await page.getByRole('button', { name: /Research Briefing/ }).click();
    await expect(page.getByLabel('Source Name')).toHaveValue('Research Briefing');
    await page.getByLabel('Source Name').fill('Saved source');
    await page.getByRole('button', { name: 'Save Source' }).click();
    await expect.poll(async () => (await writes()).map((write: any) => write.kind)).toEqual(['source-update']);
    await page.getByRole('link', { name: /LinkedIn Intake/ }).click();
    await expect(page).toHaveURL(/\?section=linkedin$/);
    expect(await writes()).toHaveLength(1);
  });

  test('rule Cancel, X, Escape and discard restore defaults without rule mutations', async ({ page }) => {
    await mockAutomationHub(page, 'admin');
    await serveAutomationHarness(page);
    await page.goto('/__automation-hub-test?section=rules');

    const writes = () => page.evaluate(() => (window as any).automationWrites || []);
    await page.getByRole('button', { name: 'New Rule' }).click();
    await page.getByLabel('Rule Name').fill('Dirty rule');
    page.once('dialog', dialog => dialog.dismiss());
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('heading', { name: 'Create Automation Rule' })).toBeVisible();
    expect(await writes()).toEqual([]);

    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('heading', { name: 'Active Rules' })).toBeVisible();
    await page.getByRole('button', { name: 'New Rule' }).click();
    await expect(page.getByLabel('Rule Name')).toHaveValue('');
    await page.getByLabel('Rule Name').fill('Escape rule');
    page.once('dialog', dialog => dialog.dismiss());
    await page.getByRole('button', { name: 'Close' }).click();
    await expect(page.getByRole('heading', { name: 'Create Automation Rule' })).toBeVisible();
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'Close' }).click();
    await expect(page.getByRole('heading', { name: 'Active Rules' })).toBeVisible();
    await page.getByRole('button', { name: 'New Rule' }).click();
    await page.getByLabel('Rule Name').fill('Escape rule');
    page.once('dialog', dialog => dialog.dismiss());
    await page.keyboard.press('Escape');
    await expect(page.getByRole('heading', { name: 'Create Automation Rule' })).toBeVisible();
    await expect(page.getByLabel('Rule Name')).toHaveValue('Escape rule');
    page.once('dialog', dialog => dialog.accept());
    await page.keyboard.press('Escape');
    await expect(page.getByRole('heading', { name: 'Active Rules' })).toBeVisible();
    expect(await writes()).toEqual([]);
  });

  test('browser back and forward cancel preserves dirty source across multiple history entries, then accepts', async ({ page }) => {
    await mockAutomationHub(page, 'admin');
    await serveAutomationHarness(page);
    await page.goto('/__automation-hub-test?section=email-sources');
    await page.getByRole('link', { name: /LinkedIn Intake/ }).click();
    await page.getByRole('link', { name: /Email Newsletter Sources/ }).click();
    await page.goBack();
    await expect(page).toHaveURL(/\?section=linkedin$/);
    await page.goForward();
    await expect(page).toHaveURL(/\?section=email-sources$/);
    await page.getByRole('link', { name: /LinkedIn Intake/ }).click();
    await expect(page).toHaveURL(/\?section=linkedin$/);
    await page.goBack();
    await expect(page).toHaveURL(/\?section=email-sources$/);
    await page.getByRole('button', { name: /Research Briefing/ }).click();
    await page.getByLabel('Source Name').fill('Retained edit');

    page.once('dialog', dialog => dialog.dismiss());
    await page.goForward();
    await expect(page).toHaveURL(/\?section=email-sources$/);
    await expect(page.getByLabel('Source Name')).toHaveValue('Retained edit');

    page.once('dialog', dialog => dialog.accept());
    await page.goForward();
    await expect(page).toHaveURL(/\?section=linkedin$/);
    await expect(page.getByRole('heading', { name: 'LinkedIn newsletter intake' })).toBeVisible();
  });

  test('reload beforeunload guard cancels with edits and accepts to fresh source defaults', async ({ page }) => {
    await mockAutomationHub(page, 'admin');
    await serveAutomationHarness(page);
    await page.goto('/__automation-hub-test?section=email-sources');
    await page.getByRole('button', { name: /Research Briefing/ }).click();
    await page.getByLabel('Source Name').fill('Reload edit');

    page.once('dialog', dialog => {
      expect(dialog.type()).toBe('beforeunload');
      dialog.dismiss();
    });
    await page.reload({ timeout: 3000 }).catch(() => {});
    await expect(page.getByLabel('Source Name')).toHaveValue('Reload edit');

    page.once('dialog', dialog => {
      expect(dialog.type()).toBe('beforeunload');
      dialog.accept();
    });
    await page.reload();
    await expect(page.getByRole('button', { name: /Research Briefing/ })).toBeVisible();
    await expect(page.getByLabel('Source Name')).toHaveCount(0);
    expect(await page.evaluate(() => (window as any).automationWrites || [])).toEqual([]);
  });

  test('legacy newsletter sources route uses replace navigation to the email sources section', () => {
    const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
    expect(appSource).toContain('<Route path="/admin/newsletter-sources" component={ProtectedNewsletterSources} />');
    expect(appSource).toContain('<Redirect to="/admin/automation?section=email-sources" replace />');
  });

  test('editor can use source and LinkedIn sections, but a direct rules URL stays restricted without rule requests', async ({ page }) => {
    await mockAutomationHub(page, 'editor', false);
    await serveAutomationHarness(page);

    await page.goto('/__automation-hub-test?section=rules');
    await expect(page.getByRole('heading', { name: 'Administrator access required' })).toBeVisible();
    expect(await page.evaluate(() => (window as any).ruleHookRequests || [])).toEqual([]);

    await page.getByRole('link', { name: /View email sources/i }).click();
    await expect(page).toHaveURL(/\?section=email-sources$/);
    await expect(page.getByLabel('Email newsletter source settings').getByText('Email Newsletter Sources')).toBeVisible();
    await expect(page.getByRole('link', { name: /Email Newsletter Sources/ })).toHaveAttribute('aria-current', 'page');
    await page.getByRole('link', { name: /LinkedIn Intake/ }).click();
    await expect(page).toHaveURL(/\?section=linkedin$/);
    await expect(page.getByRole('heading', { name: 'LinkedIn intake is not configured' })).toBeVisible();
    await expect(page.getByRole('link', { name: /LinkedIn Intake/ })).toHaveAttribute('aria-current', 'page');
    expect(await page.evaluate(() => (window as any).ruleHookRequests || [])).toEqual([]);
  });

  test('section refresh and history navigation do not trigger imports or mutations', async ({ page }) => {
    await mockAutomationHub(page, 'admin');
    await serveAutomationHarness(page);
    const postRequests: string[] = [];
    page.on('request', request => {
      if (request.method() !== 'GET') postRequests.push(`${request.method()} ${request.url()}`);
    });

    await page.goto('/__automation-hub-test?section=email-sources');
    await expect(page.getByLabel('Email newsletter source settings').getByText('Email Newsletter Sources')).toBeVisible();
    await page.getByRole('link', { name: /LinkedIn Intake/ }).click();
    await expect(page.getByRole('heading', { name: 'LinkedIn newsletter intake' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'LinkedIn newsletter intake' })).toBeVisible();
    await page.getByRole('link', { name: /Automation rules/ }).click();
    await expect(page.getByRole('heading', { name: 'Active Rules' })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole('heading', { name: 'LinkedIn newsletter intake' })).toBeVisible();
    await page.goForward();
    await expect(page.getByRole('heading', { name: 'Active Rules' })).toBeVisible();

    expect(postRequests).toEqual([]);
    expect(await page.evaluate(() => (window as any).automationWrites || [])).toEqual([]);
  });

  test('source CRUD/check and rule controls/history remain available from the hub', async ({ page }) => {
    await mockAutomationHub(page, 'admin');
    await serveAutomationHarness(page);
    await page.goto('/__automation-hub-test?section=email-sources');

    await page.getByRole('button', { name: /Research Briefing/ }).click();
    await page.getByRole('button', { name: 'Check Now' }).click();
    await page.getByLabel('Source Name').fill('Updated Research Briefing');
    await page.getByRole('button', { name: 'Save Source' }).click();
    await page.getByRole('button', { name: 'Delete' }).click();
    await page.getByRole('button', { name: 'Confirm Delete' }).click();
    await page.getByRole('button', { name: 'Add Source' }).click();
    await page.getByLabel('Source Name').fill('New Source');
    await page.getByLabel('Sender Email (Exact Match)').fill('new@example.com');
    await page.getByLabel('Subject Keywords').fill('Weekly');
    await page.getByRole('combobox').click();
    await page.getByRole('option', { name: 'Research Editor' }).click();
    await page.getByRole('button', { name: 'Save Source' }).click();

    await page.getByRole('link', { name: /Automation rules/ }).click();
    await page.getByRole('switch').click();
    await page.getByRole('button', { name: 'Run Now' }).click();
    await page.locator('button').filter({ has: page.locator('svg.lucide-ellipsis-vertical') }).click();
    await page.getByRole('menuitem', { name: 'View Runs' }).click();
    await expect(page.getByRole('heading', { name: 'Recent Automation Runs' })).toBeVisible();
    await expect(page.getByText('Matched')).toBeVisible();

    const kinds = await page.evaluate(() => (window as any).automationWrites.map((write: any) => write.kind));
    expect(kinds).toEqual(expect.arrayContaining([
      'source-check', 'source-update', 'source-delete', 'source-create', 'rule-update', 'rule-run',
    ]));
    expect(await page.evaluate(() => (window as any).ruleHookRequests)).toContain('history:rule-1');
  });

  test('configured LinkedIn intake shows status and only imports after Check now', async ({ page }) => {
    await mockAutomationHub(page, 'editor', true);
    await serveAutomationHarness(page);
    await page.goto('/__automation-hub-test?section=linkedin');

    await expect(page.getByText('Imported LinkedIn draft')).toBeVisible();
    expect(await page.evaluate(() => (window as any).automationWrites || [])).toEqual([]);
    await page.getByRole('button', { name: 'Check now' }).click();
    expect(await page.evaluate(() => (window as any).automationWrites.map((write: any) => write.kind))).toEqual(['linkedin-run']);
  });

  test('editorial desk does not fetch LinkedIn status and its draft action opens the existing AI editor', async ({ page }) => {
    await serveDeskHarness(page);
    await page.goto('/__automation-desk-test');

    await expect(page.getByText(/LinkedIn newsletter intake/i)).toHaveCount(0);
    expect(await page.evaluate(() => (window as any).linkedinStatusCalls ?? 0)).toBe(0);
    await page.getByRole('button', { name: 'Create newsletter draft' }).click();
    await expect(page.getByRole('heading', { name: 'AI Autofill' })).toBeVisible();
    await expect(page.getByLabel('Public source URL (Optional)')).toBeVisible();
  });
});
