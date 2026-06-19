import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SettingsService } from '../settings/settings.service';

@Injectable()
export class DelayService {
  private readonly log = new Logger(DelayService.name);

  readonly activeHoursTimezone: string;

  // env defaults — used when no DB override is stored
  private readonly _defaultMeanMs: number;
  private readonly _defaultStdDevMs: number;
  private readonly _defaultFloorMs: number;
  private readonly _defaultCeilingMs: number;
  private readonly _defaultTypingMs: number;

  constructor(
    config: ConfigService,
    private readonly settings: SettingsService,
  ) {
    this._defaultMeanMs = +(config.get<string>('DELAY_MEAN_MS') ?? '120000');
    this._defaultStdDevMs = +(config.get<string>('DELAY_STD_DEV_MS') ?? '35000');
    this._defaultFloorMs = +(config.get<string>('DELAY_FLOOR_MS') ?? '60000');
    this._defaultCeilingMs = +(config.get<string>('DELAY_CEILING_MS') ?? '480000');
    this._defaultTypingMs = +(config.get<string>('TYPING_SIMULATION_MS') ?? '3000');
    this.activeHoursTimezone = config.get<string>('ACTIVE_HOURS_TIMEZONE') ?? 'UTC';
    this.log.debug(`Delay engine initialized tz=${this.activeHoursTimezone}`);
  }

  // Getters read from DB settings (hot-reloadable) with env fallback
  get meanMs(): number { return +(this.settings.get('DELAY_MEAN_MS') ?? this._defaultMeanMs); }
  get stdDevMs(): number { return +(this.settings.get('DELAY_STD_DEV_MS') ?? this._defaultStdDevMs); }
  get floorMs(): number { return +(this.settings.get('DELAY_FLOOR_MS') ?? this._defaultFloorMs); }
  get ceilingMs(): number { return +(this.settings.get('DELAY_CEILING_MS') ?? this._defaultCeilingMs); }
  get typingMs(): number { return +(this.settings.get('TYPING_SIMULATION_MS') ?? this._defaultTypingMs); }

  computeDelayMs(): number {
    const raw = this.gaussianSample(this.meanMs, this.stdDevMs);
    return Math.max(this.floorMs, Math.min(this.ceilingMs, Math.round(raw)));
  }

  isWithinActiveHours(activeFrom: number, activeTo: number): boolean {
    const hour = this.currentHourInTz();
    if (activeFrom <= activeTo) {
      return hour >= activeFrom && hour < activeTo;
    }
    return hour >= activeFrom || hour < activeTo;
  }

  msUntilMidnight(): number {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setDate(midnight.getDate() + 1);
    midnight.setHours(0, 0, 0, 0);
    // Clamp to at least 60 s so the job isn't immediately re-picked
    return Math.max(midnight.getTime() - now.getTime(), 60_000);
  }

  msUntilNextWindow(activeFrom: number): number {
    const now = new Date();
    const dtf = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
      timeZone: this.activeHoursTimezone,
    });
    const parts = dtf.formatToParts(now);
    const tzHour = (() => {
      const h = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10);
      return h === 24 ? 0 : h;
    })();
    const tzMinute = parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0', 10);

    let minutesUntil = (activeFrom - tzHour) * 60 - tzMinute;
    if (minutesUntil <= 0) minutesUntil += 24 * 60;
    return minutesUntil * 60 * 1000;
  }

  private currentHourInTz(): number {
    const parts = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      hour12: false,
      timeZone: this.activeHoursTimezone,
    }).formatToParts(new Date());
    const h = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10);
    return h === 24 ? 0 : h;
  }

  private gaussianSample(mean: number, stdDev: number): number {
    const u1 = 1 - Math.random();
    const u2 = Math.random();
    const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + z0 * stdDev;
  }
}
