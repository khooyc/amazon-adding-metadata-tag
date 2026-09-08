(() => {
  const liveUrls = new Map();

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
    if (!window.showDirectoryPicker) throw new Error('Folder saving is not available in this Chrome version. Select Download copies instead.');
    return window.showDirectoryPicker({ mode: 'readwrite' });
  }

  function releaseWhenFinished(downloadId, url) {
    liveUrls.set(downloadId, url);
    const listener = (delta) => {
      if (delta.id !== downloadId || !delta.state || !['complete', 'interrupted'].includes(delta.state.current)) return;
      URL.revokeObjectURL(url);
      liveUrls.delete(downloadId);
      chrome.downloads.onChanged.removeListener(listener);
    };
    chrome.downloads.onChanged.addListener(listener);
    setTimeout(() => {
      if (!liveUrls.has(downloadId)) return;
      URL.revokeObjectURL(url);
      liveUrls.delete(downloadId);
      chrome.downloads.onChanged.removeListener(listener);
    }, 5 * 60 * 1000);
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
    const url = URL.createObjectURL(blob);
    try {
      const downloadId = await chrome.downloads.download({ url, filename: name, conflictAction: 'uniquify', saveAs: false });
      releaseWhenFinished(downloadId, url);
      return name;
    } catch (error) {
      URL.revokeObjectURL(url);
      throw error;
    }
  }

  window.mediaSaveAdapter = Object.freeze({ kind: 'extension', supportsFolder: Boolean(window.showDirectoryPicker), prepare, save });
})();
