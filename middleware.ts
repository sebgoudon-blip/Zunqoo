import { NextRequest, NextResponse } from "next/server";
import { COOKIE_SESSION, COOKIE_SUPER_ADMIN } from "@/lib/auth-constants";

// Le middleware tourne en edge runtime : il ne fait qu'une verification legere
// de presence du cookie (redirection si absent). La verification cryptographique
// complete du jeton (signature JWT) est refaite cote serveur (Node.js runtime)
// dans chaque page/route protegee, via lib/auth.ts.

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/dashboard")) {
    const cookie = request.cookies.get(COOKIE_SESSION);
    if (!cookie) {
      const url = request.nextUrl.clone();
      url.pathname = "/connexion";
      url.searchParams.set("depuis", pathname);
      return NextResponse.redirect(url);
    }
  }

  if (pathname.startsWith("/super-admin") && pathname !== "/super-admin/connexion") {
    const cookie = request.cookies.get(COOKIE_SUPER_ADMIN);
    if (!cookie) {
      const url = request.nextUrl.clone();
      url.pathname = "/super-admin/connexion";
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/super-admin/:path*"],
};
