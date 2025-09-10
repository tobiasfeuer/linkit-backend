import { type RequestHandler } from 'express'
import { type PostUseCase } from '../../aplication/postUseCase'
import getPostValidator from '../helpers/getPostValidator'
import { permValidator } from '../../../errors/validation'
import { PostEntity } from '../../domain/post/post.entity'
import { PostTranslate} from "../../../resources/methods/PostTranslate";

export class PostController {
  constructor (private readonly postUseCase: PostUseCase) {}

  public postController: RequestHandler = async (req, res) => {
    try {
      await permValidator((req as any).userId, 'create', 'posts')
      const post = await this.postUseCase.createPost(req.body)
      if (typeof post === 'string') return res.status(409).json(post)
      return res.status(201).json(post)
    } catch (error: any) {
      return res.status(error.code).json(error[(req as any).lang as keyof Error])
    }
  }

  public getBySlugController: RequestHandler = async (req, res) => {
    try {
      const { slug: urlSlug, type: urlType } = req.params;
      const dbType = urlType === "events" ? "social" : "ebook";
      const postsResult = await this.postUseCase.findPost(dbType, "type");
      let posts: PostEntity[] = [];
      if (Array.isArray(postsResult)) {
        posts = postsResult;
      } else if (typeof postsResult !== "string" && postsResult) {
        posts = [postsResult];
      }

      if (posts.length === 0) {
        return res.status(404).json({
          en: "No posts found for this type",
          es: "No se encontraron publicaciones de este tipo",
        });
      }

      const generateSlug = (title: string) => {
        return title
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "");
      };

      const matchingPost = posts.find((post) => generateSlug(post.title) === urlSlug);

      if (!matchingPost) {
        return res.status(404).json({
          en: "Post not found",
          es: "Publicación no encontrada",
        });
      }

      // Traducir el post si el idioma solicitado es inglés
      if ((req as any).lang === 'en') {
        await PostTranslate(matchingPost);
      }

      return res.status(200).json(matchingPost);
    } catch (error: any) {
      console.error("Error en getBySlugController:", error);
      return res.status(error.code || 500).json(error[(req as any).lang as keyof Error] || error.message);
    }
  };

  public getController: RequestHandler = async (req, res) => {
    try {
      const post = await getPostValidator(req.query, this.postUseCase, (req as any).lang);

      // Traducir los posts si el idioma solicitado es inglés
      if ((req as any).lang === 'en' && post) {
        if (Array.isArray(post)) {
          for (let i = 0; i < post.length; i++) {
            post[i] = await PostTranslate(post[i]);
          }
        } else {
          if (typeof post !== 'string') {
            await PostTranslate(post);
          }
        }
      }

      return res.status(200).json(post);
    } catch (error: any) {
      return res.status(error.code || 500).json(error[(req as any).lang as keyof Error] || error.message);
    }
  };

  public putController: RequestHandler = async (req, res) => {
    try {
      await permValidator((req as any).userId, 'update', 'posts')
      const post = await this.postUseCase.editPost(req.params._id, req.body)
      return res.status(200).json(post)
    } catch (error: any) {
      return res.status(error.code).json(error[(req as any).lang as keyof Error])
    }
  }

  public deleteController: RequestHandler = async (req, res) => {
    try {
      await permValidator((req as any).userId, 'delete', 'posts')
      const { id } = req.params
      const result = await this.postUseCase.deletePost(id, req.query.total as string)
      return res.status(200).json(result)
    } catch (error: any) {
      return res.status(error.code).json(error[(req as any).lang as keyof Error])
    }
  }
}
