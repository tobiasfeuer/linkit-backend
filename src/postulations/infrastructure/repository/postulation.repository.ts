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

  async createPostulation (postulation: postulation, userId?: string): Promise<UserEntity | null> {
    try {
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

      // Manejar recruiterSlug: buscar el recruiter y obtener su Name
      let recruiterName: string | undefined = postulation.recruiter

      if (postulation.recruiterSlug) {
        try {
          // Buscar recruiter por URL Slug en la tabla de Recruiters
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
              // Tabla no encontrada, continuar con la siguiente
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

          // Verificar que el recruiter esté activo
          const status = recruiterFields.Status as string
          const active = status === 'Active' || status === 'active' || recruiterFields.Active === true

          if (!active) {
            throw new ServerError(
              'Invalid recruiterSlug: recruiter is not active',
              'recruiterSlug no válido: el recruiter no está activo',
              400
            )
          }

          // Obtener el Name del recruiter
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

      await base('LinkIT - Candidate application').create([
        {
          fields: {
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
        throw new UncatchedError(error.message, 'creating postulation', 'crear postulacion')
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
