// Import OpenRouter client
import { OpenRouterClient } from './openrouter.js';

// Cache for translations to reduce API calls
const translationCache = new Map();

// Command handlers
async function handleTranslatePage() {
	const tabs = await browser.tabs.query({ active: true, currentWindow: true });
	if (tabs[0]) {
		const result = await browser.storage.local.get(["targetLanguage", "fontSize", "lineHeight"]);
		const targetLanguage = result.targetLanguage || "ja";
		const fontSize = result.fontSize || 16;
		const lineHeight = result.lineHeight || 4;

		browser.tabs
			.sendMessage(tabs[0].id, {
				action: "translate",
				targetLanguage: targetLanguage,
				fontSize: fontSize,
				lineHeight: lineHeight,
			})
			.catch((error) => {
				console.error("Error sending translation message:", error);
			});
	}
}

async function handleTranslateClipboard() {
	const tabs = await browser.tabs.query({ active: true, currentWindow: true });
	if (tabs[0]) {
		console.log("Sending clipboard translation command");
		browser.tabs
			.sendMessage(tabs[0].id, {
				action: "translate-clipboard",
			})
			.catch((error) => {
				console.error("Error sending clipboard translation message:", error);
			});
	}
}

async function handleTranslateSelection() {
	const tabs = await browser.tabs.query({ active: true, currentWindow: true });
	if (tabs[0]) {
		const result = await browser.storage.local.get("targetLanguage");
		const targetLanguage = result.targetLanguage || "ja";

		browser.tabs
			.sendMessage(tabs[0].id, {
				action: "translate-selection",
				targetLanguage: targetLanguage,
			})
			.catch((error) => {
				console.error("Error sending selection translation message:", error);
			});
	}
}

// Listen for keyboard shortcut command
browser.commands.onCommand.addListener(async (command) => {
	console.log("Command received:", command);

	switch (command) {
		case "translate-page":
			await handleTranslatePage();
			break;
		case "translate-clipboard":
			await handleTranslateClipboard();
			break;
		case "translate-selection":
			await handleTranslateSelection();
			break;
		default:
			console.warn("Unknown command:", command);
	}
});

// Listen for messages from content script
browser.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
	if (message.action === "translateText") {
		return translateText(message.text, message.targetLanguage);
	} else if (message.action === "newContentDetected") {
		// Just acknowledge the message
		return Promise.resolve({ status: "acknowledged" });
	}
	return false;
});

// Function to translate text using OpenRouter API
async function translateText(text, targetLanguage) {
	try {
		// Check cache first
		const cacheKey = `${text}_${targetLanguage}`;
		if (translationCache.has(cacheKey)) {
			console.log("Using cached translation");
			return Promise.resolve(translationCache.get(cacheKey));
		}

		// Get API settings from storage
		const result = await browser.storage.local.get([
			"openRouterApiKey",
			"openRouterModel",
			"openRouterProvider"
		]);

		const apiKey = result.openRouterApiKey;
		const model = result.openRouterModel || "google/gemini-2.0-flash-exp:free";
		const provider = result.openRouterProvider || null;

		if (!apiKey) {
			throw new Error("OpenRouter API key not found");
		}

		console.log(
			`Sending translation request to OpenRouter API (text length: ${text.length})`,
		);

		// Create OpenRouter client
		const client = new OpenRouterClient(apiKey, model, provider);

		// Translate using OpenRouter
		const translatedText = await client.translate(
			text,
			getLanguageName(targetLanguage),
			4000
		);

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

		console.log("Translation successful");
		return translatedText;
	} catch (error) {
		console.error("Translation error:", error);
		return Promise.reject(error);
	}
}

// Helper function to get language name from code
function getLanguageName(langCode) {
	const languages = {
		tr: "Turkish",
		en: "English",
		fr: "French",
		de: "German",
		es: "Spanish",
		it: "Italian",
		ru: "Russian",
		zh: "Chinese",
		ja: "Japanese",
		ko: "Korean",
		ar: "Arabic",
		pt: "Portuguese",
		nl: "Dutch",
		pl: "Polish",
		sv: "Swedish",
		da: "Danish",
		fi: "Finnish",
		no: "Norwegian",
		cs: "Czech",
		hu: "Hungarian",
		el: "Greek",
		he: "Hebrew",
		th: "Thai",
		vi: "Vietnamese",
		id: "Indonesian",
		ms: "Malay",
		hi: "Hindi",
		bn: "Bengali",
		fa: "Persian",
		uk: "Ukrainian",
		ro: "Romanian",
		bg: "Bulgarian",
	};

	return languages[langCode] || "Turkish";
}

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
	module.exports = { translateText };
}

// Export for ES modules (Jest)
export { translateText };
