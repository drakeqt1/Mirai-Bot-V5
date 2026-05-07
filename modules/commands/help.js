'use strict';
const axios = require('axios');
const bold  = require('../../utils/bold');

module.exports.config = {
  name:            'help',
  version:         '6.0.0',
  hasPermssion:    0,
  credits:         'TEAM STARTCOPE BETA',
  description:     'MIRAI V6 — Command list, bot info, and command details',
  commandCategory: 'General',
  usages:          '[command name | all | admin | categories]',
  cooldowns:       5,
  images:          [],
};

// ── Fetch ibb.co direct image URL ─────────────────────────────────────────────
async function getIbbDirect(pageUrl) {
  try {
    const { data: html } = await axios.get(pageUrl, { timeout: 6000 });
    const match = html.match(/property="og:image"\s+content="([^"]+)"/);
    if (match?.[1]) return match[1];
  } catch {}
  return null;
}

async function getBannerAttachment() {
  try {
    const direct = await getIbbDirect('https://ibb.co/4gZpB7tw');
    if (direct) {
      const stream = (await axios.get(direct, { responseType: 'stream', timeout: 10000 })).data;
      return stream;
    }
  } catch {}
  return null;
}

// ── Permission label ──────────────────────────────────────────────────────────
function permLabel(p) {
  return p === 0 ? '👤 Member'
       : p === 1 ? '⭐ Group Admin'
       : p === 2 ? '🌟 Bot Admin'
       : '👑 Owner';
}

// ── Category icon map ─────────────────────────────────────────────────────────
const CAT_ICONS = {
  general:       '🌐',
  admin:         '🔒',
  media:         '🎵',
  music:         '🎶',
  ai:            '🤖',
  utility:       '⚙️',
  fun:           '🎉',
  information:   'ℹ️',
  economy:       '💰',
  owner:         '👑',
  weather:       '🌤️',
  news:          '📰',
  social:        '📱',
  tools:         '🛠️',
  religion:      '✝️',
  auto:          '⚡',
  default:       '📂',
};

function catIcon(cat = '') {
  return CAT_ICONS[cat.toLowerCase()] || CAT_ICONS.default;
}

// ── Uptime formatter ──────────────────────────────────────────────────────────
function fmtUptime(s) {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ── Build category map ────────────────────────────────────────────────────────
function buildCategories(cmds) {
  const map = new Map();
  for (const cmd of cmds.values()) {
    const cat = (cmd.config.commandCategory || 'General').toLowerCase();
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat).push(cmd.config.name);
  }
  return map;
}

// ── Main run ──────────────────────────────────────────────────────────────────
module.exports.run = async function ({ api, event, args }) {
  const { threadID, messageID } = event;
  const cmds    = global.client.commands;
  const TIDdata = global.data.threadData.get(threadID) || {};
  const prefix  = TIDdata.PREFIX || global.config.PREFIX || '!';
  const botName = global.config.BOTNAME || 'Mirai-V6';
  const version = global.config.version  || '6.0.0';
  const sub     = (args[0] || '').toLowerCase();

  const banner = await getBannerAttachment();

  // ── !help all — full list ──────────────────────────────────────────────────
  if (sub === 'all') {
    let i = 0, msg = '';
    for (const cmd of cmds.values()) {
      msg += `${++i}. ${bold(cmd.config.name)}\n   📝 ${cmd.config.description}\n${'─'.repeat(28)}\n`;
    }
    return api.sendMessage({
      body:
        `╔════════════════════════════╗\n` +
        `║  📚 ${bold('ALL COMMANDS — ' + botName)}  ║\n` +
        `╚════════════════════════════╝\n\n` +
        msg +
        `\n📊 ${bold('Total:')} ${cmds.size} commands\n` +
        `🤖 ${bold('Bot:')} ${botName} v${version}\n` +
        `🏷️ ${bold('TEAM STARTCOPE BETA')}`,
      attachment: banner ? [banner] : undefined,
    }, threadID, messageID);
  }

  // ── !help categories ──────────────────────────────────────────────────────
  if (sub === 'categories') {
    const catMap = buildCategories(cmds);
    let msg = '';
    for (const [cat, names] of [...catMap.entries()].sort()) {
      msg += `\n${catIcon(cat)} ${bold(cat.toUpperCase())} (${names.length})\n  ${names.join(', ')}\n`;
    }
    return api.sendMessage({
      body:
        `╔══════════════════════════════╗\n` +
        `║  🗂️ ${bold('COMMAND CATEGORIES')}       ║\n` +
        `╚══════════════════════════════╝\n${msg}\n` +
        `📊 ${bold('Total:')} ${cmds.size} commands | ${catMap.size} categories`,
      attachment: banner ? [banner] : undefined,
    }, threadID, messageID);
  }

  // ── !help admin — admin-only commands ─────────────────────────────────────
  if (sub === 'admin') {
    const adminCmds = [...cmds.values()].filter(c => c.config.hasPermssion >= 2);
    let msg = '';
    adminCmds.forEach((c, i) => {
      msg += `${i + 1}. ${bold(c.config.name)} — ${c.config.description}\n   ${prefix}${c.config.usages}\n${'─'.repeat(28)}\n`;
    });
    return api.sendMessage({
      body:
        `╔══════════════════════════════╗\n` +
        `║  🔒 ${bold('ADMIN COMMANDS')}           ║\n` +
        `╚══════════════════════════════╝\n\n` +
        msg +
        `\n📊 ${bold('Total:')} ${adminCmds.length} admin commands`,
      attachment: banner ? [banner] : undefined,
    }, threadID, messageID);
  }

  // ── !help [command] — single command detail ────────────────────────────────
  if (sub && sub !== 'help') {
    if (!cmds.has(sub)) {
      // fuzzy match
      try {
        const ss    = require('string-similarity');
        const names = [...cmds.keys()];
        const best  = ss.findBestMatch(sub, names).bestMatch.target;
        return api.sendMessage(
          `❎ ${bold('Command not found:')} "${sub}"\n💡 ${bold('Did you mean:')} "${best}"\n\n` +
          `Gamitin: ${prefix}help ${best}`,
          threadID, messageID
        );
      } catch {
        return api.sendMessage(`❎ ${bold('Command not found:')} "${sub}"`, threadID, messageID);
      }
    }

    const cmd = cmds.get(sub).config;
    const imgs = cmd.images || [];
    let attachments = banner ? [banner] : [];
    for (const img of imgs) {
      try {
        const stream = (await axios.get(img, { responseType: 'stream', timeout: 10000 })).data;
        attachments.push(stream);
      } catch {}
    }

    return api.sendMessage({
      body:
        `╔═══════════════════════════╗\n` +
        `║  📖 ${bold('COMMAND INFO — V6')}     ║\n` +
        `╚═══════════════════════════╝\n\n` +
        `📌 ${bold('Name:')}        ${cmd.name}\n` +
        `👤 ${bold('Author:')}      ${cmd.credits}\n` +
        `🌾 ${bold('Version:')}     ${cmd.version}\n` +
        `🔐 ${bold('Permission:')}  ${permLabel(cmd.hasPermssion)}\n` +
        `📝 ${bold('Description:')} ${cmd.description}\n` +
        `🏷️ ${bold('Category:')}   ${cmd.commandCategory}\n` +
        `📎 ${bold('Usage:')}       ${prefix}${cmd.usages}\n` +
        `⏳ ${bold('Cooldown:')}    ${cmd.cooldowns}s\n` +
        `\n🏷️ ${bold('TEAM STARTCOPE BETA')} · MIRAI V6`,
      attachment: attachments.length ? attachments : undefined,
    }, threadID, messageID);
  }

  // ── !help — main menu ─────────────────────────────────────────────────────
  const catMap  = buildCategories(cmds);
  const uptimeSec = Math.round(process.uptime());
  const mem     = Math.round(process.memoryUsage().rss / 1024 / 1024);

  let catSection = '';
  for (const [cat, names] of [...catMap.entries()].sort()) {
    catSection +=
      `│\n` +
      `│ ${catIcon(cat)} ${bold(cat.toUpperCase())}\n` +
      `├──────────────────────⭔\n` +
      `│ 📊 ${names.length} commands\n` +
      `│ ${names.join(', ')}\n` +
      `├──────────────────────⭔\n`;
  }

  const footer =
    `\n📊 ${bold('Commands:')}  ${cmds.size} loaded\n` +
    `⏱️ ${bold('Uptime:')}    ${fmtUptime(uptimeSec)}\n` +
    `💾 ${bold('Memory:')}    ${mem} MB\n` +
    `🤖 ${bold('Bot:')}       ${botName} v${version}\n` +
    `👑 ${bold('Admin:')}     Manuelson Yasis\n` +
    `🔗 ${bold('FB:')}        facebook.com/manuelson.yasis\n` +
    `🏷️ ${bold('Team:')}      TEAM STARTCOPE BETA\n\n` +
    `💡 ${prefix}help [command]   → command details\n` +
    `💡 ${prefix}help all         → full command list\n` +
    `💡 ${prefix}help categories  → by category\n` +
    `💡 ${prefix}help admin       → admin commands`;

  return api.sendMessage({
    body:
      `╔══════════════════════════════════╗\n` +
      `║  🤖 ${bold('MIRAI BOT V6')} — ${bold('CMD MENU')}   ║\n` +
      `║  ⚡ ${bold('30-Layer Anti-Detect Protection')}║\n` +
      `║  🏷️  ${bold('TEAM STARTCOPE BETA')}          ║\n` +
      `╚══════════════════════════════════╝\n\n` +
      `╭──────────────────────⭓\n` +
      catSection +
      `│\n╰──────────────────────⭓\n` +
      footer,
    attachment: banner ? [banner] : undefined,
  }, threadID);
};
