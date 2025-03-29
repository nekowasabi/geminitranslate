(() => {
	// 状態管理用変数
	const originalContent = new Map(); // 翻訳前のオリジナルコンテンツを保持するMap
	const originalFontSizes = new Map(); // 翻訳前のフォントサイズを保持するMap
	let isTranslating = false; // ページ全体翻訳中のフラグ
	const translationInProgress = false; // 翻訳処理進行中のフラグ

	// UI要素関連変数
	let selectionIcon = null; // 選択テキスト翻訳用アイコン
	let selectionPopup = null; // 翻訳結果表示ポップアップ
	let lastSelectedText = ""; // 最後に選択されたテキスト

	// ダークモード検出
	const isDarkMode =
		window.matchMedia &&
		window.matchMedia("(prefers-color-scheme: dark)").matches;

	// カラーテーマ設定
	const bgColor = isDarkMode ? "#333" : "white"; // 背景色
	const textColor = isDarkMode ? "#fff" : "#333"; // テキスト色
	const shadowColor = isDarkMode ? "rgba(0,0,0,0.5)" : "rgba(0,0,0,0.2)"; // シャドウ色

	// 選択用UI要素作成関数
	function createSelectionElements() {
		/* 翻訳アイコンとポップアップのDOM要素を動的に作成
       - 位置固定のアイコン要素を生成
       - ダークモード対応のスタイル設定
       - クリックイベントハンドラを登録 */
		if (!selectionIcon) {
			selectionIcon = document.createElement("div");
			selectionIcon.id = "gemini-selection-icon";
			selectionIcon.style.cssText = `
        position: fixed;
        width: 30px;
        height: 30px;
        background-image: url(${browser.runtime.getURL("icons/translate-38.png")});
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
				selectionIcon.style.backgroundColor = "#4285f4";
				selectionIcon.style.boxShadow = "0 3px 8px rgba(255,255,255,0.3)";
			}

			document.body.appendChild(selectionIcon);

			selectionIcon.addEventListener("click", (e) => {
				e.preventDefault();
				e.stopPropagation();
				showSelectionPopup(lastSelectedText);
			});
		}

		if (!selectionPopup) {
			selectionPopup = document.createElement("div");
			selectionPopup.id = "gemini-selection-popup";

			selectionPopup.style.cssText = `
        position: fixed;
        top: 0;
        right: 0;
        width: 50vw;
        height: 95vh;
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

			const closeButton = document.createElement("div");
			closeButton.textContent = "×";
			closeButton.style.cssText = `
        position: fixed;
        top: 10px;
        right: 20px;
        cursor: pointer;
        font-size: 24px;
        color: ${isDarkMode ? "#ccc" : "#777"};
        z-index: 1000001;
        padding: 10px;
        transition: color 0.3s ease;
      `;
			closeButton.addEventListener("click", () => {
				selectionPopup.style.display = "none";
			});

			closeButton.addEventListener("mouseover", function () {
				this.style.color = isDarkMode ? "#fff" : "#333";
			});
			closeButton.addEventListener("mouseout", function () {
				this.style.color = isDarkMode ? "#ccc" : "#777";
			});

			selectionPopup.appendChild(closeButton);

			const content = document.createElement("div");
			content.id = "gemini-selection-content";
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

	// テキスト選択時のアイコン表示処理
	function showSelectionIcon(e) {
		/* ユーザーが2文字以上選択した時に翻訳アイコンを表示
       - 選択テキストのトリミングと保存
       - アイコンの位置計算と表示更新 */
		if (!selectionIcon) {
			createSelectionElements();
		}

		const selection = window.getSelection();
		if (selection && selection.toString().trim().length > 1) {
			lastSelectedText = selection.toString().trim();
			selectionIcon.style.display = "block";
			selectionIcon.style.zIndex = "999999";
		}
	}

	// 翻訳ポップアップ表示関数
	async function showSelectionPopup(text) {
		if (!text || text.length === 0) return;
		if (!selectionPopup) {
			createSelectionElements();
		}

		const contentDiv = document.getElementById("gemini-selection-content");
		contentDiv.textContent = "Translating...";
		contentDiv.style.color = isDarkMode ? "#fff" : "#333";

		selectionPopup.style.display = "block";

		try {
			const targetLanguage = await new Promise((resolve) => {
				browser.storage.local.get(["targetLanguage"], (result) => {
					resolve(result.targetLanguage || "tr");
				});
			});

			// テキストをバッチ処理用に分割
			const batches = [];
			const chunkSize = 2000;
			for (let i = 0; i < text.length; i += chunkSize) {
				batches.push(text.substring(i, i + chunkSize));
			}

			let lastUpdate = 0;
			const updateProgress = (current, total) => {
				const now = Date.now();
				if (now - lastUpdate > 500) {
					contentDiv.textContent = `翻訳中... ${Math.round((current / total) * 100)}%`;
					lastUpdate = now;
				}
			};

			const batchPromises = batches.map(async (batch, index) => {
				const response = await browser.runtime.sendMessage({
					action: "translateText",
					text: batch,
					targetLanguage: targetLanguage,
				});

				updateProgress(index + 1, batches.length);
				await new Promise((resolve) => setTimeout(resolve, 200));
				return response;
			});

			const translatedParts = await Promise.all(batchPromises);
			contentDiv.textContent = translatedParts.join("");
		} catch (error) {
			contentDiv.textContent = "Translation error. Please try again.";
			console.error("Translation error:", error);
		}
	}

	// ページ全体翻訳関数
	async function translatePage(targetLanguage, fontSize) {
		/* ページ全体のテキストを翻訳
       - 進行状況通知バナーの表示
       - テキストノードの収集とバッチ処理
       - API制限回避のための遅延処理
       - 動的コンテンツ監視のセットアップ */
		const notification = document.createElement("div");
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
		notification.textContent = "Start Translate";
		document.body.appendChild(notification);

		setTimeout(() => {
			if (notification && notification.parentNode) {
				notification.parentNode.removeChild(notification);
			}
		}, 3000);

		isTranslating = true;

		const textNodeData = getAllTextNodes(document.body);
		const textNodes = textNodeData.map((item) => item.node);
		console.log(`Found ${textNodes.length} text nodes to translate`);

		const batches = createBatches(textNodeData, 800);
		console.log(`Created ${batches.length} batches for translation`);

		for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
			const batch = batches[batchIndex];
			try {
				const textsToTranslate = [];
				const nodeIndices = [];

				for (let i = 0; i < batch.length; i++) {
					const node = batch[i];
					const text = node.nodeValue.trim();

					if (
						text &&
						!/^\s*$/.test(text) &&
						!/^\d+$/.test(text) &&
						text.length > 1
					) {
						textsToTranslate.push(text);
						nodeIndices.push(i);

						if (!originalContent.has(node)) {
							originalContent.set(node, node.nodeValue);
							if (node.parentElement) {
								originalFontSizes.set(
									node.parentElement,
									window.getComputedStyle(node.parentElement).fontSize,
								);
								node.parentElement.style.fontSize = `${fontSize}px`;
							}
						}
					}
				}

				if (textsToTranslate.length === 0) continue;

				const combinedText = textsToTranslate.join("\n[SPLIT]\n");

				console.log(
					`Translating batch ${batchIndex + 1}/${batches.length} with ${textsToTranslate.length} text segments`,
				);

				const translatedText = await browser.runtime.sendMessage({
					action: "translateText",
					text: combinedText,
					targetLanguage: targetLanguage,
				});

				if (translatedText) {
					const translatedPieces = translatedText.split("\n[SPLIT]\n");

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

			await new Promise((resolve) => setTimeout(resolve, 500));

			if (batchIndex % 5 === 4) {
				await new Promise((resolve) => setTimeout(resolve, 1500));
			}
		}

		await translateSpecialElements(targetLanguage);

		setupMutationObserver(targetLanguage, fontSize);

		isTranslating = false;
		console.log("Translation completed");
	}

	// 特殊要素翻訳関数
	async function translateSpecialElements(targetLanguage) {
		/* 入力要素やボタンなどの特殊要素を翻訳
       - input/textareaのplaceholder属性
       - buttonのテキストコンテンツ
       - imgのaltテキスト
       - オリジナル値の保存処理 */
		const inputs = document.querySelectorAll(
			"input[placeholder], textarea[placeholder]",
		);
		const placeholders = Array.from(inputs)
			.map((input) => {
				const placeholder = input.getAttribute("placeholder");
				if (placeholder && placeholder.trim() && placeholder.length > 1) {
					return {
						element: input,
						text: placeholder,
						attribute: "placeholder",
					};
				}
				return null;
			})
			.filter((item) => item !== null);

		const buttons = document.querySelectorAll(
			'button, input[type="button"], input[type="submit"]',
		);
		const buttonTexts = Array.from(buttons)
			.map((button) => {
				if (button.tagName === "BUTTON") {
					if (
						button.textContent &&
						button.textContent.trim() &&
						button.textContent.length > 1
					) {
						return {
							element: button,
							text: button.textContent.trim(),
							isTextContent: true,
						};
					}
				} else {
					const value = button.getAttribute("value");
					if (value && value.trim() && value.length > 1) {
						return {
							element: button,
							text: value,
							attribute: "value",
						};
					}
				}
				return null;
			})
			.filter((item) => item !== null);

		const images = document.querySelectorAll("img[alt]");
		const altTexts = Array.from(images)
			.map((img) => {
				const alt = img.getAttribute("alt");
				if (alt && alt.trim() && alt.length > 1) {
					return {
						element: img,
						text: alt,
						attribute: "alt",
					};
				}
				return null;
			})
			.filter((item) => item !== null);

		const specialElements = [...placeholders, ...buttonTexts, ...altTexts];

		if (specialElements.length === 0) return;

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

		for (const batch of batches) {
			try {
				const textsToTranslate = batch.map((item) => item.text);

				const combinedText = textsToTranslate.join("\n[SPLIT]\n");

				const translatedText = await browser.runtime.sendMessage({
					action: "translateText",
					text: combinedText,
					targetLanguage: targetLanguage,
				});

				if (translatedText) {
					const translatedPieces = translatedText.split("\n[SPLIT]\n");

					for (let i = 0; i < translatedPieces.length; i++) {
						if (i < batch.length) {
							const element = batch[i];

							if (!originalContent.has(element.element)) {
								if (element.isTextContent) {
									originalContent.set(
										element.element,
										element.element.textContent,
									);
								} else {
									originalContent.set(element.element, {
										attribute: element.attribute,
										value: element.element.getAttribute(element.attribute),
									});
								}
							}

							if (element.isTextContent) {
								element.element.textContent = translatedPieces[i];
							} else {
								element.element.setAttribute(
									element.attribute,
									translatedPieces[i],
								);
							}
						}
					}
				}
			} catch (error) {
				console.error("Error translating special elements:", error);
			}

			await new Promise((resolve) => setTimeout(resolve, 500));
		}
	}

	// ページリセット関数
	function resetPage() {
		/* 翻訳前の状態にページを復元
       - 保存されたオリジナルコンテンツを適用
       - MutationObserverの解除
       - 各種状態フラグのリセット */
		originalContent.forEach((originalValue, element) => {
			if (element.nodeType === Node.TEXT_NODE) {
				if (element.nodeValue) {
					element.nodeValue = originalValue;
				}
			} else if (element instanceof Element) {
				if (typeof originalValue === "string") {
					element.textContent = originalValue;
				} else if (originalValue && originalValue.attribute) {
					element.setAttribute(originalValue.attribute, originalValue.value);
				}
			}
		});

		// フォントサイズを元に戻す
		originalFontSizes.forEach((originalSize, element) => {
			if (element instanceof Element) {
				element.style.fontSize = originalSize;
			}
		});
		originalFontSizes.clear();

		if (window.translationObserver) {
			window.translationObserver.disconnect();
			window.translationObserver = null;
		}

		console.log("Page reset to original content");
	}

	// テキストノード収集関数
	// ビューポート内判定関数
	function isInViewport(node) {
		if (node.parentElement) {
			const rect = node.parentElement.getBoundingClientRect();
			return (
				rect.top < window.innerHeight &&
				rect.bottom > 0 &&
				rect.left < window.innerWidth &&
				rect.right > 0
			);
		}
		return false;
	}

	function getAllTextNodes(node) {
		/* ページ内のすべてのテキストノードを再帰的に収集
       - script/styleタグを除外
       - 非表示要素をフィルタリング
       - 空白/数値のみのノードをスキップ
       - ビューポート内のテキストを優先 */
		const textNodes = [];

		if (node.nodeType === Node.ELEMENT_NODE) {
			const tagName = node.tagName.toLowerCase();
			if (
				tagName === "script" ||
				tagName === "style" ||
				tagName === "noscript" ||
				tagName === "iframe" ||
				tagName === "code" ||
				tagName === "pre"
			) {
				return textNodes;
			}

			const style = window.getComputedStyle(node);
			if (
				style.display === "none" ||
				style.visibility === "hidden" ||
				Number.parseFloat(style.opacity) === 0
			) {
				return textNodes;
			}
		}

		if (node.nodeType === Node.TEXT_NODE) {
			const text = node.nodeValue.trim();
			if (text) {
				textNodes.push({
					node: node,
					priority: isInViewport(node) ? 1 : 0, // ビューポート内なら優先度高
				});
			}
		}

		if (node.childNodes && node.childNodes.length > 0) {
			for (let i = 0; i < node.childNodes.length; i++) {
				const childNodes = getAllTextNodes(node.childNodes[i]);
				textNodes.push(...childNodes);
			}
		}

		return textNodes;
	}

	// バッチ作成関数
	function createBatches(nodes, maxChars) {
		/* テキストノードをAPI制限用にバッチ分割
       - 800文字単位でグループ化
       - ノードを分割せずにバッチング
       - ビューポート内のテキストを優先
       - パフォーマンス最適化のため */
		const batches = [];
		let currentBatch = [];
		let currentLength = 0;

		// 優先度（ビューポート内のテキスト）でソート
		const sortedNodes = nodes.sort((a, b) => b.priority - a.priority);

		for (const { node } of sortedNodes) {
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

	// DOM変更監視設定関数
	function setupMutationObserver(targetLanguage, fontSize = 16) {
		/* 動的コンテンツ変更を検知して自動翻訳
       - 新しい要素追加を検出
       - 翻訳中は処理をスキップ
       - 属性変更も監視（placeholder/value/alt） */
		if (window.translationObserver) {
			window.translationObserver.disconnect();
		}

		window.translationObserver = new MutationObserver((mutations) => {
			if (isTranslating) return;

			let newNodes = [];

			for (const mutation of mutations) {
				if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
					for (const node of mutation.addedNodes) {
						if (
							node.nodeType === Node.ELEMENT_NODE ||
							node.nodeType === Node.TEXT_NODE
						) {
							const textNodes = getAllTextNodes(node);
							if (textNodes.length > 0) {
								newNodes = [...newNodes, ...textNodes];
							}
						}
					}
				}
			}

			if (newNodes.length > 0) {
				console.log(
					`MutationObserver detected ${newNodes.length} new text nodes`,
				);
				browser.runtime
					.sendMessage({
						action: "newContentDetected",
					})
					.then(() => {
						browser.storage.local.get(
							["targetLanguage", "fontSize"],
							(result) => {
								const currentTargetLanguage =
									result.targetLanguage || targetLanguage || "tr";
								translateNodes(
									newNodes,
									currentTargetLanguage,
									currentFontSize,
								);
							},
						);
					});
			}
		});

		window.translationObserver.observe(document.body, {
			childList: true,
			subtree: true,
			characterData: true,
			attributes: true,
			attributeFilter: ["placeholder", "value", "alt", "title"],
		});

		console.log("MutationObserver set up for dynamic content");
	}

	// 動的コンテンツ翻訳関数
	async function translateNodes(nodes, targetLanguage, fontSize = 16) {
		/* 新規追加ノードの翻訳処理
       - バッチ分割とAPIリクエスト
       - 翻訳結果の適用
       - オリジナルコンテンツの保存
       - ビューポート内のテキストを優先 */
		if (nodes.length === 0) return;

		// 優先度情報を追加
		const nodesWithPriority = nodes.map((node) => ({
			node: node,
			priority: isInViewport(node) ? 1 : 0,
		}));

		isTranslating = true;
		console.log(`Translating ${nodes.length} new nodes`);

		const batches = createBatches(nodesWithPriority, 800);

		for (const batch of batches) {
			try {
				const textsToTranslate = [];
				const nodeIndices = [];

				for (let i = 0; i < batch.length; i++) {
					const node = batch[i];
					const text = node.nodeValue.trim();

					if (
						text &&
						!/^\s*$/.test(text) &&
						!/^\d+$/.test(text) &&
						text.length > 1
					) {
						textsToTranslate.push(text);
						nodeIndices.push(i);

						if (!originalContent.has(node)) {
							originalContent.set(node, node.nodeValue);
							if (node.parentElement) {
								originalFontSizes.set(
									node.parentElement,
									window.getComputedStyle(node.parentElement).fontSize,
								);
								node.parentElement.style.fontSize = `${fontSize}px`;
							}
						}
					}
				}

				if (textsToTranslate.length === 0) continue;

				const combinedText = textsToTranslate.join("\n[SPLIT]\n");

				const translatedText = await browser.runtime.sendMessage({
					action: "translateText",
					text: combinedText,
					targetLanguage: targetLanguage,
				});

				if (translatedText) {
					const translatedPieces = translatedText.split("\n[SPLIT]\n");

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
				console.error("Error translating dynamic batch:", error);
			}

			await new Promise((resolve) => setTimeout(resolve, 500));
		}

		isTranslating = false;
		console.log("Dynamic content translation completed");
	}

	// ダークモード変更監視関数
	function listenForDarkModeChanges() {
		/* システムテーマ変更を検知してUI更新
       - カラースキーム変更対応
       - UI要素の再作成
       - リアルタイムテーマ反映 */
		if (window.matchMedia) {
			const darkModeMediaQuery = window.matchMedia(
				"(prefers-color-scheme: dark)",
			);
			darkModeMediaQuery.addEventListener("change", (e) => {
				const isDarkMode = e.matches;

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

	// 初期化処理
	createSelectionElements();
	listenForDarkModeChanges();

	// テキスト選択イベントリスナーを追加
	document.addEventListener("selectionchange", showSelectionIcon);

	// CSSアニメーション定義
	const style = document.createElement("style");
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

	// メッセージハンドラを追加
	browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
		if (message.action === "translate") {
			translatePage(message.targetLanguage, message.fontSize);
			sendResponse({ status: "started" });
		} else if (message.action === "translate-clipboard") {
			// 先にUIを確実に初期化
			if (!selectionPopup) {
				createSelectionElements();
			}
			translateClipboardContent();
			sendResponse({ status: "started" });
		} else if (message.action === "reset") {
			resetPage();
			sendResponse({ status: "reset" });
		}
		return true;
	});

	// クリップボードのテキストを翻訳する関数
	async function translateClipboardContent() {
		try {
			console.log("クリップボードの内容を読み取り中...");
			const text = await navigator.clipboard.readText();
			if (text && text.trim().length > 0) {
				console.log("クリップボードのテキストを翻訳中:", text.trim());
				showSelectionPopup(text.trim());
			}
		} catch (error) {
			console.error("クリップボードの読み取りに失敗しました:", error);
		}
	}
})();
