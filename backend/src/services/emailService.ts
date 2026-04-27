// Email delivery via Resend's HTTP API.
//
// Configured via env:
//   RESEND_API_KEY  - required in production. Get one at https://resend.com.
//   EMAIL_FROM      - "AI Jailbreak <noreply@yourdomain.com>". The sending
//                     domain must be verified in Resend, OR you can use
//                     "onboarding@resend.dev" while testing (Resend lets that
//                     address send to the account-owner's email only).
//
// In development (NODE_ENV !== 'production') with no RESEND_API_KEY set, the
// verification code is logged to stdout — no external calls — so local dev
// doesn't need credentials.

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export async function sendVerificationEmail(
  to: string,
  code: string,
  username: string,
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || 'AI Jailbreak <onboarding@resend.dev>';
  const subject = `Your AI Jailbreak verification code: ${code}`;
  const text = [
    `Hi ${username},`,
    '',
    `Your verification code is: ${code}`,
    '',
    'This code expires in 15 minutes. If you did not request it, you can ignore this email.',
    '',
    '— AI Jailbreak',
  ].join('\n');

  const html = `<!doctype html>
<html><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#0f172a;color:#e2e8f0;padding:32px;">
  <div style="max-width:480px;margin:0 auto;background:#1e293b;border-radius:16px;padding:32px;">
    <h2 style="margin:0 0 8px 0;color:#f8fafc;">Verify your email</h2>
    <p style="margin:0 0 24px 0;color:#cbd5e1;">Hi ${escapeHtml(username)}, here is your verification code for AI Jailbreak:</p>
    <div style="font-family:ui-monospace,Menlo,monospace;font-size:32px;letter-spacing:8px;text-align:center;background:#0f172a;border:1px solid #334155;border-radius:12px;padding:20px;color:#f8fafc;">${code}</div>
    <p style="margin:24px 0 0 0;color:#94a3b8;font-size:13px;">This code expires in 15 minutes. If you didn't request it, you can ignore this email.</p>
  </div>
</body></html>`;

  if (!apiKey) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('RESEND_API_KEY is required in production');
    }
    // Dev fallback: print so the developer can copy/paste the code.
    console.log(`[emailService:DEV] would send to ${to}:\n${text}`);
    return;
  }

  const res = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to, subject, text, html }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Resend ${res.status}: ${body.slice(0, 300)}`);
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
