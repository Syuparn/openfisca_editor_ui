import { GoogleGenerativeAI } from "@google/generative-ai";

export function geminiHandler(apiKey: string) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-pro"});

  return async (instruction: string, prompt: string): Promise<string> => {
    const chat = model.startChat({
      history: [
        {
          role: "user",
          parts: [{ text: instruction }],
        },
        // NOTE: Geminiのダミー返答を記載しないとエラーが発生する（交互に会話する必要があるため）
        {
          role: "model",
          parts: [{ text: "分かりました。" }],
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

