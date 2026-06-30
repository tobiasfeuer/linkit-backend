import { Router, type Request, type Response, type NextFunction } from 'express'
import { findMeetingFiles, inspectMeetingDrive, listVisibleDriveFiles, exportDocText } from '../helpers/googleDrive'
import { updateMeetingInAirtable } from '../helpers/airtableMeetings'
import Meeting from '../schema/Meeting'
import { ServerError } from '../../../errors/errors'

const GOOGLE_DOC_MIME = 'application/vnd.google-apps.document'

const driveRouter = Router()

console.log('📦 drive.routes.ts cargado (incluye sync-meeting)')

driveRouter.use((req: Request, _res: Response, next: NextFunction) => {
  console.log(`📂 Drive router: ${req.method} ${req.originalUrl} → path="${req.path}"`)
  next()
})

function validateDriveApiKey (req: Request, res: Response, next: NextFunction): void {
  const apiKey = process.env.DRIVE_BRIDGE_API_KEY
  const hasXApiKey = Boolean(req.headers['x-api-key'])
  const hasAuthorization = Boolean(req.headers.authorization)
  console.log(
    `🔑 validateDriveApiKey: ${req.method} ${req.originalUrl} | x-api-key=${hasXApiKey} auth=${hasAuthorization} envKeyLen=${apiKey?.length ?? 0}`
  )

  if (!apiKey) {
    res.status(500).json({ error: 'DRIVE_BRIDGE_API_KEY no está configurada en el servidor' })
    return
  }

  const provided = (
    (req.headers['x-api-key'] as string | undefined) ??
    req.headers.authorization?.replace(/^Bearer\s+/i, '')
  )?.trim()

  if (!provided || provided !== apiKey.trim()) {
    console.log(
      `🔑 validateDriveApiKey: RECHAZADO | providedLen=${provided?.length ?? 0} expectedLen=${apiKey.trim().length}`
    )
    res.status(401).json({ error: 'No autorizado' })
    return
  }

  console.log(`🔑 validateDriveApiKey: OK`)
  next()
}

// POST /drive/find-meeting
// Body: { meetingTitle: string, folderId?: string, sharedDriveId?: string, maxResults?: number, includeSubfolders?: boolean }
// eslint-disable-next-line @typescript-eslint/no-misused-promises
driveRouter.post('/find-meeting', validateDriveApiKey, async (req: Request, res: Response): Promise<any> => {
  try {
    const { meetingTitle, folderId, sharedDriveId, maxResults, includeSubfolders } = req.body as {
      meetingTitle?: string
      folderId?: string
      sharedDriveId?: string
      maxResults?: number
      includeSubfolders?: boolean
    }

    if (!meetingTitle || meetingTitle.trim() === '') {
      throw new ServerError(
        'meetingTitle is required',
        'El campo meetingTitle es obligatorio',
        400
      )
    }

    console.log(`🔍 Drive: buscando archivos para "${meetingTitle.trim()}"`)

    const files = await findMeetingFiles(meetingTitle.trim(), {
      folderId,
      sharedDriveId,
      maxResults: maxResults ?? 10,
      includeSubfolders
    })

    console.log(`✅ Drive: ${files.length} archivo(s) encontrado(s)`)

    return res.status(200).json({
      query: meetingTitle.trim(),
      total: files.length,
      files
    })
  } catch (error: any) {
    console.error('❌ Drive: error al buscar archivos:', error?.message ?? error)

    if (error instanceof ServerError) {
      return res.status(error.code).json({ error: error.es })
    }

    return res.status(500).json({
      error: 'Error al conectar con Google Drive',
      detail: error?.message ?? 'Error desconocido'
    })
  }
})

// POST /drive/sync-meeting
// Busca el Google Doc con ese meetingKey, exporta el texto, guarda en MongoDB y actualiza Airtable.
// Body: { meetingKey: string, airtableRecordId?: string, sharedDriveId?: string }
// eslint-disable-next-line @typescript-eslint/no-misused-promises
driveRouter.post('/sync-meeting', validateDriveApiKey, async (req: Request, res: Response): Promise<any> => {
  console.log('🔄 sync-meeting handler: INICIADO')
  try {
    const { meetingKey, airtableRecordId, sharedDriveId } = req.body as {
      meetingKey?: string
      airtableRecordId?: string
      sharedDriveId?: string
    }

    if (!meetingKey || meetingKey.trim() === '') {
      throw new ServerError(
        'meetingKey is required',
        'El campo meetingKey es obligatorio',
        400
      )
    }

    const key = meetingKey.trim()
    console.log(`🔄 Drive Sync: iniciando sync para "${key}"`)

    // 1. Buscar archivos en Drive que contengan el meetingKey en el nombre
    const files = await findMeetingFiles(key, { sharedDriveId })
    const docFile = files.find((f) => f.mimeType === GOOGLE_DOC_MIME)

    // 2. No se encontró ningún Google Doc
    if (!docFile) {
      console.log(`⚠️  Drive Sync: no se encontró Google Doc para "${key}"`)

      await Meeting.findOneAndUpdate(
        { meetingKey: key },
        {
          meetingKey: key,
          syncStatus: 'not_found',
          airtableRecordId: airtableRecordId ?? '',
          syncedAt: new Date()
        },
        { upsert: true, new: true }
      )

      if (airtableRecordId) {
        await updateMeetingInAirtable(airtableRecordId, {
          syncStatus: 'Not Found',
          syncedAt: new Date().toISOString()
        })
      }

      return res.status(200).json({
        meetingKey: key,
        syncStatus: 'not_found',
        message: 'No se encontró un Google Doc con ese meetingKey en Drive. Verificá que el título del evento incluya la clave y que Gemini haya generado las notas.'
      })
    }

    // 3. Exportar texto del Google Doc
    let transcript = ''
    try {
      transcript = await exportDocText(docFile.id)
      console.log(`📄 Drive Sync: texto exportado (${transcript.length} chars) para "${key}"`)
    } catch (exportError: any) {
      console.error(`❌ Drive Sync: error al exportar "${docFile.name}":`, exportError?.message)

      await Meeting.findOneAndUpdate(
        { meetingKey: key },
        {
          meetingKey: key,
          driveFileId: docFile.id,
          driveWebLink: docFile.webViewLink ?? '',
          fileName: docFile.name,
          mimeType: docFile.mimeType,
          syncStatus: 'error',
          errorDetail: exportError?.message ?? 'Error al exportar el documento',
          airtableRecordId: airtableRecordId ?? '',
          syncedAt: new Date()
        },
        { upsert: true, new: true }
      )

      if (airtableRecordId) {
        await updateMeetingInAirtable(airtableRecordId, {
          driveFileId: docFile.id,
          driveWebLink: docFile.webViewLink,
          syncStatus: 'Error',
          syncedAt: new Date().toISOString()
        })
      }

      throw exportError
    }

    // 4. Persistir en MongoDB (upsert — re-ejecutable sin duplicar)
    const syncedAt = new Date()
    await Meeting.findOneAndUpdate(
      { meetingKey: key },
      {
        meetingKey: key,
        driveFileId: docFile.id,
        driveWebLink: docFile.webViewLink ?? '',
        fileName: docFile.name,
        mimeType: docFile.mimeType,
        transcript,
        transcriptPreview: transcript.slice(0, 600),
        syncStatus: 'synced',
        errorDetail: '',
        airtableRecordId: airtableRecordId ?? '',
        syncedAt
      },
      { upsert: true, new: true }
    )

    // 5. Actualizar Airtable si se proporcionó el recordId
    if (airtableRecordId) {
      const baseUrl = process.env.MEETINGS_NOTES_BASE_URL ?? ''
      const apiKey = process.env.DRIVE_BRIDGE_API_KEY ?? ''
      const notesUrl = baseUrl
        ? `${baseUrl}/drive/meetings/${encodeURIComponent(key)}/notes?key=${apiKey}`
        : ''

      await updateMeetingInAirtable(airtableRecordId, {
        driveFileId: docFile.id,
        driveWebLink: docFile.webViewLink,
        transcript,
        notesUrl: notesUrl || undefined,
        syncStatus: 'Synced',
        syncedAt: syncedAt.toISOString()
      })
    }

    console.log(`✅ Drive Sync: completado para "${key}"`)

    return res.status(200).json({
      meetingKey: key,
      syncStatus: 'synced',
      driveFileId: docFile.id,
      fileName: docFile.name,
      transcriptLength: transcript.length,
      syncedAt
    })
  } catch (error: any) {
    console.error('❌ Drive Sync: error:', error?.message ?? error)

    if (error instanceof ServerError) {
      return res.status(error.code).json({ error: error.es })
    }

    return res.status(500).json({
      error: 'Error al sincronizar la reunión',
      detail: error?.message ?? 'Error desconocido'
    })
  }
})

// GET /drive/meetings/:meetingKey/notes
// Devuelve el transcript completo guardado en MongoDB para un meetingKey.
// Auth: query param ?key=<DRIVE_BRIDGE_API_KEY>
// eslint-disable-next-line @typescript-eslint/no-misused-promises
driveRouter.get('/meetings/:meetingKey/notes', async (req: Request, res: Response): Promise<any> => {
  try {
    const apiKey = process.env.DRIVE_BRIDGE_API_KEY
    const providedKey = req.query.key as string | undefined

    if (!apiKey || providedKey !== apiKey) {
      return res.status(401).json({ error: 'No autorizado' })
    }

    const { meetingKey } = req.params
    if (!meetingKey?.trim()) {
      return res.status(400).json({ error: 'meetingKey requerido' })
    }

    const meeting = await Meeting.findOne({ meetingKey: meetingKey.trim() })

    if (!meeting) {
      return res.status(404).json({
        error: 'Reunión no encontrada',
        detail: `No hay registro para "${meetingKey}". Ejecutá POST /drive/sync-meeting primero.`
      })
    }

    return res.status(200).json({
      meetingKey: meeting.meetingKey,
      fileName: meeting.fileName,
      driveWebLink: meeting.driveWebLink,
      syncStatus: meeting.syncStatus,
      syncedAt: meeting.syncedAt,
      transcriptLength: meeting.transcript?.length ?? 0,
      transcript: meeting.transcript
    })
  } catch (error: any) {
    console.error('❌ Drive Notes: error:', error?.message ?? error)
    return res.status(500).json({
      error: 'Error al obtener las notas',
      detail: error?.message ?? 'Error desconocido'
    })
  }
})

// POST /drive/debug
// Body: { folderId?: string, rootFolderName?: string, sharedDriveId?: string, maxFolders?: number, maxFiles?: number }
// eslint-disable-next-line @typescript-eslint/no-misused-promises
driveRouter.post('/debug', validateDriveApiKey, async (req: Request, res: Response): Promise<any> => {
  try {
    const { folderId, rootFolderName, sharedDriveId, maxFolders, maxFiles } = req.body as {
      folderId?: string
      rootFolderName?: string
      sharedDriveId?: string
      maxFolders?: number
      maxFiles?: number
    }

    const debugInfo = await inspectMeetingDrive({
      folderId,
      rootFolderName,
      sharedDriveId,
      maxFolders,
      maxFiles
    })

    return res.status(200).json(debugInfo)
  } catch (error: any) {
    console.error('❌ Drive: error en debug:', error?.message ?? error)

    return res.status(500).json({
      error: 'Error al inspeccionar Google Drive',
      detail: error?.message ?? 'Error desconocido'
    })
  }
})

// POST /drive/list-files
// Body: { searchText?: string, sharedDriveId?: string, maxResults?: number }
// eslint-disable-next-line @typescript-eslint/no-misused-promises
driveRouter.post('/list-files', validateDriveApiKey, async (req: Request, res: Response): Promise<any> => {
  try {
    const { searchText, sharedDriveId, maxResults } = req.body as {
      searchText?: string
      sharedDriveId?: string
      maxResults?: number
    }

    const files = await listVisibleDriveFiles({
      searchText,
      sharedDriveId,
      maxResults: maxResults ?? 20
    })

    return res.status(200).json({
      query: searchText?.trim() || null,
      total: files.length,
      files
    })
  } catch (error: any) {
    console.error('❌ Drive: error al listar archivos:', error?.message ?? error)

    return res.status(500).json({
      error: 'Error al listar archivos de Google Drive',
      detail: error?.message ?? 'Error desconocido'
    })
  }
})

// Evita que rutas /drive/* no registradas caigan en authValidator (JWT) y devuelvan 401 confuso
driveRouter.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Endpoint de Drive no encontrado',
    path: req.originalUrl
  })
})

export default driveRouter
