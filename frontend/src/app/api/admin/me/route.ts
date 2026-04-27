import { NextResponse } from 'next/server';
import { AdminAuthError, requireAdmin } from '@/lib/adminAuth';

export async function GET() {
  try {
    const admin = await requireAdmin();
    return NextResponse.json({ admin });
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[admin/me]', err);
    return NextResponse.json({ error: 'Failed to load admin' }, { status: 500 });
  }
}
