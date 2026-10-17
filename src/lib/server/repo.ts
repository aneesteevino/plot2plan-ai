import "server-only";
import type { Db } from "mongodb";
import { validateLayout } from "../planner/validate";
import { contains } from "../geometry";
import { toInput, type DesignVersion, type Project, type ProjectInput, type VersionInput } from "../schema";
import { COLLECTIONS, getDb } from "./db";
import { ApiError, isId } from "./http";

/**
 * Data access with ownership enforced on every query: each filter includes
 * `ownerId`, so one visitor can never read or modify another visitor's project.
 */

type ProjectDoc = ProjectInput & { _id: string; ownerId: string; status: Project["status"]; latestVersion: number; createdAt: Date; updatedAt: Date };
type VersionDoc = VersionInput & { _id: string; ownerId: string; projectId: string; version: number; createdAt: Date };

export async function requireDb(): Promise<Db> {
  let db: Db | null;
  try {
    db = await getDb();
  } catch {
    throw new ApiError(503, "DB_UNAVAILABLE", "The database could not be reached. Please try again later.");
  }
  if (!db) throw new ApiError(503, "DB_NOT_CONFIGURED", "Cloud storage is not configured on this deployment.");
  return db;
}

const toProject = (d: ProjectDoc): Project => {
  const { _id, ownerId: _o, createdAt, updatedAt, ...rest } = d;
  void _o;
  return { ...rest, id: _id, createdAt: createdAt.toISOString(), updatedAt: updatedAt.toISOString() };
};

const toVersion = (d: VersionDoc): DesignVersion => {
  const { _id, ownerId: _o, createdAt, ...rest } = d;
  void _o;
  return { ...rest, id: _id, createdAt: createdAt.toISOString() };
};

function checkId(id: string) {
  if (!isId(id)) throw new ApiError(404, "NOT_FOUND", "Project not found.");
}

async function touchUser(db: Db, ownerId: string) {
  await db.collection<{ _id: string }>(COLLECTIONS.users).updateOne(
    { _id: ownerId },
    { $setOnInsert: { createdAt: new Date(), preferences: {}, kind: "anonymous-device" } },
    { upsert: true },
  );
}

export async function listProjects(ownerId: string): Promise<Project[]> {
  const db = await requireDb();
  const docs = await db.collection<ProjectDoc>(COLLECTIONS.projects).find({ ownerId }).sort({ updatedAt: -1 }).limit(200).toArray();
  return docs.map(toProject);
}

export async function getProject(ownerId: string, id: string): Promise<Project> {
  checkId(id);
  const db = await requireDb();
  const doc = await db.collection<ProjectDoc>(COLLECTIONS.projects).findOne({ _id: id, ownerId });
  if (!doc) throw new ApiError(404, "NOT_FOUND", "Project not found.");
  return toProject(doc);
}

export async function createProject(ownerId: string, input: ProjectInput): Promise<Project> {
  const db = await requireDb();
  await touchUser(db, ownerId);
  const count = await db.collection(COLLECTIONS.projects).countDocuments({ ownerId });
  if (count >= 200) throw new ApiError(403, "PROJECT_LIMIT", "Project limit reached (200). Delete old projects to create new ones.");
  const now = new Date();
  const doc: ProjectDoc = { ...input, _id: crypto.randomUUID(), ownerId, status: "draft", latestVersion: 0, createdAt: now, updatedAt: now };
  await db.collection<ProjectDoc>(COLLECTIONS.projects).insertOne(doc);
  return toProject(doc);
}

export async function updateProject(ownerId: string, id: string, input: ProjectInput): Promise<Project> {
  checkId(id);
  const db = await requireDb();
  const res = await db
    .collection<ProjectDoc>(COLLECTIONS.projects)
    .findOneAndUpdate({ _id: id, ownerId }, { $set: { ...input, updatedAt: new Date() } }, { returnDocument: "after" });
  if (!res) throw new ApiError(404, "NOT_FOUND", "Project not found.");
  return toProject(res);
}

export async function deleteProject(ownerId: string, id: string) {
  checkId(id);
  const db = await requireDb();
  const res = await db.collection<ProjectDoc>(COLLECTIONS.projects).deleteOne({ _id: id, ownerId });
  if (res.deletedCount === 0) throw new ApiError(404, "NOT_FOUND", "Project not found.");
  await db.collection(COLLECTIONS.versions).deleteMany({ projectId: id, ownerId });
  await db.collection(COLLECTIONS.documents).deleteMany({ projectId: id, ownerId });
}

export async function duplicateProject(ownerId: string, id: string): Promise<Project> {
  const src = await getProject(ownerId, id);
  const input = toInput(src);
  return createProject(ownerId, { ...input, name: `${input.name} (copy)`.slice(0, 120) });
}

export async function listVersions(ownerId: string, projectId: string): Promise<DesignVersion[]> {
  checkId(projectId);
  const db = await requireDb();
  const docs = await db.collection<VersionDoc>(COLLECTIONS.versions).find({ projectId, ownerId }).sort({ version: -1 }).limit(100).toArray();
  return docs.map(toVersion);
}

export async function addVersion(ownerId: string, projectId: string, v: VersionInput): Promise<DesignVersion> {
  const project = await getProject(ownerId, projectId);
  const plot = { x: 0, y: 0, w: v.layout.plot.w, d: v.layout.plot.d };
  if (!v.layout.floors.every((f) => f.rooms.every((r) => contains(plot, r.rect, 0.05))))
    throw new ApiError(400, "LAYOUT_OUT_OF_BOUNDS", "The layout has rooms outside the plot boundary.");
  // Issues are recomputed on the server so stored validation results are trustworthy.
  const issues = [...v.issues.filter((i) => i.code !== "ROOM_OVERLAP" && i.code !== "OUTSIDE_PLOT" && i.code !== "OUTSIDE_BUILDABLE"), ...validateLayout(v.layout, project)];
  const seen = new Set<string>();
  const deduped = issues.filter((i) => {
    const k = `${i.code}|${i.message}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const db = await requireDb();
  const p = await db
    .collection<ProjectDoc>(COLLECTIONS.projects)
    .findOneAndUpdate({ _id: projectId, ownerId }, { $inc: { latestVersion: 1 }, $set: { status: "generated", updatedAt: new Date() } }, { returnDocument: "after" });
  if (!p) throw new ApiError(404, "NOT_FOUND", "Project not found.");
  const doc: VersionDoc = { ...v, issues: deduped.slice(0, 500), _id: crypto.randomUUID(), ownerId, projectId, version: p.latestVersion, createdAt: new Date() };
  await db.collection<VersionDoc>(COLLECTIONS.versions).insertOne(doc);
  return toVersion(doc);
}

export async function addDocument(ownerId: string, projectId: string, d: { version: number; kind: string; fileName: string; pages?: number }) {
  await getProject(ownerId, projectId);
  const db = await requireDb();
  const doc = {
    _id: crypto.randomUUID(),
    ownerId,
    projectId,
    designVersion: d.version,
    kind: d.kind,
    fileName: d.fileName,
    pages: d.pages,
    exportStatus: "generated-in-browser",
    storage: "client-download (file not stored on server)",
    createdAt: new Date(),
  };
  await db.collection<{ _id: string }>(COLLECTIONS.documents).insertOne(doc);
  return { id: doc._id };
}
