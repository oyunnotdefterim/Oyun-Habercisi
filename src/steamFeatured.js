import fetch from "node-fetch";

// ITAD bazı büyük/özel promosyonları (ör. "Special Promotion" tarzı, storewide
// indirim dönemleri dışındaki) kaçırabiliyor. Steam'in kendi ana sayfasında
// kullandığı bu herkese açık (resmi olarak dokümante edilmemiş ama stabil)
// endpoint'i EK bir kaynak olarak kullanıyoruz — ikisi birleşince kapsama
// alanı genişliyor.
const FEATURED_URL = "https://store.steampowered.com/api/featuredcategories/?cc=us&l=english";

export async function fetchSteamFeaturedSpecials() {
  const res = await fetch(FEATURED_URL);
  if (!res.ok) return [];

  const data = await res.json();
  const items = data?.specials?.items || [];

  return items
    .filter((it) => it.discounted && it.discount_percent > 0)
    .map((it) => ({
      id: `steam-${it.id}`,
      type: "discount",
      title: it.name,
      platform: "Steam",
      discountPercent: it.discount_percent,
      price: typeof it.final_price === "number" ? (it.final_price / 100).toFixed(2) : null,
      currency: it.currency || "USD",
      coverUrl: it.large_capsule_image || it.header_image || it.small_capsule_image,
      storeUrl: `https://store.steampowered.com/app/${it.id}/`,
      appid: String(it.id),
    }))
    .filter((d) => d.title && d.coverUrl);
}