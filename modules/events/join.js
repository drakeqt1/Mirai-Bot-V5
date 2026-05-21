/**
 * joinNoti event — Welcome new members with text + voice message
 * Voice: en-US-GuyNeural (male, Microsoft TTS) — sent simultaneously
 * TEAM STARTCOPE BETA
 */

const bold     = require('../../utils/bold');
const fs       = require('fs-extra');
const path     = require('path');

const TEMP_DIR = path.join(process.cwd(), 'utils/data/welcome_voice_temp');
fs.ensureDirSync(TEMP_DIR);

module.exports.config = {
  name:        'joinNoti',
  eventType:   ['log:subscribe'],
  version:     '2.0.0',
  credits:     'Mirai Team | TEAM STARTCOPE BETA',
  description: 'Notify when bot or user joins a group — sends text + voice welcome',
};

// ── Generate TTS voice greeting ───────────────────────────────────────────────
async function generateWelcomeVoice(firstNames, threadName) {
  try {
    const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');
    const tts = new MsEdgeTTS();
    await tts.setMetadata('en-US-GuyNeural', OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

    const nameStr  = firstNames.slice(0, 3).join(' and ');
    const greeting = firstNames.length === 1
      ? `Welcome, ${nameStr}! Great to have you in ${threadName}. Type the prefix help command to see all my commands. Enjoy the group!`
      : `Welcome everyone — ${nameStr}! Great to have you all in ${threadName}. Type the help command to see what I can do. Enjoy!`;

    const fp = path.join(TEMP_DIR, `welcome_${Date.now()}.mp3`);
    const { audioStream } = await tts.toStream(greeting);

    await new Promise((resolve, reject) => {
      const chunks = [];
      audioStream.on('data',  c => chunks.push(c));
      audioStream.on('end',   () => { fs.writeFileSync(fp, Buffer.concat(chunks)); resolve(); });
      audioStream.on('error', reject);
      setTimeout(() => reject(new Error('TTS timeout')), 20000);
    });

    if (!fs.existsSync(fp) || fs.statSync(fp).size < 500) throw new Error('Invalid audio file');
    return fp;
  } catch (e) {
    console.log('[JoinNoti] Voice TTS failed:', e.message?.slice(0, 60));
    return null;
  }
}

module.exports.run = async function ({ api, event, Users }) {
  const { threadID } = event;

  // ── Bot itself was added ───────────────────────────────────────────────────
  if (event.logMessageData.addedParticipants.some(p => p.userFbId == api.getCurrentUserID())) {
    api.changeNickname(
      `[ ${global.config.PREFIX} ] • ${global.config.BOTNAME || 'Mirai Bot'}`,
      threadID,
      api.getCurrentUserID()
    );
    return api.sendMessage(
      `👋 ${bold('Hello Everyone!')}\n\n` +
      `🤖 I'm ${bold(global.config.BOTNAME || 'Mirai Bot')}!\n` +
      `⌨️ Prefix: ${bold(global.config.PREFIX)}\n` +
      `📖 Type ${global.config.PREFIX}help to see all commands!\n\n` +
      `👑 ${bold('Admin:')} Vescente\n` +
      `🔗 facebook.com/yooboyves`,
      threadID
    );
  }

  // ── New member(s) joined ───────────────────────────────────────────────────
  try {
    const { threadName, participantIDs } = await api.getThreadInfo(threadID);
    const threadData = global.data.threadData.get(parseInt(threadID)) || {};
    const cachePath  = path.join(__dirname, 'cache', 'joinGif');
    const pathGif    = path.join(cachePath, `${threadID}.gif`);

    const mentions   = [];
    const nameArray  = [];
    const memLengths = [];
    let   i          = 0;

    for (const p of event.logMessageData.addedParticipants) {
      nameArray.push(p.fullName);
      mentions.push({ tag: p.fullName, id: p.userFbId });
      memLengths.push(participantIDs.length - i++);

      if (!global.data.allUserID.includes(String(p.userFbId))) {
        await Users.createData(p.userFbId, { name: p.fullName, data: {} });
        global.data.allUserID.push(String(p.userFbId));
      }
    }

    memLengths.sort((a, b) => a - b);

    let msg = threadData.customJoin ||
      `👋 Welcome {name}!\n\n🎉 Welcome to ${threadName}\n🔢 You are member #{memberCount}\n\n📖 Type ${global.config.PREFIX}help for commands!`;

    msg = msg
      .replace(/\{name}/g,        nameArray.join(', '))
      .replace(/\{type}/g,        memLengths.length > 1 ? 'They are' : 'You are')
      .replace(/\{memberCount}/g, memLengths.join(', '))
      .replace(/\{threadName}/g,  threadName);

    if (!fs.existsSync(cachePath)) fs.mkdirSync(cachePath, { recursive: true });

    // ── Send text welcome (+ gif if available) ─────────────────────────────
    const formPush = fs.existsSync(pathGif)
      ? { body: msg, attachment: fs.createReadStream(pathGif), mentions }
      : { body: msg, mentions };

    api.sendMessage(formPush, threadID);

    // ── Generate + send voice greeting simultaneously ──────────────────────
    const safeThread = threadName
      .replace(/[^\x00-\x7F]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 30) || 'the group';

    const firstNames = nameArray.map(n =>
      n.replace(/[^\x00-\x7F]/g, ' ').trim().split(/\s+/)[0] || 'friend'
    );

    generateWelcomeVoice(firstNames, safeThread).then(voicePath => {
      if (!voicePath) return;
      api.sendMessage(
        { attachment: fs.createReadStream(voicePath) },
        threadID,
        () => setTimeout(() => fs.remove(voicePath).catch(() => {}), 120000)
      );
    });

  } catch (e) {
    console.log('[JoinNoti] Error:', e.message?.slice(0, 80));
  }
};
