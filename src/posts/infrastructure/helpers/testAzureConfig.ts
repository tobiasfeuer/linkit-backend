import axios from "axios"

const AZURE_TRANSLATOR_KEY = process.env.AZURE_TRANSLATOR_KEY
const AZURE_TRANSLATOR_ENDPOINT = process.env.AZURE_ENDPOINT
const AZURE_TRANSLATOR_REGION = process.env.AZURE_TRANSLATOR_REGION ?? process.env.AZURE_REGION

export async function testAzureConfiguration(): Promise<{ success: boolean; message: string; details?: any }> {
  try {
    console.log("🧪 Probando configuración de Azure Translator...")
    console.log("📍 Endpoint:", AZURE_TRANSLATOR_ENDPOINT)
    console.log("🔑 Key configurada:", AZURE_TRANSLATOR_KEY ? "✅ Sí" : "❌ No")
    console.log("🌍 Región:", AZURE_TRANSLATOR_REGION)

    if (!AZURE_TRANSLATOR_KEY || !AZURE_TRANSLATOR_ENDPOINT) {
      return {
        success: false,
        message: "Variables de entorno AZURE_TRANSLATOR_KEY y AZURE_ENDPOINT no están configuradas"
      }
    }

    if (!AZURE_TRANSLATOR_REGION) {
      return {
        success: false,
        message: "Variable AZURE_TRANSLATOR_REGION no está configurada (ej. westeurope)"
      }
    }

    // Probar con un texto simple
    const testText = "Hola mundo"
    
    const response = await axios({
      baseURL: AZURE_TRANSLATOR_ENDPOINT,
      url: "/translate",
      method: "post",
      params: {
        "api-version": "3.0",
        to: "en",
        from: "es"
      },
      headers: {
        "Ocp-Apim-Subscription-Key": AZURE_TRANSLATOR_KEY,
        "Ocp-Apim-Subscription-Region": AZURE_TRANSLATOR_REGION,
        "Content-type": "application/json",
      },
      data: [{ Text: testText }],
      timeout: 10000,
    })

    const translatedText = response.data[0].translations[0].text
    
    console.log("✅ Prueba exitosa!")
    console.log(`📝 Texto original: "${testText}"`)
    console.log(`🌐 Texto traducido: "${translatedText}"`)

    return {
      success: true,
      message: "Configuración de Azure Translator funcionando correctamente",
      details: {
        original: testText,
        translated: translatedText,
        endpoint: AZURE_TRANSLATOR_ENDPOINT,
        region: AZURE_TRANSLATOR_REGION
      }
    }

  } catch (error: any) {
    console.error("❌ Error en prueba de configuración:", {
      message: error.message,
      code: error.code,
      status: error.response?.status,
      statusText: error.response?.statusText,
      url: error.config?.url,
      baseURL: error.config?.baseURL
    })

    return {
      success: false,
      message: `Error de configuración: ${error.message}`,
      details: {
        error: error.message,
        code: error.code,
        status: error.response?.status,
        url: error.config?.url
      }
    }
  }
} 