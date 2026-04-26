import { Router, Request, Response } from "express";
import { z } from "zod";
import { getCampaigns, getCampaignById, reorderCampaigns } from "../services/campaign.service";
import { asyncHandler } from "../middleware/errorHandler";
import { BadRequestError, NotFoundError } from "../utils/errors";

export const campaignRouter = Router();

/**
 * GET /campaigns
 * Returns a list of all campaigns stored in the database.
 */
campaignRouter.get("/", asyncHandler(async (req: Request, res: Response) => {
  const limit = Math.min(parseInt(String(req.query.limit ?? "20"), 10) || 20, 100);
  const offset = parseInt(String(req.query.offset ?? "0"), 10) || 0;
  const result = await getCampaigns(limit, offset);
  res.json(result);
}));

/**
 * GET /campaigns/:id
 * Returns a single campaign by its ID.
 */
campaignRouter.get("/:id", asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    throw new BadRequestError("Invalid id", { id: req.params.id });
  }
  const campaign = await getCampaignById(id);
  if (!campaign) {
    throw new NotFoundError("Campaign");
  }
  res.json({ campaign });
}));

const ReorderSchema = z.object({
  order: z.array(z.number().int().positive()),
});

/**
 * PATCH /campaigns/reorder
 * Persists the display order of campaigns for a merchant.
 * Body: { order: number[] }  — array of campaign IDs in desired order
 */
campaignRouter.patch("/reorder", asyncHandler(async (req: Request, res: Response) => {
  const parsed = ReorderSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new BadRequestError("Invalid request body", { errors: parsed.error.errors });
  }
  await reorderCampaigns(parsed.data.order);
  res.json({ ok: true });
}));
