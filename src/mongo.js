const { MongoClient, ObjectId } = require("mongodb");

let client;
let db;
let users;
let events;
let enrollments;

async function initMongo() {
  if (client && users && events && enrollments) {
    return { client, db, users, events, enrollments };
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI nao configurado.");
  }

  const dbName = process.env.MONGODB_DB || "agendamentos";

  client = new MongoClient(uri);
  await client.connect();
  db = client.db(dbName);
  users = db.collection("users");
  events = db.collection("events");
  enrollments = db.collection("enrollments");

  await users.createIndex({ email: 1 }, { unique: true });
  await users.createIndex({ role: 1 });

  await events.createIndex({ startAt: 1 });
  await events.createIndex({ createdBy: 1, startAt: 1 });
  await events.createIndex({ status: 1, startAt: 1 });
  await events.createIndex({ title: "text", description: "text", location: "text" });

  await enrollments.createIndex({ eventId: 1, userId: 1 }, { unique: true });
  await enrollments.createIndex({ userId: 1, createdAt: -1 });
  await enrollments.createIndex({ eventId: 1, status: 1 });

  return { client, db, users, events, enrollments };
}

function toObjectId(value) {
  if (!ObjectId.isValid(value)) {
    return null;
  }

  return new ObjectId(value);
}

module.exports = {
  initMongo,
  toObjectId
};
