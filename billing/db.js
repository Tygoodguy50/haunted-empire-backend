// MongoDB connection utility for backend persistence
const { MongoClient } = require('mongodb');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'haunted_empire';

let client;
let db;

async function connectDB() {
  if (db) return db;
  client = new MongoClient(MONGO_URI, { useUnifiedTopology: true });
  await client.connect();
  db = client.db(DB_NAME);
  return db;
}

async function getCollection(name) {
  const database = await connectDB();
  return database.collection(name);
}

module.exports = {
  connectDB,
  getCollection,
};
