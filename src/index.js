import fs from "node:fs";
import path from "node:path";
import { fetchBigDiscounts } from "./dealsFetcher.js";
import { filterSteamDealsByReview } from "./steamReviews.js";
import { sendDealDigest } from "./telegramNotifier.js";
import { pollAlarmCommands, checkAndFireAlarms } from "./alarmManager.js";

const POSTED_PATH = path.join(process.cwd(), "data", "posted.json");
const MIN_DISCOUNT = Number(process.env.MIN_DISCOUNT_PERCENT || 1);

function loadNotifiedIds() {
  if (!fs.existsSync(POSTED_PATH)) return new Set();
  return new Set(JSON.parse(fs.readFileSync(POSTED_PATH, "utf-8")));
}

function saveNotifiedIds(idsSet) {
  fs.writeFileSync(POSTED_PATH, JSON.stringify([...idsSet], null, 2));
}

async function run() {
  console.log("Yeni /alarm komutları kontrol ediliyor...");
  await pollAlarmCommands();

  console.log(`Steam + PS Store'da %${MIN_DISCOUNT}+ indirimler taranıyor...`);
  const rawDeals = await fetchBigDiscounts(MIN_DISCOUNT);

  await checkAndFireAlarms(rawDeals);

  console.log(`${rawDeals.length} indirim bulundu, Steam olanlar inceleme puanına göre filtreleniyor (Olumlu / Çok Olumlu)...`);
  const deals = await filterSteamDealsByReview(rawDeals);
  console.log(`Filtre sonrası ${deals.length} indirim kaldı.`);

  const notified = loadNotifiedIds();

  const currentlyActiveIds = new Set(rawDeals.map((d) => d.id));
  const prunedNotified = new Set([...notified].filter((id) => currentlyActiveIds.has(id)));

  const fresh = deals
    .filter((d) => !prunedNotified.has(d.id))
    .sort((a, b) => (b.reviewCount || 0) - (a.reviewCount || 0));

  if (fresh.length === 0) {
    console.log("Yeni (daha önce haber verilmemiş) indirim yok. Çıkılıyor.");
    saveNotifiedIds(prunedNotified);
    return;
  }

  const MAX_PER_RUN = 40;
  const toSend = fresh.slice(0, MAX_PER_RUN);

  console.log(`${fresh.length} yeni indirim bulundu, en popüler ${toSend.length} tanesi Telegram'a gönderiliyor...`);
  await sendDealDigest(toSend);

  toSend.forEach((d) => prunedNotified.add(d.id));
  saveNotifiedIds(prunedNotified);
  console.log("Tamamlandı.");
}

run().catch((e) => {
  console.error("Bot çalışırken beklenmeyen hata:", e);
  process.exit(1);
});