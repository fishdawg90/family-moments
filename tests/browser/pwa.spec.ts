import { test, expect } from '@playwright/test';
const base = 'http://127.0.0.1:4187/family-moments/';
test('three real static profile entrypoints, distinct install identities and isolated offline worker', async ({
  page,
  context,
  request,
}) => {
  const ids = new Set<string>();
  for (const profile of ['giulia', 'nina', 'me']) {
    const response = await request.get(base + profile + '/');
    expect(response.status()).toBe(200);
    expect(await response.text()).toContain(`/family-moments/${profile}/manifest.webmanifest`);
    const manifest = await (await request.get(base + profile + '/manifest.webmanifest')).json();
    ids.add(manifest.id);
    expect(manifest.start_url).toBe(`/family-moments/${profile}/`);
    expect(manifest.scope).toBe(`/family-moments/${profile}/`);
    expect(manifest.icons.some((i: { sizes: string }) => i.sizes === '512x512')).toBe(true);
  }
  expect(ids.size).toBe(3);
  await page.goto(base + 'giulia/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    await window.caches.open('our-days-do-not-touch');
    await window.caches.open('our-basket-phone-do-not-touch');
  });
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  expect(
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.scope),
  ).toBe(base);
  await context.setOffline(true);
  for (const [id, name] of [
    ['giulia', "Giulia's Moments"],
    ['nina', "Nina's Moments"],
    ['me', 'My Moments'],
  ]) {
    await page.goto(base + id + '/');
    await expect(page).toHaveTitle(name);
    await expect(
      page.getByRole('heading', { name: 'A little moment. Yours to keep.' }),
    ).toBeVisible();
    await page.reload();
    await expect(page).toHaveTitle(name);
  }
  const caches = await page.evaluate(() => window.caches.keys());
  expect(caches).toContain('our-days-do-not-touch');
  expect(caches).toContain('our-basket-phone-do-not-touch');
  expect(caches.some((c) => c.startsWith('family-moments-'))).toBe(true);
});
