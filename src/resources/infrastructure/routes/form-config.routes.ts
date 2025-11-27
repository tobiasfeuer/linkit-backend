import { Router } from 'express'
import base from '../../../db/airtable'
import { ServerError, UncatchedError, type customError } from '../../../errors/errors'
import axios from 'axios'

const formConfigRouter = Router()

// Función para convertir nombre de campo a camelCase
function toCamelCase(str: string): string {
  if (!str) return ''
  
  return str
    .trim()
    .replace(/\s+/g, ' ')
    .split(/[\s\-_\+]+/)
    .map((word, index) => {
      if (!word) return ''
      if (index === 0) {
        return word.charAt(0).toLowerCase() + word.slice(1)
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    })
    .join('')
    .replace(/[^a-zA-Z0-9]/g, '')
    .replace(/^[A-Z]/, (match) => match.toLowerCase())
}

// Mapeo de tipos de Airtable a tipos de formulario
function mapAirtableTypeToFormType(airtableType: string): string {
  const typeMap: Record<string, string> = {
    singleLineText: 'text',
    email: 'email',
    url: 'url',
    singleSelect: 'select',
    multipleSelects: 'multi-select',
    multilineText: 'textarea',
    number: 'number',
    attachment: 'file',
    date: 'date',
    phoneNumber: 'tel'
  }
  return typeMap[airtableType] || 'text'
}

// Función para obtener opciones de un campo select
function getSelectOptions(field: any): string[] | null {
  if (field.type === 'singleSelect' || field.type === 'multipleSelects') {
    return field.options?.choices?.map((choice: any) => choice.name) || null
  }
  return null
}

// eslint-disable-next-line @typescript-eslint/no-misused-promises
formConfigRouter.get('/', async (req, res): Promise<any> => {
  try {
    const view = (req.query.view as string) || 'RecruiterFormWebView'
    const lang = (req.query.lang as string) || 'es'

    // Obtener schema de la tabla usando la API REST de Airtable
    const apiKey = process.env.API_KEY
    const baseId = process.env.AIRTABLE_BASE
    const tableName = 'LinkIT - Candidate application'

    if (!apiKey || !baseId) {
      throw new ServerError('Airtable configuration missing', 'Configuración de Airtable faltante', 500)
    }

    // Obtener metadata de la tabla usando la API REST de Airtable
    let table: any = null
    let tableId: string | null = null
    try {
      const metadataUrl = `https://api.airtable.com/v0/meta/bases/${baseId}/tables`
      const metadataResponse = await axios.get(metadataUrl, {
        headers: {
          Authorization: `Bearer ${apiKey}`
        }
      })

      // Encontrar la tabla correcta
      table = metadataResponse.data.tables.find((t: any) => t.name === tableName)
      if (!table) {
        throw new ServerError('Table not found', 'Tabla no encontrada', 404)
      }
      tableId = table.id
    } catch (error: any) {
      // Si falla la API de metadata, intentar obtener campos desde un registro de ejemplo
      if (error.response?.status === 403 || error.response?.status === 401) {
        throw new ServerError(
          'Airtable metadata API access denied. Please check API key permissions.',
          'Acceso denegado a la API de metadata de Airtable. Por favor verifique los permisos de la API key.',
          403
        )
      }
      throw new ServerError(
        'Error fetching table metadata from Airtable',
        'Error al obtener metadata de la tabla desde Airtable',
        500
      )
    }

    // Obtener metadata de la vista para saber qué campos están visibles
    let viewMetadata: any = null
    let visibleFieldIds: string[] = []
    let visibleFieldNames: string[] = []
    
    try {
      // Intentar obtener metadata de la vista usando la API
      const foundView = table.views?.find((v: any) => v.name === view)
      if (!foundView) {
        throw new ServerError(
          `View "${view}" not found in table`,
          `Vista "${view}" no encontrada en la tabla`,
          404
        )
      }

      // Primero, verificar qué información ya tenemos en foundView
      console.log('📋 Estructura completa de foundView:', JSON.stringify(foundView, null, 2))
      
      // Verificar si foundView ya tiene la información que necesitamos
      if (foundView.visibleFieldIds && Array.isArray(foundView.visibleFieldIds) && foundView.visibleFieldIds.length > 0) {
        visibleFieldIds = foundView.visibleFieldIds
        console.log(`✅ Vista ya tiene visibleFieldIds en table.views: ${visibleFieldIds.length} campos`)
      } else if (foundView.viewColumnSpecs && Array.isArray(foundView.viewColumnSpecs) && foundView.viewColumnSpecs.length > 0) {
        visibleFieldIds = foundView.viewColumnSpecs.map((spec: any) => spec.fieldId || spec.id).filter(Boolean)
        console.log(`✅ Vista tiene viewColumnSpecs: ${visibleFieldIds.length} campos`)
      } else {
        // Si no tenemos la información directamente, intentar Metadata API
        try {
          // Intentar obtener metadata completa de la vista usando Metadata API
          // La Metadata API requiere permisos especiales y puede no estar disponible en todos los planes
          const viewMetadataUrl = `https://api.airtable.com/v0/meta/bases/${baseId}/tables/${tableId}/views/${foundView.id}`
          console.log(`🔍 Intentando obtener metadata de vista desde API: ${viewMetadataUrl}`)
          console.log(`🔍 Base ID: ${baseId}, Table ID: ${tableId}, View ID: ${foundView.id}`)
          
          const viewResponse = await axios.get(viewMetadataUrl, {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json'
            }
          })

          viewMetadata = viewResponse.data
          visibleFieldIds = viewMetadata.visibleFieldIds || []
          
          if (visibleFieldIds.length === 0) {
            // Si no hay visibleFieldIds, intentar usar visibleFields
            if (viewMetadata.visibleFields && Array.isArray(viewMetadata.visibleFields)) {
              visibleFieldIds = viewMetadata.visibleFields.map((vf: any) => vf.id || vf)
            }
          }
          
          console.log(`✅ Metadata API funcionó: ${visibleFieldIds.length} campos visibles`)
        } catch (metaError: any) {
          // Si falla la Metadata API, registrar el error completo para debugging
          console.log('⚠️ Metadata API falló')
          console.log('⚠️ Status:', metaError.response?.status)
          console.log('⚠️ Status Text:', metaError.response?.statusText)
          console.log('⚠️ Error Data:', JSON.stringify(metaError.response?.data, null, 2))
          console.log('⚠️ Error Message:', metaError.message)
          
          // Si el error es 404, podría ser que la Metadata API no está disponible en este plan
          // o que la URL está mal formada
          if (metaError.response?.status === 404) {
            console.log('⚠️ Error 404: La Metadata API podría no estar disponible en este plan de Airtable')
            console.log('⚠️ O la URL está incorrecta. Verificando estructura de la URL...')
            
            // La Metadata API solo está disponible en planes Enterprise o Plus
            // Si no está disponible, necesitamos usar la información de table.views
            throw new Error('Metadata API no disponible (404). Esto puede ser porque: 1) El plan de Airtable no incluye Metadata API (solo Enterprise/Plus), 2) La URL está mal formada, o 3) Los permisos de la API key no incluyen Metadata API.')
          }
          
          // Re-lanzar el error para que se maneje en el catch externo
          throw metaError
        }
      }
    } catch (error: any) {
      console.log('⚠️ Error al buscar vista:', error.message)
      
      // Método alternativo: obtener campos desde registros de la vista
      // Cuando consultas registros de una vista, Airtable puede devolver solo campos visibles
      // pero esto no es 100% garantizado. Intentaremos obtener múltiples registros
      // y usar los campos que aparecen consistentemente
      if (table && table.fields) {
        try {
          console.log('🔍 Método alternativo: obteniendo campos desde registros de la vista')
          
          // Obtener varios registros de la vista para identificar campos visibles
          const sampleRecords = await base(tableName)
            .select({
              view,
              maxRecords: 100 // Obtener más registros para mejor cobertura
            })
            .all()

          // Obtener todos los nombres de campos únicos que aparecen en los registros
          // Y mantener el orden en que aparecen en el primer registro (que suele reflejar el orden de la vista)
          const fieldNamesSet = new Set<string>()
          const fieldOrderMap = new Map<string, number>()
          
          // Si hay registros, usar el orden del primer registro como referencia
          if (sampleRecords.length > 0) {
            const firstRecord = sampleRecords[0]
            Object.keys(firstRecord.fields).forEach((fieldName: string, index: number) => {
              fieldNamesSet.add(fieldName)
              fieldOrderMap.set(fieldName, index)
            })
            
            // Para asegurarnos de tener todos los campos, revisar los demás registros también
            sampleRecords.slice(1).forEach((record: any) => {
              Object.keys(record.fields).forEach((fieldName: string) => {
                if (!fieldNamesSet.has(fieldName)) {
                  // Si encontramos un campo nuevo, agregarlo al final
                  fieldOrderMap.set(fieldName, fieldOrderMap.size)
                  fieldNamesSet.add(fieldName)
                }
              })
            })
          } else {
            // Si no hay registros, usar todos los campos de la tabla
            table.fields.forEach((field: any, index: number) => {
              fieldNamesSet.add(field.name)
              fieldOrderMap.set(field.name, index)
            })
          }

          visibleFieldNames = Array.from(fieldNamesSet)
          
          // Ordenar los campos según el orden en que aparecen en los registros
          visibleFieldNames.sort((a, b) => {
            const orderA = fieldOrderMap.get(a) ?? Infinity
            const orderB = fieldOrderMap.get(b) ?? Infinity
            return orderA - orderB
          })
          
          // Filtrar campos que sabemos que no deben estar en el formulario
          // Estos son campos administrativos/internos que pueden aparecer aunque estén ocultos
          const excludedFields = [
            'ID',
            'Created Time',
            'Last Modified Time',
            'Created',
            'Internal code',
            'Year applied',
            'Month applied',
            'Nombre completo', // Campo calculado
            'Add to candidate presentation' // Campo administrativo
          ]
          
          visibleFieldNames = visibleFieldNames.filter((fieldName: string) => 
            !excludedFields.includes(fieldName)
          )
          
          console.log(`✅ Método alternativo: ${visibleFieldNames.length} campos encontrados desde registros de la vista`)
          console.log(`📋 Campos:`, visibleFieldNames)
        } catch (recordError: any) {
          console.log('⚠️ Error al obtener registros:', recordError.message)
          // Si falla, usar todos los campos como último recurso
          visibleFieldIds = table.fields.map((f: any) => f.id)
          visibleFieldNames = table.fields.map((f: any) => f.name)
          console.log('⚠️ Usando todos los campos como fallback')
        }
      } else {
        throw new ServerError(
          'No se puede obtener información de campos de la vista',
          'No se puede obtener información de campos de la vista',
          500
        )
      }
    }

    // Filtrar solo los campos visibles en la vista
    let visibleFields: any[] = []
    
    if (visibleFieldIds.length > 0) {
      // Si tenemos IDs de campos, filtrar por ID
      visibleFields = table.fields.filter((field: any) => 
        visibleFieldIds.includes(field.id)
      )
    } else if (visibleFieldNames.length > 0) {
      // Si tenemos nombres de campos, filtrar por nombre y mantener el orden
      // Crear un mapa para mantener el orden de los nombres
      const fieldOrderMap = new Map<string, number>()
      visibleFieldNames.forEach((name, index) => {
        fieldOrderMap.set(name, index)
      })
      
      // Filtrar y ordenar según el orden de visibleFieldNames
      visibleFields = table.fields
        .filter((field: any) => visibleFieldNames.includes(field.name))
        .sort((a: any, b: any) => {
          const orderA = fieldOrderMap.get(a.name) ?? Infinity
          const orderB = fieldOrderMap.get(b.name) ?? Infinity
          return orderA - orderB
        })
    } else {
      // Fallback: usar todos los campos
      visibleFields = table.fields
    }

    console.log(`✅ Procesando ${visibleFields.length} campos visibles de ${table.fields.length} campos totales`)

    // Lista de campos que NUNCA deben aparecer en el formulario (campos internos/administrativos)
    const excludedFromForm = [
      'ID',
      'Created Time',
      'Last Modified Time',
      'Created',
      'Internal code',
      'Year applied',
      'Month applied',
      'Nombre completo', // Campo calculado/derivado
      'Add to candidate presentation' // Campo administrativo
    ]

    // Mapear campos visibles a formato de configuración del formulario
    // IMPORTANTE: visibleFields ya está ordenado según el orden de la vista
    // El campo 'order' debe reflejar la posición en ese array (que es el orden de la vista)
    const formFields = visibleFields
      .map((field: any, index: number) => {
        // Omitir campos internos o que no deberían estar en el formulario
        if (excludedFromForm.includes(field.name)) {
          return null
        }

        const fieldName = toCamelCase(field.name)
        const type = mapAirtableTypeToFormType(field.type)
        const options = getSelectOptions(field)

        // Determinar si es requerido (por ahora, asumimos que no es requerido a menos que tenga validación)
        const required = field.options?.isRequired || false

        // Obtener validaciones si existen
        interface ValidationOptions {
          decimals?: number
          min?: number
          max?: number
        }
        let validation: ValidationOptions | null = null
        if (field.type === 'number' && field.options) {
          const numberOptions = field.options as { precision?: number; decimals?: number } | undefined
          validation = {}
          if (numberOptions?.precision !== undefined) {
            validation.decimals = numberOptions.precision
          } else if (numberOptions?.decimals !== undefined) {
            validation.decimals = numberOptions.decimals
          }
        } else if (field.type === 'singleLineText' || field.type === 'multilineText') {
          // Airtable no expone directamente min/max length, pero podemos inferirlo
          validation = null
        }

        // El orden debe reflejar la posición en visibleFields (que ya está ordenado según la vista)
        // Usamos index + 1 porque visibleFields ya está en el orden correcto de la vista
        const order = index + 1

        return {
          fieldName,
          airtableField: field.name,
          type,
          label: field.name, // Usar nombre del campo como label por defecto
          placeholder: '',
          instructions: field.description || '',
          required,
          options,
          validation,
          order // Este order refleja la posición exacta en la vista
        }
      })
      .filter((field: any) => field !== null)

    // Los campos ya están ordenados según el orden de la vista (visibleFields ya está ordenado)
    // Solo necesitamos actualizar el campo 'order' para reflejar la posición final
    // después de filtrar campos excluidos
    formFields.forEach((field: any, index: number) => {
      field.order = index + 1
    })
    
    // No necesitamos ordenar porque visibleFields ya está en el orden correcto
    // y formFields mantiene ese orden al filtrar

    res.status(200).json(formFields)
  } catch (error: any) {
    if (error instanceof ServerError) {
      return res.status(error.code).json(error[(req as any).lang as keyof Error])
    }
    const newError = new UncatchedError(
      error.message,
      'requesting form configuration from airtable',
      'solicitar configuración del formulario desde airtable'
    )
    return res.status(500).json(newError[(req as any).lang as keyof customError])
  }
})

export default formConfigRouter

