import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Gate the whole app behind a session cookie. /login is public; everything
// else redirects to /login unless the cookie matches SESSION_TOKEN.
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isLogin = pathname === "/login";
  const authed = req.cookies.get("nisria_session")?.value === process.env.SESSION_TOKEN;

  if (!authed && !isLogin) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  if (authed && isLogin) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // run on everything except static assets + the favicon
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
