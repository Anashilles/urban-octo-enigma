/** Narrations are short voice recordings made in the browser. */
export const MAX_NARRATION_BYTES = 5 * 1024 * 1024;
export const MAX_NARRATION_MS = 3 * 60 * 1000;

/** Formats browsers' MediaRecorder produce, identified by their content, never by the declared type. */
export const NARRATION_FORMATS = {
  webm: { mimeType: "audio/webm", ext: "webm" },
  ogg: { mimeType: "audio/ogg", ext: "ogg" },
  mp4: { mimeType: "audio/mp4", ext: "m4a" },
} as const;
export type NarrationFormat = keyof typeof NARRATION_FORMATS;

export function detectAudioFormat(bytes: Uint8Array): NarrationFormat | null {
  if (bytes.length < 12) return null;
  // WebM/Matroska: EBML header 1A 45 DF A3
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return "webm";
  // Ogg: "OggS"
  if (bytes[0] === 0x4f && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53) return "ogg";
  // ISO BMFF (MP4/M4A): "ftyp" box at offset 4
  if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) return "mp4";
  return null;
}
