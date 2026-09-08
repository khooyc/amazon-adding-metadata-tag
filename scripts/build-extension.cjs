const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');

const root = path.resolve(__dirname, '..');
const website = path.join(root, 'website-dist');
const source = path.join(root, 'extension');
const output = path.join(root, 'extension-dist');

async function build() {
  await fs.rm(output, { recursive: true, force: true });
  await fs.cp(website, output, { recursive: true });
  await Promise.all([
    fs.rm(path.join(output, 'manifest.webmanifest'), { force: true }),
    fs.rm(path.join(output, 'service-worker.js'), { force: true }),
  ]);
  await fs.copyFile(path.join(source, 'manifest.json'), path.join(output, 'manifest.json'));
  await fs.copyFile(path.join(source, 'background.js'), path.join(output, 'background.js'));
  await fs.copyFile(path.join(source, 'platform-adapter.js'), path.join(output, 'platform-adapter.js'));

  const htmlPath = path.join(output, 'index.html');
  const html = (await fs.readFile(htmlPath, 'utf8'))
    .replace('Private browser edition', 'Private Chrome extension')
    .replace(/\s*<link rel="manifest" href="manifest\.webmanifest">/, '')
    .replace(/\s*<button id="install-app"[\s\S]*?<\/button>/, '<button id="install-app" type="button" hidden></button>');
  await fs.writeFile(htmlPath, html, 'utf8');

  for (const size of [16, 32, 48, 128]) {
    await sharp(path.join(root, 'src', 'assets', 'logo.png'))
      .resize(size, size, { fit: 'contain' })
      .png()
      .toFile(path.join(output, 'assets', `icon-${size}.png`));
  }
  console.log(`Chrome extension built at ${output}`);
}

build().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
