# Artidentia Studio

Mobil uyumlu kurumsal site ve özel müşteri portalı. Türkçe arayüz, 1,5 saniyelik altın açılış animasyonu, e-posta ile giriş, özel dosya gönderimi, iş takip paneli, yönetici iş listesi ve herkese kapalı fiyat yönetimi dahildir.

## Kurulum — Railway

1. GitHub'da `recepfb-46/artidentia-studio` deposuna bu klasörün **içindeki tüm dosyaları** yükleyin. `server.js`, `package.json`, `railway.json` ve `public` klasörü depo ana dizininde olmalıdır; ZIP dosyasını doğrudan yüklemek işe yaramaz.
2. Railway'de **New Project → Deploy from GitHub repo** ile bu depoyu seçin.
3. Railway servisinizde **Volume** ekleyin; mount path: **`/data`**. Veri ve dosyalar kalıcı disk olmadan silinebilir.
4. Railway → Variables içine:
   - `NODE_ENV=production`
   - `DATA_DIR=/data`
   - `ADMIN_EMAIL=yonetici@kendi-adresiniz.com` (gerçek e-postanızı girin)
   - `ADMIN_PASSWORD=` (benzersiz, güçlü, en az 12 karakterlik şifre)
5. Önce Railway'in geçici alan adından `/api/health` bağlantısını kontrol edin. Müşteri hesabı oluşturup **kimliksiz bir test dosyası** yükleyin, işi ve yönetici görünümünü sınayın.
6. Railway → servis → Settings → Networking → Custom Domain ile `artidentiastudio.com` ekleyin. Railway'in gösterdiği DNS kayıtlarını, mevcut sitenizin alan adı yönetim ekranında uygulayın. Eski siteyi doğrulama bitmeden kesmeyin.

## Lokal başlatma

```bash
npm install
ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD='replace-this-secret-passphrase' npm start
```

http://localhost:3000

## Önemli notlar

- **Mevcut sitenin gerçek kaynak dosyaları bu projeye aktarılmamıştır.** Bu, Artidentia Studio için yeni hazırlanmış, görsel açıdan benzer amaçlı özgün bir sürümdür. Mevcut domain/deploy'a otomatik dokunulmaz.
- Yönetici parolası sadece ilk açılışta oluşturulur; sonradan ortam değişkeni ile otomatik değişmez.
- Fiyat listesi sadece `admin` hesabından görüntülenebilir; ziyaretçiler ve müşteriler için fiyat API'si kapalıdır.
- Tek dosya 150 MB, en fazla 8 dosya; izin verilen uzantılar STL, PLY, OBJ, 3MF, ZIP, RAR, 7Z, PDF, JPG, PNG, WEBP, DCM/DICOM. Sunucu/proxy limitleri ayrıca geçerli olabilir.
- Bu sürümde e-posta doğrulama, şifre sıfırlama, virüs taraması, yedekleme, detaylı denetim kayıtları ve kullanıcı KVKK belgeleri **bulunmuyor**. Gerçek hastaya ait kimlikli sağlık verileriyle kullanmadan önce KVKK uygunluğu, saklama/aydınlatma politikaları ve operasyonel güvenlik önlemleri uygulanmalıdır.
- Repo `Public` kalırsa kaynak kod herkesçe görülebilir. Gerçek hasta dosyalarını ve yönetici parolasını asla GitHub'a eklemeyin. GitHub deposunu `Private` yapmak önerilir.
- https://artidentiastudio.com/ alan adının mevcut DNS/SSL durumunu buradan değiştirmedim.
