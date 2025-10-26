# DoganayLab API Translate App v3.0

A Chrome/Firefox extension that uses OpenRouter API to translate web pages while preserving their structure. Choose from multiple AI models including Google Gemini, Claude, GPT-4, and more.

**Version 3.0.0** - Complete TypeScript rewrite with modern architecture, React 18 UI, and Manifest V3 support.

![ScreenShot](screenshot.png) ![ScreenShot](screenshot3.png) ![ScreenShot](screenshot2.png)


## ✨ Features

### Translation Modes
- **Page Translation** (Alt+W): Translate entire page while preserving layout
- **Selection Translation** (Alt+Y): Translate selected text with floating UI
- **Clipboard Translation** (Alt+C): Translate copied text instantly

### AI Models
- **Multiple AI Model Support** via OpenRouter:
  - Google Gemini 2.0 Flash (Free tier) - Default
  - Anthropic Claude 3.5 Haiku (Free tier)
  - Google Gemini Flash 1.5 8B
  - OpenAI GPT-4o Mini
  - And 20+ more models

### Performance
- **3-Tier Cache System**: Memory → Session → Local Storage
- **LRU Cache**: Automatic eviction of old entries (max 1000)
- **Batch Processing**: Efficient handling of large pages (1000+ nodes)
- **Concurrent Translation**: Parallel API requests with rate limiting

### Supported Languages
20+ languages including:
- English, Japanese, Chinese, Korean
- Spanish, French, German, Italian
- Russian, Arabic, Hindi, Thai
- And more...

### Modern UI
- **React 18**: Modern, responsive interface
- **Dark Mode**: Automatic theme detection
- **Connection Test**: Verify API key instantly
- **Model Selector**: Easy model switching

## Installation

### Firefox Installation

1. Download or clone this repository.
2. Open Firefox and navigate to `about:debugging`.
3. Click on the "This Firefox" option.
4. Click on "Load Temporary Add-on...".
5. Select the `manifest.json` file in the extension directory.

### Chrome/Edge Installation

This extension also supports Chrome and Edge browsers. Follow these steps to build and install:

#### For Developers (Building from Source)

1. Clone this repository:
   ```bash
   git clone https://github.com/yourusername/geminitranslate.git
   cd geminitranslate
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the Chrome-compatible extension:
   ```bash
   npm run build:chrome
   ```
   This will:
   - Build the extension with web-ext
   - Convert manifest.json to v3 (required for Chrome)
   - Inject WebExtension Polyfill for browser API compatibility
   - Create a `dist-chrome/` directory with the built extension

4. Load the extension in Chrome:
   - Open `chrome://extensions/` in Chrome
   - Enable "Developer mode" (top right toggle)
   - Click "Load unpacked"
   - Select the `dist-chrome/` directory

#### For End Users (Installing Pre-built Extension)

**Note:** This extension is not yet published on the Chrome Web Store. Please follow the developer installation steps above.

## Usage

1. Click the extension icon in the toolbar to open the popup.
2. Enter your OpenRouter API key and click the "Save" button.
3. Select your preferred AI model from the dropdown menu (default: Google Gemini 2.0 Flash Free).
4. (Optional) Enter a provider name for provider routing (e.g., "DeepInfra", "Together").
5. Use the "Test Connection" button to verify your API key and model selection.
6. Select the target language.
7. Click the "Translate Page" button to translate the current page.
8. Click the "Reset to Original" button to restore the original content.
9. Translation may be a bit slow—try not to leave the tab. If the full page translation does not complete, click the "Translate Page" button again. The already translated portions are cached, so only the remaining parts will be processed.

## Obtaining an OpenRouter API Key

1. Go to [OpenRouter](https://openrouter.ai/).
2. Sign up for a free account (supports Google, GitHub, or email authentication).
3. Navigate to the [API Keys](https://openrouter.ai/keys) page.
4. Generate a new API key.
5. Copy the API key and paste it into the extension's popup.

**Note**: OpenRouter offers free tier models (like Google Gemini 2.0 Flash) that you can use without any cost. Check the [OpenRouter models page](https://openrouter.ai/models) for the latest free tier options.

## Privacy

- Your API key is stored locally in your browser and is not sent to any server other than OpenRouter API.
- The extension only sends the text content of web pages to OpenRouter API for translation.
- OpenRouter routes your requests to the selected AI model (Gemini, Claude, GPT-4, etc.).
- No user data is collected or stored by this extension.
- For OpenRouter's privacy policy, visit [OpenRouter Privacy](https://openrouter.ai/privacy).

## Technical Details

- **OpenRouter Integration**: Uses OpenRouter API to access multiple AI models:
  - Default: Google Gemini 2.0 Flash (free tier)
  - Also supports: Claude 3.5 Sonnet, GPT-4o Mini, Gemini 1.5 8B, and custom models
- **Provider Routing**: Optional provider selection for performance optimization
- **Connection Testing**: Built-in API connection test feature
- **Batch Processing**: Employs batch processing to handle large pages efficiently
- **Translation Caching**: Caches translations to reduce API calls and improve performance
- **Structure Preservation**: Maintains page structure and functionality during translation
- **Dynamic Content**: Uses MutationObserver to detect and translate dynamically loaded content
- **Smart Text Filtering**: Only translates meaningful text, skipping single-character texts or numbers
- **Element Exclusion**: Excludes invisible elements and special elements (script, style, iframe, code) from translation

### Cross-Browser Compatibility

This extension is compatible with both Firefox and Chromium-based browsers (Chrome, Edge, Brave, etc.):

- **Firefox**: Native support using the `browser` API (Manifest v2)
- **Chrome/Edge**: Uses WebExtension Polyfill to ensure compatibility
  - Automatically converts `browser` API calls to `chrome` API
  - Manifest v3 support for Chrome Web Store compliance
  - Build process handles all necessary transformations

**Implementation Details:**
- WebExtension Polyfill (v0.10.0) provides Firefox-style Promise-based APIs in Chrome
- Automated build script (`npm run build:chrome`) converts Firefox extension to Chrome format
- All browser API calls (`browser.storage`, `browser.tabs`, `browser.runtime`) work identically across browsers
- Comprehensive test suite (380+ tests) ensures cross-browser functionality

## 🛠️ Development

### Prerequisites
- Node.js 16+ and npm 8+
- Firefox or Chrome browser

### Setup
```bash
# Clone repository
git clone https://github.com/doganaylab/geminitranslate.git
cd geminitranslate

# Install dependencies
npm install

# Run tests
npm test

# Run tests with coverage
npm test -- --coverage

# Lint code
npm run lint

# Type check
npx tsc --noEmit
```

### Build Commands
```bash
# Build for Chrome
npm run build:chrome

# Build for Firefox
npm run build:firefox

# Build for both browsers
npm run build:all

# Development mode (watch mode)
npm run dev:chrome   # Chrome development mode
npm run dev:firefox  # Firefox development mode
```

### Project Structure
```
geminitranslate/
├── src/
│   ├── shared/          # Shared utilities and types
│   │   ├── adapters/    # BrowserAdapter for cross-browser compatibility
│   │   ├── storage/     # StorageManager for type-safe storage
│   │   ├── messages/    # MessageBus for type-safe messaging
│   │   ├── utils/       # Utilities (logger, retry, LRU cache, etc.)
│   │   └── constants/   # Constants (languages, models, config)
│   ├── background/      # Background service worker
│   │   ├── translationEngine.ts  # Core translation engine with 3-tier cache
│   │   ├── apiClient.ts          # OpenRouter API client
│   │   └── messageHandler.ts     # Message handling logic
│   ├── content/         # Content script (DOM manipulation)
│   │   ├── domManipulator.ts     # DOM traversal and translation
│   │   ├── selectionHandler.ts   # Selection translation
│   │   ├── clipboardHandler.ts   # Clipboard translation
│   │   └── floatingUI.ts         # Floating UI for selection translation
│   ├── popup/           # Popup UI (React)
│   │   ├── components/  # React components
│   │   └── hooks/       # Custom hooks (useTranslation, etc.)
│   └── options/         # Options UI (React)
│       ├── components/  # React components
│       └── hooks/       # Custom hooks (useSettings)
├── tests/               # Test files
├── __tests__/           # Integration tests
└── dist-chrome/         # Chrome build output
└── dist-firefox/        # Firefox build output
```

### Architecture
See [ARCHITECTURE.md](ARCHITECTURE.md) for detailed architecture documentation.

## 🐛 Troubleshooting

### Translation Not Working
1. **Check API Key**
   - Open Options UI (click extension icon → Options)
   - Verify API key is correct
   - Click "Test Connection" to verify connectivity

2. **Check Console for Errors**
   - Open DevTools (F12)
   - Check Console tab for error messages
   - Common errors:
     - `401 Unauthorized`: Invalid API key
     - `429 Too Many Requests`: Rate limit exceeded
     - `Network error`: Internet connection issue

3. **Check Browser Version**
   - Chrome: Version 88+ required (Manifest V3 support)
   - Firefox: Version 91+ recommended

### Service Worker Issues (Chrome)
If the service worker stops responding:
1. Open `chrome://serviceworker-internals/`
2. Find "DoganayLab API Translate"
3. Click "Stop" then reload extension
4. The keep-alive mechanism should restart automatically

### Cache Issues
If translations are outdated or incorrect:
1. Open Options UI
2. Scroll to "Cache Management"
3. Click "Clear Cache"
4. Reload the page and try again

### Performance Issues
If translation is slow:
1. **Reduce Batch Size**
   - Larger batches = faster but more memory
   - Smaller batches = slower but more stable
   - Default: 50 texts per batch

2. **Check Network**
   - Slow internet = slow translation
   - Use "Test Connection" to check latency

3. **Try Different Model**
   - Some models are faster than others
   - Gemini 2.0 Flash is fastest free model

### Dark Mode Not Working
1. Check browser theme settings
2. Reload extension
3. If still not working, check `prefers-color-scheme` in DevTools

### Known Limitations
- **Large Pages**: Pages with 10,000+ text nodes may take several minutes
- **Dynamic Content**: Some SPA frameworks may interfere with translation
- **Special Characters**: RTL languages (Arabic, Hebrew) may have layout issues
- **Iframes**: Content inside iframes is not translated

## 📝 Contributing
See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines.

## 📄 License
MIT License - see [LICENSE](LICENSE) for details.

---

Ready to break language barriers? Let this extension do the heavy lifting while you focus on exploring new horizons—happy translating!



## Türkçe (Turkish)

OpenRouter API üzerinden birden fazla yapay zeka modeli kullanarak web sayfalarının yapısını koruyarak çeviri yapan bir Firefox eklentisi. Google Gemini, Claude, GPT-4 ve daha fazlası arasından seçim yapın.

![ScreenShot](screenshot.png) ![ScreenShot](screenshot3.png) ![ScreenShot](screenshot2.png)

## Özellikler
- **Çoklu AI Model Desteği**: OpenRouter üzerinden çeşitli yapay zeka modelleri arasından seçim yapın:
  - Google Gemini 2.0 Flash (Ücretsiz katman mevcut)
  - Google Gemini Flash 1.5 8B
  - Anthropic Claude 3.5 Sonnet
  - OpenAI GPT-4o Mini
  - OpenRouter üzerinden sunulan daha birçok model
- **Sağlayıcı Yönlendirme**: İsteğe bağlı sağlayıcı seçimi (DeepInfra, Together vb.) ile performans optimizasyonu
- **Kullanıcı API Anahtarı Yönetimi**: Kullanıcılar kendi OpenRouter API anahtarlarını popup arayüzü üzerinden girebilir ve bu anahtar yerel olarak saklanır.
- **Ücretsiz Çeviri Seçenekleri**: Gemini 2.0 Flash gibi OpenRouter'ın ücretsiz katman modelleri ile ücretsiz çeviri yapın.
- **Tam Sayfa Çeviri**: Sayfa yapısını koruyarak sayfadaki tüm metinleri çevirir.
- **Dil Seçimi**: Kullanıcıların çeviri için hedef dili seçmelerine olanak tanır.
- **Orijinal İçeriğe Dönüş**: Kullanıcılar sayfayı orijinal içeriğine geri döndürebilir.
- **Dinamik İçerik Desteği**: Dinamik olarak yüklenen içeriği algılamak ve çevirmek için MutationObserver kullanır.
- **Özel Öğe Çevirisi**: Input placeholder'ları, buton metinleri ve alt metinleri gibi özel öğeleri çevirir.
- **Çeviri Önbelleği**: API çağrılarını azaltmak için çevirileri önbelleğe alır.
- **Toplu İşleme**: Büyük sayfaları verimli bir şekilde işlemek için toplu işleme uygular.

## Kurulum

1. Bu depoyu indirin veya klonlayın
2. Firefox'u açın ve `about:debugging` adresine gidin
3. "Bu Firefox" seçeneğine tıklayın
4. "Geçici Eklenti Yükle..." seçeneğine tıklayın
5. Eklenti dizinindeki herhangi bir dosyayı seçin

## Kullanım

1. Popup'ı açmak için araç çubuğundaki eklenti simgesine tıklayın
2. OpenRouter API anahtarınızı girin ve "Kaydet" düğmesine tıklayın
3. Açılır menüden tercih ettiğiniz yapay zeka modelini seçin (varsayılan: Google Gemini 2.0 Flash Ücretsiz)
4. (İsteğe bağlı) Sağlayıcı yönlendirme için bir sağlayıcı adı girin (örn., "DeepInfra", "Together")
5. API anahtarınızı ve model seçiminizi doğrulamak için "Test Connection" düğmesini kullanın
6. Hedef dili seçin
7. Mevcut sayfayı çevirmek için "Sayfayı Çevir" düğmesine tıklayın
8. Orijinal içeriği geri yüklemek için "Orijinale Sıfırla" düğmesine tıklayın
9. Çeviri biraz yavaş olabilir. Sekmeyi terk etmemeye gayret edin. Eğer tam sayfa çeviri alamadıysanız tekrar "Sayfayı Çevir" butonuna tıklayın. Önceki kısım önbelleğe alındığı için API isteği göndermeyecek, sadece kalan kısmı çevirecektir.

## OpenRouter API Anahtarı Alma

1. [OpenRouter](https://openrouter.ai/) adresine gidin
2. Ücretsiz bir hesap oluşturun (Google, GitHub veya e-posta ile giriş yapabilirsiniz)
3. [API Keys](https://openrouter.ai/keys) sayfasına gidin
4. Yeni bir API anahtarı oluşturun
5. API anahtarını kopyalayın ve eklentinin popup'ına yapıştırın

**Not**: OpenRouter, hiçbir ücret ödemeden kullanabileceğiniz ücretsiz katman modeller (Google Gemini 2.0 Flash gibi) sunar. En güncel ücretsiz katman seçenekleri için [OpenRouter modeller sayfasını](https://openrouter.ai/models) kontrol edin.

## Gizlilik

- API anahtarınız yerel olarak tarayıcınızda saklanır ve OpenRouter API'si dışında hiçbir sunucuya gönderilmez
- Eklenti, çeviri için yalnızca web sayfalarının metin içeriğini OpenRouter API'ye gönderir
- OpenRouter, isteklerinizi seçilen yapay zeka modeline (Gemini, Claude, GPT-4 vb.) yönlendirir
- Bu eklenti tarafından hiçbir kullanıcı verisi toplanmaz veya saklanmaz
- OpenRouter'ın gizlilik politikası için [OpenRouter Privacy](https://openrouter.ai/privacy) adresini ziyaret edin

## Teknik Detaylar

- **OpenRouter Entegrasyonu**: Birden fazla yapay zeka modeline erişim için OpenRouter API kullanır:
  - Varsayılan: Google Gemini 2.0 Flash (ücretsiz katman)
  - Ayrıca desteklenir: Claude 3.5 Sonnet, GPT-4o Mini, Gemini 1.5 8B ve özel modeller
- **Sağlayıcı Yönlendirme**: Performans optimizasyonu için isteğe bağlı sağlayıcı seçimi
- **Bağlantı Testi**: Yerleşik API bağlantı test özelliği
- **Toplu İşleme**: Büyük sayfaları verimli bir şekilde işlemek için toplu işleme uygular
- **Çeviri Önbelleği**: API çağrılarını azaltmak ve performansı artırmak için çevirileri önbelleğe alır
- **Yapı Koruma**: Çeviri sırasında sayfa yapısını ve işlevselliğini korur
- **Dinamik İçerik**: Dinamik olarak yüklenen içeriği algılamak ve çevirmek için MutationObserver kullanır
- **Akıllı Metin Filtreleme**: Yalnızca anlamlı metinleri çevirir, tek karakterli metinleri veya sayıları atlar
- **Öğe Hariç Tutma**: Görünmeyen öğeleri ve özel öğeleri (script, style, iframe, code) çeviriden hariç tutar

---

Dil engellerini aşmaya hazır mısınız? Siz yeni ufukları keşfetmeye odaklanırken bu eklentinin ağır işi yapmasına izin verin - çeviride başarılar!