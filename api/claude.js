// Anthropic Claude proxy — Vercel Serverless Function
// Set ANTHROPIC_API_KEY in Vercel → Project Settings → Environment Variables

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('[claude] ANTHROPIC_API_KEY is not set.');
    return res.status(500).json({
      error: 'missing_key',
      message: 'ANTHROPIC_API_KEY not set in Vercel environment variables.',
      content: [{ text: 'ANTHROPIC_API_KEY not set in Vercel environment variables.' }],
      analysis: 'ANTHROPIC_API_KEY not set in Vercel environment variables.',
    });
  }

  const body = req.body;
  if (!body) return res.status(400).json({ error: 'No body' });

  let messages, system;
  if (body.messages) {
    messages = body.messages;
    system = body.system;
  } else if (body.prompt) {
    messages = [{ role: 'user', content: body.prompt }];
  } else if (body.trades) {
    const trades = body.trades.slice(-30);
    const summary = trades.map(t =>
      `Date: ${t.date}, Dir: ${t.direction}, RR: ${t.rr?.toFixed(2) ?? '—'}, PnL: ${t.pnl ?? '—'}, Confluences: ${(t.confluences || []).join('/')}, Mood: ${t.mood}/10, Notes: ${(t.description || '').slice(0, 80)}`
    ).join('\n');
    messages = [{ role: 'user', content: `Analyse my last ${trades.length} NQ futures trades:\n\n${summary}\n\nProvide actionable insights in under 400 words.` }];
    system = 'You are an expert trading performance coach specialising in NQ futures. Be direct, specific and data-driven.';
  } else {
    return res.status(400).json({ error: 'No messages, prompt, or trades provided' });
  }

  const payload = {
    model: body.model || 'claude-opus-4-7',
    max_tokens: body.max_tokens || 1024,
    messages,
    ...(system ? { system } : {}),
  };

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    const text = data.content?.[0]?.text || '';
    return res.status(response.status).json({ ...data, analysis: text, result: text });
  } catch (err) {
    console.error('[claude] Error:', err.message);
    return res.status(500).json({ error: 'proxy_failed', detail: err.message });
  }
};
