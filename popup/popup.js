document.addEventListener('DOMContentLoaded', function() {
  const apiKeyInput = document.getElementById('apiKey');
  const saveApiKeyButton = document.getElementById('saveApiKey');
  const apiKeySavedMessage = document.getElementById('apiKeySaved');
  const targetLanguageSelect = document.getElementById('targetLanguage');
  const translatePageButton = document.getElementById('translatePage');
  const resetPageButton = document.getElementById('resetPage');
  const statusMessage = document.getElementById('status');

  // Load saved API key and target language
  browser.storage.local.get(['apiKey', 'targetLanguage'], function(result) {
    if (result.apiKey) {
      apiKeyInput.value = result.apiKey;
    }
    
    if (result.targetLanguage) {
      targetLanguageSelect.value = result.targetLanguage;
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

  // Save API key with animation
  saveApiKeyButton.addEventListener('click', function() {
    const apiKey = apiKeyInput.value.trim();
    
    if (apiKey) {
      browser.storage.local.set({ apiKey: apiKey }, function() {
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
      showStatus('Please enter a valid API key', 'error');
    }
  });

  // Save target language when changed
  targetLanguageSelect.addEventListener('change', function() {
    browser.storage.local.set({ targetLanguage: targetLanguageSelect.value });
  });

  // Translate page with improved UX
  translatePageButton.addEventListener('click', function() {
    translatePageButton.disabled = true;
    translatePageButton.innerHTML = '<span>Translating...</span>';
    
    browser.storage.local.get(['apiKey', 'targetLanguage'], function(result) {
      if (!result.apiKey) {
        showStatus('Please enter and save your API key first', 'error');
        translatePageButton.disabled = false;
        translatePageButton.textContent = 'Translate Page';
        return;
      }

      const targetLanguage = result.targetLanguage || 'tr';
      
      browser.tabs.query({ active: true, currentWindow: true }, function(tabs) {
        browser.tabs.sendMessage(
          tabs[0].id,
          { 
            action: 'translate', 
            targetLanguage: targetLanguage 
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
        }).catch(error => {
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
      }).catch(error => {
        showStatus('Error: Could not connect to page', 'error');
        resetPageButton.disabled = false;
        resetPageButton.textContent = 'Reset to Original';
      });
    });
  });

  // Enhanced status message display
  function showStatus(message, type) {
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
    }, 3000);
  }
});""