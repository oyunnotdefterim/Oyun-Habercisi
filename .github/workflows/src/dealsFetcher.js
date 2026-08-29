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
    const match = shops.find((s) => s.name.toLowerCase() === wanted.toLowerCase());
    if (match) found[wanted] = match.id;
  }
  return found;
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
  const shopsParam = Object.values(shopIds).filter(Boolean).join(",");

  const url = `${ITAD_BASE}/deals/v2?key=${apiKey}&shops=${shopsParam}&limit=100&sort=-cut`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ITAD API hatası: ${res.status} ${res.statusText}`);

  const data = await res.json();
  const list = data.list || data.deals || [];

  return list
    .filter((deal) => (deal.deal?.cut ?? deal.cut ?? 0) >= minDiscountPercent)
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
      };
    })
    .filter((d) => d.title && d.coverUrl);
}
