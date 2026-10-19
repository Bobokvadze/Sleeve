/**
 * RATEPLAY - Phase 3 Automated Verification Suite (Node.js)
 * Runs syntax checks across all project JS files and executes the 10 unit tests.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  isValidTrackRating,
  getStableTrackKey,
  calculateAlbumScoreAndHighlights
} from '../js/calculator.js';
import {
  setStorageBackendForTesting,
  getSavedRatingsMap,
  getAlbumTrackRatings,
  saveTrackRatingUpdate
} from '../js/storage.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const jsFilesToCheck = [
  'js/config.js',
  'js/calculator.js',
  'js/storage.js',
  'js/api.js',
  'js/ui/discoverView.js',
  'js/ui/albumView.js',
  'js/app.js',
  'tests/phase3-verify.mjs'
];

console.log('\nChecking JavaScript syntax via node --check...');
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

const sampleTracks = [
  { trackId: 101, trackNumber: 1, discNumber: 1, trackName: 'Opening Track', trackTimeMillis: 210000 },
  { trackId: 102, trackNumber: 2, discNumber: 1, trackName: 'Second Song', trackTimeMillis: 195000 },
  { trackId: 103, trackNumber: 3, discNumber: 1, trackName: 'Third Interlude', trackTimeMillis: 58000 },
  { trackId: 104, trackNumber: 4, discNumber: 1, trackName: 'Closing Anthem', trackTimeMillis: 290000 }
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

console.log('\nRunning RATEPLAY Phase 3 Automated Verification Suite...');

runTest('1 & 2. Rating 8.0 and 6.0 produces 7.0; unrated tracks are ignored', () => {
  const map = {
    '101': { rating: 8.0, interlude: false, included: true },
    '102': { rating: 6.0, interlude: false, included: true }
  };
  const res = calculateAlbumScoreAndHighlights(sampleTracks, map);
  assert.equal(res.overallScore, 7.0);
  assert.equal(res.formattedScore, '7.0');
  assert.equal(res.ratedCount, 2);
  assert.equal(res.includedCount, 4);
  assert.equal(res.scoredCount, 2);
});

runTest('3. Excluding the 6.0 track changes the score to 8.0 and retains its rating', () => {
  const map = {
    '101': { rating: 8.0, interlude: false, included: true },
    '102': { rating: 6.0, interlude: false, included: false }
  };
  const res = calculateAlbumScoreAndHighlights(sampleTracks, map);
  assert.equal(res.overallScore, 8.0);
  assert.equal(res.formattedScore, '8.0');
  assert.equal(res.ratedCount, 2);
  assert.equal(res.includedCount, 3);
  assert.equal(res.scoredCount, 1);
  assert.equal(res.normalizedByKey['102'].rating, 6.0);
});

runTest('4. Re-including the 6.0 track restores the album score to 7.0', () => {
  const map = {
    '101': { rating: 8.0, interlude: false, included: true },
    '102': { rating: 6.0, interlude: false, included: true }
  };
  const res = calculateAlbumScoreAndHighlights(sampleTracks, map);
  assert.equal(res.overallScore, 7.0);
  assert.equal(res.formattedScore, '7.0');
});

runTest('5. Half-point ratings (e.g., 7.5) are accepted and averaged accurately', () => {
  assert.equal(isValidTrackRating(7.5), true);
  assert.equal(isValidTrackRating(1.0), true);
  assert.equal(isValidTrackRating(10.0), true);
  assert.equal(isValidTrackRating(0), false);
  assert.equal(isValidTrackRating(7.3), false);
  assert.equal(isValidTrackRating(10.5), false);
  assert.equal(isValidTrackRating(null), false);

  const map = {
    '101': { rating: 7.5, interlude: false, included: true },
    '102': { rating: 8.0, interlude: false, included: true }
  };
  const res = calculateAlbumScoreAndHighlights(sampleTracks, map);
  assert.equal(res.overallScore, 7.8);
});

runTest('6. Empty and fully unrated albums return null score (never NaN or Infinity)', () => {
  const emptyRes = calculateAlbumScoreAndHighlights([], {});
  assert.equal(emptyRes.overallScore, null);
  assert.equal(emptyRes.formattedScore, null);

  const unratedRes = calculateAlbumScoreAndHighlights(sampleTracks, {});
  assert.equal(unratedRes.overallScore, null);
  assert.equal(unratedRes.formattedScore, null);
  assert.equal(unratedRes.ratedCount, 0);
  assert.equal(unratedRes.includedCount, 4);

  const onlyExcludedRes = calculateAlbumScoreAndHighlights(sampleTracks, {
    '101': { rating: 9.0, interlude: false, included: false }
  });
  assert.equal(onlyExcludedRes.overallScore, null);
  assert.equal(onlyExcludedRes.ratedCount, 1);
  assert.equal(onlyExcludedRes.scoredCount, 0);
});

runTest('7. Tied highest and lowest ratings return all tied tracks', () => {
  const map = {
    '101': { rating: 9.5, interlude: false, included: true },
    '102': { rating: 9.5, interlude: false, included: true },
    '103': { rating: 6.5, interlude: false, included: true },
    '104': { rating: 6.5, interlude: false, included: true }
  };
  const res = calculateAlbumScoreAndHighlights(sampleTracks, map);
  assert.equal(res.highestRating, 9.5);
  assert.equal(res.lowestRating, 6.5);
  assert.equal(res.highestTracks.length, 2);
  assert.equal(res.lowestTracks.length, 2);
  assert.deepEqual(
    res.highestTracks.map((t) => t.trackName),
    ['Opening Track', 'Second Song']
  );
  assert.deepEqual(
    res.lowestTracks.map((t) => t.trackName),
    ['Third Interlude', 'Closing Anthem']
  );
});

runTest('8 & 9. Ratings, interludes, and inclusion persist without erasing ratings or unrelated keys', () => {
  const mem = new MemoryStorage();
  mem.setItem('unrelated_app_key', 'preserve_me');
  setStorageBackendForTesting(mem);

  saveTrackRatingUpdate(999, '101', { rating: 8.5 }, sampleTracks);

  const afterInterlude = saveTrackRatingUpdate(999, '101', { interlude: true }, sampleTracks);
  assert.equal(afterInterlude.trackState.rating, 8.5);
  assert.equal(afterInterlude.trackState.interlude, true);
  assert.equal(afterInterlude.trackState.included, true);

  const afterExclude = saveTrackRatingUpdate(999, '101', { included: false }, sampleTracks);
  assert.equal(afterExclude.trackState.rating, 8.5);
  assert.equal(afterExclude.trackState.interlude, true);
  assert.equal(afterExclude.trackState.included, false);
  assert.equal(afterExclude.metrics.overallScore, null);

  const afterReinclude = saveTrackRatingUpdate(999, '101', { included: true }, sampleTracks);
  assert.equal(afterReinclude.metrics.overallScore, 8.5);

  const reloadedTrackRatings = getAlbumTrackRatings(999);
  assert.equal(reloadedTrackRatings['101'].rating, 8.5);
  assert.equal(reloadedTrackRatings['101'].interlude, true);
  assert.equal(reloadedTrackRatings['101'].included, true);

  assert.equal(mem.getItem('unrelated_app_key'), 'preserve_me');

  mem.setItem('sleeve_ratings_v1', '{bad-json');
  assert.deepEqual(getSavedRatingsMap(), {});
});

runTest('10. Tracks with missing trackId generate stable deterministic fallback keys', () => {
  const trackNoId = { discNumber: 1, trackNumber: 5, trackName: 'Bonus Track' };
  const key1 = getStableTrackKey(trackNoId, 4);
  const key2 = getStableTrackKey(trackNoId, 4);
  assert.equal(key1, key2);
  assert.equal(key1, 'd1-t5-bonus-track');
});

console.log('\nAll ' + String(passed) + ' automated verification suites passed.\n');