// api/am-verify-link.js
// Proxy server-side ke am.noxxyrorr.biz.id supaya tidak kena CORS dari browser.
const crypto = require('crypto');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, message: 'Method not allowed' });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    const { email, magicLink, cookie, fp } = body || {};
    if (!email || !magicLink) {
      return res.status(400).json({ ok: false, message: 'Email & magic link wajib diisi' });
    }

    const deviceFp = fp || crypto.randomBytes(16).toString('hex');

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
        body: JSON.stringify({ email, magicLink, cookie }),
      });
    } catch (netErr) {
      return res.status(502).json({ ok: false, message: `Gagal konek ke upstream: ${netErr.message}`, debug: { stage: 'fetch', error: String(netErr) } });
    }

    const text = await upstream.text();
    let data = null;
    try { data = JSON.parse(text); } catch (e) {}

    if (!upstream.ok || !data || !data.ok) {
      return res.status(502).json({
        ok: false,
        message: (data && data.message) || `Upstream status ${upstream.status}`,
        debug: { stage: 'upstream-response', status: upstream.status, bodySnippet: text.slice(0, 500) },
      });
    }

    return res.status(200).json(data);
  } catch (e) {
    return res.status(500).json({ ok: false, message: `Proxy error: ${e.message}`, debug: { stage: 'handler', error: String(e && e.stack || e) } });
  }
};
