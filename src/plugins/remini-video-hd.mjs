import { commandActionId } from '../lib/native-flow.mjs';
import {
  enhanceVideoBuffer,
  getVideoToolStatus,
  inspectVideoBuffer,
  VIDEO_HD_LIMITS,
  VIDEO_HD_PRESETS
} from '../media/video-hd.mjs';

const PRESET_HELP = Object.entries(VIDEO_HD_PRESETS).map(([key, value]) => `• ${key} — ${value.label}: ${value.description}`).join('\n');
const HELP = [
  '━━ WHISKAY VIDEO HD ━━',
  'Lampirkan video dengan caption command atau balas pesan video.',
  '.remini [balanced|sharp|clean|fast]',
  '.remini enhance [preset]',
  '.remini inspect — metadata saja, tanpa encode',
  '.remini status — cek FFmpeg/FFprobe',
  '.remini presets — pilihan filter',
  '.remini info — cara kerja dan batas proses',
  '',
  'Input dibaca dari WhatsApp lalu diproses lokal. Tidak ada URL downloader, Play Store scraper runtime, login Remini, atau API cloud Remini.'
].join('\n');

function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  return value >= 1024 * 1024 ? `${(value / 1024 / 1024).toFixed(2)} MiB` : `${(value / 1024).toFixed(1)} KiB`;
}

function formatDuration(seconds) {
  const value = Math.max(0, Math.round(Number(seconds) || 0));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}

function formatMetadata(metadata) {
  return [
    `Resolusi: ${metadata.width}×${metadata.height}`,
    `Durasi: ${formatDuration(metadata.duration)}`,
    `FPS: ${metadata.fps || '-'}`,
    `Codec: ${metadata.codec || '-'}`,
    `Format: ${metadata.format || '-'}`,
    `Audio: ${metadata.hasAudio ? 'ya' : 'tidak'}`,
    `Ukuran: ${formatBytes(metadata.size)}`
  ];
}


export function selectVideoMedia(messageInfo = {}) {
  const directMedia = messageInfo?.media || null;
  const quotedMedia = messageInfo?.quotedMedia || null;
  if (directMedia?.type === 'video') return { media: directMedia, quoted: false };
  if (quotedMedia?.type === 'video') return { media: quotedMedia, quoted: true };
  return { media: null, quoted: false };
}

export default {
  name: 'remini-video-hd',
  commands: [{
    name: 'remini', aliases: ['videohd', 'enhancevideo'], category: 'Media Processing',
    usage: '[status|info|presets|inspect|enhance [preset]|balanced|sharp|clean|fast] atau lampirkan/balas video',
    description: 'Analisis metadata dan upscale video lokal dengan FFmpeg; preset balanced/sharp/clean/fast',
    async execute({ args = [], reply, sendInteractive, messageInfo, downloadMedia, sock, key, msg }) {
      const action = String(args[0] || '').toLowerCase();
      const requestedPreset = ['balanced', 'sharp', 'clean', 'fast'].includes(action)
        ? action
        : String(args[1] || 'balanced').toLowerCase();

      const showHelp = async () => {
        if (typeof sendInteractive === 'function') {
          return sendInteractive({
            title: 'WHISKAY · VIDEO HD',
            body: 'Lampirkan video dengan caption command atau balas video. Pilih diagnostik atau panduan; untuk encode, kirim .remini enhance <preset> bersama video.',
            footer: 'Local FFmpeg · bukan Remini cloud AI',
            buttons: [{ type: 'single_select', title: 'Video HD options', sections: [{ title: 'Diagnostik & panduan', rows: [
              { title: 'Status FFmpeg', description: 'Periksa FFmpeg/FFprobe dan batas proses', id: commandActionId('.remini status') },
              { title: 'Preset video', description: 'Lihat balanced, sharp, clean, fast', id: commandActionId('.remini presets') },
              { title: 'Info & batas', description: 'Cara kerja dan batas lokal', id: commandActionId('.remini info') },
              { title: 'Bantuan', description: 'Petunjuk penggunaan lengkap', id: commandActionId('.remini help') }
            ] }] }]
          });
        }
        return reply(HELP);
      };
      if (['help', '-h', '--help'].includes(action)) return showHelp();
      if (action === 'presets') return reply(`━━ VIDEO HD PRESETS ━━\n${PRESET_HELP}\n\nSemua preset melakukan resize lokal; preset berbeda pada filter denoise/sharpen/warna.`);
      if (action === 'status' || action === 'info') {
        const status = await getVideoToolStatus();
        const lines = [
          '━━ VIDEO HD ENGINE STATUS ━━',
          `FFmpeg: ${status.ffmpeg || 'tidak ditemukan'}`,
          `FFprobe: ${status.ffprobe || 'tidak ditemukan'}`,
          `Status: ${status.ready ? 'READY' : 'NOT READY'}`,
          `Batas input: ${formatBytes(VIDEO_HD_LIMITS.maxInputBytes)}`,
          `Batas output: ${formatBytes(VIDEO_HD_LIMITS.maxOutputBytes)}`,
          `Durasi maksimal: ${VIDEO_HD_LIMITS.maxDurationSeconds / 60} menit`,
          `Dimensi sumber maksimal: ${VIDEO_HD_LIMITS.maxDimension}px`,
          '',
          'Proses bersifat lokal. File tidak dikirim ke server Remini/Google Play.',
          'FFmpeg melakukan upscale, denoise, sharpen, dan filter warna; bukan model AI Remini cloud.',
          '',
          `Preset: ${Object.keys(VIDEO_HD_PRESETS).join(', ')}`
        ];
        if (!status.ready) lines.push('', 'Instalasi Termux: `pkg install ffmpeg` | Debian/Ubuntu: `apt install ffmpeg`');
        if (action === 'info') lines.push('', HELP);
        return reply(lines.join('\n'));
      }

      const inspectOnly = action === 'inspect';
      const enhanceRequested = !action || ['run', 'enhance', 'balanced', 'sharp', 'clean', 'fast'].includes(action);
      if (!inspectOnly && !enhanceRequested) return showHelp();
      if (!VIDEO_HD_PRESETS[requestedPreset]) return reply(`Preset tidak dikenal: ${requestedPreset}.\nGunakan: ${Object.keys(VIDEO_HD_PRESETS).join(', ')}`);

      // `messageInfo.media` is the current attachment; `quotedMedia` is the
      // replied-to attachment. Prefer a video source instead of blindly taking
      // the first media descriptor (a text command may quote a video).
      const { media, quoted: quotedSource } = selectVideoMedia(messageInfo);
      if (!media || media.type !== 'video') {
        await reply('Lampirkan video dengan caption `.remini` atau `.remini enhance sharp`, atau balas video dengan `.remini inspect`.');
        return showHelp();
      }
      if (media.fileLength > VIDEO_HD_LIMITS.maxInputBytes) return reply(`Ukuran video melewati batas ${formatBytes(VIDEO_HD_LIMITS.maxInputBytes)}.`);

      const tools = await getVideoToolStatus();
      if (!tools.ffprobe || (!inspectOnly && !tools.ffmpeg)) {
        return reply(`Tool belum siap. FFmpeg: ${tools.ffmpeg || 'missing'}, FFprobe: ${tools.ffprobe || 'missing'}.\nTermux: pkg install ffmpeg | Debian/Ubuntu: apt install ffmpeg\nPeriksa ulang dengan .remini status`);
      }

      await reply(inspectOnly
        ? 'Video diterima. WHISKAY sedang membaca metadata tanpa mengubah file.'
        : `Video diterima. Menjalankan preset ${requestedPreset} dengan FFmpeg lokal.`);
      try {
        const inputBuffer = await downloadMedia({ descriptor: media, quoted: quotedSource, maxBytes: VIDEO_HD_LIMITS.maxInputBytes });
        if (inspectOnly) {
          const metadata = await inspectVideoBuffer(inputBuffer, { inputName: media.fileName || 'video.mp4' });
          const scaleNote = metadata.canEnhance ? `Perkiraan batas upscale: ${metadata.maxScale}x` : 'Sumber sudah berada pada batas dimensi upscale WHISKAY.';
          return reply(['━━ VIDEO INSPECTION ━━', ...formatMetadata(metadata), scaleNote, '', 'Tidak ada proses encode yang dijalankan.'].join('\n'));
        }

        const result = await enhanceVideoBuffer(inputBuffer, { inputName: media.fileName || 'video.mp4', preset: requestedPreset });
        const seconds = (result.processingMs / 1000).toFixed(1);
        const caption = [
          '━━ VIDEO HD RESULT ━━',
          `Preset: ${result.preset}`,
          `Resolusi: ${result.input.width}×${result.input.height} → ${result.output.width}×${result.output.height}`,
          `Scale: ${result.scale}`,
          `Durasi: ${formatDuration(result.input.duration)}`,
          `Ukuran: ${formatBytes(result.input.size)} → ${formatBytes(result.output.size)}`,
          `Codec: ${result.output.codec} | FPS: ${result.output.fps || result.input.fps || '-'}`,
          `Filter: ${result.filter.includes('lanczos') ? 'Lanczos' : 'Bicubic'}`,
          `Proses: ${seconds}s`,
          '',
          'Diproses lokal dengan FFmpeg. Upscale/sharpen tidak memulihkan detail yang tidak ada pada sumber.'
        ].join('\n');
        const chat = key?.remoteJid;
        if (!chat || typeof sock?.sendMessage !== 'function') throw new Error('Socket WhatsApp tidak siap untuk mengirim hasil.');
        if (result.buffer.length <= 64 * 1024 * 1024) {
          await sock.sendMessage(chat, { video: result.buffer, mimetype: 'video/mp4', fileName: 'whiskay-video-hd.mp4', caption }, { quoted: msg });
        } else {
          await sock.sendMessage(chat, { document: result.buffer, mimetype: 'video/mp4', fileName: 'whiskay-video-hd.mp4', caption }, { quoted: msg });
        }
      } catch (error) {
        await reply(`Video HD gagal: ${String(error?.message || error).slice(0, 700)}\nKetik .remini status untuk pemeriksaan engine.`);
      }
    }
  }]
};
