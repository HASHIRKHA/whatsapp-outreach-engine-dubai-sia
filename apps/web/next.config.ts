import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // standalone only when building inside Docker (set via ENV in Dockerfile)
  // Vercel does NOT set NEXT_OUTPUT so it uses its own native serverless mode
  ...(process.env.NEXT_OUTPUT === 'standalone' ? { output: 'standalone' } : {}),
  transpilePackages: ['@wa-engine/shared'],
  // All /api/* requests are handled by apps/web/src/app/api/[...path]/route.ts
  // which forwards to the backend, injects X-API-Key, and correctly handles
  // multipart/form-data uploads without corrupting binary content.
  // Do NOT add rewrites here — they bypass the catch-all route.
};

export default nextConfig;
