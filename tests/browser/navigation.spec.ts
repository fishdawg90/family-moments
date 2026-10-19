import { test, expect } from '@playwright/test';
const base = 'http://127.0.0.1:5187/family-moments/giulia/';

test('Back dismisses typing and attachment choices before leaving, without losing drafts or trapping navigation', async ({
  page,
}) => {
  await page.goto('about:blank');
  await page.goto(base);
  const text = page.getByLabel('What happened today?', { exact: true });
  const photo = page.getByRole('button', { name: 'Photo', exact: true });
  await expect(text).toBeEnabled();
  await text.fill('Keep this unfinished thought');
  await page.goBack();
  await expect(text).not.toBeFocused();
  await expect(text).toHaveValue('Keep this unfinished thought');
  await expect(page).toHaveURL(base);
  // Repeated keyboard use must not build up stale Back steps.
  await text.focus();
  await page.goBack();
  await expect(text).not.toBeFocused();
  await text.focus();
  await photo.click();
  await expect(page.getByRole('group', { name: 'Add a photo', exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('group', { name: 'Add a photo', exact: true })).toHaveCount(0);
  await expect(text).not.toBeFocused();
  await photo.click();
  const picker = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Choose from gallery' }).click();
  await (await picker).setFiles([]);
  await page.goBack();
  await expect(photo).toHaveAttribute('aria-expanded', 'false');
  await page.getByRole('combobox', { name: 'Find or add a tag' }).fill('firs');
  await page.goBack();
  await expect(page.getByRole('combobox', { name: 'Find or add a tag' })).toHaveValue('');
  await page.locator('.event-date summary').click();
  await expect(page.locator('.event-date')).toHaveAttribute('open', '');
  await page.goBack();
  await expect(page.locator('.event-date')).not.toHaveAttribute('open');
  await expect(text).toHaveValue('Keep this unfinished thought');
  await page.goBack();
  await expect(page).toHaveURL('about:blank');
});

test('Back stops audio recording and keeps its preview available to attach', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['microphone']);
  await page.goto('about:blank');
  await page.goto(base);
  await expect(page.getByRole('button', { name: 'Save Moment', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Audio', exact: true }).click();
  await expect(page.getByText(/Recording ·/)).toBeVisible();
  await page.waitForTimeout(300);
  await page.goBack();
  await expect(page.getByText(/Recording ·/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Attach recording', exact: true })).toBeVisible();
  await expect(page).toHaveURL(base);
  await page.getByRole('button', { name: 'Attach recording', exact: true }).click();
  await expect(page.locator('.attachment-card audio')).toHaveCount(1);
  await page.getByRole('button', { name: 'Save Moment', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved on this phone' })).toBeVisible();
});

test('Back closes deletion confirmation, deselects the memory, then returns from Recent before leaving', async ({
  page,
}) => {
  await page.goto('about:blank');
  await page.goto(base);
  await page.getByLabel('What happened today?', { exact: true }).fill('An ordinary lovely day');
  await page.getByRole('button', { name: 'Save Moment', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved on this phone' })).toBeVisible();
  await page.getByRole('button', { name: 'See recent' }).click();
  await page.getByText('An ordinary lovely day', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Edit moment', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Edit moment', exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('button', { name: 'Edit moment', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Recent moments', exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('button', { name: 'Save Moment', exact: true })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL('about:blank');
});
