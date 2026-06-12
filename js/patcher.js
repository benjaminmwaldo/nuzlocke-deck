/* ROM patcher — IPS, UPS, BPS, xdelta3/VCDIFF. Pure JS, runs fully on-device. */
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

  /* ---------- xdelta3 / VCDIFF (RFC 3284) ---------- */
  // VCDIFF varint: base-128, big-endian, high bit = continuation
  function vcdInt(p, st) {
    let v = 0;
    for (;;) {
      const b = p[st.i++];
      v = (v * 128) + (b & 0x7F);
      if (!(b & 0x80)) return v;
      if (st.i > p.length) throw new Error("Corrupt VCDIFF varint");
    }
  }

  // Default instruction code table (RFC 3284 sec 5.6). Types: 0 NOOP, 1 ADD, 2 RUN, 3 COPY
  const VCD_TABLE = (() => {
    const t = [];
    const e = (t1, s1, m1, t2, s2, m2) => t.push([t1, s1, m1, t2, s2, m2]);
    e(2, 0, 0, 0, 0, 0);                                        // 0: RUN
    for (let s = 0; s <= 17; s++) e(1, s, 0, 0, 0, 0);          // 1-18: ADD 0,[1,17]
    for (let m = 0; m <= 8; m++) {                              // 19-162: COPY 0,[4,18] x mode
      e(3, 0, m, 0, 0, 0);
      for (let s = 4; s <= 18; s++) e(3, s, m, 0, 0, 0);
    }
    for (let m = 0; m <= 5; m++)                                // 163-234: ADD[1,4]+COPY[4,6]
      for (let sa = 1; sa <= 4; sa++)
        for (let sc = 4; sc <= 6; sc++) e(1, sa, 0, 3, sc, m);
    for (let m = 6; m <= 8; m++)                                // 235-246: ADD[1,4]+COPY 4
      for (let sa = 1; sa <= 4; sa++) e(1, sa, 0, 3, 4, m);
    for (let m = 0; m <= 8; m++) e(3, 4, m, 1, 1, 0);           // 247-255: COPY 4+ADD 1
    return t;
  })();

  function adler32(u8) {
    let a = 1, b = 0;
    for (let i = 0; i < u8.length; i++) { a = (a + u8[i]) % 65521; b = (b + a) % 65521; }
    return ((b << 16) | a) >>> 0;
  }

  function flatten(chunks, total) {
    if (chunks.length === 1) return chunks[0];
    const all = new Uint8Array(total);
    let o = 0;
    for (const c of chunks) { all.set(c, o); o += c.length; }
    chunks.length = 0; chunks.push(all);
    return all;
  }

  function applyXDelta(romBuf, patchBuf) {
    const src = new Uint8Array(romBuf), p = new Uint8Array(patchBuf);
    const warn = [];
    if (!(p[0] === 0xD6 && p[1] === 0xC3 && p[2] === 0xC4)) throw new Error("Not a valid xdelta3/VCDIFF patch");
    const st = { i: 4 }; // skip magic + version
    const hdr = p[st.i++];
    if (hdr & 0x01) throw new Error("Patch uses secondary compression — not supported. Re-encode it with: xdelta3 -S none");
    if (hdr & 0x02) throw new Error("Patch uses a custom VCDIFF code table — not supported");
    if (hdr & 0x04) { const len = vcdInt(p, st); st.i += len; } // skip app header

    const out = [];
    let outLen = 0;

    while (st.i < p.length) {
      const winInd = p[st.i++];
      let srcSegLen = 0, srcSegPos = 0, fromSource = false, fromTarget = false;
      if (winInd & 0x01) { fromSource = true; srcSegLen = vcdInt(p, st); srcSegPos = vcdInt(p, st); }
      else if (winInd & 0x02) { fromTarget = true; srcSegLen = vcdInt(p, st); srcSegPos = vcdInt(p, st); }
      vcdInt(p, st); // delta encoding length (unused)
      const tgtLen = vcdInt(p, st);
      const deltaInd = p[st.i++];
      if (deltaInd & 0x07) throw new Error("Per-section compression in VCDIFF window — not supported");
      const dataLen = vcdInt(p, st), instLen = vcdInt(p, st), addrLen = vcdInt(p, st);
      let winAdler = null;
      if (winInd & 0x04) {
        winAdler = ((p[st.i] << 24) | (p[st.i+1] << 16) | (p[st.i+2] << 8) | p[st.i+3]) >>> 0;
        st.i += 4;
      }
      const dataS = { i: st.i }, instS = { i: st.i + dataLen }, addrS = { i: st.i + dataLen + instLen };
      const instEnd = instS.i + instLen;
      st.i += dataLen + instLen + addrLen;

      // segment we copy "source-side" bytes from
      let seg = null;
      if (fromSource) seg = src.subarray(srcSegPos, srcSegPos + srcSegLen);
      else if (fromTarget) seg = flatten(out, outLen).subarray(srcSegPos, srcSegPos + srcSegLen);

      const tgt = new Uint8Array(tgtLen);
      let o = 0;
      // address cache (near 4, same 3)
      const near = [0, 0, 0, 0]; let nextNear = 0;
      const same = new Array(3 * 256).fill(0);
      const cacheUpdate = a => { near[nextNear] = a; nextNear = (nextNear + 1) % 4; same[a % (3 * 256)] = a; };
      const decodeAddr = (here, mode) => {
        let a;
        if (mode === 0) a = vcdInt(p, addrS);
        else if (mode === 1) a = here - vcdInt(p, addrS);
        else if (mode <= 5) a = near[mode - 2] + vcdInt(p, addrS);
        else a = same[(mode - 6) * 256 + p[addrS.i++]];
        cacheUpdate(a);
        return a;
      };
      const doInst = (type, size, mode) => {
        if (type === 0) return;
        if (size === 0) size = vcdInt(p, instS);
        if (type === 1) {            // ADD
          for (let j = 0; j < size; j++) tgt[o++] = p[dataS.i++];
        } else if (type === 2) {     // RUN
          const b = p[dataS.i++];
          for (let j = 0; j < size; j++) tgt[o++] = b;
        } else {                     // COPY
          const here = srcSegLen + o;
          let a = decodeAddr(here, mode);
          for (let j = 0; j < size; j++) {
            tgt[o++] = a < srcSegLen ? seg[a] : tgt[a - srcSegLen];
            a++;
          }
        }
      };
      while (instS.i < instEnd) {
        const idx = p[instS.i++];
        const ent = VCD_TABLE[idx];
        doInst(ent[0], ent[1], ent[2]);
        doInst(ent[3], ent[4], ent[5]);
      }
      if (o !== tgtLen) warn.push(`Window produced ${o} of ${tgtLen} expected bytes`);
      if (winAdler !== null && adler32(tgt) !== winAdler)
        warn.push("Adler-32 window checksum mismatch — wrong base ROM?");
      out.push(tgt); outLen += tgt.length;
    }
    return { buffer: flatten(out, outLen).buffer, warnings: warn };
  }

  function apply(romBuf, patchBuf, patchName) {
    const ext = (patchName.split(".").pop() || "").toLowerCase();
    if (ext === "ips") return { buffer: applyIPS(romBuf, patchBuf), warnings: [] };
    if (ext === "ups") return applyUPS(romBuf, patchBuf);
    if (ext === "bps") return applyBPS(romBuf, patchBuf);
    if (["xdelta", "xdelta3", "xd3", "vcdiff", "vcd"].includes(ext)) return applyXDelta(romBuf, patchBuf);
    // sniff magic
    const u = new Uint8Array(patchBuf, 0, 5);
    const m = String.fromCharCode(...u);
    if (m.startsWith("PATCH")) return { buffer: applyIPS(romBuf, patchBuf), warnings: [] };
    if (m.startsWith("UPS1")) return applyUPS(romBuf, patchBuf);
    if (m.startsWith("BPS1")) return applyBPS(romBuf, patchBuf);
    if (u[0] === 0xD6 && u[1] === 0xC3 && u[2] === 0xC4) return applyXDelta(romBuf, patchBuf);
    throw new Error("Unsupported patch format (use .ips, .ups, .bps or .xdelta)");
  }

  return { apply, crc32 };
})();
