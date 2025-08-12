// index.js — минимальный сервер для Telegram вебхука на Render (Node 18+)
import express from "express";

// Настройки из переменных окружения (задашь на Render)
const TOKEN = process.env.TELEGRAM_TOKEN;            // токен бота от BotFather
const OPENAI = process.env.OPENAI_API_KEY;           // ключ OpenAI sk-...
const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT || (
  "Ты — «ФреймМужчины»: честно, кратко, без душноты. " +
  "Дай 2–4 конкретных шага, примеры фраз. Уважай границы и закон. " +
  "Если мало данных — спроси 1 уточнение."
);
const TG_SECRET = process.env.TG_SECRET_TOKEN;       // секрет для вебхука
const WEBHOOK_PATH = `/${process.env.WEBHOOK_PATH || "hook"}`; // путь вебхука

const app = express();
app.use(express.json());

// Простой пинг для проверки развертывания
app.get("/", (req, res) => res.send("man_frame_bot up"));

// Точка входа вебхука
app.post(WEBHOOK_PATH, async (req, res) => {
  try {
    // Проверяем секретный заголовок от Telegram (безопасность)
    const header = req.header("x-telegram-bot-api-secret-token");
    if (!header || header !== TG_SECRET) {
      return res.status(403).send("forbidden");
    }

    const update = req.body || {};
    const msg = update.message || update.edited_message || update.channel_post;
    if (!msg) return res.send("ok");

    const chatId = msg.chat && msg.chat.id;
    const text = (msg.text || "").trim();

    // Хелпер для отправки сообщений в Telegram
    const tg = async (method, payload) => {
      await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    };
    const send = (t, extra={}) => tg("sendMessage", { chat_id: chatId, text: t, ...extra });

    // Команды
    if (text.startsWith("/start")) {
      await send("Привет! Я ФреймМужчины — быстрые, честные советы без душноты. Напиши свой вопрос или /help.");
      return res.send("ok");
    }
    if (text.startsWith("/help")) {
      await send("Как работать: 1) Кратко опиши ситуацию. 2) Сформулируй цель. 3) Получи 2–4 чётких шага. Полезно: /rules, /privacy.");
      return res.send("ok");
    }
    if (text.startsWith("/rules")) {
      await send("Правила: честно, конкретно, без токсичности и незаконного. Совет — не приказ. Границы, уважение, ответственность.");
      return res.send("ok");
    }
    if (text.startsWith("/about")) {
      await send("ФреймМужчины — бот-советчик по знакомствам и отношениям. Отвечаю быстро и по делу.");
      return res.send("ok");
    }
    if (text.startsWith("/privacy")) {
      await send("Политика конфиденциальности: вставь сюда ссылку на документ (Google Docs).");
      return res.send("ok");
    }
    if (text.startsWith("/prompt")) {
      await send("Стиль: кратко, честно, конкретно, без душноты. Фокус на действия и границы. Если мало данных — 1 уточняющий вопрос.");
      return res.send("ok");
    }
    if (text.startsWith("/reset")) {
      await send("Ок, контекст сброшен. Пиши новый вопрос.");
      return res.send("ok");
    }
    if (text.startsWith("/feedback")) {
      await send("Обратная связь: укажи @контакт.");
      return res.send("ok");
    }
    if (text.startsWith("/ping")) {
      await send("Жив! ⚡️");
      return res.send("ok");
    }

    if (!text) {
      await send("Пришли, пожалуйста, текстовый вопрос.");
      return res.send("ok");
    }

    // Вызов OpenAI Chat Completions
    const oa = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.6,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: text }
        ]
      })
    });

    let answer = "Не удалось получить ответ. Попробуй ещё раз.";
    try {
      const data = await oa.json();
      answer = data?.choices?.[0]?.message?.content?.trim() || answer;
    } catch (e) {}

    await send(answer);
    return res.send("ok");
  } catch (e) {
    console.error(e);
    return res.send("ok");
  }
});

// Render даёт порт через переменную окружения PORT
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log("Server listening on", PORT);
});
