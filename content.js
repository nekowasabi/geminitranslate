(function() {
  // Store original text content for resetting
  const originalContent = new Map();
  let isTranslating = false;
  let translationInProgress = false;

  // Selection translation elements
  let selectionIcon = null;
  let selectionPopup = null;
  let lastSelectedText = '';

  // Check if dark mode is enabled
  const isDarkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  
  // Common color variables
  const bgColor = isDarkMode ? '#333' : 'white';
  const textColor = isDarkMode ? '#fff' : '#333';
  const shadowColor = isDarkMode ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.2)';

  // Create selection icon and popup if they don't exist
  function createSelectionElements() {
    if (!selectionIcon) {
      selectionIcon = document.createElement('div');
      selectionIcon.id = 'gemini-selection-icon';
      selectionIcon.style.cssText = `
        position: fixed;
        width: 30px;
        height: 30px;
        background-image: url(${browser.runtime.getURL('icons/translate-38.png')});
        background-size: contain;
        background-repeat: no-repeat;
        cursor: pointer;
        z-index: 9999;
        display: none;
        border-radius: 50%;
        background-color: white;
        padding: 3px;
        box-shadow: 0 2px 5px rgba(0,0,0,0.2);
        animation: fadeIn 0.3s ease-in-out;
        right: 20px;
        top: 50%;
        transform: translateY(-50%);
      `;
      
      if (isDarkMode) {
        selectionIcon.style.backgroundColor = '#4285f4';
        selectionIcon.style.boxShadow = '0 3px 8px rgba(255,255,255,0.3)';
      }
      
      document.body.appendChild(selectionIcon);

      selectionIcon.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        showSelectionPopup(lastSelectedText);
      });
    }

    if (!selectionPopup) {
      selectionPopup = document.createElement('div');
      selectionPopup.id = 'gemini-selection-popup';
      
      // Daha önce tanımlanmış renk değişkenlerini kullan
      selectionPopup.style.cssText = `
        position: fixed;
        top: 0;
        right: 0;
        width: 50vw;
        height: 100vh;
        background-color: ${bgColor};
        color: ${textColor};
        border-radius: 8px;
        box-shadow: 0 4px 15px ${shadowColor};
        padding: 12px;
        overflow-y: auto;
        z-index: 1000000;
        display: none;
        font-family: Arial, sans-serif;
        font-size: 20px;
      `;

      const closeButton = document.createElement('div');
      closeButton.textContent = '×';
      closeButton.style.cssText = `
        position: fixed;
        top: 10px;
        right: 20px;
        cursor: pointer;
        font-size: 24px;
        color: ${isDarkMode ? '#ccc' : '#777'};
        z-index: 1000001;
        padding: 10px;
        transition: color 0.3s ease;
      `;
      closeButton.addEventListener('click', function() {
        selectionPopup.style.display = 'none';
      });
      
      // ホバー時の色変更を追加
      closeButton.addEventListener('mouseover', function() {
        this.style.color = isDarkMode ? '#fff' : '#333';
      });
      closeButton.addEventListener('mouseout', function() {
        this.style.color = isDarkMode ? '#ccc' : '#777';
      });

      selectionPopup.appendChild(closeButton);

      const content = document.createElement('div');
      content.id = 'gemini-selection-content';
      content.style.cssText = `
        margin-top: 5px;
        white-space: pre-wrap;
        color: ${textColor};
        font-weight: normal;
        font-size: 24px;
      `;

      selectionPopup.appendChild(content);
      document.body.appendChild(selectionPopup);
    }
  }

  // Show selection icon near the selected text
  function showSelectionIcon(e) {
    if (!selectionIcon) {
      createSelectionElements();
    }
    
    const selection = window.getSelection();
    if (selection && selection.toString().trim().length > 1) {  // En az 2 karakter seçilmiş olsun
      lastSelectedText = selection.toString().trim();
      
      // Simply display the icon at its fixed position
      selectionIcon.style.display = 'block';
      selectionIcon.style.zIndex = '999999';
    }
  }

  // Hide selection icon when clicking elsewhere
  function hideSelectionElements(e) {
    // Don't hide if clicking on the icon or popup
    if (selectionIcon && (e.target === selectionIcon || 
        (selectionPopup && selectionPopup.contains(e.target)))) {
      return;
    }

    if (selectionIcon) {
      selectionIcon.style.display = 'none';
    }
    
    if (selectionPopup) {
      selectionPopup.style.display = 'none';
    }
  }

  // Show translation popup with translated content
  function showSelectionPopup(text) {
    if (!text || text.length === 0) return;
    if (!selectionPopup) {
      createSelectionElements();
    }

    // Get current target language
    browser.storage.local.get(['targetLanguage'], function(result) {
      const targetLanguage = result.targetLanguage || 'tr';

      // Show loading state
      const contentDiv = document.getElementById('gemini-selection-content');
      contentDiv.textContent = 'Translating...';
      contentDiv.style.color = isDarkMode ? '#fff' : '#333'; // Metin rengini tekrar ayarla

      // Show popup near the icon with improved positioning
      selectionPopup.style.display = 'block';
      

      // Translate the text
      browser.runtime.sendMessage({
        action: 'translateText',
        text: text,
        targetLanguage: targetLanguage
      }).then(response => {
        contentDiv.textContent = response;
      }).catch(error => {
        contentDiv.textContent = 'Translation error. Please try again.';
        console.error('Translation error:', error);
      });
    });
  }

  // Initialize selection elements
  createSelectionElements();

  // Set up event listeners for text selection with debouncing
  let selectionTimeout = null;
  
  // Mouseup event - daha güvenilir seçim tespiti
  document.addEventListener('mouseup', function(e) {
    // Önceki zamanlayıcıyı iptal et
    if (selectionTimeout) clearTimeout(selectionTimeout);
    
    // Yeni bir zamanlayıcı başlat - çoklu event tetiklemelerini engeller
    selectionTimeout = setTimeout(() => {
      const selection = window.getSelection();
      if (selection && selection.toString().trim().length > 1) {
        showSelectionIcon(e);
      }
    }, 150);
  });
  
  // Kaydırma sırasında ikonun ve popup'ın konumunu güncelle
  document.addEventListener('scroll', function() {
    if (selectionIcon && selectionIcon.style.display === 'block' && window.getSelection().toString().trim().length > 1) {
      // Keep the popup position updated if it's open
      if (selectionPopup && selectionPopup.style.display === 'block') {
        selectionPopup.style.top = '0';
        selectionPopup.style.right = '0';
      }
    }
  }, { passive: true });
  
  document.addEventListener('click', function(e) {
    // Eğer seçim icon'una veya popup'a tıklanmadıysa elemenları gizle
    if (selectionIcon && selectionPopup && 
        e.target !== selectionIcon && 
        !selectionIcon.contains(e.target) && 
        e.target !== selectionPopup && 
        !selectionPopup.contains(e.target)) {
      hideSelectionElements(e);
    }
  });

  // Listen for messages from popup
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'translate' || message.action === 'translateText') {
      if (!translationInProgress) {
        translationInProgress = true;
        translatePage(message.targetLanguage)
          .then(() => {
            translationInProgress = false;
            sendResponse({ status: 'completed' });
          })
          .catch(error => {
            translationInProgress = false;
            console.error('Translation error:', error);
            sendResponse({ status: 'error', message: error.message });
          });
      }
      return Promise.resolve({ status: 'started' });
    } else if (message.action === 'reset') {
      resetPage();
      return Promise.resolve({ status: 'reset' });
    }
    return false;
  });

  // Function to translate the page
  async function translatePage(targetLanguage) {
    // Create and show the notification
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background-color: #4285f4;
      color: white;
      padding: 12px 24px;
      border-radius: 8px;
      font-family: Arial, sans-serif;
      font-size: 14px;
      z-index: 999999;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
      animation: fadeInOut 3s ease-in-out forwards;
    `;
    notification.textContent = 'Start Translate';
    document.body.appendChild(notification);

    // Remove notification after animation
    setTimeout(() => {
      if (notification && notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 3000);

    // Set translating flag
    isTranslating = true;

    // Get all text nodes in the document - more aggressive approach
    const textNodes = getAllTextNodes(document.body);
    console.log(`Found ${textNodes.length} text nodes to translate`);

    // Group text nodes into batches to reduce API calls
    const batches = createBatches(textNodes, 800); // Reduced to 800 characters per batch for better reliability
    console.log(`Created ${batches.length} batches for translation`);

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      try {
        // Extract text from nodes
        const textsToTranslate = [];
        const nodeIndices = [];

        for (let i = 0; i < batch.length; i++) {
          const node = batch[i];
          const text = node.nodeValue.trim();

          // Skip empty nodes or nodes that contain only whitespace/numbers/single characters
          if (text && !/^\s*$/.test(text) && !/^\d+$/.test(text) && text.length > 1) {
            textsToTranslate.push(text);
            nodeIndices.push(i);

            // Store original content if not already stored
            if (!originalContent.has(node)) {
              originalContent.set(node, node.nodeValue);
            }
          }
        }

        if (textsToTranslate.length === 0) continue;

        // Combine texts with markers to identify individual texts later
        const combinedText = textsToTranslate.join('\n[SPLIT]\n');

        console.log(`Translating batch ${batchIndex + 1}/${batches.length} with ${textsToTranslate.length} text segments`);

        // Send to background script for translation
        const translatedText = await browser.runtime.sendMessage({
          action: 'translateText',
          text: combinedText,
          targetLanguage: targetLanguage
        });

        if (translatedText) {
          // Split the translated text back into individual pieces
          const translatedPieces = translatedText.split('\n[SPLIT]\n');

          // Apply translations to the original nodes
          for (let i = 0; i < translatedPieces.length; i++) {
            if (i < nodeIndices.length) {
              const nodeIndex = nodeIndices[i];
              if (nodeIndex < batch.length) {
                batch[nodeIndex].nodeValue = translatedPieces[i];
              }
            }
          }
        }
      } catch (error) {
        console.error(`Error translating batch ${batchIndex + 1}:`, error);
      }

      // Add a small delay between batches to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));

      // Every 5 batches, add a longer pause to avoid overwhelming the API
      if (batchIndex % 5 === 4) {
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    }

    // Process special elements like inputs, textareas, and buttons
    await translateSpecialElements(targetLanguage);

    // Set up MutationObserver to handle dynamic content
    setupMutationObserver(targetLanguage);

    isTranslating = false;
    console.log('Translation completed');
  }

  // Function to translate special elements like inputs, textareas, and buttons
  async function translateSpecialElements(targetLanguage) {
    // Translate input placeholders
    const inputs = document.querySelectorAll('input[placeholder], textarea[placeholder]');
    const placeholders = Array.from(inputs).map(input => {
      const placeholder = input.getAttribute('placeholder');
      if (placeholder && placeholder.trim() && placeholder.length > 1) {
        return {
          element: input,
          text: placeholder,
          attribute: 'placeholder'
        };
      }
      return null;
    }).filter(item => item !== null);

    // Translate button texts
    const buttons = document.querySelectorAll('button, input[type="button"], input[type="submit"]');
    const buttonTexts = Array.from(buttons).map(button => {
      if (button.tagName === 'BUTTON') {
        if (button.textContent && button.textContent.trim() && button.textContent.length > 1) {
          return {
            element: button,
            text: button.textContent.trim(),
            isTextContent: true
          };
        }
      } else {
        const value = button.getAttribute('value');
        if (value && value.trim() && value.length > 1) {
          return {
            element: button,
            text: value,
            attribute: 'value'
          };
        }
      }
      return null;
    }).filter(item => item !== null);

    // Translate alt texts
    const images = document.querySelectorAll('img[alt]');
    const altTexts = Array.from(images).map(img => {
      const alt = img.getAttribute('alt');
      if (alt && alt.trim() && alt.length > 1) {
        return {
          element: img,
          text: alt,
          attribute: 'alt'
        };
      }
      return null;
    }).filter(item => item !== null);

    // Combine all special elements
    const specialElements = [...placeholders, ...buttonTexts, ...altTexts];

    if (specialElements.length === 0) return;

    // Group elements into batches
    const batches = [];
    let currentBatch = [];
    let currentLength = 0;

    for (const element of specialElements) {
      const textLength = element.text.length;

      if (currentLength + textLength > 800 && currentBatch.length > 0) {
        batches.push(currentBatch);
        currentBatch = [element];
        currentLength = textLength;
      } else {
        currentBatch.push(element);
        currentLength += textLength;
      }
    }

    if (currentBatch.length > 0) {
      batches.push(currentBatch);
    }

    // Translate each batch
    for (const batch of batches) {
      try {
        const textsToTranslate = batch.map(item => item.text);

        // Combine texts with markers
        const combinedText = textsToTranslate.join('\n[SPLIT]\n');

        // Send to background script for translation
        const translatedText = await browser.runtime.sendMessage({
          action: 'translateText',
          text: combinedText,
          targetLanguage: targetLanguage
        });

        if (translatedText) {
          // Split the translated text back into individual pieces
          const translatedPieces = translatedText.split('\n[SPLIT]\n');

          // Apply translations to the elements
          for (let i = 0; i < translatedPieces.length; i++) {
            if (i < batch.length) {
              const element = batch[i];

              // Store original content for reset
              if (!originalContent.has(element.element)) {
                if (element.isTextContent) {
                  originalContent.set(element.element, element.element.textContent);
                } else {
                  originalContent.set(element.element, {
                    attribute: element.attribute,
                    value: element.element.getAttribute(element.attribute)
                  });
                }
              }

              // Apply translation
              if (element.isTextContent) {
                element.element.textContent = translatedPieces[i];
              } else {
                element.element.setAttribute(element.attribute, translatedPieces[i]);
              }
            }
          }
        }
      } catch (error) {
        console.error('Error translating special elements:', error);
      }

      // Add a small delay between batches
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  // Function to reset the page to original content
  function resetPage() {
    originalContent.forEach((originalValue, element) => {
      if (element.nodeType === Node.TEXT_NODE) {
        if (element.nodeValue) {
          element.nodeValue = originalValue;
        }
      } else if (element instanceof Element) {
        // Handle special elements
        if (typeof originalValue === 'string') {
          element.textContent = originalValue;
        } else if (originalValue && originalValue.attribute) {
          element.setAttribute(originalValue.attribute, originalValue.value);
        }
      }
    });

    // Disconnect mutation observer if it exists
    if (window.translationObserver) {
      window.translationObserver.disconnect();
      window.translationObserver = null;
    }

    console.log('Page reset to original content');
  }

  // Improved function to get all text nodes in the document
  function getAllTextNodes(node) {
    const textNodes = [];

    // Skip certain elements
    if (node.nodeType === Node.ELEMENT_NODE) {
      // Skip invisible elements, scripts, styles, etc.
      const tagName = node.tagName.toLowerCase();
      if (tagName === 'script' || tagName === 'style' || tagName === 'noscript' ||
          tagName === 'iframe' || tagName === 'code' || tagName === 'pre') {
        return textNodes;
      }

      // Check if element is hidden
      const style = window.getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden' ||
          parseFloat(style.opacity) === 0) {
        return textNodes;
      }
    }

    // If this is a text node with content, add it
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.nodeValue.trim();
      if (text) {
        textNodes.push(node);
      }
    }

    // Process child nodes
    if (node.childNodes && node.childNodes.length > 0) {
      for (let i = 0; i < node.childNodes.length; i++) {
        const childNodes = getAllTextNodes(node.childNodes[i]);
        textNodes.push(...childNodes);
      }
    }

    return textNodes;
  }

  // Function to create batches of text nodes
  function createBatches(nodes, maxChars) {
    const batches = [];
    let currentBatch = [];
    let currentLength = 0;

    for (const node of nodes) {
      const textLength = node.nodeValue.length;

      if (currentLength + textLength > maxChars && currentBatch.length > 0) {
        batches.push(currentBatch);
        currentBatch = [node];
        currentLength = textLength;
      } else {
        currentBatch.push(node);
        currentLength += textLength;
      }
    }

    if (currentBatch.length > 0) {
      batches.push(currentBatch);
    }

    return batches;
  }

  // Function to set up MutationObserver for dynamic content
  function setupMutationObserver(targetLanguage) {
    // Disconnect existing observer if it exists
    if (window.translationObserver) {
      window.translationObserver.disconnect();
    }

    // Create a new observer
    window.translationObserver = new MutationObserver((mutations) => {
      if (isTranslating) return;

      let newNodes = [];

      for (const mutation of mutations) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE || node.nodeType === Node.TEXT_NODE) {
              const textNodes = getAllTextNodes(node);
              if (textNodes.length > 0) {
                newNodes = [...newNodes, ...textNodes];
              }
            }
          }
        }
      }

      // If we found new text nodes, translate them
      if (newNodes.length > 0) {
        console.log(`MutationObserver detected ${newNodes.length} new text nodes`);
        browser.runtime.sendMessage({
          action: 'newContentDetected'
        }).then(() => {
          // Get current target language
          browser.storage.local.get(['targetLanguage'], function(result) {
            const currentTargetLanguage = result.targetLanguage || targetLanguage || 'tr';
            translateNodes(newNodes, currentTargetLanguage);
          });
        });
      }
    });

    // Start observing with a more comprehensive configuration
    window.translationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['placeholder', 'value', 'alt', 'title']
    });

    console.log('MutationObserver set up for dynamic content');
  }

  // Function to translate specific nodes
  async function translateNodes(nodes, targetLanguage) {
    if (nodes.length === 0) return;

    isTranslating = true;
    console.log(`Translating ${nodes.length} new nodes`);

    // Group nodes into batches
    const batches = createBatches(nodes, 800);

    for (const batch of batches) {
      try {
        // Extract text from nodes
        const textsToTranslate = [];
        const nodeIndices = [];

        for (let i = 0; i < batch.length; i++) {
          const node = batch[i];
          const text = node.nodeValue.trim();

          // Skip empty nodes or nodes that contain only whitespace/numbers/single characters
          if (text && !/^\s*$/.test(text) && !/^\d+$/.test(text) && text.length > 1) {
            textsToTranslate.push(text);
            nodeIndices.push(i);

            // Store original content
            if (!originalContent.has(node)) {
              originalContent.set(node, node.nodeValue);
            }
          }
        }

        if (textsToTranslate.length === 0) continue;

        // Combine texts with markers
        const combinedText = textsToTranslate.join('\n[SPLIT]\n');

        // Send to background script for translation
        const translatedText = await browser.runtime.sendMessage({
          action: 'translateText',
          text: combinedText,
          targetLanguage: targetLanguage
        });

        if (translatedText) {
          // Split the translated text back into individual pieces
          const translatedPieces = translatedText.split('\n[SPLIT]\n');

          // Apply translations to the original nodes
          for (let i = 0; i < translatedPieces.length; i++) {
            if (i < nodeIndices.length) {
              const nodeIndex = nodeIndices[i];
              if (nodeIndex < batch.length) {
                batch[nodeIndex].nodeValue = translatedPieces[i];
              }
            }
          }
        }
      } catch (error) {
        console.error('Error translating dynamic batch:', error);
      }

      // Add a small delay between batches
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    isTranslating = false;
    console.log('Dynamic content translation completed');
  }

  // İkon oluşturma kodu kaldırıldı - yukarıda birleştirildi

  // Handle text selection - bunu kaldırıyoruz, yukarıda zaten mevcuttur
  // document.addEventListener('mouseup', ... kaldırıldı

  // Handle clicks outside our elements to hide them - bu da yukarıda mevcut
  // document.addEventListener('mousedown', ... kaldırıldı

  // Karanlık mod değişikliklerini dinleme fonksiyonu
  function listenForDarkModeChanges() {
    if (window.matchMedia) {
      const darkModeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      darkModeMediaQuery.addEventListener('change', (e) => {
        // Kullanıcı sistem temasını değiştirdiğinde
        const isDarkMode = e.matches;
        
        // İkon ve popup'ı yeniden oluştur
        if (selectionIcon) {
          document.body.removeChild(selectionIcon);
          selectionIcon = null;
        }
        
        if (selectionPopup) {
          document.body.removeChild(selectionPopup);
          selectionPopup = null;
        }
        
        createSelectionElements();
      });
    }
  }
  
  // Başlatma sırasında karanlık mod değişikliklerini dinle
  listenForDarkModeChanges();
})();

// CSS animasyonu ekle - ID'leri düzeltildi
const style = document.createElement('style');
style.textContent = `
  @keyframes fadeIn {
    from { opacity: 0; transform: translate(-50%, -20px); }
    to { opacity: 1; transform: translate(-50%, 0); }
  }

  @keyframes fadeInOut {
    0% { opacity: 0; transform: translate(-50%, -20px); }
    20% { opacity: 1; transform: translate(-50%, 0); }
    80% { opacity: 1; transform: translate(-50%, 0); }
    100% { opacity: 0; transform: translate(-50%, -20px); }
  }

  @keyframes iconFadeIn {
    from { opacity: 0; transform: scale(0.8); }
    to { opacity: 1; transform: scale(1); }
  }

  #gemini-selection-icon {
    animation: iconFadeIn 0.3s ease-in-out;
  }

  #gemini-selection-icon:hover {
    transform: scale(1.1);
    box-shadow: 0 4px 12px rgba(0,0,0,0.4);
  }
  
  #gemini-selection-popup {
    animation: iconFadeIn 0.3s ease-in-out;
  }
`;
document.head.appendChild(style);