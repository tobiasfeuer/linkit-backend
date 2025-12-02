import base from '../../../db/airtable'
import { ServerError, UncatchedError } from '../../../errors/errors'
import { type PostulationRepository } from '../../domain/postulation.repository'
import { type MailNodeMailerProvider } from '../../../users/authentication/Infrastructure/nodemailer/nodeMailer'
import { validatePostulation } from '../../../errors/validation'
import { type postulation, type PostulationQuery } from '../../../interfaces'
import { type UserEntity, type MongoUser } from '../../../users/domain/user/user.entity'
import User from '../../../users/infrastructure/schema/User'
import { postulationMailCreate } from '../../../users/authentication/Infrastructure/nodemailer/postulationMail/postulationMail'
import Jd from '../../../posts/infrastructure/schema/Jd'
import { type MongoJd } from '../../../posts/domain/jd/jd.entity'

export class MongoPostulationRepository implements PostulationRepository {
  constructor (private readonly mailNodeMailerProvider: MailNodeMailerProvider) {
    this.mailNodeMailerProvider = mailNodeMailerProvider
  }

  async createPostulation (postulation: postulation | (postulation & Record<string, any>), userId?: string): Promise<UserEntity | null> {
    try {
      const postulationWithExtras = postulation as any
      await validatePostulation(postulation, userId)
      postulation.created = new Date()
      const jd = await Jd.find({ code: postulation.code })
      if (jd.length === 0) {
        throw new ServerError('Unable to find JD under the code provided', 'No se encontro JD con ese codigo', 406)
      }

      const user = userId ? await User.findById(userId) as UserEntity : null
      if (userId && !user) {
        throw new ServerError('Unauthorized', 'No autorizado', 401)
      }

      let recruiterName: string | undefined = postulation.recruiter

      if (postulation.recruiterSlug) {
        try {
          const possibleTableNames = [
            'LinkIT - Recruiters',
            'Recruiters',
            'Payroll',
            'LinkIT - Payroll'
          ]

          let recruiterFound = null
          for (const tableName of possibleTableNames) {
            try {
              const recruiterResult = await base(tableName)
                .select({
                  filterByFormula: `{URL Slug} = "${postulation.recruiterSlug}"`,
                  maxRecords: 1
                })
                .firstPage()

              if (recruiterResult.length > 0) {
                recruiterFound = recruiterResult[0]
                break
              }
            } catch (error) {
              continue
            }
          }

          if (!recruiterFound) {
            throw new ServerError(
              'Invalid recruiterSlug: recruiter not found',
              'recruiterSlug no válido: recruiter no encontrado',
              400
            )
          }

          const recruiterFields = recruiterFound.fields
          const status = recruiterFields.Status as string
          const active = status === 'Active' || status === 'active' || recruiterFields.Active === true

          if (!active) {
            throw new ServerError(
              'Invalid recruiterSlug: recruiter is not active',
              'recruiterSlug no válido: el recruiter no está activo',
              400
            )
          }

          recruiterName = recruiterFields.Name as string
        } catch (error: any) {
          if (error instanceof ServerError) {
            throw error
          }
          throw new ServerError(
            'Error validating recruiterSlug',
            'Error al validar recruiterSlug',
            400
          )
        }
      }

      const knownFields: Record<string, any> = {
        'Candidate Stack + PM tools': postulation.stack,
        LinkedIn: postulation.linkedin,
        'Salary expectation (USD)': postulation.salary,
        Country: postulation.country,
        'English Level': postulation.english,
        'Why Change': postulation.reason,
        'Candidate Email': postulation.email,
        'When to start availability': postulation.availability,
        Nombre: postulation.firstName,
        Apellido: postulation.lastName,
        'What would be your area of expertise?': postulation.techStack,
        Recruiter: recruiterName || undefined,
        'CV': postulation.cv,
        'Rol al que aplica': postulation.code
      }

      const knownPostulationFields = [
        'cv', 'code', 'techStack', 'stack', 'email', 'country', 'linkedin',
        'salary', 'english', 'reason', 'availability', 'created', 'firstName',
        'lastName', 'recruiter', 'recruiterSlug'
      ]

      const additionalFields: Record<string, any> = {}
      
      for (const key in postulationWithExtras) {
        if (!knownPostulationFields.includes(key)) {
          const value = postulationWithExtras[key]
          
          if (value !== undefined && value !== null) {
            if (typeof value === 'string' && value.trim() !== '') {
              additionalFields[key] = value
            } else if (typeof value !== 'string') {
              additionalFields[key] = value
            }
          }
        }
      }

      const allFields = {
        ...knownFields,
        ...additionalFields
      }

      const cleanedFields: Record<string, any> = {}
      const phoneFields = ['Phone', 'phone', 'telefono', 'Telefono']
      const phoneFieldsProcessed: string[] = []
      
      for (const key in allFields) {
        const value = allFields[key]
        const isPhoneField = phoneFields.some(phoneField => 
          key.toLowerCase() === phoneField.toLowerCase()
        )
        
        if (isPhoneField && phoneFieldsProcessed.length > 0) {
          continue
        }
        
        if (value !== undefined && value !== null) {
          if (typeof value === 'string' && value.trim() !== '') {
            cleanedFields[key] = value
            if (isPhoneField) {
              phoneFieldsProcessed.push(key)
            }
          } else if (typeof value !== 'string') {
            cleanedFields[key] = value
            if (isPhoneField) {
              phoneFieldsProcessed.push(key)
            }
          }
        }
      }

      await base('LinkIT - Candidate application').create([
        {
          fields: cleanedFields
        }
      ])

      if (userId && user) {
        await User.findByIdAndUpdate(userId, { $push: { postulations: postulation.code } }, { new: true })
        await this.mailNodeMailerProvider.sendEmail(postulationMailCreate(user as MongoUser, jd[0] as MongoJd))
        return user
      }
  
      return null
    } catch (error: any) {
      if (error instanceof ServerError) {
        throw error
      } else {
        const errorMessage = error?.error?.message || error?.message || 'Error desconocido al crear postulación'
        throw new UncatchedError(errorMessage, 'creating postulation', 'crear postulacion')
      }
    }
  }

  async findPostulation (query: PostulationQuery): Promise<postulation[]> {
    try {
      const filter = Object.keys(query)[0]
      const value = Object.values(query)[0]
      const airtable = await base('LinkIT - Candidate application').select({ view: 'WebView' }).all()
      const fields = airtable.map(result => result.fields)
      let result
      if (!filter) {
        result = fields
      } else if (filter === 'user') {
        result = fields.filter(records => (records['Nombre completo'] as string).includes(value))
      } else throw new ServerError('Invalid filter parameter', 'Parametro de filtrado invalido', 406)
      return result as unknown as postulation[]
    } catch (error: any) {
      if (error instanceof ServerError) throw error
      else throw new UncatchedError(error.message, 'searching postulations', 'buscar postulaciones')
    }
  }
}
