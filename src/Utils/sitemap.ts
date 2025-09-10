import { Request, Response } from 'express';
import { create } from 'xmlbuilder2';
import Post from '../posts/infrastructure/schema/Post';
import Jd from '../posts/infrastructure/schema/Jd';

const BASE_URL = 'https://www.linkit-hr.com';

const generateSlug = (title: string) => {
  if (!title) return '';
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
};

export const generateSitemap = async (req: Request, res: Response) => {
  try {
    const [ebooks, blogs, jobs] = await Promise.all([
      Post.find({ archived: false, type: 'ebook' }).lean().exec(),
      Post.find({ archived: false, type: 'blog' }).lean().exec(),
      Jd.find({ archived: false }).lean().exec()
    ]);

    const root = create({ version: '1.0', encoding: 'UTF-8' })
      .ele('urlset', { 
        xmlns: 'http://www.sitemaps.org/schemas/sitemap/0.9',
        'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
        'xsi:schemaLocation': 'http://www.sitemaps.org/schemas/sitemap/0.9 http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd'
      });

    // Añadir URLs estáticas
    const staticUrls = [
      { url: '/', priority: '1.0' },
      { url: '/ebooks', priority: '0.8' },
      { url: '/blog', priority: '0.8' },
      { url: '/soyTalento', priority: '0.9' },
      { url: '/recursos', priority: '0.9' },
      { url: '/SoyEmpresa', priority: '0.9' },
      { url: '/recursos/libreria', priority: '0.9' },
      { url: '/quienesSomos', priority: '0.9' },
      { url: '/TermsAndConditions', priority: '0.9' },
      { url: '/PrivacyPolicy', priority: '0.9' },
      
    ];

    // Agregar URLs estáticas
    staticUrls.forEach(({ url, priority }) => {
      root.ele('url')
        .ele('loc').txt(`${BASE_URL}${url}`).up()
        .ele('lastmod').txt(new Date().toISOString()).up()
        .ele('priority').txt(priority).up();
    });

    // Agregar URLs de ebooks
    ebooks.forEach(ebook => {
      if (ebook.title) {
        root.ele('url')
          .ele('loc').txt(`${BASE_URL}/ebook/${generateSlug(ebook.title)}`).up()
          .ele('lastmod').txt(ebook.createdDate?.toISOString() || new Date().toISOString()).up()
          .ele('priority').txt('0.7').up();
      }
    });

    // Agregar URLs de blogs
    blogs.forEach(blog => {
      if (blog.title) {
        root.ele('url')
          .ele('loc').txt(`${BASE_URL}/blog/${blog._id}/${generateSlug(blog.title)}`).up()
          .ele('lastmod').txt(blog.createdDate?.toISOString() || new Date().toISOString()).up()
          .ele('priority').txt('0.7').up();
      }
    });

    // Agregar URLs de trabajos
    jobs.forEach(job => {
      if (job.title && job.code) {
        root.ele('url')
          .ele('loc').txt(`${BASE_URL}/soyTalento/Joboffer/${job.code}/${generateSlug(job.title)}`).up()
          .ele('lastmod').txt(job.createdDate?.toISOString() || new Date().toISOString()).up()
          .ele('priority').txt('0.8').up()
          .ele('changefreq').txt('daily').up();
      }
    });

    const xml = root.end({ prettyPrint: true });
    res.header('Content-Type', 'application/xml');
    res.header('Cache-Control', 'public, max-age=1800');
    res.send(xml);

  } catch (error) {
    console.error('Error generando el sitemap:', error);
    res.status(500).send('Error al generar el sitemap');
  }
};