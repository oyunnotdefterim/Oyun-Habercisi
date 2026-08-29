import fetch from "node-fetch";

const TELEGRAM_MAX_CHARS = 3500; // Telegram limiti 4096, güvenlik payı bırakıyoruz

/**
 * Bir grup indirimi tek (veya gerekirse birkaç parçaya bölünmüş) Telegram
 * mesajı olarak gönderir. Tek tek mesaj yerine "özet" mesajlar kullanıyoruz,
 * çünkü "tüm indirimler" seçildiğinde tek seferde onlarca-yüzlerce oyun
 * çıkabilir; her biri için ayrı mesaj atmak hem Telegram'ı hem seni spam'e boğar.
 */
export async function sendDealDigest(deals) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    throw new Error("TELEGRAM_BOT_TOKEN veya TELEGRAM_CHAT_ID eksik.");
  }

  const lines = deals.map((d) => formatDealLine(d));
  const chunks = chunkLines(lines, TELEGRAM_MAX_CHARS);

  for (let i = 0; i < chunks.length; i++) {
    const header = chunks.length > 1 ? `🔥 Yeni indirimler (${i + 1}/${chunks.length})\n\n` : `🔥 Yeni indirimler\n\n`;
    const text = header + chunks[i].join("\n");
    await sendTelegramMessage(token, chatId, text);
  }
}

function formatDealLine(deal) {
  const price = deal.price ? `${deal.price}${deal.currency === "USD" ? "$" : " " + deal.currency}` : "?";
  const link = deal.storeUrl ? ` — ${deal.storeUrl}` : "";
  return `• ${deal.title} — %${deal.discountPercent} indirim (${deal.platform}, ${price})${link}`;
}

function chunkLines(lines, maxChars) {
  const chunks = [];
  let current = [];
  let currentLen = 0;

  for (const line of lines) {
    if (currentLen + line.length + 1 > maxChars && current.length > 0) {
      chunks.push(current);
      current = [];
      currentLen = 0;
    }
    current.push(line);
    currentLen += line.length + 1;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

async function sendTelegramMessage(token, chatId, text) {
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.ok) {
    throw new Error(`Telegram gönderim hatası: ${JSON.stringify(data)}`);
  }
  return data;
}
