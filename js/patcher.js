/* ROM patcher — IPS, UPS, BPS. Pure JS, runs fully on-device. */
const Patcher = (() => {

  /* ---------- CRC32 ---------- */
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(u8) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  /* ---------- IPS ---------- */
  function applyIPS(romBuf, patchBuf) {
    const rom = new Uint8Array(romBuf), p = new Uint8Array(patchBuf);
    if (String.fromCharCode(...p.subarray(0, 5)) !== "PATCH") throw new Error("Not a valid IPS patch");
    let i = 5, maxEnd = rom.length, records = [];
    while (i < p.length) {
      if (p[i] === 0x45 && p[i+1] === 0x4F && p[i+2] === 0x46) { i += 3; break; } // EOF
      const off = (p[i] << 16) | (p[i+1] << 8) | p[i+2]; i += 3;
      let size = (p[i] << 8) | p[i+1]; i += 2;
      if (size === 0) { // RLE
        const rle = (p[i] << 8) | p[i+1]; i += 2;
        const val = p[i]; i += 1;
        records.push({ off, rle, val });
        maxEnd = Math.max(maxEnd, off + rle);
      } else {
        records.push({ off, data: p.subarray(i, i + size) });
        maxEnd = Math.max(maxEnd, off + size);
        i += size;
      }
    }
    let truncate = null;
    if (i + 3 <= p.length) truncate = (p[i] << 16) | (p[i+1] << 8) | p[i+2];
    const outLen = truncate !== null ? truncate : maxEnd;
    const out = new Uint8Array(outLen);
    out.set(rom.subarray(0, Math.min(rom.length, outLen)));
    for (const r of records) {
      if (r.data) out.set(r.data, r.off);
      else out.fill(r.val, r.off, r.off + r.rle);
    }
    return out.buffer;
  }

  /* ---------- UPS ---------- */
  function readVarint(p, st) {
    let data = 0, shift = 1;
    for (;;) {
      const x = p[st.i++];
      data += (x & 0x7F) * shift;
      if (x & 0x80) break;
      shift *= 128;
      data += shift;
    }
    return data;
  }
  function applyUPS(romBuf, patchBuf) {
    const rom = new Uint8Array(romBuf), p = new Uint8Array(patchBuf);
    if (String.fromCharCode(...p.subarray(0, 4)) !== "UPS1") throw new Error("Not a valid UPS patch");
    const st = { i: 4 };
    const inSize = readVarint(p, st), outSize = readVarint(p, st);
    const dv = new DataView(patchBuf);
    const crcIn = dv.getUint32(p.length - 12, true);
    const crcOut = dv.getUint32(p.length - 8, true);
    const warn = [];
    if (rom.length !== inSize && rom.length !== outSize) warn.push(`ROM size ${rom.length} ≠ expected ${inSize}`);
    const romCrc = crc32(rom);
    if (romCrc !== crcIn && romCrc !== crcOut) warn.push("ROM checksum doesn't match the patch (wrong base ROM or wrong version?)");
    const out = new Uint8Array(outSize);
    out.set(rom.subarray(0, Math.min(rom.length, outSize)));
    let o = 0;
    const end = p.length - 12;
    while (st.i < end) {
      o += readVarint(p, st);
      while (st.i < end) {
        const b = p[st.i++];
        if (b === 0) break;
        if (o < outSize) out[o] ^= b;
        o++;
      }
      o++;
    }
    if (crc32(out) !== crcOut) warn.push("Output checksum mismatch — patched ROM may be unusable.");
    return { buffer: out.buffer, warnings: warn };
  }

  /* ---------- BPS ---------- */
  function applyBPS(romBuf, patchBuf) {
    const src = new Uint8Array(romBuf), p = new Uint8Array(patchBuf);
    if (String.fromCharCode(...p.subarray(0, 4)) !== "BPS1") throw new Error("Not a valid BPS patch");
    const st = { i: 4 };
    const srcSize = readVarint(p, st), tgtSize = readVarint(p, st), metaSize = readVarint(p, st);
    st.i += metaSize;
    const dv = new DataView(patchBuf);
    const crcSrc = dv.getUint32(p.length - 12, true);
    const crcTgt = dv.getUint32(p.length - 8, true);
    const warn = [];
    if (src.length !== srcSize) warn.push(`ROM size ${src.length} ≠ expected ${srcSize}`);
    if (crc32(src) !== crcSrc) warn.push("ROM checksum doesn't match the patch (wrong base ROM or wrong version?)");
    const out = new Uint8Array(tgtSize);
    let o = 0, srcRel = 0, tgtRel = 0;
    const end = p.length - 12;
    while (st.i < end) {
      const data = readVarint(p, st);
      const cmd = data & 3, len = (data >> 2) + 1;
      if (cmd === 0) {            // SourceRead
        for (let j = 0; j < len; j++) { out[o] = src[o]; o++; }
      } else if (cmd === 1) {     // TargetRead
        for (let j = 0; j < len; j++) out[o++] = p[st.i++];
      } else if (cmd === 2) {     // SourceCopy
        const d = readVarint(p, st);
        srcRel += (d & 1 ? -1 : 1) * (d >> 1);
        for (let j = 0; j < len; j++) out[o++] = src[srcRel++];
      } else {                    // TargetCopy
        const d = readVarint(p, st);
        tgtRel += (d & 1 ? -1 : 1) * (d >> 1);
        for (let j = 0; j < len; j++) out[o++] = out[tgtRel++];
      }
    }
    if (crc32(out) !== crcTgt) warn.push("Output checksum mismatch — patched ROM may be unusable.");
    return { buffer: out.buffer, warnings: warn };
  }

  function apply(romBuf, patchBuf, patchName) {
    const ext = (patchName.split(".").pop() || "").toLowerCase();
    if (ext === "ips") return { buffer: applyIPS(romBuf, patchBuf), warnings: [] };
    if (ext === "ups") return applyUPS(romBuf, patchBuf);
    if (ext === "bps") return applyBPS(romBuf, patchBuf);
    // sniff magic
    const m = String.fromCharCode(...new Uint8Array(patchBuf, 0, 5));
    if (m.startsWith("PATCH")) return { buffer: applyIPS(romBuf, patchBuf), warnings: [] };
    if (m.startsWith("UPS1")) return applyUPS(romBuf, patchBuf);
    if (m.startsWith("BPS1")) return applyBPS(romBuf, patchBuf);
    throw new Error("Unsupported patch format (use .ips, .ups or .bps)");
  }

  return { apply, crc32 };
})();
