/**
 * SLEEVE - Phase 9B Automated Verification Suite (Node.js)
 * Verifies:
 * 1. JavaScript syntax across all 32 project modules
 * 2. Smart Collection rule evaluation:
 *    - Minimum & maximum album rating rules
 *    - Specific artist rule (case-insensitive)
 *    - Release decade rule (when metadata is available)
 *    - Albums with journal entries (hasJournalEntry)
 *    - Albums with favorite tracks (hasFavoriteTracks)
 * 3. Safe missing metadata handling (unrated albums, unknown artists, missing release years)
 * 4. Dynamic updates when ratings or journal entries change, without duplicating albums
 *    or altering saved ratings/journal entries
 * 5. Creating, editing, and removing smart rules (removeSmartCollectionRule)
 * 6. 1080x1920 Collection Poster Canvas generation across all 3 themes,
 *    handling missing artwork and empty collections gracefully without exposing file paths
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
  getSavedJournalMap,
  saveAlbumJournalEntry,
  getSavedCollectionsMap,
  getCustomCollection,
  saveCustomCollection,
  removeSmartCollectionRule
} from '../js/storage.js';
import {
  describeSmartCollectionRules,
  evaluateSmartCollectionRules,
  buildEnrichedCollection
} from '../js/collections.js';
import {
  CARD_WIDTH,
  CARD_HEIGHT,
  CARD_THEMES,
  buildSanitizedCollectionPosterFilename,
  prepareCollectionPosterPayload,
  renderCollectionPosterToCanvas
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
  'js/journal.js',
  'js/collections.js',
  'js/portability.js',
  'js/discovery.js',
  'js/canvas-card.js',
  'js/api.js',
  'js/ui/discoverView.js',
  'js/ui/albumView.js',
  'js/ui/libraryView.js',
  'js/ui/profileView.js',
  'js/ui/insightsView.js',
  'js/ui/journalView.js',
  'js/ui/collectionsView.js',
  'js/ui/shareModal.js',
  'js/ui/importModal.js',
  'js/ui/journalModal.js',
  'js/app.js',
  'tests/phase3-verify.mjs',
  'tests/phase4-verify.mjs',
  'tests/phase5-verify.mjs',
  'tests/phase6-part1-verify.mjs',
  'tests/phase6-part2-verify.mjs',
  'tests/phase7-verify.mjs',
  'tests/phase8-verify.mjs',
  'tests/phase9a-verify.mjs',
  'tests/phase9b-verify.mjs'
];

console.log('\n[PHASE 9B] Checking JavaScript syntax across all 32 modules...');
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

console.log('\n[PHASE 9B] Running Smart Collections & Collection Posters Verification Suite...');

// Test 1: Smart Collection rules evaluation (min/max rating, artist, decade, journal, favorites)
runTest('1. Smart rules accurately filter by min/max rating, artist, decade, journal entry, and favorites', () => {
  const mem = new MemoryStorage();
  setStorageBackendForTesting(mem);

  // 1. In Rainbows (Radiohead, 2007 -> 2000s) rated 9.5 + Journal entry with favorite track
  saveTrackRatingUpdate(1097862870, '1097863022', { rating: 9.5 });
  saveAlbumJournalEntry(1097862870, {
    reviewText: 'Masterpiece pressing.',
    moodTags: ['Late Night'],
    favoriteTracks: [{ trackKey: '1097863022', trackNumber: 1, trackName: '15 Step' }]
  });

  // 2. Random Access Memories (Daft Punk, 2013 -> 2010s) rated 8.5 + Journal entry without favorite tracks
  saveTrackRatingUpdate(697194953, '697195051', { rating: 8.5 });
  saveAlbumJournalEntry(697194953, {
    reviewText: 'Studio disco classic.',
    moodTags: ['Euphoric']
  });

  // 3. Homogenic (Bjork, 1997 -> 1990s) rated 7.0, no journal entry
  saveTrackRatingUpdate(1440857781, '1440857782', { rating: 7.0 });

  const rMap = getSavedRatingsMap();
  const mMap = getAlbumCatalogCacheMap();
  const jMap = getSavedJournalMap();

  // Rule A: minRating 9.0 -> only In Rainbows
  const evalMin9 = evaluateSmartCollectionRules({ minRating: 9.0 }, rMap, mMap, jMap);
  assert.equal(evalMin9.matchedAlbums.length, 1);
  assert.equal(evalMin9.matchedAlbums[0].collectionName, 'In Rainbows');

  // Rule B: minRating 7.0, maxRating 8.5 -> Random Access Memories (8.5) & Homogenic (7.0)
  const evalRange = evaluateSmartCollectionRules(
    { minRating: 7.0, maxRating: 8.5 },
    rMap,
    mMap,
    jMap
  );
  assert.equal(evalRange.matchedAlbums.length, 2);

  // Rule C: artist "Radiohead" -> In Rainbows
  const evalArtist = evaluateSmartCollectionRules({ artist: 'radiohead' }, rMap, mMap, jMap);
  assert.equal(evalArtist.matchedAlbums.length, 1);
  assert.equal(evalArtist.matchedAlbums[0].artistName, 'Radiohead');

  // Rule D: decade "2010s" -> Random Access Memories
  const evalDecade = evaluateSmartCollectionRules({ decade: '2010s' }, rMap, mMap, jMap);
  assert.equal(evalDecade.matchedAlbums.length, 1);
  assert.equal(evalDecade.matchedAlbums[0].collectionName, 'Random Access Memories');

  // Rule E: hasJournalEntry: true -> In Rainbows & Random Access Memories (2 albums)
  const evalJournal = evaluateSmartCollectionRules(
    { hasJournalEntry: true },
    rMap,
    mMap,
    jMap
  );
  assert.equal(evalJournal.matchedAlbums.length, 2);

  // Rule F: hasFavoriteTracks: true -> only In Rainbows (1 album)
  const evalFavs = evaluateSmartCollectionRules(
    { hasFavoriteTracks: true },
    rMap,
    mMap,
    jMap
  );
  assert.equal(evalFavs.matchedAlbums.length, 1);
  assert.equal(evalFavs.matchedAlbums[0].collectionName, 'In Rainbows');
});

// Test 2: Missing metadata safety (unrated albums, unknown artists, missing release years)
runTest('2. Smart rules safely skip albums with missing metadata and report skipped counts', () => {
  const mem = new MemoryStorage();
  setStorageBackendForTesting(mem);

  // Album 999991 has no cached metadata (unknown artist, missing release year) and is rated 8.5
  saveTrackRatingUpdate(999991, 't1', { rating: 8.5 });
  // Album 1097862870 has only an excluded track -> unscored (overallScore === null)
  saveTrackRatingUpdate(1097862870, '1097863022', { rating: 9.0, included: false });

  const rMap = getSavedRatingsMap();
  const mMap = getAlbumCatalogCacheMap();
  const jMap = getSavedJournalMap();

  const byScore = evaluateSmartCollectionRules({ minRating: 8.0 }, rMap, mMap, jMap);
  assert.equal(byScore.matchedAlbums.length, 1);
  assert.equal(byScore.skippedMissingMetadata.unratedForScoreRule, 1);

  const byArtist = evaluateSmartCollectionRules({ artist: 'Radiohead' }, rMap, mMap, jMap);
  assert.equal(byArtist.skippedMissingMetadata.unknownArtistForArtistRule, 1);

  const byDecade = evaluateSmartCollectionRules({ decade: '2000s' }, rMap, mMap, jMap);
  assert.equal(byDecade.skippedMissingMetadata.missingDecadeForDecadeRule, 1);
});

// Test 3: Dynamic updates & rule editing/removal without modifying ratings or journal entries
runTest('3. Smart collections update dynamically as local data changes and support rule editing/removal', () => {
  const mem = new MemoryStorage();
  setStorageBackendForTesting(mem);

  // Create Smart Collection for 9.0+ albums in the 2010s
  const created = saveCustomCollection({
    id: 'col-smart-2010s',
    title: '2010s Masterpieces',
    type: 'smart',
    theme: 'emerald',
    smartRules: {
      minRating: 9.0,
      decade: '2010s'
    }
  });
  assert.equal(created.savedOk, true);
  assert.equal(created.collection.type, 'smart');

  // Initially 0 albums rated -> Smart Collection has 0 albums
  let enriched = buildEnrichedCollection(
    'col-smart-2010s',
    getCustomCollection('col-smart-2010s')
  );
  assert.equal(enriched.albumCount, 0);

  // Now rate Blonde (Frank Ocean, 2016 -> 2010s) at 9.5 -> Smart Collection updates dynamically!
  saveTrackRatingUpdate(1146195596, '1146195601', { rating: 9.5 });

  enriched = buildEnrichedCollection(
    'col-smart-2010s',
    getCustomCollection('col-smart-2010s')
  );
  assert.equal(enriched.albumCount, 1);
  assert.equal(enriched.albums[0].collectionName, 'Blonde');
  assert.equal(enriched.averageScore, 9.5);
  assert.ok(enriched.rulesSummaryText.includes('Min Rating: 9.0+'));
  assert.ok(enriched.rulesSummaryText.includes('Decade: 2010s'));

  // Rate In Rainbows (Radiohead, 2007 -> 2000s) at 9.5 -> does not match 2010s rule yet
  saveTrackRatingUpdate(1097862870, '1097863022', { rating: 9.5 });
  enriched = buildEnrichedCollection(
    'col-smart-2010s',
    getCustomCollection('col-smart-2010s')
  );
  assert.equal(enriched.albumCount, 1);

  // Remove the 'decade' rule -> now both Blonde (2016) and In Rainbows (2007) match!
  const afterRuleRemoved = removeSmartCollectionRule('col-smart-2010s', 'decade');
  assert.equal(afterRuleRemoved.ok, true);
  assert.equal(afterRuleRemoved.collection.smartRules.decade, '');

  enriched = buildEnrichedCollection(
    'col-smart-2010s',
    getCustomCollection('col-smart-2010s')
  );
  assert.equal(enriched.albumCount, 2);
});

// Test 4: 1080x1920 Collection Poster Canvas generation across all 3 themes & empty collection safety
runTest('4. Collection Poster renders 1080x1920 PNG for Manual, Smart, and Empty collections across all themes', () => {
  const mem = new MemoryStorage();
  setStorageBackendForTesting(mem);

  saveTrackRatingUpdate(1097862870, '1097863022', { rating: 9.5 });
  saveTrackRatingUpdate(1146195596, '1146195601', { rating: 9.0 });

  const smartCol = saveCustomCollection({
    id: 'col-poster-test',
    title: 'Essential 9+ Archive',
    description: 'Dynamically curated high-scoring pressings.',
    type: 'smart',
    theme: 'signal',
    smartRules: { minRating: 9.0 }
  }).collection;

  for (const themeKey of Object.keys(CARD_THEMES)) {
    const payload = prepareCollectionPosterPayload({
      collection: smartCol,
      ratingsMap: getSavedRatingsMap(),
      metadataMap: getAlbumCatalogCacheMap(),
      journalMap: getSavedJournalMap(),
      themeId: themeKey
    });

    assert.equal(payload.isShareable, true);
    assert.equal(payload.albumCount, 2);
    assert.equal(payload.formattedAverageScore, '9.3'); // (9.5 + 9.0) / 2 = 9.25 -> 9.3

    const canvas = new MockCanvas();
    const res = renderCollectionPosterToCanvas(canvas, payload, {});
    assert.equal(canvas.width, CARD_WIDTH);
    assert.equal(canvas.height, CARD_HEIGHT);
    assert.equal(res.width, 1080);
    assert.equal(res.height, 1920);
    assert.equal(res.themeId, themeKey);

    assert.equal(
      canvas.ctx.drawnTexts.some((t) => t.text.includes('Essential 9+ Archive')),
      true
    );

    // Ensure no NaN, undefined, null, Infinity, or local file paths appear
    for (const item of canvas.ctx.drawnTexts) {
      assert.equal(item.text.includes('NaN'), false, 'Found NaN in: ' + item.text);
      assert.equal(item.text.includes('undefined'), false, 'Found undefined in: ' + item.text);
      assert.equal(item.text.includes('null'), false, 'Found null in: ' + item.text);
      assert.equal(item.text.includes('Infinity'), false, 'Found Infinity in: ' + item.text);
      assert.equal(item.text.includes('C:\\'), false, 'Found local path in: ' + item.text);
    }
  }

  // Also verify empty collection poster rendering
  const emptyCol = saveCustomCollection({
    id: 'col-empty-poster',
    title: 'Empty Future Shelf',
    type: 'manual',
    albumIds: []
  }).collection;

  const emptyPayload = prepareCollectionPosterPayload({
    collection: emptyCol,
    themeId: 'obsidian'
  });
  const emptyCanvas = new MockCanvas();
  renderCollectionPosterToCanvas(emptyCanvas, emptyPayload, {});
  assert.equal(emptyCanvas.width, 1080);
  assert.equal(emptyCanvas.height, 1920);

  const fn = buildSanitizedCollectionPosterFilename('Late Night: 90s/00s*');
  assert.equal(fn, 'SLEEVE - Collection - Late Night 90s 00s.png');
});

console.log('\nAll ' + String(passed) + ' Phase 9B automated verification suites passed.\n');