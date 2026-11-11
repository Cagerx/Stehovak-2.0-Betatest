import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI, Type } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

function parseBase64(dataUrlOrBase64?: string, defaultMime = 'image/jpeg') {
  if (!dataUrlOrBase64) return null;
  const match = dataUrlOrBase64.match(/^data:([^;]+);base64,(.+)$/);
  if (match) {
    return { mimeType: match[1], data: match[2] };
  }
  return { mimeType: defaultMime, data: dataUrlOrBase64 };
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Body parser with 25MB limit for high-res photo uploads
  app.use(express.json({ limit: "25mb" }));
  app.use(express.urlencoded({ extended: true, limit: "25mb" }));

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Extract vehicle technical certificate data using Gemini Vision
  app.post("/api/gemini/extract-tech-cert", async (req, res) => {
    try {
      const { frontImage, backImage } = req.body || {};

      if (!frontImage && !backImage) {
        return res.status(400).json({ error: "Nebyl poskytnut žádný obrázek technického průkazu." });
      }

      const parts: any[] = [];

      const frontParsed = parseBase64(frontImage);
      if (frontParsed) {
        parts.push({
          inlineData: {
            data: frontParsed.data,
            mimeType: frontParsed.mimeType,
          }
        });
        parts.push({ text: "Toto je PŘEDNÍ strana technického průkazu (osvědčení o registraci vozidla)." });
      }

      const backParsed = parseBase64(backImage);
      if (backParsed) {
        parts.push({
          inlineData: {
            data: backParsed.data,
            mimeType: backParsed.mimeType,
          }
        });
        parts.push({ text: "Toto je ZADNÍ strana technického průkazu (osvědčení o registraci vozidla)." });
      }

      const instruction = `Jsi specialista na extrakci dat z technických průkazů vozidel (osvědčení o registraci vozidla ČR i EU - velký i malý technický průkaz).
Analyzuj dodanou fotografii (přední a/nebo zadní stranu) a extrahuj co nejpřesněji následující údaje o vozidle:

1. plate: Registrační značka vozidla (SPZ). Například '1AB 2345' nebo '9B2 4581'. Pokud jsou v ní mezery, zachovej je (obvykle 3-4 znaky, mezera, zbytek). Vrať velkými písmeny bez zbytečných znaků.
2. model: Tovární značka a obchodní označení / model vozidla. Např. 'Mercedes-Benz Sprinter 316 CDI', 'Iveco Daily 35S18', 'Renault Master', 'Ford Transit', 'Volkswagen Crafter', 'Fiat Ducato'. Spoj položky D.1 (tovární značka) a D.3 (obchodní označení) do jednoho jasného a přehledného názvu.
3. vin: Identifikační číslo vozidla (VIN) - přesně 17místný alfanumerický kód z kolonky E.
4. capacity: Objem nákladového / ložného prostoru pro stěhovací účely (např. '14 m³', '12 m³', '17 m³', '20 m³'). Pokud je v TP uvedena délka, šířka a výška ložné plochy v mm, spočítej objem v m³ (např. 4.2m x 2.1m x 2.1m = ~18 m³) a uveď jako 'X m³'. Pokud rozměry chybí, odvoď realistický objem podle typu dodávky/nástavby nebo uveď prázdný řetězec.
5. stkExpiration: Datum platnosti technické prohlídky (STK) ve formátu YYYY-MM-DD (např. '2026-10-15'). Hledej na zadní straně TP v sekci technických prohlídek, razítek nebo 'Platnost technické způsobilosti do:'. Pokud datum nelze bezpečně určit, ponech prázdný řetězec.
6. tireSize: Rozměr pneumatik a ráfků (např. '235/65 R16C', '225/65 R16', '195/70 R15C'). Hledej v sekci nápravy / kola a pneumatiky.
7. insuranceInfo: Pojišťovna nebo záznam o pojištění, pokud je v dokumentu zmíněn, jinak prázdný řetězec.

Odpověz výhradně ve formátu JSON podle definovaného schématu. Nevymýšlej si neexistující údaje; pokud kolonka není zřetelná, vrať prázdný řetězec.`;

      parts.push({ text: instruction });

      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: { parts },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              plate: { type: Type.STRING, description: "SPZ / Registrační značka vozidla" },
              model: { type: Type.STRING, description: "Značka a model vozidla" },
              vin: { type: Type.STRING, description: "17místný VIN kód" },
              capacity: { type: Type.STRING, description: "Objem ložného prostoru např. 14 m³" },
              stkExpiration: { type: Type.STRING, description: "Datum platnosti STK ve formátu YYYY-MM-DD" },
              tireSize: { type: Type.STRING, description: "Rozměr pneumatik" },
              insuranceInfo: { type: Type.STRING, description: "Informace o pojištění" },
              extractedFields: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "Seznam klíčů polí, které se podařilo úspěšně vyčíst"
              }
            }
          }
        }
      });

      const text = response.text || "{}";
      const data = JSON.parse(text);

      return res.json({
        success: true,
        data,
      });
    } catch (error: any) {
      console.error("Gemini tech cert extraction error:", error);
      return res.status(500).json({
        error: error?.message || "Chyba při analýze technického průkazu."
      });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production static file serving
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
