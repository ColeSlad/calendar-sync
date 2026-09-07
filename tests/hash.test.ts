import { describe, expect, it } from 'vitest';
import { deterministicEventId } from '../lib/core/hash';

describe('deterministicEventId', () => {
  it('is stable and accepted by the Google Calendar ID alphabet', async () => {
    const first = await deterministicEventId('gradescope', '123:456');
    const second = await deterministicEventId('gradescope', '123:456');

    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-v]{5,1024}$/);
  });
});

