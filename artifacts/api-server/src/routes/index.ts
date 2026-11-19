import { Router, type IRouter } from "express";
import healthRouter from "./health";
import editorialRouter from "./editorial";
import storageRouter from "./storage";
import editorialStaffRouter from "./editorial-staff";
import editorialGenerateRouter from "./editorial-generate";
import linkedinNewsletterRouter from "./linkedin-newsletter";
import editorialAutomationRouter from "./editorial-automation";
import newsletterSourcesRouter from "./newsletter-sources";
import futureWorkRouter from "./future-work";
import agentMonitoringRouter from "./agent-monitoring";
import insightsChatRouter from "./insights-chat";

const router: IRouter = Router();

router.use(healthRouter);
router.use(agentMonitoringRouter);
router.use(insightsChatRouter);
router.use(futureWorkRouter);
router.use(editorialGenerateRouter);
router.use(linkedinNewsletterRouter);
router.use(editorialAutomationRouter);
router.use(newsletterSourcesRouter);
router.use(editorialRouter);
router.use(storageRouter);
router.use(editorialStaffRouter);

export default router;
