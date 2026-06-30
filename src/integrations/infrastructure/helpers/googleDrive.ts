import { drive_v3, google } from 'googleapis'

const DRIVE_SCOPES = ['https://www.googleapis.com/auth/drive.readonly']
const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder'
const SHORTCUT_MIME_TYPE = 'application/vnd.google-apps.shortcut'
const DEFAULT_MEETINGS_ROOT_FOLDER_NAME = 'Archivo de Reuniones'

export interface DriveFile {
  id: string
  name: string
  mimeType: string
  webViewLink?: string
  modifiedTime?: string
  size?: string
  shortcutDetails?: {
    targetId?: string
    targetMimeType?: string
  }
}

export interface FindMeetingOptions {
  folderId?: string
  rootFolderName?: string
  sharedDriveId?: string
  maxResults?: number
  includeSubfolders?: boolean
}

export interface DriveDebugOptions {
  folderId?: string
  rootFolderName?: string
  sharedDriveId?: string
  maxFolders?: number
  maxFiles?: number
}

export interface ListDriveFilesOptions {
  searchText?: string
  sharedDriveId?: string
  maxResults?: number
}

function getDriveClient (): ReturnType<typeof google.drive> {
  const credentialsJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!credentialsJson) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON no está definida en las variables de entorno')
  }

  let credentials: Record<string, unknown>
  try {
    credentials = JSON.parse(credentialsJson)
  } catch {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON no es un JSON válido')
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: DRIVE_SCOPES
  })

  return google.drive({ version: 'v3', auth })
}

function escapeDriveQueryValue (value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

function createDriveContext (drive: ReturnType<typeof google.drive>, sharedDriveId?: string) {
  const resolvedDriveId = sharedDriveId ?? process.env.GOOGLE_SHARED_DRIVE_ID

  const applyDriveScope = (params: drive_v3.Params$Resource$Files$List): drive_v3.Params$Resource$Files$List => {
    if (resolvedDriveId) {
      return {
        ...params,
        driveId: resolvedDriveId,
        corpora: 'drive'
      }
    }

    return {
      ...params,
      corpora: 'allDrives'
    }
  }

  return {
    resolvedDriveId,
    applyDriveScope,
    baseParams: {
      supportsAllDrives: true,
      includeItemsFromAllDrives: true
    } satisfies drive_v3.Params$Resource$Files$List
  }
}

async function listDriveItems (
  drive: ReturnType<typeof google.drive>,
  applyDriveScope: (params: drive_v3.Params$Resource$Files$List) => drive_v3.Params$Resource$Files$List,
  baseParams: drive_v3.Params$Resource$Files$List,
  query: string,
  maxResults: number,
  fields = 'nextPageToken, files(id, name, mimeType, webViewLink, modifiedTime, size)',
  orderBy?: string
): Promise<DriveFile[]> {
  const results: DriveFile[] = []
  let pageToken: string | undefined

  do {
    const response = await drive.files.list(applyDriveScope({
      ...baseParams,
      q: query,
      fields,
      orderBy,
      pageSize: Math.min(100, maxResults - results.length),
      pageToken
    }))

    results.push(...((response.data.files ?? []) as DriveFile[]))
    pageToken = response.data.nextPageToken ?? undefined
  } while (pageToken && results.length < maxResults)

  return results
}

function getFolderTargetId (file: DriveFile): string | null {
  if (file.mimeType === FOLDER_MIME_TYPE) return file.id
  if (
    file.mimeType === SHORTCUT_MIME_TYPE &&
    file.shortcutDetails?.targetMimeType === FOLDER_MIME_TYPE &&
    file.shortcutDetails.targetId
  ) {
    return file.shortcutDetails.targetId
  }
  return null
}

async function findFolderByName (
  drive: ReturnType<typeof google.drive>,
  applyDriveScope: (params: drive_v3.Params$Resource$Files$List) => drive_v3.Params$Resource$Files$List,
  baseParams: drive_v3.Params$Resource$Files$List,
  folderName: string
): Promise<DriveFile | null> {
  const safeFolderName = escapeDriveQueryValue(folderName)
  const folders = await listDriveItems(
    drive,
    applyDriveScope,
    baseParams,
    `name = '${safeFolderName}' and (mimeType = '${FOLDER_MIME_TYPE}' or mimeType = '${SHORTCUT_MIME_TYPE}') and trashed = false`,
    1,
    'files(id, name, mimeType, webViewLink, modifiedTime, shortcutDetails(targetId, targetMimeType))',
    'modifiedTime desc'
  )

  return folders.find((folder) => getFolderTargetId(folder)) ?? null
}

async function listChildFolderIds (
  drive: ReturnType<typeof google.drive>,
  applyDriveScope: (params: drive_v3.Params$Resource$Files$List) => drive_v3.Params$Resource$Files$List,
  baseParams: drive_v3.Params$Resource$Files$List,
  parentFolderId: string
): Promise<string[]> {
  const folders = await listDriveItems(
    drive,
    applyDriveScope,
    baseParams,
    `'${parentFolderId}' in parents and (mimeType = '${FOLDER_MIME_TYPE}' or mimeType = '${SHORTCUT_MIME_TYPE}') and trashed = false`,
    1000,
    'nextPageToken, files(id, mimeType, shortcutDetails(targetId, targetMimeType))'
  )

  return folders
    .map((file) => getFolderTargetId(file))
    .filter((id): id is string => Boolean(id))
}

async function collectFolderIds (
  drive: ReturnType<typeof google.drive>,
  applyDriveScope: (params: drive_v3.Params$Resource$Files$List) => drive_v3.Params$Resource$Files$List,
  baseParams: drive_v3.Params$Resource$Files$List,
  rootFolderId: string,
  includeSubfolders: boolean
): Promise<string[]> {
  const folderIds = [rootFolderId]

  if (!includeSubfolders) return folderIds

  for (let index = 0; index < folderIds.length; index++) {
    const childFolderIds = await listChildFolderIds(drive, applyDriveScope, baseParams, folderIds[index])
    folderIds.push(...childFolderIds.filter((id) => !folderIds.includes(id)))
  }

  return folderIds
}

export async function findMeetingFiles (
  meetingTitle: string,
  options: FindMeetingOptions = {}
): Promise<DriveFile[]> {
  const drive = getDriveClient()
  const {
    sharedDriveId,
    maxResults = 10,
    includeSubfolders = true,
    rootFolderName = process.env.GOOGLE_MEETINGS_ROOT_FOLDER_NAME ?? DEFAULT_MEETINGS_ROOT_FOLDER_NAME
  } = options

  const safeTitle = escapeDriveQueryValue(meetingTitle)
  const { applyDriveScope, baseParams } = createDriveContext(drive, sharedDriveId)

  let searchFolderId = options.folderId
  if (!searchFolderId && rootFolderName) {
    const rootFolder = await findFolderByName(drive, applyDriveScope, baseParams, rootFolderName)
    searchFolderId = rootFolder ? getFolderTargetId(rootFolder) ?? undefined : undefined
  }

  if (!searchFolderId) {
    return listDriveItems(
      drive,
      applyDriveScope,
      baseParams,
      `name contains '${safeTitle}' and trashed = false`,
      maxResults,
      'nextPageToken, files(id, name, mimeType, webViewLink, modifiedTime, size)',
      'modifiedTime desc'
    )
  }

  const folderIds = await collectFolderIds(drive, applyDriveScope, baseParams, searchFolderId, includeSubfolders)
  const results: DriveFile[] = []
  const seen = new Set<string>()

  for (const currentFolderId of folderIds) {
    if (results.length >= maxResults) break

    const files = await listDriveItems(
      drive,
      applyDriveScope,
      baseParams,
      `name contains '${safeTitle}' and '${currentFolderId}' in parents and trashed = false`,
      maxResults - results.length,
      'nextPageToken, files(id, name, mimeType, webViewLink, modifiedTime, size)',
      'modifiedTime desc'
    )

    for (const file of files) {
      if (!seen.has(file.id)) {
        seen.add(file.id)
        results.push(file)
      }
    }
  }

  return results
}

export async function inspectMeetingDrive (options: DriveDebugOptions = {}) {
  const drive = getDriveClient()
  const {
    sharedDriveId,
    maxFolders = 20,
    maxFiles = 20,
    rootFolderName = process.env.GOOGLE_MEETINGS_ROOT_FOLDER_NAME ?? DEFAULT_MEETINGS_ROOT_FOLDER_NAME
  } = options
  const { resolvedDriveId, applyDriveScope, baseParams } = createDriveContext(drive, sharedDriveId)

  let rootFolder = options.folderId
    ? ({ id: options.folderId, name: 'provided folderId', mimeType: FOLDER_MIME_TYPE } satisfies DriveFile)
    : null

  if (!rootFolder && rootFolderName) {
    rootFolder = await findFolderByName(drive, applyDriveScope, baseParams, rootFolderName)
  }

  if (!rootFolder?.id) {
    return {
      sharedDriveId: resolvedDriveId,
      rootFolderName,
      rootFolder: null,
      foldersScanned: 0,
      folderSamples: [],
      fileSamples: []
    }
  }

  const rootFolderTargetId = getFolderTargetId(rootFolder)
  if (!rootFolderTargetId) {
    return {
      sharedDriveId: resolvedDriveId,
      rootFolderName,
      rootFolder,
      foldersScanned: 0,
      folderSamples: [],
      fileSamples: []
    }
  }

  const folderIds = await collectFolderIds(drive, applyDriveScope, baseParams, rootFolderTargetId, true)
  const folderSamples = await listDriveItems(
    drive,
    applyDriveScope,
    baseParams,
    `'${rootFolderTargetId}' in parents and (mimeType = '${FOLDER_MIME_TYPE}' or mimeType = '${SHORTCUT_MIME_TYPE}') and trashed = false`,
    maxFolders,
    'nextPageToken, files(id, name, mimeType, webViewLink, modifiedTime, shortcutDetails(targetId, targetMimeType))',
    'name'
  )
  const fileSamples: DriveFile[] = []

  for (const folderId of folderIds) {
    if (fileSamples.length >= maxFiles) break
    const files = await listDriveItems(
      drive,
      applyDriveScope,
      baseParams,
      `'${folderId}' in parents and mimeType != '${FOLDER_MIME_TYPE}' and mimeType != '${SHORTCUT_MIME_TYPE}' and trashed = false`,
      maxFiles - fileSamples.length,
      'nextPageToken, files(id, name, mimeType, webViewLink, modifiedTime, size)',
      'modifiedTime desc'
    )
    fileSamples.push(...files)
  }

  return {
    sharedDriveId: resolvedDriveId,
    rootFolderName,
    rootFolder,
    foldersScanned: folderIds.length,
    folderSamples,
    fileSamples
  }
}

export async function exportDocText (fileId: string): Promise<string> {
  const drive = getDriveClient()
  const response = await drive.files.export(
    { fileId, mimeType: 'text/plain' },
    { responseType: 'arraybuffer' }
  )
  return Buffer.from(response.data as unknown as ArrayBuffer).toString('utf-8')
}

export async function listVisibleDriveFiles (options: ListDriveFilesOptions = {}): Promise<DriveFile[]> {
  const drive = getDriveClient()
  const { sharedDriveId, maxResults = 20, searchText } = options
  const { resolvedDriveId, applyDriveScope, baseParams } = createDriveContext(drive, sharedDriveId)
  const rootItems = await listDriveItems(
    drive,
    applyDriveScope,
    baseParams,
    resolvedDriveId ? `'${resolvedDriveId}' in parents and trashed = false` : 'trashed = false',
    200,
    'nextPageToken, files(id, name, mimeType, webViewLink, modifiedTime, size, shortcutDetails(targetId, targetMimeType))',
    'name'
  )
  const folderIds = rootItems
    .map((file) => getFolderTargetId(file))
    .filter((id): id is string => Boolean(id))
  const allFolderIds = [...new Set(folderIds)]

  for (let index = 0; index < allFolderIds.length; index++) {
    const childFolderIds = await listChildFolderIds(drive, applyDriveScope, baseParams, allFolderIds[index])
    allFolderIds.push(...childFolderIds.filter((id) => !allFolderIds.includes(id)))
  }

  const results: DriveFile[] = []
  const seen = new Set<string>()

  for (const folderId of allFolderIds) {
    if (results.length >= maxResults) break

    const queryParts = [
      `'${folderId}' in parents`,
      `mimeType != '${FOLDER_MIME_TYPE}'`,
      `mimeType != '${SHORTCUT_MIME_TYPE}'`,
      'trashed = false'
    ]

    if (searchText?.trim()) {
      queryParts.push(`name contains '${escapeDriveQueryValue(searchText.trim())}'`)
    }

    const files = await listDriveItems(
      drive,
      applyDriveScope,
      baseParams,
      queryParts.join(' and '),
      maxResults - results.length,
      'nextPageToken, files(id, name, mimeType, webViewLink, modifiedTime, size)',
      'modifiedTime desc'
    )

    for (const file of files) {
      if (!seen.has(file.id)) {
        seen.add(file.id)
        results.push(file)
      }
    }
  }

  return results
}
