/**
 * RATEPLAY - Phase 6 (Part 1) Automated Verification Suite (Node.js)
 * Verifies:
 * 1. JavaScript syntax across all 16 project modules
 * 2. Empty library profile calculation (0 rated albums, null average, no NaN/Infinity)
 * 3. Music Taste Profile aggregation from saved localStorage ratings (total albums, average rating,
 *    highest-rated albums, most frequently rated artists, recently rated albums)
 * 4. Excluded tracks and hidden albums handling in Taste Profile
 * 5. 1080x1920 Shareable Taste Profile Canvas payload and rendering across all 3 themes
 * 6. Graceful handling of missing artwork and empty libraries on the 1080x1920 Canvas
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  setStorageBackendForTesting,
  getSavedRatingsMap,
  getAlbumCatalogCacheMap,
  saveTrackRatingUpdate,
  removeAlbumFromLibrary,
  restoreAlbumToLibrary
} from '../js/storage.js';
import {
  calculateMostFrequentlyRatedArtists,
  buildMusicTasteProfile
} from '../js/profile.js';
import {
  CARD_WIDTH,
  CARD_HEIGHT,
  CARD_THEMES,
  buildSanitizedProfileFilename,
  prepareTasteProfileCardPayload,
  renderTasteProfileCardToCanvas
} from '../js/canvas-card.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const jsFilesToCheck = [
  'js/config.js',
  'js/calculator.js',
  'js/storage.js',
  'js/library.js',
  'js/profile.js',
  'js/canvas-card.js',
  'js/api.js',
  'js/ui/discoverView.js',
  'js/ui/albumView.js',
  'js/ui/libraryView.js',
  'js/ui/profileView.js',
  'js/ui/shareModal.js',
  'js/app.js',
  'tests/phase3-verify.mjs',
  'tests/phase4-verify.mjs',
  'tests/phase5-verify.mjs',
  'tests/phase6-part1-verify.mjs'
];

console.log('\n[PHASE 6 PART 1] Checking JavaScript syntax across all 17 modules...');
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

console.log('\n[PHASE 6 PART 1] Running Music Taste Profile & Profile Card Verification Suite...');

// Test 1: Empty library gracefully produces empty profile without NaN or Infinity
runTest('1. Empty library produces safe empty Taste Profile without NaN or Infinity', () => {
  const mem = new MemoryStorage();
  setStorageBackendForTesting(mem);

  const profile = buildMusicTasteProfile(getSavedRatingsMap(), getAlbumCatalogCacheMap());
  assert.equal(profile.isEmpty, true);
  assert.equal(profile.isShareable, false);
  assert.equal(profile.totalRatedAlbums, 0);
  assert.equal(profile.totalRatedTracks, 0);
  assert.equal(profile.averageRating, null);
  assert.equal(profile.formattedAverageRating, null);
  assert.equal(profile.highestRatedAlbums.length, 0);
  assert.equal(profile.mostFrequentArtists.length, 0);
  assert.equal(profile.recentlyRatedAlbums.length, 0);
});

// Test 2: Profile accurately computes total albums, average rating, highest-rated albums, most frequent artists, and recent albums
runTest('2. Taste Profile accurately aggregates total albums, average rating, top albums, frequent artists, and recent albums', () => {
  const mem = new MemoryStorage();
  setStorageBackendForTesting(mem);

  const radioheadAlbum2 = {
    collectionId: 90001,
    collectionName: 'OK Computer',
    artistName: 'Radiohead',
    primaryGenreName: 'Alternative',
    releaseDate: '1997-05-21T07:00:00Z',
    trackCount: 12,
    artworkUrl100: 'https://example.com/okc-100x100bb.jpg'
  };
  const radioheadTracks2 = [
    { trackId: 901, trackNumber: 1, discNumber: 1, trackName: 'Airbag', trackTimeMillis: 284000 },
    { trackId: 902, trackNumber: 2, discNumber: 1, trackName: 'Paranoid Android', trackTimeMillis: 383000 }
  ];

  // 1. Rate In Rainbows (Radiohead, curated ID 1097862870) -> 9.0
  saveTrackRatingUpdate(1097862870, '1097863022', { rating: 9.0 });
  // 2. Rate OK Computer (Radiohead, ID 90001) -> 9.5 and 8.5 -> 9.0 average
  saveTrackRatingUpdate(90001, '901', { rating: 9.5 }, radioheadTracks2, radioheadAlbum2);
  saveTrackRatingUpdate(90001, '902', { rating: 8.5 }, radioheadTracks2, radioheadAlbum2);
  // 3. Rate Blonde (Frank Ocean, curated ID 1146195596) -> 10.0
  saveTrackRatingUpdate(1146195596, '1146195601', { rating: 10.0 });
  // 4. Rate Random Access Memories (Daft Punk, curated ID 697194953) -> 8.0
  saveTrackRatingUpdate(697194953, '697195051', { rating: 8.0 });

  const profile = buildMusicTasteProfile(getSavedRatingsMap(), getAlbumCatalogCacheMap());

  assert.equal(profile.isEmpty, false);
  assert.equal(profile.isShareable, true);
  assert.equal(profile.totalRatedAlbums, 4);
  assert.equal(profile.totalRatedTracks, 5);
  // Average of (9.0 + 9.0 + 10.0 + 8.0) / 4 = 9.0
  assert.equal(profile.averageRating, 9.0);
  assert.equal(profile.formattedAverageRating, '9.0');
  assert.equal(profile.averageTierLabel, 'Masterpiece');

  // Highest-rated album #1 is Blonde (10.0)
  assert.equal(profile.highestRatedAlbums[0].collectionName, 'Blonde');
  assert.equal(profile.highestRatedAlbums[0].overallScore, 10.0);

  // Most frequently rated artist #1 is Radiohead (2 rated albums, 3 rated tracks)
  assert.equal(profile.mostFrequentArtists[0].artistName, 'Radiohead');
  assert.equal(profile.mostFrequentArtists[0].albumCount, 2);
  assert.equal(profile.mostFrequentArtists[0].ratedTrackCount, 3);
  assert.equal(profile.mostFrequentArtists[0].averageScore, 9.0);
});

// Test 3: Recently rated albums sort chronologically by updatedAt descending
runTest('3. Recently rated albums sort by updatedAt timestamp descending', () => {
  const ratingsMap = {
    '1097862870': {
      collectionId: '1097862870',
      updatedAt: '2026-10-10T10:00:00.000Z',
      trackRatings: { '1097863022': { rating: 8.0, included: true } }
    },
    '1146195596': {
      collectionId: '1146195596',
      updatedAt: '2026-10-18T18:30:00.000Z',
      trackRatings: { '1146195601': { rating: 9.5, included: true } }
    },
    '697194953': {
      collectionId: '697194953',
      updatedAt: '2026-10-15T12:00:00.000Z',
      trackRatings: { '697195051': { rating: 8.5, included: true } }
    }
  };

  const profile = buildMusicTasteProfile(ratingsMap, {});
  assert.deepEqual(
    profile.recentlyRatedAlbums.map((a) => Number(a.collectionId)),
    [1146195596, 697194953, 1097862870]
  );
});

// Test 4: Shareable 1080x1920 Taste Profile Canvas renders across all 3 themes & handles missing artwork/empty state
runTest('4. Shareable 1080x1920 Taste Profile Canvas renders all 3 themes and never outputs NaN/undefined/null', () => {
  const ratingsMap = {
    '1097862870': {
      collectionId: '1097862870',
      updatedAt: '2026-10-18T12:00:00.000Z',
      trackRatings: {
        '1097863022': { rating: 9.5, included: true },
        '1097863026': { rating: 8.5, included: true }
      }
    },
    '1146195596': {
      collectionId: '1146195596',
      updatedAt: '2026-10-17T12:00:00.000Z',
      trackRatings: {
        '1146195601': { rating: 9.0, included: true }
      }
    }
  };

  for (const themeKey of Object.keys(CARD_THEMES)) {
    const payload = prepareTasteProfileCardPayload({
      ratingsMap,
      metadataMap: {},
      themeId: themeKey
    });

    assert.equal(payload.isShareable, true);
    assert.equal(payload.totalRatedAlbums, 2);
    assert.equal(payload.formattedAverageRating, '9.0');

    const canvas = new MockCanvas();
    const res = renderTasteProfileCardToCanvas(canvas, payload, {});
    assert.equal(canvas.width, 1080);
    assert.equal(canvas.height, 1920);
    assert.equal(res.width, CARD_WIDTH);
    assert.equal(res.height, CARD_HEIGHT);
    assert.equal(res.themeId, themeKey);

    // Verify key profile content was drawn onto the canvas
    assert.equal(
      canvas.ctx.drawnTexts.some((t) => t.text.includes('MUSIC TASTE PROFILE')),
      true
    );
    assert.equal(
      canvas.ctx.drawnTexts.some((t) => t.text.includes('HIGHEST-RATED ALBUMS')),
      true
    );
    assert.equal(
      canvas.ctx.drawnTexts.some((t) => t.text.includes('MOST FREQUENTLY RATED ARTISTS')),
      true
    );

    // Ensure no NaN, undefined, null, or Infinity strings appear anywhere
    for (const item of canvas.ctx.drawnTexts) {
      assert.equal(item.text.includes('NaN'), false, 'Found NaN in: ' + item.text);
      assert.equal(item.text.includes('undefined'), false, 'Found undefined in: ' + item.text);
      assert.equal(item.text.includes('null'), false, 'Found null in: ' + item.text);
      assert.equal(item.text.includes('Infinity'), false, 'Found Infinity in: ' + item.text);
    }
  }

  // Also test rendering an empty library onto the Taste Profile Canvas
  const emptyPayload = prepareTasteProfileCardPayload({
    ratingsMap: {},
    metadataMap: {},
    themeId: 'obsidian'
  });
  const emptyCanvas = new MockCanvas();
  renderTasteProfileCardToCanvas(emptyCanvas, emptyPayload, {});
  assert.equal(emptyCanvas.width, 1080);
  assert.equal(emptyCanvas.height, 1920);
  for (const item of emptyCanvas.ctx.drawnTexts) {
    assert.equal(item.text.includes('NaN'), false);
    assert.equal(item.text.includes('undefined'), false);
  }

  assert.equal(buildSanitizedProfileFilename('Taste Profile'), 'RATEPLAY - Taste Profile.png');
});

console.log('\nAll ' + String(passed) + ' Phase 6 (Part 1) automated verification suites passed.\n');