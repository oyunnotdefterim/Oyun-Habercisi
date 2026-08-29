# Steam Deal Notifier

Steam + PS Store'daki **tüm indirimleri** (küçük büyük fark etmeksizin) tarar,
her yeni indirimi **Telegram'a mesaj olarak** haber verir. Tasarım/görsel işini
sen kendin yapıyorsun — bu sistem sadece "hangi oyun ne kadar indirimde"
bilgisini sana en hızlı şekilde ulaştırıyor. GitHub Actions üzerinde 3 saatte
bir kendiliğinden çalışır.

## 1) Telegram bot kurulumu (5 dakika)

1. Telegram'da **@BotFather**'a yaz, `/newbot` komutunu gönder, botuna bir isim ver.
   Sana bir **bot token** verecek (örn. `123456789:AAExxxxxxxxxxxxxxxxxxxxxx`) — bunu kaydet.
2. Yeni botunla bir sohbet başlat, herhangi bir mesaj gönder (örn. "merhaba").
3. Tarayıcıdan şu adrese git (TOKEN yerine kendi token'ını yaz):
   `https://api.telegram.org/botTOKEN/getUpdates`
4. Dönen JSON içinde `"chat":{"id": 123456789, ...}` şeklinde bir alan göreceksin —
   o sayı senin **chat ID**'n.

(İstersen bunun yerine bir Telegram **kanalı** veya **grubu** da kullanabilirsin,
sadece o zaman botu o kanala/gruba admin olarak eklemen ve chat ID'yi ona göre
alman gerekir — istersen bu adımı birlikte de yapabiliriz.)

## 2) Kurulum

```bash
git clone <bu-repo>
cd steam-deal-bot
npm install
```

Bu repoyu kendi GitHub hesabına yükle (yeni bir repo oluşturup push et).

## 3) Gerekli secret'lar

Repo → **Settings → Secrets and variables → Actions → New repository secret**

| Secret adı | Nereden alınır |
|---|---|
| `ITAD_API_KEY` | isthereanydeal.com üzerinde ücretsiz hesap aç → API key üret |
| `TELEGRAM_BOT_TOKEN` | Yukarıdaki 1. adımda BotFather'dan aldığın token |
| `TELEGRAM_CHAT_ID` | Yukarıdaki 3-4. adımda bulduğun chat ID |

## 4) Test etme

Actions sekmesinden `Steam Deal Notifier` workflow'unu seç, **"Run workflow"**
ile manuel çalıştır, Telegram'a mesaj gelip gelmediğine bak.

## Nasıl çalışıyor

1. `dealsFetcher.js` → ITAD API'den Steam + PS Store'daki tüm indirimleri çeker
   (mağaza ID'leri her çalıştırmada isme göre otomatik bulunur, sabit değildir)
2. `steamReviews.js` → Steam öğelerini Steam'in kendi inceleme puanına göre filtreler,
   sadece **"Olumlu"** ve **"Çok Olumlu"** olanlar geçer (PS Store'da bu puanlama
   sistemi olmadığı için PS Store indirimleri filtresiz geçer)
3. `index.js` → daha önce haber verilmemiş olanları filtreler
4. `telegramNotifier.js` → bunları tek (gerekirse birkaç parçaya bölünmüş) özet
   mesaj halinde Telegram'a gönderir
5. `data/posted.json` → hangi indirimlerin haber verildiğini kaydeder, aynısı
   tekrar gönderilmez

## Inceleme puanı filtresini değiştirmek istersen

`src/steamReviews.js` içindeki `ALLOWED_SCORES` listesi şu an sadece
`"Very Positive"` (Çok Olumlu) ve `"Positive"` (Olumlu) içeriyor. İstersen
`"Mostly Positive"` (Genel Olarak Olumlu) veya `"Overwhelmingly Positive"`
(Şaşırtıcı Derecede Olumlu) da eklenebilir — tek satırlık bir değişiklik.

## Bilinmesi gereken önemli nokta

"Tüm indirimler" seçildiği için **ilk çalıştırmada** Steam'de o an indirimde olan
her şey (genelde birkaç bin oyun) tek seferde Telegram'a düşecek — bu ilk mesaj
grubu epey kalabalık olacak. Sonraki çalıştırmalarda sadece *yeni* indirime girenler
gelir, o yüzden normale döner. İstersen ilk çalıştırmayı "sessize al" (state dosyasını
elle doldurup hiç mesaj göndermeden başlat) ya da eşiği başta biraz yükseltip
(`MIN_DISCOUNT_PERCENT`) sonra düşürme gibi bir yol da izleyebiliriz — istersen
bunu birlikte ayarlarız.
