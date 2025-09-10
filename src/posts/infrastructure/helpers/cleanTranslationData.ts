import Jd from '../schema/Jd'

export async function cleanInvalidTranslations(): Promise<void> {
  try {
    console.log('Iniciando limpieza de traducciones inválidas...')
    
    // Buscar todos los documentos JD
    const allJds = await Jd.find()
    let cleanedCount = 0
    
    for (const jd of allJds) {
      let needsUpdate = false
      
      // Verificar si el campo 'en' existe y tiene contenido
      if (jd.en) {
        // Verificar si los campos traducidos son iguales a los originales (indicando que no están traducidos)
        if (jd.en.title === jd.title || 
            jd.en.description === jd.description ||
            jd.en.location === jd.location) {
          
          console.log(`Limpieza necesaria para JD ${jd.code}: ${jd.title}`)
          
          // Limpiar el campo 'en' para forzar nueva traducción
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
          
          needsUpdate = true
        }
      }
      
      if (needsUpdate) {
        await jd.save()
        cleanedCount++
        console.log(`JD ${jd.code} limpiado exitosamente`)
      }
    }
    
    console.log(`Limpieza completada. ${cleanedCount} documentos actualizados.`)
  } catch (error) {
    console.error('Error durante la limpieza:', error)
    throw error
  }
} 