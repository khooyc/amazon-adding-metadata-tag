const fs = require('node:fs/promises');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'web');
const output = path.join(root, 'website-dist');
const humanRoot = path.join(root, 'node_modules', '@vladmandic', 'human');

async function copy(sourcePath, destinationPath) {
  await fs.mkdir(path.dirname(destinationPath), { recursive: true });
  await fs.copyFile(sourcePath, destinationPath);
}

async function build() {
  await fs.rm(output, { recursive: true, force: true });
  await fs.cp(source, output, { recursive: true });
  await copy(path.join(humanRoot, 'dist', 'human.js'), path.join(output, 'vendor', 'human.js'));
  for (const name of ['blazeface.json', 'blazeface.bin', 'movenet-lightning.json', 'movenet-lightning.bin']) {
    await copy(path.join(humanRoot, 'models', name), path.join(output, 'models', name));
  }
  await copy(path.join(root, 'src', 'assets', 'logo.png'), path.join(output, 'assets', 'logo.png'));
  console.log(`Website built at ${output}`);
}

build().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
