import { type NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const LOGIN = '/login';
const secret = () => new TextEncoder().encode(process.env.JWT_SECRET ?? '');

export async function middleware(request: NextRequest) {
  const token = request.cookies.get('session')?.value;

  if (!token) {
    return NextResponse.redirect(new URL(LOGIN, request.url));
  }

  try {
    await jwtVerify(token, secret());
    return NextResponse.next();
  } catch {
    // Expired or tampered token — clear it and redirect to login
    const res = NextResponse.redirect(new URL(LOGIN, request.url));
    res.cookies.set('session', '', { maxAge: 0, path: '/' });
    return res;
  }
}

export const config = {
  // Protect all routes except: /login, /api/*, /_next/*, static files
  matcher: ['/((?!login|api|_next/static|_next/image|favicon.ico).*)'],
};
