import { Router, type IRouter } from "express";
import {
  getLinkedInNewsletterIngestionStatus,
  ingestLinkedInNewsletters,
} from "../lib/linkedinNewsletterIngestion";
import { requireEditorialStaff } from "../middlewares/requireEditorialStaff";

const router: IRouter = Router();

router.get("/editorial/ingest/linkedin/status", requireEditorialStaff, (_request, response) => {
  return response.json({ data: getLinkedInNewsletterIngestionStatus() });
});

router.post("/editorial/ingest/linkedin", requireEditorialStaff, async (_request, response) => {
  try {
    const report = await ingestLinkedInNewsletters();
    return response.json({ data: report });
  } catch (error) {
    return response.status(502).json({
      error: {
        code: "LINKEDIN_INGESTION_FAILED",
        message: error instanceof Error ? error.message : "LinkedIn newsletter ingestion failed",
      },
    });
  }
});

export default router;