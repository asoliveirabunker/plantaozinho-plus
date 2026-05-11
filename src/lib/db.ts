import { format, parseISO, isAfter, isBefore, startOfMonth, endOfMonth, addDays, addWeeks, addMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type {
  User, Workplace, Shift, ShiftTemplate, RecurrenceRule, PaymentBatch, Report,
  MonthlyStats, WorkplaceStats, ShiftStatus
} from '../types';

const PREFIX = 'plantos_';

// ============================================================
// STORAGE HELPERS
// ============================================================

function get<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return [];
    return JSON.parse(raw) as T[];
  } catch { return []; }
}

function set<T>(key: string, data: T[]): void {
  localStorage.setItem(PREFIX + key, JSON.stringify(data));
}

function generateId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ============================================================
// AUTH / USER
// ============================================================

export function getCurrentUser(): User | null {
  try {
    const raw = localStorage.getItem(PREFIX + 'current_user');
    if (!raw) return null;
    return JSON.parse(raw) as User;
  } catch { return null; }
}

export function setCurrentUser(user: User): void {
  localStorage.setItem(PREFIX + 'current_user', JSON.stringify(user));
  // Also upsert in users list
  const users = getUsers();
  const idx = users.findIndex(u => u.id === user.id);
  if (idx >= 0) users[idx] = user;
  else users.push(user);
  set('users', users);
}

export function getUsers(): User[] {
  return get<User>('users');
}

export function logout(): void {
  localStorage.removeItem(PREFIX + 'current_user');
}

export function registerUser(data: Omit<User, 'id' | 'created_at'>): User {
  const user: User = {
    ...data,
    id: generateId(),
    created_at: new Date().toISOString(),
  };
  setCurrentUser(user);
  return user;
}

export function loginUser(email: string, password?: string): User | null {
  const users = getUsers();
  const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (user) {
    // If user has a password, verify it
    if (user.password && password !== user.password) {
      return null;
    }
    localStorage.setItem(PREFIX + 'current_user', JSON.stringify(user));
    return user;
  }
  return null;
}

export function updateUser(updates: Partial<User>): User {
  const current = getCurrentUser();
  if (!current) throw new Error('No user');
  const updated = { ...current, ...updates };
  setCurrentUser(updated);
  return updated;
}

// ============================================================
// WORKPLACES
// ============================================================

export function getWorkplaces(userId: string): Workplace[] {
  return get<Workplace>('workplaces').filter(w => w.user_id === userId && w.active);
}

export function getWorkplace(id: string): Workplace | null {
  return get<Workplace>('workplaces').find(w => w.id === id) || null;
}

export function createWorkplace(data: Omit<Workplace, 'id' | 'created_at'>): Workplace {
  const wps = get<Workplace>('workplaces');
  const wp: Workplace = { ...data, id: generateId(), created_at: new Date().toISOString() };
  wps.push(wp);
  set('workplaces', wps);
  return wp;
}

export function updateWorkplace(id: string, data: Partial<Workplace>): Workplace {
  const wps = get<Workplace>('workplaces');
  const idx = wps.findIndex(w => w.id === id);
  if (idx < 0) throw new Error('Workplace not found');
  wps[idx] = { ...wps[idx], ...data };
  set('workplaces', wps);
  return wps[idx];
}

export function deleteWorkplace(id: string): void {
  const wps = get<Workplace>('workplaces');
  const idx = wps.findIndex(w => w.id === id);
  if (idx >= 0) { wps[idx].active = false; set('workplaces', wps); }
}

// ============================================================
// SHIFT TEMPLATES
// ============================================================

export function getShiftTemplates(userId: string, workplaceId?: string): ShiftTemplate[] {
  return get<ShiftTemplate>('templates').filter(t =>
    t.user_id === userId && (workplaceId ? t.workplace_id === workplaceId : true)
  );
}

export function createShiftTemplate(data: Omit<ShiftTemplate, 'id'>): ShiftTemplate {
  const templates = get<ShiftTemplate>('templates');
  const t: ShiftTemplate = { ...data, id: generateId() };
  templates.push(t);
  set('templates', templates);
  return t;
}

export function updateShiftTemplate(id: string, data: Partial<ShiftTemplate>): ShiftTemplate {
  const templates = get<ShiftTemplate>('templates');
  const idx = templates.findIndex(t => t.id === id);
  if (idx < 0) throw new Error('Template not found');
  templates[idx] = { ...templates[idx], ...data };
  set('templates', templates);
  return templates[idx];
}

export function deleteShiftTemplate(id: string): void {
  const templates = get<ShiftTemplate>('templates').filter(t => t.id !== id);
  set('templates', templates);
}

// ============================================================
// SHIFTS
// ============================================================

export function getShifts(userId: string): Shift[] {
  const shifts = get<Shift>('shifts').filter(s => s.user_id === userId);
  // Auto-update overdue
  const now = new Date();
  let changed = false;
  shifts.forEach(s => {
    if (
      s.status !== 'recebido' &&
      s.status !== 'cancelado' &&
      s.status !== 'atrasado' &&
      s.payment_due_date &&
      isBefore(parseISO(s.payment_due_date), now)
    ) {
      s.status = 'atrasado';
      changed = true;
    }
  });
  if (changed) {
    const allShifts = get<Shift>('shifts');
    shifts.forEach(updated => {
      const idx = allShifts.findIndex(s => s.id === updated.id);
      if (idx >= 0) allShifts[idx] = updated;
    });
    set('shifts', allShifts);
  }
  return shifts;
}

export function getShiftsByDate(userId: string, date: string): Shift[] {
  return getShifts(userId).filter(s => s.date === date);
}

export function getShiftsByMonth(userId: string, year: number, month: number): Shift[] {
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  return getShifts(userId).filter(s => s.date.startsWith(prefix));
}

export function createShift(data: Omit<Shift, 'id' | 'created_at' | 'updated_at'>): Shift {
  const shifts = get<Shift>('shifts');
  const now = new Date().toISOString();
  const shift: Shift = { ...data, id: generateId(), created_at: now, updated_at: now };
  shifts.push(shift);
  set('shifts', shifts);
  return shift;
}

export function updateShift(id: string, data: Partial<Shift>): Shift {
  const shifts = get<Shift>('shifts');
  const idx = shifts.findIndex(s => s.id === id);
  if (idx < 0) throw new Error('Shift not found');
  shifts[idx] = { ...shifts[idx], ...data, updated_at: new Date().toISOString() };
  set('shifts', shifts);
  return shifts[idx];
}

export function deleteShift(id: string, deleteAll = false, recurrenceId?: string): void {
  let shifts = get<Shift>('shifts');
  if (deleteAll && recurrenceId) {
    shifts = shifts.filter(s => s.recurrence_id !== recurrenceId);
  } else {
    shifts = shifts.filter(s => s.id !== id);
  }
  set('shifts', shifts);
}

export function markShiftReceived(id: string, receivedValue: number): Shift {
  const shift = get<Shift>('shifts').find(s => s.id === id);
  if (!shift) throw new Error('Shift not found');
  const status: ShiftStatus = Math.abs(receivedValue - shift.expected_value) > 0.01 ? 'divergente' : 'recebido';
  return updateShift(id, {
    status,
    received_value: receivedValue,
    payment_received_date: new Date().toISOString(),
  });
}

// ============================================================
// RECURRENCE
// ============================================================

export function createRecurrenceShifts(
  baseShiftData: Omit<Shift, 'id' | 'created_at' | 'updated_at' | 'date' | 'start_datetime' | 'end_datetime'>,
  rule: Omit<RecurrenceRule, 'id' | 'created_at'>,
  workplacePaymentDay: number
): Shift[] {
  const recurrenceId = generateId();
  const recRule: RecurrenceRule = { ...rule, id: generateId(), created_at: new Date().toISOString() };
  const rules = get<RecurrenceRule>('recurrences');
  rules.push(recRule);
  set('recurrences', rules);

  const startDate = parseISO(rule.start_date);
  const endDate = rule.end_date ? parseISO(rule.end_date) : addMonths(startDate, 3);
  const maxOccurrences = rule.occurrences || 50;

  const dates: Date[] = [];
  let current = startDate;
  let count = 0;

  // Parse shift times from the template or base data
  const [startH, startM] = (baseShiftData as unknown as { _start_time?: string })._start_time
    ? ((baseShiftData as unknown as { _start_time: string })._start_time.split(':').map(Number))
    : [7, 0];
  const [endH, endM] = (baseShiftData as unknown as { _end_time?: string })._end_time
    ? ((baseShiftData as unknown as { _end_time: string })._end_time.split(':').map(Number))
    : [19, 0];

  while (!isAfter(current, endDate) && count < maxOccurrences) {
    if (rule.frequency === 'weekly' && rule.weekdays?.length) {
      const dayOfWeek = current.getDay();
      if (rule.weekdays.includes(dayOfWeek)) {
        dates.push(new Date(current));
        count++;
      }
      current = addDays(current, 1);
    } else if (rule.frequency === '12x36') {
      dates.push(new Date(current));
      count++;
      current = addHours(current, 36);
    } else if (rule.frequency === '24x72') {
      dates.push(new Date(current));
      count++;
      current = addHours(current, 72);
    } else if (rule.frequency === 'biweekly') {
      dates.push(new Date(current));
      count++;
      current = addWeeks(current, 2);
    } else if (rule.frequency === 'monthly') {
      dates.push(new Date(current));
      count++;
      current = addMonths(current, 1);
    } else if (rule.frequency === 'daily') {
      dates.push(new Date(current));
      count++;
      current = addDays(current, rule.interval || 1);
    } else if (rule.frequency === '48h') {
      dates.push(new Date(current));
      count++;
      current = addHours(current, 48);
    } else if (rule.frequency === '72h') {
      dates.push(new Date(current));
      count++;
      current = addHours(current, 72);
    } else {
      // weekly default
      dates.push(new Date(current));
      count++;
      current = addWeeks(current, rule.interval || 1);
    }
  }

  const createdShifts: Shift[] = [];
  const existingShifts = get<Shift>('shifts');

  for (const date of dates) {
    const startDt = new Date(date);
    startDt.setHours(startH, startM, 0, 0);
    let endDt = new Date(date);
    endDt.setHours(endH, endM, 0, 0);
    if (endDt <= startDt) endDt = addDays(endDt, 1);

    const duration = (endDt.getTime() - startDt.getTime()) / (1000 * 60 * 60);
    const dateStr = format(date, 'yyyy-MM-dd');

    // Payment due date = payment_day of following month
    const paymentDue = new Date(date.getFullYear(), date.getMonth() + 1, workplacePaymentDay);

    const shift: Shift = {
      ...baseShiftData,
      id: generateId(),
      date: dateStr,
      start_datetime: startDt.toISOString(),
      end_datetime: endDt.toISOString(),
      duration_hours: duration,
      recurrence_id: recurrenceId,
      payment_due_date: format(paymentDue, 'yyyy-MM-dd'),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    existingShifts.push(shift);
    createdShifts.push(shift);
  }

  set('shifts', existingShifts);
  return createdShifts;
}

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

// ============================================================
// PAYMENT BATCHES
// ============================================================

export function getPaymentBatches(userId: string): PaymentBatch[] {
  return get<PaymentBatch>('payment_batches').filter(b => b.user_id === userId);
}

export function createPaymentBatch(data: Omit<PaymentBatch, 'id' | 'created_at'>): PaymentBatch {
  const batches = get<PaymentBatch>('payment_batches');
  const batch: PaymentBatch = { ...data, id: generateId(), created_at: new Date().toISOString() };
  batches.push(batch);
  set('payment_batches', batches);
  return batch;
}

// ============================================================
// REPORTS
// ============================================================

export function getReports(userId: string): Report[] {
  return get<Report>('reports').filter(r => r.user_id === userId);
}

export function createReport(data: Omit<Report, 'id' | 'generated_at'>): Report {
  const reports = get<Report>('reports');
  const report: Report = { ...data, id: generateId(), generated_at: new Date().toISOString() };
  reports.push(report);
  set('reports', reports);
  return report;
}

// ============================================================
// ANALYTICS / STATS
// ============================================================

export function getMonthlyStats(userId: string, year: number, month: number): MonthlyStats {
  const shifts = getShiftsByMonth(userId, year, month).filter(s => s.status !== 'cancelado');
  const expected = shifts.reduce((sum, s) => sum + s.expected_value, 0);
  const received = shifts
    .filter(s => s.status === 'recebido' || s.status === 'divergente')
    .reduce((sum, s) => sum + (s.received_value || s.expected_value), 0);
  const overdue = shifts
    .filter(s => s.status === 'atrasado')
    .reduce((sum, s) => sum + s.expected_value, 0);
  const pending = expected - received - overdue;
  const totalHours = shifts.reduce((sum, s) => sum + s.duration_hours, 0);

  return {
    expected,
    received,
    pending: Math.max(0, pending),
    overdue,
    totalShifts: shifts.length,
    totalHours,
    avgPerShift: shifts.length ? expected / shifts.length : 0,
    avgPerHour: totalHours ? expected / totalHours : 0,
  };
}

export function getWorkplaceStats(userId: string, workplaceId: string): WorkplaceStats {
  const wp = getWorkplace(workplaceId);
  if (!wp) throw new Error('Workplace not found');
  const now = new Date();
  const shifts = getShifts(userId).filter(s => s.workplace_id === workplaceId && s.status !== 'cancelado');
  const thisMonthShifts = getShiftsByMonth(userId, now.getFullYear(), now.getMonth() + 1)
    .filter(s => s.workplace_id === workplaceId && s.status !== 'cancelado');

  return {
    workplace: wp,
    totalShifts: shifts.length,
    totalExpected: shifts.reduce((sum, s) => sum + s.expected_value, 0),
    totalReceived: shifts.filter(s => s.status === 'recebido').reduce((sum, s) => sum + (s.received_value || s.expected_value), 0),
    pendingAmount: shifts.filter(s => ['previsto', 'realizado', 'faturado'].includes(s.status)).reduce((sum, s) => sum + s.expected_value, 0),
    overdueAmount: shifts.filter(s => s.status === 'atrasado').reduce((sum, s) => sum + s.expected_value, 0),
    shiftsThisMonth: thisMonthShifts.length,
    expectedThisMonth: thisMonthShifts.reduce((sum, s) => sum + s.expected_value, 0),
  };
}

export function getLast6MonthsData(userId: string): Array<{ month: string; received: number; expected: number }> {
  const result = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const stats = getMonthlyStats(userId, date.getFullYear(), date.getMonth() + 1);
    result.push({
      month: format(date, 'MMM', { locale: ptBR }),
      received: stats.received,
      expected: stats.expected,
    });
  }
  return result;
}

// ============================================================
// SEED DATA (for demo / first-time users)
// ============================================================

export function seedDemoData(userId: string): void {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  // Workplaces
  const wp1 = createWorkplace({
    user_id: userId,
    name: 'Hospital São Marcos',
    type: 'hospital',
    color: '#1877F2',
    default_shift_value: 1400,
    default_duration_hours: 12,
    payment_day: 10,
    payment_method: 'PJ',
    active: true,
  });

  const wp2 = createWorkplace({
    user_id: userId,
    name: 'UPA Leste',
    type: 'upa',
    color: '#22c55e',
    default_shift_value: 1100,
    default_duration_hours: 12,
    payment_day: 15,
    payment_method: 'RPA',
    active: true,
  });

  const wp3 = createWorkplace({
    user_id: userId,
    name: 'Hospital Primavera',
    type: 'hospital',
    color: '#8b5cf6',
    default_shift_value: 2000,
    default_duration_hours: 24,
    payment_day: 5,
    payment_method: 'PJ',
    active: true,
  });

  // Templates
  createShiftTemplate({ user_id: userId, workplace_id: wp1.id, name: 'Dia 7h–19h', start_time: '07:00', end_time: '19:00', duration_hours: 12, default_value: 1400, shift_type: 'dia' });
  createShiftTemplate({ user_id: userId, workplace_id: wp1.id, name: 'Noite 19h–7h', start_time: '19:00', end_time: '07:00', duration_hours: 12, default_value: 1400, shift_type: 'noite' });
  createShiftTemplate({ user_id: userId, workplace_id: wp2.id, name: 'Dia 7h–19h', start_time: '07:00', end_time: '19:00', duration_hours: 12, default_value: 1100, shift_type: 'dia' });
  createShiftTemplate({ user_id: userId, workplace_id: wp3.id, name: '24h', start_time: '07:00', end_time: '07:00', duration_hours: 24, default_value: 2000, shift_type: '24h' });

  // Shifts this month
  const pad = (n: number) => String(n).padStart(2, '0');
  const d = (day: number) => `${year}-${pad(month)}-${pad(day)}`;
  const dt = (day: number, h: number, m = 0) => new Date(year, month - 1, day, h, m).toISOString();

  const shifts = [
    { workplace_id: wp1.id, date: d(2), start: dt(2, 7), end: dt(2, 19), status: 'recebido' as ShiftStatus, expected: 1400, received: 1400 },
    { workplace_id: wp2.id, date: d(5), start: dt(5, 7), end: dt(5, 19), status: 'recebido' as ShiftStatus, expected: 1100, received: 1100 },
    { workplace_id: wp1.id, date: d(8), start: dt(8, 7), end: dt(8, 19), status: 'recebido' as ShiftStatus, expected: 1400, received: 1400 },
    { workplace_id: wp3.id, date: d(10), start: dt(10, 7), end: dt(11, 7), status: 'realizado' as ShiftStatus, expected: 2000, received: undefined },
    { workplace_id: wp1.id, date: d(13), start: dt(13, 19), end: dt(14, 7), status: 'previsto' as ShiftStatus, expected: 1400, received: undefined },
    { workplace_id: wp2.id, date: d(13), start: dt(13, 7), end: dt(13, 19), status: 'previsto' as ShiftStatus, expected: 1100, received: undefined },
    { workplace_id: wp1.id, date: d(16), start: dt(16, 7), end: dt(16, 19), status: 'previsto' as ShiftStatus, expected: 1400, received: undefined },
    { workplace_id: wp2.id, date: d(20), start: dt(20, 7), end: dt(20, 19), status: 'atrasado' as ShiftStatus, expected: 1100, received: undefined },
    { workplace_id: wp3.id, date: d(22), start: dt(22, 7), end: dt(23, 7), status: 'previsto' as ShiftStatus, expected: 2000, received: undefined },
    { workplace_id: wp1.id, date: d(27), start: dt(27, 7), end: dt(27, 19), status: 'previsto' as ShiftStatus, expected: 1400, received: undefined },
  ];

  const shiftsList = get<Shift>('shifts');
  for (const s of shifts) {
    const start = new Date(s.start);
    const end = new Date(s.end);
    const duration = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
    const paymentDue = new Date(year, month, s.workplace_id === wp1.id ? 10 : s.workplace_id === wp2.id ? 15 : 5);
    const wp = s.workplace_id === wp1.id ? wp1 : s.workplace_id === wp2.id ? wp2 : wp3;

    shiftsList.push({
      id: generateId(),
      user_id: userId,
      workplace_id: s.workplace_id,
      title: `Plantão ${wp.name}`,
      date: s.date,
      start_datetime: s.start,
      end_datetime: s.end,
      duration_hours: duration,
      expected_value: s.expected,
      received_value: s.received,
      status: s.status,
      payment_due_date: format(paymentDue, 'yyyy-MM-dd'),
      payment_received_date: s.status === 'recebido' ? new Date().toISOString() : undefined,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }
  set('shifts', shiftsList);
}

export { format, parseISO };
export { ptBR };
export { startOfMonth, endOfMonth, addDays, addWeeks, addMonths, isAfter, isBefore };
