/**
 * YouTube Music Scraper & Downloader
 * Creator: IzzXd
 * Base: https://music.youtube.com
 * Saluran: https://whatsapp.com/channel/0029VbDyL6d9RZAh3JjEM325
 * Note: pliss guys jangan di klaim 100% buatan lu, lu boleh kok modifikasi trs share lagi tapi tolong jangan ilangin header creator sama ch-nya
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFile } = require('child_process');
const axios = require('axios');

const _p = ["fJMupwGtP5IrlSHzB608x3nEdfsErTvFeMd081GnP5Ap", "w3XyVqs9w32RI6cD+GrEeJYnpgT4PsEolCOiAao8xw=="];
const _k = [0x4d, 0xa1, 0x17, 0xc3, 0x62, 0x9e, 0x0b, 0xf4];

function _ld() {
    const raw = Buffer.from(_p.join(''), 'base64');
    const out = Buffer.alloc(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw[i] ^ _k[i % _k.length];
    return out.toString('utf8');
}

function _hd() {
    try {
        const src = fs.readFileSync(__filename, 'utf8');
        const m = src.match(/^\s*\/\*\*[\s\S]*?\*\//);
        if (!m) return '';
        const keys = ['Creator:', 'Saluran:', 'Note:'];
        const lines = m[0].split('\n').map(l => l.replace(/^\s*\*?\s*/, '').replace(/\s+/g, ''));
        const pick = keys.map(k => lines.find(l => l.startsWith(k)));
        if (pick.some(x => !x)) return '';
        return crypto.createHash('sha256').update(pick.join('')).digest('hex');
    } catch (_) {
        return '';
    }
}

function _ck() {
    const h = _hd();
    if (!h || h !== _ld()) throw new Error('ctx invalid');
}

const BASE_URL = 'https://music.youtube.com';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const YTDLP_BIN = fs.existsSync('/usr/local/bin/yt-dlp') ? '/usr/local/bin/yt-dlp' : 'yt-dlp';

let cachedApiKey = null;
let cachedClientVer = null;
let lastKeyTime = 0;

async function getInnertubeConfig() {
    if (cachedApiKey && cachedClientVer && (Date.now() - lastKeyTime < 60 * 60 * 1000)) {
        return { apiKey: cachedApiKey, clientVersion: cachedClientVer };
    }
    try {
        const res = await axios.get(BASE_URL, {
            headers: {
                'User-Agent': USER_AGENT,
                'Accept-Language': 'en-US,en;q=0.9'
            },
            timeout: 15000
        });
        const html = res.data;
        const keyMatch = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/);
        const verMatch = html.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/);
        if (keyMatch) cachedApiKey = keyMatch[1];
        if (verMatch) cachedClientVer = verMatch[1];
    } catch (_) {}

    if (!cachedApiKey) cachedApiKey = 'AIzaSyC9XL3ZjWddXya6X74dJoCTL-WEYFDNX30';
    if (!cachedClientVer) cachedClientVer = '1.20261124.13.00';
    lastKeyTime = Date.now();
    return { apiKey: cachedApiKey, clientVersion: cachedClientVer };
}

async function callInnertube(endpoint, payload = {}) {
    const { apiKey, clientVersion } = await getInnertubeConfig();
    const body = {
        context: {
            client: {
                clientName: 'WEB_REMIX',
                clientVersion,
                hl: 'en',
                gl: 'US'
            }
        },
        ...payload
    };

    const res = await axios.post(`${BASE_URL}/youtubei/v1/${endpoint}?key=${apiKey}&prettyPrint=false`, body, {
        headers: {
            'User-Agent': USER_AGENT,
            'Referer': `${BASE_URL}/`,
            'Origin': BASE_URL,
            'Content-Type': 'application/json'
        },
        timeout: 20000
    });

    return res.data;
}

function cleanVideoId(urlOrId) {
    if (!urlOrId) return '';
    const str = String(urlOrId).trim();
    const vMatch = str.match(/(?:v=|\/watch\?v=|\/embed\/|youtu\.be\/|\/v\/|watch%3Fv%3D)([a-zA-Z0-9_-]{11})/);
    if (vMatch) return vMatch[1];
    if (/^[a-zA-Z0-9_-]{11}$/.test(str)) return str;
    return str;
}

async function search(query) {
    _ck();
    if (!query) throw new Error('missing query argument');
    const data = await callInnertube('search', { query });
    const sections = data.contents?.tabbedSearchResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents || [];

    const results = [];
    for (const sec of sections) {
        if (sec.musicCardShelfRenderer) {
            const card = sec.musicCardShelfRenderer;
            const title = card.title?.runs?.map(r => r.text).join('') || '';
            const subtitle = card.subtitle?.runs?.map(r => r.text).join('') || '';
            const videoId = card.title?.runs?.[0]?.navigationEndpoint?.watchEndpoint?.videoId ||
                card.onTap?.watchEndpoint?.videoId;
            const thumbs = card.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
            if (title) {
                results.push({
                    type: 'card',
                    title,
                    subtitle,
                    videoId: videoId || null,
                    link: videoId ? `${BASE_URL}/watch?v=${videoId}` : null,
                    thumbnail: thumbs.length ? thumbs[thumbs.length - 1].url : null
                });
            }
        }

        const items = sec.itemSectionRenderer?.contents || [];
        for (const it of items) {
            const r = it.musicResponsiveListItemRenderer;
            if (!r) continue;
            const title = r.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.map(x => x.text).join('') || '';
            const subtitle = r.flexColumns?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.map(x => x.text).join('') || '';
            const videoId = r.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint?.watchEndpoint?.videoId ||
                r.navigationEndpoint?.watchEndpoint?.videoId ||
                r.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.navigationEndpoint?.watchEndpoint?.videoId;
            const thumbs = r.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];

            if (title) {
                results.push({
                    type: subtitle.toLowerCase().includes('artist') ? 'artist' : (subtitle.toLowerCase().includes('album') ? 'album' : 'track'),
                    title,
                    subtitle,
                    videoId: videoId || null,
                    link: videoId ? `${BASE_URL}/watch?v=${videoId}` : null,
                    thumbnail: thumbs.length ? thumbs[thumbs.length - 1].url : null
                });
            }
        }
    }

    return results;
}

async function suggest(query) {
    _ck();
    if (!query) throw new Error('missing query argument');
    const data = await callInnertube('music/get_search_suggestions', { input: query });
    const items = data.contents?.[0]?.searchSuggestionsSectionRenderer?.contents || [];
    return items.map(it => it.searchSuggestionRenderer?.suggestion?.runs?.map(r => r.text).join('')).filter(Boolean);
}

async function charts() {
    _ck();
    const data = await callInnertube('browse', { browseId: 'FEmusic_charts' });
    const sections = data.contents?.singleColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents || [];
    const categories = [];

    for (const sec of sections) {
        const car = sec.musicCarouselShelfRenderer;
        if (!car) continue;
        const catTitle = car.header?.musicCarouselShelfBasicHeaderRenderer?.title?.runs?.map(r => r.text).join('') || 'Featured';
        const items = [];
        for (const it of car.contents || []) {
            const r = it.musicResponsiveListItemRenderer || it.musicTwoRowItemRenderer;
            if (!r) continue;
            const title = r.title?.runs?.map(x => x.text).join('') ||
                r.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.map(x => x.text).join('') || '';
            const subtitle = r.subtitle?.runs?.map(x => x.text).join('') ||
                r.flexColumns?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.map(x => x.text).join('') || '';
            const videoId = r.navigationEndpoint?.watchEndpoint?.videoId ||
                r.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint?.watchEndpoint?.videoId;
            const thumbs = r.thumbnailRenderer?.musicThumbnailRenderer?.thumbnail?.thumbnails ||
                r.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];

            if (title) {
                items.push({
                    title,
                    subtitle,
                    videoId: videoId || null,
                    link: videoId ? `${BASE_URL}/watch?v=${videoId}` : null,
                    thumbnail: thumbs.length ? thumbs[thumbs.length - 1].url : null
                });
            }
        }
        categories.push({
            category: catTitle,
            itemsCount: items.length,
            items
        });
    }

    return categories;
}

async function explore() {
    _ck();
    const data = await callInnertube('browse', { browseId: 'FEmusic_explore' });
    const sections = data.contents?.singleColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents || [];
    const categories = [];

    for (const sec of sections) {
        const car = sec.musicCarouselShelfRenderer;
        if (!car) continue;
        const catTitle = car.header?.musicCarouselShelfBasicHeaderRenderer?.title?.runs?.map(r => r.text).join('') || 'Explore';
        const items = [];
        for (const it of car.contents || []) {
            const r = it.musicResponsiveListItemRenderer || it.musicTwoRowItemRenderer;
            if (!r) continue;
            const title = r.title?.runs?.map(x => x.text).join('') ||
                r.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.map(x => x.text).join('') || '';
            const subtitle = r.subtitle?.runs?.map(x => x.text).join('') ||
                r.flexColumns?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.map(x => x.text).join('') || '';
            const videoId = r.navigationEndpoint?.watchEndpoint?.videoId ||
                r.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint?.watchEndpoint?.videoId;
            const thumbs = r.thumbnailRenderer?.musicThumbnailRenderer?.thumbnail?.thumbnails ||
                r.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];

            if (title) {
                items.push({
                    title,
                    subtitle,
                    videoId: videoId || null,
                    link: videoId ? `${BASE_URL}/watch?v=${videoId}` : null,
                    thumbnail: thumbs.length ? thumbs[thumbs.length - 1].url : null
                });
            }
        }
        categories.push({
            category: catTitle,
            itemsCount: items.length,
            items
        });
    }

    return categories;
}

async function artist(channelIdOrBrowseId) {
    _ck();
    const browseId = String(channelIdOrBrowseId || '').trim();
    if (!browseId) throw new Error('missing channel id or browse id');
    const data = await callInnertube('browse', { browseId });
    const header = data.header?.musicImmersiveHeaderRenderer || data.header?.musicVisualHeaderRenderer;
    const title = header?.title?.runs?.[0]?.text || '';
    const description = header?.description?.runs?.[0]?.text || '';
    const thumbs = header?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];

    return {
        browseId,
        name: title,
        description,
        thumbnail: thumbs.length ? thumbs[thumbs.length - 1].url : null
    };
}

async function lyrics(videoIdOrUrl) {
    _ck();
    const videoId = cleanVideoId(videoIdOrUrl);
    if (!videoId) throw new Error('missing video id or url argument');

    const nextData = await callInnertube('next', { videoId });
    const tabs = nextData.contents?.singleColumnMusicWatchNextResultsRenderer?.tabbedRenderer?.watchNextTabbedResultsRenderer?.tabs || [];
    const lyricsTab = tabs.find(t => t.tabRenderer?.endpoint?.browseEndpoint?.browseId);

    if (!lyricsTab) {
        throw new Error('lyrics not available for this track');
    }

    const browseId = lyricsTab.tabRenderer.endpoint.browseEndpoint.browseId;
    const lyricsRes = await callInnertube('browse', { browseId });
    const lyricsText = lyricsRes.contents?.sectionListRenderer?.contents?.[0]?.musicDescriptionShelfRenderer?.description?.runs?.[0]?.text;
    const footer = lyricsRes.contents?.sectionListRenderer?.contents?.[0]?.musicDescriptionShelfRenderer?.footer?.runs?.[0]?.text || '';

    if (!lyricsText) {
        throw new Error('empty lyrics content');
    }

    return {
        videoId,
        link: `${BASE_URL}/watch?v=${videoId}`,
        lyrics: lyricsText,
        source: footer || 'YouTube Music'
    };
}

async function download(videoIdOrUrl) {
    _ck();
    const videoId = cleanVideoId(videoIdOrUrl);
    if (!videoId) throw new Error('missing video id or url argument');
    const watchUrl = `${BASE_URL}/watch?v=${videoId}`;

    return new Promise((resolve, reject) => {
        execFile(YTDLP_BIN, ['-j', '--no-playlist', watchUrl], (err, stdout, stderr) => {
            if (err) return reject(new Error(stderr || err.message));
            try {
                const info = JSON.parse(stdout);
                const audioFormats = (info.formats || []).filter(f => f.acodec !== 'none' && f.vcodec === 'none');
                const bestAudio = audioFormats[audioFormats.length - 1] || audioFormats[0];

                resolve({
                    id: info.id,
                    title: info.title,
                    artist: info.artist || info.uploader || info.channel || '',
                    duration: info.duration,
                    thumbnail: info.thumbnail,
                    link: watchUrl,
                    audio: {
                        format: bestAudio?.ext || 'm4a',
                        bitrate: bestAudio?.abr || bestAudio?.tbr || null,
                        url: bestAudio?.url || null
                    }
                });
            } catch (e) {
                reject(new Error(`failed to parse video info: ${e.message}`));
            }
        });
    });
}

async function main() {
    const args = process.argv.slice(2);
    const cmd = args[0] ? args[0].toLowerCase() : '';
    const start = Date.now();

    if (!cmd || ['help', '-h', '--help'].includes(cmd)) {
        console.log('Usage:');
        console.log(' node music.youtube.com.js search <query>');
        console.log(' node music.youtube.com.js suggest <query>');
        console.log(' node music.youtube.com.js charts');
        console.log(' node music.youtube.com.js explore');
        console.log(' node music.youtube.com.js artist <browse_id_or_channel_id>');
        console.log(' node music.youtube.com.js lyrics <video_id_or_url>');
        console.log(' node music.youtube.com.js dl <video_id_or_url>');
        process.exit(0);
    }

    try {
        let data;
        if (cmd === 'search') {
            const query = args.slice(1).join(' ');
            if (!query) throw new Error('missing query argument');
            data = await search(query);
        } else if (cmd === 'suggest' || cmd === 'autocomplete') {
            const query = args.slice(1).join(' ');
            if (!query) throw new Error('missing query argument');
            data = await suggest(query);
        } else if (cmd === 'charts' || cmd === 'trending') {
            data = await charts();
        } else if (cmd === 'explore') {
            data = await explore();
        } else if (cmd === 'artist') {
            const id = args[1];
            if (!id) throw new Error('missing browse_id argument');
            data = await artist(id);
        } else if (cmd === 'lyrics' || cmd === 'lyric') {
            const id = args[1];
            if (!id) throw new Error('missing video_id_or_url argument');
            data = await lyrics(id);
        } else if (cmd === 'dl' || cmd === 'download' || cmd === 'mp3') {
            const id = args[1];
            if (!id) throw new Error('missing video_id_or_url argument');
            data = await download(id);
        } else {
            throw new Error(`unknown command: ${cmd}`);
        }

        console.log(JSON.stringify({
            Creator: 'IzzXd',
            Saluran: 'https://whatsapp.com/channel/0029VbDyL6d9RZAh3JjEM325',
            time: `${Date.now() - start}ms`,
            status: true,
            data
        }, null, 2));
    } catch (err) {
        console.log(JSON.stringify({
            Creator: 'IzzXd',
            Saluran: 'https://whatsapp.com/channel/0029VbDyL6d9RZAh3JjEM325',
            time: `${Date.now() - start}ms`,
            status: false,
            error: err.message
        }, null, 2));
    }
}

module.exports = {
    search,
    suggest,
    charts,
    explore,
    artist,
    lyrics,
    download,
    dl: download
};

if (require.main === module) {
    main();
}
