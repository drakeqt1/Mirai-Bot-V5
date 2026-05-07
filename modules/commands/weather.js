/**
 * !weather — Real-time weather with image, voice, and video
 * Uses wttr.in (FREE, no API key) + PAGASA public data + msedge-tts voice
 *
 * Usage:
 *   !weather [location]           — Image + text + voice (male/female)
 *   !weather video [location]     — Short weather video clip with voice
 *   !weather typhoon / bagyo      — Philippines typhoon/LPA tracker
 *   !weather male [location]      — Force male voice
 *   !weather female [location]    — Force female voice
 */

const axios           = require('axios');
const fs              = require('fs-extra');
const path            = require('path');
const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');
const { exec }        = require('child_process');
const bold            = require('../../utils/bold');

const TEMP_DIR = path.join(process.cwd(), 'utils/data/weather_temp');
fs.ensureDirSync(TEMP_DIR);

const UA      = 'curl/7.68.0';
const cleanup = (fp) => setTimeout(() => fs.remove(fp).catch(() => {}), 300000);

// ── wttr.in helpers ───────────────────────────────────────────────────────────
async function getWeatherJSON(loc) {
  const { data } = await axios.get(
    `https://wttr.in/${encodeURIComponent(loc)}?format=j1`,
    { timeout: 15000, headers: { 'User-Agent': UA } }
  );
  return typeof data === 'string' ? JSON.parse(data) : data;
}

async function downloadWeatherImage(loc) {
  const fp = path.join(TEMP_DIR, `wimg_${Date.now()}.png`);
  const { data } = await axios.get(
    `https://wttr.in/${encodeURIComponent(loc)}.png?1&lang=en`,
    { responseType: 'arraybuffer', timeout: 25000, headers: { 'User-Agent': UA } }
  );
  fs.writeFileSync(fp, Buffer.from(data));
  return fp;
}

// ── PAGASA typhoon check ──────────────────────────────────────────────────────
async function checkPAGASA() {
  const sources = [
    { url: 'https://pubfiles.pagasa.dost.gov.ph/tamss/weather/bulletin.json', type: 'json' },
    { url: 'https://bagong.pagasa.dost.gov.ph/tropical-cyclone/public-storm-warning-signals', type: 'html' },
  ];
  for (const s of sources) {
    try {
      const { data } = await axios.get(s.url, { timeout: 12000, headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (s.type === 'json') {
        const d = typeof data === 'string' ? JSON.parse(data) : data;
        return { active: !!(d.cyclon || d.cyclone || d.tropical_cyclone), raw: d };
      }
      const storm = data.match(/(?:Typhoon|Tropical Storm|Tropical Depression|Severe Tropical Storm)\s+(["']?)([A-Z][a-zA-Z]+)\1/g) || [];
      const lpa   = /low pressure area|LPA/i.test(data);
      return { active: storm.length > 0 || lpa, storms: storm, lpa };
    } catch {}
  }
  return { active: false };
}

// ── TTS voice ─────────────────────────────────────────────────────────────────
async function makeVoice(text, gender = 'male') {
  const fp  = path.join(TEMP_DIR, `wvoice_${Date.now()}.mp3`);
  const tts = new MsEdgeTTS();
  await tts.setMetadata(
    gender === 'female' ? 'en-US-JennyNeural' : 'en-US-GuyNeural',
    OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3
  );
  const readable = tts.toStream(text);
  await new Promise((res, rej) => {
    const ws = fs.createWriteStream(fp);
    readable.pipe(ws);
    ws.on('finish', res);
    ws.on('error', rej);
    readable.on('error', rej);
  });
  return fp;
}

// ── Weather video via ffmpeg (zoom + voice overlay) ───────────────────────────
function makeWeatherVideo(imgFp, voiceFp, locationLabel) {
  return new Promise((resolve, reject) => {
    const outFp = path.join(TEMP_DIR, `wvid_${Date.now()}.mp4`);
    const label = locationLabel.replace(/['"\\]/g, '');

    // Try zoompan + drawtext first
    const cmd1 =
      `ffmpeg -y -loop 1 -i "${imgFp}" -i "${voiceFp}" ` +
      `-vf "zoompan=z='min(zoom+0.0012,1.4)':d=250:s=854x480,` +
      `drawtext=text='${label} - Weather Update':fontsize=26:fontcolor=white:` +
      `box=1:boxcolor=black@0.5:boxborderw=6:x=(w-tw)/2:y=14" ` +
      `-c:v libx264 -preset fast -crf 28 -pix_fmt yuv420p ` +
      `-c:a aac -b:a 64k -shortest -t 25 "${outFp}" 2>&1`;

    exec(cmd1, { timeout: 90000 }, (e) => {
      if (!e && fs.existsSync(outFp) && fs.statSync(outFp).size > 20000) {
        return resolve(outFp);
      }
      // Fallback: simple static video
      const cmd2 =
        `ffmpeg -y -loop 1 -i "${imgFp}" -i "${voiceFp}" ` +
        `-c:v libx264 -preset fast -crf 28 -pix_fmt yuv420p ` +
        `-vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" ` +
        `-c:a aac -b:a 64k -shortest -t 25 "${outFp}" 2>&1`;
      exec(cmd2, { timeout: 90000 }, (e2) => {
        if (e2 || !fs.existsSync(outFp) || fs.statSync(outFp).size < 10000) {
          return reject(new Error('ffmpeg failed'));
        }
        resolve(outFp);
      });
    });
  });
}

// ── Parse wttr.in JSON ────────────────────────────────────────────────────────
function parseWeather(data, fallbackLoc) {
  const cur  = data.current_condition?.[0] || {};
  const area = data.nearest_area?.[0];
  return {
    place:      area?.areaName?.[0]?.value || fallbackLoc,
    country:    area?.country?.[0]?.value  || '',
    tempC:      cur.temp_C       || '?',
    feelsC:     cur.FeelsLikeC  || '?',
    humidity:   cur.humidity    || '?',
    windKmph:   cur.windspeedKmph || '?',
    windDir:    cur.winddir16Point || '?',
    desc:       cur.weatherDesc?.[0]?.value || 'N/A',
    visibility: cur.visibility  || '?',
    pressure:   cur.pressure    || '?',
    uvIndex:    cur.uvIndex     || '?',
    maxC:       data.weather?.[0]?.maxtempC || '?',
    minC:       data.weather?.[0]?.mintempC || '?',
  };
}

const PH_RE = /philippines|pilipinas|manila|cebu|davao|naga|quezon|makati|baguio|cagayan|zamboanga|batangas|pampanga|laguna|bicol|visayas|mindanao|luzon|iloilo|pasig|taguig/i;

// ── Module exports ────────────────────────────────────────────────────────────
module.exports.config = {
  name:            'weather',
  version:         '1.0.0',
  hasPermssion:    0,
  credits:         'TEAM STARTCOPE BETA',
  description:     'Real-time weather — image, voice, video, Philippines typhoon tracker. FREE, no API key.',
  commandCategory: 'Utility',
  usages:          '[location] | video [location] | typhoon | bagyo | male/female [location]',
  cooldowns:       10,
};

module.exports.run = async function ({ api, event, args }) {
  const { threadID, messageID } = event;
  const P = global.config?.PREFIX || '!';

  if (!args.length) {
    return api.sendMessage(
      `🌤️ ${bold('WEATHER COMMAND — FREE & REAL-TIME!')}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `No API key needed — uses wttr.in!\n\n` +
      `📋 ${bold('COMMANDS:')}\n` +
      `${P}weather [location]         — Image + text + voice\n` +
      `${P}weather video [location]   — Weather VIDEO clip\n` +
      `${P}weather typhoon            — PH typhoon tracker\n` +
      `${P}weather female [location]  — Female voice version\n\n` +
      `📍 ${bold('EXAMPLES:')}\n` +
      `${P}weather Naga City\n` +
      `${P}weather Manila Philippines\n` +
      `${P}weather video Cebu\n` +
      `${P}weather female Baguio\n` +
      `${P}weather typhoon\n\n` +
      `🎙️ Sends real weather image + voice announcement!`,
      threadID, messageID
    );
  }

  const sub = args[0].toLowerCase();

  // ── Typhoon/Bagyo tracker ──────────────────────────────────────────────────
  if (sub === 'typhoon' || sub === 'bagyo') {
    api.setMessageReaction('🌀', messageID, () => {}, true);
    api.sendMessage(`⏳ ${bold('Checking PAGASA data...')} Please wait.`, threadID);

    try {
      const [phJSON, imgFp, pagasa] = await Promise.allSettled([
        getWeatherJSON('Manila Philippines'),
        downloadWeatherImage('Manila Philippines'),
        checkPAGASA(),
      ]);

      const w = phJSON.status === 'fulfilled' ? parseWeather(phJSON.value, 'Manila') : null;
      const img = imgFp.status === 'fulfilled' ? imgFp.value : null;
      const pg  = pagasa.status === 'fulfilled' ? pagasa.value : { active: false };
      const now = new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' });

      let body =
        `🌀 ${bold('PHILIPPINES TYPHOON TRACKER')} 🇵🇭\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `📅 ${now} (Philippine Time)\n\n`;

      if (pg.active) {
        body += `⚠️ ${bold('ACTIVE TROPICAL WEATHER SYSTEM!')}\n`;
        if (pg.storms?.length) body += `🌀 ${bold('Storm(s):')} ${pg.storms.join(', ')}\n`;
        if (pg.lpa) body += `🌩️ ${bold('Low Pressure Area (LPA) active')}\n`;
        body += `\n📻 Monitor PAGASA for latest warnings!\n`;
      } else {
        body += `✅ ${bold('No active typhoon detected')}\n` +
          `Conditions appear normal in the Philippines.\n`;
      }

      if (w) {
        body +=
          `\n🌡️ ${bold('Manila Current Weather:')}\n` +
          `  Temp: ${w.tempC}°C | Feels: ${w.feelsC}°C\n` +
          `  Sky: ${w.desc}\n` +
          `  Wind: ${w.windKmph} km/h ${w.windDir}\n` +
          `  Humidity: ${w.humidity}%\n` +
          `  Pressure: ${w.pressure} hPa\n`;
      }

      body += `\n📡 ${bold('Source:')} PAGASA · wttr.in\n` +
        `🔗 pagasa.dost.gov.ph`;

      const voiceText = pg.active
        ? `Attention! A tropical weather system is currently active in the Philippines. Please monitor official PAGASA advisories for updates and stay safe.`
        : `Weather advisory: No active typhoon in the Philippines at this time. Current conditions are normal. Stay safe!`;

      const voiceRes = await Promise.allSettled([makeVoice(voiceText, 'male')]);
      const voice = voiceRes[0].status === 'fulfilled' ? voiceRes[0].value : null;

      api.setMessageReaction('✅', messageID, () => {}, true);

      // Send image + text first
      if (img) {
        await new Promise(r => api.sendMessage({ body, attachment: fs.createReadStream(img) }, threadID, r));
        cleanup(img);
      } else {
        await new Promise(r => api.sendMessage(body, threadID, r));
      }
      // Then send voice separately
      if (voice) {
        api.sendMessage({ body: '🎙️ Voice weather update:', attachment: fs.createReadStream(voice) }, threadID, () => cleanup(voice));
      }
      return;

    } catch (e) {
      api.setMessageReaction('❌', messageID, () => {}, true);
      return api.sendMessage(`❌ ${bold('Typhoon data fetch failed.')}\n${e.message}`, threadID, messageID);
    }
  }

  // ── Detect mode ────────────────────────────────────────────────────────────
  let isVideo  = false;
  let gender   = 'male';
  let locParts = [...args];

  if (sub === 'video')  { isVideo = true;  locParts = args.slice(1); }
  if (sub === 'male')   { gender  = 'male'; locParts = args.slice(1); }
  if (sub === 'female') { gender  = 'female'; locParts = args.slice(1); }

  const location = locParts.join(' ').trim();
  if (!location) {
    return api.sendMessage(
      `❌ Please provide a location.\nExample: ${P}weather ${isVideo ? 'video ' : ''}Naga City`,
      threadID, messageID
    );
  }

  api.setMessageReaction('🌤️', messageID, () => {}, true);
  api.sendMessage(
    isVideo
      ? `⏳ ${bold('Generating weather video for')} ${bold(location)}... (may take 30–60 sec)`
      : `⏳ ${bold('Fetching weather for')} ${bold(location)}...`,
    threadID
  );

  try {
    const [jsonRes, imgRes] = await Promise.allSettled([
      getWeatherJSON(location),
      downloadWeatherImage(location),
    ]);

    if (jsonRes.status === 'rejected' && imgRes.status === 'rejected') {
      throw new Error('Could not reach weather service. Check location name.');
    }

    const wData = jsonRes.status === 'fulfilled' ? jsonRes.value : null;
    const imgFp = imgRes.status === 'fulfilled' ? imgRes.value : null;
    const w     = wData ? parseWeather(wData, location) : null;
    const isPhil = PH_RE.test(location);
    const now = new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' });

    const hasTyphoon = w && /typhoon|tropical storm|depression|low pressure|LPA/i.test(w.desc);

    let body =
      `🌤️ ${bold('WEATHER UPDATE')} — ${bold(w ? `${w.place}${w.country ? ', ' + w.country : ''}` : location)}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `📅 ${now} (PH Time)\n`;

    if (hasTyphoon) body += `\n⚠️ ${bold('TROPICAL WEATHER SYSTEM DETECTED!')}\n`;

    if (w) {
      body +=
        `\n🌡️ ${bold('Temperature:')} ${w.tempC}°C  (Feels like ${w.feelsC}°C)\n` +
        `🌤️ ${bold('Condition:')}   ${w.desc}\n` +
        `💧 ${bold('Humidity:')}    ${w.humidity}%\n` +
        `💨 ${bold('Wind:')}        ${w.windKmph} km/h ${w.windDir}\n` +
        `👁️ ${bold('Visibility:')} ${w.visibility} km\n` +
        `🌡️ ${bold('Pressure:')}   ${w.pressure} hPa\n` +
        `☀️ ${bold('UV Index:')}   ${w.uvIndex}\n` +
        `📈 ${bold('High:')} ${w.maxC}°C  |  ${bold('Low:')} ${w.minC}°C\n`;
    }

    if (isPhil) {
      body += `\n🇵🇭 ${bold('PH Typhoon hotline:')} pagasa.dost.gov.ph`;
    }
    body += `\n\n📡 ${bold('Source:')} wttr.in — Free real-time weather`;

    const speechText = w
      ? `Weather update for ${w.place}. Temperature is ${w.tempC} degrees Celsius, feels like ${w.feelsC} degrees. Conditions: ${w.desc}. Humidity ${w.humidity} percent. Wind ${w.windKmph} kilometers per hour. High of ${w.maxC}, low of ${w.minC} degrees today.`
      : `Weather update for ${location}. Please check the weather image for full forecast details.`;

    if (isVideo) {
      if (!imgFp) throw new Error('No weather image available for video.');
      const voiceFp = await makeVoice(speechText, gender);
      const videoFp = await makeWeatherVideo(imgFp, voiceFp, w ? w.place : location);

      api.setMessageReaction('✅', messageID, () => {}, true);
      return api.sendMessage(
        { body, attachment: fs.createReadStream(videoFp) },
        threadID,
        () => { cleanup(imgFp); cleanup(voiceFp); cleanup(videoFp); }
      );

    } else {
      const voiceFp = await makeVoice(speechText, gender).catch(() => null);
      api.setMessageReaction('✅', messageID, () => {}, true);

      // Send image + text first, then voice as a separate message
      if (imgFp) {
        await new Promise(r => api.sendMessage({ body, attachment: fs.createReadStream(imgFp) }, threadID, r));
        cleanup(imgFp);
      } else {
        await new Promise(r => api.sendMessage(body, threadID, r));
      }
      if (voiceFp) {
        api.sendMessage(
          { body: '🎙️ Voice weather update:', attachment: fs.createReadStream(voiceFp) },
          threadID,
          () => cleanup(voiceFp)
        );
      }
      return;
    }

  } catch (e) {
    api.setMessageReaction('❌', messageID, () => {}, true);
    return api.sendMessage(
      `❌ ${bold('Weather failed.')}\n🔧 ${e.message}\n\n` +
      `💡 Try: ${P}weather Manila Philippines`,
      threadID, messageID
    );
  }
};
