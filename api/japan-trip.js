import { GoogleGenAI } from '@google/genai';

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

    // 1. Быстрый поиск через Serper (с защитой от зависания в 5 секунд)
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
      // Берем только заголовки и краткие описания, чтобы не перегружать промпт
      searchSnippets = (searchData.organic || []).slice(0, 4).map(item => ({
        title: item.title,
        snippet: item.snippet
      }));
    } catch (serperErr) {
      console.warn("Serper timeout or error, continuing with Gemini:", serperErr.message);
    }

    // 2. Генерация через gemini-3.8-flash без задержки на "размышления"
    const prompt = `
      Составь план путешествия в Японию на 3 недели (перелет через Китай, Токио, Киото, море).
      Верни СТРОГО JSON (4 локации в массиве locations: Пекин транзит, Токио, Киото, Окинава или Камакура):
      {
        "title": "Япония: 3 недели (Китай + Токио + Киото + Море)",
        "flight_info": {
          "route": "Москва — Пекин — Токио",
          "estimated_price": "Примерная цена туда-обратно"
        },
        "days_summary": "Краткая разбивка по дням (1-2 предложения)",
        "locations": [
          {
            "name": "Город",
            "category": "transit / city / beach",
            "description": "Кратко что посмотреть (1-2 предложения)",
            "hotel_suggestion": "Название отеля",
            "price_per_night": "Цена за ночь",
            "lat": 35.6762,
            "lng": 139.6503
          }
        ]
      }
      Контекст из поиска: ${JSON.stringify(searchSnippets)}
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        thinkingConfig: {
          thinkingBudget: 0 // Отключает долгие размышления, ускоряя ответ в 5-6 раз
        }
      }
    });

    const tripData = JSON.parse(response.text.trim());

    return res.status(200).json({ success: true, data: tripData });
  } catch (error) {
    console.error("API Error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
