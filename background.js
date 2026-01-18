// background.js (service worker)

chrome.runtime.onInstalled.addListener(() => {
  // Open side panel when the user clicks the extension icon.
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err) => console.warn("setPanelBehavior failed:", err));
});
