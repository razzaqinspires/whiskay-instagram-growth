import { referralQueue } from './queue-processor.mjs';

function parseLimit(args) {
  if (!args?.length) return 10;
  if (args.length > 1 || !/^\d+$/.test(String(args[0]))) {
    throw new TypeError('Gunakan: .referralprocess [jumlah 1-25]');
  }
  const limit = Number(args[0]);
  if (!Number.isInteger(limit) || limit < 1 || limit > 25) {
    throw new RangeError('Jumlah proses harus antara 1 dan 25.');
  }
  return limit;
}

export function createReferralBotCommands({ queue = referralQueue } = {}) {
  return [
    {
      name: 'referralstatus',
      aliases: ['refstatus'],
      category: 'Referral & Conversion',
      usage: '',
      description: 'Lihat antrean referral signup terverifikasi',
      async execute({ reply }) {
        const status = await queue.status();
        await reply([
          'WHISKAY REFERRAL QUEUE',
          `Pending verified claims: ${status.pending}`,
          `Completed (deduplicated): ${status.completed}`,
          `Oldest queued: ${status.oldestQueuedAt || '-'}`,
          'Mode: backend-signed signup verification',
        ].join('\n'));
      },
    },
    {
      name: 'referralprocess',
      aliases: ['refprocess'],
      category: 'Referral & Conversion',
      usage: '[jumlah 1-25]',
      description: 'Proses referral claim yang sudah diverifikasi backend',
      async execute({ args = [], reply, logger = console }) {
        const limit = parseLimit(args);
        await reply(`Memproses maksimal ${limit} referral claim terverifikasi dengan jeda 1 detik.`);
        const report = await queue.processPending({ limit });
        logger.info?.({
          submitted: report.submitted,
          succeeded: report.succeeded,
          alreadyClaimed: report.alreadyClaimed,
          failed: report.failed,
          pending: report.pending,
        }, '[REFERRAL] Owner initiated processing');
        await reply([
          'REFERRAL PROCESS RESULT',
          `Submitted: ${report.submitted}`,
          `Succeeded: ${report.succeeded}`,
          `Already claimed: ${report.alreadyClaimed}`,
          `Failed: ${report.failed}`,
          `Remaining: ${report.pending}`,
        ].join('\n'));
      },
    },
  ];
}
