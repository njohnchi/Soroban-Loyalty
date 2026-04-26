import { Pool } from "pg";
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";
import dotenv from "dotenv";
import { logger } from "./logger";

dotenv.config();

// ── Secret shape stored in AWS Secrets Manager ────────────────────────────────
interface DbSecret {
  username: string;
  password: string;
  host: string;
  port: number;
  dbname: string;
}

const secretsClient = new SecretsManagerClient({
  region: process.env.AWS_REGION ?? "us-east-1",
});

/**
 * Global pool instance. 
 * Re-created if secrets rotate or on initialisation.
 */
export let pool: Pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on("error", (err) => {
  logger.critical("DB connection error", err);
});

async function rotatePool(): Promise<void> {
  const secretArn = process.env.DB_SECRET_ARN;
  if (!secretArn) return;

  try {
    const data = await secretsClient.send(
      new GetSecretValueCommand({ SecretId: secretArn })
    );
    if (data.SecretString) {
      const secrets: DbSecret = JSON.parse(data.SecretString);
      const newPool = new Pool({
        user: secrets.username,
        password: secrets.password,
        host: secrets.host,
        port: secrets.port,
        database: secrets.dbname,
      });
      
      // Swap out the pool and close the old one after a short delay
      const oldPool = pool;
      pool = newPool;
      setTimeout(() => oldPool.end(), 10_000);
      
      logger.info("DB pool rotated with new secrets");
    }
  } catch (err) {
    logger.error("Failed to rotate DB pool", err as Error);
  }
}

// ── Initialise pool from Secrets Manager on startup ──────────────────────────
export async function initDb(): Promise<void> {
  if (process.env.DB_SECRET_ARN) {
    await rotatePool();
  } else {
    // Just verify connection
    const client = await pool.connect();
    client.release();
    logger.info("DB pool initialized from DATABASE_URL");
  }
}
