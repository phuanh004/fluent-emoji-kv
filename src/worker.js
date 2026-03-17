/**
 * Cloudflare Worker to serve Fluent Emoji from KV.
 *
 * Routes:
 *   GET /anim/:unicode.webp  → animated emoji
 *   GET /static/:unicode.webp → static 3D emoji
 *
 * Example:
 *   https://fluent-emoji-kv.phuanh004.workers.dev/anim/1f602.webp
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET',
      'Access-Control-Max-Age': '86400',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Parse path: /anim/1f602.webp or /static/1f602.webp
    const match = path.match(/^\/(anim|static)\/([a-f0-9-]+)\.webp$/);
    if (!match) {
      return new Response('Not found. Use /anim/<unicode>.webp or /static/<unicode>.webp', {
        status: 404,
        headers: corsHeaders,
      });
    }

    const [, type, unicode] = match;
    const key = `${type}:${unicode}`;

    // Look up in KV
    const value = await env.EMOJI_KV.get(key, 'arrayBuffer');
    if (!value) {
      return new Response('Emoji not found', {
        status: 404,
        headers: corsHeaders,
      });
    }

    return new Response(value, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'image/webp',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  },
};
