import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null;
  const tsRaw = process.env.VERCEL_GIT_COMMIT_TIMESTAMP ?? null;

  // Determine a reliable date for the version label
  let date: Date;
  if (tsRaw) {
    // Vercel may provide Unix timestamp in seconds or ISO string
    const asNumber = Number(tsRaw);
    if (!isNaN(asNumber) && asNumber > 1_000_000) {
      // Unix seconds
      date = new Date(asNumber * 1000);
    } else {
      const parsed = new Date(tsRaw);
      date = isNaN(parsed.getTime()) ? new Date() : parsed;
    }
  } else {
    // Use build time (stable within a deployment)
    date = new Date();
  }

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const version = sha ? `${day}/${month} · ${sha}` : `${day}/${month} · local`;

  return NextResponse.json({
    version,
    sha,
    env: process.env.VERCEL_ENV ?? 'development',
  });
}
