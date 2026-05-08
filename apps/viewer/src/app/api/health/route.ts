import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Liveness check for Coolify / load-balancer probes. Intentionally does
// nothing besides confirm the Node process is up and Next is routing —
// don't couple it to the DB. A DB outage is a real problem but it
// shouldn't take a healthy frontend out of rotation.
export function GET() {
  return NextResponse.json({
    ok: true,
    service: 'viewer',
    time: new Date().toISOString(),
  });
}
