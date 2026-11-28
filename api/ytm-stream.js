/**
 * Vercel Serverless Function — stream audio YouTube (untuk putar di latar belakang)
 * Pakai: GET /api/ytm-stream?id=VIDEOID
 * Mengambil URL audio lewat InnerTube lalu di-proxy (mendukung Range / seek),
 * sehingga bisa dipakai di <audio> biasa -> tetap jalan saat layar mati / app di background.
 * Simpan sebagai: /api/ytm-stream.js
 */
const { Readable } = require('stream');

const ID = /^[\w-]{11}$/;
const KEY = 'AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM39w';
const CLIENTS = [
  { name: 'ANDROID', ver: '19.44.38', ua: 'com.google.android.youtube/19.44.38 (Linux; U; Android 14) gzip', extra: { androidSdkVersion: 34 } },
  { name: 'IOS', ver: '19.45.4', ua: 'com.google.ios.youtube/19.45.4 (iPhone16,2; U; CPU iOS 18_1 like Mac OS X)', extra: { deviceModel: 'iPhone16,2', osName: 'iPhone', osVersion: '18.1.0.22B83' } }
];

const cache = new Map(); // id -> { url, ua, mime, exp }

async function resolveAudio(id) {
  const hit = cache.get(id);
  if (hit && hit.exp > Date.now()) return hit;
  let lastErr = 'tidak ada format audio';
  for (const c of CLIENTS) {
    try {
      const r = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${KEY}&prettyPrint=false`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': c.ua },
        body: JSON.stringify({
          videoId: id, contentCheckOk: true, racyCheckOk: true,
          context: { client: { clientName: c.name, clientVersion: c.ver, hl: 'en', gl: 'US', ...c.extra } }
        })
      });
      const j = await r.json();
      if (j.playabilityStatus && j.playabilityStatus.status !== 'OK') { lastErr = j.playabilityStatus.reason || j.playabilityStatus.status; continue; }
      const fm = (j.streamingData && j.streamingData.adaptiveFormats || []).filter(f => f.url && /^audio\//.test(f.mimeType || ''));
      // utamakan m4a/AAC (paling kompatibel di iOS & Android), bitrate tertinggi
      fm.sort((a, b) => (/mp4a/.test(b.mimeType) - /mp4a/.test(a.mimeType)) || (b.bitrate - a.bitrate));
      const f = fm[0];
      if (!f) continue;
      const out = { url: f.url, ua: c.ua, mime: f.mimeType.split(';')[0], exp: Date.now() + 60 * 60 * 1000 };
      cache.set(id, out);
      return out;
    } catch (e) { lastErr = e.message; }
  }
  throw new Error(lastErr);
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const id = String((req.query && req.query.id) || '');
  if (!ID.test(id)) return res.status(400).json({ status: false, error: 'id tidak valid' });

  try {
    let a = await resolveAudio(id);
    const go = u => fetch(u, { headers: { 'User-Agent': a.ua, Range: req.headers.range || 'bytes=0-' } });
    let up = await go(a.url);
    if (up.status === 403) { cache.delete(id); a = await resolveAudio(id); up = await go(a.url); }
    if (!up.ok && up.status !== 206) return res.status(502).json({ status: false, error: 'sumber audio menjawab ' + up.status });

    res.status(up.status);
    res.setHeader('Content-Type', a.mime);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'no-store');
    ['content-length', 'content-range'].forEach(h => { const v = up.headers.get(h); if (v) res.setHeader(h, v); });
    Readable.fromWeb(up.body).on('error', () => res.end()).pipe(res);
    req.on('close', () => { try { up.body.cancel(); } catch (e) {} });
  } catch (e) {
    res.status(502).json({ status: false, error: e.message });
  }
};

module.exports.config = { maxDuration: 60 };
