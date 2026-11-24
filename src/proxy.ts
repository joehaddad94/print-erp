import { NextResponse, type NextRequest } from "next/server";

/**
 * Fast path only: no session cookie → straight to /login. This is NOT the
 * security check; requireUser() in every layout and Server Action is (D42).
 */
export function proxy(request: NextRequest) {
  if (!request.cookies.has("session")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!login|api/health|_next/|favicon.ico).*)"],
};
