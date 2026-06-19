import { type NextRequest, NextResponse } from 'next/server';

// Remove Next.js body size cap on this catch-all proxy route
export const dynamic = 'force-dynamic';

const API_URL = process.env.API_URL ?? 'http://localhost:3001/api';

async function proxy(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const targetPath = path.join('/');
  const search = req.nextUrl.search;
  const url = `${API_URL}/${targetPath}${search}`;

  const method = req.method;
  let body: BodyInit | undefined;

  const headers: Record<string, string> = {};
  if (process.env.API_KEY) {
    headers['X-API-Key'] = process.env.API_KEY;
  }

  if (method !== 'GET' && method !== 'HEAD') {
    const contentType = req.headers.get('Content-Type') ?? '';
    if (contentType.startsWith('multipart/form-data')) {
      // Forward raw bytes + the original Content-Type (includes the boundary param).
      // Converting to UTF-8 string would corrupt binary file data.
      body = await req.arrayBuffer();
      headers['Content-Type'] = contentType;
    } else {
      try {
        const buf = await req.arrayBuffer();
        const text = Buffer.from(buf).toString('utf8');
        if (text !== undefined) {
          body = text;
          headers['Content-Type'] = 'application/json';
        }
      } catch {
        body = undefined;
      }
    }
  }

  const upstream = await fetch(url, {
    method,
    headers,
    body,
    redirect: 'manual',
  });

  const responseHeaders: Record<string, string> = {
    'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json',
  };

  if (upstream.status === 204) {
    return new NextResponse(null, { status: 204, headers: responseHeaders });
  }

  // arrayBuffer (not .text()) — response may be a binary media file, not just JSON.
  const buf = await upstream.arrayBuffer();
  return new NextResponse(buf, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
