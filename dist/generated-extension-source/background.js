const API_URL = 'https://api.example.com/status';
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('fetchApiStatus', {
    periodInMinutes: 5
  });
  fetchAndStoreStatus();
});
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'fetchApiStatus') {
    fetchAndStoreStatus();
  }
});
async function fetchAndStoreStatus() {
  try {
    const response = await fetch(API_URL);
    if (!response.ok) throw new Error('Network response was not ok');
    const status = await response.text();
    chrome.storage.local.set({
      apiStatus: status
    });
  } catch (err) {
    chrome.storage.local.set({
      apiStatus: 'Error fetching status'
    });
  }
}
