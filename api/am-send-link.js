// api/am-send-link.js
// Proxy server-side ke am.noxxyrorr.biz.id supaya tidak kena CORS dari browser.
const crypto = require('crypto');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, message: 'Method not allowed' });
  }

  try {
    const { email } = req.body || {};
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ ok: false, message: 'Email tidak valid' });
    }

    const fp = crypto.randomBytes(16).toString('hex');

    const upstream = await fetch('https://am.noxxyrorr.biz.id/api/send-link', {
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

    const text = await upstream.text();
    let data = null;
    try { data = JSON.parse(text); } catch (e) {}

    if (!upstream.ok || !data || !data.ok) {
      return res.status(upstream.status === 200 ? 502 : upstream.status).json({
        ok: false,
        message: (data && data.message) || `Upstream error (${upstream.status})`,
      });
    }

    // fp dikirim balik ke client supaya dipakai lagi di langkah verify
    return res.status(200).json({ ...data, fp });
  } catch (e) {
    return res.status(500).json({ ok: false, message: e.message || 'Proxy error' });
  }
};
