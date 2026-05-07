/**
 * !fbpage — Facebook Page Auto-Post (Graph API — walang webhook!)
 * Posts messages to your Facebook PAGE using Page Access Token
 * TEAM STARTCOPE BETA · MIRAI BOT V6
 *
 * Posts every 4 MINUTES · 24/7 walang tigil · No quiet window
 *
 * Usage:
 *   !fbpage on            — Start auto-posting to FB Page every ~4 min
 *   !fbpage off           — Stop auto-posting
 *   !fbpage post [msg]    — Post a custom message NOW to FB Page
 *   !fbpage status        — Check status + page info
 *   !fbpage token [token] — Update the Page Access Token (admin only)
 */

'use strict';
const fs   = require('fs-extra');
const path = require('path');
const bold = require('../../utils/bold');

const VERSION  = '2.0.0';
const TEAM     = 'TEAM STARTCOPE BETA';
const GV       = 'v19.0';

// Post every 4 minutes — 24/7 walang tigil
const POST_INTERVAL = 4 * 60 * 1000;

const STATE_FILE = path.join(process.cwd(), 'utils/data/fbpage_state.json');
const TOKEN_FILE = path.join(process.cwd(), 'utils/data/fbpage_token.json');
fs.ensureDirSync(path.dirname(STATE_FILE));

// ── Token management ──────────────────────────────────────────────────────────
function getToken() {
  try {
    if (fs.existsSync(TOKEN_FILE)) {
      const d = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
      if (d.token) return d.token;
    }
  } catch {}
  return global.config?.FB_PAGE_TOKEN || process.env.FB_PAGE_TOKEN || '';
}

function saveToken(token) {
  try { fs.writeFileSync(TOKEN_FILE, JSON.stringify({ token, updatedAt: new Date().toISOString() }, null, 2)); } catch {}
}

// ── State persistence ─────────────────────────────────────────────────────────
let state = {
  enabled:      false,
  count:        0,
  lastPostedAt: null,
  pageId:       '861415117054346',
  pageName:     null,
};

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const d = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      Object.assign(state, d);
    }
  } catch {}
}
function persist() {
  try { fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2)); } catch {}
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const pick  = a => a[Math.floor(Math.random() * a.length)];
const rand  = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const sleep = ms => new Promise(r => setTimeout(r, ms));

function phHour() { return (new Date().getUTCHours() + 8) % 24; }

// ── Graph API caller ──────────────────────────────────────────────────────────
async function graphPost(endpoint, params) {
  const axios = require('axios');
  const token = getToken();
  if (!token) throw new Error('Walang FB_PAGE_TOKEN. Gamitin: !fbpage token [your_token]');

  const url = `https://graph.facebook.com/${GV}/${endpoint}`;
  const res = await axios.post(url, null, {
    params: { ...params, access_token: token },
    timeout: 30000,
  });
  return res.data;
}

async function graphGet(endpoint, params = {}) {
  const axios = require('axios');
  const token = getToken();
  if (!token) throw new Error('Walang FB_PAGE_TOKEN.');

  const url = `https://graph.facebook.com/${GV}/${endpoint}`;
  const res = await axios.get(url, {
    params: { ...params, access_token: token },
    timeout: 15000,
  });
  return res.data;
}

// ── Get page info ─────────────────────────────────────────────────────────────
async function fetchPageInfo() {
  try {
    const data = await graphGet('me', { fields: 'id,name,fan_count,link' });
    state.pageId   = data.id;
    state.pageName = data.name;
    persist();
    return data;
  } catch (e) {
    throw new Error(`Hindi ma-fetch ang page info: ${e.response?.data?.error?.message || e.message}`);
  }
}

// ── Check token permissions ───────────────────────────────────────────────────
async function fetchTokenPerms() {
  try {
    const data = await graphGet('me/permissions');
    return (data.data || []).filter(p => p.status === 'granted').map(p => p.permission);
  } catch { return []; }
}

// ── Post to FB Page ───────────────────────────────────────────────────────────
async function postToPage(message) {
  try {
    const token = getToken();
    if (!token) throw new Error('Walang token. Gamitin: !fbpage token [your_token]');

    // Use me/feed — with a Page Access Token, "me" = the Page itself
    const data = await graphPost('me/feed', { message });
    return data.id || data.post_id || 'posted';
  } catch (e) {
    const msg = e.response?.data?.error?.message || e.message;
    throw new Error(msg);
  }
}

// ── Auto-post message pool ────────────────────────────────────────────────────
const DIVIDERS = [
  '━━━━━━━━━━━━━━━━━━━━━━━━',
  '═══════════════════════',
  '◆◇◆◇◆◇◆◇◆◇◆◇◆◇◆◇◆',
  '✦ ✦ ✦ ✦ ✦ ✦ ✦ ✦ ✦ ✦',
  '•───────────────────•',
];

const PAGE_MESSAGES = [
  '🎵 HOME RADIO 95.1 NAGA ay LIVE na sa online!\n\n📡 Makinig ng libre:\nhttps://hrmanila.radioca.st/stream\n\n📍 Gawad Kalinga, Naga City\n🌟 2026 — Ang Aming Pagbabalik!\n\n#HomeRadioNaga #MorNaga #NagaCity',
  '🔴 LIVE na ang HOME RADIO 95.1 NAGA!\n\n🎙️ Pakinggan mo na ang iyong paboritong radio station!\n👉 https://hrmanila.radioca.st/stream\n\n24/7 · Libre · Walang bayad!\n\n#HomeRadio #Naga #95dot1',
  '📻 Kumusta ka? 😊\n\nAng HOME RADIO 95.1 NAGA ay online na!\nI-click para makinig ng LIVE:\nhttps://hrmanila.radioca.st/stream\n\n🏷️ TEAM STARTCOPE BETA · MOR NAGA\n\n#HomeRadioNaga #LiveRadio #Philippines',
  '🌟 ANG PAGBABALIK — HOME RADIO 95.1 NAGA!\n\n🎵 Online live ngayon sa:\nhttps://hrmanila.radioca.st/stream\n\n📍 Gawad Kalinga, Naga City · 2026\n\n#NagaCity #HomeRadio #Libre',
  '🎶 Magandang araw mula sa HOME RADIO 95.1 NAGA!\n\nMakinig ng LIBRE — 24/7 LIVE:\nhttps://hrmanila.radioca.st/stream\n\n🙌 Salamat sa inyong suporta!\n\n#HomeRadioNaga #MorNaga',
  '📡 STREAMING NA! HOME RADIO 95.1 NAGA\n\n🎵 Online at libre para sa lahat!\nhttps://hrmanila.radioca.st/stream\n\n💚 I-share sa mga kaibigan mo!\n\n#HomeRadio951 #NagaCity #StreamNow',
  '🔥 NAGA CITY — HOME RADIO 95.1 ay BUKAS!\n\n📻 24/7 Live Streaming:\nhttps://hrmanila.radioca.st/stream\n\n❤️ Para sa lahat ng Nagueño!\n\n#HomeRadioNaga #951Naga #FreeListen',
  '🎙️ I-TUNE IN NA KAY HOME RADIO 95.1 NAGA!\n\n🌐 Online Stream (LIBRE):\nhttps://hrmanila.radioca.st/stream\n\n📍 Gawad Kalinga, Naga City\n🇵🇭 TEAM STARTCOPE BETA\n\n#MorNaga #HomeRadio #Philippines',
  '💚 SUPORTAHAN NATIN ANG HOME RADIO 95.1 NAGA!\n\n📻 Live online stream:\nhttps://hrmanila.radioca.st/stream\n\n🎵 Musika, balita, at entertainment — libre!\n\n#HomeRadio #NagaCity #Libre',
  '🌅 MAGANDANG ARAW MULA SA HOME RADIO 95.1 NAGA!\n\n🎵 Simulan ang iyong araw sa tamang musika!\nLIVE: https://hrmanila.radioca.st/stream\n\n#MorNaga #HomeRadio951 #GoodVibes',
  '🙏 MAHAL KA NG DIYOS!\n\nHindi ka nag-iisa sa iyong mga pagsubok. Ang Diyos ay laging kasama mo.\n\n"Sapagkat gayon na lamang ang pagmamahal ng Diyos sa sanlibutan, na ibinigay Niya ang Kanyang bugtong na Anak." — Juan 3:16\n\n✝️ Huwag kailanman sumuko. ❤️\n\n#HomeRadioNaga #Faith #Philippines',
  '✝️ HESUS AY KASAMA MO NGAYON.\n\nKahit parang mag-isa ka — hindi ka tunay na nag-iisa. Si Hesus ay nakakaalam ng bawat hirap mo.\n\n"Ako ay lagi ninyong kasama, hanggang sa katapusan ng sanlibutan." — Mateo 28:20\n\n📻 HOME RADIO 95.1 NAGA LIVE:\nhttps://hrmanila.radioca.st/stream',
  '🌟 MAY PLANO ANG DIYOS PARA SA IYO!\n\n"Sapagkat alam Ko ang mga plano Ko para sa inyo, mga plano para sa kapakanan." — Jeremias 29:11\n\n✝️ Magtiwala sa Kanya!\n\n📻 Pakinggan ang HOME RADIO 95.1 NAGA:\nhttps://hrmanila.radioca.st/stream\n\n#MorNaga #Faith #NagaCity',
  '💪 LABAN PA TAYO!\n\nAng buhay ay puno ng pagsubok, ngunit ang Diyos ay mas dakila sa lahat ng problema mo.\n\n🙏 Manalangin. Magtiwala. Huwag sumuko.\n\n📻 HOME RADIO 95.1 NAGA — kasama mo araw at gabi:\nhttps://hrmanila.radioca.st/stream',
  '🇵🇭 PARA SA BAWAT PILIPINO NA NAGBABASA NITO:\n\nAng Diyos ay nagmamahal sa iyo — kahit nasaan ka man ngayon.\n\nMagtiwala. Manalangin. Huwag sumuko. ✝️❤️🙏\n\n📻 SAMAHAN MO KAMI SA HOME RADIO 95.1 NAGA:\nhttps://hrmanila.radioca.st/stream\n\n#HomeRadioNaga #Philippines',
];

function composeAutoPost() {
  const h      = phHour();
  const greet  = h < 12 ? 'Magandang umaga' : h < 18 ? 'Magandang hapon' : 'Magandang gabi';
  const div    = pick(DIVIDERS);
  const msg    = pick(PAGE_MESSAGES);
  const now    = new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' });
  return `${greet}! 🌸\n\n${div}\n${msg}\n${div}\n\n📅 ${now} PH\n🏷️ ${TEAM} · MIRAI BOT V6`;
}

// ── Auto-post scheduler ───────────────────────────────────────────────────────
let autoTimer = null;
let autoApi   = null;

async function runAutoPost() {
  if (!state.enabled) return;

  try {
    await sleep(rand(1000, 4000)); // short human-like delay
    const message = composeAutoPost();
    const postId  = await postToPage(message);

    state.count++;
    state.lastPostedAt = new Date().toISOString();
    persist();
    console.log(`[FBPage #${state.count}] ✅ Posted to FB Page (ID: ${state.pageId}) — Post: ${postId}`);

  } catch (e) {
    const errMsg = e.response?.data?.error?.message || e.message || String(e);
    console.error('[FBPage] ❌ Auto-post error:', errMsg?.slice(0, 120));

    // On token/auth error, stop and warn
    if (errMsg.toLowerCase().includes('token') || errMsg.toLowerCase().includes('session') || errMsg.toLowerCase().includes('auth')) {
      console.error('[FBPage] 🔒 Token issue — auto-post paused. Use !fbpage token [new_token] to update.');
      // Retry in 15 min for token errors
      if (autoTimer) clearTimeout(autoTimer);
      autoTimer = setTimeout(runAutoPost, 15 * 60 * 1000);
      return;
    }

    // Generic error — back off 10 min then retry
    if (autoTimer) clearTimeout(autoTimer);
    autoTimer = setTimeout(runAutoPost, 10 * 60 * 1000);
    return;
  }

  scheduleAutoPost();
}

function scheduleAutoPost() {
  if (autoTimer) { clearTimeout(autoTimer); autoTimer = null; }
  if (!state.enabled) return;

  // Every 4 minutes ± 30 sec random jitter (anti-detect)
  const jitter = (Math.random() - 0.5) * 2 * 30000;
  const delay  = POST_INTERVAL + jitter;
  const secs   = Math.round(delay / 1000);
  console.log(`[FBPage] ⏱️ Next auto-post in ~${secs}s (Page: ${state.pageId})`);
  autoTimer = setTimeout(runAutoPost, delay);
}

function startAutoPost(api) {
  autoApi        = api;
  state.enabled  = true;
  persist();
  console.log('[FBPage] ✅ Auto-post STARTED — every ~4 min · 24/7 walang tigil · Page: ' + state.pageId);
  autoTimer = setTimeout(runAutoPost, rand(5000, 15000)); // first post in 5–15 sec
}

function stopAutoPost() {
  if (autoTimer) { clearTimeout(autoTimer); autoTimer = null; }
  state.enabled = false;
  persist();
  console.log('[FBPage] 🛑 Auto-post stopped');
}

// ── Command config ────────────────────────────────────────────────────────────
module.exports.config = {
  name:            'fbpage',
  version:         VERSION,
  hasPermssion:    2,
  credits:         TEAM,
  description:     'Auto-post to Facebook PAGE every 4 min · 24/7 · walang webhook!',
  commandCategory: 'Admin',
  usages:          '[on | off | post <msg> | status | token <token>]',
  cooldowns:       5,
};

module.exports.onLoad = function ({ api }) {
  loadState();

  // Always auto-start if token exists
  const token = getToken();
  if (token) {
    autoApi = api;
    state.enabled = true;
    persist();
    console.log('[FBPage] 🔄 Token found — auto-starting FB Page poster (every 4 min, 24/7)...');
    setTimeout(() => startAutoPost(api), rand(8000, 20000)); // start after 8–20 sec (let bot settle)
  } else {
    console.log('[FBPage] ⚠️ No FB_PAGE_TOKEN found — use !fbpage token [token] to set it.');
  }
};

module.exports.run = async function ({ api, event, args }) {
  const { threadID, messageID } = event;
  const P   = global.config?.PREFIX || '!';
  const sub = (args[0] || '').toLowerCase();

  // ── help / no args ──────────────────────────────────────────────────────────
  if (!sub || sub === 'help') {
    const token  = getToken();
    const masked = token ? token.slice(0, 8) + '...' + token.slice(-6) : '❌ WALA';
    return api.sendMessage(
      `╔══════════════════════════════════╗\n` +
      `║  📘 ${bold('FBPAGE v' + VERSION)}               ║\n` +
      `║  🏷️  ${bold(TEAM)}   ║\n` +
      `╚══════════════════════════════════╝\n\n` +
      `📘 ${bold('Posts to Facebook PAGE via Graph API')}\n` +
      `🔑 ${bold('No webhook needed — Direct API only!')}\n` +
      `⏱️ ${bold('Every ~4 MINUTES · 24/7 walang tigil!')}\n\n` +
      `📋 ${bold('COMMANDS:')}\n${'─'.repeat(34)}\n` +
      `${P}fbpage on              — I-start auto-post\n` +
      `${P}fbpage off             — I-stop\n` +
      `${P}fbpage post [msg]      — Post NGAYON\n` +
      `${P}fbpage status          — Check status\n` +
      `${P}fbpage token [token]   — Update token\n\n` +
      `📊 ${bold('CURRENT STATUS:')}\n` +
      `  • ${bold('State:')}   ${state.enabled ? '🟢 AUTO-POST ON (4 min)' : '🔴 OFF'}\n` +
      `  • ${bold('Token:')}   ${masked}\n` +
      `  • ${bold('Page ID:')} ${state.pageId || 'N/A'}\n` +
      `  • ${bold('Page:')}    ${state.pageName || '(di pa na-fetch)'}\n` +
      `  • ${bold('Posts:')}   ${state.count} total\n` +
      `\n🔒 ${bold('Admin only')} | Graph API ${GV}`,
      threadID, messageID
    );
  }

  // ── token update ────────────────────────────────────────────────────────────
  if (sub === 'token') {
    const newToken = args.slice(1).join('').trim();
    if (!newToken) {
      return api.sendMessage(
        `❓ ${bold('Paano gamitin:')}\n${P}fbpage token [your_page_access_token]\n\n` +
        `💡 Makuha ang token sa:\nfacebook.com/developers → Graph API Explorer → Generate Token`,
        threadID, messageID
      );
    }
    saveToken(newToken);
    const masked = newToken.slice(0, 8) + '...' + newToken.slice(-6);
    return api.sendMessage(
      `✅ ${bold('Page Access Token na-update!')}\n\nToken: ${masked}\n\n` +
      `💡 I-try: ${P}fbpage status para i-verify ang token.`,
      threadID, messageID
    );
  }

  // ── status ──────────────────────────────────────────────────────────────────
  if (sub === 'status') {
    let pageInfo = null;
    let errMsg   = '';
    try {
      pageInfo = await fetchPageInfo();
    } catch (e) {
      errMsg = e.message;
    }

    const token  = getToken();
    const masked = token ? token.slice(0, 8) + '...' + token.slice(-6) : '❌ WALA';
    const h      = phHour();

    return api.sendMessage(
      `📊 ${bold('FBPAGE STATUS')}\n${'─'.repeat(34)}\n` +
      `  • ${bold('Auto-Post:')}   ${state.enabled ? '🟢 ON (every ~4 min)' : '🔴 OFF'}\n` +
      `  • ${bold('Mode:')}        24/7 walang tigil\n` +
      `  • ${bold('Page:')}        ${pageInfo?.name || state.pageName || (errMsg ? '❌ ' + errMsg.slice(0, 50) : 'N/A')}\n` +
      `  • ${bold('Page ID:')}     ${pageInfo?.id || state.pageId || 'N/A'}\n` +
      `  • ${bold('Fans:')}        ${pageInfo?.fan_count ? pageInfo.fan_count.toLocaleString() : 'N/A'}\n` +
      `  • ${bold('Token:')}       ${masked}\n` +
      `  • ${bold('API Ver:')}     Graph ${GV}\n` +
      `  • ${bold('PH Time:')}     ${String(h).padStart(2,'0')}:xx\n` +
      `  • ${bold('Total posts:')} ${state.count}\n` +
      `  • ${bold('Last post:')}   ${state.lastPostedAt ? new Date(state.lastPostedAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila' }) : 'N/A'}\n` +
      `\n🏷️ ${bold(TEAM)} · MIRAI BOT V6`,
      threadID, messageID
    );
  }

  // ── on ──────────────────────────────────────────────────────────────────────
  if (sub === 'on') {
    const token = getToken();
    if (!token) {
      return api.sendMessage(
        `❌ ${bold('Walang Page Access Token!')}\n\n` +
        `I-set muna gamit:\n${P}fbpage token [your_token]\n\n` +
        `💡 Kunin sa facebook.com/developers → Graph API Explorer`,
        threadID, messageID
      );
    }
    if (state.enabled) {
      return api.sendMessage(`⚠️ ${bold('Naka-ON na ang FBPage auto-post (every 4 min).')}\nI-stop: ${P}fbpage off`, threadID, messageID);
    }
    api.sendMessage(`⏳ ${bold('Bine-verify ang token...')}`, threadID, messageID);
    try {
      const pageInfo = await fetchPageInfo();
      startAutoPost(api);
      return api.sendMessage(
        `✅ ${bold('FBPAGE AUTO-POST — STARTED! 🔥')}\n\n` +
        `📘 ${bold('Page:')}     ${pageInfo.name}\n` +
        `🆔 ${bold('Page ID:')} ${pageInfo.id}\n` +
        `⏱️ ${bold('Every:')}   ~4 MINUTO · 24/7 walang tigil!\n` +
        `🌙 ${bold('Quiet:')}   WALA — non-stop 24 oras!\n\n` +
        `🕒 ${bold('First post in 5–15 seconds...')}\n` +
        `💡 I-stop: ${P}fbpage off\n🏷️ ${bold(TEAM)}`,
        threadID, messageID
      );
    } catch (e) {
      return api.sendMessage(
        `❌ ${bold('Invalid token o walang page access:')}\n${e.message?.slice(0, 150)}\n\n` +
        `💡 I-update ang token: ${P}fbpage token [new_token]`,
        threadID, messageID
      );
    }
  }

  // ── off ─────────────────────────────────────────────────────────────────────
  if (sub === 'off') {
    if (!state.enabled) {
      return api.sendMessage(`⚠️ ${bold('Hindi naman naka-ON ang FBPage.')}`, threadID, messageID);
    }
    stopAutoPost();
    return api.sendMessage(
      `🛑 ${bold('FBPAGE AUTO-POST — STOPPED!')}\n\n` +
      `📊 ${bold('Total na nai-post:')} ${state.count}\n` +
      `💡 I-on ulit: ${P}fbpage on\n🏷️ ${bold(TEAM)}`,
      threadID, messageID
    );
  }

  // ── post <message> ──────────────────────────────────────────────────────────
  if (sub === 'post') {
    const customMsg = args.slice(1).join(' ').trim();
    if (!customMsg) {
      return api.sendMessage(`❓ ${bold('Paano:')} ${P}fbpage post [iyong mensahe]`, threadID, messageID);
    }
    const token = getToken();
    if (!token) {
      return api.sendMessage(
        `❌ ${bold('Walang token!')} I-set muna: ${P}fbpage token [token]`,
        threadID, messageID
      );
    }

    api.sendMessage(`⏳ ${bold('Nag-po-post sa Facebook Page...')}`, threadID, messageID);
    try {
      const postId = await postToPage(customMsg);
      state.count++;
      state.lastPostedAt = new Date().toISOString();
      persist();
      return api.sendMessage(
        `✅ ${bold('NA-POST SA FACEBOOK PAGE!')}\n\n` +
        `📘 ${bold('Page:')}     ${state.pageName || 'Your Page'}\n` +
        `🆔 ${bold('Page ID:')} ${state.pageId}\n` +
        `🆔 ${bold('Post ID:')} ${postId}\n` +
        `📝 ${bold('Message:')} ${customMsg.slice(0, 80)}${customMsg.length > 80 ? '...' : ''}\n\n` +
        `🏷️ ${bold(TEAM)}`,
        threadID, messageID
      );
    } catch (e) {
      return api.sendMessage(
        `❌ ${bold('Post failed:')}\n${e.message?.slice(0, 200)}\n\n` +
        `💡 Siguraduhing may 'pages_manage_posts' permission ang token.`,
        threadID, messageID
      );
    }
  }

  return api.sendMessage(
    `❓ ${bold('Paano gamitin:')}\n${P}fbpage [on|off|post <msg>|status|token <token>]`,
    threadID, messageID
  );
};
