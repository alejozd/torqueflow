import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const mockRequireSession = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
  requireSession: () => mockRequireSession(),
}));

import { GET } from "./route";

let uploadsDir: string;
const originalUploadsDir = process.env.UPLOADS_DIR;
const TENANT = "taller_perez";

beforeEach(async () => {
  uploadsDir = await mkdtemp(path.join(tmpdir(), "torqueflow-uploads-route-"));
  process.env.UPLOADS_DIR = uploadsDir;
  mockRequireSession.mockReset();
});

afterEach(async () => {
  await rm(uploadsDir, { recursive: true, force: true });
  process.env.UPLOADS_DIR = originalUploadsDir;
});

function makeParams(segments: string[]) {
  return { params: Promise.resolve({ path: segments }) };
}

describe("GET /api/uploads/[...path]", () => {
  it("returns 200 with the correct Content-Type and matching bytes for a valid path in the session's own tenant", async () => {
    mockRequireSession.mockResolvedValue({ user: { tenantSchema: TENANT } });
    const dviDir = path.join(uploadsDir, TENANT, "dvi", "d1");
    await mkdir(dviDir, { recursive: true });
    const bytes = Buffer.from([1, 2, 3, 4]);
    await writeFile(path.join(dviDir, "photo.jpg"), bytes);

    const response = await GET(undefined as never, makeParams([TENANT, "dvi", "d1", "photo.jpg"]));

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/jpeg");
    const body = Buffer.from(await response.arrayBuffer());
    expect(Array.from(body)).toEqual([1, 2, 3, 4]);
  });

  it("does not serve a sibling tenant directory via a traversal segment", async () => {
    mockRequireSession.mockResolvedValue({ user: { tenantSchema: TENANT } });

    const ownDir = path.join(uploadsDir, TENANT, "dvi", "d1");
    await mkdir(ownDir, { recursive: true });
    await writeFile(path.join(ownDir, "photo.jpg"), Buffer.from([1, 2, 3]));

    const evilDir = path.join(uploadsDir, `${TENANT}-evil`);
    await mkdir(evilDir, { recursive: true });
    await writeFile(path.join(evilDir, "photo.jpg"), Buffer.from([9, 9, 9]));

    const response = await GET(
      undefined as never,
      makeParams([TENANT, "..", `${TENANT}-evil`, "photo.jpg"]),
    );

    expect(response.status).not.toBe(200);
    expect([400, 404]).toContain(response.status);
  });

  it("returns 403 when segments[0] does not match session.user.tenantSchema", async () => {
    mockRequireSession.mockResolvedValue({ user: { tenantSchema: TENANT } });

    const response = await GET(undefined as never, makeParams(["other_tenant", "dvi", "d1", "photo.jpg"]));

    expect(response.status).toBe(403);
  });

  it("propagates the rejection when requireSession rejects", async () => {
    mockRequireSession.mockRejectedValue(new Error("REDIRECT:/login?error=unauthenticated"));

    await expect(GET(undefined as never, makeParams([TENANT, "dvi", "d1", "photo.jpg"]))).rejects.toThrow(
      "REDIRECT:/login?error=unauthenticated",
    );
  });

  it("returns 404 when the path does not exist on disk", async () => {
    mockRequireSession.mockResolvedValue({ user: { tenantSchema: TENANT } });

    const response = await GET(undefined as never, makeParams([TENANT, "dvi", "missing", "photo.jpg"]));

    expect(response.status).toBe(404);
  });

  it("returns 404 for an unrecognized file extension instead of serving it", async () => {
    mockRequireSession.mockResolvedValue({ user: { tenantSchema: TENANT } });
    const dviDir = path.join(uploadsDir, TENANT, "dvi", "d1");
    await mkdir(dviDir, { recursive: true });
    await writeFile(path.join(dviDir, "notes.txt"), Buffer.from("hello"));

    const response = await GET(undefined as never, makeParams([TENANT, "dvi", "d1", "notes.txt"]));

    expect(response.status).toBe(404);
  });

  it("includes X-Content-Type-Options and Cache-Control headers on a successful response", async () => {
    mockRequireSession.mockResolvedValue({ user: { tenantSchema: TENANT } });
    const dviDir = path.join(uploadsDir, TENANT, "dvi", "d1");
    await mkdir(dviDir, { recursive: true });
    await writeFile(path.join(dviDir, "photo.jpg"), Buffer.from([1, 2, 3]));

    const response = await GET(undefined as never, makeParams([TENANT, "dvi", "d1", "photo.jpg"]));

    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });
});
