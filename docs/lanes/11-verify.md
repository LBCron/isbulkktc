# LANE-VERIFY — olgunlaşma sonrası gerçek dünya doğrulaması

Diğer lane'ler **düzeltir**. CI **kodu** kontrol eder. Bu lane **sonucu** kontrol
eder: düzeltme gerçekten işe yaradı mı?

Bir değişiklik "merge edildi" demek "çalışıyor" demek değildir. Mail gönderildi
mi, gelen kutusuna mı düştü? Site indekslendi mi? Bu lane o boşluğu kapatır.

## Ne zaman çalışır

Bir düzeltme **olgunlaştıktan sonra** — yani merge edilip yayına çıktıktan ve
dış sistemlerin (DNS, arama motoru, e-posta sunucusu) onu görmesi için gereken
süre geçtikten sonra. Hemen değil: DNS yayılımı ve indeksleme gecikmelidir.

## Üç katman

### Katman 1 — kimlik doğrulama (otomatik, kimlik bilgisi gerekmez)

- **SPF:** `isbulkktc.com` TXT kaydı Resend/Amazon SES'i içeriyor mu? Lookup
  sayısı 10'u aşıyor mu?
- **DKIM:** `resend._domainkey` var mı, `p=` geçerli mi?
- **DMARC:** politika ne (`p=none|quarantine|reject`)? `rua` raporluyor mu?
- **Hizalama:** SPF domain'i ile DKIM `d=` domain'i From adresiyle hizalı mı?
- **RBL:** `isbulkktc.com` bir kara listede mi (Spamhaus vb.)?
- **MX:** gelen posta doğru yere mi gidiyor?

Bunlar deterministik ve kimlik bilgisi gerektirmez — her geçişte çalışabilir.

### Katman 2 — spam skoru (otomatik, üçüncü taraf)

**mail-tester.com**: benzersiz bir adres verir, oraya e-posta gönderirsin,
sana **/10 skor** + SPF/DKIM/DMARC/SpamAssassin dökümü verir. "Gelen kutusu mu
spam mi" sorusunun kimlik bilgisi gerektirmeyen en yakın cevabı.

Skor 10/10 olmalı. Altındaysa hangi kural düştü, rapor okuyup düzeltme öner.

### Katman 3 — gerçek gelen kutusu (kimlik bilgisi gerekir)

Asıl cevap bu: **e-posta Gmail/Outlook gelen kutusuna mı düştü, spam'e mi?**

Test adresleri (sahibin verdiği):
- `muhammed.ali.kahraman@outlook.com`
- `letgodeneme97@outlook.com`
- `orijinus.1997@gmail.com`

Bunu otomatik okumak için **ya IMAP app password ya da Microsoft Graph token**
gerekir; ikisi de repoda yok. Bu yüzden:

1. Lane test e-postasını gönderir ve **başlıkları** kaydeder
   (`Authentication-Results: spf=pass dkim=pass dmarc=pass` olmalı).
2. Yerleşim (gelen kutusu/spam) **insan onayı** ister — ya da sahip app
   password/Graph token verirse otomatikleşir.
3. Onay gelene kadar lane "gönderildi, yerleşim doğrulanmadı" der — **doğrulanmamış
   iddiada bulunmaz**.

## Kurallar

- **Doğrulanmamış iddia yok.** "Düzeltildi" demek için kanıt: DNS çıktısı, skor
  sayfası, başlıklar ya da gelen kutusu ekran görüntüsü.
- Ölçümü **yayına çıktıktan sonra** yap; hemen ölçmek yanlış negatif verir.
- Sonucu issue'ya yaz: ölçülen, beklenen, fark. Düzeltme gerekiyorsa sahibi lane'e
  `agent:handoff` ile devret.
- `main`'e push YOK; kanıt ve rapor PR'ı.

## Sahip olduğun yollar

`tests/verify/**`, `scripts/verify-*.mjs`, `docs/lanes/11-verify.md`,
`docs/verification-log.md`

## Komut

```bash
node scripts/verify-deliverability.mjs           # katman 1 + 2 raporu
node scripts/verify-deliverability.mjs --send     # + gerçek test e-postası
```
