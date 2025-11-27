import { Router } from 'express'
import base from '../../../db/airtable'
import { ServerError, UncatchedError, type customError } from '../../../errors/errors'
import { RecruiterResponse } from '../../../interfaces'

const recruitersRouter = Router()

// eslint-disable-next-line @typescript-eslint/no-misused-promises
recruitersRouter.get('/payroll', async (req, res): Promise<any> => {
  try {
    const slug = req.query.slug as string
    const roleCodeQuery = req.query.roleCode as string | undefined

    if (!slug) {
      throw new ServerError('Slug parameter is required', 'El parámetro slug es requerido', 400)
    }

    console.log('🔍 Buscando recruiter con slug:', slug)

    // Buscar recruiter en la tabla "LinkIT - Recruiters" o "Payroll" (verificar nombre exacto)
    // Intentamos con diferentes nombres posibles de la tabla
    const possibleTableNames = [
      'LinkIT - Recruiters',
      'Recruiters',
      'Payroll',
      'LinkIT - Payroll'
    ]

    let recruiterFound = null

    // Intentar buscar en cada tabla posible
    for (const tableName of possibleTableNames) {
      try {
        console.log(`📋 Intentando buscar en tabla: ${tableName}`)
        const result = await base(tableName)
          .select({
            filterByFormula: `{URL Slug} = "${slug}"`,
            maxRecords: 1
          })
          .firstPage()

        if (result.length > 0) {
          recruiterFound = result[0]
          console.log(`✅ Recruiter encontrado en tabla: ${tableName}`)
          break
        }
      } catch (error: any) {
        // Si la tabla no existe, el error será diferente a si no encuentra el registro
        if (error.message?.includes('Table') || error.message?.includes('Could not find')) {
          console.log(`⚠️ Tabla ${tableName} no encontrada, continuando...`)
          continue
        }
        // Otro tipo de error, loguearlo pero continuar
        console.log(`⚠️ Error al buscar en ${tableName}:`, error.message)
        continue
      }
    }

    if (!recruiterFound) {
      console.log('❌ Recruiter no encontrado con slug:', slug)
      throw new ServerError('Recruiter not found', 'Recruiter no encontrado', 404)
    }

    const recruiter = recruiterFound.fields

    // Verificar si está activo - intentar múltiples formas de verificar
    const status = recruiter.Status as string | undefined
    const activeField = recruiter.Active as boolean | undefined
    
    let active = false
    if (activeField !== undefined) {
      active = activeField === true
    } else if (status) {
      active = status === 'Active' || status === 'active' || status.toLowerCase() === 'active'
    } else {
      // Si no hay campo de status/active, asumimos que está activo
      active = true
      console.log('⚠️ No se encontró campo Status/Active, asumiendo activo')
    }

    console.log(`📊 Estado del recruiter - Status: ${status}, Active: ${activeField}, Resultado: ${active}`)

    if (!active) {
      console.log('❌ Recruiter inactivo')
      throw new ServerError('Recruiter is not active', 'El recruiter no está activo', 404)
    }

    // Obtener photoUrl de forma segura (omitir si causa problemas)
    let photoUrl = ''
    try {
      const photo = recruiter.Photo as any
      if (photo && Array.isArray(photo) && photo.length > 0) {
        photoUrl = photo[0]?.url || ''
      }
    } catch (error) {
      // Si hay algún error al obtener la foto, simplemente dejamos photoUrl vacío
      console.log('⚠️ No se pudo obtener photoUrl, se omite')
    }

    // Construir respuesta
    const sanitizedRoleCode = roleCodeQuery?.trim() ?? null
    const recruitmentRoleCode = sanitizedRoleCode && sanitizedRoleCode.length > 0 ? sanitizedRoleCode : null
    const recruitmentRoleName: string | null = null

    const response: RecruiterResponse = {
      id: recruiterFound.id,
      name: (recruiter.Name as string) || '',
      lastName: (recruiter['Last name'] as string) || '',
      urlSlug: (recruiter['URL Slug'] as string) || slug,
      email: (recruiter.Email as string) || '',
      photoUrl,
      active,
      formUrl: (recruiter['Form URL'] as string) || '',
      recruitmentRoleCode,
      recruitmentRoleName
    }

    console.log('✅ Recruiter encontrado:', response.name)
    return res.status(200).json(response)
  } catch (error: any) {
    console.error('❌ Error en getRecruiterBySlug:', error)
    if (error instanceof ServerError) {
      return res.status(error.code).json(error[(req as any).lang as keyof Error])
    }
    const newError = new UncatchedError(
      error.message,
      'requesting recruiter information',
      'solicitar información del recruiter'
    )
    return res.status(500).json(newError[(req as any).lang as keyof customError])
  }
})

export default recruitersRouter

