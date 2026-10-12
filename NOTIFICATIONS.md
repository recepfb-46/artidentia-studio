# Artidentia Studio: e-posta bildirimleri ve veri güvenliği

## Bildirimleri açma
1. Doğrulanmış bir e-posta alan adı ile Resend hesabı oluşturun.
2. Resend'in verdiği alan adı DNS kayıtlarını Cloudflare'e ekleyin; mevcut web CNAME kayıtlarını değiştirmeyin.
3. Railway Variables içinde aşağıdaki gizli ortam değişkenlerini oluşturun:
   - `RESEND_API_KEY`: Resend API anahtarı (GitHub'a veya sohbet ekran görüntüsüne koymayın).
   - `MAIL_FROM`: doğrulanmış gönderici; ör. `Artidentia Studio <bildirim@artidentiastudio.com>`.
   - `NOTIFY_ADMIN_EMAIL`: bildirim alacak gerçek yönetici adresi. Yoksa `ADMIN_EMAIL` kullanılır.
4. Gerçek hasta dosyası olmadan yeni iş ve teslim senaryolarını test edin.

Anahtarlar tanımlı değilse bildirimler pasif kalır; iş kaydı ve teslim çalışmaya devam eder. Sağlayıcıda hata oluşursa iş başarılı kalır ve hata loglanır. Bu sürümde kalıcı yeniden deneme kuyruğu yoktur.

## Yedekleme ve KVKK sınırları
- `DATA_DIR=/data` ve volume /data kullanılır. Railway Volume tek başına yedek değildir.
- SQLite veritabanının tutarlı yedeği ile uploads klasörü birlikte, şifreli şekilde *ayrı depolamaya* alınmalı, geri yükleme testi yapılmalıdır.
- Bu sürümde otomatik uzak yedekleme, zararlı dosya taraması, şifre sıfırlama, e-posta doğrulaması, tam KVKK uyumu ve saklama/silme talepleri yönetimi **bulunmaz**.
- Gerçek hasta kişisel/sağlık verileriyle üretimde kullanım öncesinde ayrı güvenlik ve mevzuat denetimi gereklidir.
