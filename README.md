# Fluent Emoji KV

Self-hosted Microsoft Fluent 3D Emoji via Cloudflare KV. Serves animated and static 3D emoji WebP files with O(1) global lookup.

## Setup

```bash
# 1. Download emoji assets from CDN
node scripts/download-emojis.mjs

# 2. Copy .env.example to .env and fill in credentials
cp .env.example .env

# 3. Upload to Cloudflare KV
node scripts/upload-to-kv.mjs

# 4. Deploy Worker
npx wrangler deploy
```

## API

```
GET /anim/<unicode>.webp   → animated 3D emoji
GET /static/<unicode>.webp → static 3D emoji
```

Example: `https://fluent-emoji-kv.phuanh004.workers.dev/anim/1f602.webp`

## License

- Code: MIT
- Emoji assets: MIT (Microsoft Fluent Emoji)
