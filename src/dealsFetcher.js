import fetch from "node-fetch";

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

  const data = await res.json(); // { "<itad-gid>": ["app/220", ...], ... }
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

  // /deals/v2 GET isteğinde query parametrelerini desteklemiyor (400 döner) —
  // ITAD bu endpoint için POST + JSON gövde istiyor.
  const url = `${ITAD_BASE}/deals/v2?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      country: "US",
      offset: 0,
      limit: 100,
      sort: "-cut",
      shops: shopIdList,
    }),
  });
  if (!res.ok) throw new Error(`ITAD API hatası: ${res.status} ${res.statusText}`);

  const data = await res.json();
  const list = data.list || data.deals || [];

  const filtered = list.filter((deal) => (deal.deal?.cut ?? deal.cut ?? 0) >= minDiscountPercent);

  // Steam appid'lerini toplu olarak çözümle (inceleme puanı filtresi için gerekli)
  const steamGids = [
    ...new Set(
      filtered
        .filter((deal) => (deal.deal?.shop?.id ?? deal.shop?.id) === shopIds["Steam"])
        .map((deal) => deal.id)
        .filter(Boolean)
    ),
  ];
  const appIdMap = await resolveSteamAppIds(apiKey, shopIds["Steam"], steamGids);

  return filtered
    .map((deal) => {
      const shopId = deal.deal?.shop?.id ?? deal.shop?.id;
      return {
        id: `${deal.id ?? deal.slug ?? deal.title}-${shopId}`,
        type: "discount",
        title: deal.title,
        platform: idToPlatform[shopId] || "Mağaza",
        discountPercent: deal.deal?.cut ?? deal.cut,
        price: deal.deal?.price?.amount ?? deal.price?.amount,
        currency: deal.deal?.price?.currency ?? deal.price?.currency ?? "USD",
        coverUrl: deal.assets?.banner600 || deal.assets?.boxart || deal.image,
        storeUrl: deal.deal?.url ?? deal.urls?.game,
        appid: appIdMap[deal.id] || null,
      };
    })
    .filter((d) => d.title && d.coverUrl);
}