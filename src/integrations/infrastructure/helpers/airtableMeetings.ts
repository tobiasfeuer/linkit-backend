import Airtable from 'airtable'
import base from '../../../db/airtable'

type AirtableFieldSet = Airtable.FieldSet

export interface AirtableMeetingFields {
  driveFileId?: string
  driveWebLink?: string
  transcript?: string
  notesUrl?: string
  syncStatus?: 'Pending' | 'Synced' | 'Not Found' | 'Error'
  syncedAt?: string
}

export async function updateMeetingInAirtable (
  recordId: string,
  data: AirtableMeetingFields
): Promise<void> {
  const tableId = process.env.AIRTABLE_MEETINGS_TABLE_ID
  if (!tableId) {
    throw new Error('AIRTABLE_MEETINGS_TABLE_ID no está configurada en las variables de entorno')
  }

  const fields: Partial<AirtableFieldSet> = {}

  if (data.driveFileId !== undefined) fields['Drive File ID'] = data.driveFileId
  if (data.driveWebLink !== undefined) fields['Drive Link'] = data.driveWebLink
  if (data.transcript !== undefined) fields['Transcript Preview'] = data.transcript
  if (data.notesUrl !== undefined) fields['Notes URL'] = data.notesUrl
  if (data.syncStatus !== undefined) fields['Sync Status'] = data.syncStatus
  if (data.syncedAt !== undefined) fields['Synced At'] = data.syncedAt

  await base(tableId).update([{ id: recordId, fields }])
}
