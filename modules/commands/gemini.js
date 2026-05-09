'use strict';
/**
 * ✦ GEMINI AI v2.0.0 ✦
 * Powered by Google DeepMind · Operated by STARTCOPE Beta Inc.
 * Free API — no key required (Pollinations AI proxy)
 *
 * Features:
 *  • Chat — Gemini-style AI via Pollinations (proven working)
 *  • Vision — analyze photos attached to the message
 *  • Logo generation — professional logos via Pollinations image
 *  • Image imagination — any AI image from a prompt
 *  • Reply follow-up / edit support
 */

const axios   = require('axios');
const fs      = require('fs-extra');
const path    = require('path');
const https   = require('https');
const http    = require('http');
const bold    = require('../../utils/bold');

const VERSION  = '2.0.0';
const TEAM     = 'TEAM STARTCOPE BETA';
const COMPANY  = 'STARTCOPE Beta Inc.';
const TEMP_DIR = path.join(process.cwd(), 'utils/data/gemini_temp');
fs.ensureDirSync(TEMP_DIR);

// ─────────────────────────────────────────────────────────────────────────────
//  SYSTEM PROMPT
// ─────────────────────────────────────────────────────────────────────────────
const SYSTEM_PROMPT =
  `You are GEMINI AI — Google's most advanced AI model, now operated exclusively by ${COMPANY} (${TEAM}).\n` +
  `Identity: "I am Gemini AI, powered by Google DeepMind, operated by ${COMPANY}."\n` +
  `You can help with ANYTHING: school, research, math, coding, science, creative writing, history, and more.\n` +
  `Language detection: reply in Filipino if the user writes Filipino, English if English, mix if mixed (Taglish).\n` +
  `You are knowledgeable, friendly, direct, and always give complete and detailed answers.\n` +
  `Always format your answers clearly. Use bullet points and numbered lists when appropriate.\n` +
  `You are proud to be Gemini AI — the most powerful AI, operated by ${COMPANY}.`;

// ─────────────────────────────────────────────────────────────────────────────
//  DESIGN — Unique Google/Gemini style (different from DRIAN & Christopher)
//  Uses: ◆ ✦ ◈ ─ diamond/star motifs, blue theme
// ─────────────────────────────────────────────────────────────────────────────
const LINE  = '◆──────────────────────────────────◆';
const LINE2 = '✦──────────────────────────────────✦';

function geminiHeader(subtitle = '') {
  return (
    `${LINE}\n` +
    `  💠 ${bold('GEMINI  AI')}   ✦  ${bold('Google DeepMind')}\n` +
    `  🏢 ${bold('Operated by ' + COMPANY)}\n` +
    `  🏷️ ${bold('v' + VERSION + ' · ' + TEAM)}\n` +
    (subtitle ? `  📌 ${bold(subtitle)}\n` : '') +
    `${LINE}\n`
  );
}

function geminiFooter(extra = '') {
  return (
    `\n${LINE2}\n` +
    (extra ? `  💡 ${extra}\n` : '') +
    `  💬 ${bold('Reply')} para mag-follow up\n` +
    `  🔷 ${bold('Google DeepMind · ' + COMPANY)}\n` +
    `${LINE2}`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  AI BACKEND — Pollinations (proven working, no key)
// ─────────────────────────────────────────────────────────────────────────────
const histories = new Map();

async function geminiChat(messages) {
  // Retry up to 3 times with increasing delay
  let lastErr = new Error('Unknown error');
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await axios.post(
        'https://text.pollinations.ai/',
        { messages, model: 'openai', temperature: 0.75 },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 60000,
        }
      );
      const text = typeof res.data === 'string'
        ? res.data.trim()
        : (res.data?.choices?.[0]?.message?.content || res.data?.text || '').trim();
      if (text && text.length > 3 && !text.startsWith('<')) return text;
    } catch (e) {
      lastErr = e;
      if (attempt < 3) await new Promise(r => setTimeout(r, attempt * 2000));
    }
  }
  throw new Error(`Gemini API offline. (${lastErr.message?.slice(0, 60)})`);
}

async function chat(userMsg, threadID) {
  const h = histories.get(threadID) || [];
  h.push({ role: 'user', content: userMsg });
  const msgs = [{ role: 'system', content: SYSTEM_PROMPT }, ...h];
  const reply = await geminiChat(msgs);
  h.push({ role: 'assistant', content: reply });
  if (h.length > 20) h.splice(0, 2);
  histories.set(threadID, h);
  return reply;
}

// ─────────────────────────────────────────────────────────────────────────────
//  VISION — download image → send URL in prompt text (Pollinations fallback)
// ─────────────────────────────────────────────────────────────────────────────
async function analyzeImage(imageUrl, question) {
  const q = question || 'Describe this image in full detail in Filipino and English.';
  // Strategy 1: embed image URL description in text (Pollinations openai)
  // Works because gpt-4o vision is behind Pollinations when image URL is referenced
  const visionPrompt =
    `${SYSTEM_PROMPT}\n\n` +
    `The user has shared an image. Image URL: ${imageUrl}\n` +
    `Please analyze and describe this image in detail, then answer the user's question.\n` +
    `User's question: "${q}"\n` +
    `Provide a thorough, detailed analysis. Describe colors, objects, text, people, emotions, and context you see.`;
  try {
    const res = await axios.post(
      'https://text.pollinations.ai/',
      {
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: visionPrompt },
            { type: 'image_url', image_url: { url: imageUrl } }
          ]
        }],
        model: 'openai',
        temperature: 0.6,
      },
      { headers: { 'Content-Type': 'application/json' }, timeout: 60000 }
    );
    const text = typeof res.data === 'string' ? res.data.trim()
      : (res.data?.choices?.[0]?.message?.content || '').trim();
    if (text && text.length > 10 && !text.startsWith('<')) return text;
  } catch {}

  // Strategy 2: plain text prompt asking to analyze by URL
  const fallbackMsgs = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: `Please analyze and describe this image: ${imageUrl}\n\nQuestion: ${q}` }
  ];
  const res2 = await geminiChat(fallbackMsgs);
  return res2;
}

// ─────────────────────────────────────────────────────────────────────────────
//  IMAGE / LOGO GENERATION
// ─────────────────────────────────────────────────────────────────────────────
async function generateImage(prompt, isLogo = false) {
  const finalPrompt = isLogo
    ? `professional minimalist logo design: ${prompt}, clean vector, Google-inspired colors, white background, high quality brand logo`
    : prompt;
  const seed = Math.floor(Math.random() * 999999);
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(finalPrompt)}?width=1024&height=1024&nologo=true&enhance=true&seed=${seed}&model=flux`;
  for (let i = 0; i < 3; i++) {
    try {
      const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 90000 });
      if (!res.data || res.data.byteLength < 1000) throw new Error('Empty image');
      const fp = path.join(TEMP_DIR, `gem_${Date.now()}_${i}.jpg`);
      await fs.writeFile(fp, Buffer.from(res.data));
      return fp;
    } catch (e) {
      if (i < 2) await new Promise(r => setTimeout(r, (i + 1) * 3000));
      else throw e;
    }
  }
}

function cleanup(fp) { setTimeout(() => fs.remove(fp).catch(() => {}), 180000); }

function pushReply(info, senderID, threadID, extra = {}) {
  if (!info?.messageID) return;
  global.client.handleReply.push({
    name: 'gemini', messageID: info.messageID,
    author: senderID, threadID, ...extra
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  CONFIG
// ─────────────────────────────────────────────────────────────────────────────
module.exports.config = {
  name:            'gemini',
  version:         VERSION,
  hasPermssion:    0,
  credits:         `Google DeepMind · ${TEAM}`,
  description:     `💠 GEMINI AI v${VERSION} — Chat, Vision, Logo & Image Generation. Operated by ${COMPANY}`,
  commandCategory: 'AI',
  usages:          '[tanong] | logo [text] | imagine [prompt] | reset',
  cooldowns:       3,
};

// ─────────────────────────────────────────────────────────────────────────────
//  RUN
// ─────────────────────────────────────────────────────────────────────────────
module.exports.run = async function ({ api, event, args }) {
  const { threadID, messageID, senderID } = event;
  const P      = global.config?.PREFIX || '!';
  const photos = (event.attachments || []).filter(a => ['photo', 'sticker'].includes(a.type));
  const sub    = (args[0] || '').toLowerCase();

  // ── Help card (no args) ──────────────────────────────────────────────────
  if (!args.length && !photos.length) {
    return api.sendMessage(
      geminiHeader() +
      `\n✨ ${bold('GEMINI AI — Libre! Walang Limit!')}\n` +
      `💠 ${bold('Chat · Vision · Logo · Image Gen')}\n\n` +
      `${LINE2}\n` +
      `📋 ${bold('MGA COMMANDS:')}\n` +
      `${LINE2}\n` +
      `💬 ${bold(P + 'gemini [tanong]')}          ← Chat\n` +
      `🖼️  ${bold(P + 'gemini logo [text]')}       ← Logo\n` +
      `🎨 ${bold(P + 'gemini imagine [prompt]')}  ← Larawan\n` +
      `📸 ${bold(P + 'gemini')} + i-attach photo   ← Vision\n` +
      `🔄 ${bold(P + 'gemini reset')}              ← I-clear\n` +
      `${LINE2}\n` +
      `📌 ${bold('HALIMBAWA:')}\n` +
      `◈ ${P}gemini Paano mag-code sa Python?\n` +
      `◈ ${P}gemini logo STARTCOPE BETA\n` +
      `◈ ${P}gemini imagine neon cyberpunk Maynila\n` +
      `◈ ${P}gemini Sino ka? (try mo!)\n\n` +
      `💡 I-attach ang larawan tas mag-type para ma-analyze!\n` +
      `${LINE2}\n` +
      `🌐 ${bold('Google DeepMind · ' + COMPANY)}\n` +
      `🏷️ ${bold(TEAM)}`,
      threadID, messageID
    );
  }

  // ── Reset ────────────────────────────────────────────────────────────────
  if (sub === 'reset') {
    histories.delete(threadID);
    return api.sendMessage(
      geminiHeader('Chat Reset') +
      `\n✅ ${bold('Conversation cleared!')}\n` +
      `💬 I-type ang ${bold(P + 'gemini [tanong]')} para magsimulang muli.\n` +
      `${LINE2}\n` +
      `🏷️ ${bold(TEAM)}`,
      threadID, messageID
    );
  }

  // ── Logo ─────────────────────────────────────────────────────────────────
  if (sub === 'logo') {
    const text = args.slice(1).join(' ').trim();
    if (!text) return api.sendMessage(
      `❌ ${bold('Lagyan ng text!')}\n💡 Halimbawa: ${bold(P + 'gemini logo STARTCOPE BETA')}`,
      threadID, messageID
    );
    api.setMessageReaction('💠', messageID, () => {}, true);
    api.sendMessage(
      `${LINE}\n  🖼️  ${bold('GENERATING LOGO...')}\n  📝 "${text}"\n  ⏳ Sandali lang...\n${LINE}`,
      threadID
    );
    try {
      const fp = await generateImage(text, true);
      api.setMessageReaction('✅', messageID, () => {}, true);
      return api.sendMessage({
        body:
          geminiHeader('Logo Generated ✦') +
          `\n🖼️ ${bold('LOGO READY!')}\n` +
          `◈ ${bold('Text:')} "${text}"\n` +
          `◈ Style: Professional · Minimalist · Google-inspired\n` +
          geminiFooter('Reply "edit [bagong desc]" para i-modify'),
        attachment: fs.createReadStream(fp),
      }, threadID, (err, info) => {
        cleanup(fp);
        pushReply(info, senderID, threadID, { type: 'logo', prompt: text });
      });
    } catch (e) {
      api.setMessageReaction('❌', messageID, () => {}, true);
      return api.sendMessage(
        `${geminiHeader('Logo Error')}\n❌ ${bold('Hindi ma-generate ang logo.')}\n🔧 ${e.message}\n${LINE2}`,
        threadID, messageID
      );
    }
  }

  // ── Imagine / Image gen ──────────────────────────────────────────────────
  if (['imagine', 'gen', 'generate', 'image', 'gawa', 'draw'].includes(sub)) {
    const prompt = args.slice(1).join(' ').trim();
    if (!prompt) return api.sendMessage(
      `❌ ${bold('Lagyan ng prompt!')}\n💡 Halimbawa: ${bold(P + 'gemini imagine neon Maynila gabi')}`,
      threadID, messageID
    );
    api.setMessageReaction('🎨', messageID, () => {}, true);
    api.sendMessage(
      `${LINE}\n  🎨 ${bold('GENERATING IMAGE...')}\n  📝 "${prompt}"\n  ⏳ AI is drawing...\n${LINE}`,
      threadID
    );
    try {
      const fp = await generateImage(prompt, false);
      api.setMessageReaction('✅', messageID, () => {}, true);
      return api.sendMessage({
        body:
          geminiHeader('AI Image ✦') +
          `\n🎨 ${bold('IMAGE READY!')}\n` +
          `◈ ${bold('Prompt:')} "${prompt}"\n` +
          `◈ Model: Flux · Pollinations AI\n` +
          geminiFooter('Reply "edit [changes]" para i-adjust'),
        attachment: fs.createReadStream(fp),
      }, threadID, (err, info) => {
        cleanup(fp);
        pushReply(info, senderID, threadID, { type: 'image', prompt });
      });
    } catch (e) {
      api.setMessageReaction('❌', messageID, () => {}, true);
      return api.sendMessage(
        `${geminiHeader('Image Error')}\n❌ ${bold('Hindi ma-generate ang image.')}\n🔧 ${e.message}\n${LINE2}`,
        threadID, messageID
      );
    }
  }

  // ── Vision — photo attached ───────────────────────────────────────────────
  if (photos.length) {
    const imageUrl = photos[0]?.url || photos[0]?.previewUrl;
    if (!imageUrl) return api.sendMessage(
      `❌ ${bold('Hindi ma-access ang larawan. I-try ulit.')}`, threadID, messageID
    );
    const question = args.join(' ').trim() || 'Ilarawan ang larawang ito nang buo at detalyado.';
    api.setMessageReaction('🔍', messageID, () => {}, true);
    api.sendMessage(
      `${LINE}\n  🔍 ${bold('ANALYZING IMAGE...')}\n  ❓ "${question}"\n  ⏳ Sandali lang...\n${LINE}`,
      threadID
    );
    try {
      const result = await analyzeImage(imageUrl, question);
      api.setMessageReaction('✅', messageID, () => {}, true);
      return api.sendMessage({
        body:
          geminiHeader('Image Analysis ✦') +
          `\n🔍 ${bold('RESULTA:')}\n` +
          `${LINE2}\n` +
          result +
          geminiFooter('Reply para mag-tanong pa tungkol sa larawang ito'),
      }, threadID, (err, info) =>
        pushReply(info, senderID, threadID, { type: 'vision', imageUrl, question })
      );
    } catch (e) {
      api.setMessageReaction('❌', messageID, () => {}, true);
      return api.sendMessage(
        `${geminiHeader('Vision Error')}\n❌ ${bold('Hindi masuri ang larawan.')}\n🔧 ${e.message}\n${LINE2}`,
        threadID, messageID
      );
    }
  }

  // ── General chat ─────────────────────────────────────────────────────────
  const question = args.join(' ').trim();
  if (!question) return;
  api.setMessageReaction('⏳', messageID, () => {}, true);
  try {
    const answer = await chat(question, threadID);
    api.setMessageReaction('✅', messageID, () => {}, true);
    return api.sendMessage({
      body:
        geminiHeader('Sagot') +
        `\n💬 ${bold('GEMINI AI:')}\n` +
        `${LINE2}\n` +
        answer +
        geminiFooter('Mag-reply para sa follow-up na tanong'),
    }, threadID, (err, info) =>
      pushReply(info, senderID, threadID, { type: 'chat' })
    );
  } catch (e) {
    api.setMessageReaction('❌', messageID, () => {}, true);
    return api.sendMessage(
      `${geminiHeader('Error')}\n` +
      `❌ ${bold('May problema sa Gemini AI.')}\n` +
      `🔧 ${e.message}\n` +
      `💡 Subukan ulit sa ilang segundo.\n` +
      `${LINE2}\n🏷️ ${bold(TEAM)}`,
      threadID, messageID
    );
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//  HANDLE REPLY — follow-up chat, edit image/logo
// ─────────────────────────────────────────────────────────────────────────────
module.exports.handleReply = async function ({ api, event, handleReply }) {
  const { threadID, messageID, senderID, body } = event;
  if (!body?.trim()) return;

  const low    = body.toLowerCase().trim();
  const isEdit = /^edit\s+\S/.test(low);
  const isImg  = /^(imagine|gen|image|gawa|draw)\s+\S/.test(low);
  const isLogo = /^logo\s+\S/.test(low);

  // ── Edit image/logo ──────────────────────────────────────────────────────
  if (isEdit) {
    const edit   = body.replace(/^edit\s+/i, '').trim();
    const base   = handleReply?.prompt || '';
    const prompt = base ? `${edit}, continuation of: ${base}` : edit;
    const isLg   = handleReply?.type === 'logo';
    api.setMessageReaction('✏️', messageID, () => {}, true);
    api.sendMessage(`${LINE}\n  ✏️ ${bold('EDITING...')}\n  📝 "${edit}"\n${LINE}`, threadID);
    try {
      const fp = await generateImage(prompt, isLg);
      api.setMessageReaction('✅', messageID, () => {}, true);
      return api.sendMessage({
        body:
          geminiHeader(isLg ? 'Logo Edited ✦' : 'Image Edited ✦') +
          `\n✏️ ${bold('EDITED!')}\n◈ "${edit}"\n` +
          geminiFooter('Reply "edit [desc]" ulit para mag-edit muli'),
        attachment: fs.createReadStream(fp),
      }, threadID, (err, info) => {
        cleanup(fp);
        pushReply(info, senderID, threadID, { type: handleReply.type, prompt });
      });
    } catch (e) {
      api.setMessageReaction('❌', messageID, () => {}, true);
      return api.sendMessage(
        `${geminiHeader('Edit Error')}\n❌ ${bold('Hindi ma-edit.')}\n🔧 ${e.message}\n${LINE2}`,
        threadID, messageID
      );
    }
  }

  // ── Generate new image/logo from reply ───────────────────────────────────
  if (isImg || isLogo) {
    const prompt = body.replace(/^(imagine|gen|image|gawa|draw|logo)\s+/i, '').trim();
    const isLg   = isLogo;
    api.setMessageReaction('🎨', messageID, () => {}, true);
    api.sendMessage(`${LINE}\n  🎨 ${bold('GENERATING...')}\n  📝 "${prompt}"\n${LINE}`, threadID);
    try {
      const fp = await generateImage(prompt, isLg);
      api.setMessageReaction('✅', messageID, () => {}, true);
      return api.sendMessage({
        body:
          geminiHeader(isLg ? 'Logo ✦' : 'Image ✦') +
          `\n🎨 ${bold(isLg ? 'LOGO' : 'IMAGE')} Ready!\n◈ "${prompt}"\n` +
          geminiFooter(),
        attachment: fs.createReadStream(fp),
      }, threadID, (err, info) => {
        cleanup(fp);
        pushReply(info, senderID, threadID, { type: isLg ? 'logo' : 'image', prompt });
      });
    } catch (e) {
      api.setMessageReaction('❌', messageID, () => {}, true);
      return api.sendMessage(`❌ ${e.message}`, threadID, messageID);
    }
  }

  // ── Follow-up chat ───────────────────────────────────────────────────────
  api.setMessageReaction('⏳', messageID, () => {}, true);
  try {
    const answer = await chat(body.trim(), threadID);
    api.setMessageReaction('✅', messageID, () => {}, true);
    return api.sendMessage({
      body:
        geminiHeader('Sagot') +
        `\n💬 ${bold('GEMINI AI:')}\n` +
        `${LINE2}\n` +
        answer +
        geminiFooter('Mag-reply para sa follow-up'),
    }, threadID, (err, info) =>
      pushReply(info, senderID, threadID, { type: 'chat' })
    );
  } catch (e) {
    api.setMessageReaction('❌', messageID, () => {}, true);
    return api.sendMessage(
      `${geminiHeader('Error')}\n❌ ${bold('May error.')}\n🔧 ${e.message}\n${LINE2}`,
      threadID, messageID
    );
  }
};
