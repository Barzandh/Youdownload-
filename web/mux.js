/* VidVault — joins a video-only and an audio-only fragmented MP4 (how YouTube serves HD) into one playable MP4,
 * entirely in the browser, without re-encoding and without big libraries. */
'use strict';
(function () {
  const r32 = (b, o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
  const w32 = (b, o, v) => { b[o] = (v >>> 24) & 255; b[o + 1] = (v >>> 16) & 255; b[o + 2] = (v >>> 8) & 255; b[o + 3] = v & 255; };
  const r64 = (b, o) => r32(b, o) * 4294967296 + r32(b, o + 4);
  const w64 = (b, o, v) => { w32(b, o, Math.floor(v / 4294967296)); w32(b, o + 4, v % 4294967296); };
  const type = (b, o) => String.fromCharCode(b[o + 4], b[o + 5], b[o + 6], b[o + 7]);

  // list the boxes between start and end: {type, start, end, body}
  function boxes(b, start, end) {
    const out = [];
    let o = start;
    while (o + 8 <= end) {
      let size = r32(b, o), hdr = 8;
      if (size === 1) { size = r64(b, o + 8); hdr = 16; }
      else if (size === 0) size = end - o;
      if (size < hdr || o + size > end) break;
      out.push({ type: type(b, o), start: o, end: o + size, body: o + hdr });
      o += size;
    }
    return out;
  }
  const child = (b, box, t) => boxes(b, box.body, box.end).find((x) => x.type === t);
  const path = (b, box, ...ts) => { let x = box; for (const t of ts) { x = x && child(b, x, t); } return x; };

  function makeBox(t, parts) {
    const len = 8 + parts.reduce((a, p) => a + p.length, 0);
    const out = new Uint8Array(len);
    w32(out, 0, len);
    for (let i = 0; i < 4; i++) out[4 + i] = t.charCodeAt(i);
    let o = 8;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  }

  function trackInfo(b, moov) {
    const trak = child(b, moov, 'trak');
    const tkhd = path(b, trak, 'tkhd');
    const v = b[tkhd.body];
    const id = r32(b, tkhd.body + (v === 1 ? 20 : 12));
    const mdhd = path(b, trak, 'mdia', 'mdhd');
    const mv = b[mdhd.body];
    const timescale = r32(b, mdhd.body + (mv === 1 ? 20 : 12));
    const mvex = child(b, moov, 'mvex');
    const trex = mvex && boxes(b, mvex.body, mvex.end).find((x) => x.type === 'trex');
    return { trak, tkhd, id, timescale, trex };
  }

  function parse(b) {
    const top = boxes(b, 0, b.length);
    const moov = top.find((x) => x.type === 'moov');
    if (!moov) throw new Error('not an MP4 file');
    const info = trackInfo(b, moov);
    if (!info.trex) throw new Error('not a fragmented MP4');
    const frags = [];
    for (let i = 0; i < top.length; i++) {
      if (top[i].type !== 'moof') continue;
      const moof = top[i];
      let mdat = null;
      for (let j = i + 1; j < top.length && top[j].type !== 'moof'; j++) if (top[j].type === 'mdat') { mdat = top[j]; break; }
      if (!mdat) continue;
      const traf = child(b, moof, 'traf');
      const tfdt = traf && child(b, traf, 'tfdt');
      let t = 0;
      if (tfdt) t = b[tfdt.body] === 1 ? r64(b, tfdt.body + 4) : r32(b, tfdt.body + 4);
      frags.push({ moof, mdat, time: t / info.timescale });
    }
    if (!frags.length) throw new Error('no media fragments');
    return { b, top, moov, info, frags };
  }

  // copy a moof, renumber it and point it at the new track id; returns {bytes, fixBase(newPos)}
  function rewriteMoof(src, frag, seq, trackId) {
    const b = src.b.slice(frag.moof.start, frag.moof.end);
    const root = { start: 0, end: b.length, body: 8 };
    const mfhd = child(b, root, 'mfhd');
    if (mfhd) w32(b, mfhd.body + 4, seq);
    const fixes = [];
    for (const traf of boxes(b, 8, b.length).filter((x) => x.type === 'traf')) {
      const tfhd = child(b, traf, 'tfhd');
      if (!tfhd) continue;
      if (trackId) w32(b, tfhd.body + 4, trackId);
      const flags = (b[tfhd.body + 1] << 16) | (b[tfhd.body + 2] << 8) | b[tfhd.body + 3];
      if (flags & 1) { // explicit base-data-offset: must move with the fragment
        const old = r64(b, tfhd.body + 8);
        fixes.push({ at: tfhd.body + 8, delta: old - frag.moof.start });
      }
    }
    return { bytes: b, fix(pos) { for (const f of fixes) w64(b, f.at, pos + f.delta); } };
  }

  function buildMoov(V, A, audioId) {
    const vb = V.b, ab = A.b;
    // audio trak with the new track id
    const atrak = ab.slice(A.info.trak.start, A.info.trak.end);
    const tk = A.info.tkhd.start - A.info.trak.start;
    const tkv = atrak[tk + 8];
    w32(atrak, tk + 8 + (tkv === 1 ? 20 : 12), audioId);
    const atrex = ab.slice(A.info.trex.start, A.info.trex.end);
    w32(atrex, 12, audioId);
    const parts = [];
    for (const c of boxes(vb, V.moov.body, V.moov.end)) {
      let bytes = vb.slice(c.start, c.end);
      if (c.type === 'mvhd') {
        const v = bytes[8];
        w32(bytes, 8 + (v === 1 ? 108 : 96), audioId + 1);   // next_track_ID
      }
      if (c.type === 'mvex') {
        const kids = boxes(vb, c.body, c.end).map((k) => vb.slice(k.start, k.end));
        bytes = makeBox('mvex', kids.concat([atrex]));
      }
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

  /** video, audio: Uint8Array of fragmented MP4 files. Returns an array of Uint8Array parts for a Blob. */
  function joinFMP4(video, audio) {
    const V = parse(video), A = parse(audio);
    const audioId = V.info.id === 1 ? 2 : V.info.id + 1;
    const moov = buildMoov(V, A, audioId);
    const all = V.frags.map((f) => ({ src: V, f, id: 0 })).concat(A.frags.map((f) => ({ src: A, f, id: audioId })));
    all.sort((x, y) => x.f.time - y.f.time || (x.id - y.id));
    const head = ftyp();
    const parts = [head, moov];
    let pos = head.length + moov.length;
    all.forEach((x, i) => {
      const m = rewriteMoof(x.src, x.f, i + 1, x.id);
      m.fix(pos);
      parts.push(m.bytes, x.src.b.subarray(x.f.mdat.start, x.f.mdat.end));
      pos += m.bytes.length + (x.f.mdat.end - x.f.mdat.start);
    });
    return parts;
  }

  const api = { joinFMP4, _parse: parse };
  if (typeof window !== 'undefined') window.VVMux = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
