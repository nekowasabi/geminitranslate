document.addEventListener('DOMContentLoaded', function() {
  // Display extension version
  document.getElementById('version').textContent = 'v' + browser.runtime.getManifest().version;

  // DOM elements
  const apiKeyInput = document.getElementById('apiKey');
  const saveApiKeyButton = document.getElementById('saveApiKey');
  const apiKeySavedMessage = document.getElementById('apiKeySaved');
  const modelSelect = document.getElementById('modelSelect');
  const customModelInput = document.getElementById('customModel');
  const providerInput = document.getElementById('providerInput');
  const testConnectionButton = document.getElementById('testConnection');
  const connectionStatus = document.getElementById('connectionStatus');
  const targetLanguageSelect = document.getElementById('targetLanguage');
  const translatePageButton = document.getElementById('translatePage');
  const resetPageButton = document.getElementById('resetPage');
  const fontSizeInput = document.getElementById('fontSize');
  const lineHeightInput = document.getElementById('lineHeight');
  const statusMessage = document.getElementById('status');

  // Load saved settings
  browser.storage.local.get([
    'openRouterApiKey',
    'openRouterModel',
    'openRouterProvider',
    'targetLanguage',
    'fontSize',
    'lineHeight',
    'apiKey'  // 既存Gemini APIキー（移行案内用）
  ], function(result) {
    // OpenRouter settings
    if (result.openRouterApiKey) {
      apiKeyInput.value = result.openRouterApiKey;
    }

    if (result.openRouterModel) {
      const modelExists = Array.from(modelSelect.options).some(
        opt => opt.value === result.openRouterModel
      );
      if (modelExists) {
        modelSelect.value = result.openRouterModel;
      } else {
        // Custom model
        modelSelect.value = 'custom';
        customModelInput.style.display = 'block';
        customModelInput.value = result.openRouterModel;
      }
    }

    if (result.openRouterProvider) {
      providerInput.value = result.openRouterProvider;
    }

    // 既存設定
    if (result.targetLanguage) {
      targetLanguageSelect.value = result.targetLanguage;
    }

    if (result.fontSize) {
      fontSizeInput.value = result.fontSize;
    }

    if (result.lineHeight) {
      lineHeightInput.value = result.lineHeight;
    }

    // 移行案内: 既存のGemini APIキーが存在し、OpenRouter APIキーがない場合
    if (result.apiKey && !result.openRouterApiKey) {
      showStatus('⚠️ OpenRouter APIへの移行が必要です。新しいAPIキーを設定してください。', 'info', 10000);
    }
  });

  // Add input focus effects
  apiKeyInput.addEventListener('focus', function() {
    this.parentElement.querySelector('label').style.color = '#8E54E9';
  });
  
  apiKeyInput.addEventListener('blur', function() {
    this.parentElement.querySelector('label').style.color = '#4a5568';
  });
  
  targetLanguageSelect.addEventListener('focus', function() {
    this.parentElement.querySelector('label').style.color = '#8E54E9';
  });
  
  targetLanguageSelect.addEventListener('blur', function() {
    this.parentElement.querySelector('label').style.color = '#4a5568';
  });

  fontSizeInput.addEventListener('focus', function() {
    this.parentElement.querySelector('label').style.color = '#8E54E9';
  });
  
  fontSizeInput.addEventListener('blur', function() {
    this.parentElement.querySelector('label').style.color = '#4a5568';
  });

  lineHeightInput.addEventListener('focus', function() {
    this.parentElement.querySelector('label').style.color = '#8E54E9';
  });
  
  lineHeightInput.addEventListener('blur', function() {
    this.parentElement.querySelector('label').style.color = '#4a5568';
  });
  
  // Save font size when changed
  fontSizeInput.addEventListener('change', function() {
    const fontSize = parseInt(this.value, 10);
    if (fontSize >= 8 && fontSize <= 32) {
      browser.storage.local.set({ fontSize: fontSize });
    } else {
      this.value = fontSize < 8 ? 8 : 32;
      browser.storage.local.set({ fontSize: parseInt(this.value, 10) });
    }
  });

  // Save line height when changed
  lineHeightInput.addEventListener('change', function() {
    const lineHeight = parseInt(this.value, 10);
    if (lineHeight >= 0 && lineHeight <= 20) {
      browser.storage.local.set({ lineHeight: lineHeight });
    } else {
      this.value = lineHeight < 0 ? 0 : 20;
      browser.storage.local.set({ lineHeight: parseInt(this.value, 10) });
    }
  });

  // Model selection change handler
  modelSelect.addEventListener('change', function() {
    if (this.value === 'custom') {
      customModelInput.style.display = 'block';
    } else {
      customModelInput.style.display = 'none';
      customModelInput.value = '';
    }
  });

  // Save API key with animation
  saveApiKeyButton.addEventListener('click', function() {
    const apiKey = apiKeyInput.value.trim();
    const model = modelSelect.value === 'custom'
      ? customModelInput.value.trim()
      : modelSelect.value;
    const provider = providerInput.value.trim() || null;

    if (apiKey && model) {
      browser.storage.local.set({
        openRouterApiKey: apiKey,
        openRouterModel: model,
        openRouterProvider: provider
      }, function() {
        apiKeySavedMessage.classList.remove('hidden');
        apiKeySavedMessage.style.transform = 'translateY(0)';
        apiKeySavedMessage.style.opacity = '1';

        setTimeout(() => {
          apiKeySavedMessage.style.opacity = '0';
          apiKeySavedMessage.style.transform = 'translateY(-10px)';
          setTimeout(() => {
            apiKeySavedMessage.classList.add('hidden');
          }, 300);
        }, 3000);
      });
    } else {
      showStatus('Please enter a valid API key and select a model', 'error');
    }
  });

  // Test connection
  testConnectionButton.addEventListener('click', async function() {
    const apiKey = apiKeyInput.value.trim();
    const model = modelSelect.value === 'custom'
      ? customModelInput.value.trim()
      : modelSelect.value;
    const provider = providerInput.value.trim() || null;

    if (!apiKey || !model) {
      showConnectionStatus('Please enter API key and select model first', 'error');
      return;
    }

    testConnectionButton.disabled = true;
    testConnectionButton.textContent = 'Testing...';
    showConnectionStatus('Connecting to OpenRouter...', 'info');

    try {
      // Send test connection request to background script
      const result = await browser.runtime.sendMessage({
        action: 'testConnection',
        apiKey: apiKey,
        model: model,
        provider: provider
      });

      if (result.success) {
        showConnectionStatus('✓ ' + result.message, 'success');
      } else {
        showConnectionStatus('✗ ' + result.error, 'error');
      }
    } catch (error) {
      showConnectionStatus('✗ Connection failed: ' + error.message, 'error');
    } finally {
      testConnectionButton.disabled = false;
      testConnectionButton.textContent = 'Test Connection';
    }
  });

  function showConnectionStatus(message, type) {
    connectionStatus.textContent = message;
    connectionStatus.classList.remove('hidden');
    connectionStatus.style.opacity = '1';

    if (type === 'error') {
      connectionStatus.style.background = 'linear-gradient(90deg, #f8d7da, #f5c6cb)';
      connectionStatus.style.color = '#721c24';
    } else if (type === 'success') {
      connectionStatus.style.background = 'linear-gradient(90deg, #d4edda, #c3e6cb)';
      connectionStatus.style.color = '#155724';
    } else {
      connectionStatus.style.background = 'linear-gradient(90deg, #d1ecf1, #bee5eb)';
      connectionStatus.style.color = '#0c5460';
    }

    setTimeout(() => {
      connectionStatus.style.opacity = '0';
      setTimeout(() => {
        connectionStatus.classList.add('hidden');
      }, 300);
    }, 5000);
  }

  // Save target language when changed
  targetLanguageSelect.addEventListener('change', function() {
    browser.storage.local.set({ targetLanguage: targetLanguageSelect.value });
  });

  // Translate page with improved UX
  translatePageButton.addEventListener('click', function() {
    translatePageButton.disabled = true;
    translatePageButton.innerHTML = '<span>Translating...</span>';

    browser.storage.local.get(['openRouterApiKey', 'targetLanguage', 'fontSize', 'lineHeight'], function(result) {
      if (!result.openRouterApiKey) {
        showStatus('Please enter and save your OpenRouter API key first', 'error');
        translatePageButton.disabled = false;
        translatePageButton.textContent = 'Translate Page';
        return;
      }

      const targetLanguage = result.targetLanguage || 'tr';
      const fontSize = result.fontSize || 16;
      const lineHeight = result.lineHeight || 4;
      
      browser.tabs.query({ active: true, currentWindow: true }, function(tabs) {
        browser.tabs.sendMessage(
          tabs[0].id,
          { 
            action: 'translate', 
            targetLanguage: targetLanguage,
            fontSize: fontSize,
            lineHeight: lineHeight
          }
        ).then(response => {
          if (response && response.status === 'started') {
            showStatus('Translation in progress...', 'info');
            
            // Re-enable button after a delay
            setTimeout(() => {
              translatePageButton.disabled = false;
              translatePageButton.textContent = 'Translate Page';
            }, 3000);
          }
        }).catch(_error => {
          showStatus('Error: Could not connect to page', 'error');
          translatePageButton.disabled = false;
          translatePageButton.textContent = 'Translate Page';
        });
      });
    });
  });

  // Reset page to original with improved UX
  resetPageButton.addEventListener('click', function() {
    resetPageButton.disabled = true;
    resetPageButton.innerHTML = '<span>Resetting...</span>';
    
    browser.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      browser.tabs.sendMessage(
        tabs[0].id,
        { action: 'reset' }
      ).then(response => {
        if (response && response.status === 'reset') {
          showStatus('Page reset to original', 'info');
        }
        
        // Re-enable button after a delay
        setTimeout(() => {
          resetPageButton.disabled = false;
          resetPageButton.textContent = 'Reset to Original';
        }, 1000);
      }).catch(_error => {
        showStatus('Error: Could not connect to page', 'error');
        resetPageButton.disabled = false;
        resetPageButton.textContent = 'Reset to Original';
      });
    });
  });

  // Enhanced status message display
  function showStatus(message, type, duration = 3000) {
    statusMessage.textContent = message;
    statusMessage.classList.remove('hidden');
    statusMessage.style.transform = 'translateY(0)';
    statusMessage.style.opacity = '1';

    if (type === 'error') {
      statusMessage.style.background = 'linear-gradient(90deg, #f8d7da, #f5c6cb)';
      statusMessage.style.color = '#721c24';
      statusMessage.style.boxShadow = '0 2px 5px rgba(244, 67, 54, 0.2)';
    } else {
      statusMessage.style.background = 'linear-gradient(90deg, #d1ecf1, #bee5eb)';
      statusMessage.style.color = '#0c5460';
      statusMessage.style.boxShadow = '0 2px 5px rgba(0, 123, 255, 0.2)';
    }

    setTimeout(() => {
      statusMessage.style.opacity = '0';
      statusMessage.style.transform = 'translateY(-10px)';
      setTimeout(() => {
        statusMessage.classList.add('hidden');
      }, 300);
    }, duration);
  }
});""