
import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

export async function analyzeImage(imageUrl: string): Promise<string[]> {
  try {
    // Fetch image data to base64
    const response = await fetch(imageUrl);
    const blob = await response.blob();
    const base64Data = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = (reader.result as string).split(',')[1];
        resolve(base64);
      };
      reader.readAsDataURL(blob);
    });

    const result = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: base64Data,
            },
          },
          { text: "Analyze this image and provide exactly 3-5 descriptive tags as a JSON array of strings." }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        }
      }
    });

    if (result.text) {
      return JSON.parse(result.text);
    }
    return [];
  } catch (error) {
    console.error("AI Analysis Error:", error);
    return ["Analysis Failed"];
  }
}
