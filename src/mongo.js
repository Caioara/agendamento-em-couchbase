const { MongoClient, ObjectId } = require("mongodb");

let client;
let db;
let cars;

async function initMongo() {
  if (client && cars) {
    return { client, db, cars };
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI nao configurado.");
  }

  const dbName = process.env.MONGODB_DB || "carros";

  client = new MongoClient(uri);
  await client.connect();
  db = client.db(dbName);
  cars = db.collection("cars");

  await cars.createIndex({ plate: 1 }, { unique: true });
  await cars.createIndex({ createdAt: -1 });

  return { client, db, cars };
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
