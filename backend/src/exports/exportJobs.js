import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import archiver from "archiver";

/**
 * Background export jobs for bulk packages. The request returns a job id right
 * away; the client polls for progress, then downloads the finished ZIP. The
 * ZIP is written to a temp file (not held in memory) and removed after an hour.
 *
 * In-memory registry: fine for a single server process (pm2 fork mode). A
 * restart drops unfinished jobs; the client just starts a new one.
 */

const jobs = new Map();
const TTL_MS = 60 * 60 * 1000;

const cleanup = () => {
  const cutoff = Date.now() - TTL_MS;
  for (const [id, job] of jobs) {
    if (job.createdAt < cutoff) {
      if (job.filePath) fs.rm(job.filePath, { force: true }, () => {});
      jobs.delete(id);
    }
  }
};
setInterval(cleanup, 10 * 60 * 1000).unref();

const publicView = (job) => ({
  id: job.id,
  status: job.status, // queued | running | done | failed
  progress: job.total ? Math.round((job.done / job.total) * 100) : 0,
  done: job.done,
  total: job.total,
  message: job.message,
  fileName: job.fileName,
  error: job.error,
});

/**
 * Starts a ZIP job.
 * @param {object} opts
 * @param {string} opts.ownerId user who may read the job
 * @param {string} opts.fileName ZIP file name
 * @param {(ctx: { add(name: string, buffer: Buffer): void, setTotal(n: number): void, step(message: string): void }) => Promise<void>} opts.build
 */
export const startZipJob = ({ ownerId, fileName, build }) => {
  const id = crypto.randomUUID();
  const job = { id, ownerId: String(ownerId), fileName, status: "queued", done: 0, total: 0, message: "Queued", createdAt: Date.now(), filePath: null, error: null };
  jobs.set(id, job);

  setImmediate(async () => {
    const filePath = path.join(os.tmpdir(), `export-${id}.zip`);
    try {
      job.status = "running";
      const out = fs.createWriteStream(filePath);
      const archive = archiver("zip", { zlib: { level: 6 } });
      const finished = new Promise((resolve, reject) => {
        out.on("close", resolve);
        archive.on("error", reject);
      });
      archive.pipe(out);
      await build({
        add: (name, buffer) => archive.append(buffer, { name }),
        setTotal: (n) => { job.total = n; },
        step: (message) => {
          job.done++;
          job.message = message;
        },
      });
      await archive.finalize();
      await finished;
      job.filePath = filePath;
      job.status = "done";
      job.message = "Ready to download";
    } catch (err) {
      console.error("[EXPORT] Job failed:", err);
      job.status = "failed";
      job.error = err.message || "Export failed";
      fs.rm(filePath, { force: true }, () => {});
    }
  });

  return publicView(job);
};

export const getJob = (id, user) => {
  const job = jobs.get(id);
  if (!job) return null;
  if (user?.role !== "admin" && job.ownerId !== String(user?.id)) return null;
  return job;
};

export const jobView = publicView;
