/* VidVault — joins a video-only and an audio-only fragmented MP4 (how YouTube serves HD) into one playable MP4,
 * in the browser, without re-encoding. Works on Blobs that live on disk: only the small index boxes are read
 * into memory, the media itself is referenced by slices, so long HD videos don't run the phone out of memory. */
'use strict';
(function () {
  const r32 = (b, o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
  const w32 = (b, o, v) => { b[o] = (v >>> 24) & 255; b[o + 1] = (v >>> 16) & 255; b[o + 2] = (v >>> 8) & 255; b[o + 3] = v & 255; };
  const r64 = (b, o) => r32(b, o) * 4294967296 + r32(b, o + 4);
  const w64 = (b, o, v) => { w32(b, o, Math.floor(v / 4294967296)); w32(b, o + 4, v % 4294967296); };
  const type = (b, o) => String.fromCharCode(b[o + 4], b[o + 5], b[o + 6], b[o + 7]);

  function boxes(b, start, end) {
    const out = [];
    let o = start;
    while (o + 8 <= end) {
      let size = r32(b, o), hdr = 8;
      if (size === 1) { size = r64(b, o + 8); hdr = 16; } else if (size === 0) size = end - o;
      if (size < hdr || o + size > end) break;
      out.push({ type: type(b, o), start: o, end: o + size, body: o + hdr });
      o += size;
    }
    return out;
  }
  const child = (b, box, t) => boxes(b, box.body, box.end).find((x) => x.type === t);
  const root = (b) => ({ start: 0, end: b.length, body: 8 });

  function makeBox(t, parts) {
    const len = 8 + parts.reduce((a, p) => a + p.length, 0);
    const out = new Uint8Array(len);
    w32(out, 0, len);
    for (let i = 0; i < 4; i++) out[4 + i] = t.charCodeAt(i);
    let o = 8;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  }

  // a source is a Blob (browser) or a Uint8Array (tests)
  const readAt = (src, s, e) => (src instanceof Uint8Array ? Promise.resolve(src.subarray(s, e))
    : src.slice(s, e).arrayBuffer().then((b) => new Uint8Array(b)));
  const sliceOf = (src, s, e) => (src instanceof Uint8Array ? src.subarray(s, e) : src.slice(s, e));
  const sizeOf = (src) => (src instanceof Uint8Array ? src.length : src.size);

  async function parse(src) {
    const size = sizeOf(src);
    let o = 0, moov = null, pending = null;
    const frags = [];
    while (o + 8 <= size) {
      const h = await readAt(src, o, Math.min(size, o + 16));
      let bs = r32(h, 0), hdr = 8;
      if (bs === 1) { bs = r64(h, 8); hdr = 16; } else if (bs === 0) bs = size - o;
      const t = type(h, 0);
      if (bs < hdr || o + bs > size) break;           // cut off at the end: ignore the incomplete box
      if (t === 'moov') moov = (await readAt(src, o, o + bs)).slice();
      else if (t === 'moof') pending = { bytes: (await readAt(src, o, o + bs)).slice(), start: o };
      else if (t === 'mdat' && pending) { frags.push({ moof: pending.bytes, moofStart: pending.start, mdatStart: o, mdatEnd: o + bs }); pending = null; }
      o += bs;
    }
    if (!moov) throw new Error('not an MP4 file');
    const mv = root(moov);
    const trak = child(moov, mv, 'trak');
    const tkhd = child(moov, trak, 'tkhd');
    const id = r32(moov, tkhd.body + (moov[tkhd.body] === 1 ? 20 : 12));
    const mdia = child(moov, trak, 'mdia');
    const mdhd = child(moov, mdia, 'mdhd');
    const timescale = r32(moov, mdhd.body + (moov[mdhd.body] === 1 ? 20 : 12)) || 1;
    const mvex = child(moov, mv, 'mvex');
    const trex = mvex && child(moov, mvex, 'trex');
    if (!trex) throw new Error('not a fragmented MP4');
    if (!frags.length) throw new Error('no media in the file');
    for (const f of frags) {
      const traf = child(f.moof, root(f.moof), 'traf');
      const tfdt = traf && child(f.moof, traf, 'tfdt');
      const t = tfdt ? (f.moof[tfdt.body] === 1 ? r64(f.moof, tfdt.body + 4) : r32(f.moof, tfdt.body + 4)) : 0;
      f.time = t / timescale;
    }
    return { src, moov, trak, tkhd, id, trex, frags };
  }

  function rewriteMoof(f, seq, trackId) {
    const b = f.moof.slice();
    const mfhd = child(b, root(b), 'mfhd');
    if (mfhd) w32(b, mfhd.body + 4, seq);
    const fixes = [];
    for (const traf of boxes(b, 8, b.length).filter((x) => x.type === 'traf')) {
      const tfhd = child(b, traf, 'tfhd');
      if (!tfhd) continue;
      if (trackId) w32(b, tfhd.body + 4, trackId);
      const flags = (b[tfhd.body + 1] << 16) | (b[tfhd.body + 2] << 8) | b[tfhd.body + 3];
      if (flags & 1) fixes.push({ at: tfhd.body + 8, delta: r64(b, tfhd.body + 8) - f.moofStart });  // absolute offsets move with the fragment
    }
    return { bytes: b, fix(pos) { for (const x of fixes) w64(b, x.at, pos + x.delta); } };
  }

  function buildMoov(V, A, audioId) {
    const atrak = A.moov.slice(A.trak.start, A.trak.end);
    const tk = A.tkhd.start - A.trak.start;
    w32(atrak, tk + 8 + (atrak[tk + 8] === 1 ? 20 : 12), audioId);
    const atrex = A.moov.slice(A.trex.start, A.trex.end);
    w32(atrex, 12, audioId);
    const parts = [];
    for (const c of boxes(V.moov, 8, V.moov.length)) {
      let bytes = V.moov.slice(c.start, c.end);
      if (c.type === 'mvhd') w32(bytes, 8 + (bytes[8] === 1 ? 108 : 96), audioId + 1);   // next_track_ID
      if (c.type === 'mvex') bytes = makeBox('mvex', boxes(V.moov, c.body, c.end).map((k) => V.moov.slice(k.start, k.end)).concat([atrex]));
      parts.push(bytes);
      if (c.type === 'trak') parts.push(atrak);
    }
    return makeBox('moov', parts);
  }

  function ftyp() {
    const brands = ['isom', 'iso6', 'iso2', 'avc1', 'mp41'];
    const body = new Uint8Array(8 + brands.length * 4);
    'isom'.split('').forEach((c, i) => body[i] = c.charCodeAt(0));
    w32(body, 4, 512);
    brands.forEach((br, k) => br.split('').forEach((c, i) => body[8 + k * 4 + i] = c.charCodeAt(0)));
    return makeBox('ftyp', [body]);
  }

  /** video, audio: Blob or Uint8Array. Resolves to an array of parts (Uint8Array / Blob slices) for new Blob(parts). */
  async function join(video, audio) {
    const V = await parse(video), A = await parse(audio);
    const audioId = V.id === 1 ? 2 : V.id + 1;
    const moov = buildMoov(V, A, audioId);
    const all = V.frags.map((f) => ({ S: V, f, id: 0 })).concat(A.frags.map((f) => ({ S: A, f, id: audioId })));
    all.sort((x, y) => x.f.time - y.f.time || (x.id - y.id));
    const head = ftyp();
    const parts = [head, moov];
    let pos = head.length + moov.length;
    all.forEach((x, i) => {
      const m = rewriteMoof(x.f, i + 1, x.id);
      m.fix(pos);
      parts.push(m.bytes, sliceOf(x.S.src, x.f.mdatStart, x.f.mdatEnd));
      pos += m.bytes.length + (x.f.mdatEnd - x.f.mdatStart);
    });
    return parts;
  }

  const api = { join, parse };
  if (typeof window !== 'undefined') window.VVMux = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
