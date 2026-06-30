import axios from 'axios'
import { type JdEntity } from '../../domain/jd/jd.entity'

const AZURE_TRANSLATOR_KEY = process.env.AZURE_TRANSLATOR_KEY
const AZURE_TRANSLATOR_ENDPOINT = process.env.AZURE_ENDPOINT
const AZURE_TRANSLATOR_REGION = process.env.AZURE_TRANSLATOR_REGION ?? process.env.AZURE_REGION

function looksLikeHtml (text: string): boolean {
  return /<[a-z][\s\S]*>/i.test(text)
}

async function translateText (text: string, to = 'en'): Promise<string | null> {
  if (!text || text.trim() === '') return ''

  if (!AZURE_TRANSLATOR_KEY || !AZURE_TRANSLATOR_ENDPOINT) {
    console.error('Azure Translator: faltan AZURE_TRANSLATOR_KEY o AZURE_ENDPOINT')
    return null
  }

  if (!AZURE_TRANSLATOR_REGION) {
    console.error('Azure Translator: falta AZURE_TRANSLATOR_REGION (ej. westeurope, eastus)')
    return null
  }

  try {
    const response = await axios({
      baseURL: AZURE_TRANSLATOR_ENDPOINT,
      url: '/translate',
      method: 'post',
      params: {
        'api-version': '3.0',
        to,
        from: 'es'
      },
      headers: {
        'Ocp-Apim-Subscription-Key': AZURE_TRANSLATOR_KEY,
        'Ocp-Apim-Subscription-Region': AZURE_TRANSLATOR_REGION,
        'Content-type': 'application/json'
      },
      data: [{
        Text: text,
        ...(looksLikeHtml(text) ? { TextType: 'html' } : {})
      }]
    })

    const translatedText = response.data[0]?.translations?.[0]?.text
    if (!translatedText || translatedText.trim() === '') return null

    return translatedText
  } catch (error: any) {
    const status = error?.response?.status
    const detail = error?.response?.data?.error?.message ?? error?.message
    console.error(`Azure Translator error (${status ?? 'unknown'}): ${detail}`)
    return null
  }
}

async function translateOptionalText (text?: string | null): Promise<string | undefined> {
  if (!text || text.trim() === '') return text ?? undefined
  const translated = await translateText(text)
  return translated ?? text
}

async function translateOptionalArray (items?: string[] | null): Promise<string[] | undefined> {
  if (!items || items.length === 0) return items ?? undefined
  const translated = await Promise.all(items.map(async (item) => {
    const result = await translateText(item)
    return result ?? item
  }))
  return translated
}

export function isValidEnglishTranslation (
  source: JdEntity,
  translated: Partial<JdEntity>
): boolean {
  if (!translated.title?.trim() || !translated.description?.trim()) return false
  if (translated.description === source.description) return false
  if (translated.title === source.title && translated.description === source.description) return false
  return true
}

export async function translateJDToEnglish (jd: JdEntity): Promise<Partial<JdEntity> | null> {
  const title = await translateOptionalText(jd.title)
  const description = await translateOptionalText(jd.description)
  const location = await translateOptionalText(jd.location)
  const aboutUs = await translateOptionalText(jd.aboutUs)
  const aboutClient = await translateOptionalText(jd.aboutClient)
  const stack = await translateOptionalArray(jd.stack)
  const responsabilities = await translateOptionalArray(jd.responsabilities)
  const requirements = await translateOptionalArray(jd.requirements)
  const niceToHave = await translateOptionalArray(jd.niceToHave)
  const benefits = await translateOptionalArray(jd.benefits)

  const translated: Partial<JdEntity> = {}

  if (title) translated.title = title
  if (description) translated.description = description
  if (location) translated.location = location
  if (aboutUs) translated.aboutUs = aboutUs
  if (aboutClient) translated.aboutClient = aboutClient
  if (stack) translated.stack = stack
  if (responsabilities) translated.responsabilities = responsabilities
  if (requirements) translated.requirements = requirements
  if (niceToHave) translated.niceToHave = niceToHave
  if (benefits) translated.benefits = benefits

  if (!isValidEnglishTranslation(jd, translated)) {
    console.warn('Azure Translator: la descripción traducida no difiere del original en español')
    return null
  }

  return translated
}
