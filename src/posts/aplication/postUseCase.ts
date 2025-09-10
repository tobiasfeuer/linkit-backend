import { type PostEntity } from '../domain/post/post.entity'
import { type PostRepository } from '../domain/post/post.repository'
import { PostValue } from '../domain/post/post.value'

export class PostUseCase {
  constructor (private readonly PostRepository: PostRepository) {}

  public createPost = async (
    post: PostEntity
  ): Promise<PostEntity | string> => {
    const newPost = new PostValue(post)
    const PostCreated = await this.PostRepository.createPost(newPost)
    return PostCreated
  }

  public findPost = async (value: string, filter: string, lang?: string): Promise<PostEntity | PostEntity[] | string> => {
    const post = await this.PostRepository.findPost(value, filter, lang)
    return post
  }

  async getPostBySlug(slug: string, type: string): Promise<PostEntity | null> {
    try {
      const post = await this.PostRepository.findOneBySlug(slug, type)

      if (!post) {
        throw {
          code: 404,
          en: "Post not found",
          es: "Publicación no encontrada",
        }
      }

      return post
    } catch (error) {
      throw error
    }
  }
  public editPost = async (
    _id: string, post: PostEntity): Promise<PostEntity | string> => {
    const editedPost = await this.PostRepository.editPost(_id, post)
    return editedPost
  }

  public deletePost = async (
    id: string, total?: string): Promise<PostEntity[]> => {
    const answer = await this.PostRepository.deletePost(id, total)
    return answer
  }
}
