import axios from "axios"
import { type JdEntity } from "../../domain/jd/jd.entity"

const AZURE_TRANSLATOR_KEY = process.env.AZURE_TRANSLATOR_KEY
const AZURE_TRANSLATOR_ENDPOINT = process.env.AZURE_ENDPOINT
const AZURE_TRANSLATOR_REGION = "Global"

async function translateText(text: string, to = "en"): Promise<string> {
  if (!text || text.trim() === "") return ""

  try {
    const response = await axios({
      baseURL: AZURE_TRANSLATOR_ENDPOINT,
      url: "/translate",
      method: "post",
      params: {
        "api-version": "3.0",
        to,
        from: "es" 
      },
      headers: {
        "Ocp-Apim-Subscription-Key": AZURE_TRANSLATOR_KEY,
        "Ocp-Apim-Subscription-Region": AZURE_TRANSLATOR_REGION,
        "Content-type": "application/json",
      },
      data: [{ Text: text }],
    })
    const translatedText = response.data[0].translations[0].text
    
    // Verificar que la traducción sea diferente al texto original
    if (translatedText === text) {
      console.warn(`La traducción es idéntica al texto original: "${text}"`)
    }
    
    return translatedText
  } catch (error) {
    console.error("Translation error:", error)
    return text // Devolver el texto original si falla la traducción
  }
}

export async function translateJDToEnglish(jd: JdEntity): Promise<Partial<JdEntity>> {
  const translated: Partial<JdEntity> = {}
  // Traducir campos de texto simples
  if (jd.title) translated.title = await translateText(jd.title)
  if (jd.description) translated.description = await translateText(jd.description)
  if (jd.location) translated.location = await translateText(jd.location)
  if (jd.aboutUs) translated.aboutUs = await translateText(jd.aboutUs)
  if (jd.aboutClient) translated.aboutClient = await translateText(jd.aboutClient)

  // Traducir arrays de strings
  if (jd.stack && jd.stack.length > 0) {
    translated.stack = await Promise.all(jd.stack.map((s) => translateText(s)))
  }

  if (jd.responsabilities && jd.responsabilities.length > 0) {
    translated.responsabilities = await Promise.all(jd.responsabilities.map((r) => translateText(r)))
  }

  if (jd.requirements && jd.requirements.length > 0) {
    translated.requirements = await Promise.all(jd.requirements.map((r) => translateText(r)))
  }

  if (jd.niceToHave && jd.niceToHave.length > 0) {
    translated.niceToHave = await Promise.all(jd.niceToHave.map((n) => translateText(n)))
  }

  if (jd.benefits && jd.benefits.length > 0) {
    translated.benefits = await Promise.all(jd.benefits.map((b) => translateText(b)))
  }
  return translated
}
