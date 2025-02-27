(function() {
  // Store original text content for resetting
  const originalContent = new Map();
  let isTranslating = false;
  let translationInProgress = false;
  
  // Listen for messages from popup
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'translate') {
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
})();