# AI Translator Firefox Extension

A Firefox extension that uses OpenRouter API to translate web pages while preserving their structure. Choose from multiple AI models including Google Gemini, Claude, GPT-4, and more.

![ScreenShot](screenshot.png) ![ScreenShot](screenshot3.png) ![ScreenShot](screenshot2.png)


## Features
- **Multiple AI Model Support**: Choose from various AI models via OpenRouter:
  - Google Gemini 2.0 Flash (Free tier available)
  - Google Gemini Flash 1.5 8B
  - Anthropic Claude 3.5 Sonnet
  - OpenAI GPT-4o Mini
  - And many more models available through OpenRouter
- **Provider Routing**: Optional provider selection (DeepInfra, Together, etc.) for optimized performance
- **User API Key Management**: Users can enter their own OpenRouter API keys through the popup interface, and these keys are stored locally.
- **Free Translation Options**: Get free translations using OpenRouter's free tier models like Gemini 2.0 Flash.
- **Full Page Translation**: Translates all text on the page while maintaining its layout.
- **Language Selection**: Allows users to choose the target language for translation.
- **Revert to Original Content**: Users can switch the page back to its original content.
- **Dynamic Content Support**: Uses MutationObserver to detect and translate dynamically loaded content.
- **Custom Element Translation**: Translates custom elements such as input placeholders, button texts, and alt texts.
- **Translation Caching**: Caches translations to reduce API calls.
- **Batch Processing**: Employs batch processing for efficient handling of large pages.

## Installation

1. Download or clone this repository.
2. Open Firefox and navigate to `about:debugging`.
3. Click on the "This Firefox" option.
4. Click on "Load Temporary Add-on...".
5. Select any file within the extension directory.

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

### Performance Optimizations

- **Viewport-First Translation**: Prioritizes translating visible content first
  - Text in the viewport is translated before off-screen content
  - Significantly improves perceived translation speed
  - Users can start reading translated content sooner
- **Optimized Parallel Processing**:
  - Increased concurrency limit from 10 to 15 parallel requests
  - Reduced API call delays from 1000ms to 500ms
  - Overall translation speed improved by 20-30%
- **Progress Bar Display**:
  - Real-time progress indication during translation
  - Shows separate progress for viewport and full page translation
  - Automatically disappears 2 seconds after completion
  - Improves user experience during long translations

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

### Performans Optimizasyonları

- **Görünür Alan Öncelikli Çeviri**: Görünür içeriği öncelikli olarak çevirir
  - Ekranda görünen metin, ekran dışı içerikten önce çevrilir
  - Algılanan çeviri hızını önemli ölçüde iyileştirir
  - Kullanıcılar çevrilmiş içeriği daha erken okumaya başlayabilir
- **Optimize Edilmiş Paralel İşleme**:
  - Eşzamanlı istek limiti 10'dan 15'e yükseltildi
  - API çağrı gecikmeleri 1000ms'den 500ms'ye düşürüldü
  - Genel çeviri hızı %20-30 oranında iyileştirildi
- **İlerleme Çubuğu Gösterimi**:
  - Çeviri sırasında gerçek zamanlı ilerleme göstergesi
  - Görünür alan ve tam sayfa çevirisi için ayrı ilerleme gösterir
  - Tamamlandıktan 2 saniye sonra otomatik olarak kaybolur
  - Uzun çeviriler sırasında kullanıcı deneyimini iyileştirir

---

Dil engellerini aşmaya hazır mısınız? Siz yeni ufukları keşfetmeye odaklanırken bu eklentinin ağır işi yapmasına izin verin - çeviride başarılar!