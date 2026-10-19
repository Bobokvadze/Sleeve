/**
 * RATEPLAY - Phase 6 (Part 2) Automated Verification Suite (Node.js)
 * Verifies:
 * 1. JavaScript syntax across all 20 project modules
 * 2. Library JSON export payload structure and metadata inclusion
 * 3. Import validation: malformed JSON, non-object roots, unsupported versions,
 *    missing ratingsMap, and invalid track rating numbers rejected with clear messages
 * 4. Import duplicate album handling and preview calculation (toAdd, toUpdate, unchanged, preserved)
 * 5. Safe merge preserving existing ratings by default + overwrite mode + automatic pre-import backup
 * 6. Personalized discovery signals: under-explored high-rated artists & unrated catalog filtering
 * 7. Session caching in discovery engine to prevent duplicate API calls
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
  saveAlbumVerdict,
  getPreImportLocalBackup,
  restorePreImportLocalBackup
} from '../js/storage.js';
import {
  EXPORT_FORMAT_ID,
  EXPORT_FORMAT_VERSION,
  buildExportFilename,
  buildLibraryExportPayload,
  serializeLibraryExportJson,
  validateAndPreviewLibraryImport,
  applyValidatedLibraryImport
} from '../js/portability.js';
import {
  clearDiscoverySessionCache,
  deriveDiscoverySignals,
  filterCandidateDiscoveryAlbums,
  fetchPersonalizedDiscoveryAlbums
} from '../js/discovery.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const jsFilesToCheck = [
  'js/config.js',
  'js/calculator.js',
  'js/storage.js',
  'js/library.js',
  'js/profile.js',
  'js/portability.js',
  'js/discovery.js',
  'js/canvas-card.js',
  'js/api.js',
  'js/ui/discoverView.js',
  'js/ui/albumView.js',
  'js/ui/libraryView.js',
  'js/ui/profileView.js',
  'js/ui/shareModal.js',
  'js/ui/importModal.js',
  'js/app.js',
  'tests/phase3-verify.mjs',
  'tests/phase4-verify.mjs',
  'tests/phase5-verify.mjs',
  'tests/phase6-part1-verify.mjs',
  'tests/phase6-part2-verify.mjs'
];

console.log('\n[PHASE 6 PART 2] Checking JavaScript syntax across all 21 modules...');
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

async function runAsyncTest(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log('  [PASS] ' + name);
  } catch (err) {
    console.error('  [FAIL] ' + name);
    console.error('         ' + err.message);
    process.exit(1);
  }
}

console.log('\n[PHASE 6 PART 2] Running Library Import/Export & Discovery Verification Suite...');

// Test 1: Export payload structure and filename formatting
runTest('1. Export serializes ratingsMap and albumMetadataMap with format and version headers', () => {
  const mem = new MemoryStorage();
  setStorageBackendForTesting(mem);

  saveTrackRatingUpdate(1097862870, '1097863022', { rating: 9.5 });
  saveAlbumVerdict(1097862870, 'Timeless alternative classic.');

  const payload = buildLibraryExportPayload(getSavedRatingsMap(), getAlbumCatalogCacheMap());
  assert.equal(payload.format, EXPORT_FORMAT_ID);
  assert.equal(payload.version, EXPORT_FORMAT_VERSION);
  assert.equal(payload.summary.albumCount, 1);
  assert.equal(payload.summary.ratedTrackCount, 1);
  assert.equal(payload.ratingsMap['1097862870'].overallScore, 9.5);
  assert.equal(payload.ratingsMap['1097862870'].verdict, 'Timeless alternative classic.');
  assert.equal(payload.albumMetadataMap['1097862870'].collectionName, 'In Rainbows');

  const fn = buildExportFilename(new Date('2026-10-18T12:00:00Z'));
  assert.ok(fn.startsWith('RATEPLAY-Library-Backup-2026-10-'));
  assert.ok(fn.endsWith('.json'));
});

// Test 2: Validation rejects malformed JSON, missing fields, unsupported formats, and invalid ratings
runTest('2. Import validation rejects malformed JSON, missing fields, bad versions, and invalid ratings', () => {
  assert.equal(validateAndPreviewLibraryImport('').ok, false);
  assert.equal(validateAndPreviewLibraryImport('{not-valid-json').ok, false);
  assert.equal(validateAndPreviewLibraryImport('["array-root"]').ok, false);

  const wrongFormat = JSON.stringify({ format: 'OTHER_APP', version: 1, ratingsMap: {} });
  assert.equal(validateAndPreviewLibraryImport(wrongFormat).ok, false);

  const wrongVersion = JSON.stringify({
    format: EXPORT_FORMAT_ID,
    version: 99,
    ratingsMap: {}
  });
  assert.equal(validateAndPreviewLibraryImport(wrongVersion).ok, false);

  const missingRatings = JSON.stringify({ format: EXPORT_FORMAT_ID, version: 1 });
  assert.equal(validateAndPreviewLibraryImport(missingRatings).ok, false);

  const invalidTrackScore = JSON.stringify({
    format: EXPORT_FORMAT_ID,
    version: 1,
    ratingsMap: {
      '1097862870': {
        collectionId: '1097862870',
        trackRatings: {
          't1': { rating: 14.3, included: true } // Invalid score!
        }
      }
    }
  });
  const mem = new MemoryStorage();
  setStorageBackendForTesting(mem);
  saveTrackRatingUpdate(697194953, '697195051', { rating: 9.0 });

  const badScorePreview = validateAndPreviewLibraryImport(
    invalidTrackScore,
    getSavedRatingsMap(),
    getAlbumCatalogCacheMap()
  );
  assert.equal(badScorePreview.ok, false);
  assert.ok(badScorePreview.error.includes('invalid rating'));

  // Verify existing saved ratings were not modified by the rejected import
  assert.equal(getSavedRatingsMap()['697194953'].overallScore, 9.0);
  assert.equal(getSavedRatingsMap()['1097862870'], undefined);
});

// Test 3: Duplicate albums inside an import array are deduplicated and preview accurately counts add/update/unchanged/preserved
runTest('3. Import preview deduplicates input albums and accurately categorizes add, update, unchanged, and preserved albums', () => {
  const mem = new MemoryStorage();
  setStorageBackendForTesting(mem);

  // Existing local library has:
  // - 1097862870 (In Rainbows) rated 8.0
  // - 697194953 (Random Access Memories) rated 9.0 (not in import file -> must be preserved!)
  saveTrackRatingUpdate(1097862870, '1097863022', { rating: 8.0 });
  saveTrackRatingUpdate(697194953, '697195051', { rating: 9.0 });

  const importPayload = {
    format: EXPORT_FORMAT_ID,
    version: 1,
    albums: [
      // Duplicate entries for new album 1146195596 (Blonde): later timestamp has 9.5
      {
        collectionId: '1146195596',
        updatedAt: '2026-10-10T10:00:00.000Z',
        trackRatings: { '1146195601': { rating: 7.0, included: true } }
      },
      {
        collectionId: '1146195596',
        updatedAt: '2026-10-18T10:00:00.000Z',
        trackRatings: { '1146195601': { rating: 9.5, included: true } }
      },
      // Existing album 1097862870 with updated rating 10.0
      {
        collectionId: '1097862870',
        updatedAt: '2026-10-18T11:00:00.000Z',
        trackRatings: { '1097863022': { rating: 10.0, included: true } }
      }
    ]
  };

  const preview = validateAndPreviewLibraryImport(
    JSON.stringify(importPayload),
    getSavedRatingsMap(),
    getAlbumCatalogCacheMap()
  );

  assert.equal(preview.ok, true);
  assert.equal(preview.duplicateInputCount, 1);
  assert.equal(preview.albumsToAdd.length, 1);
  assert.equal(preview.albumsToAdd[0].collectionId, '1146195596');
  assert.equal(preview.albumsToAdd[0].newScore, '9.5');
  assert.equal(preview.albumsToUpdate.length, 1);
  assert.equal(preview.albumsToUpdate[0].collectionId, '1097862870');
  assert.equal(preview.untouchedExistingCount, 1); // 697194953 preserved!
});

// Test 4: Safe merge (add-only vs overwrite) + automatic pre-import backup and restore
runTest('4. Safe merge preserves existing ratings when overwriteExisting is false, creates backup, and supports restore', () => {
  const mem = new MemoryStorage();
  mem.setItem('unrelated_custom_key', 'stay_safe');
  setStorageBackendForTesting(mem);

  saveTrackRatingUpdate(1097862870, '1097863022', { rating: 8.0 });
  saveTrackRatingUpdate(697194953, '697195051', { rating: 9.0 });

  const importJson = JSON.stringify({
    format: EXPORT_FORMAT_ID,
    version: 1,
    ratingsMap: {
      '1146195596': {
        collectionId: '1146195596',
        trackRatings: { '1146195601': { rating: 9.5, included: true } }
      },
      '1097862870': {
        collectionId: '1097862870',
        trackRatings: { '1097863022': { rating: 6.0, included: true } }
      }
    }
  });

  const plan = validateAndPreviewLibraryImport(
    importJson,
    getSavedRatingsMap(),
    getAlbumCatalogCacheMap()
  );

  // Mode A: overwriteExisting = false -> adds 1146195596, keeps 1097862870 at 8.0, keeps 697194953 at 9.0
  const resAddOnly = applyValidatedLibraryImport(plan, { overwriteExisting: false });
  assert.equal(resAddOnly.ok, true);
  assert.equal(resAddOnly.addedCount, 1);
  assert.equal(resAddOnly.updatedCount, 0);
  assert.equal(resAddOnly.skippedConflictCount, 1);

  const afterAddOnly = getSavedRatingsMap();
  assert.equal(afterAddOnly['1146195596'].overallScore, 9.5);
  assert.equal(afterAddOnly['1097862870'].overallScore, 8.0); // Preserved!
  assert.equal(afterAddOnly['697194953'].overallScore, 9.0); // Preserved!

  // Verify pre-import backup was created automatically before applying
  const backup = getPreImportLocalBackup();
  assert.ok(backup);
  assert.equal(Object.keys(backup.ratingsMap).length, 2);

  // Restore pre-import backup -> returns to original 2 albums
  assert.equal(restorePreImportLocalBackup(), true);
  assert.equal(Object.keys(getSavedRatingsMap()).length, 2);

  // Mode B: overwriteExisting = true -> updates 1097862870 to 6.0 while still keeping 697194953 at 9.0
  const plan2 = validateAndPreviewLibraryImport(
    importJson,
    getSavedRatingsMap(),
    getAlbumCatalogCacheMap()
  );
  const resOverwrite = applyValidatedLibraryImport(plan2, { overwriteExisting: true });
  assert.equal(resOverwrite.ok, true);
  assert.equal(resOverwrite.addedCount, 1);
  assert.equal(resOverwrite.updatedCount, 1);
  assert.equal(getSavedRatingsMap()['1097862870'].overallScore, 6.0);
  assert.equal(getSavedRatingsMap()['697194953'].overallScore, 9.0);
  assert.equal(mem.getItem('unrelated_custom_key'), 'stay_safe');
});

// Test 5: Discovery signals, unrated album filtering, and session caching
await runAsyncTest('5. Discovery engine derives artist signals, filters out already-rated albums, and caches API calls', async () => {
  const mem = new MemoryStorage();
  setStorageBackendForTesting(mem);
  clearDiscoverySessionCache();

  // Rate In Rainbows (Radiohead, ID 1097862870) at 9.5
  saveTrackRatingUpdate(1097862870, '1097863022', { rating: 9.5 });

  let apiCallCount = 0;
  const mockSearchAlbums = async (artistQuery) => {
    apiCallCount += 1;
    return {
      source: 'live',
      albums: [
        // Already rated album (must be excluded!)
        {
          collectionId: 1097862870,
          collectionName: 'In Rainbows',
          artistName: 'Radiohead',
          releaseDate: '2007-10-10T07:00:00Z',
          trackCount: 10
        },
        // Unrated album by Radiohead (must be included!)
        {
          collectionId: 1097861387,
          collectionName: 'OK Computer',
          artistName: 'Radiohead',
          releaseDate: '1997-05-21T07:00:00Z',
          trackCount: 12
        },
        // Unrelated artist noise (must be excluded!)
        {
          collectionId: 999999,
          collectionName: 'Tribute Cover LP',
          artistName: 'Random Cover Band',
          releaseDate: '2020-01-01T07:00:00Z',
          trackCount: 8
        }
      ]
    };
  };

  const firstFetch = await fetchPersonalizedDiscoveryAlbums(
    getSavedRatingsMap(),
    getAlbumCatalogCacheMap(),
    mockSearchAlbums
  );

  assert.equal(firstFetch.status, 'ready');
  assert.equal(firstFetch.fromCache, false);
  assert.equal(apiCallCount, 1);
  assert.equal(firstFetch.signals.underExploredArtists[0].artistName, 'Radiohead');
  assert.equal(firstFetch.recommendedAlbums.length, 1);
  assert.equal(firstFetch.recommendedAlbums[0].collectionName, 'OK Computer');
  assert.equal(firstFetch.recommendedAlbums[0].discoverySignal.seedArtistName, 'Radiohead');

  // Second call with unchanged ratings uses session cache (0 additional API calls)
  const secondFetch = await fetchPersonalizedDiscoveryAlbums(
    getSavedRatingsMap(),
    getAlbumCatalogCacheMap(),
    mockSearchAlbums
  );
  assert.equal(secondFetch.fromCache, true);
  assert.equal(apiCallCount, 1);
});

console.log('\nAll ' + String(passed) + ' Phase 6 (Part 2) automated verification suites passed.\n');