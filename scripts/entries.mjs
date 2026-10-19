import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
const base = '/family-moments/';
const profiles = JSON.parse(
  await readFile(new URL('../src/profiles.json', import.meta.url), 'utf8'),
).map((p) => [p.id, p.name, p.short, p.accent]);
// Tiny dependency-free PNG encoder for installable 192/512px maskable profile icons.
const crc32 = (b) => {
  let c = 0xffffffff;
  for (const x of b) {
    c ^= x;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (name, data) => {
  const t = Buffer.from(name),
    len = Buffer.alloc(4),
    crc = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
};
function icon(size, color, index) {
  const rgb = color.match(/[a-f0-9]{2}/g).map((v) => parseInt(v, 16)),
    raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const p = y * (size * 4 + 1) + 1 + x * 4,
        dx = (x - size / 2) / size,
        dy = (y - size / 2) / size;
      const symbol =
        index === 0
          ? Math.hypot(dx, dy) < 0.08 ||
            Array.from(
              { length: 6 },
              (_, k) =>
                Math.hypot(
                  dx - 0.15 * Math.cos((k * Math.PI) / 3),
                  dy - 0.15 * Math.sin((k * Math.PI) / 3),
                ) < 0.105,
            ).some(Boolean)
          : index === 1
            ? Math.hypot(dx, dy) < 0.16 ||
              (Math.hypot(dx, dy) < 0.27 &&
                Math.hypot(dx, dy) > 0.205 &&
                Math.abs(Math.sin(Math.atan2(dy, dx) * 8)) < 0.3)
            : (dx + 0.025) ** 2 / 0.025 + (dy + 0.035) ** 2 / 0.055 < 1 && dy < dx + 0.1;
      for (let c = 0; c < 3; c++) raw[p + c] = symbol ? 250 : rgb[c];
      raw[p + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
const html = await readFile('dist/index.html', 'utf8');
for (const [index, [id, name, short, color]] of profiles.entries()) {
  await mkdir(`dist/${id}`, { recursive: true });
  await writeFile(
    `dist/${id}/index.html`,
    html
      .replace(/<title>.*?<\/title>/, `<title>${name}</title>`)
      .replace(
        /href="\/family-moments\/giulia\/manifest.webmanifest"/,
        `href="${base}${id}/manifest.webmanifest"`,
      )
      .replace(/content="#95624f"/, `content="${color}"`),
  );
  for (const size of [192, 512])
    await writeFile(`dist/${id}/icon-${size}.png`, icon(size, color, index));
  await writeFile(
    `dist/${id}/manifest.webmanifest`,
    JSON.stringify(
      {
        id: `${base}${id}/`,
        name,
        short_name: short,
        start_url: `${base}${id}/`,
        scope: `${base}${id}/`,
        display: 'standalone',
        background_color: '#faf7f2',
        theme_color: color,
        icons: [192, 512].map((size) => ({
          src: `${base}${id}/icon-${size}.png`,
          sizes: `${size}x${size}`,
          type: 'image/png',
          purpose: 'any maskable',
        })),
      },
      null,
      2,
    ),
  );
}
await writeFile('dist/robots.txt', 'User-agent: *\nDisallow: /family-moments/\n');
const files = [];
async function walk(dir, prefix = '') {
  for (const f of await readdir(dir, { withFileTypes: true })) {
    if (f.isDirectory()) await walk(`${dir}/${f.name}`, `${prefix}${f.name}/`);
    else if (f.name !== 'sw.js') files.push(prefix + f.name);
  }
}
await walk('dist');
const version = createHash('sha256');
for (const f of files.sort()) version.update(await readFile(`dist/${f}`));
const shell = [...files, ...profiles.map((p) => `${p[0]}/`), ''];
const sw = await readFile('public/sw.js', 'utf8');
await writeFile(
  'dist/sw.js',
  sw
    .replace('__BUILD_ID__', version.digest('hex').slice(0, 16))
    .replace('__PRECACHE__', JSON.stringify(shell)),
);
