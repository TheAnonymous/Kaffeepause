// Reihenfolge der Untertitel: Jeder steht lange genug, um ihn zu lesen, und nichts überschreibt
// einen wichtigeren Untertitel. Früher löste jeder neue den alten sofort ab; beim Betreten verdrängte
// etwa der Hinweis auf einen Freund die Begrüßung im selben Augenblick.

/** Klick der zuschauenden Person > Geschichte, Moment oder Missgeschick > alles Übrige. */
export type CaptionPriority = 'info' | 'event' | 'interaction';

const RANK: Readonly<Record<CaptionPriority, number>> = { info: 0, event: 1, interaction: 2 };

export interface CaptionTiming {
  /** So lange steht ein Untertitel mindestens, bevor ein gleich wichtiger ihn ablöst. */
  readonly minimumSeconds: number;
  /** Danach blendet er aus, wenn nichts nachkommt. */
  readonly displaySeconds: number;
  /** Wartende Hinweise, die so alt sind, haben sich erledigt. */
  readonly staleSeconds: number;
}

export const DEFAULT_CAPTION_TIMING: CaptionTiming = { minimumSeconds: 3.5, displaySeconds: 6.5, staleSeconds: 14 };

interface Entry {
  readonly text: string;
  readonly priority: CaptionPriority;
  readonly at: number;
}

export interface CaptionStep {
  /** Diesen Untertitel jetzt zeigen. */
  readonly show?: string;
  /** Den Untertitel ausblenden. */
  readonly hide?: boolean;
}

export class CaptionQueue {
  private current?: Entry;
  private visible = false;
  private readonly waiting: Entry[] = [];

  constructor(private readonly timing: CaptionTiming = DEFAULT_CAPTION_TIMING) {}

  /** Neuer Untertitel; gibt ihn zurück, wenn er sofort erscheinen soll, sonst wartet er. */
  push(text: string, priority: CaptionPriority, now: number): string | undefined {
    if (this.visible && this.current?.text === text) return undefined;
    if (this.waiting.some((entry) => entry.text === text)) return undefined;
    const entry: Entry = { text, priority, at: now };
    const current = this.visible ? this.current : undefined;
    const outranks = !current || RANK[priority] > RANK[current.priority];
    const readLongEnough = current !== undefined && now - current.at >= this.timing.minimumSeconds && RANK[priority] >= RANK[current.priority];
    if (outranks || readLongEnough || priority === 'interaction') {
      this.show(entry);
      return text;
    }
    this.waiting.push(entry);
    return undefined;
  }

  /** Regelmäßig aufrufen: zeigt den nächsten wartenden Untertitel oder blendet aus. */
  tick(now: number): CaptionStep {
    for (let index = this.waiting.length - 1; index >= 0; index -= 1) {
      const entry = this.waiting[index]!;
      if (entry.priority === 'info' && now - entry.at > this.timing.staleSeconds) this.waiting.splice(index, 1);
    }
    const current = this.visible ? this.current : undefined;
    if (current && now - current.at < this.timing.minimumSeconds) return {};
    if (this.waiting.length > 0) {
      // Der wichtigste wartende zuerst, bei gleichem Rang der ältere.
      this.waiting.sort((left, right) => RANK[right.priority] - RANK[left.priority] || left.at - right.at);
      const next = this.waiting.shift()!;
      this.show({ ...next, at: now });
      return { show: next.text };
    }
    if (current && now - current.at >= this.timing.displaySeconds) {
      this.visible = false;
      return { hide: true };
    }
    return {};
  }

  private show(entry: Entry): void {
    this.current = entry;
    this.visible = true;
  }
}
