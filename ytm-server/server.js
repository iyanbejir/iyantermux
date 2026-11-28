/**
 * Server kecil untuk fitur YT Music di index.html
 * Taruh satu folder dengan "music.youtube.com.js" (scraper, JANGAN ubah header creator-nya)
 * Jalankan: npm i axios && node server.js   (butuh yt-dlp terpasang)
 *
 *  GET /api/ytm/search?q=judul   -> { status, data:[{videoId,title,subtitle,thumbnail,type}] }
 *  GET /api/ytm/stream?id=VIDEO  -> audio (proxy, support seek / Range)
 */
const http = require('http');
const axios = require('axios');
const ytm = require('./music.youtube.com.js');

const PORT = process.env.PORT || 3000;
const ORIGIN = process.env.ALLOW_ORIGIN || '*'; // isi domain webmu biar lebih aman
const cache = new Map(); // id -> { url, exp }

const send = (res, code, obj) => {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
};

async function audioUrl(id) {
  const hit = cache.get(id);
  if (hit && hit.exp > Date.now()) return hit.url;
  const info = await ytm.download(id);
  const url = info.audio && info.audio.url;
  if (!url) throw new Error('audio tidak ditemukan');
  cache.set(id, { url, exp: Date.now() + 30 * 60 * 1000 });
  return url;
}

http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', ORIGIN);
  res.setHeader('Access-Control-Allow-Headers', 'Range');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  const u = new URL(req.url, 'http://x');
  try {
    if (u.pathname === '/api/ytm/search') {
      const q = (u.searchParams.get('q') || '').trim();
      if (!q) return send(res, 400, { status: false, error: 'query kosong' });
      return send(res, 200, { status: true, data: await ytm.search(q) });
    }

    if (u.pathname === '/api/ytm/stream') {
      const id = u.searchParams.get('id') || '';
      if (!/^[a-zA-Z0-9_-]{11}$/.test(id)) return send(res, 400, { status: false, error: 'id tidak valid' });

      const headers = { 'User-Agent': 'Mozilla/5.0' };
      if (req.headers.range) headers.Range = req.headers.range;

      let up;
      try { up = await axios.get(await audioUrl(id), { responseType: 'stream', headers, validateStatus: () => true }); }
      catch (e) { cache.delete(id); throw e; }
      if (up.status >= 400) { cache.delete(id); return send(res, 502, { status: false, error: 'sumber menolak (' + up.status + ')' }); }

      const out = { 'Accept-Ranges': 'bytes' };
      ['content-type', 'content-length', 'content-range'].forEach(h => { if (up.headers[h]) out[h] = up.headers[h]; });
      res.writeHead(up.status, out);
      req.on('close', () => up.data.destroy());
      return up.data.pipe(res);
    }

    send(res, 404, { status: false, error: 'not found' });
  } catch (e) {
    send(res, 500, { status: false, error: e.message });
  }
}).listen(PORT, () => console.log('YTM server jalan di port ' + PORT));
