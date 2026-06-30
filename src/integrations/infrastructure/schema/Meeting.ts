import { Schema, model } from 'mongoose'

const meetingSchema = new Schema(
  {
    meetingKey: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    driveFileId: {
      type: String,
      default: ''
    },
    driveWebLink: {
      type: String,
      default: ''
    },
    fileName: {
      type: String,
      default: ''
    },
    mimeType: {
      type: String,
      default: ''
    },
    transcript: {
      type: String,
      default: ''
    },
    transcriptPreview: {
      type: String,
      default: ''
    },
    airtableRecordId: {
      type: String,
      default: ''
    },
    syncStatus: {
      type: String,
      enum: ['pending', 'synced', 'not_found', 'error'],
      default: 'pending'
    },
    errorDetail: {
      type: String,
      default: ''
    },
    syncedAt: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
)

export default model('Meeting', meetingSchema)
