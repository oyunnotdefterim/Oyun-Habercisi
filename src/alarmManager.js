import fetch from "node-fetch";
import fs from "node:fs";
import path from "node:path";
import { sendTelegramMessage } from "./telegramNotifier.js";

const ALARMS_PATH = path.join(process.cwd(), "data", "alarms.json");
const OFFSET_PATH = path.join(process.cwd(), "data", "telegram_offset.json");

function normalize(name) {
  return name.trim().toLowerCase();
}

function loadJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return fallback;
  }
}

function saveJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

/**
 * Botun aldığı yeni mesajları (getUpdates ile) kontrol eder, "/alarm <oyun adı>"
 * komutlarını işleyip kullanıcıyı o oyun için abone listesine ekler.
 */
export async function pollAlarmCommands() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN tanımlı değil.");

  const offsetData = loadJson(OFFSET_PATH, { offset: 0 });
  const alarms = loadJson(ALARMS_PATH, {});

  const url = `https://api.telegram.org/bot${token}/getUpdates?offset=${offsetData.offset}&timeout=0`;
  const res = await fetch(url);
  if (!res.ok) return;
  const data = await res.json();
  if (!data.ok) return;

  let maxUpdateId = offsetData.offset - 1;
  let alarmsChanged = false;

  for (const update of data.result || []) {
    maxUpdateId = Math.max(maxUpdateId, update.update_id);

    const msg = update.message;
    if (!msg || !msg.text) continue;
    const chatId = String(msg.chat.id);
    const text = msg.text.trim();

    if (text.toLowerCase().startsWith("/alarm")) {
      const gameName = text.slice(6).trim();
      if (!gameName) {
        await sendTelegramMessage(
          token,
          chatId,
          "Hangi oyun için alarm kurmak istiyorsun? Örnek:\n/alarm Cyberpunk 2077"
        ).catch(() => {});
        continue;
      }

      const key = normalize(gameName);
      if (!alarms[key]) alarms[key] = [];
      if (!alarms[key].includes(chatId)) {
        alarms[key].push(chatId);
        alarmsChanged = true;
      }

      await sendTelegramMessage(
        token,
        chatId,
        `✅ "${gameName}" için alarm kuruldu. İndirime girdiğinde sana özelden haber vereceğim.`
      ).catch(() => {});
    } else if (text.toLowerCase() === "/start") {
      await sendTelegramMessage(
        token,
        chatId,
        "Merhaba! Bir oyun indirime girdiğinde haberdar olmak için:\n/alarm <oyun adı>\n\nÖrnek: /alarm Cyberpunk 2077"
      ).catch(() => {});
    }
  }

  if (alarmsChanged) saveJson(ALARMS_PATH, alarms);
  if (maxUpdateId >= offsetData.offset) {
    saveJson(OFFSET_PATH, { offset: maxUpdateId + 1 });
  }
}

/**
 * Şu an aktif olan tüm indirimleri (kalite/popülerlik filtresinden BAĞIMSIZ)
 * alarm listesindeki oyun adlarıyla eşleştirir, eşleşme varsa o kullanıcıya
 * özelden mesaj atar. Bir alarm bir kez tetiklendiğinde listeden kaldırılır.
 */
export async function checkAndFireAlarms(rawDeals) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN tanımlı değil.");

    const alarms = loadJson(ALARMS_PATH, {});
  const alarmKeys = Object.keys(alarms);
  console.log(`Aktif alarmlar: ${alarmKeys.length > 0 ? alarmKeys.join(', ') : '(yok)'}`);
  if (alarmKeys.length === 0) return;

  const keysToDelete = [];

    for (const key of alarmKeys) {
    const match = rawDeals.find((d) => normalize(d.title).includes(key));
    if (!match) {
      console.log(`Alarm '${key}' için şu an eşleşen bir indirim yok.`);
      continue;
    }
    console.log(`Alarm '${key}' eşleşti: ${match.title} (%${match.discountPercent})`);

    const price = match.price ? `${match.price}${match.currency === "USD" ? "$" : " " + match.currency}` : "?";
    const text =
      `🔔 Alarm kurduğun oyun indirimde!\n\n` +
      `${match.title} — %${match.discountPercent} indirim (${match.platform}, ${price})` +
      (match.storeUrl ? `\n${match.storeUrl}` : "");

    for (const chatId of alarms[key]) {
      await sendTelegramMessage(token, chatId, text).catch(() => {});
    }
    keysToDelete.push(key);
  }

  if (keysToDelete.length > 0) {
    for (const key of keysToDelete) delete alarms[key];
    saveJson(ALARMS_PATH, alarms);
  }
}