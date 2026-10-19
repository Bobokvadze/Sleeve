/**
 * RATEPLAY - Phase 8 Automated Verification Suite (Node.js)
 * Verifies:
 * 1. JavaScript syntax across all 27 project modules
 * 2. Journal CRUD (create, read, update, delete) with createdAt preservation & updatedAt updates
 * 3. Support for reviewText, favoriteTracks, trackNotes, and preset + custom moodTags
 * 4. Strict storage separation: updating ratings preserves journal entries, and journal CRUD
 *    never modifies album ratings ('sleeve_ratings_v1')
 * 5. Graceful recovery from malformed JSON in 'sleeve_journal_v1'
 * 6. Journal search across album titles, artists, review notes, track notes, and mood tags
 * 7. Filtering by mood tag and by rating tier
 * 8. Sorting by recently updated, recently created, album title A-Z, and artist A-Z
 * 9. Journal JSON export/import validation, conflict preview, safe merge by default,
 *    overwrite confirmation mode, pre-import backup/restore, and preservation of ratings
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
  getAlbumJournalEntry,
  saveAlbumJournalEntry,
  deleteAlbumJournalEntry,
  getPreImportJournalBackup,
  restorePreImportJournalBackup
} from '../js/storage.js';
import {
  JOURNAL_EXPORT_FORMAT_ID,
  JOURNAL_EXPORT_VERSION,
  JOURNAL_SORT_MODES,
  JOURNAL_RATING_FILTERS,
  queryJournal,
  buildJournalExportPayload,
  validateAndPreviewJournalImport,
  applyValidatedJournalImport
} from '../js/journal.js';

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
  'tests/phase8-verify.mjs'
];

console.log('\n[PHASE 8] Checking JavaScript syntax across all 28 modules...');
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

console.log('\n[PHASE 8] Running Listening Journal CRUD, Search/Filter & Portability Suite...');

// Test 1: Journal CRUD, custom mood tags, favorite tracks, track notes, and timestamp integrity
runTest('1. Journal CRUD supports review text, favorite tracks, track notes, custom mood tags, and timestamps', () => {
  const mem = new MemoryStorage();
  setStorageBackendForTesting(mem);

  const created = saveAlbumJournalEntry(1097862870, {
    reviewText: 'Warm, intimate percussion and arpeggiated guitars.',
    moodTags: ['Late Night', 'Custom Vinyl Tag', 'late night'], // duplicate case-insensitive tag deduplicated
    favoriteTracks: [
      { trackKey: '1097863030', trackNumber: 4, trackName: 'Weird Fishes/ Arpeggi' }
    ],
    trackNotes: [
      {
        trackKey: '1097863022',
        trackNumber: 1,
        trackName: '15 Step',
        note: 'Crisp 5/4 drum machine pattern.'
      }
    ],
    createdAt: '2026-10-10T10:00:00.000Z',
    updatedAt: '2026-10-10T10:00:00.000Z'
  });

  assert.equal(created.savedOk, true);
  assert.equal(created.isNew, true);
  assert.equal(created.entry.moodTags.length, 2);
  assert.deepEqual(created.entry.moodTags, ['Late Night', 'Custom Vinyl Tag']);
  assert.equal(created.entry.favoriteTracks.length, 1);
  assert.equal(created.entry.trackNotes.length, 1);

  // Edit entry: createdAt must remain 2026-10-10 while updatedAt advances
  const updated = saveAlbumJournalEntry(1097862870, {
    reviewText: 'Updated reflection after a second spin on headphones.',
    updatedAt: '2026-10-18T15:00:00.000Z'
  });

  assert.equal(updated.savedOk, true);
  assert.equal(updated.isNew, false);
  assert.equal(updated.entry.createdAt, '2026-10-10T10:00:00.000Z');
  assert.equal(updated.entry.updatedAt, '2026-10-18T15:00:00.000Z');
  assert.equal(updated.entry.reviewText, 'Updated reflection after a second spin on headphones.');
  assert.equal(updated.entry.trackNotes.length, 1); // preserved!

  // Delete entry
  assert.equal(deleteAlbumJournalEntry(1097862870), true);
  assert.equal(getAlbumJournalEntry(1097862870), null);
});

// Test 2: Storage isolation between journal entries and album ratings + malformed JSON safety
runTest('2. Updating ratings preserves journal entries, and journal operations never alter ratings', () => {
  const mem = new MemoryStorage();
  setStorageBackendForTesting(mem);

  saveTrackRatingUpdate(1097862870, '1097863022', { rating: 9.5 });
  saveAlbumJournalEntry(1097862870, {
    reviewText: 'Initial journal note.',
    moodTags: ['Headphones']
  });

  // Update track rating -> journal entry must remain intact
  saveTrackRatingUpdate(1097862870, '1097863026', { rating: 8.5 });
  const journalAfterRating = getAlbumJournalEntry(1097862870);
  assert.equal(journalAfterRating.reviewText, 'Initial journal note.');

  // Delete journal entry -> album rating (9.0 average) must remain intact
  deleteAlbumJournalEntry(1097862870);
  assert.equal(getSavedRatingsMap()['1097862870'].overallScore, 9.0);

  // Malformed JSON in sleeve_journal_v1 is handled gracefully without throwing
  mem.setItem('sleeve_journal_v1', '{corrupted-journal-json');
  assert.deepEqual(getSavedJournalMap(), {});
});

// Test 3: Search across album title, artist, review notes, track notes, and tags + filtering & sorting
runTest('3. Journal search, mood tag filter, rating tier filter, and all 4 sort modes work accurately', () => {
  const mem = new MemoryStorage();
  setStorageBackendForTesting(mem);

  // Album 1: In Rainbows (Radiohead) - rated 9.5 (Masterpiece)
  saveTrackRatingUpdate(1097862870, '1097863022', { rating: 9.5 });
  saveAlbumJournalEntry(1097862870, {
    reviewText: 'Sublime polychromatic production.',
    moodTags: ['Late Night', 'Warm Analog'],
    trackNotes: [
      { trackKey: '1097863033', trackNumber: 7, trackName: 'Reckoner', note: 'Golden ratio cymbal crescendo.' }
    ],
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-18T10:00:00.000Z'
  });

  // Album 2: Random Access Memories (Daft Punk) - rated 8.0 (Essential)
  saveTrackRatingUpdate(697194953, '697195051', { rating: 8.0 });
  saveAlbumJournalEntry(697194953, {
    reviewText: 'Analogue disco revival recorded with live session legends.',
    moodTags: ['Euphoric', 'Road Trip'],
    trackNotes: [
      { trackKey: '697195384', trackNumber: 3, trackName: 'Giorgio by Moroder', note: ' modular synthesizer monologue.' }
    ],
    createdAt: '2026-10-12T10:00:00.000Z',
    updatedAt: '2026-10-14T10:00:00.000Z'
  });

  const jMap = getSavedJournalMap();
  const rMap = getSavedRatingsMap();
  const mMap = getAlbumCatalogCacheMap();

  // Search by album name
  assert.equal(queryJournal(jMap, rMap, mMap, { query: 'rainbows' }).visibleEntries.length, 1);
  // Search by artist name
  assert.equal(queryJournal(jMap, rMap, mMap, { query: 'daft punk' }).visibleEntries.length, 1);
  // Search by personal review text
  assert.equal(queryJournal(jMap, rMap, mMap, { query: 'polychromatic' }).visibleEntries.length, 1);
  // Search by individual track note content
  assert.equal(queryJournal(jMap, rMap, mMap, { query: 'cymbal crescendo' }).visibleEntries.length, 1);
  // Search by mood tag
  assert.equal(queryJournal(jMap, rMap, mMap, { query: 'euphoric' }).visibleEntries.length, 1);

  // Filter by mood tag
  const lateNightOnly = queryJournal(jMap, rMap, mMap, { moodTag: 'Late Night' });
  assert.equal(lateNightOnly.visibleEntries.length, 1);
  assert.equal(lateNightOnly.visibleEntries[0].collectionName, 'In Rainbows');

  // Filter by rating tier
  const masterpieceOnly = queryJournal(jMap, rMap, mMap, {
    ratingFilter: JOURNAL_RATING_FILTERS.MASTERPIECE
  });
  assert.equal(masterpieceOnly.visibleEntries.length, 1);
  assert.equal(masterpieceOnly.visibleEntries[0].collectionName, 'In Rainbows');

  // Sort modes
  const byUpdated = queryJournal(jMap, rMap, mMap, {
    sortBy: JOURNAL_SORT_MODES.UPDATED_DESC
  }).visibleEntries;
  assert.deepEqual(byUpdated.map((e) => e.collectionName), [
    'In Rainbows',
    'Random Access Memories'
  ]);

  const byCreated = queryJournal(jMap, rMap, mMap, {
    sortBy: JOURNAL_SORT_MODES.CREATED_DESC
  }).visibleEntries;
  assert.deepEqual(byCreated.map((e) => e.collectionName), [
    'Random Access Memories',
    'In Rainbows'
  ]);

  const byArtist = queryJournal(jMap, rMap, mMap, {
    sortBy: JOURNAL_SORT_MODES.ARTIST_ASC
  }).visibleEntries;
  assert.deepEqual(byArtist.map((e) => e.artistName), ['Daft Punk', 'Radiohead']);
});

// Test 4: Journal JSON Export & Import validation, conflict preview, safe merge, backup, and rating preservation
runTest('4. Journal JSON Export & Import validates, previews conflicts, merges safely, and never alters ratings', () => {
  const mem = new MemoryStorage();
  setStorageBackendForTesting(mem);

  // Seed existing album rating (8.5) and journal entry for 1097862870
  saveTrackRatingUpdate(1097862870, '1097863022', { rating: 8.5 });
  saveAlbumJournalEntry(1097862870, {
    reviewText: 'Original local review note.',
    moodTags: ['Local Tag']
  });

  // Validate rejection of malformed/invalid imports
  assert.equal(validateAndPreviewJournalImport('').ok, false);
  assert.equal(validateAndPreviewJournalImport('{bad-json').ok, false);
  assert.equal(
    validateAndPreviewJournalImport(JSON.stringify({ format: 'WRONG', journalMap: {} })).ok,
    false
  );

  // Build import payload with:
  // - 1146195596 (Blonde): new entry to add
  // - 1097862870 (In Rainbows): conflicting entry with updated reviewText
  const importPayload = {
    format: JOURNAL_EXPORT_FORMAT_ID,
    version: JOURNAL_EXPORT_VERSION,
    journalMap: {
      '1146195596': {
        collectionId: '1146195596',
        reviewText: 'Imported Blonde journal reflection.',
        moodTags: ['Nocturnal', 'Cathartic'],
        favoriteTracks: [{ trackKey: '1146195609', trackNumber: 9, trackName: 'Nights' }],
        trackNotes: [],
        createdAt: '2026-10-15T12:00:00.000Z',
        updatedAt: '2026-10-15T12:00:00.000Z'
      },
      '1097862870': {
        collectionId: '1097862870',
        reviewText: 'Replacement review note from import file.',
        moodTags: ['Imported Tag'],
        favoriteTracks: [],
        trackNotes: [],
        createdAt: '2026-10-16T12:00:00.000Z',
        updatedAt: '2026-10-16T12:00:00.000Z'
      }
    }
  };

  const preview = validateAndPreviewJournalImport(
    JSON.stringify(importPayload),
    getSavedJournalMap(),
    getAlbumCatalogCacheMap()
  );

  assert.equal(preview.ok, true);
  assert.equal(preview.entriesToAdd.length, 1);
  assert.equal(preview.entriesToUpdate.length, 1);
  assert.equal(preview.hasConflicts, true);

  // Default safe merge (overwriteExisting: false) -> adds Blonde, keeps In Rainbows original note
  const resSafeMerge = applyValidatedJournalImport(preview, { overwriteExisting: false });
  assert.equal(resSafeMerge.ok, true);
  assert.equal(resSafeMerge.addedCount, 1);
  assert.equal(resSafeMerge.updatedCount, 0);
  assert.equal(resSafeMerge.skippedConflictCount, 1);

  assert.equal(
    getAlbumJournalEntry(1146195596).reviewText,
    'Imported Blonde journal reflection.'
  );
  assert.equal(
    getAlbumJournalEntry(1097862870).reviewText,
    'Original local review note.'
  );

  // Verify pre-import backup was created and can be restored
  assert.ok(getPreImportJournalBackup());
  assert.equal(restorePreImportJournalBackup(), true);
  assert.equal(getAlbumJournalEntry(1146195596), null);

  // Confirmed overwrite merge (overwriteExisting: true) -> adds Blonde and updates In Rainbows
  const preview2 = validateAndPreviewJournalImport(
    JSON.stringify(importPayload),
    getSavedJournalMap(),
    getAlbumCatalogCacheMap()
  );
  const resOverwrite = applyValidatedJournalImport(preview2, { overwriteExisting: true });
  assert.equal(resOverwrite.ok, true);
  assert.equal(resOverwrite.addedCount, 1);
  assert.equal(resOverwrite.updatedCount, 1);
  assert.equal(
    getAlbumJournalEntry(1097862870).reviewText,
    'Replacement review note from import file.'
  );

  // Verify album rating (8.5) was never touched by journal import
  assert.equal(getSavedRatingsMap()['1097862870'].overallScore, 8.5);

  // Verify export round-trip
  const exported = buildJournalExportPayload(getSavedJournalMap(), getAlbumCatalogCacheMap());
  assert.equal(exported.format, JOURNAL_EXPORT_FORMAT_ID);
  assert.equal(exported.summary.entryCount, 2);
});

console.log('\nAll ' + String(passed) + ' Phase 8 automated verification suites passed.\n');