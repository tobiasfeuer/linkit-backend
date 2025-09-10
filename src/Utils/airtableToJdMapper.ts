// Utils/airtableToJdMapper.ts

import { JdEntity } from "../posts/domain/jd/jd.entity";

type BaseJD = Omit<JdEntity, 'createdDate' | 'archived'>

export function airtableToJdMapper(data: any, forUpdate: true): BaseJD;
export function airtableToJdMapper(data: any, forUpdate?: false): JdEntity;
export function airtableToJdMapper(data: any, forUpdate = false): BaseJD | JdEntity {
  // Campos comunes a creación y a actualización
  const base: BaseJD = {
    code: data['Recruitment role code']?.toString() ?? '',
    title: data['Role Name'] ?? '',
    description: data['Description'] ?? '',
    type: data['Hourly Type']?.includes('Part-Time') ? 'part-time' : 'full-time',
    location: data['Buscando talento en'] ?? '',
    modality: mapModality(data['On-site / Remote']),
    stack: splitByLine(data['Stack']?.join('\n')),
    aboutUs: data['About us'] ?? '',
    aboutClient: data['About client'] ?? '',
    responsabilities: splitByLine(data['Responsibilities']),
    requirements: splitByLine(data['Requirements']),
    niceToHave: splitByLine(data['Nice to have']),
    benefits: splitByLine(data['Benefits']),
    company: data['Companies/Roles']?.[0]?.name ?? 'Unknown'
  };

  if (forUpdate) {
    // Para update: devolvemos solo los campos que editJD acepta
    return base;
  }

  // Para create: sumamos createdDate y archived
  return {
    ...base,
    createdDate: new Date(),
    archived: false
  };
}

function splitByLine(input?: string): string[] {
  return input
    ? input.split('\n').map(s => s.trim()).filter(Boolean)
    : [];
}

function mapModality(mod?: string): JdEntity['modality'] {
  const m = mod?.toLowerCase() ?? '';
  if (m.includes('hybrid')) return 'hybrid';
  if (m.includes('regional')) return 'remote-regional';
  if (m.includes('on-site')) return 'on-site';
  return 'remote-local';
}
