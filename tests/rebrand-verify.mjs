/

RATEPLAY - Comprehensive Rebrand & Data Compatibility Verification Suite (Node.js)

Verifies:

APP_CONFIG.appName is 'RATEPLAY' and all 7 localStorage keys remain 'sleeve_*'

so existing users retain all saved ratings, metadata, journal entries, and collections.

All 4 Canvas 1080x1920 generators render 'RATEPLAY' and 'RATEPLAY // LISTEN IN FULL'

and produce 'RATEPLAY - ...png' filenames with zero 'SLEEVE' text drawn.

Library and Journal JSON exports emit 'RATEPLAY_LIBRARY_EXPORT' and 'RATEPLAY_JOURNAL_EXPORT'

with app: 'RATEPLAY', while import validators accept BOTH 'RATEPLAY_*_EXPORT' and

legacy 'SLEEVE_*_EXPORT' backup files.

Repository-wide audit confirming zero overlooked 'SLEEVE' brand strings remain in

index.html, manifest.webmanifest, README.md, package.json, CSS, or JS files.
*/

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { APP_CONFIG } from '../js/config.js';
import {
setStorageBackendForTesting,
saveTrackRatingUpdate,
saveAlbumJournalEntry,
saveCustomCollection,
getSavedRatingsMap,
getAlbumCatalogCacheMap,
getSavedJournalMap
} from '../js/storage.js';
import {
EXPORT_FORMAT_ID,
LEGACY_EXPORT_FORMAT_ID,
buildExportFilename,
buildLibraryExportPayload,
validateAndPreviewLibraryImport
} from '../js/portability.js';
import {
JOURNAL_EXPORT_FORMAT_ID,
LEGACY_JOURNAL_EXPORT_FORMAT_ID,
buildJournalExportFilename,
buildJournalExportPayload,
validateAndPreviewJournalImport
} from '../js/journal.js';
import {
buildSanitizedCardFilename,
buildSanitizedProfileFilename,
buildSanitizedInsightsFilename,
buildSanitizedCollectionPosterFilename,
prepareReviewCardPayload,
renderReviewCardToCanvas,
prepareTasteProfileCardPayload,
renderTasteProfileCardToCanvas,
prepareListeningInsightsCardPayload,
renderListeningInsightsCardToCanvas,
prepareCollectionPosterPayload,
renderCollectionPosterToCanvas
} from '../js/canvas-card.js';

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

class MockCanvas2DContext {
constructor() {
this.drawnTexts = [];
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
drawImage() {}
measureText(str) {
return { width: String(str || '').length * 10 };
}
fillText(text, x, y) {
this.drawnTexts.push(String(text));
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

console.log('\n[RATEPLAY REBRAND] Running Comprehensive Rebrand & Compatibility Suite...');

// Test 1: Brand config & preserved localStorage keys
runTest('1. APP_CONFIG.appName is RATEPLAY and all 7 localStorage keys are preserved for existing user data', () => {
assert.equal(APP_CONFIG.appName, 'RATEPLAY');
assert.equal(APP_CONFIG.storageKeys.ratingsMap, 'sleeve_ratings_v1');
assert.equal(APP_CONFIG.storageKeys.albumCatalogCache, 'sleeve_album_meta_v1');
assert.equal(APP_CONFIG.storageKeys.recentQueries, 'sleeve_recent_queries_v1');
assert.equal(APP_CONFIG.storageKeys.preImportBackup, 'sleeve_pre_import_backup_v1');
assert.equal(APP_CONFIG.storageKeys.journalMap, 'sleeve_journal_v1');
assert.equal(
APP_CONFIG.storageKeys.journalPreImportBackup,
'sleeve_journal_pre_import_backup_v1'
);
assert.equal(APP_CONFIG.storageKeys.collectionsMap, 'sleeve_collections_v1');
});

// Test 2: All 4 Canvas 1080x1920 cards render RATEPLAY branding and RATEPLAY filenames
runTest('2. All 4 Canvas 1080x1920 card generators draw RATEPLAY branding and produce RATEPLAY filenames', () => {
assert.equal(
buildSanitizedCardFilename('Radiohead', 'In Rainbows'),
'RATEPLAY - Radiohead - In Rainbows.png'
);
assert.equal(
buildSanitizedProfileFilename('Taste Profile'),
'RATEPLAY - Taste Profile.png'
);
assert.equal(
buildSanitizedInsightsFilename('Listening Insights'),
'RATEPLAY - Listening Insights.png'
);
assert.equal(
buildSanitizedCollectionPosterFilename('Late Night'),
'RATEPLAY - Collection - Late Night.png'
);

const mem = new MemoryStorage();
setStorageBackendForTesting(mem);
saveTrackRatingUpdate(1097862870, '1097863022', { rating: 9.5 });
const col = saveCustomCollection({
id: 'col-rp',
title: 'Rateplay Shelf',
albumIds: ['1097862870']
}).collection;

const canvases = [new MockCanvas(), new MockCanvas(), new MockCanvas(), new MockCanvas()];

renderReviewCardToCanvas(
canvases[0],
prepareReviewCardPayload({
album: { collectionId: 1097862870, collectionName: 'In Rainbows', artistName: 'Radiohead' },
tracks: [{ trackId: 1097863022, trackNumber: 1, trackName: '15 Step' }],
trackRatingsMap: { '1097863022': { rating: 9.5, included: true } }
}),
null
);

renderTasteProfileCardToCanvas(
canvases[1],
prepareTasteProfileCardPayload({
ratingsMap: getSavedRatingsMap(),
metadataMap: getAlbumCatalogCacheMap()
}),
{}
);

renderListeningInsightsCardToCanvas(
canvases[2],
prepareListeningInsightsCardPayload({
ratingsMap: getSavedRatingsMap(),
metadataMap: getAlbumCatalogCacheMap()
}),
{}
);

renderCollectionPosterToCanvas(
canvases[3],
prepareCollectionPosterPayload({
collection: col,
ratingsMap: getSavedRatingsMap(),
metadataMap: getAlbumCatalogCacheMap(),
journalMap: getSavedJournalMap()
}),
{}
);

for (const c of canvases) {
assert.ok(c.ctx.drawnTexts.includes('RATEPLAY'), 'Canvas header must draw RATEPLAY');
assert.ok(
c.ctx.drawnTexts.includes('RATEPLAY // LISTEN IN FULL'),
'Canvas footer must draw RATEPLAY // LISTEN IN FULL'
);
assert.equal(
c.ctx.drawnTexts.some((t) => /sleeve/i.test(t)),
false,
'Canvas must not draw any old SLEEVE text'
);
}
});

// Test 3: JSON Exports use RATEPLAY format & filenames while accepting both RATEPLAY and legacy SLEEVE imports
runTest('3. Library and Journal JSON exports use RATEPLAY branding and accept both RATEPLAY and legacy SLEEVE backups', () => {
const mem = new MemoryStorage();
setStorageBackendForTesting(mem);
saveTrackRatingUpdate(1097862870, '1097863022', { rating: 9.0 });
saveAlbumJournalEntry(1097862870, { reviewText: 'Great record.', moodTags: ['Focus'] });

assert.equal(EXPORT_FORMAT_ID, 'RATEPLAY_LIBRARY_EXPORT');
assert.equal(LEGACY_EXPORT_FORMAT_ID, 'SLEEVE_LIBRARY_EXPORT');
assert.equal(JOURNAL_EXPORT_FORMAT_ID, 'RATEPLAY_JOURNAL_EXPORT');
assert.equal(LEGACY_JOURNAL_EXPORT_FORMAT_ID, 'SLEEVE_JOURNAL_EXPORT');

assert.ok(buildExportFilename(new Date('2026-10-19T12:00:00Z')).startsWith('RATEPLAY-Library-Backup-'));
assert.ok(buildJournalExportFilename(new Date('2026-10-19T12:00:00Z')).startsWith('RATEPLAY-Journal-Backup-'));

const libExport = buildLibraryExportPayload();
assert.equal(libExport.format, 'RATEPLAY_LIBRARY_EXPORT');
assert.equal(libExport.app, 'RATEPLAY');
assert.equal(validateAndPreviewLibraryImport(JSON.stringify(libExport)).ok, true);

// Legacy SLEEVE library export must also validate cleanly
const legacyLibExport = { ...libExport, format: 'SLEEVE_LIBRARY_EXPORT', app: 'SLEEVE' };
assert.equal(validateAndPreviewLibraryImport(JSON.stringify(legacyLibExport)).ok, true);

const jrnExport = buildJournalExportPayload();
assert.equal(jrnExport.format, 'RATEPLAY_JOURNAL_EXPORT');
assert.equal(jrnExport.app, 'RATEPLAY');
assert.equal(validateAndPreviewJournalImport(JSON.stringify(jrnExport)).ok, true);

// Legacy SLEEVE journal export must also validate cleanly
const legacyJrnExport = { ...jrnExport, format: 'SLEEVE_JOURNAL_EXPORT', app: 'SLEEVE' };
assert.equal(validateAndPreviewJournalImport(JSON.stringify(legacyJrnExport)).ok, true);
});

// Test 4: Full-repository scan confirming zero overlooked brand references
runTest('4. Full repository audit confirms zero overlooked SLEEVE brand strings in HTML, CSS, JS, Manifest, or README', () => {
const filesToAudit = [
'index.html',
'manifest.webmanifest',
'README.md',
'package.json',
'assets/favicon.svg',
'css/variables.css',
'css/base.css',
'css/components.css',
'css/views.css',
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
'js/app.js'
];

const allowedTechnicalTokens = [
'sleeve_ratings_v1',
'sleeve_album_meta_v1',
'sleeve_recent_queries_v1',
'sleeve_pre_import_backup_v1',
'sleeve_journal_v1',
'sleeve_journal_pre_import_backup_v1',
'sleeve_collections_v1',
'SLEEVE_LIBRARY_EXPORT',
'SLEEVE_JOURNAL_EXPORT'
];

for (const rel of filesToAudit) {
let content = fs.readFileSync(path.join(projectRoot, rel), 'utf8');
for (const token of allowedTechnicalTokens) {
content = content.split(token).join('');
}
const remainingMatch = content.match(/sleeve/i);
assert.equal(
remainingMatch,
null,
'Unexpected remaining "sleeve" match in ' + rel + ': ' + (remainingMatch ? remainingMatch[0] : '')
);
}
});

console.log('\nAll ' + String(passed) + ' RATEPLAY rebrand verification suites passed.\n');