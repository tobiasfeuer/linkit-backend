import { type Types } from 'mongoose'

export interface JdEntity {
  code: string
  title: string
  description: string
  type: 'full-time' | 'part-time' | 'freelance'
  location: string
  modality: 'remote-local' | 'remote-regional' | 'hybrid' | 'on-site'
  stack?: string[] | null | undefined
  aboutUs?: string | null
  aboutClient?: string | null
  responsabilities: string[]
  requirements: string[]
  niceToHave?: string[] | null | undefined
  benefits?: string[] | null | undefined
  archived: boolean
  company: string
  createdDate: Date
  en?: {
    title: string
    description: string
    location: string
    modality: string
    stack: string[]
    aboutUs: string
    aboutClient: string
    responsabilities: string[]
    requirements: string[]
    niceToHave: string[]
    benefits: string[]
  }
}

export interface MongoJd extends JdEntity {
  _id: Types.ObjectId
}
