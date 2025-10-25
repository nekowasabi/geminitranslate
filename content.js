(() => {
	// 状態管理用変数
	const originalContent = new Map(); // 翻訳前のオリジナルコンテンツを保持するMap
	const CONCURRENCY_LIMIT = 10; // 並列処理の最大数
	const originalFontSizes = new Map(); // 翻訳前のフォントサイズを保持するMap
	const originalLineHeights = new Map(); // 翻訳前の行間を保持するMap
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
        line-height: 1.6;
        user-select: text;
        -webkit-user-select: text;
        -moz-user-select: text;
        -ms-user-select: text;
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
		
		// 保存された行間設定を適用
		browser.storage.local.get(["lineHeight"], (result) => {
			const lineHeight = result.lineHeight || 4;
			const currentFontSize = 24; // selectionPopupのデフォルトフォントサイズ
			contentDiv.style.lineHeight = `${currentFontSize + lineHeight}px`;
		});

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
			// Remove any remaining [SPLIT] markers from the translated text
			let cleanedTranslation = translatedParts.join("").replace(/\[SPLIT\]/g, '');
			// Add line breaks around Discord message separators for better readability
			cleanedTranslation = cleanedTranslation.replace(/\s*—\s*/g, '\n—\n');
			contentDiv.textContent = cleanedTranslation;
			
			// 翻訳完了後にも行間設定を適用
			browser.storage.local.get(["lineHeight"], (result) => {
				const lineHeight = result.lineHeight || 4;
				const currentFontSize = 24;
				contentDiv.style.lineHeight = `${currentFontSize + lineHeight}px`;
			});
		} catch (error) {
			contentDiv.textContent = "Translation error. Please try again.";
			console.error("Translation error:", error);
			
			// エラー表示の際にも行間設定を適用
			browser.storage.local.get(["lineHeight"], (result) => {
				const lineHeight = result.lineHeight || 4;
				const currentFontSize = 24;
				contentDiv.style.lineHeight = `${currentFontSize + lineHeight}px`;
			});
		}
	}

	// 進捗バナー作成関数
	function createProgressBanner() {
		/* 翻訳進捗を表示するバナーを作成
       - 固定位置（ページ上部中央）に表示
       - 初期テキストは「翻訳中... 0%」
       - 既存の通知バナーと同じスタイルを使用 */
		const BANNER_CLASS = 'gemini-progress-banner';
		const BANNER_BACKGROUND_COLOR = '#4285f4';
		const BANNER_Z_INDEX = '999999';

		const banner = document.createElement('div');
		banner.className = BANNER_CLASS;
		banner.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background-color: ${BANNER_BACKGROUND_COLOR};
      color: white;
      padding: 12px 24px;
      border-radius: 8px;
      font-family: Arial, sans-serif;
      font-size: 14px;
      z-index: ${BANNER_Z_INDEX};
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    `;
		banner.textContent = '翻訳中... 0%';
		return banner;
	}

	// 進捗状態管理オブジェクトを作成
	function createProgressState() {
		/* 進捗更新のスロットル管理用の状態を作成
       - lastUpdateTime: 最後に更新した時刻を保持 */
		return {
			lastUpdateTime: 0
		};
	}

	// 進捗更新関数
	function updateProgress(banner, state, processed, total) {
		/* バナーの進捗表示を更新（500msスロットル付き）
       - 500ms経過していない場合は更新をスキップ
       - パーセンテージを計算して表示
       - ゼロ除算を回避 */
		const PROGRESS_UPDATE_INTERVAL = 500; // 500ms間隔
		const now = Date.now();

		if (now - state.lastUpdateTime < PROGRESS_UPDATE_INTERVAL) {
			return; // スロットル中
		}

		const percentage = total === 0 ? 0 : Math.round((processed / total) * 100);
		banner.textContent = `翻訳中... ${percentage}%`;
		state.lastUpdateTime = now;
	}

	// 進捗バナー非表示関数
	function hideProgressBanner(banner) {
		/* 進捗バナーを「翻訳完了」表示に変更し、3秒後に削除
       - 完了メッセージの表示
       - 3秒後の自動削除処理 */
		const COMPLETION_DISPLAY_DURATION = 3000; // 3秒間表示

		banner.textContent = '翻訳完了';
		setTimeout(() => {
			if (banner && banner.parentNode) {
				banner.parentNode.removeChild(banner);
			}
		}, COMPLETION_DISPLAY_DURATION);
	}

	// ページ全体翻訳関数
	async function translatePage(targetLanguage, fontSize = 16, lineHeight = 4) {
		/* ページ全体のテキストを翻訳
       - 進行状況通知バナーの表示
       - テキストノードの収集とバッチ処理
       - API制限回避のための遅延処理
       - 動的コンテンツ監視のセットアップ */
		console.log("translatePage実行:", { targetLanguage, fontSize, lineHeight });
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

		// エッジケース: バッチが0の場合は進捗バナーを表示しない
		if (batches.length === 0) {
			console.log("No batches to translate");
			isTranslating = false;
			return;
		}

		// 既存の進捗バナーを削除（重複防止）
		const existingBanner = document.querySelector('.gemini-progress-banner');
		if (existingBanner) {
			existingBanner.remove();
		}

		// 進捗バナーの作成と表示
		const progressBanner = createProgressBanner();
		document.body.appendChild(progressBanner);
		const progressState = createProgressState();

		try {
			// バッチ翻訳処理をカプセル化する非同期関数
			const translateBatch = async (batch, batchIndex) => {
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
								originalLineHeights.set(
									node.parentElement,
									window.getComputedStyle(node.parentElement).lineHeight,
								);
								console.log("スタイル適用:", {
									element: node.parentElement.tagName,
									fontSize: fontSize,
									lineHeight: lineHeight,
									calculatedLineHeight: fontSize + lineHeight
								});
								node.parentElement.style.fontSize = `${fontSize}px`;
								node.parentElement.style.lineHeight = `${fontSize + lineHeight}px`;
							}
						}
					}
				}

				if (textsToTranslate.length === 0) return;

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
							if (
								nodeIndex < batch.length &&
								batch[nodeIndex] &&
								batch[nodeIndex].nodeValue !== undefined
							) {
								// Remove any remaining [SPLIT] markers from the translated text
								const cleanedText = translatedPieces[i].replace(/\[SPLIT\]/g, '');
								batch[nodeIndex].nodeValue = cleanedText;
							}
						}
					}
				}
				} catch (error) {
					console.error(`Error translating batch ${batchIndex + 1}:`, error);
				}
			};

			// バッチをチャンクに分割して並列処理
			for (let i = 0; i < batches.length; i += CONCURRENCY_LIMIT) {
			const chunk = batches.slice(i, i + CONCURRENCY_LIMIT);
			console.log(
				`Processing chunk ${Math.floor(i / CONCURRENCY_LIMIT) + 1}...`,
			);

			// チャンク内のバッチを並列で翻訳
			const promises = chunk.map((batch, index) =>
				translateBatch(batch, i + index),
			);
			await Promise.all(promises);

			// 進捗を更新（処理済みバッチ数を計算）
			const processedBatches = Math.min(i + CONCURRENCY_LIMIT, batches.length);
			updateProgress(progressBanner, progressState, processedBatches, batches.length);

			// APIレート制限のための遅延（最後のチャンクの後には不要）
			if (i + CONCURRENCY_LIMIT < batches.length) {
				await new Promise((resolve) => setTimeout(resolve, 1000));
			}
		}

			await translateSpecialElements(targetLanguage);

			setupMutationObserver(targetLanguage, fontSize, lineHeight);

			// 進捗バナーを完了表示に変更し、3秒後に削除
			hideProgressBanner(progressBanner);

			isTranslating = false;
			console.log("Translation completed");
		} catch (error) {
			console.error("Translation error:", error);
			// エラー発生時は進捗バナーを即座に削除
			if (progressBanner && progressBanner.parentNode) {
				progressBanner.parentNode.removeChild(progressBanner);
			}
			isTranslating = false;
		}
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
								// Remove any remaining [SPLIT] markers from the translated text
								const cleanedText = translatedPieces[i].replace(/\[SPLIT\]/g, '');
								element.element.textContent = cleanedText;
							} else {
								element.element.setAttribute(
									element.attribute,
									// Remove any remaining [SPLIT] markers from the translated text
									translatedPieces[i].replace(/\[SPLIT\]/g, ''),
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
		
		// 行間を元に戻す
		originalLineHeights.forEach((originalLineHeight, element) => {
			if (element instanceof Element) {
				element.style.lineHeight = originalLineHeight;
			}
		});
		originalLineHeights.clear();

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

	function getAllTextNodes(rootNode) {
		/* ページ内のすべてのテキストノードをTreeWalkerを使用して収集
       - script/styleタグなどを除外
       - 非表示要素をフィルタリング
       - 空白/数値のみのノードをスキップ
       - ビューポート内のテキストを優先 */
		const textNodesData = [];
		const walker = document.createTreeWalker(rootNode, NodeFilter.SHOW_TEXT, {
			acceptNode: (node) => {
				// 親要素が除外対象タグかチェック
				const parent = node.parentElement;
				if (parent) {
					const tagName = parent.tagName.toLowerCase();
					if (
						tagName === "script" ||
						tagName === "style" ||
						tagName === "noscript" ||
						tagName === "iframe" ||
						tagName === "code" ||
						tagName === "pre"
					) {
						return NodeFilter.FILTER_REJECT;
					}

					// 親要素が表示されているかチェック
					const style = window.getComputedStyle(parent);
					if (
						style.display === "none" ||
						style.visibility === "hidden" ||
						Number.parseFloat(style.opacity) === 0
					) {
						return NodeFilter.FILTER_SKIP;
					}
				}

				// テキスト内容をチェック
				const text = node.nodeValue.trim();
				if (
					!text ||
					/^\s*$/.test(text) ||
					/^\d+$/.test(text) ||
					text.length <= 1
				) {
					return NodeFilter.FILTER_SKIP;
				}

				return NodeFilter.FILTER_ACCEPT;
			},
		});

		let node;
		while ((node = walker.nextNode())) {
			textNodesData.push({
				node: node,
				priority: isInViewport(node) ? 1 : 0,
			});
		}

		return textNodesData;
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
	function setupMutationObserver(targetLanguage, fontSize = 16, lineHeight = 4) {
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
							["targetLanguage", "fontSize", "lineHeight"],
							(result) => {
								const currentTargetLanguage =
									result.targetLanguage || targetLanguage || "tr";
								translateNodes(
									newNodes,
									currentTargetLanguage,
									currentFontSize,
									result.lineHeight || 4,
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
	async function translateNodes(nodes, targetLanguage, fontSize = 16, lineHeight = 4) {
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
								originalLineHeights.set(
									node.parentElement,
									window.getComputedStyle(node.parentElement).lineHeight,
								);
								console.log("スタイル適用:", {
									element: node.parentElement.tagName,
									fontSize: fontSize,
									lineHeight: lineHeight,
									calculatedLineHeight: fontSize + lineHeight
								});
								node.parentElement.style.fontSize = `${fontSize}px`;
								node.parentElement.style.lineHeight = `${fontSize + lineHeight}px`;
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
								// Remove any remaining [SPLIT] markers from the translated text
								const cleanedText = translatedPieces[i].replace(/\[SPLIT\]/g, '');
								batch[nodeIndex].nodeValue = cleanedText;
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
			console.log("翻訳開始:", {
				targetLanguage: message.targetLanguage,
				fontSize: message.fontSize,
				lineHeight: message.lineHeight
			});
			translatePage(message.targetLanguage, message.fontSize, message.lineHeight);
			sendResponse({ status: "started" });
		} else if (message.action === "translate-clipboard") {
			// 先にUIを確実に初期化
			if (!selectionPopup) {
				createSelectionElements();
			}
			translateClipboardContent();
			sendResponse({ status: "started" });
		} else if (message.action === "translate-selection") {
			if (!selectionPopup) {
				createSelectionElements();
			}

			// ポップアップ内容を初期化
			const contentDiv = document.getElementById("gemini-selection-content");
			if (contentDiv) {
				contentDiv.textContent = "";
			}
			selectionPopup.style.display = "none";

			// 最新の選択範囲を取得
			const selection = window.getSelection();
			const selectedText = selection ? selection.toString().trim() : "";

			if (selectedText.length > 1) {
				// 翻訳開始
				showSelectionPopup(selectedText);
			} else {
				// 選択がなければ通知
				if (contentDiv) {
					contentDiv.textContent = "テキストを選択してください";
					
					// 通知表示の際にも行間設定を適用
					browser.storage.local.get(["lineHeight"], (result) => {
						const lineHeight = result.lineHeight || 4;
						const currentFontSize = 24;
						contentDiv.style.lineHeight = `${currentFontSize + lineHeight}px`;
					});
				}
				selectionPopup.style.display = "block";
			}

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
