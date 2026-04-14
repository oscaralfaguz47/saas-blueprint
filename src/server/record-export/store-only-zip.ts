import "server-only";

import { createHash } from "node:crypto";

function crc32(data: Uint8Array): number {
  let c = ~0 >>> 0;
  for (let i = 0; i < data.length; i++) {
    c ^= data[i]!;
    for (let k = 0; k < 8; k++) {
      c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
  }
  return (~c) >>> 0;
}

function u16(n: number): Uint8Array {
  const b = new Uint8Array(2);
  b[0] = n & 0xff;
  b[1] = (n >>> 8) & 0xff;
  return b;
}

function u32(n: number): Uint8Array {
  const b = new Uint8Array(4);
  b[0] = n & 0xff;
  b[1] = (n >>> 8) & 0xff;
  b[2] = (n >>> 16) & 0xff;
  b[3] = (n >>> 24) & 0xff;
  return b;
}

function concat(chunks: Uint8Array[]): Buffer {
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const out = Buffer.allocUnsafe(total);
  let o = 0;
  for (const c of chunks) {
    Buffer.from(c).copy(out, o);
    o += c.length;
  }
  return out;
}

const LOCAL_SIG = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

/** ZIP store-only (no compression) for audit bundles. */
export function buildStoreOnlyZip(files: { name: string; data: Buffer }[]): Buffer {
  const localChunks: Buffer[] = [];
  const centralChunks: Buffer[] = [];
  let cursor = 0;

  for (const f of files) {
    const nameBytes = Buffer.from(f.name, "utf8");
    const data = f.data;
    const crc = crc32(new Uint8Array(data));
    const size = data.length;
    const localOffset = cursor;

    const local = concat([
      LOCAL_SIG,
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(size),
      u32(size),
      u16(nameBytes.length),
      u16(0),
      nameBytes,
      data,
    ]);
    localChunks.push(local);
    cursor += local.length;

    const centralRecord = concat([
      Buffer.from([0x50, 0x4b, 0x01, 0x02]),
      u16(20),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(size),
      u32(size),
      u16(nameBytes.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(localOffset),
      nameBytes,
    ]);
    centralChunks.push(centralRecord);
  }

  const locals = Buffer.concat(localChunks);
  const central = Buffer.concat(centralChunks);
  const centralOffset = cursor;

  const end = concat([
    Buffer.from([0x50, 0x4b, 0x05, 0x06]),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(central.length),
    u32(centralOffset),
    u16(0),
  ]);

  return Buffer.concat([locals, central, end]);
}

export function sha256Hex(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}
