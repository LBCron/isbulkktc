# Operatör lane'i — sistem bekçisi

Bu lane **alan işi yapmaz**. Sistemin çalışır kalmasını sağlar: kotalar, tıkanıklıklar,
token israfı, döngüler, ölü kaynaklar. Alan işi (auth, SEO, CV, tasarım…) uzman
lane'lere **emir** olarak verilir.

## Rol ayrımı

| Operatör (bu lane) | Uzman lane |
|---|---|
| Kota/tıkanıklık/israf tespiti ve giderme | Alanının kodunu yazmak |
| Merge kuyruğu, deploy sağlığı | PR'ı hazırlamak |
| Lane'lerin çalıştığını doğrulamak | Görevi bitirmek |
| Sorunu **kanıtla** issue açmak | Issue'yu çözmek |
| Harness (kickoff, autopilot, health) | Uygulama kodu |

## Her turda çalıştır (sırayla)

```bash
# 1. Sistem sağlığı — tıkanıklık var mı?
node scripts/system-health.mjs

# 2. Ölü sandbox / kota
curl -s -H "Authorization: Bearer $OPENHANDS_API_KEY" \
  "https://app.all-hands.dev/api/v1/sandboxes/search?limit=100" | \
  python3 -c "import sys,json;d=json.load(sys.stdin);i=d.get('items',[]);print('toplam',len(i),'RUNNING',len([x for x in i if x.get('status')=='RUNNING']))"

# 3. Lane'ler çalışıyor mu, hangi işte?
node scripts/lane-autopilot.mjs --dry-run

# 4. Bir tur ilerlet
node scripts/lane-autopilot.mjs
```

## Kota envanteri — hangisi dolar, nasıl açılır

| Servis | Limit | Dolunca belirti | Çözüm |
|---|---|---|---|
| **GitHub Actions** | **sınırsız** (public repo) | — | 🟢 yok |
| **Docker Hub** | 100 çekme/6 saat (anonim) | `toomanyrequests: Rate exceeded` | `DOCKER_USERNAME`+`DOCKER_PASSWORD` secret (ekli) |
| **Vercel** | 100 deploy/gün | `Deployment rate limited` | `scripts/prune-vercel-deployments.mjs` |
| **Resend** | 100/gün, 3000/ay | API 429 | hacim azalt |
| **Supabase e-posta** | 30/saat | GoTrue 429 | test sayısını sınırla |
| **OpenHands sandbox** | 20 oluşturma/gün | `Daily sandbox limit of 20 reached` | `pruneSandboxes` (autopilot'ta) |

**Ders:** dış kota hataları **kod hatası gibi görünür**. Önce servis mesajını oku
(`Rate exceeded`, `rate limited`), kod aramaya başlama.

## Tıkanıklık aileleri (hepsi "iş sürüyor sanılan ama olmayan")

| # | Görünen | Gerçek | Düzeltme |
|---|---|---|---|
| 1 | lane bloklu | `agent:blocked` iki anlamlıydı | `agent:handoff` ayrıldı |
| 2 | dal iş sürüyor | squash-merge edilmiş dal "1 önde" görünür | `working` veya açık PR şartı |
| 3 | sandbox hazır | `resume` sonrası `STARTING` | `waitForSandboxReady` |
| 4 | lane boşta | `send-message` ile meşgul ama start-task `READY` | `execution_status=running` sayılır |

**Yeni bir tıkanıklık görürsen:** aynı sınıfta mı diye sor — "bir sinyal yanlış
okunuyor mu?" Genelde cevap evet.

## API reçeteleri (kanıtlanmış)

```bash
# Model yükselt (ORG seviyesi — user seviyesi SESSİZCE yok sayılır)
ORG=$(curl -s -H "Authorization: Bearer $OPENHANDS_API_KEY" \
  https://app.all-hands.dev/api/keys/current | python3 -c "import sys,json;print(json.load(sys.stdin)['org_id'])")
curl -s -X PATCH -H "Authorization: Bearer $OPENHANDS_API_KEY" -H "Content-Type: application/json" \
  "https://app.all-hands.dev/api/organizations/$ORG/settings" \
  -d '{"agent_settings_diff":{"llm":{"model":"openhands/deepseek-v4-pro"}}}'

# Supabase auth config oku/yaz
curl -s -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  "https://api.supabase.com/v1/projects/uwmhquvzbilbfzdrlxmb/config/auth"
# PATCH ile şablon yükle; ~60 sn yayılma gerekir

# Bekleyen (onay gerektiren) workflow run'ları onayla
node scripts/approve-pending-runs.mjs

# Lane'leri başlat / iş dağıt
node scripts/lane-autopilot.mjs
```

## Tuzaklar (pahalıya öğrenildi)

1. **Sandbox sıfırlanır** → `bun`, git `insteadOf`, `~/.openhands/memory` kaybolur.
   Her turda: `bash scripts/bootstrap-bun.sh` + `git config --global url."https://${GITHUB_PERSONAL_ACCESS_TOKEN}@github.com/".insteadOf "https://github.com/"`.
2. **Ayarlar API'si `_diff` ister.** `{"agent_settings":…}` sessizce yok sayılır;
   `{"agent_settings_diff":…}` çalışır. `{"message":"Settings stored"}` **uygulandı demek değil** — doğrula.
3. **Yayılma gecikmesi ~60 sn.** Hemen test etme, yanıltıcı sonuç alırsın.
4. **`gh --jq` JS template literal içinde** `"\\(.id)"` gerekir, yoksa filtre literal yazar.
5. **Merge kapısı:** yalnız `mergeable === 'CONFLICTING'` merge'i durdurur.
   `mergeStateStatus: UNSTABLE` (zorunlu olmayan kontrol fail, örn. Vercel) **engellemez**.
6. **Public repo = sınırsız Actions dakikası.** "Habire CI çalıştırma" korkusu yersiz;
   asıl maliyet Vercel + Docker Hub'da.

## Yapılmayacaklar

- **Bot trafiği / sahte tıklama** — Google ceza verir, sıralama düşer.
- **CSP gevşetmek** (üçüncü taraf sohbet/script) — sahibe sormadan yapma.
- **Secret'ı repoya commit etmek** — secret olarak ekle, asla dosyaya yazma.
- **Doğrulanmamış iddia** — "düzeltildi" demek için kanıt şart.

## Devir (bu lane'i kopyalamak)

Bu dosya + `scripts/system-health.mjs` + `scripts/lane-autopilot.mjs` +
`docs/lanes/*` = operatörün tamamı. Yeni bir operatör lane'i başlatmak için:
brief olarak bu dosyayı ver; repodaki araçlar ve brief'ler kalıcıdır, sandbox
hafızası değildir. **Bilgi repoda yaşar, konuşmada değil.**
