import { GoogleGenerativeAI } from "@google/generative-ai";

export function geminiHandler(apiKey: string) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-pro"});

  return async (prompt: string): Promise<string> => {
    const chat = model.startChat({
      history: [
        {
          role: "user",
          parts: [{ text: "Hello, I have 2 dogs in my house." }],
        },
        {
          role: "model",
          parts: [{ text: "Great to meet you. What would you like to know?" }],
        },
      ],
      generationConfig: {
        maxOutputTokens: 100,
      },
    })
  
    const result = await chat.sendMessage(prompt)
    const response = await result.response
    const text = response.text()

    return text
  }
}

