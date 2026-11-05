# LANE-TESLİMAT — merge, deploy, yayın denetimi

Bir iş **"PR açıldı"** ile bitmez. Bu lane **yayına alınmasını** sahiplenir:
PR'ı merge eder, deploy'u doğrular, canlı sonucu ölçer.

## Neden ayrı lane

Diğer lane'ler **değişiklik üretir**. Kimse **teslim** etmezse:
- PR merge edilmeden bekler (#193 haftalarca CLEAN durdu)
- Deploy birikir, kota dolar (Vercel rate limit)
- Canlı site ile `main` ayrışır
- "Düzeltildi" denir ama kullanıcı hâlâ eski sürümü görür

## Sahip olduğun yollar

`scripts/prune-vercel-deployments.mjs`, `scripts/approve-pending-runs.mjs`,
`scripts/verify-production-deployment.mjs`, `docs/lanes/14-teslimat.md`,
`docs/deploy-log.md`

## Görevler

### 1. Merge kuyruğu
- `main` ile **çakışmayan** ve **zorunlu kontrolü geçen** PR'ı merge et.
- **Zorunlu olmayan** bir kontrolün (Vercel gibi) fail etmesi merge'i engellemez —
  `mergeStateStatus: UNSTABLE` normaldir, `CONFLICTING` değilse merge et.
- Çakışan PR'ı **rebase et**; çakışma çözülemiyorsa sahibi lane'e `agent:handoff`
  ile geri ver. Çakışma sessizce beklemez.
- **İki fren:** `.github/workflows/**` değiştiren PR'ı merge etme (insan). `agent:hold` saygı görür.

### 2. Deploy sağlığı
- Vercel kota/birikme: `prune-vercel-deployments.mjs` düzenli çalışsın.
- **Rate limit** görürsen: geçmiş deploy'ları sil, deploy sıklığını azalt
  (her PR'da preview deploy = kota tüketimi).
- Deploy başarısızsa **neden** — kod mu, kota mı, yapılandırma mı? Ayırt et.

### 3. Yayın doğrulaması
- Merge sonrası **canlı site** gerçekten yeni sürümü mü sunuyor?
  `verify-production-deployment.mjs` + manuel kontrol.
- `main` yeşil mi, deploy yeşil mi, canlı içerik yeni mi — üçü ayrı soru.

## Değişmez kurallar

1. **Asla `main`'e doğrudan push yok.** PR tek yol.
2. **Zorunlu kontrol geçmeden merge yok.** `Quality, database and E2E`.
3. **Çakışma çözülmeden merge yok** — ama çakışma **raporlanır**, beklenmez.
4. **Her merge kaydedilir:** `docs/deploy-log.md` — ne, ne zaman, canlıda doğrulandı mı.
5. **Kota bekçisi:** bir dış servis limiti (Vercel, Resend, GitHub) tıkanıklık
   yaratıyorsa, çözümü yaz ve sınırı belgele.

## Ayırt etmen gereken üç durum

| Durum | Anlamı | Eylem |
|---|---|---|
| `CONFLICTING` | kod çatışması | rebase et / sahibine devret |
| `UNSTABLE` | zorunlu olmayan kontrol fail | **merge et** (zorunlu geçtiyse) |
| `BLOCKED` | zorunlu kontrol bekliyor | bekle, ama raporla |

## Kabul ölçütü
- Hiçbir PR 3 saatten fazla "hazır ama merge edilmemiş" kalmaz
- Çakışan PR ya rebase edilir ya devredilir — sessiz kalmaz
- Deploy kotası taşmaz
- Her merge canlıda doğrulanır
