import { Router } from 'express'
import { MongoJdRepository } from '../repository/Jd.repository'
import { JdUseCase } from '../../aplication/jdUseCase'
import { JdController } from '../controller/jd.controller'
import { syncAirtableController, batchUpdateStatusController } from '../repository/sync-airtable'
import { cleanInvalidTranslations } from '../helpers/cleanTranslationData'
import { fixSpecificJD } from '../helpers/fixSpecificJD'

const jdRoute = Router()

const mongoJdRepository = new MongoJdRepository()
const jdUseCase = new JdUseCase(mongoJdRepository)
const jdController = new JdController(jdUseCase)

jdRoute.post('/create', jdController.postController)
jdRoute.get('/find', jdController.getController)
jdRoute.put('/update/:_id', jdController.putController)
jdRoute.delete('/delete/:id', jdController.deleteController)
jdRoute.post('/sync-airtable', syncAirtableController)
jdRoute.post('/batch-update-status', batchUpdateStatusController)
jdRoute.post('/clean-translations', async (req, res) => {
  try {
    await cleanInvalidTranslations()
    res.status(200).json({ message: 'Limpieza de traducciones completada exitosamente' })
  } catch (error) {
    console.error('Error en limpieza de traducciones:', error)
    res.status(500).json({ error: 'Error durante la limpieza de traducciones' })
  }
})

jdRoute.post('/fix-specific-jd/:code', async (req, res) => {
  try {
    const { code } = req.params
    await fixSpecificJD(code)
    res.status(200).json({ message: `JD ${code} corregido exitosamente` })
  } catch (error) {
    console.error('Error al corregir JD específico:', error)
    res.status(500).json({ error: 'Error al corregir JD específico' })
  }
})

export default jdRoute
