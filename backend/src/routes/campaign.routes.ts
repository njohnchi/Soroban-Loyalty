import { Router, Request, Response } from "express";
import { z } from "zod";
import { getCampaigns, getCampaignById, reorderCampaigns, saveCampaignImageMapping } from "../services/campaign.service";
import multer from "multer";
import { uploadImage } from "../lib/s3";

export const campaignRouter = Router();

/**
 * GET /campaigns
 * Returns a list of all campaigns stored in the database.
 */
campaignRouter.get("/", async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit ?? "20"), 10) || 20, 100);
    const offset = parseInt(String(req.query.offset ?? "0"), 10) || 0;
    const result = await getCampaigns(limit, offset);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch campaigns" });
  }
});

/**
 * GET /campaigns/:id
 * Returns a single campaign by its ID.
 */
campaignRouter.get("/:id", async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  try {
    const campaign = await getCampaignById(id);
    if (!campaign) return res.status(404).json({ error: "Not found" });
    res.json({ campaign });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch campaign" });
  }
});

const ReorderSchema = z.object({
  order: z.array(z.number().int().positive()),
});

/**
 * PATCH /campaigns/reorder
 * Persists the display order of campaigns for a merchant.
 * Body: { order: number[] }  — array of campaign IDs in desired order
 */
campaignRouter.patch("/reorder", async (req: Request, res: Response) => {
  const parsed = ReorderSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "order must be an array of campaign IDs" });
  try {
    await reorderCampaigns(parsed.data.order);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to reorder campaigns" });
  }
});

const upload = multer({
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Invalid file type. Only JPEG, PNG and WebP are allowed."));
  }
});

/**
 * POST /campaigns/upload
 * Uploads an image to S3 and returns the URL.
 */
campaignRouter.post("/upload", upload.single("image"), async (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  try {
    const imageUrl = await uploadImage(req.file.buffer, req.file.mimetype);
    res.json({ imageUrl });
  } catch (err) {
    console.error("Upload failed:", err);
    res.status(500).json({ error: "Upload failed" });
  }
});

/**
 * POST /campaigns/map-image
 * Maps a transaction hash to an image URL.
 */
campaignRouter.post("/map-image", async (req: Request, res: Response) => {
  const { txHash, imageUrl } = req.body;
  if (!txHash || !imageUrl) return res.status(400).json({ error: "txHash and imageUrl are required" });
  try {
    await saveCampaignImageMapping(txHash, imageUrl);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to map image" });
  }
});
