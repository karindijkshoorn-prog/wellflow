const https = require('https');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'API key not configured on server.' })
    };
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch(e) { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request.' }) }; }

  const { topic, modality, postType, audience, tone, platform, clientName, keywords, avoid, image, mediaType } = body;

  const platformGuidance = {
    Instagram: 'Instagram: hook grabs in 1-2 lines, body 150-220 words, 3-5 targeted hashtags only',
    Facebook: 'Facebook: conversational and warm, 180-250 words, 3-5 hashtags',
    LinkedIn: 'LinkedIn: professional but human, 200-280 words, 5-8 hashtags, no salesy tone',
    Threads: 'Threads: punchy but not too short, 80-120 words, 3-5 hashtags, conversational'
  };

  const extras = [];
  if (clientName) extras.push(`Business or client name to reference naturally if relevant: ${clientName}`);
  if (keywords) extras.push(`Keywords to weave in naturally: ${keywords}`);
  if (avoid) extras.push(`Avoid: ${avoid}`);
  if (image) extras.push(`Note: captions should reflect and be inspired by the visual content provided.`);

  const promptText = `You are an expert social media copywriter specialising in wellness businesses. Write 3 distinct ${platform} ${postType}s for a ${modality} professional.

${topic ? `Topic/context: ${topic}` : 'Generate captions based on the visual content provided.'}
Audience: ${audience}
Tone: ${tone}
Platform guidance: ${platformGuidance[platform] || platformGuidance.Instagram}
${extras.join('\n')}

Non-negotiable rules:
- No emojis anywhere
- Sentence case only, no unnecessary capitals
- No dashes anywhere in the text
- Never use the phrases "level up" or "alignment"
- Each caption opens with a strong scroll-stopping hook (first line stands alone)
- Keep captions concise and easy to read, no fluff, no padding
- Body should feel personal and specific, not generic wellness speak
- End with a soft engagement CTA that invites a response, not a direct sign-up push
- Lowercase hashtags only, always
- Never start three options the same way

Return ONLY a valid JSON object. No markdown, no backticks, no explanation. Exactly this format:
{"captions":[{"hook":"...","body":"...","cta":"...","hashtags":["#tag1","#tag2","#tag3","#tag4","#tag5"]},{"hook":"...","body":"...","cta":"...","hashtags":["#tag1","#tag2","#tag3","#tag4","#tag5"]},{"hook":"...","body":"...","cta":"...","hashtags":["#tag1","#tag2","#tag3","#tag4","#tag5"]}]}`;

  const userContent = image
    ? [
        { type: 'image', source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: image } },
        { type: 'text', text: promptText }
      ]
    : promptText;

  const payload = JSON.stringify({
    model: 'claude-opus-4-5',
    max_tokens: 3000,
    messages: [{ role: 'user', content: userContent }]
  });

  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            resolve({
              statusCode: 500,
              headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
              body: JSON.stringify({ error: parsed.error.message })
            });
            return;
          }
          const text = parsed.content.filter(b => b.type === 'text').map(b => b.text).join('');
          const clean = text.replace(/```json|```/gi, '').trim();
          const start = clean.indexOf('{');
          const end = clean.lastIndexOf('}');
          const result = JSON.parse(clean.slice(start, end + 1));
          resolve({
            statusCode: 200,
            headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
            body: JSON.stringify(result)
          });
        } catch(e) {
          resolve({
            statusCode: 500,
            headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'Failed to parse response: ' + e.message })
          });
        }
      });
    });
    req.on('error', (e) => resolve({
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: e.message })
    }));
    req.write(payload);
    req.end();
  });
};
