import { deriveVncDesKey, desEncryptBlock, encryptVncChallengeDes } from './vnc-des';

describe('Pure TypeScript VNC DES-ECB (RFC 6143 & NIST FIPS 46-3)', () => {
  it('matches the NIST FIPS 46-3 standard DES single-block test vector', () => {
    // Classic NIST SP 800-17 / FIPS 46-3 test vector:
    // Key:       133457799BBCDFF1
    // Plaintext: 0123456789ABCDEF
    // Expected:  85E813540F0AB405
    const key = Buffer.from('133457799BBCDFF1', 'hex');
    const pt = Buffer.from('0123456789ABCDEF', 'hex');
    const ct = desEncryptBlock(pt, key);
    expect(ct.toString('hex').toUpperCase()).toBe('85E813540F0AB405');
  });

  it('matches a second independent NIST DES test vector', () => {
    // Key:       0E329232EA6D0D73
    // Plaintext: 8787878787878787
    // Expected:  0000000000000000
    const key = Buffer.from('0E329232EA6D0D73', 'hex');
    const pt = Buffer.from('8787878787878787', 'hex');
    const ct = desEncryptBlock(pt, key);
    expect(ct.toString('hex').toUpperCase()).toBe('0000000000000000');
  });

  it('bit-reverses VNC passwords and pads/truncates to 8 bytes per RFC 6143', () => {
    // 'A' = 0x41 = 01000001 -> reversed = 10000010 = 0x82
    // '1' = 0x31 = 00110001 -> reversed = 10001100 = 0x8C
    const key = deriveVncDesKey('A1');
    expect(key.length).toBe(8);
    expect(key[0]).toBe(0x82);
    expect(key[1]).toBe(0x8c);
    expect(key.subarray(2)).toEqual(Buffer.alloc(6, 0));

    // Passwords longer than 8 bytes truncate cleanly to 8 bytes
    expect(deriveVncDesKey('1234567890')).toEqual(deriveVncDesKey('12345678'));
  });

  it('encrypts a 16-byte VNC challenge into a deterministic 16-byte response', () => {
    const challenge = Buffer.from('00112233445566778899AABBCCDDEEFF', 'hex');
    const resp = encryptVncChallengeDes(challenge, '100');
    expect(resp.length).toBe(16);
    // Two identical 8-byte challenge halves must produce identical ECB halves
    const dupChal = Buffer.from('0123456789ABCDEF0123456789ABCDEF', 'hex');
    const dupResp = encryptVncChallengeDes(dupChal, 'techno');
    expect(dupResp.subarray(0, 8)).toEqual(dupResp.subarray(8, 16));
  });

  it('throws if challenge buffer is shorter than 16 bytes', () => {
    expect(() => encryptVncChallengeDes(Buffer.alloc(8), 'pw')).toThrow();
  });
});
