import { test, expect } from '@playwright/test';
const base = 'http://127.0.0.1:5187/family-moments/';
test('text save, catalogue creation, keyboard selection, editing and reload recovery', async ({
  page,
}) => {
  await page.goto(base + 'giulia/');
  await expect(page.getByText('Local browser test · no cloud writes')).toBeVisible();
  await page.getByRole('button', { name: 'Save Moment', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Add a thought');
  await page.getByLabel('What happened today?', { exact: true }).fill('Giulia said butterfly 🦋');
  const input = page.getByRole('combobox', { name: 'Find or add a tag' });
  await input.fill('Funny');
  await input.press('ArrowDown');
  await input.press('Enter');
  await input.fill('New discovery');
  await page.getByRole('option', { name: '+ Create “New discovery”' }).click();
  await expect(page.getByRole('button', { name: 'New discovery', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Dismiss error' }).click();
  await page.screenshot({ path: 'docs/screenshots/capture.png', fullPage: true });
  await page.getByRole('button', { name: 'Save Moment', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved on this phone' })).toBeVisible();
  await expect(page.getByLabel('What happened today?', { exact: true })).toHaveValue('');
  await expect(page.getByText('Giulia said butterfly 🦋', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('Giulia said butterfly 🦋', { exact: true })).toBeVisible();
  await page.getByText('Giulia said butterfly 🦋', { exact: true }).click();
  await page.getByRole('button', { name: 'Edit moment', exact: true }).click();
  await page.getByLabel('What happened today?', { exact: true }).fill('Butterfly, very clearly!');
  await page.getByText('Event date', { exact: false }).first().click();
  await page.getByLabel('Event date and time').fill('2024-01-01T12:00');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Butterfly, very clearly!', { exact: true })).toBeVisible();
  await page.getByLabel('What happened today?', { exact: true }).fill('An unfinished thought');
  await page.waitForTimeout(200);
  await page.reload();
  await expect(page.getByLabel('What happened today?', { exact: true })).toHaveValue(
    'An unfinished thought',
  );
});
test('MediaRecorder audio and a generated WebM video remain playable after local save', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['microphone']);
  await page.goto(base + 'me/');
  await expect(page.getByRole('button', { name: 'Save Moment', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Voice clip', exact: true }).click();
  await expect(page.getByText(/Recording ·/)).toBeVisible();
  await page.waitForTimeout(1300);
  await page.getByRole('button', { name: /Stop 0:/ }).click();
  await expect(page.getByRole('button', { name: 'Attach recording' })).toBeVisible();
  await page.getByRole('button', { name: 'Attach recording' }).click();
  await expect(page.locator('.attachment-card audio')).toHaveCount(1);
  const video = await page.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    c.getContext('2d')!.fillRect(0, 0, 64, 64);
    const stream = c.captureStream(10),
      chunks: Blob[] = [];
    const r = new MediaRecorder(stream, { mimeType: 'video/webm' });
    r.ondataavailable = (e) => chunks.push(e.data);
    const result = new Promise<number[]>((resolve) => {
      r.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        resolve(Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer())));
      };
    });
    r.start(100);
    await new Promise((resolve) => setTimeout(resolve, 500));
    r.stop();
    return result;
  });
  const videoChoice = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Gallery', exact: true }).click();
  await (
    await videoChoice
  ).setFiles({ name: 'tiny-clip.webm', mimeType: 'video/webm', buffer: Buffer.from(video) });
  await expect(page.locator('.attachment-card video')).toHaveCount(1);
  await page.getByRole('button', { name: 'Save Moment', exact: true }).click();
  await expect(page.getByText('2 attachments · Saved locally')).toBeVisible();
  await page.reload();
  await page.getByText('A moment in pictures and sound').click();
  await expect(page.locator('.moment-detail audio')).toHaveCount(1);
  await expect(page.locator('.moment-detail video')).toHaveCount(1);
  await expect
    .poll(() =>
      page.locator('.moment-detail video').evaluate((v: HTMLVideoElement) => v.readyState),
    )
    .toBeGreaterThanOrEqual(1);
});
test('offline PDF-only and multiple attachment persistence, quota error retains capture', async ({
  page,
  context,
}) => {
  await page.goto(base + 'nina/');
  await expect(page.getByRole('button', { name: 'Save Moment', exact: true })).toBeEnabled();
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Files', exact: true }).click();
  await page.locator('input[aria-label="Choose files"]').setInputFiles({
    name: 'little-note.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\nsmall private file'),
  });
  await expect(page.locator('.file-caption').filter({ hasText: 'little-note.pdf' })).toBeVisible();
  await page.getByRole('button', { name: 'Save Moment', exact: true }).click();
  await expect(page.getByText('A moment in pictures and sound')).toBeVisible();
  await page
    .getByLabel('What happened today?', { exact: true })
    .fill('Keep this if storage is full');
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore['put']>) {
      if (this.name === 'moments') throw new DOMException('Quota exhausted', 'QuotaExceededError');
      return original.apply(this, args);
    };
  });
  await page.getByRole('button', { name: 'Save Moment', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Quota exhausted');
  await expect(page.getByLabel('What happened today?', { exact: true })).toHaveValue(
    'Keep this if storage is full',
  );
  await context.setOffline(false);
  await page.reload();
  await expect(page.getByText('A moment in pictures and sound')).toBeVisible();
  await page.getByText('A moment in pictures and sound').click();
  await expect(page.locator('.file-caption').filter({ hasText: 'little-note.pdf' })).toBeVisible();
});
test('image-only capture optimises a real PNG and shows a durable thumbnail', async ({ page }) => {
  await page.goto(base + 'me/');
  await expect(page.getByRole('button', { name: 'Save Moment', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Document', exact: true })).toHaveCount(0);
  const cameraChoice = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Photo', exact: true }).click();
  const camera = await cameraChoice;
  expect(await camera.element().getAttribute('capture')).toBe('environment');
  await camera.setFiles([]);
  const videoCaptureChoice = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Video', exact: true }).click();
  const videoCapture = await videoCaptureChoice;
  expect(await videoCapture.element().getAttribute('capture')).toBe('environment');
  await videoCapture.setFiles([]);
  const buffer = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    c.getContext('2d')!.fillRect(0, 0, 64, 64);
    return c.toDataURL().split(',')[1];
  });
  const galleryChoice = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Gallery', exact: true }).click();
  const gallery = await galleryChoice;
  expect(await gallery.element().getAttribute('capture')).toBeNull();
  expect(await gallery.element().getAttribute('accept')).toBe('image/*,video/*');
  await expect(page.locator('.attachment-source')).toHaveCount(0);
  expect(gallery.isMultiple()).toBe(true);
  await gallery.setFiles([
    { name: 'first.png', mimeType: 'image/png', buffer: Buffer.from(buffer, 'base64') },
    { name: 'second.png', mimeType: 'image/png', buffer: Buffer.from(buffer, 'base64') },
  ]);
  await expect(page.getByAltText('first.jpg')).toBeVisible();
  await expect(page.getByAltText('second.jpg')).toBeVisible();
  await page.getByRole('button', { name: 'Save Moment', exact: true }).click();
  await expect(page.getByText('2 attachments · Saved locally')).toBeVisible();
  await page.reload();
  await page.getByText('A moment in pictures and sound').click();
  await expect(page.getByAltText('first.jpg')).toBeVisible();
});
test('profile URLs preserve independent drafts and stay within a narrow viewport', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 780 });
  for (const id of ['giulia', 'nina', 'me']) {
    await page.goto(base + id + '/');
    await expect(page.getByRole('button', { name: 'Save Moment', exact: true })).toBeEnabled();
    await page.getByLabel('What happened today?', { exact: true }).fill(`draft for ${id}`);
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await page.goto(base + 'giulia/');
  await expect(page.getByLabel('What happened today?', { exact: true })).toHaveValue(
    'draft for giulia',
  );
  await expect(page.getByRole('button', { name: "Giulia's Moments", exact: true })).toBeVisible();
});
