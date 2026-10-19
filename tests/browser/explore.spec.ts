import { expect, test } from '@playwright/test';
import { sampleMoments } from '../../src/explore-data';
const base = 'http://127.0.0.1:5187/family-moments/giulia/';

test('a larger isolated collection pages without loading lifetime media or exposing deleted and other-profile records', async ({
  page,
}) => {
  const templates = sampleMoments('giulia');
  const memories = Array.from({ length: 72 }, (_, i) => ({
    ...templates[i % 12],
    id: `fixture-${i}`,
    text: `Test memory ${i}`,
    attachments: [],
    eventAt: new Date(Date.UTC(2025, 0, i + 1, 12)).toISOString(),
  }));
  memories.push(
    { ...memories[0], id: 'other-profile', profileId: 'nina', text: 'Private to another profile' },
    {
      ...memories[0],
      id: 'deleted-example',
      text: 'Deleted example',
      deletedAt: new Date().toISOString(),
    },
  );
  await page.goto(base);
  await expect(page.getByRole('button', { name: 'Save Moment', exact: true })).toBeEnabled();
  await page.evaluate(async (records) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('family-moments', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('moments', 'readwrite');
      for (const value of records)
        tx.objectStore('moments').put({
          uid: 'local-test',
          id: value.id,
          value,
          baseRevision: 1,
          opId: value.id,
          status: 'synced',
          error: '',
          conflict: null,
        });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, memories);
  await page.reload();
  await page.getByRole('button', { name: 'Explore moments', exact: true }).click();
  await expect(
    page.getByText('72 saved moments available on this phone', { exact: false }),
  ).toBeVisible();
  await page.locator('.explore-choice').filter({ hasText: 'Scrapbook' }).click();
  await expect(page.locator('.memory-scrap')).toHaveCount(24);
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(page.locator('.memory-scrap')).toHaveCount(12);
  await page.getByRole('button', { name: 'Load older moments', exact: true }).click();
  await expect(page.locator('.memory-scrap')).toHaveCount(24);
  await expect(page.getByRole('button', { name: 'Next page', exact: true })).toBeDisabled();
  await expect(page.getByText('Private to another profile', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Deleted example', { exact: true })).toHaveCount(0);
});

test('all five styles work on a narrow phone with isolated samples, detail navigation and voice playback', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto(base);
  await expect(page.getByRole('button', { name: 'Save Moment', exact: true })).toBeEnabled();
  await page
    .getByLabel('What happened today?', { exact: true })
    .fill('Keep my capture while I explore');
  await page.getByRole('button', { name: 'Explore moments', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Open your little world', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.explore-choice')).toHaveCount(5);
  await page.getByRole('checkbox', { name: 'Try fictional sample memories' }).check();
  await expect(page.getByText(/Sample mode · fictional memories/)).toBeVisible();
  await page.screenshot({ path: 'docs/screenshots/explore-choices.png', fullPage: true });
  const selectors = {
    Scrapbook: '.memory-scrap',
    'Night Sky': '.memory-star',
    'Story River': '.river-memory',
  };
  for (const [name, selector] of Object.entries(selectors)) {
    await page.locator('.explore-choice').filter({ hasText: name }).click();
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
    await expect(page.locator(selector)).toHaveCount(12);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    if (name === 'Night Sky') {
      await expect(page.locator('.constellation line').first()).toBeAttached();
      await page.getByRole('button', { name: /First word ·/ }).click();
      await expect(page.locator('.memory-star')).toHaveCount(2);
    }
    await page
      .locator(
        name === 'Scrapbook'
          ? '.scrapbook-board'
          : name === 'Night Sky'
            ? '.night-sky'
            : '.story-river',
      )
      .screenshot({
        path: `docs/screenshots/explore-${name.toLowerCase().replaceAll(' ', '-')}.png`,
      });
    await page.locator(selector).first().click();
    await expect(page.getByRole('article', { name: 'Memory details' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Edit this moment' })).toHaveCount(0);
    await page.goBack();
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
    if (name === 'Night Sky') await expect(page.locator('.memory-star')).toHaveCount(2);
    await page.getByRole('button', { name: 'All five views', exact: true }).click();
  }
  await page.locator('.explore-choice').filter({ hasText: 'Listening Room' }).click();
  await expect(page.locator('.record-list li')).toHaveCount(3);
  await page
    .locator('.listening-room')
    .screenshot({ path: 'docs/screenshots/explore-listening-room.png' });
  const player = page.getByLabel('Sample listening room player');
  await player.evaluate((el: HTMLAudioElement) => el.play());
  await expect
    .poll(() => player.evaluate((el: HTMLAudioElement) => el.duration))
    .toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Open the whole memory' }).click();
  await expect(page.getByLabel('Generated sample sound')).toBeVisible();
  expect(await player.evaluate((el: HTMLAudioElement) => el.paused)).toBe(true);
  await page.goBack();
  await page.getByRole('button', { name: 'All five views', exact: true }).click();
  await page.locator('.explore-choice').filter({ hasText: 'Lucky Dip' }).click();
  await page.getByRole('button', { name: 'Pick a memory', exact: true }).click();
  await page.getByRole('button', { name: 'Unfold this memory', exact: true }).click();
  const first = await page.locator('.folded-memory > p').innerText();
  await page.locator('.lucky-room').screenshot({ path: 'docs/screenshots/explore-lucky-dip.png' });
  await page.getByRole('button', { name: 'Open this memory', exact: true }).click();
  await page.goBack();
  await expect(page.locator('.folded-memory > p')).toHaveText(first);
  await page.getByRole('button', { name: 'Pick another memory', exact: true }).click();
  await page.getByRole('button', { name: 'Unfold this memory', exact: true }).click();
  await expect(page.locator('.folded-memory > p')).not.toHaveText(first);
  await page.getByRole('button', { name: 'All five views', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Try fictional sample memories' }).uncheck();
  await expect(
    page.getByText('0 saved moments available on this phone', { exact: false }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Back to capture', exact: true }).click();
  await expect(page.getByLabel('What happened today?', { exact: true })).toHaveValue(
    'Keep my capture while I explore',
  );
});

test('real moments appear in every appropriate view; empty voice library is honest and profile data stays separate', async ({
  page,
}) => {
  await page.goto(base);
  await page.getByLabel('What happened today?', { exact: true }).fill('One real small memory');
  await page.getByRole('button', { name: 'Save Moment', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved on this phone' })).toBeVisible();
  await page.getByRole('button', { name: 'Explore moments', exact: true }).click();
  await page.locator('.explore-choice').filter({ hasText: 'Scrapbook' }).click();
  await page.getByText('One real small memory', { exact: true }).click();
  await page.getByRole('button', { name: 'Edit this moment', exact: true }).click();
  await expect(page.getByLabel('What happened today?', { exact: true })).toHaveValue(
    'One real small memory',
  );
  await page.getByRole('button', { name: 'Explore moments', exact: true }).click();
  await page.locator('.explore-choice').filter({ hasText: 'Listening Room' }).click();
  await expect(page.getByRole('heading', { name: 'A place for their voices.' })).toBeVisible();
  await page.getByRole('button', { name: 'Read a quiet memory instead' }).click();
  await expect(page.getByRole('article', { name: 'Memory details' })).toContainText(
    'One real small memory',
  );
  await page.goto('http://127.0.0.1:5187/family-moments/nina/');
  await page.getByRole('button', { name: 'Explore moments', exact: true }).click();
  await page.locator('.explore-choice').filter({ hasText: 'Story River' }).click();
  await expect(
    page.getByRole('heading', { name: 'Your world starts with one little moment.' }),
  ).toBeVisible();
  await expect(page.getByText('One real small memory', { exact: true })).toHaveCount(0);
});
