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

    // 1. Поиск через Serper.dev
    const serperRes = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': serperKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        q: 'Япония 3 недели маршрут Токио Киото море отели перелет через Китай',
        gl: 'ru',
        hl: 'ru'
      })
    });
    const searchData = await serperRes.json();

    // 2. Генерация через актуальную модель gemini-3.8-flash
    const prompt = `
      Составь подробный план путешествия в Японию на 3 недели.
      Условия: перелет с пересадкой в Китае, Токио, Киото, пляжный отдых (море), цены на отели.
      
      Верни ответ СТРОГО в формате JSON со следующей структурой:
      {
        "title": "Япония: 3 недели (Китай + Токио + Киото + Море)",
        "flight_info": {
          "route": "Маршрут перелета",
          "estimated_price": "Примерная цена"
        },
        "days_summary": "Краткое описание по неделям",
        "locations": [
          {
            "name": "Название места",
            "category": "city / beach / transit",
            "description": "Что посмотреть и чем заняться",
            "hotel_suggestion": "Рекомендуемый отель",
            "price_per_night": "Цена за ночь",
            "lat": 35.6762,
            "lng": 139.6503
          }
        ]
      }

      Данные из поиска: ${JSON.stringify(searchData.organic?.slice(0, 5) || [])}
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json'
      }
    });

    const tripData = JSON.parse(response.text.trim());

    return res.status(200).json({ success: true, data: tripData });
  } catch (error) {
    console.error("API Error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
