import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/supabase/env";

const PROTECTED = ["/today", "/group", "/groups", "/progress", "/profile", "/habits", "/people", "/onboarding"];
const AUTH_PAGES = ["/login", "/signup"];

function matches(pathname: string, prefixes: string[]) {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Refreshes the Supabase session cookie on every request and keeps signed-out
 * visitors away from app pages. Authorization of the *data* itself is enforced
 * by Row Level Security in the database, not here.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) return response;

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers ?? {}).forEach(([k, v]) => response.headers.set(k, v));
      },
    },
  });

  // Do not run code between createServerClient and getClaims (session refresh).
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);
  const { pathname, search } = request.nextUrl;

  const redirect = (to: string) => {
    const url = request.nextUrl.clone();
    const [path, query] = to.split("?");
    url.pathname = path;
    url.search = query ? `?${query}` : "";
    const res = NextResponse.redirect(url);
    response.cookies.getAll().forEach((c) => res.cookies.set(c));
    return res;
  };

  if (!signedIn && matches(pathname, PROTECTED)) {
    return redirect(`/login?next=${encodeURIComponent(pathname + search)}`);
  }
  if (signedIn && (pathname === "/" || matches(pathname, AUTH_PAGES))) {
    const next = request.nextUrl.searchParams.get("next");
    return redirect(next && next.startsWith("/") && !next.startsWith("//") ? next : "/today");
  }
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|api/|sw.js|manifest.webmanifest|icons/|favicon.ico|apple-touch-icon.png|offline|.*\\.(?:png|svg|jpg|jpeg|webp|ico|txt|xml)$).*)",
  ],
};
