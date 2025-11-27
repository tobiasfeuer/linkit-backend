import { type RequestHandler } from 'express'
import { type PostulationUseCase } from '../../aplication/postulationUseCase'

export class PostulationController {
  constructor (private readonly postulationUseCase: PostulationUseCase) { }

  public getController: RequestHandler = async (req, res) => {
    try {
      const postulations = await this.postulationUseCase.findPostulation(req.query)
      return res.status(200).json(postulations)
    } catch (error: any) {
      return res.status(error.code).json(error[(req as any).lang as keyof Error])
    }
  }

  public postController: RequestHandler = async (req, res) => {
    try {
      const userId = typeof req.query.user === 'string' ? req.query.user : undefined
      const result = await this.postulationUseCase.createPostulation(req.body, userId)
      if (result !== null) {
        return res.status(201).json(result)
      }
      return res.status(201).json({ message: 'Postulation created' })
    } catch (error: any) {
      return res.status(error.code).json(error[(req as any).lang as keyof Error])
    }
  }
}
