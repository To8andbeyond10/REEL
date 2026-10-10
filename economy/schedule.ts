/**
 * The owner's RTP controls, built so they can't be used to cheat. The owner never edits odds. They schedule
 * which pre-published paytable ("tide") a mode runs, and the schedule doubles as the audit trail:
 *  - every tide's paytable is compiled ahead of time inside RTP_LIMITS and published with its hash;
 *  - a window must be announced minNoticeMinutes before it starts, and it applies to everyone in that mode;
 *  - entries are append-only and hash-chained, so a past or running window can't be rewritten unnoticed;
 *  - every cast records the paytable hash it used, so any player can check it against the schedule.
 * Publish `head` somewhere you can't edit later (a public post, or a memo transaction on-chain) every day.
 */
import { createHash } from 'node:crypto';
import { MODES, SCHEDULE_RULES, TIDES, type ModeKey, type TideKey } from './config.ts';
import { compileMode, type CompiledMode } from './paytable.ts';

export type TideWindow = {
  mode: ModeKey;
  tide: TideKey;
  start: number;
  end: number;
  announcedAt: number;
  paytableHash: string;
  prevHash: string;
  hash: string;
};

export type PaytableSet = Record<ModeKey, Record<TideKey, CompiledMode>>;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const GENESIS = '0'.repeat(64);

const entryHash = (e: Omit<TideWindow, 'hash'>) =>
  createHash('sha256')
    .update(JSON.stringify([e.prevHash, e.mode, e.tide, e.start, e.end, e.announcedAt, e.paytableHash]))
    .digest('hex');

/** Every paytable the schedule can switch to. Compiling them all up front is what enforces RTP_LIMITS. */
export function publishPaytables(): PaytableSet {
  const set = {} as PaytableSet;
  for (const mode of Object.keys(MODES) as ModeKey[]) {
    set[mode] = {} as Record<TideKey, CompiledMode>;
    for (const tide of Object.keys(TIDES) as TideKey[]) set[mode][tide] = compileMode(mode, MODES[mode], tide);
  }
  return set;
}

export class TideSchedule {
  readonly entries: TideWindow[] = [];
  readonly paytables: PaytableSet;

  constructor(paytables: PaytableSet = publishPaytables()) {
    this.paytables = paytables;
  }

  get head() {
    return this.entries.at(-1)?.hash ?? GENESIS;
  }

  /** Appends a window, or throws with the rule it breaks. `now` is the server clock in ms. */
  announce(mode: ModeKey, tide: TideKey, start: number, end: number, now: number): TideWindow {
    const rules = SCHEDULE_RULES;
    if (start < now + rules.minNoticeMinutes * 60_000) throw new Error(`needs ${rules.minNoticeMinutes} min notice`);
    if (end <= start || end - start > rules.maxWindowHours * HOUR) {
      throw new Error(`a window lasts more than 0 and at most ${rules.maxWindowHours}h`);
    }
    const sameMode = this.entries.filter((e) => e.mode === mode);
    if (sameMode.some((e) => start < e.end && e.start < end)) throw new Error('overlaps an announced window');
    const day = Math.floor(start / DAY);
    const sameDay = sameMode.filter((e) => Math.floor(e.start / DAY) === day);
    if (sameDay.length >= rules.maxWindowsPerModePerDay) {
      throw new Error(`max ${rules.maxWindowsPerModePerDay} windows per mode per day`);
    }
    if (TIDES[tide].rtpDelta < 0) {
      const belowBase = sameDay.filter((e) => TIDES[e.tide].rtpDelta < 0).reduce((h, e) => h + e.end - e.start, 0);
      if (belowBase + (end - start) > rules.maxBelowBaseHoursPerDay * HOUR) {
        throw new Error(`max ${rules.maxBelowBaseHoursPerDay}h below base RTP per mode per day`);
      }
    }
    const base = { mode, tide, start, end, announcedAt: now, paytableHash: this.paytables[mode][tide].hash, prevHash: this.head };
    const entry = { ...base, hash: entryHash(base) };
    this.entries.push(entry);
    return entry;
  }

  /** The paytable for a cast that starts at `at`. Outside any window a mode runs its normal tide. */
  paytableAt(mode: ModeKey, at: number): CompiledMode {
    const w = this.entries.find((e) => e.mode === mode && e.start <= at && at < e.end);
    return this.paytables[mode][w ? w.tide : 'normal'];
  }

  /** Recomputes the chain. False means an entry was changed after it was announced. */
  verify(): boolean {
    let prev = GENESIS;
    for (const { hash, ...base } of this.entries) {
      if (base.prevHash !== prev || entryHash(base) !== hash) return false;
      prev = hash;
    }
    return true;
  }
}
