import Jd from '../schema/Jd'
import { translateJDToEnglish } from './AzureJDTranslator'
import { JdEntity } from '../../domain/jd/jd.entity'

export async function fixSpecificJD(code: string): Promise<void> {
  try {
    console.log(`Buscando JD con código: ${code}`)
    
    const jd = await Jd.findOne({ code })
    
    if (!jd) {
      console.log(`No se encontró JD con código: ${code}`)
      return
    }
    
    console.log(`JD encontrado: ${jd.title}`)
    console.log('Verificando traducciones...')
    
    // Verificar si el contenido en 'en' es igual al original (no traducido)
    const needsTranslation = jd.en && (
      jd.en.title === jd.title ||
      jd.en.description === jd.description ||
      jd.en.location === jd.location
    )
    
    if (needsTranslation) {
      console.log('Se detectó contenido no traducido. Limpiando y retraduciendo...')
      
      // Limpiar el campo 'en'
      jd.en = {
        title: '',
        description: '',
        location: '',
        modality: '',
        stack: [],
        aboutUs: '',
        aboutClient: '',
        responsabilities: [],
        requirements: [],
        niceToHave: [],
        benefits: []
      }
      
      await jd.save()
      console.log('Campo "en" limpiado exitosamente')
      
      // Ahora traducir
      console.log('Iniciando traducción...')
      const jdObject = jd.toObject()
      const translated = await translateJDToEnglish(jdObject as JdEntity)
      
      // Guardar la traducción
      jd.en = translated as any
      await jd.save()
      
      console.log('Traducción completada y guardada')
      console.log('Título original:', jd.title)
      console.log('Título traducido:', jd.en?.title)
    } else {
      console.log('El JD ya tiene traducciones válidas')
    }
    
  } catch (error) {
    console.error('Error al corregir JD específico:', error)
    throw error
  }
} 