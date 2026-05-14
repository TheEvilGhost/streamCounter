import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function unauthorized() {
  return new NextResponse("Требуется вход (логин любой, пароль из настроек Vercel).", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Stream Analyzer"',
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}

export function middleware(request: NextRequest) {
  const password = process.env.SITE_PASSWORD;
  if (!password) {
    return NextResponse.next();
  }

  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Basic ")) {
    return unauthorized();
  }

  let decoded = "";
  try {
    decoded = atob(auth.slice(6).trim());
  } catch {
    return unauthorized();
  }

  const colon = decoded.indexOf(":");
  const supplied = colon >= 0 ? decoded.slice(colon + 1) : "";
  if (supplied !== password) {
    return unauthorized();
  }

  const { pathname } = request.nextUrl;
  if (pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/index.html";
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|_next/data|favicon.ico).*)"],
};
