/**
 * Zstandard decoding for dsh session logs.
 *
 * Session artifacts are CONCATENATED zstd frames (one header frame + one
 * frame per appended durable batch), each checksummed. Node's one-shot
 * `zstdDecompressSync` only decodes the FIRST frame, so the full plaintext is
 * recovered by scanning frame structure (adapted from
 * `packages/session/session-persistence-jsonl/src/zstd.ts`, MIT-licensed DSH
 * source) and decoding frame by frame.
 * @module dsh-usage-lens/zstd
 */

import { zstdDecompressSync } from 'node:zlib'

const ZSTD_MAGIC = 0xFD2FB528

/** Byte range of one structurally complete zstd frame. */
export interface ZstdFrameRange {
  start: number
  end: number
}

/**
 * Locate complete frames without decompressing their blocks. Invalid complete
 * structure rejects; EOF inside the final frame returns its start for repair.
 */
export function scanZstdFrames(buffer: Buffer): { frames: ZstdFrameRange[]; tornStart?: number } {
  const frames: ZstdFrameRange[] = []
  let offset = 0
  const length = buffer.length

  while (offset < length) {
    const start = offset
    if (length - offset < 4) return { frames, tornStart: start }
    if (buffer.readUInt32LE(offset) !== ZSTD_MAGIC) {
      throw new Error(`corrupt Zstandard session log: invalid frame magic at byte ${offset}`)
    }
    offset += 4
    if (offset === length) return { frames, tornStart: start }
    const descriptor = buffer.readUInt8(offset)
    offset += 1
    if ((descriptor & 0x18) !== 0) {
      throw new Error(`corrupt Zstandard session log: reserved frame-header bit at byte ${offset - 1}`)
    }
    const contentSizeFlag = descriptor >>> 6
    const singleSegment = (descriptor & 0x20) !== 0
    const checksum = (descriptor & 0x04) !== 0
    const dictionaryFlag = descriptor & 0x03
    const dictionaryBytes = dictionaryFlag === 3 ? 4 : dictionaryFlag
    const contentSizeBytes = contentSizeFlag === 0 ? (singleSegment ? 1 : 0) : 1 << contentSizeFlag
    const remainingHeaderBytes = (singleSegment ? 0 : 1) + dictionaryBytes + contentSizeBytes
    if (length - offset < remainingHeaderBytes) return { frames, tornStart: start }
    offset += remainingHeaderBytes

    for (;;) {
      if (length - offset < 3) return { frames, tornStart: start }
      const blockHeader = buffer.readUIntLE(offset, 3)
      offset += 3
      const lastBlock = (blockHeader & 1) !== 0
      const blockType = (blockHeader >>> 1) & 0x03
      const blockSize = blockHeader >>> 3
      if (blockType === 0x03) {
        throw new Error(`corrupt Zstandard session log: reserved block type at byte ${offset - 3}`)
      }
      const payloadBytes = blockType === 0x01 ? 1 : blockSize
      if (length - offset < payloadBytes) return { frames, tornStart: start }
      offset += payloadBytes
      if (lastBlock) break
    }
    if (checksum) {
      if (length - offset < 4) return { frames, tornStart: start }
      offset += 4
    }
    frames.push({ start, end: offset })
  }
  return { frames }
}

/**
 * Decompress a complete session artifact to plaintext. Prefers one pass when
 * the whole buffer is a single frame; otherwise decodes every complete frame
 * in order and concatenates. A torn (incomplete) final frame is dropped —
 * the durable log always ends on a complete frame boundary.
 * @throws on structurally invalid input or a frame zstd refuses to decode.
 */
export function decompressSessionLog(buffer: Buffer): string {
  const { frames, tornStart } = scanZstdFrames(buffer)
  if (frames.length === 0) {
    throw new Error('corrupt Zstandard session log: no complete frames found')
  }
  const parts: string[] = []
  for (const frame of frames) {
    parts.push(zstdDecompressSync(buffer.subarray(frame.start, frame.end)).toString('utf8'))
  }
  if (tornStart !== undefined) {
    // The torn frame is a partial write tail; the durable log ignores it.
  }
  return parts.join('')
}

/** Parse a decompressed log into per-line event objects (skip blank lines). */
export function parseLogLines(text: string): unknown[] {
  const events: unknown[] = []
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '') continue
    events.push(JSON.parse(trimmed))
  }
  return events
}
