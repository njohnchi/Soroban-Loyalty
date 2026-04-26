import { Router, Request, Response } from "express";
import { getAnalytics } from "../services/analytics.service";
import { asyncHandler } from "../middleware/errorHandler";

export const analyticsRouter = Router();

analyticsRouter.get("/", asyncHandler(async (req: Request, res: Response) => {
  const days = Math.min(Math.max(parseInt(req.query.days as string, 10) || 30, 1), 365);
  const data = await getAnalytics(days);
  res.json(data);
}));
