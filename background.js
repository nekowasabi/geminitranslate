// Cache for translations to reduce API calls
const translationCache = new Map();

// Listen for keyboard shortcut command
browser.commands.onCommand.addListener(async (command) => {
  console.log('Command received:', command);
  if (command === 'translate-page') {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]) {
      // Get current target language from storage
      const result = await browser.storage.local.get('targetLanguage');
      const targetLanguage = result.targetLanguage || 'ja';

      // Send message to content script to translate the page
      browser.tabs.sendMessage(tabs[0].id, {
        action: 'translate',
        targetLanguage: targetLanguage
      }).catch(error => {
        console.error('Error sending translation message:', error);
      });
    }
  } else if (command === 'translate-clipboard') {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]) {
      console.log('Sending clipboard translation command');
      browser.tabs.sendMessage(tabs[0].id, {
        action: 'translate-clipboard'
      }).catch(error => {
        console.error('Error sending clipboard translation message:', error);
      });
    }
  }
});

// Listen for messages from content script
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'translateText') {
    return translateText(message.text, message.targetLanguage);
  } else if (message.action === 'newContentDetected') {
    // Just acknowledge the message
    return Promise.resolve({ status: 'acknowledged' });
  }
  return false;
});

// Function to translate text using Gemini API
async function translateText(text, targetLanguage) {
  try {
    // Check cache first
    const cacheKey = `${text}_${targetLanguage}`;
    if (translationCache.has(cacheKey)) {
      console.log('Using cached translation');
      return Promise.resolve(translationCache.get(cacheKey));
    }
    
    // Get API key from storage
    const result = await browser.storage.local.get('apiKey');
    const apiKey = result.apiKey;
    
    if (!apiKey) {
      throw new Error('API key not found');
    }
    
    // Prepare the prompt for translation
    const prompt = `Translate the following text to ${getLanguageName(targetLanguage)}. 
Keep the same formatting and preserve all special characters. 
Only return the translated text without any explanations or additional text.
If you see "[SPLIT]" markers, keep them exactly as they are in your response.
Maintain HTML tags if present.

${text}`;
    
    console.log(`Sending translation request to Gemini API (text length: ${text.length})`);
    
    // Make API request
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: prompt }]
        }],
        generationConfig: {
          temperature: 0.2,
          topP: 0.8,
          topK: 40
        }
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      console.error('API error response:', errorData);
      throw new Error(`API error: ${errorData.error?.message || response.statusText}`);
    }
    
    const data = await response.json();
    
    // Extract translated text from response
    if (data.candidates && data.candidates.length > 0 && 
        data.candidates[0].content && data.candidates[0].content.parts && 
        data.candidates[0].content.parts.length > 0) {
      
      const translatedText = data.candidates[0].content.parts[0].text;
      
      // Store in cache (limit cache size to prevent memory issues)
      if (translationCache.size > 200) {
        // Remove oldest entries (20% of cache)
        const keysToRemove = Math.floor(translationCache.size * 0.2);
        const keys = Array.from(translationCache.keys());
        for (let i = 0; i < keysToRemove; i++) {
          translationCache.delete(keys[i]);
        }
      }
      translationCache.set(cacheKey, translatedText);
      
      console.log('Translation successful');
      return translatedText;
    } else {
      console.error('Invalid response format from API:', data);
      throw new Error('Invalid response format from API');
    }
  } catch (error) {
    console.error('Translation error:', error);
    return Promise.reject(error);
  }
}

// Helper function to get language name from code
function getLanguageName(langCode) {
  const languages = {
    'tr': 'Turkish',
    'en': 'English',
    'fr': 'French',
    'de': 'German',
    'es': 'Spanish',
    'it': 'Italian',
    'ru': 'Russian',
    'zh': 'Chinese',
    'ja': 'Japanese',
    'ko': 'Korean',
    'ar': 'Arabic',
    'pt': 'Portuguese',
    'nl': 'Dutch',
    'pl': 'Polish',
    'sv': 'Swedish',
    'da': 'Danish',
    'fi': 'Finnish',
    'no': 'Norwegian',
    'cs': 'Czech',
    'hu': 'Hungarian',
    'el': 'Greek',
    'he': 'Hebrew',
    'th': 'Thai',
    'vi': 'Vietnamese',
    'id': 'Indonesian',
    'ms': 'Malay',
    'hi': 'Hindi',
    'bn': 'Bengali',
    'fa': 'Persian',
    'uk': 'Ukrainian',
    'ro': 'Romanian',
    'bg': 'Bulgarian'
  };
  
  return languages[langCode] || 'Turkish';
}