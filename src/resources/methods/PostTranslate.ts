import * as deepl from 'deepl-node';
import { PostEntity } from "../../posts/domain/post/post.entity";
import { type blogHeader } from '../../interfaces';

const authKey = 'd16645db-ee0a-4af1-87dd-d0417ffee3d3:fx'; // Clave de autenticación de DeepL
const translator = new deepl.Translator(authKey);

export async function PostTranslate(post: PostEntity): Promise<PostEntity> {
  try {
    // Traducir los campos principales del recurso
    post.title = (await translator.translateText(post.title, 'es', 'en-US')).text;
    post.description = (await translator.translateText(post.description, 'es', 'en-US')).text;
    post.category = (await translator.translateText(post.category, 'es', 'en-US')).text;
    post.createdBy = (await translator.translateText(post.createdBy, 'es', 'en-US')).text;

    // Traducir los encabezados del recurso
    for (let i = 0; i < post.headers.length; i++) {
      const header: blogHeader = post.headers[i];
      if (header.head) {
        header.head = (await translator.translateText(header.head, 'es', 'en-US')).text;
      }
      if (header.body) {
        header.body = (await translator.translateText(header.body, 'es', 'en-US')).text;
      }
    }

    return post;
  } catch (error) {
    console.error('Error translating PostEntity:', error);
    throw new Error('Error translating PostEntity');
  }
}