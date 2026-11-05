# Doğrulama günlüğü

Olgunlaşma sonrası gerçek dünya ölçümleri. Her satır **ölçülen** bir sonuçtur,
iddia değil.

## 2026-11-05 — e-posta teslim edilebilirliği

### Kimlik doğrulama (DNS, otomatik)

```
domain: isbulkktc.com | Resend status: verified | region: eu-west-1
  DKIM  resend._domainkey        verified
  SPF   send.isbulkktc.com       verified   v=spf1 include:amazonses.com ~all
  MX    send.isbulkktc.com       feedback-smtp.eu-west-1.amazonses.com
  SPF   rsend (return-path)      verified   send.forge.rmta.net
```

| Alan | Durum | Not |
|---|---|---|
| DKIM | PASS | `resend._domainkey`, 216 karakter anahtar |
| SPF | PASS | `send` alt alan adında; zarf göndericisi üzerinden geçer |
| DMARC | WARN | `p=none` — izleme modu, zorlayıcı değil |
| MX | PASS | Cloudflare Email Routing |
| Blocklists | PASS | Spamhaus/SpamCop/SORBS temiz |
| Resend domain | PASS | `verified` |

### Gerçek gönderim testleri

| # | İçerik | Resend sonucu | ID |
|---|---|---|---|
| 1 | Sade teslim testi | `delivered` | `01a1acc2-212f-72e5-a417-61e19b0f4bba` |
| 2 | **Gerçek marka şablonu** (logo + marka yeşili + footer) | `delivered` | `01a1acc6-7d7a-7518-9c17-5289b135a47f` |

`delivered` = alıcı sunucu kabul etti. **Gelen kutusu/spam ayrımı** için
3 gerçek adreste insan onayı gerekir (#187).

### Şablon kalitesi ölçümü

| Şablon | `<img>` | Satır içi stil | `<style>` | `<div>` |
|---|---|---|---|---|
| `email-layout.ts` (transactional) | 1 | 29 | 2 | 8 |
| `supabase/templates/*.html` (7 auth) | **0** | **0** | 1 | 5 |

Auth şablonları görselsiz ve satır içi stilsiz → Gmail/Outlook'ta düz yazı.
Düzeltme: #171.

### Açık kalan

- [ ] DMARC `p=quarantine` (LANE-CLOUDFLARE)
- [ ] mail-tester.com 10/10 skoru (LANE-VERIFY, #187)
- [ ] 3 adreste gelen kutusu doğrulaması (insan onayı, #187)
- [ ] Auth şablonlarında marka kimliği (#171)

## 2026-11-05 — arama görünürlüğü

| Kontrol | Sonuç |
|---|---|
| robots.txt | Allow: / (yalnız /api/, /auth/ kapalı) |
| Googlebot / Bingbot | HTTP 200 |
| google-site-verification | canlı HTML'de var |
| canonical | mutlak string, doğru |
| hreflang | 6 dil + x-default |
| noindex | yok |
| sitemap.xml | 200, 207 URL |
| IndexNow | key canlı, workflow günlük success |
| Bing indeksi | **görünüyor** |
| Google indeksi | yok (7 haftalık domain) |

**Teşhis:** teknik engel yok; otorite/hacim sorunu. Domain yaşı 7 hafta,
207 URL, backlink yok. Bot trafiği **uygulanmadı** (spam cezası riski).
