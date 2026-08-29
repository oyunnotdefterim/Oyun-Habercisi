import fs from "node:fs";
import path from "node:path";
import { fetchBigDiscounts } from "./dealsFetcher.js";
import { filterSteamDealsByReview } from "./steamReviews.js";
import { sendDealDigest } from "./telegramNotifier.js";

const POSTED_PATH = path.join(process.cwd(), "data", "posted.json");
// "Tüm indirimler" istendiği için eşiği 1 tutuyoruz (yani indirimde olan her şey).
const MIN_DISCOUNT = Number(process.env.MIN_DISCOUNT_PERCENT || 1);

function loadNotifiedIds() {
  if (!fs.existsSync(POSTED_PATH)) return new Set();
  return new Set(JSON.parse(fs.readFileSync(POSTED_PATH, "utf-8")));
}

function saveNotifiedIds(idsSet) {
  fs.writeFileSync(POSTED_PATH, JSON.stringify([...idsSet], null, 2));
}

async function run() {
  console.log(`Steam + PS Store'da %${MIN_DISCOUNT}+ indirimler taranıyor...`);
  const rawDeals = await fetchBigDiscounts(MIN_DISCOUNT);

  console.log(`${rawDeals.length} indirim bulundu, Steam olanlar inceleme puanına göre filtreleniyor (Olumlu / Çok Olumlu)...`);
  const deals = await filterSteamDealsByReview(rawDeals);
  console.log(`Filtre sonrası ${deals.length} indirim kaldı.`);

  const notified = loadNotifiedIds();

  const fresh = deals.filter((d) => !notified.has(d.id));

  if (fresh.length === 0) {
    console.log("Yeni (daha önce haber verilmemiş) indirim yok. Çıkılıyor.");
    return;
  }

  console.log(`${fresh.length} yeni indirim bulundu, Telegram'a gönderiliyor...`);
  await sendDealDigest(fresh);

  fresh.forEach((d) => notified.add(d.id));
  saveNotifiedIds(notified);
  console.log("Tamamlandı.");
}

run().catch((e) => {
  console.error("Bot çalışırken beklenmeyen hata:", e);
  process.exit(1);
});
