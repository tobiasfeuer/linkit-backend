import { Request, Response } from 'express';
import * as XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import Jd from '../posts/infrastructure/schema/Jd';

const BASE_URL = 'https://www.linkit-hr.com';
const TEMP_DIR = path.join(__dirname, '..', 'temp');

if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

const generateSlug = (title: string) => {
  if (!title) return '';
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
};

export const generateJdUrlsExcel = async (req: Request, res: Response) => {
  try {
    const jobs = await Jd.find().lean().exec();

    const data = jobs.map(job => ({
      'Job Code': job.code,
      'JD URL': job.title ? 
        `${BASE_URL}/soyTalento/Joboffer/${job.code}/${generateSlug(job.title)}` : 
        `${BASE_URL}/soyTalento/Joboffer/${job.code}`
    }));

    const workbook = XLSX.utils.book_new();
    
    const worksheet = XLSX.utils.json_to_sheet(data, {
      header: ['Job Code', 'JD URL']
    });

    const headerStyle = {
      font: { bold: true, color: { rgb: "FFFFFF" } },
      fill: { fgColor: { rgb: "4A90E2" } },
      alignment: { horizontal: "center" }
    };

    const colWidths = [
      { wch: 15 }, 
      { wch: 100 }  
    ];
    worksheet['!cols'] = colWidths;

    XLSX.utils.book_append_sheet(workbook, worksheet, 'JD URLs');

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `jd-urls-${timestamp}.xlsx`;
    const filePath = path.join(TEMP_DIR, fileName);

    XLSX.writeFile(workbook, filePath);

    res.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.header('Content-Disposition', `attachment; filename=${fileName}`);
    
    res.download(filePath, fileName, (err) => {
      if (err) {
        console.error('Error al descargar el archivo:', err);
        res.status(500).send('Error al generar el archivo Excel');
      }
      
      setTimeout(() => {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }, 1000);
    });

  } catch (error) {
    console.error('Error generando lista de URLs:', error);
    res.status(500).send('Error al generar la lista de URLs');
  }
};