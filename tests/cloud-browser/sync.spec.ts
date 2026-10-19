import { test, expect, type Page } from '@playwright/test';
const base = 'http://127.0.0.1:5189/family-moments/giulia/';
const password = 'Only-a-local-emulator-test-123!';
let first = '',
  second = '';
test.beforeAll(async ({ request }) => {
  const seed = async (email: string) => {
    const response = await request.post(
      'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-emulator-key',
      { data: { email, password, returnSecureToken: true } },
    );
    expect(response.ok()).toBe(true);
    const user = await response.json();
    const member = await request.patch(
      `http://127.0.0.1:8080/v1/projects/demo-family-moments/databases/(default)/documents/households/home/members/${user.localId}`,
      {
        headers: { Authorization: 'Bearer owner' },
        data: { fields: { member: { booleanValue: true } } },
      },
    );
    expect(member.ok()).toBe(true);
    return email;
  };
  first = await seed(`first-${Date.now()}@example.test`);
  second = await seed(`second-${Date.now()}@example.test`);
});
async function signIn(page: Page, email: string) {
  await page.goto(base);
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save Moment', exact: true })).toBeEnabled();
}
async function waitSynced(page: Page) {
  await expect(
    page.getByRole('button', { name: 'Sync status: Safely synced', exact: true }),
  ).toBeVisible({ timeout: 20000 });
}
test('two household accounts share private SDK uploads; offline edits surface conflicts and retain both', async ({
  browser,
  page,
}) => {
  await signIn(page, first);
  await page.getByLabel('What happened today?', { exact: true }).fill('A real emulator memory');
  await page.locator('input[aria-label="Choose files"]').setInputFiles({
    name: 'private.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\nprivate emulator attachment'),
  });
  await expect(page.getByRole('button', { name: 'Remove private.pdf' })).toBeVisible();
  await page.getByRole('button', { name: 'Save Moment', exact: true }).click();
  await waitSynced(page);
  const other = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p2 = await other.newPage();
  await signIn(p2, second);
  await expect(p2.getByText('A real emulator memory', { exact: true })).toBeVisible({
    timeout: 20000,
  });
  await p2.getByText('A real emulator memory', { exact: true }).click();
  await p2.getByRole('button', { name: 'Load private attachment' }).click();
  await expect(p2.getByRole('link', { name: 'Open / download PDF' })).toBeVisible();
  await p2.getByRole('button', { name: 'Edit moment', exact: true }).click();
  await other.setOffline(true);
  await p2
    .getByLabel('What happened today?', { exact: true })
    .fill('Second parent offline version');
  await page.getByText('A real emulator memory', { exact: true }).click();
  await page.getByRole('button', { name: 'Edit moment', exact: true }).click();
  await page
    .getByLabel('What happened today?', { exact: true })
    .fill('First parent online correction');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await waitSynced(page);
  await p2.getByRole('button', { name: 'Save changes' }).click();
  await expect(p2.getByText('Second parent offline version', { exact: true })).toBeVisible();
  await other.setOffline(false);
  await p2.getByRole('button', { name: /Sync status:/ }).click();
  await expect(p2.getByText('Review conflicting edits', { exact: false })).toBeVisible({
    timeout: 20000,
  });
  await p2.getByText('Second parent offline version', { exact: true }).click();
  await expect(p2.getByRole('heading', { name: 'Two versions of this moment' })).toBeVisible();
  await p2.getByRole('button', { name: 'Keep both as separate moments' }).click();
  await waitSynced(p2);
  await expect(p2.getByText('Second parent offline version', { exact: true })).toBeVisible();
  await expect(p2.getByText('First parent online correction', { exact: true })).toBeVisible();
  await other.close();
});
