import { GoogleGenAI } from '@google/genai';

// Автоматический повтор запроса, если сервер Google перегружен (ошибка 503)
async function generateWithRetry(ai, params, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await ai.models.generateContent(params);
    } catch (err) {
      const isOverloaded = err.status === 503 || String(err.message).includes('503');
      if (isOverloaded && i < retries - 1) {
        console.warn(`Сервер Gemini перегружен (503). Попытка ${i + 2} из ${retries}...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        continue;
      }
      throw err;
    }
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const geminiKey = process.env.GEMINI_API_KEY;
    const serperKey = process.env.SERPER_API_KEY;

    if (!geminiKey || !serperKey) {
      throw new Error("Не заданы GEMINI_API_KEY или SERPER_API_KEY в переменных окружения Vercel");
    }

    const ai = new GoogleGenAI({ apiKey: geminiKey });

    // 1. Быстрый поиск через Serper (лимит ожидания 5 секунд)
    let searchSnippets = [];
    try {
      const serperRes = await fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: {
          'X-API-KEY': serperKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          q: 'Япония маршрут Токио Киото море отели цены перелет через Китай',
          gl: 'ru',
          hl: 'ru',
          num: 4
        }),
        signal: AbortSignal.timeout(5000)
      });
      const searchData = await serperRes.json();
      searchSnippets = (searchData.organic || []).slice(0, 4).map(item => ({
        title: item.title,
        snippet: item.snippet
      }));
    } catch (serperErr) {
      console.warn("Serper пропущен по таймауту:", serperErr.message);
    }

    // 2. Запрос к Gemini с авто-повтором при 503
    const prompt = `
      Составь план путешествия в Японию на 3 недели (перелет через Китай, Токио, Киото, море).
      Верни СТРОГО валидный JSON (4 точки в массиве locations: Пекин, Токио, Киото, Окинава):
      {
        "title": "Япония: 3 недели (Китай + Токио + Киото + Море)",
        "flight_info": {
          "route": "Москва — Пекин — Токио",
          "estimated_price": "Примерная цена туда-обратно в рублях"
        },
        "days_summary": "Краткая разбивка по дням (1-2 предложения)",
        "locations": [
          {
            "name": "Название города",
            "category": "transit / city / beach",
            "description": "Что посмотреть (1-2 предложения)",
            "hotel_suggestion": "Конкретный отель",
            "price_per_night": "Цена за ночь",
            "lat": 35.6762,
            "lng": 139.6503
          }
        ]
      }
      Контекст из поиска: ${JSON.stringify(searchSnippets)}
    `;

    const response = await generateWithRetry(ai, {
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json'
      }
    });

    let rawText = response.text.trim();
    rawText = rawText.replace(/^```json\s*/i, '').replace(/\s*```$/, '');
    const tripData = JSON.parse(rawText);

    return res.status(200).json({ success: true, data: tripData });
  } catch (error) {
    console.error("API Error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
