import { Router } from 'express'
import base from '../../../db/airtable'
import { type translatedResponse } from '../../../interfaces'
import { UncatchedError, type customError } from '../../../errors/errors'
import rateLimit from 'express-rate-limit'

// Configuración del rate limiter
const formLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5, // 5 solicitudes por ventana
  standardHeaders: true, // Devuelve info de rate limit en los headers `RateLimit-*`
  legacyHeaders: false, // Deshabilita los headers `X-RateLimit-*`
  message: (req: any, res: any) => {
    const lang = (req as any).lang || 'es'
    const messages = {
      en: 'Too many requests from this IP. Please try again later.',
      es: 'Demasiadas solicitudes desde esta IP. Por favor, inténtalo más tarde.'
    }
    return messages[lang as keyof typeof messages]
  },
  skipSuccessfulRequests: false, // No omitir solicitudes exitosas
})

const contactUsRoute = Router()

// eslint-disable-next-line @typescript-eslint/no-misused-promises
contactUsRoute.post('/', formLimiter, async (req, res): Promise<any> => {
  try {
    const newContact = req.body
    const record = {
      fields: {
        Nombre: newContact.firstName,
        Apellido: newContact.lastName,
        Empresa: newContact.company,
        '¿Qué servicio te interesa?': newContact.service,
        Email: newContact.email,
        Mensaje: newContact.message,
        WebCliente: newContact.web
      }
    }

    await base('Contactos').create([record])
    const response: translatedResponse = { en: 'Your information has been sent successfully', es: 'Tu informacion ha sido enviada con exito' }
    res.status(200).send(response[(req as any).lang as keyof translatedResponse])
  } catch (error: any) {
    console.error('Error creating contact:', error) // Log de error
    const newError = new UncatchedError(error.message, 'create a contact request', 'crear una peticion de contacto')
    res.status(500).json(newError[(req as any).lang as keyof customError])
  }
})

contactUsRoute.post('/form', formLimiter, async (req, res): Promise<any> => {
  try {
    const formData = req.body
    const record = {
      fields: {
        Nombre: formData.nombre,
        Apellido: formData.apellido,
        Empresa: formData.empresa,
        '¿Qué servicio te interesa?': formData.buscandoTalento,
        Email: formData.correo,
        'Phone Number': formData.telefono,
        Pais: formData.pais,
        'Rol buscado': formData.perfil,
      }
    }

    await base('Contactos').create([record])
    const response: translatedResponse = { 
      en: 'Your information has been sent successfully', 
      es: 'Tu información ha sido enviada con éxito' 
    }
    res.status(200).send(response[(req as any).lang as keyof translatedResponse])
  } catch (error: any) {
    console.error('Error creating talent request:', error)
    const newError = new UncatchedError(
      error.message, 
      'create a talent request', 
      'crear una solicitud de talento'
    )
    res.status(500).json(newError[(req as any).lang as keyof customError])
  }
})

export default contactUsRoute