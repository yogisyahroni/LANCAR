const MIN_SCHEDULE_LEAD_MS = 30 * 60 * 1000;

export type CustomerOrderSchedule = {
  scheduleType: 'now' | 'scheduled';
  scheduledAt: Date | null;
};

export class CustomerOrderScheduleError extends Error {
  statusCode = 400;
  code = 'ERR_INVALID_SCHEDULE';

  constructor(message: string) {
    super(message);
    this.name = 'CustomerOrderScheduleError';
  }
}

type NormalizeScheduleOptions = {
  now?: Date;
  allowScheduled?: boolean;
};

export const normalizeCustomerOrderSchedule = (
  rawScheduleType: unknown,
  rawScheduledAt: unknown,
  options: NormalizeScheduleOptions = {},
): CustomerOrderSchedule => {
  const scheduleType = String(rawScheduleType || 'now').trim().toLowerCase();
  if (scheduleType !== 'now' && scheduleType !== 'scheduled') {
    throw new CustomerOrderScheduleError('Pilihan waktu pickup tidak valid.');
  }

  if (scheduleType === 'now') {
    return { scheduleType: 'now', scheduledAt: null };
  }

  if (options.allowScheduled === false) {
    throw new CustomerOrderScheduleError('Jadwal pickup belum tersedia untuk layanan ini.');
  }

  const scheduledAt = new Date(String(rawScheduledAt || ''));
  const now = options.now || new Date();
  if (Number.isNaN(scheduledAt.getTime())) {
    throw new CustomerOrderScheduleError('Waktu pickup terjadwal wajib diisi.');
  }
  if (scheduledAt.getTime() < now.getTime() + MIN_SCHEDULE_LEAD_MS) {
    throw new CustomerOrderScheduleError('Waktu pickup harus minimal 30 menit dari sekarang.');
  }

  return { scheduleType: 'scheduled', scheduledAt };
};

export const paidCustomerOrderStatus = (schedule: CustomerOrderSchedule, isFoodOrder: boolean) => {
  if (schedule.scheduleType === 'scheduled') return 'scheduled';
  return isFoodOrder ? 'pending_merchant' : 'pending';
};

export const scheduledPickupLeadMinutes = MIN_SCHEDULE_LEAD_MS / 60_000;
