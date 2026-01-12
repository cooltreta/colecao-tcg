import { NextRequest, NextResponse } from "next/server";

export const config = {
  matcher: [
    // protege tudo, exceto assets do Next e favicon
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};

function unauthorized() {
  return new NextResponse("Auth required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Protected", charset="UTF-8"',
    },
  });
}

export default function middleware(req: NextRequest) {
  const user = process.env.BASIC_AUTH_USER || "";
  const pass = process.env.BASIC_AUTH_PASS || "";

  // Se não definires env vars, não bloqueia (útil localmente)
  if (!user || !pass) return NextResponse.next();

  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Basic ")) return unauthorized();

  const base64 = auth.slice("Basic ".length);
  let decoded = "";
  try {
    decoded = atob(base64);
  } catch {
    return unauthorized();
  }

  const [u, p] = decoded.split(":");
  if (u === user && p === pass) return NextResponse.next();

  return unauthorized();
}
