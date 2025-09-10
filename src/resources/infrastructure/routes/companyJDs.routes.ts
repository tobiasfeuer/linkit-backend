import { Router } from 'express'
import base from '../../../db/airtable'
import { UncatchedError, type customError } from '../../../errors/errors'

const clientsFollowUpRoute = Router()

// eslint-disable-next-line @typescript-eslint/no-misused-promises
clientsFollowUpRoute.get('/', async (req, res): Promise<void> => {
  try {
    console.log("[companyJDs.routes] Query params:", req.query);

    const airtable = await base('LinkIT - Clients Follow up').select({
      view: 'Creemos JDs'
    }).all()
    const fields = airtable.map(result => result.fields)
    const filter = Object.keys(req.query)[0]
    const value = Object.values(req.query)[0] as string
    let result

    console.log("[companyJDs.routes] Filtro:", filter, "Valor:", value);

    if (filter === 'company') {
      result = fields.filter(followUp => {
        if (followUp.Client) {
          return (followUp.Client as string).toLowerCase().includes(value.toLowerCase())
        } else return false
      })
      console.log("[companyJDs.routes] Resultados por company:", result.length);
    } else if (filter === 'code') {
      const filtered = fields.filter(followUp => followUp['Role Code'] === value);
      result = filtered.length > 0 ? filtered : [];
      console.log("[companyJDs.routes] Resultados por code:", result.length);
    } else if (filter === 'area') {
      const filtered = fields.filter(followUp => {
        if (followUp.Area) return (followUp.Area as string).toLowerCase() === value.toLowerCase()
        else return false
      });
      result = filtered.length > 0 ? filtered : [];
      console.log("[companyJDs.routes] Resultados por area:", result.length);
    } else {
      result = fields
      console.log("[companyJDs.routes] Resultados sin filtro:", result.length);
    }
    res.status(200).json(result)
  } catch (error: any) {
    console.error("[companyJDs.routes] Error:", error);
    const newError = new UncatchedError(error.message, 'requesting airtable info', 'requerir informacion de airtable')
    res.status(500).json(newError[(req as any).lang as keyof customError])
  }
})

export default clientsFollowUpRoute