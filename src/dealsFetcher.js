import fetch from "node-fetch";
import { fetchSteamFeaturedSpecials } from "./steamFeatured.js";

const ITAD_BASE = "https://api.isthereanydeal.com";

// Mağaza ID'lerini sabit yazmak yerine her çalıştırmada ITAD'dan isme göre buluyoruz.
// Böylece ITAD tarafında ID değişirse bot kırılmaz.
async function resolveShopIds(apiKey, shopNames) {
  const res = await fetch(`${ITAD_BASE}/service/shops/v1?key=${apiKey}`);
  if (!res.ok) throw new Error(`Mağaza listesi alınamadı: ${res.status}`);
  const shops = await res.json();

  const found = {};
  for (const wanted of shopNames) {
    const match = shops.find((s) => {
      const label = s.title || s.name;
      return label && label.toLowerCase() === wanted.toLowerCase();
    });
    if (match) found[wanted] = match.id;
  }
  return found;
}

// ITAD'ın deals/v2 yanıtındaki "url" alanı gerçek Steam linki DEĞİL, ITAD'ın
// kendi kısaltma linki (itad.link/...). Gerçek Steam appid'sini almak için
// ayrı bir lookup endpoint'i kullanıyoruz: ITAD game ID -> Steam appid.
async function resolveSteamAppIds(apiKey, steamShopId, gids) {
  if (!steamShopId || gids.length === 0) return {};

  const url = `${ITAD_BASE}/lookup/shop/${steamShopId}/id/v1?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(gids),
  });
  if (!res.ok) return {};

  const data = await res.json();
  const map = {};
  for (const [gid, ids] of Object.entries(data || {})) {
    const appEntry = (ids || []).find((s) => s.startsWith("app/"));
    if (appEntry) map[gid] = appEntry.split("/")[1];
  }
  return map;
}

/**
 * Steam ve PS Store'daki, belirlenen eşik ve üzerinde indirimli oyunları getirir.
 * minDiscountPercent=1 verilirse pratikte "indirimde olan her şey" gelir.
 */
export async function fetchBigDiscounts(minDiscountPercent = 1) {
  const apiKey = process.env.ITAD_API_KEY;
  if (!apiKey) throw new Error("ITAD_API_KEY tanımlı değil.");

  const shopIds = await resolveShopIds(apiKey, ["Steam", "PlayStation Store"]);
  const idToPlatform = {
    [shopIds["Steam"]]: "Steam",
    [shopIds["PlayStation Store"]]: "PS Store",
  };
  const shopIdList = Object.values(shopIds).filter(Boolean);

  const PAGE_SIZE = 200;
  const MAX_PAGES = 10;
  const url = `${ITAD_BASE}/deals/v2?key=${apiKey}`;

  let list = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        country: "US",
        offset: page * PAGE_SIZE,
        limit: PAGE_SIZE,
        shops: shopIdList,
      }),
    });
    if (!res.ok) throw new Error(`ITAD API hatası: ${res.status} ${res.statusText}`);

    const data = await res.json();
    const pageList = data.list || data.deals || [];
    list = list.concat(pageList);

    if (pageList.length < PAGE_SIZE) break;
  }

  const filtered = list.filter((deal) => (deal.deal?.cut ?? deal.cut ?? 0) >= minDiscountPercent);

  const steamGids = [
    ...new Set(
      filtered
        .filter((deal) => (deal.deal?.shop?.id ?? deal.shop?.id) === shopIds["Steam"])
        .map((deal) => deal.id)
        .filter(Boolean)
    ),
  ];
  const appIdMap = await resolveSteamAppIds(apiKey, shopIds["Steam"], steamGids);

  const itadDeals = filtered
    .map((deal) => {
      const shopId = deal.deal?.shop?.id ?? deal.shop?.id;
      const platform = idToPlatform[shopId] || "Mağaza";
      const appid = appIdMap[deal.id] || null;
      const id =
        platform === "Steam" && appid ? `steam-${appid}` : `${deal.id ?? deal.slug ?? deal.title}-${shopId}`;
      return {
        id,
        type: "discount",
        title: deal.title,
        platform,
        discountPercent: deal.deal?.cut ?? deal.cut,
        price: deal.deal?.price?.amount ?? deal.price?.amount,
        currency: deal.deal?.price?.currency ?? deal.price?.currency ?? "USD",
        coverUrl: deal.assets?.banner600 || deal.assets?.boxart || deal.image,
        storeUrl: deal.deal?.url ?? deal.urls?.game,
        appid,
      };
    })
    .filter((d) => d.title && d.coverUrl);

  const nativeDeals = await fetchSteamFeaturedSpecials().catch(() => []);

  const merged = new Map();
  for (const d of itadDeals) merged.set(d.id, d);
  for (const d of nativeDeals) {
    if (d.discountPercent >= minDiscountPercent && !merged.has(d.id)) {
      merged.set(d.id, d);
    }
  }

  return [...merged.values()];
}