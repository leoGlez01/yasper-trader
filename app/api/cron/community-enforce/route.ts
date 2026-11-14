import { NextRequest, NextResponse } from "next/server";
import { enforceCommunityPaymentExpiry } from "@/lib/community-report";

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    await enforceCommunityPaymentExpiry();
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("No se pudo aplicar la revisión horaria de acceso mensual", error);
    return NextResponse.json({ error: "enforcement failed" }, { status: 500 });
  }
}
