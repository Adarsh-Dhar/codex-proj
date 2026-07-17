import { requestEvmAccounts } from './scaffold/web3-evm-provider.js';
const connectBtn = document.getElementById('connectWallet');
const statusDiv = document.getElementById('status');
connectBtn.addEventListener('click', async () => {
  try {
    const accounts = await requestEvmAccounts();
    if (accounts && accounts.length > 0) {
      connectBtn.textContent = 'Wallet Connected';
      connectBtn.disabled = true;
    } else {
      connectBtn.textContent = 'Connect Wallet';
      connectBtn.disabled = false;
    }
  } catch (err) {
    connectBtn.textContent = 'Connect Wallet';
    connectBtn.disabled = false;
    window.alert('Failed to connect wallet.');
  }
});
function updateStatus() {
  chrome.storage.local.get('apiStatus', result => {
    if (result.apiStatus) {
      statusDiv.textContent = `API Status: ${result.apiStatus}`;
    } else {
      statusDiv.textContent = 'API Status: Unknown';
    }
  });
}
updateStatus();
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.apiStatus) {
    updateStatus();
  }
});
