import fetch from "node-fetch";
// Вызов OpenAI Chat Completions — с таймаутом и подробными логами
let answer = "Не удалось получить ответ. Попробуй ещё раз.";

try {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000); // 15 сек

  const payload = {
    model: "gpt-4o-mini",
    temperature: 0.6,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: text }
    ]
  };

  const oa = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload),
    signal: controller.signal
  });

  clearTimeout(timeout);

  if (!oa.ok) {
    const errText = await oa.text().catch(() => "");
    console.error("[OpenAI:HTTP]", oa.status, errText);
    await send(
      "Сервис ответов временно недоступен.\nКод: " + oa.status +
      (errText ? "\n" + errText.slice(0, 300) : "")
    );
    return res.send("ok");
  }

  const data = await oa.json().catch((e) => {
    console.error("[OpenAI:JSON]", e);
    return null;
  });

  if (!data || !data.choices || !data.choices[0] || !data.choices[0].message) {
    console.error("[OpenAI:STRUCT]", JSON.stringify(data));
    await send("Ответ пустой. Я проверю логи и починю, попробуй ещё раз.");
    return res.send("ok");
  }

  answer = (data.choices[0].message.content || "").trim() || answer;

} catch (e) {
  // сюда попадём при таймауте/сетевой/ReferenceError и т.п.
  console.error("[OpenAI:CATCH]", e?.message || e);
  await send("Сеть подвисла или лимит. Попробуй ещё раз чуть позже.");
  return res.send("ok");
}

// Если дошли сюда — всё ок
await send(answer);
return res.send("ok");
