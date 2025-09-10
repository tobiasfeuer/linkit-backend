import { Schema, model } from 'mongoose'

const jdSchema = new Schema({
  code: {
    type: String,
    required: true,
    unique: true
  },
  title: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  type: {
    type: String,
    required: true,
    enum: ['full-time', 'part-time', 'freelance']
  },
  location: {
    type: String,
    required: true,
    minlength: 1,
    maxlength: 60
  },
  modality: {
    type: String,
    required: true,
    enum: ['remote-local', 'remote-regional', 'hybrid', 'on-site']
  },
  stack: {
    type: [String],
    required: false,
    default: []
  },
  aboutUs: {
    type: String,
    required: false,
    default: ''
  },
  aboutClient: {
    type: String,
    required: false,
    default: ''
  },
  responsabilities: {
    type: [String],
    required: true,
    default: []
  },
  requirements: {
    type: [String],
    required: true,
    validate: {
      validator: (array: string[]) => array.length >= 1,
      message: 'Add at least one requirement to create the JD'
    }
  },
  niceToHave: {
    type: [String],
    required: false,
    default: []
  },
  benefits: {
    type: [String],
    required: false,
    default: []
  },
  archived: {
    type: Boolean,
    required: true,
    default: false
  },
  company: {
    type: String,
    required: true
  },
  createdDate: {
    type: Date,
    required: true,
    default: Date()
  },
  en: {
    title: { type: String, default: '' },
    description: { type: String, default: '' },
    location: { type: String, default: '' },
    modality: { type: String, default: '' },
    stack: { type: [String], default: [] },
    aboutUs: { type: String, default: '' },
    aboutClient: { type: String, default: '' },
    responsabilities: { type: [String], default: [] },
    requirements: { type: [String], default: [] },
    niceToHave: { type: [String], default: [] },
    benefits: { type: [String], default: [] }
  }
})
export default model('Jd', jdSchema)
