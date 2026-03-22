import { resetPasswordByIdentifier } from "@/lib/auth-server";
import { getMongoDb } from "@/lib/mongo";

export async function POST(request: Request) {
  const payload = (await request.json()) as { accountId?: string; email?: string };
  const accountId = (payload.accountId ?? payload.email ?? "").trim().toLowerCase();
  if (!accountId) {
    return Response.json({ message: "Knox ID is required." }, { status: 400 });
  }

  try {
    const db = await getMongoDb();
    await resetPasswordByIdentifier(db, accountId, "0000");
    return Response.json({ ok: true, message: `${accountId} 비밀번호가 0000으로 초기화되었습니다.` });
  } catch (error) {
    return Response.json({ message: error instanceof Error ? error.message : "Unable to reset password." }, { status: 400 });
  }
}
