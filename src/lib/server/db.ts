import "server-only";
import { MongoClient, type Db } from "mongodb";

/**
 * MongoDB access. Credentials come only from server-side environment variables.
 * When MONGODB_URI is not set, callers receive `null` and the API reports
 * DB_NOT_CONFIGURED, so the client can fall back to clearly-labelled browser storage.
 */

declare global {
  var __p2pMongo: { client: MongoClient; ready: Promise<Db> } | undefined;
}

export const COLLECTIONS = {
  users: "users",
  projects: "projects",
  versions: "design_versions",
  documents: "generated_documents",
} as const;

export function isDbConfigured() {
  return !!process.env.MONGODB_URI;
}

async function init(client: MongoClient): Promise<Db> {
  await client.connect();
  const db = client.db(process.env.MONGODB_DB || "plot2plan");
  await Promise.all([
    db.collection(COLLECTIONS.projects).createIndex({ ownerId: 1, updatedAt: -1 }),
    db.collection(COLLECTIONS.versions).createIndex({ projectId: 1, version: 1 }, { unique: true }),
    db.collection(COLLECTIONS.versions).createIndex({ ownerId: 1 }),
    db.collection(COLLECTIONS.documents).createIndex({ projectId: 1, createdAt: -1 }),
    db.collection(COLLECTIONS.documents).createIndex({ ownerId: 1 }),
  ]);
  return db;
}

export async function getDb(): Promise<Db | null> {
  const uri = process.env.MONGODB_URI;
  if (!uri) return null;
  if (!globalThis.__p2pMongo) {
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000, appName: "plot2plan-ai" });
    const ready = init(client).catch((err) => {
      globalThis.__p2pMongo = undefined;
      throw err;
    });
    globalThis.__p2pMongo = { client, ready };
  }
  return globalThis.__p2pMongo.ready;
}
