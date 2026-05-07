import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Health endpoint. No auth: it's intended for Coolify / load-balancer probes
 * and exposes nothing sensitive. Pings the DB so a misconfigured
 * `DATABASE_URL` shows up in healthchecks instead of as a 500 on first
 * page load.
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({
      ok: true,
      service: 'viewer',
      time: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        service: 'viewer',
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 503 },
    );
  }
}
