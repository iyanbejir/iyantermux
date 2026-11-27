// api/am-verify-link.mjs
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

  // Tolak request cross-origin dari domain yang gak dikenal.
  const origin = req.headers.origin;
  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    // SEMENTARA buat debug: tampilin origin asli yang diterima server.
    // Hapus baris `receivedOrigin` ini lagi setelah ALLOWED_ORIGINS dipastikan benar.
    return res.status(403).json({ ok: false, message: 'Origin not allowed', receivedOrigin: origin });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    const { email, magicLink, cookie, fp, customOrderId } = body || {};
    // Cek tipe dulu, bukan cuma truthy-check: array/object gak boleh lolos ke upstream.
    if (typeof email !== 'string' || !email || typeof magicLink !== 'string' || !magicLink) {
      return res.status(400).json({ ok: false, message: 'Email & magic link wajib diisi' });
    }
    if (cookie !== undefined && typeof cookie !== 'string') {
      return res.status(400).json({ ok: false, message: 'Format cookie tidak valid' });
    }
    if (customOrderId !== undefined && typeof customOrderId !== 'string') {
      return res.status(400).json({ ok: false, message: 'Format customOrderId tidak valid' });
    }

    const deviceFp = fp || crypto.randomBytes(16).toString('hex');
    // customOrderId SENGAJA TIDAK dikirim ke upstream: fitur itu khusus pengguna VIP
    // dan upstream menolak (403) seluruh request kalau field ini ada tanpa vipKey.
    // Order ID custom cuma dipakai buat menimpa tampilan setelah verifikasi sukses.
    const verifyBody = { email, magicLink, cookie };

    let upstream;
    try {
      upstream = await fetch('https://am.noxxyrorr.biz.id/api/verify-link', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/plain, */*',
          'Origin': 'https://am.noxxyrorr.biz.id',
          'Referer': 'https://am.noxxyrorr.biz.id/',
          'X-Device-FP': deviceFp,
        },
        body: JSON.stringify(verifyBody),
      });
    } catch (netErr) {
      console.error('[am-verify-link] fetch error:', netErr);
      return res.status(502).json({ ok: false, message: 'Gagal konek ke upstream.' });
    }

    const text = await upstream.text();
    let data = null;
    try { data = JSON.parse(text); } catch (e) {}

    if (!upstream.ok || !data || !data.ok) {
      console.error('[am-verify-link] upstream non-ok:', upstream.status, text.slice(0, 500));
      return res.status(502).json({
        ok: false,
        message: (data && data.message) || 'Upstream error.',
      });
    }

    // Kalau upstream gak ikut memakai customOrderId yang kita kirim, paksa pakai punya kita saja
    if (customOrderId && data.userData) data.userData.orderId = customOrderId;
    else if (customOrderId) data.orderId = customOrderId;

    return res.status(200).json(data);
  } catch (e) {
    console.error('[am-verify-link] handler error:', e);
    return res.status(500).json({ ok: false, message: 'Proxy error.' });
  }
}
