import { Request, Response } from 'express';
import { MongoJdRepository } from '../repository/Jd.repository';
import { airtableToJdMapper } from '../../../Utils/airtableToJdMapper';

const jdRepo = new MongoJdRepository();

export const syncAirtableController = async (req: Request, res: Response) => {
  try {
    const airtableData = req.body;
    const jdCreate = airtableToJdMapper(airtableData, false);
    const jdUpdate = airtableToJdMapper(airtableData, true);

    const existing = await jdRepo.getJDByCode(jdCreate.code);
    let result;

    if (existing) {
      console.log('Actualizando JD existente:', existing.code);
      const { code, ...partial } = jdUpdate;
      result = await jdRepo.editJD(existing._id.toString(), partial);
    } else {
      console.log('Creando nueva JD:', jdCreate.code);
    result = await jdRepo.createJD(jdCreate);
    }

    res.status(200).json({ message: 'JD synced', jd: result });
  } catch (error: any) {
    console.error('Error syncing JD from Airtable:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
};

export const batchUpdateStatusController = async (req: Request, res: Response) => {
  try {
    const updates = req.body;
    if (!Array.isArray(updates)) {
      return res.status(400).json({ error: "Payload must be an array" });
    }
    const trueStatuses = [
      "Won", "Lost", "Never Worked", "Won and Replaced",
      "Pending invoice/ contract", "Partial Payment", "Offered"
    ];
    const falseStatuses = [
      "Pre-alignment", "Sourcing", "Endorsed", "Sourcing +1", "Client int.", "Stalled"
    ];

    const jdRepo = new MongoJdRepository();
    const results = [];

    for (const { code, status } of updates) {
      if (!code || !status) continue;

      let archived: boolean | null = null;
      if (trueStatuses.includes(status)) archived = true;
      else if (falseStatuses.includes(status)) archived = false;

      if (archived === null) {
        results.push({ code, updated: false, reason: "Status not mapped" });
        continue;
      }

      const existing = await jdRepo.getJDByCode(code);
      if (existing) {
        const previousArchived = existing.archived;
        if (previousArchived !== archived) {
          // Aquí se realiza el update real en MongoDB
          await jdRepo.editJD(existing._id.toString(), { archived });
          results.push({
            code,
            updated: true,
            archivedBefore: previousArchived,
            archivedAfter: archived
          });
        } else {
          results.push({
            code,
            updated: false,
            reason: "No change",
            archived
          });
        }
      } else {
        results.push({ code, updated: false, reason: "Not found" });
      }
    }

    res.status(200).json({ message: "Batch status update complete", results });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Internal server error" });
  }
};