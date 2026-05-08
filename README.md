# 📊 Discord Data Studio

![Discord Data Studio Banner](discord_data_studio_banner_1778274731146.png)

Discord verilerinizi analiz etmek, yedeklemek ve yönetmek için tasarlanmış, güçlü ve modern bir masaüstü uygulamasıdır.

## ✨ Özellikler

- 🔍 **Gelişmiş Veri İndeksleme**: Tüm DM geçmişinizi ve mesaj verilerinizi hızlıca tarayın ve indeksleyin.
- 📂 **Arşivleme ve Yedekleme**: Mesajlarınızı yerel olarak güvenli bir şekilde saklayın ve istediğiniz zaman çevrimdışı görüntüleyin.
- 📥 **Dosya Yöneticisi**: Tüm ekleri (resim, video, dosya) toplu olarak indirme özelliği.
- 🧹 **Toplu İşlemler**: Mesajları toplu silme, dışa aktarma (JSON/CSV) ve düzenleme.
- 📈 **Veri Analizi**: Mesajlaşma istatistiklerinizi ve etkileşim grafiklerinizi inceleyin.
- 🎨 **Modern Arayüz**: Karanlık mod odaklı, hızlı ve kullanıcı dostu React tabanlı arayüz.

## 🚀 Başlangıç

Projeyi yerel makinenizde çalıştırmak için aşağıdaki adımları izleyin.

### Gereksinimler

- [Node.js](https://nodejs.org/) (v20 veya üzeri önerilir)
- npm veya yarn

### Kurulum

1. Depoyu klonlayın:
   ```bash
   git clone https://github.com/Paradox-Forge/discord-data-studio.git
   ```
2. Proje dizinine gidin:
   ```bash
   cd discord-data-studio
   ```
3. Bağımlılıkları yükleyin:
   ```bash
   npm install
   ```

### Kullanım

Geliştirme modunda başlatmak için:
```bash
npm run dev
```

Uygulamayı paketlemek (Build) için:
```bash
npm run build:desktop
```

## 🛠️ Teknoloji Yığını

- **Framework**: [Electron](https://www.electronjs.org/)
- **Frontend**: [React](https://reactjs.org/) + [Vite](https://vitejs.dev/)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/)
- **State Management**: [Zustand](https://github.com/pmndrs/zustand)
- **Networking**: [Axios](https://axios-http.com/)
- **Icons**: [Lucide React](https://lucide.dev/)

## ⚠️ Güvenlik Uyarısı

Bu uygulama Discord Kullanıcı Token'ınızı (User Token) kullanır. Bu tür araçların kullanımı Discord Hizmet Koşulları'nı (ToS) ihlal edebilir. Tüm sorumluluk kullanıcıya aittir. Token'ınız yalnızca oturum süresince bellekte tutulur ve asla sunucularımıza gönderilmez veya diske kaydedilmez.

## 📄 Lisans

Bu proje **Apache License 2.0** ile lisanslanmıştır. Detaylar için [LICENSE](LICENSE) dosyasına göz atabilirsiniz.
