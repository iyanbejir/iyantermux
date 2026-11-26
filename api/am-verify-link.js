// api/am-verify-link.js
// Proxy server-side ke am.noxxyrorr.biz.id supaya tidak kena CORS dari browser.
const crypto = require('crypto');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, message: 'Method not allowed' });
  }

  try {
    const { email, magicLink, cookie, fp } = req.body || {};
    if (!email || !magicLink) {
      return res.status(400).json({ ok: false, message: 'Email & magic link wajib diisi' });
    }

    const deviceFp = fp || crypto.randomBytes(16).toString('hex');

    const upstream = await fetch('https://am.noxxyrorr.biz.id/api/verify-link', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/plain, */*',
        'Origin': 'https://am.noxxyrorr.biz.id',
        'Referer': 'https://am.noxxyrorr.biz.id/',
        'X-Device-FP': deviceFp,
      },
      body: JSON.stringify({ email, magicLink, cookie }),
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

    return res.status(200).json(data);
  } catch (e) {
    return res.status(500).json({ ok: false, message: e.message || 'Proxy error' });
  }
};
