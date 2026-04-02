import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getBackendBaseUrl } from '@/lib/backendUrl';

async function parseBackendPayload(response: Response): Promise<Record<string, unknown>> {
  const contentType = response.headers.get('content-type') || '';
  const raw = await response.text();

  if (!raw) {
    return { error: 'Backend returned an empty response.' };
  }

  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    const preview = raw.slice(0, 240);
    return {
      error: 'Backend returned an invalid JSON response.',
      upstreamContentType: contentType || 'unknown',
      upstreamBodyPreview: preview,
    };
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('game_session_token')?.value;

    if (!token) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const { jobId } = await params;
    const backendUrl = getBackendBaseUrl();

    const backendRes = await fetch(`${backendUrl}/api/games/chat/result/${jobId}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: 'no-store',
    });

    const data = await parseBackendPayload(backendRes);
    return NextResponse.json(data, { status: backendRes.status });
  } catch (error: unknown) {
    console.error('[/api/game/chat/result/:jobId proxy]', error);
    return NextResponse.json({ error: 'Failed to get chat result' }, { status: 500 });
  }
}
