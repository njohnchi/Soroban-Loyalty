import { Pool, PoolClient } from "pg";
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";
import dotenv from "dotenv";

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

async function fetchSecret(): Promise<DbSecret> {
  const secretId = process.env.DB_SECRET_ARN ?? process.env.DB_SECRET_NAME;
  if (!secretId) {
    // Fall back to DATABASE_URL when Secrets Manager is not configured
    return parseConnectionString(process.env.DATABASE_URL!);
  }
  const { SecretString } = await secretsClient.send(
    new GetSecretValueCommand({ SecretId: secretId })
  );
  const secret = JSON.parse(SecretString!) as DbSecret;
  console.log("[db] fetched credentials from Secrets Manager");
  return secret;
}

function parseConnectionString(url: string): DbSecret {
  const u = new URL(url);
  return {
    username: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    host: u.hostname,
    port: parseInt(u.port || "5432", 10),
    dbname: u.pathname.replace(/^\//, ""),
  };
}

function buildPool(secret: DbSecret): Pool {
  const p = new Pool({
    user: secret.username,
    password: secret.password,
    host: secret.host,
    port: secret.port,
    database: secret.dbname,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
  p.on("error", (err) => console.error("[db] pool error", err));
  return p;
}

// ── Mutable pool reference — swapped on credential rotation ──────────────────
let _pool: Pool = buildPool(
  parseConnectionString(process.env.DATABASE_URL ?? "postgres://localhost/soroban_loyalty")
);

/** Refresh the pool from Secrets Manager and drain the old one. */
async function rotatePool(): Promise<void> {
  try {
    const secret = await fetchSecret();
    const next = buildPool(secret);
    // Verify connectivity before swapping
    const client = await next.connect();
    client.release();
    const prev = _pool;
    _pool = next;
    // Drain old pool after 1-hour overlap period (old creds still valid)
    setTimeout(() => prev.end().catch(() => {}), 60 * 60 * 1000);
    console.log("[db] pool rotated — old pool drains in 1 hour");
    auditLog("credential_rotation", "Pool refreshed from Secrets Manager");
  } catch (err) {
    console.error("[db] rotation failed, keeping existing pool:", err);
    auditLog("credential_rotation_failed", String(err));
  }
}

function auditLog(event: string, detail: string): void {
  console.log(
    JSON.stringify({
      audit: true,
      event,
      detail,
      ts: new Date().toISOString(),
    })
  );
}

// ── Proxy that transparently retries with fresh credentials on auth failure ───
export const pool = new Proxy({} as Pool, {
  get(_target, prop) {
    const value = (_pool as any)[prop];
    if (prop !== "query" && prop !== "connect") return typeof value === "function" ? value.bind(_pool) : value;

    // Wrap query/connect to retry once after re-fetching credentials
    return async (...args: unknown[]) => {
      try {
        return await (_pool as any)[prop](...args);
      } catch (err: any) {
        if (isAuthError(err)) {
          console.warn("[db] auth error — refreshing credentials and retrying");
          auditLog("auth_error_retry", err.message);
          await rotatePool();
          return (_pool as any)[prop](...args);
        }
        throw err;
      }
    };
  },
});

function isAuthError(err: any): boolean {
  // PostgreSQL error codes for authentication / password failures
  return ["28P01", "28000"].includes(err?.code);
}

// ── Initialise pool from Secrets Manager on startup ──────────────────────────
export async function initDb(): Promise<void> {
  await rotatePool();
}
