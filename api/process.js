export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Метод не разрешен, используйте POST' });
  }

  try {
    const { audioBase64 } = req.body;

    if (!audioBase64) {
      return res.status(400).json({ error: 'Аудио не предоставлено' });
    }

    const audioBuffer = Buffer.from(audioBase64, 'base64');

    const formData = new FormData();
    const blob = new Blob([audioBuffer], { type: 'audio/wav' }); 
    formData.append('file', blob, 'audio.wav');
    formData.append('model', 'whisper-large-v3');

    // --- 1. Запрос к Whisper (Голос в текст) ---
    const whisperResponse = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: formData
    });

    const whisperData = await whisperResponse.json();
    
    // ПРОВЕРКА ОШИБКИ WHISPER:
    if (whisperData.error) {
       return res.status(500).json({ error: 'Ошибка Whisper (STT)', details: whisperData.error });
    }

    const userText = whisperData.text;
    
    if (!userText || userText.trim() === '') {
        return res.status(400).json({ error: 'Не удалось распознать речь' });
    }

    // --- 2. Запрос к LLM (Генерация ответа) ---
    const llmResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama3-8b-8192',
        messages: [
          { 
            role: 'system', 
            content: 'Ты умный и краткий голосовой помощник. Отвечай максимально коротко (1-2 предложения).' 
          },
          { role: 'user', content: userText }
        ]
      })
    });

    const llmData = await llmResponse.json();

    // ПРОВЕРКА ОШИБКИ LLM:
    if (llmData.error) {
        // Если Groq вернул ошибку, возвращаем ее клиенту, чтобы не крашить сервер
        return res.status(500).json({ error: 'Ошибка Groq LLM', details: llmData.error });
    }

    // Если всё ок, парсим ответ
    const replyText = llmData.choices[0].message.content;

    return res.status(200).json({ 
      recognizedText: userText,
      reply: replyText 
    });

  } catch (error) {
    console.error("Глобальная ошибка сервера:", error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера', details: error.message || error.toString() });
  }
}
