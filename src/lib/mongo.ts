import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017/newkanban";
const dbName = process.env.MONGODB_DB ?? "newkanban";

declare global {
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

function getClientPromise() {
  if (!global._mongoClientPromise) {
    global._mongoClientPromise = new MongoClient(uri, {
      maxPoolSize: 10,
    }).connect();
  }

  return global._mongoClientPromise;
}

export async function getMongoDb() {
  const client = await getClientPromise();
  return client.db(dbName);
}
