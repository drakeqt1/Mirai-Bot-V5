/**
 * !faceswap — Swap faces between two images using free HuggingFace Gradio AI
 * No API key required — uses public HF Spaces
 *
 * Usage:
 *   Method 1: Reply to someone's image with !faceswap + attach your face photo
 *   Method 2: !faceswap + attach 2 photos (first=target, second=face source)
 *   Method 3: !faceswap — bot asks you to send 2 photos
 */

const axios    = require('axios');
const fs       = require('fs-extra');
const path     = require('path');
const bold     = require('../../utils/bold');

const TEMP_DIR = path.join(process.cwd(), 'utils/data/faceswap_temp');
fs.ensureDirSync(TEMP_DIR);

const cleanup = (fp) => setTimeout(() => fs.remove(fp).catch(() => {}), 300000);
const UA      = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36';

// ── Download image from URL to temp file ─────────────────────────────────────
async function downloadImage(url) {
  const fp = path.join(TEMP_DIR, `img_${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`);
  const { data } = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 30000,
    headers: { 'User-Agent': UA },
  });
  fs.writeFileSync(fp, Buffer.from(data));
  return fp;
}

// ── Convert image file to base64 string ──────────────────────────────────────
function toBase64(fp) {
  const ext  = path.extname(fp).toLowerCase().replace('.', '') || 'jpeg';
  const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
  return `data:${mime};base64,${fs.readFileSync(fp).toString('base64')}`;
}

// ── HuggingFace Gradio face swap — tries multiple free spaces ────────────────
const HF_SPACES = [
  {
    // InsightFace inswapper — most reliable
    url: 'https://ezioruan-inswapper.hf.space/run/predict',
    fn_index: 0,
    // data: [source_face, target_body]
    build: (face64, target64) => ({ fn_index: 0, data: [face64, target64] }),
    extract: (d) => d?.data?.[0],
  },
  {
    // felixrosberg face swap FSGAN
    url: 'https://felixrosberg-face-swap.hf.space/run/predict',
    fn_index: 0,
    build: (face64, target64) => ({ fn_index: 0, data: [face64, target64, 0, false] }),
    extract: (d) => d?.data?.[0],
  },
  {
    // mindstem face swap
    url: 'https://mindstem-face-swap.hf.space/run/predict',
    fn_index: 0,
    build: (face64, target64) => ({ fn_index: 0, data: [target64, face64] }),
    extract: (d) => d?.data?.[0],
  },
];

async function doFaceSwap(faceFp, targetFp) {
  const face64   = toBase64(faceFp);
  const target64 = toBase64(targetFp);

  for (const space of HF_SPACES) {
    try {
      console.log(`[FaceSwap] Trying ${space.url}...`);
      const res = await axios.post(
        space.url,
        space.build(face64, target64),
        {
          timeout: 120000,
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': UA,
            'Accept': '*/*',
          },
        }
      );
      const result = space.extract(res.data);
      if (!result) throw new Error('Empty result from space');

      // Result is either a base64 data URL or a plain URL
      const outFp = path.join(TEMP_DIR, `swapped_${Date.now()}.jpg`);

      if (typeof result === 'string' && result.startsWith('data:')) {
        // base64 data URL → save directly
        const b64 = result.split(',')[1];
        fs.writeFileSync(outFp, Buffer.from(b64, 'base64'));
      } else if (typeof result === 'string' && result.startsWith('http')) {
        // Remote URL → download it
        const { data: imgData } = await axios.get(result, {
          responseType: 'arraybuffer', timeout: 30000, headers: { 'User-Agent': UA },
        });
        fs.writeFileSync(outFp, Buffer.from(imgData));
      } else if (result?.name || result?.url) {
        // Gradio file object
        const fileUrl = result.url || `${space.url.replace('/run/predict', '')}/file=${result.name}`;
        const { data: imgData } = await axios.get(fileUrl, {
          responseType: 'arraybuffer', timeout: 30000, headers: { 'User-Agent': UA },
        });
        fs.writeFileSync(outFp, Buffer.from(imgData));
      } else {
        throw new Error('Unrecognised result format');
      }

      if (!fs.existsSync(outFp) || fs.statSync(outFp).size < 5000) {
        throw new Error('Output file too small — likely failed');
      }

      console.log(`[FaceSwap] ✅ Success via ${space.url}`);
      return outFp;

    } catch (e) {
      console.log(`[FaceSwap] ❌ ${space.url} → ${e.message?.slice(0, 80)}`);
    }
  }
  throw new Error('All face swap services are currently busy. Try again in a minute.');
}

// ── Extract Facebook image attachment URLs ────────────────────────────────────
function getAttachmentUrls(event) {
  const urls = [];
  const atts = event.attachments || [];
  for (const att of atts) {
    const url = att.largePreviewUrl || att.previewUrl || att.url || att.playbackUrl;
    if (url) urls.push(url);
  }
  return urls;
}

// ── Pending handleReply sessions ──────────────────────────────────────────────
const pending = new Map(); // messageID → { threadID, step, firstImageFp }

// ── Module config ─────────────────────────────────────────────────────────────
module.exports.config = {
  name:            'faceswap',
  version:         '1.0.0',
  hasPermssion:    0,
  credits:         'TEAM STARTCOPE BETA',
  description:     'AI Face Swap — upload 2 images, bot swaps the faces. FREE, no API key.',
  commandCategory: 'Fun',
  usages:          '(reply to image + attach face photo) | (attach 2 photos) | (no args → step-by-step)',
  cooldowns:       20,
};

module.exports.handleReply = async function ({ api, event, handleReply: hr }) {
  const { threadID, messageID, senderID } = event;

  const session = pending.get(hr.messageID);
  if (!session) return;

  const attachUrls = getAttachmentUrls(event);

  // Step 1 — waiting for FIRST image (target / body)
  if (session.step === 1) {
    if (!attachUrls.length) {
      return api.sendMessage(
        `📎 Please send an image (the BODY/TARGET — the photo you want the face put ON).`,
        threadID,
        (e, info) => {
          if (!e && info) {
            pending.set(info.messageID, { ...session, step: 1, threadID });
            pending.delete(hr.messageID);
            global.GoatBot?.onReply?.set(info.messageID, { commandName: 'faceswap', messageID: info.messageID });
          }
        }
      );
    }
    const targetFp = await downloadImage(attachUrls[0]).catch(() => null);
    if (!targetFp) {
      return api.sendMessage(`❌ Failed to download image. Please try again.`, threadID, messageID);
    }

    return api.sendMessage(
      `✅ Got the TARGET image!\n\nNow send the FACE photo (the face you want to paste in):`,
      threadID,
      (e, info) => {
        if (!e && info) {
          pending.set(info.messageID, { step: 2, threadID, targetFp, senderID });
          pending.delete(hr.messageID);
          global.GoatBot?.onReply?.set(info.messageID, { commandName: 'faceswap', messageID: info.messageID });
        }
      }
    );
  }

  // Step 2 — waiting for SECOND image (face source)
  if (session.step === 2) {
    if (!attachUrls.length) {
      return api.sendMessage(
        `📎 Please send the FACE photo (the face you want to paste in).`,
        threadID, messageID
      );
    }

    api.sendMessage(`⚙️ ${bold('Processing face swap...')} This takes 20–60 seconds. Please wait...`, threadID);
    api.setMessageReaction('⚙️', messageID, () => {}, true);

    try {
      const faceFp = await downloadImage(attachUrls[0]);
      const result = await doFaceSwap(faceFp, session.targetFp);

      api.setMessageReaction('✅', messageID, () => {}, true);
      api.sendMessage(
        {
          body:
            `✅ ${bold('FACE SWAP COMPLETE!')} 🎭\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `😄 Processed by AI — no API key, totally free!\n` +
            `🔁 Run again: !faceswap`,
          attachment: fs.createReadStream(result),
        },
        threadID,
        () => { cleanup(faceFp); cleanup(session.targetFp); cleanup(result); }
      );
    } catch (e) {
      api.setMessageReaction('❌', messageID, () => {}, true);
      api.sendMessage(`❌ ${bold('Face swap failed.')}\n🔧 ${e.message}`, threadID, messageID);
      cleanup(session.targetFp);
    }

    pending.delete(hr.messageID);
  }
};

module.exports.run = async function ({ api, event, args }) {
  const { threadID, messageID, senderID } = event;
  const P = global.config?.PREFIX || '!';

  // ── Check for reply image + attachment (most common use) ──────────────────
  const attachUrls  = getAttachmentUrls(event);
  const replyImgUrl = (() => {
    const r = event.messageReply;
    if (!r) return null;
    const atts = r.attachments || [];
    for (const a of atts) {
      const u = a.largePreviewUrl || a.previewUrl || a.url;
      if (u) return u;
    }
    return null;
  })();

  // Method 1: Reply to an image + 1 attachment
  if (replyImgUrl && attachUrls.length >= 1) {
    api.setMessageReaction('⚙️', messageID, () => {}, true);
    api.sendMessage(`⚙️ ${bold('Processing face swap...')} 20–60 seconds...`, threadID);
    try {
      const [targetFp, faceFp] = await Promise.all([
        downloadImage(replyImgUrl),
        downloadImage(attachUrls[0]),
      ]);
      const result = await doFaceSwap(faceFp, targetFp);
      api.setMessageReaction('✅', messageID, () => {}, true);
      return api.sendMessage(
        {
          body:
            `✅ ${bold('FACE SWAP COMPLETE!')} 🎭\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `🎭 Replied image = TARGET (body)\n` +
            `📎 Attached image = FACE SOURCE`,
          attachment: fs.createReadStream(result),
        },
        threadID,
        () => { cleanup(targetFp); cleanup(faceFp); cleanup(result); }
      );
    } catch (e) {
      api.setMessageReaction('❌', messageID, () => {}, true);
      return api.sendMessage(`❌ ${bold('Face swap failed.')}\n🔧 ${e.message}`, threadID, messageID);
    }
  }

  // Method 2: 2 attachments in one message
  if (attachUrls.length >= 2) {
    api.setMessageReaction('⚙️', messageID, () => {}, true);
    api.sendMessage(`⚙️ ${bold('Processing face swap...')} 20–60 seconds...`, threadID);
    try {
      const [targetFp, faceFp] = await Promise.all([
        downloadImage(attachUrls[0]),
        downloadImage(attachUrls[1]),
      ]);
      const result = await doFaceSwap(faceFp, targetFp);
      api.setMessageReaction('✅', messageID, () => {}, true);
      return api.sendMessage(
        {
          body:
            `✅ ${bold('FACE SWAP COMPLETE!')} 🎭\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `🖼️ Photo 1 = TARGET (body)\n` +
            `🎭 Photo 2 = FACE SOURCE`,
          attachment: fs.createReadStream(result),
        },
        threadID,
        () => { cleanup(targetFp); cleanup(faceFp); cleanup(result); }
      );
    } catch (e) {
      api.setMessageReaction('❌', messageID, () => {}, true);
      return api.sendMessage(`❌ ${bold('Face swap failed.')}\n🔧 ${e.message}`, threadID, messageID);
    }
  }

  // Method 3: No images — step-by-step guide with handleReply
  return api.sendMessage(
    `🎭 ${bold('FACE SWAP — AI POWERED!')}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🆓 FREE — No API key needed!\n\n` +
    `📖 ${bold('HOW TO USE:')}\n\n` +
    `⚡ ${bold('FASTEST METHOD:')}\n` +
    `Reply to any image, then attach your face photo + type ${P}faceswap\n\n` +
    `📱 ${bold('2-PHOTO METHOD:')}\n` +
    `Attach 2 photos + type ${P}faceswap\n` +
    `(Photo 1 = body, Photo 2 = face)\n\n` +
    `🪜 ${bold('STEP-BY-STEP:')}\n` +
    `Reply to this message with your TARGET photo (the body you want):`,
    threadID,
    (err, info) => {
      if (!err && info) {
        pending.set(info.messageID, { step: 1, threadID, senderID });
        global.GoatBot?.onReply?.set(info.messageID, {
          commandName: 'faceswap',
          messageID:    info.messageID,
        });
      }
    }
  );
};
