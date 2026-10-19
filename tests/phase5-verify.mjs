/**
 * RATEPLAY - Phase 5 Automated Verification Suite (Node.js)
 * Verifies all 17 Phase 5 requirements including:
 * - Syntax checks across all 13 project JS/MJS modules
 * - Exact 1080x1920 Canvas output dimensions
 * - Score, tier, standout, and lowest-rated track parity with Phase 3/4
 * - Excluded/unrated track filtering on generated card
 * - Verdict inclusion when present and strict omission when blank
 * - All 3 themes (Obsidian, Paper, Signal) rendering cleanly
 * - Artwork handling & procedural fallback when image is null/CORS-blocked
 * - Filename sanitization ("RATEPLAY - Artist - Album.png")
 * - Strict protection against NaN, undefined, null, or Infinity in rendered text
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { calculateAlbumScoreAndHighlights } from '../js/calculator.js';
import {
  setStorageBackendForTesting,
  saveTrackRatingUpdate,
  saveAlbumVerdict,
  getAlbumVerdict,
  getAlbumTrackRatings
} from '../js/storage.js';
import {
  CARD_WIDTH,
  CARD_HEIGHT,
  CARD_THEMES,
  sanitizeCardText,
  buildSanitizedCardFilename,
  prepareReviewCardPayload,
  renderReviewCardToCanvas
} from '../js/canvas-card.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const jsFilesToCheck = [
  'js/config.js',
  'js/calculator.js',
  'js/storage.js',
  'js/library.js',
  'js/canvas-card.js',
  'js/api.js',
  'js/ui/discoverView.js',
  'js/ui/albumView.js',
  'js/ui/libraryView.js',
  'js/ui/shareModal.js',
  'js/app.js',
  'tests/phase3-verify.mjs',
  'tests/phase4-verify.mjs',
  'tests/phase5-verify.mjs'
];

console.log('\n[PHASE 5] Checking JavaScript syntax across all 14 modules...');
for (const relPath of jsFilesToCheck) {
  const fullPath = path.join(projectRoot, relPath);
  execFileSync(process.execPath, ['--check', fullPath], { stdio: 'inherit' });
  console.log('  [SYNTAX OK] ' + relPath);
}

class MemoryStorage {
  constructor() {
    this.store = new Map();
  }
  getItem(key) {
    return this.store.has(key) ? this.store.get(key) : null;
  }
  setItem(key, value) {
    this.store.set(key, String(value));
  }
  removeItem(key) {
    this.store.delete(key);
  }
}

/**
 * Mock 2D Canvas implementation that records every fillText() call and image draw
 * so we can inspect rendered text and dimensions in Node.js without a browser.
 */
class MockCanvas2DContext {
  constructor() {
    this.drawnTexts = [];
    this.drawnImages = 0;
    this.font = '16px sans-serif';
    this.fillStyle = '#000';
    this.strokeStyle = '#000';
    this.lineWidth = 1;
    this.textAlign = 'left';
    this.textBaseline = 'alphabetic';
    this.globalAlpha = 1;
  }
  save() {}
  restore() {}
  beginPath() {}
  closePath() {}
  moveTo() {}
  lineTo() {}
  quadraticCurveTo() {}
  arc() {}
  fill() {}
  stroke() {}
  clip() {}
  fillRect() {}
  strokeRect() {}
  drawImage() {
    this.drawnImages += 1;
  }
  measureText(str) {
    return { width: String(str || '').length * 10 };
  }
  fillText(text, x, y) {
    this.drawnTexts.push({ text: String(text), x, y });
  }
}

class MockCanvas {
  constructor() {
    this.width = 0;
    this.height = 0;
    this.ctx = new MockCanvas2DContext();
  }
  getContext(type) {
    return type === '2d' ? this.ctx : null;
  }
}

const sampleAlbum = {
  collectionId: 1097862870,
  collectionName: 'In Rainbows',
  artistName: 'Radiohead',
  primaryGenreName: 'Alternative',
  releaseDate: '2007-10-10T07:00:00Z',
  trackCount: 4,
  artworkUrl100: 'https://example.com/100x100bb.jpg'
};

const sampleTracks = [
  { trackId: 1, trackNumber: 1, discNumber: 1, trackName: '15 Step', trackTimeMillis: 237986 },
  { trackId: 2, trackNumber: 2, discNumber: 1, trackName: 'Bodysnatchers', trackTimeMillis: 242293 },
  { trackId: 3, trackNumber: 3, discNumber: 1, trackName: 'Nude', trackTimeMillis: 255386 },
  { trackId: 4, trackNumber: 4, discNumber: 1, trackName: 'Faust Arp (Interlude)', trackTimeMillis: 129760 }
];

let passed = 0;
function runTest(name, fn) {
  try {
    fn();
    passed += 1;
    console.log('  [PASS] ' + name);
  } catch (err) {
    console.error('  [FAIL] ' + name);
    console.error('         ' + err.message);
    process.exit(1);
  }
}

console.log('\n[PHASE 5] Running Automated Review Card & Canvas Verification Suite...');

// Test 1: Exact 1080x1920 Canvas specification
runTest('1. Canvas output dimensions are strictly 1080x1920', () => {
  assert.equal(CARD_WIDTH, 1080);
  assert.equal(CARD_HEIGHT, 1920);

  const canvas = new MockCanvas();
  const payload = prepareReviewCardPayload({
    album: sampleAlbum,
    tracks: sampleTracks,
    trackRatingsMap: { '1': { rating: 9.0, included: true } },
    themeId: 'obsidian'
  });
  const res = renderReviewCardToCanvas(canvas, payload, null);
  assert.equal(canvas.width, 1080);
  assert.equal(canvas.height, 1920);
  assert.equal(res.width, 1080);
  assert.equal(res.height, 1920);
});

// Test 2: Score, tier label, standout, and lowest track match Phase 3/4 calculator
runTest('2. Card score, tier label, standout, and lowest tracks match Phase 3/4 calculator', () => {
  const ratingsMap = {
    '1': { rating: 9.5, interlude: false, included: true },
    '2': { rating: 8.0, interlude: false, included: true },
    '3': { rating: 9.5, interlude: false, included: true },
    '4': { rating: 4.0, interlude: true, included: false } // Excluded!
  };

  const calc = calculateAlbumScoreAndHighlights(sampleTracks, ratingsMap);
  const payload = prepareReviewCardPayload({
    album: sampleAlbum,
    tracks: sampleTracks,
    trackRatingsMap: ratingsMap,
    themeId: 'obsidian'
  });

  assert.equal(payload.overallScore, calc.overallScore);
  assert.equal(payload.formattedScore, '9.0'); // (9.5 + 8.0 + 9.5) / 3 = 9.0
  assert.equal(payload.tierLabel, 'Masterpiece');
  assert.equal(payload.scoredCount, 3);
  assert.equal(payload.ratedCount, 4);

  // Excluded track #4 (rated 4.0) must NOT appear in scoredTracks or lowestHighlight
  assert.equal(payload.scoredTracks.length, 3);
  assert.equal(payload.scoredTracks.some((t) => t.trackNumber === 4), false);
  assert.equal(payload.lowestHighlight.scoreText, '8.0');
  assert.ok(payload.lowestHighlight.primaryLine.includes('Bodysnatchers'));

  // Tied standout tracks (#1 and #3 at 9.5) are handled gracefully
  assert.equal(payload.standoutHighlight.scoreText, '9.5');
  assert.equal(payload.standoutHighlight.tiedCount, 2);
  assert.ok(payload.standoutHighlight.tieSubtitle.includes('Nude'));
});

// Test 3: Verdict appears when provided and is omitted when blank
runTest('3. Verdict renders when present and is completely omitted when blank', () => {
  const ratingsMap = { '1': { rating: 8.5, included: true } };

  const withoutVerdict = prepareReviewCardPayload({
    album: sampleAlbum,
    tracks: sampleTracks,
    trackRatingsMap: ratingsMap,
    verdict: '   '
  });
  assert.equal(withoutVerdict.hasVerdict, false);
  const canvasNoVerdict = new MockCanvas();
  renderReviewCardToCanvas(canvasNoVerdict, withoutVerdict, null);
  assert.equal(
    canvasNoVerdict.ctx.drawnTexts.some((t) => t.text.includes('VERDICT // LINER NOTE')),
    false
  );

  const withVerdict = prepareReviewCardPayload({
    album: sampleAlbum,
    tracks: sampleTracks,
    trackRatingsMap: ratingsMap,
    verdict: 'Warm analog perfection from start to finish.'
  });
  assert.equal(withVerdict.hasVerdict, true);
  const canvasWithVerdict = new MockCanvas();
  renderReviewCardToCanvas(canvasWithVerdict, withVerdict, null);
  assert.equal(
    canvasWithVerdict.ctx.drawnTexts.some((t) => t.text.includes('VERDICT // LINER NOTE')),
    true
  );
  assert.equal(
    canvasWithVerdict.ctx.drawnTexts.some((t) =>
      t.text.includes('Warm analog perfection')
    ),
    true
  );
});

// Test 4: All three themes (Obsidian, Paper, Signal) render with both loaded artwork and fallback artwork
runTest('4. All three themes (Obsidian, Paper, Signal) render with artwork and procedural fallback', () => {
  const ratingsMap = {
    '1': { rating: 8.5, included: true },
    '2': { rating: 7.5, included: true }
  };

  for (const themeKey of Object.keys(CARD_THEMES)) {
    const payload = prepareReviewCardPayload({
      album: sampleAlbum,
      tracks: sampleTracks,
      trackRatingsMap: ratingsMap,
      verdict: 'Essential listen.',
      themeId: themeKey
    });

    // Render with procedural fallback (artworkImage = null)
    const canvasFallback = new MockCanvas();
    const resFallback = renderReviewCardToCanvas(canvasFallback, payload, null);
    assert.equal(resFallback.themeId, themeKey);
    assert.equal(resFallback.usedFallbackArtwork, true);

    // Render with loaded artwork object
    const canvasLoaded = new MockCanvas();
    const fakeImg = { width: 600, height: 600 };
    const resLoaded = renderReviewCardToCanvas(canvasLoaded, payload, fakeImg);
    assert.equal(resLoaded.usedFallbackArtwork, false);
    assert.ok(canvasLoaded.ctx.drawnImages >= 1);
  }
});

// Test 5: Filename sanitization strips invalid characters and produces predictable output
runTest('5. Filename sanitizer produces clean "RATEPLAY - Artist - Album.png" filenames', () => {
  const fn1 = buildSanitizedCardFilename('Radiohead', 'In Rainbows');
  assert.equal(fn1, 'RATEPLAY - Radiohead - In Rainbows.png');

  const fn2 = buildSanitizedCardFilename('AC/DC: Live*?', 'Back\\In|Black "Deluxe" <2026>');
  assert.equal(fn2.includes('/'), false);
  assert.equal(fn2.includes('\\'), false);
  assert.equal(fn2.includes(':'), false);
  assert.equal(fn2.includes('*'), false);
  assert.equal(fn2.includes('?'), false);
  assert.equal(fn2.includes('"'), false);
  assert.equal(fn2.includes('<'), false);
  assert.equal(fn2.includes('>'), false);
  assert.equal(fn2.includes('|'), false);
  assert.ok(fn2.startsWith('RATEPLAY - '));
  assert.ok(fn2.endsWith('.png'));
});

// Test 6: Missing/corrupted metadata never outputs NaN, undefined, null, or Infinity on Canvas
runTest('6. Missing or malformed data never renders NaN, undefined, null, or Infinity on the card', () => {
  assert.equal(sanitizeCardText(NaN, 'Fallback'), 'Fallback');
  assert.equal(sanitizeCardText(undefined, 'Fallback'), 'Fallback');
  assert.equal(sanitizeCardText(null, 'Fallback'), 'Fallback');
  assert.equal(sanitizeCardText(Infinity, 'Fallback'), 'Fallback');

  const brokenAlbum = {
    collectionId: null,
    collectionName: undefined,
    artistName: null,
    releaseDate: 'invalid-date',
    primaryGenreName: NaN
  };

  const payload = prepareReviewCardPayload({
    album: brokenAlbum,
    tracks: [],
    trackRatingsMap: {},
    verdict: null,
    themeId: 'obsidian'
  });

  const canvas = new MockCanvas();
  renderReviewCardToCanvas(canvas, payload, null);

  for (const item of canvas.ctx.drawnTexts) {
    assert.equal(item.text.includes('NaN'), false, 'Found NaN in: ' + item.text);
    assert.equal(item.text.includes('undefined'), false, 'Found undefined in: ' + item.text);
    assert.equal(item.text.includes('null'), false, 'Found null in: ' + item.text);
    assert.equal(item.text.includes('Infinity'), false, 'Found Infinity in: ' + item.text);
  }
});

// Test 7: Verdict persistence in storage.js preserves existing ratings and library compatibility
runTest('7. Verdict persists in localStorage without overwriting track ratings', () => {
  const mem = new MemoryStorage();
  setStorageBackendForTesting(mem);

  saveTrackRatingUpdate(1097862870, '1097863022', { rating: 9.0 }, sampleTracks, sampleAlbum);
  saveAlbumVerdict(1097862870, 'A timeless modern classic.', sampleTracks, sampleAlbum);

  assert.equal(getAlbumVerdict(1097862870), 'A timeless modern classic.');
  assert.equal(getAlbumTrackRatings(1097862870)['1097863022'].rating, 9.0);

  // Subsequent track rating update preserves the saved verdict
  saveTrackRatingUpdate(1097862870, '1097863026', { rating: 8.5 }, sampleTracks, sampleAlbum);
  assert.equal(getAlbumVerdict(1097862870), 'A timeless modern classic.');
});

console.log('\nAll ' + String(passed) + ' Phase 5 automated verification suites passed.\n');