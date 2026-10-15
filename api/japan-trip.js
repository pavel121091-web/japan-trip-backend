import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export default async function handler(req, res) {
  // Настройка CORS, чтобы твое мобильное приложение могло стучаться к бэкенду
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // 1. Поиск через Serper.dev
    const serperRes = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': process.env.SERPER_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        q: 'Япония 3 недели маршрут Токио Киото море отели перелет через Китай',
        gl: 'ru',
        hl: 'ru'
      })
    });
    const searchData = await serperRes.json();

    // 2. Обработка через Gemini API
    const prompt = `
      Составь подробный план путешествия в Японию на 3 недели.
      Условия: перелет с пересадкой в Китае, Токио, Киото, пляжный отдых (море), цены на отели.
      
      Верни ответ СТРОГО в формате JSON без каких-либо markdown-оберток (без \`\`\`json), со следующей структурой:
      {
        "title": "Япония: 3 недели (Китай + Токио + Киото + Море)",
        "flight_info": {
          "route": "Маршрут перелета",
          "estimated_price": "Примерная цена"
        },
        "days_summary": "Краткое описание",
        "locations": [
          {
            "name": "Название места",
            "category": "city / beach / transit",
            "description": "Что посмотреть",
            "hotel_suggestion": "Отель",
            "price_per_night": "Цена за ночь",
            "lat": 35.6762,
            "lng": 139.6503
          }
        ]
      }

      Данные из поиска: ${JSON.stringify(searchData.organic?.slice(0, 5) || [])}
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    let rawText = response.text.trim();
    rawText = rawText.replace(/^```json\s*/i, '').replace(/\s*```$/, '');
    
    const tripData = JSON.parse(rawText);

    return res.status(200).json({ success: v => true, success: true, data: tripData });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
}
