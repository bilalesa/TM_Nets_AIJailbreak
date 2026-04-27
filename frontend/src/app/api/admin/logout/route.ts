import { NextRequest, NextResponse } from 'next/server';
import { clearAdminCookie, extractClientIp, getAdminFromCookie, writeAudit } from '@/lib/adminAuth';

export async function POST(request: NextRequest) {
  const admin = await getAdminFromCookie();
  await clearAdminCookie();
  if (admin) {
    await writeAudit(admin, {
      action: 'admin_logout',
      targetType: 'admin_user',
      targetId: admin.id,
      ipAddress: extractClientIp(request.headers),
    });
  }
  return NextResponse.json({ success: true });
}
