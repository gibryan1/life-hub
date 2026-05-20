// ═══════════════════════════════════════════════════════════════
// ANTHROPIC CLAUDE — Netlify Serverless Function (API Proxy)
// ═══════════════════════════════════════════════════════════════
//
// SETUP: Netlify → Site configuration → Environment variables → Add:
//   ANTHROPIC_API_KEY = sk-ant-api03-...
//
// ═══════════════════════════════════════════════════════════════

exports.handler = async function (event) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  // ── Environment variable check ─────────────────────────────
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('[claude] ANTHROPIC_API_KEY is not set in Netlify environment variables.');
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'missing_key',
        message: 'ANTHROPIC_API_KEY is not set. Go to Netlify → Site configuration → Environment variables and add it, then redeploy.',
        content: [{ text: 'Server configuration error: ANTHROPIC_API_KEY not set.' }],
        analysis: 'Server configuration error: ANTHROPIC_API_KEY not set.',
      }),
    };
  }

  // ── Parse request body ─────────────────────────────────────
  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  // ── Build messages array ───────────────────────────────────
  let messages, system;

  if (body.messages) {
    messages = body.messages;
    system = body.system;
  } else if (body.prompt) {
    messages = [{ role: 'user', content: body.prompt }];
  } else if (body.trades) {
    const trades = body.trades.slice(-30);
    const tradesSummary = trades.map(t =>
      `Date: ${t.date}, Dir: ${t.direction}, RR: ${t.rr?.toFixed(2) ?? '—'}, PnL: ${t.pnl ?? '—'}, Confluences: ${(t.confluences || []).join('/')}, Mood: ${t.mood}/10, Notes: ${(t.description || '').slice(0, 80)}`
    ).join('\n');
    messages = [{
      role: 'user',
      content: `Analyse my last ${trades.length} NQ futures trades and identify key patterns, strengths, and weaknesses:\n\n${tradesSummary}\n\nProvide actionable insights in under 400 words.`,
    }];
    system = 'You are an expert trading performance coach specialising in NQ futures. Be direct, specific and data-driven.';
  } else {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'No messages, prompt, or trades provided' }) };
  }

  const payload = {
    model: body.model || 'claude-opus-4-7',
    max_tokens: body.max_tokens || 1024,
    messages,
    ...(system ? { system } : {}),
  };

  // ── Call Anthropic API ─────────────────────────────────────
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

    return {
      statusCode: response.status,
      headers,
      body: JSON.stringify({ ...data, analysis: text, result: text }),
    };
  } catch (err) {
    console.error('[claude] Fetch error:', err.message);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'proxy_failed', detail: err.message }),
    };
  }
};
