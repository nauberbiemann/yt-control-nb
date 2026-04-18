import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  // Vercel injects these automatically on every deployment
  const sha = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null;
  const deployedAt = process.env.VERCEL_GIT_COMMIT_TIMESTAMP
    ?? process.env.VERCEL_DEPLOYMENT_ID
    ?? null;

  // Format: "18/04 · a1b2c3d"  or just the date if no sha
  let version = 'dev';
  const now = new Date();

  if (sha) {
    // Production: use commit date from env or current build time
    const date = deployedAt ? new Date(deployedAt) : now;
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    version = `${day}/${month} · ${sha}`;
  } else {
    // Local dev fallback
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    version = `${day}/${month} · local`;
  }

  return NextResponse.json({
    version,
    sha,
    deployedAt,
    env: process.env.VERCEL_ENV ?? 'development',
  });
}
