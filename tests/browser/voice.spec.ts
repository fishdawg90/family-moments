import { test, expect } from '@playwright/test';

test('direct voice recording waits safely for microphone permission and recovers from denial', async ({
  page,
}) => {
  await page.goto('http://127.0.0.1:5187/family-moments/nina/');
  const text = page.getByLabel('What happened today?', { exact: true });
  await text.fill('Keep my thought if permission is denied');
  await page.evaluate(() => {
    navigator.mediaDevices.getUserMedia = () =>
      new Promise((_resolve, reject) => {
        (window as unknown as { denyMic: () => void }).denyMic = () =>
          reject(new DOMException('Microphone permission denied', 'NotAllowedError'));
      });
  });
  await page.getByRole('button', { name: 'Voice clip', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Microphone…', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Save Moment', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Gallery', exact: true })).toBeDisabled();
  await page.evaluate(() => (window as unknown as { denyMic: () => void }).denyMic());
  await expect(page.getByRole('alert')).toContainText('Microphone permission denied');
  await expect(page.getByRole('button', { name: 'Voice clip', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Save Moment', exact: true })).toBeEnabled();
  await expect(text).toHaveValue('Keep my thought if permission is denied');
  await expect(page.getByRole('button', { name: 'Choose existing clip', exact: true })).toHaveCount(
    0,
  );
});

test('existing voice clips save offline, are identifiable in Recent and remain playable after reload', async ({
  page,
  context,
}) => {
  // A valid short silent PCM WAV, generated entirely for this isolated test.
  const wav = Buffer.alloc(44 + 8000);
  wav.write('RIFF');
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(16000, 24);
  wav.writeUInt32LE(32000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(8000, 40);
  await page.goto('http://127.0.0.1:5187/family-moments/nina/');
  await expect(page.getByRole('button', { name: 'Save Moment', exact: true })).toBeEnabled();
  await context.setOffline(true);
  const choice = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Files', exact: true }).click();
  const picker = await choice;
  expect(await picker.element().getAttribute('accept')).toContain('audio/*');
  expect(await picker.element().getAttribute('capture')).toBeNull();
  await picker.setFiles([
    { name: 'first-words.wav', mimeType: 'audio/wav', buffer: wav },
    { name: 'a-little-giggle.wav', mimeType: 'audio/wav', buffer: wav },
  ]);
  await expect(page.locator('.attachment-card audio')).toHaveCount(2);
  await page.getByRole('button', { name: 'Save Moment', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved on this phone' })).toBeVisible();
  await context.setOffline(false);
  await page.reload();
  await page.getByRole('button', { name: 'See recent' }).click();
  await expect(page.getByText('2 voice clips', { exact: true })).toBeVisible();
  await page.getByText('A voice to remember', { exact: true }).click();
  const player = page
    .locator('.moment-detail')
    .getByLabel('Voice clip: first-words.wav', { exact: true });
  await expect(player).toBeVisible();
  await expect
    .poll(() => player.evaluate((audio: HTMLAudioElement) => audio.readyState))
    .toBeGreaterThanOrEqual(1);
  await page.getByRole('button', { name: 'Edit moment', exact: true }).click();
  await page.getByLabel('What happened today?', { exact: true }).fill('Nina’s little giggles');
  await page.getByRole('button', { name: 'Remove a-little-giggle.wav', exact: true }).click();
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await page.getByRole('button', { name: 'See recent' }).click();
  await expect(page.getByText('1 voice clip', { exact: true })).toBeVisible();
  await expect(page.getByText('2 voice clips', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Nina’s little giggles', { exact: true })).toBeVisible();
});
