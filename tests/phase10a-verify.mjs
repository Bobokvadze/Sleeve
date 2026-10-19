/**
 * RATEPLAY - Phase 10A Regression & Audit Fix Verification Suite (Node.js)
 * Verifies all 5 fixes from the technical audit:
 * 1. Missing Phase 9B imports in js/app.js are resolved and bound to valid exported functions.
 * 2. All ES module imports in js/canvas-card.js are consolidated at the top of the file.
 * 3. Smart Collection membership displays on the Album Detail bar alongside manual collections.
 * 4. Library JSON backup & restore preserves Custom and Smart Collections with conflict handling
 *    and backward compatibility for export files without collectionsMap.
 * 5. Discovery session cache invalidation works when ratings/library data change.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as storageMod from '../js/storage.js';
import * as shareModalMod from '../js/ui/shareModal.js';
import * as discoveryMod from '../js/discovery.js';
import {
  getAlbumCollectionMembership
} from '../js/collections.js';
import {
  buildAlbumCollectionsBarHtml
} from '../js/ui/albumView.js';
import {
  buildLibraryExportPayload,
  validateAndPreviewLibraryImport,
  applyValidatedLibraryImport
} from '../js/portability.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

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

console.log('\n[PHASE 10A] Running Targeted Audit Fix & Regression Verification Suite...');

// Test 1: Verify js/app.js imports all Phase 9B & Discovery helpers and they exist on target modules
runTest('1. js/app.js imports removeSmartCollectionRule, openShareCollectionPosterModal, exportCollectionPosterPngDirect, and clearDiscoverySessionCache', () => {
  const appJsSource = fs.readFileSync(path.join(projectRoot, 'js', 'app.js'), 'utf8');

  // Parse all imported identifiers before the first function declaration in js/app.js
  const headerSlice = appJsSource.slice(0, appJsSource.indexOf('const state ='));
  assert.ok(
    headerSlice.includes('removeSmartCollectionRule'),
    'removeSmartCollectionRule must be imported in js/app.js header'
  );
  assert.ok(
    headerSlice.includes('openShareCollectionPosterModal'),
    'openShareCollectionPosterModal must be imported in js/app.js header'
  );
  assert.ok(
    headerSlice.includes('exportCollectionPosterPngDirect'),
    'exportCollectionPosterPngDirect must be imported in js/app.js header'
  );
  assert.ok(
    headerSlice.includes('clearDiscoverySessionCache'),
    'clearDiscoverySessionCache must be imported in js/app.js header'
  );

  // Confirm the exported functions actually exist on their respective modules
  assert.equal(typeof storageMod.removeSmartCollectionRule, 'function');
  assert.equal(typeof shareModalMod.openShareCollectionPosterModal, 'function');
  assert.equal(typeof shareModalMod.exportCollectionPosterPngDirect, 'function');
  assert.equal(typeof discoveryMod.clearDiscoverySessionCache, 'function');
});

// Test 2: Verify js/canvas-card.js has all imports consolidated at the top of the module
runTest('2. js/canvas-card.js has all import statements consolidated before the first export', () => {
  const canvasSource = fs.readFileSync(path.join(projectRoot, 'js', 'canvas-card.js'), 'utf8');
  const firstExportIdx = canvasSource.indexOf('export const CARD_WIDTH');
  assert.ok(firstExportIdx > 0, 'CARD_WIDTH export must exist');

  const afterFirstExport = canvasSource.slice(firstExportIdx);
  const midFileImportMatch = afterFirstExport.match(/^\s*import\s+/m);
  assert.equal(
    midFileImportMatch,
    null,
    'No import statements should appear after the first export in js/canvas-card.js'
  );
});

// Test 3: Verify Smart Collection membership display & dynamic update on Album Detail bar
runTest('3. Album Detail collections bar renders both manual shelves and matching Smart Collections dynamically', () => {
  const mem = new MemoryStorage();
  storageMod.setStorageBackendForTesting(mem);

  // Create a Manual Collection and a Smart Collection (Min Rating: 9.0+)
  storageMod.saveCustomCollection({
    id: 'col-manual-shelf',
    title: 'Vinyl Pressing',
    type: 'manual',
    albumIds: ['1097862870']
  });

  storageMod.saveCustomCollection({
    id: 'col-smart-9plus',
    title: '9+ Masterpieces',
    type: 'smart',
    smartRules: { minRating: 9.0 }
  });

  const sampleAlbum = {
    collectionId: 1097862870,
    collectionName: 'In Rainbows',
    artistName: 'Radiohead'
  };

  // Before rating 1097862870: only in manual collection, not in 9+ Smart Collection
  let membership = getAlbumCollectionMembership(1097862870);
  assert.equal(membership.containing.length, 1);
  assert.equal(membership.matchingSmart.length, 0);

  let htmlBefore = buildAlbumCollectionsBarHtml(sampleAlbum, membership);
  assert.ok(htmlBefore.includes('Vinyl Pressing'));
  assert.equal(htmlBefore.includes('9+ Masterpieces'), false);

  // Rate 1097862870 at 9.5 -> now matches the Smart Collection dynamically!
  storageMod.saveTrackRatingUpdate(1097862870, '1097863022', { rating: 9.5 });
  membership = getAlbumCollectionMembership(1097862870);
  assert.equal(membership.containing.length, 1);
  assert.equal(membership.matchingSmart.length, 1);
  assert.equal(membership.matchingSmart[0].title, '9+ Masterpieces');

  let htmlAfter = buildAlbumCollectionsBarHtml(sampleAlbum, membership);
  assert.ok(htmlAfter.includes('Vinyl Pressing'));
  assert.ok(htmlAfter.includes('9+ Masterpieces'));
  assert.ok(htmlAfter.includes('data-membership-type="smart"'));
});

// Test 4: Verify Library JSON backup & restore preserves Custom and Smart Collections with conflict handling & backward compatibility
runTest('4. Library JSON export/import preserves Custom and Smart Collections, handles conflicts, and supports legacy files', () => {
  const mem = new MemoryStorage();
  storageMod.setStorageBackendForTesting(mem);

  // Seed ratings and 2 collections (1 manual, 1 smart)
  storageMod.saveTrackRatingUpdate(1097862870, '1097863022', { rating: 9.5 });
  storageMod.saveCustomCollection({
    id: 'col-manual-1',
    title: 'Late Night Shelf',
    description: 'Original description',
    type: 'manual',
    theme: 'amber',
    albumIds: ['1097862870']
  });
  storageMod.saveCustomCollection({
    id: 'col-smart-1',
    title: '2000s Favorites',
    type: 'smart',
    theme: 'emerald',
    smartRules: { decade: '2000s', minRating: 8.5 }
  });

  const exportPayload = buildLibraryExportPayload();
  assert.equal(exportPayload.summary.collectionCount, 2);
  assert.ok(exportPayload.collectionsMap['col-manual-1']);
  assert.ok(exportPayload.collectionsMap['col-smart-1']);

  // Now simulate importing into a library that already has:
  // - 'col-manual-1' with a different title ("Local Custom Title")
  // - 'col-local-only' (not in import file -> must be preserved!)
  const memTarget = new MemoryStorage();
  storageMod.setStorageBackendForTesting(memTarget);
  storageMod.saveCustomCollection({
    id: 'col-manual-1',
    title: 'Local Custom Title',
    description: 'Local description',
    type: 'manual',
    albumIds: ['1097862870']
  });
  storageMod.saveCustomCollection({
    id: 'col-local-only',
    title: 'Keep Me Safe',
    type: 'manual',
    albumIds: ['697194953']
  });

  const preview = validateAndPreviewLibraryImport(JSON.stringify(exportPayload));
  assert.equal(preview.ok, true);
  assert.equal(preview.collectionsToAdd.length, 1); // 'col-smart-1'
  assert.equal(preview.collectionsToUpdate.length, 1); // 'col-manual-1'
  assert.equal(preview.untouchedCollectionsCount, 1); // 'col-local-only'
  assert.equal(preview.hasCollectionConflicts, true);
  assert.equal(preview.hasConflicts, true);

  // Safe merge (overwriteExisting: false) -> adds 'col-smart-1', keeps 'col-manual-1' as 'Local Custom Title', keeps 'col-local-only'
  const resSafe = applyValidatedLibraryImport(preview, { overwriteExisting: false });
  assert.equal(resSafe.ok, true);
  assert.equal(resSafe.addedCollectionsCount, 1);
  assert.equal(resSafe.updatedCollectionsCount, 0);
  assert.equal(resSafe.skippedCollectionConflictCount, 1);
  assert.equal(storageMod.getCustomCollection('col-manual-1').title, 'Local Custom Title');
  assert.equal(storageMod.getCustomCollection('col-smart-1').title, '2000s Favorites');
  assert.equal(storageMod.getCustomCollection('col-local-only').title, 'Keep Me Safe');

  // Pre-import backup restoration restores collectionsMap back to original 2 collections
  assert.equal(storageMod.restorePreImportLocalBackup(), true);
  assert.equal(storageMod.getCustomCollection('col-smart-1'), null);
  assert.ok(storageMod.getCustomCollection('col-local-only'));

  // Overwrite merge (overwriteExisting: true) -> updates 'col-manual-1' to 'Late Night Shelf' while keeping 'col-local-only'
  const preview2 = validateAndPreviewLibraryImport(JSON.stringify(exportPayload));
  const resOverwrite = applyValidatedLibraryImport(preview2, { overwriteExisting: true });
  assert.equal(resOverwrite.ok, true);
  assert.equal(resOverwrite.addedCollectionsCount, 1);
  assert.equal(resOverwrite.updatedCollectionsCount, 1);
  assert.equal(storageMod.getCustomCollection('col-manual-1').title, 'Late Night Shelf');
  assert.equal(storageMod.getCustomCollection('col-local-only').title, 'Keep Me Safe');

  // Backward compatibility: importing a legacy v1 file without collectionsMap preserves all 3 collections
  const legacyExportJson = JSON.stringify({
    format: 'RATEPLAY_LIBRARY_EXPORT',
    version: 1,
    ratingsMap: {
      '1146195596': {
        collectionId: '1146195596',
        trackRatings: { '1146195601': { rating: 9.0, included: true } }
      }
    }
  });
  const legacyPreview = validateAndPreviewLibraryImport(legacyExportJson);
  assert.equal(legacyPreview.ok, true);
  assert.equal(legacyPreview.collectionsToAdd.length, 0);
  const legacyRes = applyValidatedLibraryImport(legacyPreview, { overwriteExisting: false });
  assert.equal(legacyRes.ok, true);
  assert.equal(Object.keys(storageMod.getSavedCollectionsMap()).length, 3);
});

// Test 5: Verify Discovery Cache Invalidation
await runAsyncTest('5. clearDiscoverySessionCache forces fresh recommendations when ratings change', async () => {
  const mem = new MemoryStorage();
  storageMod.setStorageBackendForTesting(mem);
  discoveryMod.clearDiscoverySessionCache();

  storageMod.saveTrackRatingUpdate(1097862870, '1097863022', { rating: 9.5 });

  let calls = 0;
  const mockSearch = async () => {
    calls += 1;
    return {
      source: 'live',
      albums: [
        {
          collectionId: 1097861387,
          collectionName: 'OK Computer',
          artistName: 'Radiohead',
          releaseDate: '1997-05-21T07:00:00Z',
          trackCount: 12
        }
      ]
    };
  };

  await discoveryMod.fetchPersonalizedDiscoveryAlbums(
    storageMod.getSavedRatingsMap(),
    storageMod.getAlbumCatalogCacheMap(),
    mockSearch
  );
  assert.equal(calls, 1);

  // Cached call makes 0 network requests
  const cachedRes = await discoveryMod.fetchPersonalizedDiscoveryAlbums(
    storageMod.getSavedRatingsMap(),
    storageMod.getAlbumCatalogCacheMap(),
    mockSearch
  );
  assert.equal(cachedRes.fromCache, true);
  assert.equal(calls, 1);

  // After clearDiscoverySessionCache(), next call fetches fresh data
  discoveryMod.clearDiscoverySessionCache();
  const freshRes = await discoveryMod.fetchPersonalizedDiscoveryAlbums(
    storageMod.getSavedRatingsMap(),
    storageMod.getAlbumCatalogCacheMap(),
    mockSearch
  );
  assert.equal(freshRes.fromCache, false);
  assert.equal(calls, 2);
});

console.log('\nAll ' + String(passed) + ' Phase 10A regression suites passed.\n');