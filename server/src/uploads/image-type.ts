export type ImageType = 'image/png' | 'image/jpeg' | 'image/webp';

/** Identifies an image from its first bytes. The declared MIME type and file name are never trusted. */
export function detectImageType(b: Buffer): ImageType | null {
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null; // svg and gif are refused on purpose: svg can carry scripts
}
