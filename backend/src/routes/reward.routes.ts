import { Router, Request, Response } from "express";
import { getRewardsByUser } from "../services/reward.service";

export const rewardRouter = Router();

/**
 * @openapi
 * /user/{address}/rewards:
 *   get:
 *     summary: Get user rewards
 *     description: Returns all rewards associated with a specific Stellar address.
 *     tags: [Rewards]
 *     parameters:
 *       - in: path
 *         name: address
 *         required: true
 *         schema:
 *           type: string
 *           minLength: 56
 *           maxLength: 56
 *         description: The 56-character Stellar public key.
 *     responses:
 *       200:
 *         description: A list of rewards.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 rewards:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Reward'
 *       400:
 *         description: Invalid Stellar address.
 *       500:
 *         description: Server error.
 */
rewardRouter.get("/user/:address/rewards", async (req: Request, res: Response) => {
  const { address } = req.params;
  if (!address || address.length !== 56) {
    return res.status(400).json({ error: "Invalid Stellar address" });
  }
  try {
    const rewards = await getRewardsByUser(address);
    res.json({ rewards });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch rewards" });
  }
});
