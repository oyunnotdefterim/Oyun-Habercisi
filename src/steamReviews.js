import fetch from "node-fetch";

// Sadece bu ikisi "geçer" sayılacak (Steam'in Türkçe arayüzündeki karşılıkları):
// "Very Positive"  -> Çok Olumlu
// "Positive"        -> Olumlu
const ALLOWED_SCORES = new Set(["Very Positive", "Positive"]);

const cache = new Map();

// Not: appid artık dealsFetcher.js tarafından ITAD'ın lookup endpoint'i
// üzerinden önceden çözümlenip deal.appid alanına konuyor (storeUrl, ITAD'ın
// kendi kısaltma linki olduğu için oradan appid çıkarmak güvenilir değildi).

async function fetchReviewScoreDesc(appid) {
  if (cache.has(appid)) return cache.get(appid);

  const url = `https://store.steampowered.com/appreviews/${appid}?json=1&language=all&num_per_page=0&l=english`;
  const res = await fetch(url);
  if (!res.ok) {
    cache.set(appid, null);
    return null;
  }
  const data = await res.json();
  const desc = data?.query_summary?.review_score_desc ?? null;
  cache.set(appid, desc);
  return desc;
}

/**
 * Verilen deal listesindeki Steam öğelerini inceleme puanına göre filtreler
 * (sadece "Positive" / "Very Positive" geçer). Steam DIŞINDAKİ (örn. PS Store)
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
        const scoreDesc = await fetchReviewScoreDesc(appid);
        return ALLOWED_SCORES.has(scoreDesc) ? deal : null;
      })
    );
    results.push(...batchResults.filter(Boolean));
  }

  return [...results, ...otherDeals];
}