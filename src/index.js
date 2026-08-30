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

  // Artık indirimde OLMAYAN oyunları state'ten temizliyoruz. Böylece bir oyun
  // indirimi bitip aylar sonra tekrar indirime girdiğinde "zaten gönderilmişti"
  // diye sonsuza kadar susturulmaz — sadece indirim KESİNTİSİZ sürdüğü sürece
  // tekrar gönderilmez.
  const currentlyActiveIds = new Set(rawDeals.map((d) => d.id));
  const prunedNotified = new Set([...notified].filter((id) => currentlyActiveIds.has(id)));

  const fresh = deals
    .filter((d) => !prunedNotified.has(d.id))
    // Öne çıkan (en çok yorum alan / en popüler) oyunlar önce gelsin —
    // PS Store öğelerinde reviewCount olmadığı için onlar sona düşer, sorun değil.
    .sort((a, b) => (b.reviewCount || 0) - (a.reviewCount || 0));

  if (fresh.length === 0) {
    console.log("Yeni (daha önce haber verilmemiş) indirim yok. Çıkılıyor.");
    saveNotifiedIds(prunedNotified); // temizlik (pruning) yine de kalıcı olsun
    return;
  }

  // Bir çalıştırmada en fazla en popüler MAX_PER_RUN kadarını gönderiyoruz
  // (fresh zaten popülerliğe göre sıralı). Gönderilmeyenler "notified"
  // sayılmıyor ki sırası gelince (bir sonraki çalıştırmada) hâlâ gönderilebilsin.
  const MAX_PER_RUN = 15;
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