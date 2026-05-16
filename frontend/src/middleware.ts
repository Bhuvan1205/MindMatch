import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROTECTED = ["/interview", "/profile", "/matches", "/llm-features", "/chat"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get("mm-token")?.value;

  // Redirect unauthenticated users away from protected pages
  if (PROTECTED.some((p) => pathname.startsWith(p)) && !token) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Redirect already-authenticated users away from the login page
  if (pathname === "/login" && token) {
    return NextResponse.redirect(new URL("/interview", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/interview/:path*",
    "/profile/:path*",
    "/matches/:path*",
    "/llm-features/:path*",
    "/chat/:path*",
    "/chat",
    "/login",
  ],
};
