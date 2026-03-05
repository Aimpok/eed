// Файл: api/process.js

export default async function handler(req, res) {
  // Разрешаем только POST-запросы
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Метод не разрешен, используйте POST' });
  }

  try {
    const { audioBase64 } = req.body;

    if (!audioBase64) {
      return res.status(400).json({ error: 'Аудио не предоставлено' });
    }

    // 1. Декодируем Base64 обратно в бинарный буфер
    const audioBuffer = Buffer.from(audioBase64, 'base64');

    // 2. Готовим данные для отправки в Groq (Whisper STT)
    // Groq требует формат multipart/form-data для аудио
    const formData = new FormData();
    const blob = new Blob([audioBuffer], { type: 'audio/wav' }); 
    formData.append('file', blob, 'audio.wav'); // Имя файла обязательно
    formData.append('model', 'whisper-large-v3');

    // 3. Отправляем аудио на распознавание
    const whisperResponse = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: formData
    });

    const whisperData = await whisperResponse.json();
    
    if (whisperData.error) {
       return res.status(500).json({ error: 'Ошибка Whisper', details: whisperData.error });
    }

    const userText = whisperData.text;
    
    if (!userText || userText.trim() === '') {
        return res.status(400).json({ error: 'Не удалось распознать речь' });
    }

    // 4. Отправляем распознанный текст в нейросеть Groq (например, Llama 3)
    const llmResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama3-8b-8192', // Можно поменять на mixtral-8x7b-32768
        messages: [
          { 
            role: 'system', 
            content: 'Ты умный и краткий голосовой помощник. Отвечай максимально коротко (1-2 предложения), так как твой ответ будет выводиться на крошечный экран 128x64 пикселей без переносов слов.' 
          },
          { role: 'user', content: userText }
        ]
      })
    });

    const llmData = await llmResponse.json();
    const replyText = llmData.choices[0].message.content;

    // 5. Возвращаем всё клиенту (на комп или ESP32)
    return res.status(200).json({ 
      recognizedText: userText, // Чтобы видеть на экране, как он тебя услышал
      reply: replyText 
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера', details: error.message });
  }
}
