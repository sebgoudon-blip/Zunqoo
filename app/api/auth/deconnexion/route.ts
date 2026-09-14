import { NextRequest, NextResponse } from "next/server";
import { COOKIE_SESSION } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const appUrl = process.env.APP_URL || request.nextUrl.origin;
  const reponse = NextResponse.redirect(new URL("/", appUrl), { status: 303 });
  reponse.cookies.set(COOKIE_SESSION, "", { path: "/", maxAge: 0 });
  return reponse;
}
