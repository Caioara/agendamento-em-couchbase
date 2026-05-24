const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const { MongoClient } = require("mongodb");

dotenv.config();

const CONFIG = {
  inserts: parseInt(process.env.BENCH_INSERTS || "1000", 10),
  reads: parseInt(process.env.BENCH_READS || "1000", 10),
  updates: parseInt(process.env.BENCH_UPDATES || "500", 10),
  deletes: parseInt(process.env.BENCH_DELETES || "500", 10),
  concurrency: parseInt(process.env.BENCH_CONCURRENCY || "50", 10)
};

function nowMs() {
  const [sec, nanosec] = process.hrtime();
  return sec * 1000 + nanosec / 1e6;
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}

async function runWithConcurrency(items, worker, concurrency) {
  let index = 0;
  const results = [];

  async function runner() {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await worker(items[current], current);
    }
  }

  const runners = Array.from({ length: concurrency }, () => runner());
  await Promise.all(runners);
  return results;
}

function summarize(latencies, totalMs) {
  const sorted = [...latencies].sort((a, b) => a - b);
  const count = latencies.length;
  const sum = latencies.reduce((acc, value) => acc + value, 0);
  const avg = count > 0 ? sum / count : 0;

  return {
    count,
    totalMs,
    throughputOps: totalMs > 0 ? (count / totalMs) * 1000 : 0,
    avgMs: avg,
    p50Ms: percentile(sorted, 50),
    p95Ms: percentile(sorted, 95),
    p99Ms: percentile(sorted, 99)
  };
}

function buildEventPayload(index) {
  return {
    code: `EVT-${String(index).padStart(5, "0")}`,
    title: `Evento Benchmark ${index}`,
    description: "Carga sintetica para benchmark.",
    location: "Sala 01",
    startAt: new Date(Date.now() + index * 60000).toISOString(),
    endAt: new Date(Date.now() + (index + 60) * 60000).toISOString(),
    durationMinutes: 60,
    capacity: 20,
    status: "open",
    createdBy: "benchmark",
    createdAt: new Date().toISOString()
  };
}

async function main() {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB || "agendamentos";

  if (!uri) {
    throw new Error("MONGODB_URI nao configurado.");
  }

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);
  const events = db.collection("events_bench");

  await events.deleteMany({});

  const ids = Array.from({ length: CONFIG.inserts }, (_, i) => i);

  const insertLatencies = [];
  const insertStart = nowMs();
  await runWithConcurrency(ids, async (id, idx) => {
    const start = nowMs();
    await events.insertOne(buildEventPayload(idx));
    insertLatencies.push(nowMs() - start);
  }, CONFIG.concurrency);
  const insertTotal = nowMs() - insertStart;

  const readLatencies = [];
  const readStart = nowMs();
  await runWithConcurrency(ids.slice(0, CONFIG.reads), async (_, idx) => {
    const start = nowMs();
    await events.findOne({ code: `EVT-${String(idx).padStart(5, "0")}` });
    readLatencies.push(nowMs() - start);
  }, CONFIG.concurrency);
  const readTotal = nowMs() - readStart;

  const updateLatencies = [];
  const updateStart = nowMs();
  await runWithConcurrency(ids.slice(0, CONFIG.updates), async (_, idx) => {
    const start = nowMs();
    await events.updateOne(
      { code: `EVT-${String(idx).padStart(5, "0")}` },
      { $set: { location: "Sala 02", updatedAt: new Date().toISOString() } }
    );
    updateLatencies.push(nowMs() - start);
  }, CONFIG.concurrency);
  const updateTotal = nowMs() - updateStart;

  const deleteLatencies = [];
  const deleteStart = nowMs();
  await runWithConcurrency(ids.slice(0, CONFIG.deletes), async (_, idx) => {
    const start = nowMs();
    await events.deleteOne({ code: `EVT-${String(idx).padStart(5, "0")}` });
    deleteLatencies.push(nowMs() - start);
  }, CONFIG.concurrency);
  const deleteTotal = nowMs() - deleteStart;

  const payloadSize = Buffer.from(JSON.stringify(buildEventPayload(1))).length;

  const results = {
    timestamp: new Date().toISOString(),
    config: CONFIG,
    storage: {
      averageDocumentBytes: payloadSize,
      totalInsertedBytes: payloadSize * CONFIG.inserts
    },
    performance: {
      insert: summarize(insertLatencies, insertTotal),
      read: summarize(readLatencies, readTotal),
      update: summarize(updateLatencies, updateTotal),
      delete: summarize(deleteLatencies, deleteTotal)
    }
  };

  const outputPath = path.join(__dirname, "..", "data", "results.json");
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));

  console.log("Benchmark concluido. Resultados em data/results.json");
  await client.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
