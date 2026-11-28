/**
 * Vercel Serverless Function — pencarian YouTube Music
 * Pakai: GET /api/ytm-search?q=judul lagu
 * Balasan: { status: true, data: [{ videoId, title, subtitle, thumbnail, type }] }
 * Tanpa dependensi (pakai fetch bawaan Node 18+), tidak butuh yt-dlp.
 */
const BASE = 'https://music.youtube.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const FALLBACK_KEY = 'AIzaSyC9XL3ZjWddXya6X74dJoCTL-WEYFDNX30';
const FALLBACK_VER = '1.20261124.13.00';
const ID = /^[\w-]{11}$/;

let cfg = null;
async function getCfg() {
  if (cfg && Date.now() - cfg.t < 3600e3) return cfg;
  let key, ver;
  try {
    const r = await fetch(BASE, { headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' } });
    const h = await r.text();
    key = (h.match(/"INNERTUBE_API_KEY":"([^"]+)"/) || [])[1];
    ver = (h.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/) || [])[1];
  } catch (e) {}
  cfg = { key: key || FALLBACK_KEY, ver: ver || FALLBACK_VER, t: Date.now() };
  return cfg;
}

const txt = o => (o && o.runs ? o.runs.map(r => r.text).join('') : (o && o.simpleText) || '');
const lastThumb = t => (Array.isArray(t) && t.length ? t[t.length - 1].url : null);

async function innertube(host, endpoint, clientName, clientVersion, key, body) {
  const r = await fetch(`${host}/youtubei/v1/${endpoint}?key=${key}&prettyPrint=false`, {
    method: 'POST',
    headers: { 'User-Agent': UA, 'Content-Type': 'application/json', Origin: host, Referer: host + '/' },
    body: JSON.stringify({ context: { client: { clientName, clientVersion, hl: 'en', gl: 'US' } }, ...body })
  });
  if (!r.ok) throw new Error('sumber menjawab ' + r.status);
  return r.json();
}

// ── Hasil dari YouTube Music ──
function parseMusic(data) {
  const secs = data?.contents?.tabbedSearchResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents || [];
  const out = [];
  const push = (videoId, title, subtitle, thumbs, type) => {
    if (!ID.test(videoId || '') || !title) return;
    out.push({ videoId, title, subtitle, thumbnail: lastThumb(thumbs), type });
  };
  const item = r => {
    const c0 = r.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text;
    const c1 = r.flexColumns?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text;
    const vid = r.playlistItemData?.videoId ||
      r.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint?.watchEndpoint?.videoId ||
      c0?.runs?.[0]?.navigationEndpoint?.watchEndpoint?.videoId;
    const sub = txt(c1);
    const low = sub.toLowerCase();
    push(vid, txt(c0), sub, r.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails,
      low.startsWith('artist') ? 'artist' : low.startsWith('album') ? 'album' : 'track');
  };
  for (const sec of secs) {
    const card = sec.musicCardShelfRenderer;
    if (card) {
      push(card.title?.runs?.[0]?.navigationEndpoint?.watchEndpoint?.videoId || card.onTap?.watchEndpoint?.videoId,
        txt(card.title), txt(card.subtitle), card.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails, 'card');
      for (const it of card.contents || []) if (it.musicResponsiveListItemRenderer) item(it.musicResponsiveListItemRenderer);
    }
    for (const it of sec.musicShelfRenderer?.contents || []) if (it.musicResponsiveListItemRenderer) item(it.musicResponsiveListItemRenderer);
    for (const it of sec.itemSectionRenderer?.contents || []) if (it.musicResponsiveListItemRenderer) item(it.musicResponsiveListItemRenderer);
  }
  return out;
}

// ── Cadangan: pencarian YouTube biasa (kalau YT Music kosong/ditolak) ──
function parseWeb(data) {
  const secs = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || [];
  const out = [];
  for (const sec of secs) {
    for (const it of sec.itemSectionRenderer?.contents || []) {
      const v = it.videoRenderer;
      if (!v || !ID.test(v.videoId || '')) continue;
      out.push({
        videoId: v.videoId,
        title: txt(v.title),
        subtitle: [txt(v.ownerText), txt(v.lengthText)].filter(Boolean).join(' • '),
        thumbnail: lastThumb(v.thumbnail?.thumbnails),
        type: 'track'
      });
    }
  }
  return out;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const q = String((req.query && req.query.q) || '').trim().slice(0, 120);
  if (!q) return res.status(400).json({ status: false, error: 'query kosong' });

  let data = [], lastErr = '';
  try {
    const c = await getCfg();
    data = parseMusic(await innertube(BASE, 'search', 'WEB_REMIX', c.ver, c.key, { query: q }));
  } catch (e) { lastErr = e.message; }

  if (!data.length) {
    try {
      const web = await innertube('https://www.youtube.com', 'search', 'WEB', '2.20261124.01.00', FALLBACK_KEY, { query: q });
      data = parseWeb(web);
    } catch (e) { lastErr = e.message; }
  }

  if (!data.length) return res.status(lastErr ? 502 : 200).json({ status: !lastErr, data: [], error: lastErr || undefined });
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
  res.status(200).json({ status: true, data: data.slice(0, 15) });
};
