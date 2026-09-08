(() => {
  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }

  async function availableOutputName(directory, desiredName) {
    const dot = desiredName.lastIndexOf('.');
    const stem = dot > 0 ? desiredName.slice(0, dot) : desiredName;
    const extension = dot > 0 ? desiredName.slice(dot) : '';
    for (let suffix = 0; suffix < 10_000; suffix += 1) {
      const candidate = suffix ? `${stem}-${suffix + 1}${extension}` : desiredName;
      try {
        await directory.getFileHandle(candidate);
      } catch (error) {
        if (error.name === 'NotFoundError') return candidate;
        throw error;
      }
    }
    throw new Error('Could not create a unique output filename.');
  }

  async function prepare(mode) {
    if (mode !== 'folder') return null;
    if (!window.showDirectoryPicker) throw new Error('Choose-folder saving requires Chrome or Edge. Select Download copies instead.');
    return window.showDirectoryPicker({ mode: 'readwrite' });
  }

  async function save({ blob, name, mode, destination }) {
    if (mode === 'folder') {
      const availableName = await availableOutputName(destination, name);
      const handle = await destination.getFileHandle(availableName, { create: true });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return availableName;
    }
    download(blob, name);
    return name;
  }

  window.mediaSaveAdapter = Object.freeze({ kind: 'web', supportsFolder: Boolean(window.showDirectoryPicker), prepare, save });
})();
