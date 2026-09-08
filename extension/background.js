chrome.action.onClicked.addListener(async () => {
  const workspaceUrl = chrome.runtime.getURL('index.html');
  const contexts = await chrome.runtime.getContexts({ contextTypes: ['TAB'], documentUrls: [workspaceUrl] });
  if (contexts.length && contexts[0].tabId !== undefined) {
    await chrome.tabs.update(contexts[0].tabId, { active: true });
    if (contexts[0].windowId !== undefined) await chrome.windows.update(contexts[0].windowId, { focused: true });
    return;
  }
  await chrome.tabs.create({ url: workspaceUrl });
});
