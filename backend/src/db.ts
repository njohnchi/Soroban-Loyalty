import { Pool } from "pg";
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";
import dotenv from "dotenv";
import { logger } from "./logger";
import { env } from "./env";

dotenv.config();

// ── Secret shape stored in AWS Secrets Manager ────────────────────────────────
interface DbSecret {
  username: string;
  password: string;
  host: string;
  port: number;
  dbname: string;
}

const secretsClient = new SecretsManagerClient({ region: env.AWS_REGION });

// ── Pool — initialised from DATABASE_URL; rotated when DB creds change ────────
export let pool = new Pool({ connectionString: env.DATABASE_URL });

pool.on("error", (err) => {
  logger.critical("DB connection error", err);
});

function isAuthError(err: any): boolean {
  return ["28P01", "28000"].includes(err?.code);
}

async function rotatePool(): Promise<void> {
  if (!env.SECRETS_ARN) return;

  try {
    const response = await secretsClient.send(
      new GetSecretValueCommand({ SecretId: env.SECRETS_ARN })
    );
    if (!response.SecretString) return;

    const secret: DbSecret = JSON.parse(response.SecretString);
    const connectionString =
      `postgres://${secret.username}:${encodeURIComponent(secret.password)}` +
      `@${secret.host}:${secret.port}/${secret.dbname}`;

    const newPool = new Pool({ connectionString });
    const old = pool;
    pool = newPool;
    pool.on("error", (err) => {
      logger.critical("DB connection error", err);
    });
    await old.end();
    logger.info("[db] Pool rotated from Secrets Manager credentials");
  } catch (err) {
    logger.error("[db] Failed to rotate pool", err instanceof Error ? err : new Error(String(err)));
  }
}

// ── Initialise pool from Secrets Manager on startup ──────────────────────────
export async function initDb(): Promise<void> {
  await rotatePool();
}
