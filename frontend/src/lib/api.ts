// frontend/src/lib/api.ts
export async function submitPrompt(stage: number, promptText: string) {
  const res = await fetch(`/api/stage/${stage}/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: promptText }),
  });
  
  if (!res.ok) throw new Error('Network response was not ok');
  return res.json();
}