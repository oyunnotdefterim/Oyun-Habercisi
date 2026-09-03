import fetch from "node-fetch";

// Sadece bu ikisi "geçer" sayılacak (Steam'in Türkçe arayüzündeki karşılıkları):
// "Very Positive"  -> Çok Olumlu
// "Positive"        -> Olumlu
const ALLOWED_SCORES = new Set(["Very Positive", "Positive"]);

// Yorum sayısı çok düşük olan oyunlar (genelde "asset flip" / seri üretim
// shovelware) Steam'in puanlama sisteminde bile "Olumlu" görünebiliyor,
// çünkü sadece birkaç kişi oy vermiş olabilir. Bunu elemek için minimum
// toplam yorum sayısı şartı ekliyoruz.
const MIN_REVIEW_COUNT = 2000;

const cache = new Map();

// Not: appid dealsFetcher.js tarafından ITAD'ın lookup endpoint'i üzerinden
// önceden çözümlenip deal.appid alanına konuyor (storeUrl, ITAD'ın kendi
// kısaltma linki olduğu için oradan appid çıkarmak güvenilir değildi).

async function fetchReviewSummary(appid) {
  if (cache.has(appid)) return cache.get(appid);

  const url = `https://store.steampowered.com/appreviews/${appid}?json=1&language=all&num_per_page=0&l=english`;
  const res = await fetch(url);
  if (!res.ok) {
    cache.set(appid, null);
    return null;
  }
  const data = await res.json();
  const summary = data?.query_summary ?? null;
  const result = summary
    ? { desc: summary.review_score_desc, total: summary.total_reviews ?? 0 }
    : null;
  cache.set(appid, result);
  return result;
}

/**
 * Verilen deal listesindeki Steam öğelerini inceleme puanına VE yorum
 * sayısına göre filtreler (sadece "Positive"/"Very Positive" VE en az
 * MIN_REVIEW_COUNT yorumu olanlar geçer). Steam DIŞINDAKİ (örn. PS Store)
 * öğeler dokunulmadan olduğu gibi geri döner.
 */
export async function filterSteamDealsByReview(deals, { concurrency = 5 } = {}) {
  const steamDeals = deals.filter((d) => d.platform === "Steam");
  const otherDeals = deals.filter((d) => d.platform !== "Steam");

  const results = [];
  for (let i = 0; i < steamDeals.length; i += concurrency) {
    const batch = steamDeals.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(async (deal) => {
        const appid = deal.appid;
        if (!appid) return null; // appid çözümlenemediyse güvenli tarafta kal, dahil etme
        const summary = await fetchReviewSummary(appid);
        if (!summary) return null;
        const passesScore = ALLOWED_SCORES.has(summary.desc);
        const passesCount = summary.total >= MIN_REVIEW_COUNT;
        // reviewCount'u dealin üzerine ekliyoruz ki sonrasında popülerliğe göre
        // (en çok yorum alandan aza doğru) sıralayabilelim.
        return passesScore && passesCount ? { ...deal, reviewCount: summary.total } : null;
      })
    );
    results.push(...batchResults.filter(Boolean));
  }

  // En çok yorumu olan (yani en tanınmış/öne çıkan) oyunlar önce gelsin.
  results.sort((a, b) => (b.reviewCount || 0) - (a.reviewCount || 0));

  return [...results, ...otherDeals];
}