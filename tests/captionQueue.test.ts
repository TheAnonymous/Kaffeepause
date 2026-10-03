import { describe, expect, it } from 'vitest';
import { CaptionQueue } from '../src/captionQueue';

describe('Untertitel der Reihe nach', () => {
  it('lässt einen Hinweis erst stehen, bevor der nächste gleich wichtige erscheint', () => {
    const queue = new CaptionQueue();
    expect(queue.push('Du bist im Café.', 'info', 0)).toBe('Du bist im Café.');
    expect(queue.push('Charles ist auch da.', 'info', 0.1)).toBeUndefined();
    expect(queue.tick(2)).toEqual({});
    expect(queue.tick(3.6)).toEqual({ show: 'Charles ist auch da.' });
  });

  it('zeigt eine Geschichte sofort, auch wenn gerade ein Hinweis steht, aber nicht umgekehrt', () => {
    const queue = new CaptionQueue();
    queue.push('Du bist im Café.', 'info', 0);
    expect(queue.push('Mara schlägt ihr Skizzenbuch auf.', 'event', 0.5)).toBe('Mara schlägt ihr Skizzenbuch auf.');
    expect(queue.push('Charles ist auch da.', 'info', 1)).toBeUndefined();
    expect(queue.tick(3)).toEqual({});
    expect(queue.tick(4.1)).toEqual({ show: 'Charles ist auch da.' });
  });

  it('antwortet auf Klicks immer sofort', () => {
    const queue = new CaptionQueue();
    queue.push('Eine Geschichte beginnt.', 'event', 0);
    expect(queue.push('Klingeling!', 'interaction', 0.2)).toBe('Klingeling!');
  });

  it('blendet aus, wenn nichts nachkommt, und vergisst veraltete Hinweise', () => {
    const queue = new CaptionQueue();
    queue.push('Eine Geschichte beginnt.', 'event', 0);
    queue.push('Eine zweite Geschichte.', 'event', 0.1);
    queue.push('Ein alter Hinweis.', 'info', 0.2);
    expect(queue.tick(3.6)).toEqual({ show: 'Eine zweite Geschichte.' });
    // Der Hinweis wartet zu lange und erledigt sich.
    expect(queue.tick(20)).toEqual({ hide: true });
    expect(queue.tick(30)).toEqual({});
  });

  it('wiederholt denselben Untertitel nicht', () => {
    const queue = new CaptionQueue();
    queue.push('Mochi schnurrt.', 'info', 0);
    expect(queue.push('Mochi schnurrt.', 'info', 1)).toBeUndefined();
    expect(queue.tick(4)).toEqual({});
  });
});
