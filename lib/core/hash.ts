const BASE32_HEX = '0123456789abcdefghijklmnopqrstuv';

export async function sha256Base32Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  let bits = 0;
  let value = 0;
  let output = '';

  for (const byte of digest) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_HEX[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_HEX[(value << (5 - bits)) & 31];
  return output;
}

export async function deterministicEventId(
  connectorId: string,
  sourceId: string,
): Promise<string> {
  return `cs${(await sha256Base32Hex(`${connectorId}:${sourceId}`)).slice(0, 50)}`;
}

export async function sourceHash(value: unknown): Promise<string> {
  return sha256Base32Hex(JSON.stringify(value));
}

