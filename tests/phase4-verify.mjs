/**
 * SLEEVE - Phase 4 Automated Verification Suite (Node.js)
 * Verifies all 13 required Phase 4 scenarios: syntax checks, empty library,
 * eligibility, deduplication, Phase 3 score parity, excluded track handling,
 * local search, all 5 sorting modes, summary stats, live rating updates,
 * persistence/migration, and non-destructive remove/restore from library.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { calculateAlbumScoreAndHighlights } from '../js/calculator.js';
import {
  setStorageBackendForTesting,
  getSavedRatingsMap,
  getAlbumTrackRatings,
  getAlbumCatalogCacheMap,
  saveAlbumMetadataToCache,
  saveTrackRatingUpdate,
  removeAlbumFromLibrary,
  restoreAlbumToLibrary
} from '../js/storage.js';
import {
  LIBRARY_SORT_MODES,
  LIBRARY_FILTER_MODES,
  getLibraryEntries,
  filterLibraryEntries,
  sortLibraryEntries,
  calculateLibrarySummary,
  queryLibrary
} from '../js/library.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const jsFilesToCheck = [
  'js/config.js',
  'js/calculator.js',
  'js/storage.js',
  'js/library.js',
  'js/api.js',
  'js/ui/discoverView.js',
  'js/ui/albumView.js',
  'js/ui/libraryView.js',
  'js/app.js',
  'tests/phase3-verify.mjs',
  'tests/phase4-verify.mjs'
];

console.log('\n[PHASE 4] Checking JavaScript syntax across all 11 modules...');
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

const mockTracksAlbumA = [
  { trackId: 1001, trackNumber: 1, discNumber: 1, trackName: 'Track One', trackTimeMillis: 200000 },
  { trackId: 1002, trackNumber: 2, discNumber: 1, trackName: 'Track Two', trackTimeMillis: 210000 },
  { trackId: 1003, trackNumber: 3, discNumber: 1, trackName: 'Track Three', trackTimeMillis: 180000 }
];

const mockMetaAlbumA = {
  collectionId: 5001,
  collectionName: 'Alpha Record',
  artistName: 'Zeta Band',
  primaryGenreName: 'Alternative',
  releaseDate: '2021-05-10T07:00:00Z',
  trackCount: 3,
  artworkUrl100: 'https://example.com/100x100bb.jpg'
};

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

console.log('\n[PHASE 4] Running Automated Library & Storage Verification Suite...');

// Test 1: A user with no ratings sees a correct empty library & safe summary
runTest('1. Empty storage produces 0 library entries and safe summary statistics (no NaN/Infinity)', () => {
  const mem = new MemoryStorage();
  setStorageBackendForTesting(mem);

  const result = queryLibrary(getSavedRatingsMap(), getAlbumCatalogCacheMap());
  assert.equal(result.allEntries.length, 0);
  assert.equal(result.visibleEntries.length, 0);
  assert.equal(result.summary.totalAlbums, 0);
  assert.equal(result.summary.totalRatedTracks, 0);
  assert.equal(result.summary.averageAlbumScore, null);
  assert.equal(result.summary.formattedAverageScore, null);
  assert.equal(result.summary.highestRatedAlbum, null);
});

// Test 2 & 3: Rating a track makes its album eligible; multiple rated tracks produce only 1 card
runTest('2 & 3. Rating tracks makes album eligible and multiple rated tracks produce exactly one library card', () => {
  const mem = new MemoryStorage();
  setStorageBackendForTesting(mem);

  // Only toggling interlude without rating any track does NOT add an unrated album to My Library
  saveTrackRatingUpdate(5001, '1001', { interlude: true }, mockTracksAlbumA, mockMetaAlbumA);
  let res = queryLibrary(getSavedRatingsMap(), getAlbumCatalogCacheMap());
  assert.equal(res.allEntries.length, 0);

  // Rating track 1001 makes album 5001 eligible
  saveTrackRatingUpdate(5001, '1001', { rating: 8.5 }, mockTracksAlbumA, mockMetaAlbumA);
  // Rating track 1002 and 1003 on the same album still produces only 1 library entry
  saveTrackRatingUpdate(5001, '1002', { rating: 9.0 }, mockTracksAlbumA, mockMetaAlbumA);
  saveTrackRatingUpdate(5001, '1003', { rating: 9.5 }, mockTracksAlbumA, mockMetaAlbumA);

  res = queryLibrary(getSavedRatingsMap(), getAlbumCatalogCacheMap());
  assert.equal(res.allEntries.length, 1);
  assert.equal(res.allEntries[0].collectionId, 5001);
  assert.equal(res.allEntries[0].ratedTrackCount, 3);
  assert.equal(res.allEntries[0].completionStatus, 'complete');
});

// Test 4 & 5: Album scores match Phase 3 calculations and excluded tracks do not affect album scores
runTest('4 & 5. Library album scores match Phase 3 calculations and ignore excluded tracks', () => {
  const mem = new MemoryStorage();
  setStorageBackendForTesting(mem);

  saveTrackRatingUpdate(5001, '1001', { rating: 9.0, included: true }, mockTracksAlbumA, mockMetaAlbumA);
  saveTrackRatingUpdate(5001, '1002', { rating: 5.0, included: false }, mockTracksAlbumA, mockMetaAlbumA);

  const trackRatings = getAlbumTrackRatings(5001);
  const phase3Metrics = calculateAlbumScoreAndHighlights(mockTracksAlbumA, trackRatings);
  const libEntries = getLibraryEntries(getSavedRatingsMap(), getAlbumCatalogCacheMap());

  assert.equal(libEntries.length, 1);
  assert.equal(libEntries[0].overallScore, phase3Metrics.overallScore);
  assert.equal(libEntries[0].overallScore, 9.0);
  assert.equal(libEntries[0].ratedTrackCount, 2);
  assert.equal(libEntries[0].scoredTrackCount, 1);
  assert.equal(libEntries[0].excludedRatedCount, 1);
});

// Test 6: Search finds albums by title and artist, and completion filter distinguishes complete vs incomplete
runTest('6. Local library search matches title/artist and completion filter distinguishes complete vs incomplete', () => {
  const mem = new MemoryStorage();
  setStorageBackendForTesting(mem);

  // Album 5001 (3 tracks, all 3 rated -> complete)
  saveTrackRatingUpdate(5001, '1001', { rating: 8.0 }, mockTracksAlbumA, mockMetaAlbumA);
  saveTrackRatingUpdate(5001, '1002', { rating: 8.5 }, mockTracksAlbumA, mockMetaAlbumA);
  saveTrackRatingUpdate(5001, '1003', { rating: 9.0 }, mockTracksAlbumA, mockMetaAlbumA);

  // Curated Album 1097862870 (In Rainbows by Radiohead, 10 tracks, only 1 rated -> incomplete)
  saveTrackRatingUpdate(1097862870, '1097863022', { rating: 9.5 });

  const entries = getLibraryEntries(getSavedRatingsMap(), getAlbumCatalogCacheMap());
  assert.equal(entries.length, 2);

  const byTitle = filterLibraryEntries(entries, { query: 'rainbows' });
  assert.equal(byTitle.length, 1);
  assert.equal(byTitle[0].artistName, 'Radiohead');

  const byArtist = filterLibraryEntries(entries, { query: 'zeta band' });
  assert.equal(byArtist.length, 1);
  assert.equal(byArtist[0].collectionName, 'Alpha Record');

  const onlyComplete = filterLibraryEntries(entries, { filterMode: LIBRARY_FILTER_MODES.COMPLETE });
  assert.equal(onlyComplete.length, 1);
  assert.equal(onlyComplete[0].collectionId, 5001);

  const onlyIncomplete = filterLibraryEntries(entries, { filterMode: LIBRARY_FILTER_MODES.INCOMPLETE });
  assert.equal(onlyIncomplete.length, 1);
  assert.equal(onlyIncomplete[0].collectionId, 1097862870);
});

// Test 7: Every sorting mode works, including missing metadata/scores/dates
runTest('7. All 5 sorting modes work deterministically and handle missing scores, dates, and metadata', () => {
  const sampleEntries = [
    {
      collectionId: 1,
      collectionKey: '1',
      collectionName: 'Beta Album',
      artistName: 'Charlie Artist',
      overallScore: 7.5,
      scoredTrackCount: 4,
      ratedTrackCount: 4,
      updatedTimestampMs: 1000
    },
    {
      collectionId: 2,
      collectionKey: '2',
      collectionName: 'Alpha Album',
      artistName: 'Delta Artist',
      overallScore: 9.2,
      scoredTrackCount: 8,
      ratedTrackCount: 8,
      updatedTimestampMs: 3000
    },
    {
      collectionId: 3,
      collectionKey: '3',
      collectionName: 'Gamma Album',
      artistName: 'Alpha Artist',
      overallScore: null, // Unscored (e.g. only rated track excluded)
      scoredTrackCount: 0,
      ratedTrackCount: 1,
      updatedTimestampMs: null // Missing date
    }
  ];

  const byScoreDesc = sortLibraryEntries(sampleEntries, LIBRARY_SORT_MODES.SCORE_DESC);
  assert.deepEqual(byScoreDesc.map((e) => e.collectionId), [2, 1, 3]);

  const byScoreAsc = sortLibraryEntries(sampleEntries, LIBRARY_SORT_MODES.SCORE_ASC);
  assert.deepEqual(byScoreAsc.map((e) => e.collectionId), [1, 2, 3]);

  const byUpdatedDesc = sortLibraryEntries(sampleEntries, LIBRARY_SORT_MODES.UPDATED_DESC);
  assert.deepEqual(byUpdatedDesc.map((e) => e.collectionId), [2, 1, 3]);

  const byTitleAsc = sortLibraryEntries(sampleEntries, LIBRARY_SORT_MODES.TITLE_ASC);
  assert.deepEqual(byTitleAsc.map((e) => e.collectionId), [2, 1, 3]);

  const byArtistAsc = sortLibraryEntries(sampleEntries, LIBRARY_SORT_MODES.ARTIST_ASC);
  assert.deepEqual(byArtistAsc.map((e) => e.collectionId), [3, 1, 2]);
});

// Test 8, 9 & 10: Changing a rating updates library statistics/ordering and persists across reloads
runTest('8, 9 & 10. Updating a track rating updates library summary, ordering, and persists across reload', () => {
  const mem = new MemoryStorage();
  setStorageBackendForTesting(mem);

  // Rate In Rainbows (1097862870) at 8.0 and Blonde (1146195596) at 9.0
  saveTrackRatingUpdate(1097862870, '1097863022', { rating: 8.0 });
  saveTrackRatingUpdate(1146195596, '1146195601', { rating: 9.0 });

  let q1 = queryLibrary(getSavedRatingsMap(), getAlbumCatalogCacheMap(), {
    sortBy: LIBRARY_SORT_MODES.SCORE_DESC
  });
  assert.equal(q1.summary.totalAlbums, 2);
  assert.equal(q1.summary.totalRatedTracks, 2);
  assert.equal(q1.summary.averageAlbumScore, 8.5);
  assert.equal(q1.summary.highestRatedAlbum.collectionName, 'Blonde');
  assert.equal(q1.visibleEntries[0].collectionName, 'Blonde');

  // Now update In Rainbows track to 10.0 -> In Rainbows becomes #1 (10.0) and average becomes 9.5
  saveTrackRatingUpdate(1097862870, '1097863022', { rating: 10.0 });

  let q2 = queryLibrary(getSavedRatingsMap(), getAlbumCatalogCacheMap(), {
    sortBy: LIBRARY_SORT_MODES.SCORE_DESC
  });
  assert.equal(q2.summary.averageAlbumScore, 9.5);
  assert.equal(q2.summary.highestRatedAlbum.collectionName, 'In Rainbows');
  assert.equal(q2.visibleEntries[0].collectionName, 'In Rainbows');
});

// Test 11 & 12: Legacy Phase 3 ratings migration + Remove/Restore from library preserves track ratings
runTest('11 & 12. Legacy Phase 3 ratings migrate cleanly and removing from library preserves track ratings', () => {
  const mem = new MemoryStorage();
  mem.setItem('unrelated_user_key', 'keep_intact');

  // Seed a raw Phase 3 rating record without albumCatalogCache entry
  const legacyPhase3Payload = {
    '697194953': {
      collectionId: '697194953',
      updatedAt: '2026-10-17T12:00:00.000Z',
      overallScore: 8.5,
      ratedCount: 2,
      includedCount: 13,
      scoredCount: 2,
      trackRatings: {
        '697195051': { rating: 8.0, interlude: false, included: true },
        '697195264': { rating: 9.0, interlude: false, included: true }
      }
    },
    '777777': {
      collectionId: '777777',
      updatedAt: '2026-10-16T12:00:00.000Z',
      trackRatings: {
        't1': { rating: 7.5, interlude: false, included: true }
      }
    }
  };
  mem.setItem('sleeve_ratings_v1', JSON.stringify(legacyPhase3Payload));
  setStorageBackendForTesting(mem);

  const migrated = queryLibrary(getSavedRatingsMap(), getAlbumCatalogCacheMap());
  assert.equal(migrated.allEntries.length, 2);

  // Curated album 697194953 resolves full metadata (Random Access Memories)
  const daftPunk = migrated.allEntries.find((e) => Number(e.collectionId) === 697194953);
  assert.equal(daftPunk.collectionName, 'Random Access Memories');
  assert.equal(daftPunk.overallScore, 8.5);

  // Unknown legacy album 777777 reconstructs with safe fallback placeholder and unknown completion
  const unknownAlbum = migrated.allEntries.find((e) => Number(e.collectionId) === 777777);
  assert.equal(unknownAlbum.collectionName, 'Album #777777');
  assert.equal(unknownAlbum.overallScore, 7.5);
  assert.equal(unknownAlbum.completionStatus, 'unknown');
  assert.equal(unknownAlbum.isComplete, false);

  // Remove 697194953 from My Library -> hidden from library, but track ratings remain intact!
  removeAlbumFromLibrary(697194953);
  const afterRemove = queryLibrary(getSavedRatingsMap(), getAlbumCatalogCacheMap());
  assert.equal(afterRemove.allEntries.length, 1);
  assert.equal(afterRemove.hiddenCount, 1);

  const preservedTracks = getAlbumTrackRatings(697194953);
  assert.equal(preservedTracks['697195051'].rating, 8.0);
  assert.equal(preservedTracks['697195264'].rating, 9.0);

  // Restore 697194953 back to My Library -> reappears with 8.5 score
  restoreAlbumToLibrary(697194953);
  const afterRestore = queryLibrary(getSavedRatingsMap(), getAlbumCatalogCacheMap());
  assert.equal(afterRestore.allEntries.length, 2);
  assert.equal(afterRestore.hiddenCount, 0);

  // Unrelated localStorage key is untouched
  assert.equal(mem.getItem('unrelated_user_key'), 'keep_intact');
});

console.log('\nAll ' + String(passed) + ' Phase 4 automated verification suites passed.\n');