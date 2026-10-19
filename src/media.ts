import type { Attachment } from './types';
import { rememberMedia } from './storage';
export const MB = 1024 * 1024;
export const limits = { image: 15 * MB, video: 100 * MB, audio: 25 * MB, document: 20 * MB };
const docs: Record<string, string> = {
  pdf: 'application/pdf',
  txt: 'text/plain',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};
const supported = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'audio/webm',
  'audio/ogg',
  'audio/mp4',
  'audio/mpeg',
  'audio/wav',
  ...Object.values(docs),
]);
export function fileType(file: Pick<File, 'type' | 'name' | 'size'>) {
  const mime =
    file.type.split(';')[0].toLowerCase() ||
    docs[file.name.split('.').pop()?.toLowerCase() || ''] ||
    '';
  if (!supported.has(mime))
    throw new Error(
      `${file.name}: choose a JPEG, PNG, WebP, MP4, WebM, MOV, audio, PDF, DOCX or TXT file.`,
    );
  const kind: Attachment['kind'] = mime.startsWith('image/')
    ? 'image'
    : mime.startsWith('video/')
      ? 'video'
      : mime.startsWith('audio/')
        ? 'audio'
        : 'document';
  if (!file.size) throw new Error(`${file.name} is empty.`);
  if (file.size > limits[kind])
    throw new Error(
      `${file.name} is too large. ${kind === 'video' ? 'Try a shorter clip. ' : ''}The limit is ${limits[kind] / MB} MB.`,
    );
  return { mime, kind };
}
export async function prepareFile(uid: string, file: File): Promise<Attachment> {
  let { mime, kind } = fileType(file),
    blob: Blob = file;
  if (kind === 'image') {
    // Re-encoding drops EXIF/location metadata without changing the user's original file.
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    try {
      const factor = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height)),
        canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * factor));
      canvas.height = Math.max(1, Math.round(bitmap.height * factor));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not prepare this photo.');
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('Could not prepare this photo.'))),
          'image/jpeg',
          0.86,
        ),
      );
      mime = 'image/jpeg';
    } finally {
      bitmap.close();
    }
  }
  const hash = await rememberMedia(uid, blob);
  return {
    id: crypto.randomUUID(),
    kind,
    name: (kind === 'image' ? file.name.replace(/\.[^.]+$/, '') + '.jpg' : file.name)
      .replace(/[\x00-\x1f/\\]/g, '_')
      .slice(0, 180),
    mime,
    size: blob.size,
    hash,
    path: '',
    remote: false,
  };
}
