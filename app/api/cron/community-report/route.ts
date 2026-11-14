import { NextRequest, NextResponse } from "next/server";
import { sendCommunityPaymentReport } from "@/lib/community-report";

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    await sendCommunityPaymentReport();
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("No se pudo enviar el listado diario de pagos pendientes", error);
    return NextResponse.json({ error: "report failed" }, { status: 500 });
  }
}
