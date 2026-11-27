// api/am-send-link.mjs
// Proxy server-side ke am.noxxyrorr.biz.id supaya tidak kena CORS dari browser.
import crypto from 'node:crypto';

// TODO: ganti dengan domain produksi lu sendiri (bisa lebih dari satu kalau ada preview/staging).
const ALLOWED_ORIGINS = [
  'https://iyanmarketid.vercel.app',
];

function applyCors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req, res) {
  applyCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, message: 'Method not allowed' });
  }

  // Tolak request cross-origin dari domain yang gak dikenal. Catatan: request
  // non-browser (curl/server-to-server) gak bawa header Origin jadi gak kena cek
  // ini — itu kenapa rate limiting (item #3) masih perlu ditambah terpisah.
  const origin = req.headers.origin;
  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    // SEMENTARA buat debug: tampilin origin asli yang diterima server.
    // Hapus baris `receivedOrigin` ini lagi setelah ALLOWED_ORIGINS dipastikan benar.
    return res.status(403).json({ ok: false, message: 'Origin not allowed', receivedOrigin: origin });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    const { email } = body || {};
    // Cek tipe dulu SEBELUM regex: regex .test() diam-diam meng-coerce non-string
    // (array/object) jadi string, jadi array seperti ["a@a.com"] bisa lolos cek lama
    // lalu bikin upstream fetch gagal aneh (502) alih-alih ditolak bersih di sini.
    if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ ok: false, message: 'Email tidak valid' });
    }

    const fp = crypto.randomBytes(16).toString('hex');

    let upstream;
    try {
      upstream = await fetch('https://am.noxxyrorr.biz.id/api/send-link', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/plain, */*',
          'Origin': 'https://am.noxxyrorr.biz.id',
          'Referer': 'https://am.noxxyrorr.biz.id/',
          'X-Device-FP': fp,
        },
        body: JSON.stringify({ email }),
      });
    } catch (netErr) {
      // Detail error cuma di-log server-side, TIDAK dikirim ke client (sebelumnya
      // bocor lewat field `debug`).
      console.error('[am-send-link] fetch error:', netErr);
      return res.status(502).json({ ok: false, message: 'Gagal konek ke upstream.' });
    }

    const text = await upstream.text();
    let data = null;
    try { data = JSON.parse(text); } catch (e) {}

    if (!upstream.ok || !data || !data.ok) {
      console.error('[am-send-link] upstream non-ok:', upstream.status, text.slice(0, 500));
      return res.status(502).json({
        ok: false,
        message: (data && data.message) || 'Upstream error.',
      });
    }

    return res.status(200).json({ ...data, fp });
  } catch (e) {
    console.error('[am-send-link] handler error:', e);
    return res.status(500).json({ ok: false, message: 'Proxy error.' });
  }
}
