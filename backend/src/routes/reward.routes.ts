import { Router, Request, Response } from "express";
import { getRewardsByUser } from "../services/reward.service";
import { asyncHandler } from "../middleware/errorHandler";
import { BadRequestError } from "../utils/errors";

export const rewardRouter = Router();

/**
 * GET /user/:address/rewards
 * Returns all rewards associated with a specific Stellar address.
 *
 * @param address - The 56-character Stellar public key.
 */
rewardRouter.get("/user/:address/rewards", asyncHandler(async (req: Request, res: Response) => {
  const { address } = req.params;
  if (!address || address.length !== 56) {
    throw new BadRequestError("Invalid Stellar address", { address });
  }
  const rewards = await getRewardsByUser(address);
  res.json({ rewards });
}));
