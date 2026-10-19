/**
 * RATEPLAY - Phase 7 Automated Verification Suite (Node.js)
 * Verifies:
 * 1. JavaScript syntax across all 23 project modules
 * 2. Empty library safety across all Listening Insights sections (zero NaN/Infinity)
 * 3. Taste DNA aggregation & explicit distinction between known metadata and unavailable metadata
 * 4. Rating Distribution: average, median (odd & even counts), tier buckets, and exclusion of unscored albums
 * 5. Artist Rankings: sample size reporting & multi-album confidence prioritization over single-album outliers
 * 6. Decade Breakdown: grouping by decade, average scores, and safe handling of missing/invalid release dates
 * 7. Hidden Gems: transparent selection criteria based strictly on local library data
 * 8. Share Insights 1080x1920 Canvas rendering across all 3 themes + fallback artwork + empty library safety
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  setStorageBackendForTesting,
  getSavedRatingsMap,
  getAlbumCatalogCacheMap,
  saveTrackRatingUpdate
} from '../js/storage.js';
import {
  extractReleaseDecade,
  calculateMedianScore,
  calculateRatingDistribution,
  calculateArtistRankings,
  calculateDecadeBreakdown,
  calculateTasteDna,
  identifyHiddenGems,
  buildListeningInsights
} from '../js/insights.js';
import {
  CARD_WIDTH,
  CARD_HEIGHT,
  CARD_THEMES,
  buildSanitizedInsightsFilename,
  prepareListeningInsightsCardPayload,
  renderListeningInsightsCardToCanvas
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
  'js/insights.js',
  'js/portability.js',
  'js/discovery.js',
  'js/canvas-card.js',
  'js/api.js',
  'js/ui/discoverView.js',
  'js/ui/albumView.js',
  'js/ui/libraryView.js',
  'js/ui/profileView.js',
  'js/ui/insightsView.js',
  'js/ui/shareModal.js',
  'js/ui/importModal.js',
  'js/app.js',
  'tests/phase3-verify.mjs',
  'tests/phase4-verify.mjs',
  'tests/phase5-verify.mjs',
  'tests/phase6-part1-verify.mjs',
  'tests/phase6-part2-verify.mjs',
  'tests/phase7-verify.mjs'
];

console.log('\n[PHASE 7] Checking JavaScript syntax across all 24 modules...');
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

console.log('\n[PHASE 7] Running Listening Insights & Taste DNA Verification Suite...');

// Test 1: Empty library safety across all Phase 7 insights sections
runTest('1. Empty library produces safe Listening Insights with null averages/medians and zero NaN/Infinity', () => {
  const mem = new MemoryStorage();
  setStorageBackendForTesting(mem);

  const insights = buildListeningInsights(getSavedRatingsMap(), getAlbumCatalogCacheMap());
  assert.equal(insights.isEmpty, true);
  assert.equal(insights.isShareable, false);
  assert.equal(insights.totalRatedAlbums, 0);
  assert.equal(insights.ratingDistribution.averageScore, null);
  assert.equal(insights.ratingDistribution.medianScore, null);
  assert.equal(insights.artistRankings.rankedArtists.length, 0);
  assert.equal(insights.decadeBreakdown.decades.length, 0);
  assert.equal(insights.hiddenGems.gems.length, 0);
});

// Test 2: Taste DNA clearly distinguishes known metadata from unavailable metadata
runTest('2. Taste DNA summarizes top artists, genres, and decades while distinguishing unavailable metadata', () => {
  const mem = new MemoryStorage();
  setStorageBackendForTesting(mem);

  // Curated album 1097862870 (In Rainbows - Radiohead - Alternative - 2007) -> full metadata known
  saveTrackRatingUpdate(1097862870, '1097863022', { rating: 9.0 });
  // Curated album 1440783617 (Currents - Tame Impala - Alternative - 2015) -> full metadata known
  saveTrackRatingUpdate(1440783617, '1440783624', { rating: 8.5 });
  // Legacy uncached album ID 888888 -> no cached metadata (unknown artist, unknown genre, unknown decade)
  saveTrackRatingUpdate(888888, 't1', { rating: 7.5 });

  const insights = buildListeningInsights(getSavedRatingsMap(), getAlbumCatalogCacheMap());
  const cov = insights.tasteDna.metadataCoverage;

  assert.equal(cov.totalAlbums, 3);
  assert.equal(cov.knownArtistAlbums, 2);
  assert.equal(cov.unavailableArtistAlbums, 1);
  assert.equal(cov.knownGenreAlbums, 2);
  assert.equal(cov.unavailableGenreAlbums, 1);
  assert.equal(cov.knownDecadeAlbums, 2);
  assert.equal(cov.unavailableDecadeAlbums, 1);

  assert.equal(insights.tasteDna.availableGenres.length, 1);
  assert.equal(insights.tasteDna.availableGenres[0].genreName, 'Alternative');
  assert.equal(insights.tasteDna.availableGenres[0].albumCount, 2);
  assert.equal(insights.tasteDna.availableGenres[0].sharePercent, 100);
});

// Test 3: Rating Distribution computes accurate mean, median (odd & even), tier buckets, and excludes unscored albums
runTest('3. Rating Distribution calculates exact mean, median, tier buckets, and omits unscored albums', () => {
  assert.equal(calculateMedianScore([]), null);
  assert.equal(calculateMedianScore([9.0, 6.0, 8.5]), 8.5);
  assert.equal(calculateMedianScore([9.0, 8.0, 7.0, 5.0]), 7.5); // (8.0 + 7.0) / 2 = 7.5

  const mem = new MemoryStorage();
  setStorageBackendForTesting(mem);

  // 3 scored albums: 9.5 (Masterpiece), 8.5 (Essential), 6.0 (Solid)
  saveTrackRatingUpdate(1097862870, '1097863022', { rating: 9.5, included: true });
  saveTrackRatingUpdate(697194953, '697195051', { rating: 8.5, included: true });
  saveTrackRatingUpdate(1146195596, '1146195601', { rating: 6.0, included: true });

  // 1 album where the only rated track is excluded from scoring -> unscored!
  saveTrackRatingUpdate(1739079974, '1739079975', { rating: 4.0, included: false });

  const insights = buildListeningInsights(getSavedRatingsMap(), getAlbumCatalogCacheMap());
  const dist = insights.ratingDistribution;

  assert.equal(dist.totalRatedAlbums, 4);
  assert.equal(dist.scoredAlbumsCount, 3);
  assert.equal(dist.unscoredAlbumsCount, 1);
  assert.equal(dist.averageScore, 8.0); // (9.5 + 8.5 + 6.0) / 3 = 8.0
  assert.equal(dist.medianScore, 8.5); // middle of [6.0, 8.5, 9.5]

  const masterpieceBucket = dist.tierBuckets.find((b) => b.id === 'masterpiece');
  const essentialBucket = dist.tierBuckets.find((b) => b.id === 'essential');
  const solidBucket = dist.tierBuckets.find((b) => b.id === 'solid');
  const skipBucket = dist.tierBuckets.find((b) => b.id === 'skip');

  assert.equal(masterpieceBucket.count, 1);
  assert.equal(essentialBucket.count, 1);
  assert.equal(solidBucket.count, 1);
  assert.equal(skipBucket.count, 0);
});

// Test 4: Artist Rankings show sample sizes and prioritize multi-album sample artists over 1-album outliers
runTest('4. Artist Rankings report sample sizes and prioritize 2+ album artists ahead of 1-album outliers', () => {
  const mem = new MemoryStorage();
  setStorageBackendForTesting(mem);

  const secondRadioheadMeta = {
    collectionId: 90002,
    collectionName: 'Kid A',
    artistName: 'Radiohead',
    primaryGenreName: 'Alternative',
    releaseDate: '2000-10-02T07:00:00Z',
    trackCount: 10
  };
  const secondRadioheadTracks = [
    { trackId: 921, trackNumber: 1, discNumber: 1, trackName: 'Everything In Its Right Place', trackTimeMillis: 251000 }
  ];

  // Radiohead has 2 scored albums: 9.0 and 9.0 -> 9.0 multi-album average
  saveTrackRatingUpdate(1097862870, '1097863022', { rating: 9.0 });
  saveTrackRatingUpdate(90002, '921', { rating: 9.0 }, secondRadioheadTracks, secondRadioheadMeta);

  // Frank Ocean has only 1 scored album at 9.5 (Single-Album Sample)
  saveTrackRatingUpdate(1146195596, '1146195601', { rating: 9.5 });

  const insights = buildListeningInsights(getSavedRatingsMap(), getAlbumCatalogCacheMap());
  const rankings = insights.artistRankings;

  assert.equal(rankings.multiAlbumArtists.length, 1);
  assert.equal(rankings.singleAlbumArtists.length, 1);

  // Multi-album artist (Radiohead, 2 LPs) leads the combined ranking ahead of 1-LP outlier
  assert.equal(rankings.rankedArtists[0].artistName, 'Radiohead');
  assert.equal(rankings.rankedArtists[0].scoredAlbumCount, 2);
  assert.equal(rankings.rankedArtists[0].isMultiAlbumSample, true);
  assert.ok(rankings.rankedArtists[0].sampleBadgeText.includes('2 SCORED LPs'));

  assert.equal(rankings.rankedArtists[1].artistName, 'Frank Ocean');
  assert.equal(rankings.rankedArtists[1].scoredAlbumCount, 1);
  assert.equal(rankings.rankedArtists[1].isSingleAlbumSample, true);
  assert.ok(rankings.rankedArtists[1].sampleBadgeText.includes('1 LP SAMPLE'));
});

// Test 5: Decade Breakdown groups by decade, calculates averages, and handles missing/invalid dates safely
runTest('5. Decade Breakdown groups albums by decade and isolates missing or invalid release dates safely', () => {
  assert.deepEqual(extractReleaseDecade('1997-09-22T07:00:00Z'), {
    year: 1997,
    decadeStart: 1990,
    decadeLabel: '1990s'
  });
  assert.equal(extractReleaseDecade('invalid-year'), null);
  assert.equal(extractReleaseDecade(''), null);

  const mem = new MemoryStorage();
  setStorageBackendForTesting(mem);

  // 1990s: Homogenic (1997, 9.0) + Love Deluxe (1992, 8.0) -> 2 albums, avg 8.5
  saveTrackRatingUpdate(1440857781, '1440857782', { rating: 9.0 });
  saveTrackRatingUpdate(1586472452, '1586472453', { rating: 8.0 });
  // 2000s: In Rainbows (2007, 9.5) -> 1 album, avg 9.5
  saveTrackRatingUpdate(1097862870, '1097863022', { rating: 9.5 });
  // Missing date album 777777
  saveTrackRatingUpdate(777777, 't1', { rating: 7.0 });

  const insights = buildListeningInsights(getSavedRatingsMap(), getAlbumCatalogCacheMap());
  const dec = insights.decadeBreakdown;

  assert.equal(dec.decades.length, 2);
  assert.equal(dec.decades[0].decadeLabel, '1990s');
  assert.equal(dec.decades[0].albumCount, 2);
  assert.equal(dec.decades[0].averageScore, 8.5);

  assert.equal(dec.decades[1].decadeLabel, '2000s');
  assert.equal(dec.decades[1].albumCount, 1);
  assert.equal(dec.decades[1].averageScore, 9.5);

  assert.equal(dec.preferredDecade.decadeLabel, '1990s');
  assert.equal(dec.unavailableDecadeAlbumCount, 1);
  assert.equal(dec.unknownDecadeSummary.albumCount, 1);
  assert.equal(dec.unknownDecadeSummary.averageScore, 7.0);
});

// Test 6: Hidden Gems transparently identifies high-scoring albums with low sample depth without inventing popularity claims
runTest('6. Hidden Gems identifies high-scoring albums from 1-LP library artists or low track counts transparently', () => {
  const mem = new MemoryStorage();
  setStorageBackendForTesting(mem);

  // High score (9.5) with 1 track rated and 1 album by artist in library -> Hidden Gem
  saveTrackRatingUpdate(1097862870, '1097863022', { rating: 9.5 });
  // Low score (5.5) -> Not a Hidden Gem
  saveTrackRatingUpdate(697194953, '697195051', { rating: 5.5 });

  const insights = buildListeningInsights(getSavedRatingsMap(), getAlbumCatalogCacheMap());
  const gems = insights.hiddenGems.gems;

  assert.equal(gems.length, 1);
  assert.equal(gems[0].collectionName, 'In Rainbows');
  assert.ok(gems[0].criteriaExplanation.includes('Scored 9.5'));
  assert.ok(insights.hiddenGems.methodologyText.includes('No external streaming or commercial popularity data'));
});

// Test 7: Share Insights 1080x1920 Canvas renders all 3 themes and handles missing artwork/empty libraries
runTest('7. Share Insights 1080x1920 Canvas renders all 3 themes and never outputs NaN/undefined/null', () => {
  const mem = new MemoryStorage();
  setStorageBackendForTesting(mem);

  saveTrackRatingUpdate(1097862870, '1097863022', { rating: 9.5 });
  saveTrackRatingUpdate(1440857781, '1440857782', { rating: 8.5 });

  for (const themeKey of Object.keys(CARD_THEMES)) {
    const payload = prepareListeningInsightsCardPayload({
      ratingsMap: getSavedRatingsMap(),
      metadataMap: getAlbumCatalogCacheMap(),
      themeId: themeKey
    });

    assert.equal(payload.isShareable, true);
    assert.equal(payload.formattedAverageScore, '9.0');
    assert.equal(payload.formattedMedianScore, '9.0');

    const canvas = new MockCanvas();
    const res = renderListeningInsightsCardToCanvas(canvas, payload, {});
    assert.equal(canvas.width, 1080);
    assert.equal(canvas.height, 1920);
    assert.equal(res.width, CARD_WIDTH);
    assert.equal(res.height, CARD_HEIGHT);
    assert.equal(res.themeId, themeKey);

    assert.equal(
      canvas.ctx.drawnTexts.some((t) => t.text.includes('LISTENING INSIGHTS // TASTE DNA')),
      true
    );
    assert.equal(
      canvas.ctx.drawnTexts.some((t) => t.text.includes('RATING DISTRIBUTION')),
      true
    );

    for (const item of canvas.ctx.drawnTexts) {
      assert.equal(item.text.includes('NaN'), false, 'Found NaN in: ' + item.text);
      assert.equal(item.text.includes('undefined'), false, 'Found undefined in: ' + item.text);
      assert.equal(item.text.includes('null'), false, 'Found null in: ' + item.text);
      assert.equal(item.text.includes('Infinity'), false, 'Found Infinity in: ' + item.text);
    }
  }

  // Empty library canvas safety check
  const emptyPayload = prepareListeningInsightsCardPayload({
    ratingsMap: {},
    metadataMap: {},
    themeId: 'obsidian'
  });
  const emptyCanvas = new MockCanvas();
  renderListeningInsightsCardToCanvas(emptyCanvas, emptyPayload, {});
  assert.equal(emptyCanvas.width, 1080);
  assert.equal(emptyCanvas.height, 1920);
  assert.equal(buildSanitizedInsightsFilename(), 'RATEPLAY - Listening Insights.png');
});

console.log('\nAll ' + String(passed) + ' Phase 7 automated verification suites passed.\n');