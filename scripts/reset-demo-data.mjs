import { MongoClient } from "mongodb";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const mongoUri = process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017/newkanban";
const dbName = process.env.MONGODB_DB ?? "newkanban";
const workspaceId = process.env.WORKSPACE_ID ?? "visualai-guest";
const workspaceName = "VisualAI-Guest";

const client = new MongoClient(mongoUri);

const emptyWorkspace = {
  _id: workspaceId,
  id: workspaceId,
  name: workspaceName,
  workspaceKey: "VISUALAI-GUEST",
  description: "Default guest workspace",
  sprintProgress: 0,
  weeklyCapacity: 0,
  tasks: [],
  notes: [],
  whiteboardScene: null,
  agenda: [],
  activity: [],
  automation: {
    progressCompletesTask: true,
    statusSetsProgress: true,
    dueDateCreatesAgendaHold: false,
  },
  savedViews: [],
  automationRules: [],
  automationRunsCount: 0,
  createdAt: new Date().toISOString(),
};

try {
  await client.connect();
  const db = client.db(dbName);

  await Promise.all([
    db.collection("users").deleteMany({}),
    db.collection("memberships").deleteMany({}),
    db.collection("workspace_records").deleteMany({}),
    db.collection("workspaces").deleteMany({}),
    db.collection("workspace_join_requests").deleteMany({}),
    db.collection("notifications").deleteMany({}),
    db.collection("sessions").deleteMany({}),
    db.collection("presence").deleteMany({}),
    db.collection("audit_logs").deleteMany({}),
    db.collection("verification_tokens").deleteMany({}),
    db.collection("password_reset_tokens").deleteMany({}),
    db.collection("mfa_challenges").deleteMany({}),
    db.collection("invites").deleteMany({}),
  ]);

  await db.collection("workspace_records").insertOne({
    _id: workspaceId,
    id: workspaceId,
    name: workspaceName,
    workspaceKey: "VISUALAI-GUEST",
    description: "Default guest workspace",
    createdAt: new Date().toISOString(),
  });

  await db.collection("workspaces").insertOne(emptyWorkspace);

  console.log(JSON.stringify({ ok: true, workspaceId, workspaceName }, null, 2));
} finally {
  await client.close();
}
