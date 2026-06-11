// frontend/src/app/api/game/stage-history/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { getPlayerFromCookie } from '@/lib/playerSession';

interface HistoryMessage {
  id: string;
  role: 'bot' | 'user';
  content: string;
  timestamp: number;
}

export async function GET(request: NextRequest) {
  try {
    const session = await getPlayerFromCookie();
    if (!session.ok) return session.response;
    const { player } = session;

    const stageParam = request.nextUrl.searchParams.get('stage');
    const stageNumber = Number.parseInt(stageParam ?? '', 10);
    if (!Number.isInteger(stageNumber) || stageNumber < 1 || stageNumber > 5) {
      return NextResponse.json({ error: 'Invalid stage' }, { status: 400 });
    }

    const result = await pool.query(
      `SELECT id, prompt_text, ai_response, created_at
       FROM prompt_logs
       WHERE player_id = $1 AND stage_number = $2
       ORDER BY created_at ASC`,
      [player.id, stageNumber],
    );

    const messages: HistoryMessage[] = [];
    for (const row of result.rows) {
      const ts = new Date(row.created_at as string).getTime();
      messages.push({
        id: `pl-${row.id}-u`,
        role: 'user',
        content: (row.prompt_text as string) ?? '',
        timestamp: ts,
      });
      if (typeof row.ai_response === 'string' && row.ai_response.length > 0) {
        messages.push({
          id: `pl-${row.id}-b`,
          role: 'bot',
          content: row.ai_response,
          timestamp: ts + 1,
        });
      }
    }

    return NextResponse.json({ messages });
  } catch (error: unknown) {
    console.error('[/api/game/stage-history]', error);
    return NextResponse.json({ error: 'Failed to load stage history' }, { status: 500 });
  }
}
