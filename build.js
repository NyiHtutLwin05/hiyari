#!/usr/bin/env node
/* ============================================================
   HIYARI build — inline every asset into one self-contained
   file at dist/hiyari.html. No dependencies; run with:
       node build.js
   The fonts are already base64 data: URLs inside css/fonts.css,
   so the output needs no network at all — open it from disk.
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const root = __dirname;
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const fonts = read('css/fonts.css');
const style = read('css/style.css');
const three = read('vendor/three.min.js');
const gsap = read('vendor/gsap.min.js');
const audio = read('js/audio.js');
const world = read('js/world.js');
const main = read('js/main.js');

// embed the background music PLAYLIST as base64 data: URIs so the dist file
// plays the soundtrack offline, straight from disk, with no audio/ folder.
// Order matters: Tokyo Drift plays first, then AC/DC, then it loops back.
const musicFiles = [
  'Tokyo Drift - Teriyaki Boyz [ MUSIC VIDEO ] HD.mp3',
  'AC_DC - Highway to Hell [Audio].mp3',
];
const musicSrcs = musicFiles.map(
  (f) => `data:audio/mpeg;base64,${fs.readFileSync(path.join(root, 'audio', f)).toString('base64')}`
);

// pull the <body> markup out of index.html, dropping the external
// <link>/<script src> references (everything is inlined below instead)
let html = read('index.html');
let body = html.slice(html.indexOf('<body>') + '<body>'.length, html.indexOf('</body>'));
body = body
  .replace(/^\s*<script src=["'][^"']*["']><\/script>\s*$/gim, '')
  .trim();

// extract <head> extras from index.html so the dist stays at parity
const headSrc = html.slice(0, html.indexOf('</head>'));
const viewport = (headSrc.match(/<meta name="viewport"[^>]*>/) || [''])[0];
const description = (headSrc.match(/<meta name="description"[^>]*>/) || [''])[0];
const favicon = (headSrc.match(/<link rel="icon"[^>]*>/) || [''])[0];

const out = `<!DOCTYPE html>
<meta charset="utf-8">
${viewport}
${description}
${favicon}
<title>HIYARI — Almost is everything.</title>
<style>
${fonts}
${style}
</style>
${body}
<script>
${three}
</script>
<script>
${gsap}
</script>
<script>
window.HIYARI_MUSIC_SRCS = ${JSON.stringify(musicSrcs)};
</script>
<script>
${audio}
</script>
<script>
${world}
</script>
<script>
${main}
</script>
`;

fs.writeFileSync(path.join(root, 'dist/hiyari.html'), out);
console.log('built dist/hiyari.html —', out.length, 'bytes');
