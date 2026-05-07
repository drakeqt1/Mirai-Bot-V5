/**
 * !fbpage — Facebook Page Auto-Post (Graph API — walang webhook!)
 * Posts messages to your Facebook PAGE using Page Access Token
 * TEAM STARTCOPE BETA · MIRAI BOT V6
 *
 * Usage:
 *   !fbpage on            — Start auto-posting to FB Page every ~30 min
 *   !fbpage off           — Stop auto-posting
 *   !fbpage post [msg]    — Post a custom message NOW to FB Page
 *   !fbpage status        — Check status + page info
 *   !fbpage token [token] — Update the Page Access Token (admin only)
 */

'use strict';
const fs   = require('fs-extra');
const path = require('path');
const bold = require('../../utils/bold');

const VERSION  = '1.0.0';
const TEAM     = 'TEAM STARTCOPE BETA';
const GV       = 'v19.0'; // Graph API version

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
  pageId:       null,
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
const pick   = a => a[Math.floor(Math.random() * a.length)];
const rand   = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const sleep  = ms => new Promise(r => setTimeout(r, ms));
function phHour() { return (new Date().getUTCHours() + 8) % 24; }
function inQuietWindow() { const h = phHour(); return h >= 1 && h < 5; }

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

// ── Post to FB Page ───────────────────────────────────────────────────────────
async function postToPage(message) {
  try {
    const token = getToken();
    if (!token) throw new Error('Walang token. Gamitin: !fbpage token [your_token]');

    // Post to the Page's feed via Graph API (no webhook needed)
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
];

function composeAutoPost() {
  const h   = phHour();
  const greet = h < 12 ? 'Magandang umaga' : h < 18 ? 'Magandang hapon' : 'Magandang gabi';
  const div = pick(DIVIDERS);
  const msg = pick(PAGE_MESSAGES);
  return `${greet}! 🌸\n\n${div}\n${msg}\n${div}\n\n🏷️ ${TEAM} · MIRAI BOT V6`;
}

// ── Auto-post scheduler ───────────────────────────────────────────────────────
let autoTimer = null;
let autoApi   = null;
let autoTid   = null;

async function runAutoPost() {
  if (!state.enabled) return;

  if (inQuietWindow()) {
    console.log('[FBPage] 🌙 Quiet window (1AM–5AM PH) — skipping post');
    scheduleAutoPost();
    return;
  }

  try {
    await sleep(rand(2000, 6000)); // pre-post human delay
    const message = composeAutoPost();
    const postId  = await postToPage(message);

    state.count++;
    state.lastPostedAt = new Date().toISOString();
    persist();
    console.log(`[FBPage #${state.count}] ✅ Posted to Facebook Page — ID: ${postId}`);

    // Save appstate after post
    try {
      if (autoApi) {
        const appstate = autoApi.getAppState();
        if (appstate && Array.isArray(appstate)) {
          fs.writeFileSync('./appstate.json', JSON.stringify(appstate, null, 2));
        }
      }
    } catch {}

  } catch (e) {
    console.error('[FBPage] ❌ Auto-post error:', e.message?.slice(0, 120));
    // Backoff on errors
    if (autoTimer) clearTimeout(autoTimer);
    autoTimer = setTimeout(runAutoPost, 10 * 60 * 1000);
    return;
  }

  scheduleAutoPost();
}

function scheduleAutoPost() {
  if (autoTimer) { clearTimeout(autoTimer); autoTimer = null; }
  if (!state.enabled) return;

  // Every ~30 min ± 8 min random jitter
  const delay = (30 * 60 * 1000) + (Math.random() - 0.5) * 2 * 8 * 60 * 1000;
  const mins  = Math.round(delay / 60000);
  console.log(`[FBPage] ⏱️ Next auto-post in ~${mins} min`);
  autoTimer = setTimeout(runAutoPost, delay);
}

function startAutoPost(api) {
  autoApi        = api;
  state.enabled  = true;
  persist();
  console.log('[FBPage] ✅ Auto-post started — every ~30 min to Facebook Page');
  autoTimer = setTimeout(runAutoPost, rand(10000, 30000)); // first post in 10–30 sec
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
  description:     'Auto-post to Facebook PAGE using Graph API token — walang webhook!',
  commandCategory: 'Admin',
  usages:          '[on | off | post <msg> | status | token <token>]',
  cooldowns:       5,
};

module.exports.onLoad = function ({ api }) {
  loadState();
  if (state.enabled) {
    autoApi = api;
    console.log('[FBPage] 🔄 Restored state — resuming auto-post...');
    setTimeout(scheduleAutoPost, 10000);
  }
};

module.exports.run = async function ({ api, event, args }) {
  const { threadID, messageID } = event;
  const P   = global.config?.PREFIX || '!';
  const sub = (args[0] || '').toLowerCase();

  // ── help / no args ──────────────────────────────────────────────────────────
  if (!sub || sub === 'help') {
    const token = getToken();
    const masked = token ? token.slice(0, 8) + '...' + token.slice(-6) : '❌ WALA';
    return api.sendMessage(
      `╔══════════════════════════════════╗\n` +
      `║  📘 ${bold('FBPAGE v' + VERSION)}               ║\n` +
      `║  🏷️  ${bold(TEAM)}   ║\n` +
      `╚══════════════════════════════════╝\n\n` +
      `📘 ${bold('Posts to Facebook PAGE via Graph API')}\n` +
      `🔑 ${bold('No webhook needed — Direct API only!')}\n\n` +
      `📋 ${bold('COMMANDS:')}\n${'─'.repeat(34)}\n` +
      `${P}fbpage on              — I-start auto-post\n` +
      `${P}fbpage off             — I-stop\n` +
      `${P}fbpage post [msg]      — Post NGAYON\n` +
      `${P}fbpage status          — Check status\n` +
      `${P}fbpage token [token]   — Update token\n\n` +
      `📊 ${bold('CURRENT STATUS:')}\n` +
      `  • ${bold('State:')}  ${state.enabled ? '🟢 AUTO-POST ON' : '🔴 OFF'}\n` +
      `  • ${bold('Token:')}  ${masked}\n` +
      `  • ${bold('Page:')}   ${state.pageName || '(di pa na-fetch)'}\n` +
      `  • ${bold('Posts:')}  ${state.count} total\n` +
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
      `  • ${bold('Auto-Post:')}  ${state.enabled ? '🟢 ON' : '🔴 OFF'}\n` +
      `  • ${bold('Page:')}       ${pageInfo?.name || state.pageName || (errMsg ? '❌ ' + errMsg.slice(0, 50) : 'N/A')}\n` +
      `  • ${bold('Page ID:')}    ${pageInfo?.id || state.pageId || 'N/A'}\n` +
      `  • ${bold('Fans:')}       ${pageInfo?.fan_count ? pageInfo.fan_count.toLocaleString() : 'N/A'}\n` +
      `  • ${bold('Token:')}      ${masked}\n` +
      `  • ${bold('API Ver:')}    Graph ${GV}\n` +
      `  • ${bold('PH Time:')}    ${String(h).padStart(2,'0')}:xx ${inQuietWindow() ? '🌙 Quiet' : '🟢 Active'}\n` +
      `  • ${bold('Total posts:')} ${state.count}\n` +
      `  • ${bold('Last post:')}  ${state.lastPostedAt ? new Date(state.lastPostedAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila' }) : 'N/A'}\n` +
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
      return api.sendMessage(`⚠️ ${bold('Naka-ON na ang FBPage auto-post.')}\nI-stop: ${P}fbpage off`, threadID, messageID);
    }
    // Verify token first
    api.sendMessage(`⏳ ${bold('Bine-verify ang token...')}`, threadID, messageID);
    try {
      const pageInfo = await fetchPageInfo();
      startAutoPost(api);
      return api.sendMessage(
        `✅ ${bold('FBPAGE AUTO-POST — STARTED!')}\n\n` +
        `📘 ${bold('Page:')}     ${pageInfo.name}\n` +
        `🆔 ${bold('Page ID:')} ${pageInfo.id}\n` +
        `⏱️ ${bold('Every:')}   ~30 min (±8 min jitter)\n` +
        `🌙 ${bold('Quiet:')}   1AM–5AM PH (skip)\n\n` +
        `🕒 ${bold('First post in 10–30 seconds...')}\n` +
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
