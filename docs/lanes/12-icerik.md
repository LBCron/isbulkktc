# LANE-İÇERİK — kullanıcı metni, 6 dil, ürün dili

Kullanıcının **gördüğü her kelimenin** sahibi. `src/messages/**` (6 dil) ve
kullanıcı yüzeyindeki metin.

## Neden ayrı lane

Bu alan **sahipsizdi**. Sonuç: iç veri kalitesi metrikleri kullanıcı yüzeyine
sızdı (#220 — "Güvenilir ilçe bilgisi bulunmayan 53 şube…"). Kimse sahibi
olmadığı için kimse fark etmedi.

## Sahip olduğun yollar

`src/messages/**` (tr, en, ru, el, fa, de), `src/i18n/**`,
`src/content/**` (metin kısmı; JSON-LD üreticileri GEO'nun)

## Değişmez kurallar

1. **6 dil zorunlu.** Bir anahtar bir dilde varsa hepsinde olmalı. Eksik anahtar
   test ile yakalanır.
2. **Anahtar yeniden adlandırılırsa** aynı PR'da tüm diller güncellenir.
3. **Yer tutucular korunur:** `{count}`, `{name}` birebir.
4. **Çeviri değil, uyarlama.** Kelime kelime değil; dilin kendi doğallığında.
5. **Uzun metin `de` ile, RTL `fa` ile sınanır.**

## Kullanıcı dili kuralları (bu lane'in asıl işi)

### Kullanıcıya yalnızca kendi eylemini açıklayan bilgi gösterilir
- ✅ "Bu ilçede 12 şirket listeleniyor."
- ❌ "Güvenilir ilçe bilgisi bulunmayan 53 şube, filtre seçildiğinde dahil edilmez."

İç metrik (veri kalitesi, kaynak sayısı, eşleşmeyen kayıt) **kullanıcı yüzeyine
girmez** — log, analytics veya iç panel.

### Yasak dil
- İç sistem sözlüğü: "kaynak koordinatları", "senkron", "içe aktarma",
  "veritabanı", "şube sayısı", "dahil edilmez", "hariç tutulur"
- Kusur anlatan ifade: kullanıcı neyi **kaçırdığını** değil, neyi **bulduğunu** görür
- Suçlayıcı hata: "Hatalı giriş yaptınız" → "E-posta biçimini kontrol edin"
- Belirsiz hata: "Bir şeyler ters gitti" → ne olduğu + ne yapılacağı
- Boş durum: "Sonuç yok" → "Bu filtrede sonuç yok. Filtreyi genişletin."

### Ton
Güvenilir, net, yerel (KKTC), abartısız. Emir kipi yerine yönlendirme.

## Denetim protokolü

`docs/lanes/AUDIT.md` uygulanır. Bu lane için ek boyut:

**Her kullanıcı metni için sor:** kullanıcı bunu neden görüyor? Kendi eylemini mi
açıklıyor, yoksa sistemin iç işleyişini mi? İkincisiyse **kaldır** ya da doğru
yere taşı (footer, hukuki sayfa, admin).

`src/messages/**` içinde ara: sayı + iç terim ("kayıt", "şube", "kaynak",
"veri", "dahil edilmez"), olumsuz kusur dili, sistem hata kodu.

## Kabul ölçütü
- Kullanıcı yüzeyinde iç metrik **yok**
- 6 dil tam ve tutarlı
- Uzun metin `de`'de taşmıyor, `fa` RTL doğru
- Her metin kullanıcının eylemini açıklıyor
