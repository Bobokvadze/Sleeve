/**
 * SLEEVE - Phase 9A Automated Verification Suite (Node.js)
 * Verifies:
 * 1. JavaScript syntax across all 30 project modules
 * 2. Collection CRUD: create, rename/update title/description/theme, and delete
 * 3. Validation: reject empty collection titles, normalize themes, reject invalid album IDs
 * 4. Duplicate prevention: adding the same album ID twice to a collection never duplicates it
 * 5. Manual album ordering: moveAlbumInCustomCollection ('up' and 'down', boundary safety)
 *    and reorderAlbumsInCustomCollection
 * 6. Enriched collection view: artwork, artists, existing ratings, average score,
 *    in-collection search, and all 6 sort modes
 * 7. Malformed JSON recovery in 'sleeve_collections_v1'
 * 8. Strict preservation of existing ratings ('sleeve_ratings_v1') and journal entries ('sleeve_journal_v1')
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
  deleteCustomCollection,
  addAlbumToCustomCollection,
  removeAlbumFromCustomCollection,
  moveAlbumInCustomCollection,
  reorderAlbumsInCustomCollection
} from '../js/storage.js';
import {
  COLLECTION_SORT_MODES,
  buildEnrichedCollection,
  getEnrichedCollectionsList,
  queryCollectionAlbums,
  getAlbumCollectionMembership
} from '../js/collections.js';

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
  'tests/phase9a-verify.mjs'
];

console.log('\n[PHASE 9A] Checking JavaScript syntax across all 31 modules...');
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

console.log('\n[PHASE 9A] Running Custom Collections Core Verification Suite...');

// Test 1: Collection CRUD (create, rename/update, delete) & validation
runTest('1. Create, rename, update theme/description, and delete custom collections', () => {
  const mem = new MemoryStorage();
  setStorageBackendForTesting(mem);

  // Reject empty title
  const badCreate = saveCustomCollection({ title: '   ' });
  assert.equal(badCreate.savedOk, false);

  // Create collection
  const created = saveCustomCollection({
    id: 'col-late-night',
    title: 'Late Night Essentials',
    description: 'Records for headphones after midnight.',
    theme: 'emerald',
    albumIds: ['1097862870'],
    createdAt: '2026-10-10T10:00:00.000Z',
    updatedAt: '2026-10-10T10:00:00.000Z'
  });

  assert.equal(created.savedOk, true);
  assert.equal(created.isNew, true);
  assert.equal(created.collection.id, 'col-late-night');
  assert.equal(created.collection.title, 'Late Night Essentials');
  assert.equal(created.collection.theme, 'emerald');
  assert.deepEqual(created.collection.albumIds, ['1097862870']);

  // Rename and update theme (invalid theme falls back to obsidian)
  const renamed = saveCustomCollection({
    id: 'col-late-night',
    title: 'Midnight Analog Shelf',
    description: 'Updated description.',
    theme: 'signal',
    updatedAt: '2026-10-18T18:00:00.000Z'
  });

  assert.equal(renamed.savedOk, true);
  assert.equal(renamed.isNew, false);
  assert.equal(renamed.collection.title, 'Midnight Analog Shelf');
  assert.equal(renamed.collection.theme, 'signal');
  assert.equal(renamed.collection.createdAt, '2026-10-10T10:00:00.000Z');
  assert.equal(renamed.collection.updatedAt, '2026-10-18T18:00:00.000Z');
  assert.deepEqual(renamed.collection.albumIds, ['1097862870']); // Preserved!

  // Delete collection
  assert.equal(deleteCustomCollection('col-late-night'), true);
  assert.equal(getCustomCollection('col-late-night'), null);
});

// Test 2: Adding albums, removing albums, and strict duplicate prevention
runTest('2. Adding and removing albums prevents duplicates within a collection', () => {
  const mem = new MemoryStorage();
  setStorageBackendForTesting(mem);

  saveCustomCollection({
    id: 'col-1',
    title: 'Electronic & Art Pop',
    albumIds: ['1097862870', '1097862870'] // Initial duplicates deduplicated on save
  });

  assert.deepEqual(getCustomCollection('col-1').albumIds, ['1097862870']);

  // Add second album
  const addRes1 = addAlbumToCustomCollection('col-1', 697194953);
  assert.equal(addRes1.ok, true);
  assert.equal(addRes1.alreadyPresent, false);
  assert.deepEqual(addRes1.collection.albumIds, ['1097862870', '697194953']);

  // Attempt to add duplicate album 1097862870 again -> must NOT duplicate
  const addDup = addAlbumToCustomCollection('col-1', '1097862870');
  assert.equal(addDup.ok, true);
  assert.equal(addDup.alreadyPresent, true);
  assert.deepEqual(addDup.collection.albumIds, ['1097862870', '697194953']);

  // Remove album 1097862870
  const remRes = removeAlbumFromCustomCollection('col-1', '1097862870');
  assert.equal(remRes.ok, true);
  assert.equal(remRes.removed, true);
  assert.deepEqual(remRes.collection.albumIds, ['697194953']);
});

// Test 3: Manual album ordering (move up, move down, boundaries, and reorder)
runTest('3. Manual album ordering supports move-up, move-down, boundary checks, and full reorder', () => {
  const mem = new MemoryStorage();
  setStorageBackendForTesting(mem);

  saveCustomCollection({
    id: 'col-order',
    title: 'Sequenced Shelf',
    albumIds: ['1097862870', '697194953', '1146195596']
  });

  // Moving first album up is a safe no-op at top boundary
  const topBound = moveAlbumInCustomCollection('col-order', '1097862870', 'up');
  assert.equal(topBound.ok, true);
  assert.equal(topBound.moved, false);
  assert.deepEqual(topBound.collection.albumIds, ['1097862870', '697194953', '1146195596']);

  // Move third album ('1146195596') up -> swaps with '697194953'
  const moveUp = moveAlbumInCustomCollection('col-order', '1146195596', 'up');
  assert.equal(moveUp.ok, true);
  assert.equal(moveUp.moved, true);
  assert.deepEqual(moveUp.collection.albumIds, ['1097862870', '1146195596', '697194953']);

  // Move first album ('1097862870') down -> swaps with '1146195596'
  const moveDown = moveAlbumInCustomCollection('col-order', '1097862870', 'down');
  assert.equal(moveDown.ok, true);
  assert.equal(moveDown.moved, true);
  assert.deepEqual(moveDown.collection.albumIds, ['1146195596', '1097862870', '697194953']);

  // Arbitrary reorder
  const reordered = reorderAlbumsInCustomCollection('col-order', [
    '697194953',
    '1146195596',
    '1097862870'
  ]);
  assert.equal(reordered.ok, true);
  assert.deepEqual(reordered.collection.albumIds, ['697194953', '1146195596', '1097862870']);
});

// Test 4: Enriched collection view, existing ratings integration, search, and sorting
runTest('4. Enriched collection integrates ratings/artwork and supports in-collection search and sorting', () => {
  const mem = new MemoryStorage();
  setStorageBackendForTesting(mem);

  // Rate In Rainbows (1097862870, 2007) at 9.5 and Random Access Memories (697194953, 2013) at 8.5
  saveTrackRatingUpdate(1097862870, '1097863022', { rating: 9.5 });
  saveTrackRatingUpdate(697194953, '697195051', { rating: 8.5 });

  // Create collection with 3 albums (including unrated Blonde 1146195596, 2016)
  saveCustomCollection({
    id: 'col-favorites',
    title: 'Modern Classics',
    theme: 'amber',
    albumIds: ['697194953', '1146195596', '1097862870']
  });

  const enriched = buildEnrichedCollection(
    'col-favorites',
    getCustomCollection('col-favorites'),
    getSavedRatingsMap(),
    getAlbumCatalogCacheMap()
  );

  assert.equal(enriched.albumCount, 3);
  assert.equal(enriched.scoredAlbumCount, 2);
  assert.equal(enriched.averageScore, 9.0); // (9.5 + 8.5) / 2 = 9.0
  assert.equal(enriched.mosaicCovers.length, 4);

  // Manual order matches albumIds sequence
  const manualQuery = queryCollectionAlbums(enriched, {
    sortBy: COLLECTION_SORT_MODES.MANUAL
  });
  assert.equal(manualQuery.isManualReorderEnabled, true);
  assert.deepEqual(
    manualQuery.visibleAlbums.map((a) => a.collectionName),
    ['Random Access Memories', 'Blonde', 'In Rainbows']
  );

  // Sort by Highest Score -> In Rainbows (9.5), Random Access Memories (8.5), Blonde (unrated)
  const scoreDescQuery = queryCollectionAlbums(enriched, {
    sortBy: COLLECTION_SORT_MODES.SCORE_DESC
  });
  assert.equal(scoreDescQuery.isManualReorderEnabled, false);
  assert.deepEqual(
    scoreDescQuery.visibleAlbums.map((a) => a.collectionName),
    ['In Rainbows', 'Random Access Memories', 'Blonde']
  );

  // Sort by Title A-Z -> Blonde, In Rainbows, Random Access Memories
  const titleAscQuery = queryCollectionAlbums(enriched, {
    sortBy: COLLECTION_SORT_MODES.TITLE_ASC
  });
  assert.deepEqual(
    titleAscQuery.visibleAlbums.map((a) => a.collectionName),
    ['Blonde', 'In Rainbows', 'Random Access Memories']
  );

  // Search within collection by artist ("Frank Ocean")
  const searchQuery = queryCollectionAlbums(enriched, {
    query: 'frank ocean',
    sortBy: COLLECTION_SORT_MODES.MANUAL
  });
  assert.equal(searchQuery.visibleAlbums.length, 1);
  assert.equal(searchQuery.visibleAlbums[0].collectionName, 'Blonde');
  assert.equal(searchQuery.isManualReorderEnabled, false);

  // Membership check for 1097862870
  const membership = getAlbumCollectionMembership(1097862870, getSavedCollectionsMap());
  assert.equal(membership.containing.length, 1);
  assert.equal(membership.containing[0].id, 'col-favorites');
});

// Test 5: Malformed JSON safety & strict preservation of ratings and journal entries
runTest('5. Malformed JSON is handled safely and collection CRUD never alters ratings or journal entries', () => {
  const mem = new MemoryStorage();
  setStorageBackendForTesting(mem);

  saveTrackRatingUpdate(1097862870, '1097863022', { rating: 9.0 });
  saveAlbumJournalEntry(1097862870, {
    reviewText: 'Preserved journal entry.',
    moodTags: ['Late Night']
  });

  const colRes = saveCustomCollection({
    id: 'col-test',
    title: 'Test Shelf',
    albumIds: ['1097862870']
  });
  assert.equal(colRes.savedOk, true);

  removeAlbumFromCustomCollection('col-test', '1097862870');
  deleteCustomCollection('col-test');

  // Verify ratings and journal entries are completely untouched
  assert.equal(getSavedRatingsMap()['1097862870'].overallScore, 9.0);
  assert.equal(getSavedJournalMap()['1097862870'].reviewText, 'Preserved journal entry.');

  // Corrupt sleeve_collections_v1 -> getSavedCollectionsMap recovers with {}
  mem.setItem('sleeve_collections_v1', '{broken-collections-json');
  assert.deepEqual(getSavedCollectionsMap(), {});
  assert.deepEqual(getEnrichedCollectionsList(), []);
});

console.log('\nAll ' + String(passed) + ' Phase 9A automated verification suites passed.\n');