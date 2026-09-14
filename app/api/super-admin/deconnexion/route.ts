import { NextRequest, NextResponse } from "next/server";
import { COOKIE_SUPER_ADMIN } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const appUrl = process.env.APP_URL || request.nextUrl.origin;
  const reponse = NextResponse.redirect(new URL("/super-admin/connexion", appUrl), {
    status: 303,
  });
  reponse.cookies.set(COOKIE_SUPER_ADMIN, "", { path: "/", maxAge: 0 });
  return reponse;
}
