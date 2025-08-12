// --- index.js ---
import express from "express";
import fetch from "node-fetch";

// 1) Переменные окружения (задать в Render → Environment)
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;          // токен бота
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;           // ключ OpenAI sk-...
const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT || (
  "Ты — «ФреймМужины»: честно, кратко, без душноты. " +
  "Дай 2–4 конкретных шага и пример фразы. Уважай границы и закон. " +
  "Если мало данных — спроси 1 уточняющий вопрос."
);
const TG_SECRET_TOKEN = process.env.TG_SECRET_TOKEN;         // секрет вебхука
const WEBHOOK_PATH = `/${process.env.WEBHOOK_PATH || "hook"}`;// путь вебхука, без слеша в env

// 2) Вспомогательные функции
function abortableTimeout(ms) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  return { controller, cancel: () => clearTimeout(id) };
}

function tg(method, payload) {
  return fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

function send(chatId, text, extra = {}) {
  return tg("sendMessage", { chat_id: chatId, text, ...extra });
}

// 3) Express-приложение
const app = express();
app.use(express.json());

// Проверка, что сервис жив
app.get("/", (_req, res) => res.send("man_frame_bot is up"));

// Точка приёма вебхука
app.post(WEBHOOK_PATH, async (req, res) => {
  try {
    // a) Проверка секрета из заголовка Telegram
    const header = req.header("x-telegram-bot-api-secret-token");
    if (!header || header !== TG_SECRET_TOKEN) {
      return res.status(403).send("forbidden");
    }

    const update = req.body || {};
    const msg = update.message || update.edited_message || update.channel_post;
    if (!msg) return res.send("ok");

    const chatId = msg.chat?.id;
    const text = (msg.text || "").trim();

    // b) Команды
    if (text.startsWith("/start")) {
      await send(chatId, "Привет! Я ФреймМужчины — быстрые, честные советы без душноты. Напиши свой вопрос или /help.");
      return res.send("ok");
    }
    if (text.startsWith("/help")) {
      await send(chatId, "Как работать:\n1) Кратко опиши ситуацию.\n2) Сформулируй цель.\n3) Получи 2–4 чётких шага.\nПолезно: /rules, /privacy, /prompt.");
      return res.send("ok");
    }
    if (text.startsWith("/rules")) {
      await send(chatId, "Правила: честно, конкретно, без токсичности и незаконного. Совет — не приказ. Границы, уважение, ответственность.");
      return res.send("ok");
    }
    if (text.startsWith("/about")) {
      await send(chatId, "ФреймМужчины — бот-советчик по знакомствам и отношениям. Отвечаю быстро и по делу.");
      return res.send("ok");
    }
    if (text.startsWith("/privacy")) {
      await send(chatId, "Политика конфиденциальности: вставь сюда свою ссылку (Google Docs/сайт).");
      return res.send("ok");
    }
    if (text.startsWith("/prompt")) {
      await send(chatId, "Стиль: кратко, честно, конкретно, без душноты. Фокус на действия и границы. Если мало данных — 1 уточняющий вопрос.");
      return res.send("ok");
    }
    if (text.startsWith("/reset")) {
      await send(chatId, "Ок, контекст сброшен. Пиши новый вопрос.");
      return res.send("ok");
    }
    if (text.startsWith("/feedback")) {
      await send(chatId, "Обратная связь: укажи @контакт.");
      return res.send("ok");
    }
    if (text.startsWith("/ping")) {
      await send(chatId, "Жив! ⚡️");
      return res.send("ok");
    }

    // c) Неформатные сообщения
    if (!text) {
      await send(chatId, "Пришли, пожалуйста, текстовый вопрос.");
      return res.send("ok");
    }

    // d) Вызов OpenAI Chat Completions с таймаутом и защитой
    let answer = "Не удалось получить ответ. Попробуй ещё раз через минуту.";
    try {
      const { controller, cancel } = abortableTimeout(15000); // 15 сек
      const resp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          temperature: 0.6,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: text }
          ]
        }),
        signal: controller.signal
      });
      cancel();

      if (!resp.ok) {
        const errText = await resp.text().catch(() => "");
        console.error("[OpenAI:HTTP]", resp.status, errText);
        await send(
          chatId,
          "Сервис ответов временно недоступен.\nКод: " + resp.status +
          (errText ? "\n" + errText.slice(0, 300) : "")
        );
        return res.send("ok");
      }

      const data = await resp.json().catch(e => {
        console.error("[OpenAI:JSON]", e);
        return null;
      });

      if (!data?.choices?.[0]?.message?.content) {
        console.error("[OpenAI:STRUCT]", JSON.stringify(data));
        await send(chatId, "Ответ пустой. Попробуй ещё раз.");
        return res.send("ok");
      }

      answer = data.choices[0].message.content.trim() || answer;

    } catch (e) {
      console.error("[OpenAI:CATCH]", e?.message || e);
      await send(chatId, "Сеть подвисла или лимит. Попробуй ещё раз чуть позже.");
      return res.send("ok");
    }

    // e) Отправляем ответ пользователю
    await send(chatId, answer);
    return res.send("ok");

  } catch (e) {
    console.error("[WEBHOOK:CATCH]", e?.message || e);
    return res.send("ok");
  }
});

// 4) Старт сервера (Render передаёт порт в PORT)
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("Server listening on", PORT));
