
import { GoogleGenAI, Type } from "@google/genai";

export async function analyzeImage(imageUrl: string): Promise<string[]> {
  try {
    // Initialize AI inside the function to ensure we use the latest API key from process.env
    const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY || '';
    const ai = new GoogleGenAI({ apiKey });

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
  } catch (error: any) {
    console.error("AI Analysis Error:", error);
    
    // Check for authentication errors
    const errorMessage = error?.message || String(error);
    if (errorMessage.includes("API_KEY_INVALID") || 
        errorMessage.includes("invalid API key") || 
        errorMessage.includes("401") || 
        errorMessage.includes("403") ||
        errorMessage.includes("Requested entity was not found")) {
      throw new Error("AUTH_ERROR");
    }
    
    return ["Analysis Failed"];
  }
}
