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
| Blocklists | ~~PASS~~ ⚠️ | **geçersiz** — araç alan adını yalnız-IP bölgelerine soruyordu; bkz. tur 2 |
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

## 2026-11-05 — araç doğruluğu düzeltmesi (LANE-VERIFY, #187 tur 2)

İlk ölçümdeki iki "temiz" sonuç **yanlıştı**: araç, gerçek durumu değil kendi
sorgu hatasını raporluyordu. Ölçüm aracının kendisi denetlendi.

### Ölçülen (dns.google, 2026-11-05)

```
isbulkktc.com            v=spf1 include:_spf.mx.cloudflare.net ~all
send.isbulkktc.com       v=spf1 include:amazonses.com ~all          <- Resend (aligned)
rsend.isbulkktc.com      send.forge.rmta.net. + v=spf1 ip4:52.3.252.119 ip4:44.222.39.36 ip4:199.249.231.0/24 ~all
resend._domainkey        p=MIGf… (216 karakter)                     <- DKIM
_dmarc.isbulkktc.com     v=DMARC1; p=none; rua=mailto:dmarc@isbulkktc.com; fo=1
MX                       3 route{1,2,3}.mx.cloudflare.net
```

### Düzeltilen araç bulguları (`scripts/verify-deliverability.mjs`)

| # | Bulgu (gözlenen) | Beklenen | Düzeltme |
|---|---|---|---|
| 1 | SPF "FAIL: amazonses.com YOK" — yalnız kök TXT'ye bakıyordu | Envelope (Return-Path) alt alanı kontrol edilmeli; `send`/`rsend` SPF'yi taşır | `returnPathAlignment()`: alt alan SPF'si + DMARC relaxed alignment → `WARN` (kök) + `PASS` (Return-Path) |
| 2 | Lookup sayımı tüm dizgede `mx` arıyordu → `_spf.mx.cloudflare.net` içindeki `mx` ikinci lookup sayılıyordu (1 yerine 2) | RFC 7208 §4.6.4 terim bazlı sayım | `countSpfDnsLookups()` token bazlı; 1 döndürür |
| 3 | `zen.spamhaus.org` ve `bl.spamcop.net`'e **alan adı** soruluyordu; ikisi de yalnız IP bölgesi → daima NXDOMAIN → "temiz" | Alan bölgeleri: `dbl.spamhaus.org`, `multi.surbl.org`; IP bölgeleri: `zen`, `bl.spamcop.net` (ters IPv4) | Sorgu formu bölge türüne göre ayrıldı |
| 4 | `127.255.255.252/254/255` (Spamhaus "sorgu reddedildi") `clean` sayılıyordu | Reddetme = bilinmiyor, temiz değil | `classifyDnsblAnswer()` yeni `refused` durumu |
| 5 | Zone erişilebilirliği kanıtlanmadan "temiz" deniyordu | Bilinen-listeli sentinel önce sorgulanmalı | `evaluateBlocklistZone()` sentinel kapısı; erişilemez bölge `unqueryable` |
| 6 | `dnsbl.sorbs.net` sorgulanıyordu | SORBS 2024-06-05'te kapandı | Kaldırıldı |

### Yeni ölçüm çıktısı (aynı gün, `node scripts/verify-deliverability.mjs`)

```
WARN SPF         kök kayıt göndericiyi yetkilendirmiyor, ama send.isbulkktc.com (Return-Path) yetkilendiriyor ve DMARC-aligned
PASS SPF         send.isbulkktc.com (Return-Path) SPF göndericiyi yetkilendiriyor
PASS DKIM        resend._domainkey var, 216 karakter
WARN DMARC       p=none — yalnız izleme
PASS MX          3 Cloudflare route
WARN Blocklists  multi.surbl.org ve bl.spamcop.net temiz; dbl/zen.spamhaus.org erişilemez (sorgu reddedildi)
FAIL Resend      anahtar re_ ile başlamıyor (len 36) — #186, insan düzeltmesi
```

Spamhaus bölgeleri bu çözümleyiciden (Google Public DNS) yanıt vermiyor —
sentinel kapısı bunu "temiz" diye raporlamak yerine `unqueryable` olarak
işaretliyor. Ölçüm artık kendi hatasını temizlik sanmıyor.

### Testler

`scripts/verify-deliverability.test.mjs` (yeni): 10 test — SPF terim sayımı ve
10-lookup sınırı, gönderici yetkilendirme (SES / `ip4:`) + sahte "amazonses"
alt dizesi, `ip4:`/`ip6:` çıkarımı, DNS present/absent/error ayrımı, DNSBL
listed/refused/clean, ters IPv4, sentinel kapısı, DMARC relaxed alignment.
`bun run test:unit` içinde koşar.

## 2026-11-05 — tur 3: SPF yetkilendirmede yanlış pozitif (LANE-VERIFY, #187)

Tur 2'nin `spfAuthorisesSender()` düzeltmesi fazla gevşekti: `amazonses\.com`
alt dize eşlemesi, **`include:notamazonses.com`** ve
**`include:amazonses.com.evil.example`** kayıtlarını "göndericiyi yetkilendiriyor"
sayıyordu — yani yetkisiz bir kayıt `PASS` görünüyordu. Bu, tur 2'de kapattığım
sınıfın (yanlış "temiz") tam tersi yönde bir yanlış "PASS"ıydı.

| # | Boyut | Gözlenen | Beklenen | Düzeltme |
|---|---|---|---|---|
| 7 | Doğruluk | `spfAuthorisesSender("v=spf1 include:notamazonses.com ~all")` → `true` | `false` | Mekanizma tam eşleşme (`include:amazonses.com`); yalnız çıplak/`+` kabul, sondaki nokta kabul, `-`/`~`/`?` kabul değil |

Ölçüm (düzeltme sonrası, aynı gün): SPF değerlendirmesi değişmedi —
`send.isbulkktc.com` gerçek `include:amazonses.com` taşıdığı için `PASS`.
Yani düzeltme yalnız yanlış pozitifi kapatır, doğru sonucu değiştirmez.

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

## 2026-11-05 — tur 4: arama görünürlüğü artık ölçülebilir (LANE-VERIFY, #187)

Yukarıdaki tablo elle ölçülmüştü ve yeniden üretilebilir bir aracı yoktu
(`verify-production-deployment.mjs` yalnız HTTP durumuna bakıyor). Aynı sınıf
hata — aracın kendi kusurunu sonuç sanması — arama yüzeyinde de mümkün olduğu
için ölçüm otomatikleştirildi.

**Yeni araç:** `scripts/verify-indexing.mjs` (`npm run indexing:verify`),
`scripts/verify-indexing.test.mjs` (13 test). Kaynak yok, kimlik bilgisi yok;
Cloudflare meydan okuması `skip` sayılır (yanlış `fail` değil).

Ölçtüğü dört katman: robots.txt (izin + sitemap ilanı), sitemap (`<loc>`
mutlak/aynı origin/`/tr` öneki yok + tam hreflang seti), örneklenen sayfalar
(200 + `noindex` yok + canonical sitemap `<loc>` ile eşleşiyor), IndexNow
anahtar dosyası (gövde anahtarla eşleşiyor).

### Ölçülen (canlı, 2026-11-05)

```
PASS robots     allows crawling; sitemap https://isbulkktc.com/sitemap.xml
PASS sitemap    207 URLs, all on-origin canonical; 186 with the full hreflang set,
                21 single-locale (no hreflang)
PASS single-loc 3 single-locale entries: the localized duplicate canonicalises back
PASS pages      8 sampled pages are 200, indexable, with a matching canonical
PASS indexnow   key file matches isbulkkt…
0 failure(s), 0 warning(s), 0 skipped
```

Yukarıdaki elle tabloyu **doğruluyor**: robots izin veriyor, canonical mutlak,
hreflang tam, `noindex` yok, sitemap 207 URL, IndexNow anahtarı canlı.

### Aracın kendi kusuru (düzeltildi, aynı sınıf)

İlk sürüm **her** sitemap girdisinde hreflang seti zorunlu tutuyordu. 21 iş
ilanı sayfasında yoktu → sahte `FAIL`. Kanıt: `/en/jobs/source-iskibris-mimar`
**200 dönüyor** ama canonical'ı `https://isbulkktc.com/jobs/source-iskibris-mimar`
(Türkçe URL). Yani o sayfalar tek dilli; yerelleştirilmiş kopyalar tek canonical'a
birleşiyor. Hreflang seti **isteğe bağlı** olmalı — zorunlu tutmak, kopya URL'leri
alternate ilan edip kümeyi bölerdi. Kural düzeltildi; tek dilli girdi için
"yerelleştirilmiş kopya geri canonical'lanıyor mu" kanıtı eklendi (`single-loc`).

Bu, tur 2 (blokliste yanlış "temiz") ve tur 3 (SPF yanlış "PASS") ile aynı
sınıf: ölçüm aracının kendi kusuru sonuç gibi okunmamalı.

## Tur 5 — ölçüm araçlarının kendi kusurları (2026-11-05)

Tur 2/3/4'ün ortak teması: **araç kusuru sonuç gibi okunmamalı**. Tur 5 aynı
sınıftan beş kusur daha çıkardı; hepsi kendi dosyalarımda (`scripts/verify-*.mjs`)
düzeltildi ve regresyon testiyle sabitlendi.

| # | Dosya | Kusur | Kanıt | Etki | Düzeltme |
|---|---|---|---|---|---|
| 1 | `verify-indexing.mjs` | `evaluateIndexability` `X-Robots-Tag` parametresi alıyor, testi geçiyor; ama `checkPages` ona **hep `null`** veriyordu ve `fetchText` yanıt başlıklarını hiç okumuyordu | kod: `xRobotsTag: null` (satır ~515), `fetchText` yalnız `response.text()` | Yalnız başlıkla `noindex`'lenen sayfa "indexable" görünür | `fetchText` başlığı okur; `verdictForPage` çıkarıldı + test |
| 2 | `verify-indexing.mjs` | robots'un ilan ettiği sitemap `s.startsWith(ORIGIN)` ile seçiliyordu | `https://isbulkktc.com.evil.example/sitemap.xml` → `startsWith` **true** | Rakip/yanlış host sitemap'i takip edilir | `isSameOrigin` (tam origin) + test |
| 3 | `verify-indexing.mjs` | `<meta name=… content=…>` regex'i yalnız `name` önce + çift tırnak | `<meta content="noindex" name="robots">` → `metaRobots=null` | Geçerli `noindex` kaçar; sayfa indexable sanılır | `findMetaContent` (sıra/quote bağımsız) + test |
| 4 | `verify-auth-config.mjs` | `callbackIsAllowed` çıplak origin girdisini (`https://isbulkktc.com`) callback'i kapsıyor sayıyordu | `callbackIsAllowed(origin, origin)` → **true**; GoTrue `glob.MustCompile(uri, '.', '/')` | Allowlist'te callback yokken "sağlıklı" raporlanır | yalnız `…/auth/callback` veya `…/**` kabul + test |
| 5 | `verify-deliverability.mjs` | (temiz — SPF/DKIM/DMARC/IP ayrıştırma tam eşleşmeli, tur 3'te sertleştirildi) | — | — | bakıldı, değişiklik yok |

### Kanıt (dosya:satır, gözlenen → beklenen)

- **#1:** `scripts/verify-indexing.mjs` — `checkPages` içinde `xRobotsTag: null`
  sabitti; `fetchText` yalnız `{status, body, error}` döndürüyordu. Yalnız
  `X-Robots-Tag: noindex` gönderen bir sayfa yeşil geçerdi. Artık başlık okunuyor,
  `verdictForPage` saf fonksiyonu test ediliyor.
- **#2:** `https://isbulkktc.com.evil.example/sitemap.xml` ve
  `https://isbulkktc.com.au/sitemap.xml` `startsWith("https://isbulkktc.com")`
  ile **true** dönüyordu → off-origin sitemap takip edilebilirdi. Tur 3 SPF
  hatasıyla aynı sınıf.
- **#3:** `<meta content="noindex" name="robots">` → `extractPageSignals`
  `metaRobots=null`. HTML'de öznitelik sırası anlamsız.
- **#4:** `callbackIsAllowed("https://isbulkktc.com", "https://isbulkktc.com")`
  → **true**. Supabase dokümanı: *"The separator characters in a URL are defined
  as `.` and `/`"*; GoTrue kaynağı `glob.MustCompile(uri, '.', '/')`
  (`supabase/auth` `internal/conf/configuration.go`). Çıplak origin
  `/auth/callback`'i kapsamaz → yanlış "sağlıklı".

### Canlı ölçüm (değişmedi)

```
node scripts/verify-indexing.mjs   → 0 fail / 0 warn / 0 skip
node scripts/verify-deliverability.mjs
  WARN SPF   kök kayıt göndereni yetkilendirmiyor; Return-Path alt alanı yetkili + DMARC hizalı
  PASS SPF   send.isbulkktc.com (Return-Path) yetkili
  PASS DKIM  resend._domainkey, 216 karakter
  WARN DMARC p=none (yalnız izler, uygulamaz)
  PASS MX    3 Cloudflare route
  WARN Blocklists surbl/spamcop temiz; spamhaus sorgulanamadı (datacenter IP)
  FAIL Resend anahtar `re_` ile başlamıyor (len 36) → #186 (insan)
```

Katman 2/3 (gerçek gönderim, spam skoru) hâlâ #186 + #170 yüzünden ölçülemez;
doğrulanmamış iddia yok. `/en|/de|/ru/jobs/<slug>` **200 + geri canonical**
(soft-duplicate birleşme) doğrulandı.

Testler: `scripts/verify-indexing.test.mjs` 16/16, `scripts/verify-auth-config.test.mjs`
3/3. Kapılar: lint/typecheck/check:frontend-source ✅, `test:unit` 589 (585 pass,
0 fail, 4 todo), `test:security` 77 (75 pass, 0 fail, 2 todo).
