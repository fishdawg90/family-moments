import { test, expect } from '@playwright/test';
const base = 'http://127.0.0.1:5187/family-moments/';

test('profile title dropdown supports Back and keyboard selection, preserving each profile draft', async ({
  page,
}) => {
  await page.goto(base + 'giulia/');
  const text = page.getByLabel('What happened today?', { exact: true });
  await text.fill('Giulia’s unfinished thought');
  const title = page.getByRole('button', { name: "Giulia's Moments", exact: true });
  await title.click();
  await expect(page.getByRole('menu', { name: 'Memory pages' })).toBeVisible();
  await expect(page.getByRole('menuitem')).toHaveCount(3);
  await expect(page.getByRole('menu', { name: 'Memory pages' })).toHaveCSS('opacity', '1');
  await page.screenshot({ path: 'docs/screenshots/profile-menu.png', fullPage: true });
  await page.goBack();
  await expect(page.getByRole('menu')).toHaveCount(0);
  await title.click();
  await expect(page.getByRole('menuitem', { name: "Giulia's Moments", exact: true })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitem', { name: "Nina's Moments", exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(base + 'nina/');
  await text.fill('Nina’s separate thought');
  await page.getByRole('button', { name: "Nina's Moments", exact: true }).click();
  await page.getByRole('menuitem', { name: "Giulia's Moments", exact: true }).click();
  await expect(page).toHaveURL(base + 'giulia/');
  await expect(text).toHaveValue('Giulia’s unfinished thought');
  await page.getByRole('button', { name: 'Explore moments', exact: true }).click();
  await page.getByRole('button', { name: "Giulia's Moments", exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'My Moments', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: 'Open your little world', exact: true }),
  ).toBeVisible();
});

test('tag search has one horizontal chip row and date pill expands, saves and closes without another field appearing', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base + 'giulia/');
  await expect(page.getByRole('button', { name: 'Save Moment', exact: true })).toBeEnabled();
  await expect(page.getByText('A little context', { exact: true })).toHaveCount(0);
  const row = page.getByRole('group', { name: 'Selected and frequent tags' });
  const boxes = await row
    .getByRole('button')
    .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().y));
  expect(new Set(boxes.map((y) => Math.round(y))).size).toBe(1);
  expect(await row.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  await row.getByRole('button', { name: 'Funny', exact: true }).click();
  await expect(row.getByRole('button', { name: 'Funny', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const pill = page.locator('.event-date'),
    toggle = page.locator('.date-toggle');
  const closed = (await pill.boundingBox())!.width;
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect.poll(async () => (await pill.boundingBox())!.width).toBeGreaterThan(closed + 20);
  await page.getByLabel('Event date and time', { exact: true }).fill('2025-07-09T14:30');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#event-date-field')).toHaveAttribute('inert', '');
  await toggle.click();
  await expect(page.getByLabel('Event date and time', { exact: true })).toHaveValue(
    '2025-07-09T14:30',
  );
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await pill.evaluate((el) => getComputedStyle(el).transitionDuration)).toBe('0s');
  await page.screenshot({ path: 'docs/screenshots/date-pill-open.png', fullPage: true });
});

test('capture photos are compact removable thumbnails, with three columns at 390px and two at 360px', async ({
  page,
}) => {
  await page.goto(base + 'me/');
  await expect(page.getByRole('button', { name: 'Save Moment', exact: true })).toBeEnabled();
  const png = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 80;
    c.height = 60;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#8ab8a4';
    ctx.fillRect(0, 0, 80, 60);
    return c.toDataURL().split(',')[1];
  });
  const picker = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Gallery', exact: true }).click();
  await (
    await picker
  ).setFiles(
    [1, 2, 3].map((i) => ({
      name: `photo-${i}.png`,
      mimeType: 'image/png',
      buffer: Buffer.from(png, 'base64'),
    })),
  );
  await expect(page.locator('.photo-tile img')).toHaveCount(3);
  await expect(page.locator('.photo-tile .file-caption')).toHaveCount(0);
  await expect(
    page.locator('.photo-tile').getByRole('button', { name: 'Download', exact: true }),
  ).toHaveCount(0);
  let positions = await page
    .locator('.photo-tile')
    .evaluateAll((els) =>
      els.map((el) => ({ x: el.getBoundingClientRect().x, y: el.getBoundingClientRect().y })),
    );
  expect(new Set(positions.map((p) => Math.round(p.y))).size).toBe(1);
  await page.screenshot({ path: 'docs/screenshots/capture-thumbnails.png', fullPage: true });
  await page.setViewportSize({ width: 360, height: 780 });
  await expect
    .poll(
      async () =>
        new Set(
          await page
            .locator('.photo-tile')
            .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().y))),
        ).size,
    )
    .toBe(2);
  await page.getByRole('button', { name: 'Remove photo-2.jpg', exact: true }).click();
  await expect(page.locator('.photo-tile img')).toHaveCount(2);
  await page.reload();
  await expect(page.locator('.photo-tile img')).toHaveCount(2);
});
