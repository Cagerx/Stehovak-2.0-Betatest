
import { Modality, Type, ThinkingLevel } from "@google/genai";
import { ai } from "../firebase";

// Striktní systémová instrukce pro vynucení češtiny
const SYSTEM_INSTRUCTION = "Jsi expertní logistický asistent pro českou aplikaci 'Stěhovák 2.0'. TVŮJ JAZYK JE ČEŠTINA. \n\n1. Veškerá komunikace musí probíhat výhradně v češtině (Czech language only).\n2. Odpovídej věcně, profesionálně a s ohledem na české reálie.\n3. Používej metrický systém (metry, kilogramy) a českou měnu (Kč).\n4. Data formátuj jako DD.MM.RRRR.\n5. Pokud uživatel zadá dotaz v jiném jazyce, přelož si ho a odpověz česky.";

const handleAIError = (error: any): string | null => {
  const errorMessage = (error.message || String(error)).toLowerCase();
  const isAbort = error.name === 'AbortError' || 
                  errorMessage.includes('aborted') || 
                  errorMessage.includes('signal is aborted') ||
                  errorMessage.includes('user aborted') ||
                  errorMessage.includes('cancel') ||
                  errorMessage.includes('failed to fetch') ||
                  errorMessage.includes('request was cancelled');
  
  if (isAbort) {
    console.warn("AI request was aborted or cancelled.");
    return null; // Return null to indicate it was an abort
  }
  
  console.error("AI Service Error:", error);
  return "Služba AI je dočasně nedostupná. Zkuste to prosím později.";
};

export const geminiService = {
  /**
   * Fast responses (Gemini 2.5 Flash Lite)
   */
  async chatFast(prompt: string): Promise<string> {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite-preview',
        contents: prompt,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
        },
      });
      return response.text || "Bez odpovědi.";
    } catch (error: any) {
      const errorMsg = handleAIError(error);
      return errorMsg || "";
    }
  },

  /**
   * Extract Structured Data from Notes (Gemini 3 Flash Preview)
   * Vylepšeno pro vyšší přesnost rozpoznání adres a kontaktů.
   */
  async extractTaskFromNotes(noteText: string): Promise<{
    title?: string;
    customer?: string;
    customerPhone?: string;
    from?: string;
    to?: string;
    estimatedPrice?: number;
  }> {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Analyzuj následující text poznámky k logistické/stěhovací zakázce a extrahuj strukturovaná data.
        
        VSTUPNÍ TEXT POZNÁMKY:
        "${noteText}"
        
        INSTRUKCE PRO EXTRAKCI:
        1. **customer**: Najdi jméno zákazníka. Hledej fráze jako "Klient:", "Pan/Paní" nebo jména na začátku textu.
        2. **customerPhone**: Najdi telefonní číslo. Pokud je to české číslo, zformátuj ho s mezerami (např. +420 777 888 999).
        3. **from**: Adresa NAKLÁDKY (start). Hledej klíčová slova: "z:", "odkud:", "nakládka:", "adresa 1", "byt A".
        4. **to**: Adresa VYKLÁDKY (cíl). Hledej klíčová slova: "do:", "kam:", "vykládka:", "adresa 2", "byt B".
        5. **estimatedPrice**: Najdi odhadovanou cenu. Hledej čísla následovaná "Kč", "korun" nebo "cena". Vrať pouze čisté číslo.
        6. **title**: Vytvoř stručný název zakázky. 
           - Pokud jsou známa města, použij formát: "Stěhování: [Město Odkud] -> [Město Kam]".
           - Jinak použij předmět stěhování, např. "Převoz gauče", "Stěhování 2+kk".
        
        Pokud některý údaj v textu chybí, vrať pro daný klíč prázdný řetězec nebo null pro cenu.`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              customer: { type: Type.STRING },
              customerPhone: { type: Type.STRING },
              from: { type: Type.STRING },
              to: { type: Type.STRING },
              estimatedPrice: { type: Type.NUMBER }
            }
          }
        },
      });

      try {
        return JSON.parse(response.text || "{}");
      } catch (e) {
        console.error("Failed to parse JSON from AI", e);
        return {};
      }
    } catch (error: any) {
      handleAIError(error);
      return {};
    }
  },

  /**
   * Transcribe Audio (Gemini 3 Flash Preview)
   */
  async transcribeAudio(base64Audio: string, mimeType: string): Promise<string> {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: {
          parts: [
            { inlineData: { data: base64Audio, mimeType: mimeType } },
            { text: "Přepiš tuto zvukovou nahrávku do textu. JAZYK JE ČEŠTINA. Pouze čistý přepis, žádné úvodní fráze." }
          ]
        },
      });
      return response.text || "";
    } catch (error: any) {
      const errorMsg = handleAIError(error);
      return errorMsg || "";
    }
  },

  /**
   * Generate Speech / TTS (Gemini 2.5 Flash Preview TTS)
   */
  async generateSpeech(text: string): Promise<string | null> {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: text }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: 'Kore' }, // Kore, Puck, Charon, Fenrir, Zephyr
              },
          },
        },
      });
      
      // API returns raw PCM data in inlineData.data
      return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || null;
    } catch (error: any) {
      handleAIError(error);
      return null;
    }
  },

  /**
   * Thinking mode for complex queries (Gemini 3 Flash with Thinking Config)
   */
  async thinkComplex(prompt: string, onChunk?: (chunk: string) => void): Promise<string> {
    try {
      if (onChunk) {
        const response = await ai.models.generateContentStream({
          model: 'gemini-3-flash-preview',
          contents: prompt,
          config: {
            systemInstruction: SYSTEM_INSTRUCTION,
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW }
          },
        });

        let fullText = "";
        for await (const chunk of response) {
          if (chunk.text) {
            fullText += chunk.text;
            onChunk(chunk.text);
          }
        }
        return fullText;
      } else {
        const response = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: prompt,
          config: {
            systemInstruction: SYSTEM_INSTRUCTION,
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW }
          },
        });
        return response.text || "Nebyla vygenerována žádná odpověď.";
      }
    } catch (error: any) {
      const errorMsg = handleAIError(error);
      return errorMsg || "";
    }
  },

  /**
   * Extract Structured Data from an Image (Gemini 3.1 Pro Preview)
   */
  async extractTaskFromImage(base64Image: string, mimeType: string): Promise<{
    title?: string;
    customer?: string;
    customerPhone?: string;
    from?: string;
    to?: string;
    notes?: string;
    estimatedPrice?: number;
  }> {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: {
          parts: [
            { inlineData: { data: base64Image, mimeType: mimeType } },
            { text: `Analyzuj tento obrázek (např. screenshot objednávky, fotka dokumentu nebo scény) a extrahuj data pro stěhovací zakázku.
            
            Hledej:
            1. Jméno zákazníka (customer)
            2. Telefonní číslo (customerPhone)
            3. Adresu odkud (from)
            4. Adresu kam (to)
            5. Odhadovanou cenu (estimatedPrice) - pouze číslo
            6. Stručný název akce (title)
            7. Jakékoliv další důležité detaily (notes)
            
            Odpověz v JSON formátu.` }
          ]
        },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              customer: { type: Type.STRING },
              customerPhone: { type: Type.STRING },
              from: { type: Type.STRING },
              to: { type: Type.STRING },
              notes: { type: Type.STRING },
              estimatedPrice: { type: Type.NUMBER }
            }
          }
        }
      });

      try {
        return JSON.parse(response.text || "{}");
      } catch (e) {
        console.error("Failed to parse JSON from AI image analysis", e);
        return {};
      }
    } catch (error: any) {
      handleAIError(error);
      return {};
    }
  },

  /**
   * Analyze images (Gemini 3 Pro)
   */
  async analyzeImage(imagePrompt: string, base64Image: string, mimeType: string): Promise<string> {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: {
          parts: [
            { inlineData: { data: base64Image, mimeType: mimeType } },
            { text: imagePrompt }
          ]
        },
        config: {
          systemInstruction: SYSTEM_INSTRUCTION
        }
      });
      return response.text || "Nepodařilo se analyzovat obrázek.";
    } catch (error: any) {
      const errorMsg = handleAIError(error);
      return errorMsg || "";
    }
  },

  /**
   * Generate images (Gemini 3 Pro Image)
   */
  async generateImage(prompt: string, size: '1K' | '2K' | '4K', aspectRatio: string): Promise<string | null> {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-image-preview',
        contents: { parts: [{ text: `Vysoce kvalitní, fotorealistický obrázek, české prostředí: ${prompt}` }] },
        config: {
          imageConfig: {
            aspectRatio: aspectRatio,
            imageSize: size
          }
        }
      });

      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          return `data:image/png;base64,${part.inlineData.data}`;
        }
      }
      return null;
    } catch (error: any) {
      handleAIError(error);
      return null;
    }
  },

  /**
   * Edit images with text prompts (Gemini 2.5 Flash Image)
   */
  async editImage(prompt: string, base64Image: string, mimeType: string): Promise<string | null> {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [
            { inlineData: { data: base64Image, mimeType: mimeType } },
            { text: `Uprav tento obrázek podle pokynů (odpověz česky): ${prompt}` }
          ]
        },
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
        },
      });

      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          return `data:image/png;base64,${part.inlineData.data}`;
        }
      }
      return null;
    } catch (error: any) {
      handleAIError(error);
      return null;
    }
  },

  /**
   * Generate a daily briefing summary for tasks
   */
  async generateBriefing(todayTasks: any[], tomorrowTasks: any[]): Promise<string> {
    const prompt = `Jsi manažer stěhovací firmy. Připrav stručný a motivační přehled (briefing) pro tým na základě těchto dat:
    
    DNEŠNÍ ÚKOLY:
    ${JSON.stringify(todayTasks.map(t => ({ title: t.title, customer: t.customer, from: t.from, to: t.to, status: t.status })))}
    
    ZÍTŘEJŠÍ PLÁNY:
    ${JSON.stringify(tomorrowTasks.map(t => ({ title: t.title, customer: t.customer, from: t.from, to: t.to })))}
    
    INSTRUKCE:
    1. Shrň dnešní stav (co zbývá, na co si dát pozor).
    2. Vyzdvihni nejdůležitější akci na zítra.
    3. Buď stručný, profesionální a povzbuzující.
    4. Odpověz v češtině.`;

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite-preview',
        contents: prompt,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
        },
      });
      return response.text || "Nepodařilo se vygenerovat briefing.";
    } catch (error: any) {
      const errorMsg = handleAIError(error);
      return errorMsg || "";
    }
  },

  /**
   * Maps Grounding (Gemini 2.5 Flash)
   */
  async getMapsInfo(query: string, lat?: number, lng?: number): Promise<{ text: string, links: any[] }> {
    try {
      const config: any = {
        tools: [{ googleMaps: {} }],
        systemInstruction: SYSTEM_INSTRUCTION
      };

      if (lat !== undefined && lng !== undefined) {
        config.toolConfig = {
          retrievalConfig: {
            latLng: { latitude: lat, longitude: lng }
          }
        };
      }

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `Najdi v okolí (odpověz česky): ${query}`,
        config
      });

      return {
        text: response.text || "",
        links: response.candidates?.[0]?.groundingMetadata?.groundingChunks || []
      };
    } catch (error: any) {
      const errorMsg = handleAIError(error);
      return {
        text: errorMsg || "",
        links: []
      };
    }
  },

  /**
   * Generic content generation (Gemini 3 Flash Preview)
   * Used for stories and general prompts.
   */
  async generateStory(prompt: string): Promise<string> {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
        },
      });
      return response.text || "Příběh nebyl vygenerován.";
    } catch (error: any) {
      const errorMsg = handleAIError(error);
      return errorMsg || "";
    }
  }
};
