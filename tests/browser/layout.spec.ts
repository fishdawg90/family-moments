import { test, expect } from '@playwright/test';

test('capture stays at the top and Save stays at the visible bottom while supporting content scrolls', async ({
  page,
}) => {
  await page.goto('http://127.0.0.1:5187/family-moments/giulia/');
  const save = page.getByRole('button', { name: 'Save Moment', exact: true });
  const text = page.getByLabel('What happened today?', { exact: true });
  const middle = page.getByRole('region', { name: 'Attachments, tags and recent moments' });
  await expect(save).toBeEnabled();
  for (const size of [
    { width: 360, height: 780 },
    { width: 430, height: 900 },
    { width: 390, height: 420 },
  ]) {
    await page.setViewportSize(size);
    await text.focus();
    await expect
      .poll(async () => {
        const box = await save.boundingBox();
        return box ? size.height - box.y - box.height : -1;
      })
      .toBeGreaterThanOrEqual(0);
    const button = (await save.boundingBox())!;
    expect(size.height - button.y - button.height).toBeLessThan(45);
    const top = (await text.boundingBox())!.y;
    const photo = page.getByRole('button', { name: 'Photo', exact: true });
    const photoTop = (await photo.boundingBox())!.y;
    await expect(photo).toBeInViewport();
    await middle.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await expect(page.getByText('Your little moments will gather here.')).toBeInViewport();
    expect((await text.boundingBox())!.y).toBeCloseTo(top, 0);
    expect((await photo.boundingBox())!.y).toBeCloseTo(photoTop, 0);
    await expect(page.getByRole('button', { name: 'Video', exact: true })).toBeInViewport();
    await expect(page.getByRole('button', { name: 'Gallery', exact: true })).toBeInViewport();
    await expect(page.getByRole('button', { name: 'Voice clip', exact: true })).toBeInViewport();
    await expect(page.getByRole('button', { name: 'Files', exact: true })).toBeInViewport();
    expect((await save.boundingBox())!.y).toBeCloseTo(button.y, 0);
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(
      true,
    );
  }
  await text.fill('A memory with the keyboard open');
  await save.click();
  await expect(text).toHaveValue('');
  await expect(
    page.getByRole('status').filter({ hasText: 'Saved on this phone' }),
  ).toBeInViewport();
});
