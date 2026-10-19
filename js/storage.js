/**
 * RATEPLAY - Browser Storage Manager (localStorage)
 * Persists user track ratings, interlude/inclusion flags, optional verdict,
 * and library visibility in 'sleeve_ratings_v1', and caches compact external
 * album metadata separately in 'sleeve_album_meta_v1'.
 */

import { APP_CONFIG } from './config.js';
import {
  normalizeTrackState,
  mergeTrackState,
  calculateAlbumScoreAndHighlights,
  calculateMetricsFromTrackRatingsMap
} from './calculator.js';

let customStorageBackend = null;
let lastStorageError = null;

export function setStorageBackendForTesting(backend) {
  customStorageBackend = backend;
  lastStorageError = null;
}

export function getLastStorageError() {
  return lastStorageError;
}

function getStorage() {
  if (customStorageBackend) {
    return customStorageBackend;
  }
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  return null;
}

function getMetaStorageKey() {
  return APP_CONFIG.storageKeys.albumCatalogCache || 'sleeve_album_meta_v1';
}

export function normalizeVerdictText(rawVerdict) {
  if (typeof rawVerdict !== 'string') return '';
  const maxLen = APP_CONFIG.maxVerdictLength || 160;
  return rawVerdict.replace(/\s+/g, ' ').trim().slice(0, maxLen);
}

/**
 * Normalizes a user album rating record loaded from storage.
 */
function normalizeAlbumRatingRecord(collectionId, rawRecord) {
  const safeId = String(collectionId);
  if (!rawRecord || typeof rawRecord !== 'object' || Array.isArray(rawRecord)) {
    return {
      collectionId: safeId,
      updatedAt: null,
      overallScore: null,
      ratedCount: 0,
      includedCount: 0,
      scoredCount: 0,
      verdict: '',
      hiddenFromLibrary: false,
      trackRatings: {}
    };
  }

  const rawTracks =
    rawRecord.trackRatings &&
    typeof rawRecord.trackRatings === 'object' &&
    !Array.isArray(rawRecord.trackRatings)
      ? rawRecord.trackRatings
      : {};

  const normalizedTrackRatings = {};
  Object.keys(rawTracks).forEach((trackKey) => {
    normalizedTrackRatings[trackKey] = normalizeTrackState(rawTracks[trackKey]);
  });

  const derived = calculateMetricsFromTrackRatingsMap(normalizedTrackRatings, 0);

  let validOverall = derived.overallScore;
  if (validOverall === null && Object.keys(normalizedTrackRatings).length === 0) {
    const numericOverall = Number(rawRecord.overallScore);
    if (
      rawRecord.overallScore !== null &&
      rawRecord.overallScore !== undefined &&
      Number.isFinite(numericOverall) &&
      numericOverall >= 1.0 &&
      numericOverall <= 10.0
    ) {
      validOverall = Math.round(numericOverall * 10) / 10;
    }
  }

  const ratedCount =
    Object.keys(normalizedTrackRatings).length > 0
      ? derived.ratedCount
      : Number.isFinite(Number(rawRecord.ratedCount))
      ? Number(rawRecord.ratedCount)
      : 0;

  const scoredCount =
    Object.keys(normalizedTrackRatings).length > 0
      ? derived.scoredCount
      : Number.isFinite(Number(rawRecord.scoredCount))
      ? Number(rawRecord.scoredCount)
      : 0;

  const includedCount = Number.isFinite(Number(rawRecord.includedCount))
    ? Number(rawRecord.includedCount)
    : derived.includedCount;

  return {
    collectionId: safeId,
    updatedAt: typeof rawRecord.updatedAt === 'string' ? rawRecord.updatedAt : null,
    overallScore: validOverall,
    ratedCount,
    includedCount,
    scoredCount,
    verdict: normalizeVerdictText(rawRecord.verdict),
    hiddenFromLibrary: Boolean(rawRecord.hiddenFromLibrary),
    trackRatings: normalizedTrackRatings
  };
}

export function getSavedRatingsMap() {
  const storage = getStorage();
  if (!storage) return {};

  try {
    const raw = storage.getItem(APP_CONFIG.storageKeys.ratingsMap);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    const normalizedMap = {};
    Object.keys(parsed).forEach((collectionId) => {
      normalizedMap[String(collectionId)] = normalizeAlbumRatingRecord(
        collectionId,
        parsed[collectionId]
      );
    });
    lastStorageError = null;
    return normalizedMap;
  } catch (err) {
    lastStorageError = err;
    if (!customStorageBackend && typeof window !== 'undefined') {
      console.warn(
        '[RATEPLAY Storage] Stored ratings JSON could not be parsed; returning empty state.'
      );
    }
    return {};
  }
}

function writeSavedRatingsMap(map) {
  const storage = getStorage();
  if (!storage) return false;

  try {
    storage.setItem(APP_CONFIG.storageKeys.ratingsMap, JSON.stringify(map));
    lastStorageError = null;
    return true;
  } catch (err) {
    lastStorageError = err;
    console.warn('[RATEPLAY Storage] Unable to persist ratings map (quota or storage error):', err);
    return false;
  }
}

function normalizeCompactAlbumMeta(collectionId, rawMeta) {
  if (!rawMeta || typeof rawMeta !== 'object' || Array.isArray(rawMeta)) {
    return null;
  }
  const numericId = Number(rawMeta.collectionId || collectionId);
  if (!numericId) return null;

  return {
    collectionId: numericId,
    collectionName: String(rawMeta.collectionName || 'Untitled Album').trim(),
    artistName: String(rawMeta.artistName || 'Unknown Artist').trim(),
    primaryGenreName: String(rawMeta.primaryGenreName || 'Music').trim(),
    releaseDate: String(rawMeta.releaseDate || ''),
    trackCount: Math.max(0, Number(rawMeta.trackCount) || 0),
    artworkUrl100: String(rawMeta.artworkUrl100 || '')
  };
}

export function getAlbumCatalogCacheMap() {
  const storage = getStorage();
  if (!storage) return {};

  try {
    const raw = storage.getItem(getMetaStorageKey());
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    const map = {};
    Object.keys(parsed).forEach((id) => {
      const normalized = normalizeCompactAlbumMeta(id, parsed[id]);
      if (normalized) {
        map[String(normalized.collectionId)] = normalized;
      }
    });
    lastStorageError = null;
    return map;
  } catch (err) {
    lastStorageError = err;
    if (!customStorageBackend && typeof window !== 'undefined') {
      console.warn(
        '[RATEPLAY Storage] Stored album metadata JSON could not be parsed; returning empty state.'
      );
    }
    return {};
  }
}

export function getCachedAlbumMetadata(collectionId) {
  if (collectionId === null || collectionId === undefined || collectionId === '') {
    return null;
  }
  const map = getAlbumCatalogCacheMap();
  return map[String(collectionId)] || null;
}

export function saveAlbumMetadataToCache(album, trackCountOverride = null) {
  if (!album || typeof album !== 'object') return false;
  const storage = getStorage();
  if (!storage) return false;

  const numericId = Number(album.collectionId);
  if (!numericId) return false;

  const currentMap = getAlbumCatalogCacheMap();
  const existing = currentMap[String(numericId)];

  const resolvedTrackCount =
    Number(trackCountOverride) > 0
      ? Number(trackCountOverride)
      : Number(album.trackCount) > 0
      ? Number(album.trackCount)
      : existing?.trackCount || 0;

  const compact = normalizeCompactAlbumMeta(numericId, {
    collectionId: numericId,
    collectionName: album.collectionName || existing?.collectionName || 'Untitled Album',
    artistName: album.artistName || existing?.artistName || 'Unknown Artist',
    primaryGenreName: album.primaryGenreName || existing?.primaryGenreName || 'Music',
    releaseDate: album.releaseDate || existing?.releaseDate || '',
    trackCount: resolvedTrackCount,
    artworkUrl100: album.artworkUrl100 || existing?.artworkUrl100 || ''
  });

  if (!compact) return false;

  currentMap[String(numericId)] = compact;

  try {
    storage.setItem(getMetaStorageKey(), JSON.stringify(currentMap));
    lastStorageError = null;
    return true;
  } catch (err) {
    lastStorageError = err;
    console.warn('[RATEPLAY Storage] Unable to cache album metadata:', err);
    return false;
  }
}

export function getSavedAlbumRating(collectionId) {
  if (collectionId === null || collectionId === undefined || collectionId === '') {
    return null;
  }
  const map = getSavedRatingsMap();
  return map[String(collectionId)] || null;
}

export function getAlbumTrackRatings(collectionId) {
  const record = getSavedAlbumRating(collectionId);
  return record && record.trackRatings ? { ...record.trackRatings } : {};
}

export function getAlbumVerdict(collectionId) {
  const record = getSavedAlbumRating(collectionId);
  return record && typeof record.verdict === 'string' ? record.verdict : '';
}

export function saveAlbumVerdict(
  collectionId,
  verdictText,
  albumTracks = [],
  albumMetadata = null
) {
  const safeAlbumId = String(collectionId || '').trim();
  if (!safeAlbumId) return null;

  const allRatings = getSavedRatingsMap();
  const existingRecord = normalizeAlbumRatingRecord(
    safeAlbumId,
    allRatings[safeAlbumId]
  );

  const cleanedVerdict = normalizeVerdictText(verdictText);
  const safeTracks = Array.isArray(albumTracks) ? albumTracks : [];
  const metrics =
    safeTracks.length > 0
      ? calculateAlbumScoreAndHighlights(safeTracks, existingRecord.trackRatings)
      : calculateMetricsFromTrackRatingsMap(existingRecord.trackRatings, 0);

  const updatedRecord = {
    ...existingRecord,
    updatedAt: new Date().toISOString(),
    overallScore: metrics.overallScore,
    ratedCount: metrics.ratedCount,
    includedCount: metrics.includedCount,
    scoredCount: metrics.scoredCount,
    verdict: cleanedVerdict
  };

  allRatings[safeAlbumId] = updatedRecord;
  const savedOk = writeSavedRatingsMap(allRatings);

  if (albumMetadata && typeof albumMetadata === 'object') {
    saveAlbumMetadataToCache(albumMetadata, safeTracks.length || albumMetadata.trackCount);
  }

  return {
    savedOk,
    record: updatedRecord,
    verdict: cleanedVerdict
  };
}

export function saveTrackRatingUpdate(
  collectionId,
  trackKey,
  patch,
  albumTracks = [],
  albumMetadata = null
) {
  const safeAlbumId = String(collectionId || '').trim();
  const safeTrackKey = String(trackKey || '').trim();
  if (!safeAlbumId || !safeTrackKey) {
    return null;
  }

  const allRatings = getSavedRatingsMap();
  const existingRecord = normalizeAlbumRatingRecord(
    safeAlbumId,
    allRatings[safeAlbumId]
  );

  const previousTrackState = existingRecord.trackRatings[safeTrackKey];
  const updatedTrackState = mergeTrackState(previousTrackState, patch);

  const nextTrackRatings = {
    ...existingRecord.trackRatings,
    [safeTrackKey]: updatedTrackState
  };

  const safeTracks = Array.isArray(albumTracks) ? albumTracks : [];
  const metrics =
    safeTracks.length > 0
      ? calculateAlbumScoreAndHighlights(safeTracks, nextTrackRatings)
      : calculateMetricsFromTrackRatingsMap(nextTrackRatings, 0);

  const hasNewRating =
    Object.prototype.hasOwnProperty.call(patch || {}, 'rating') &&
    updatedTrackState.rating !== null;

  const updatedRecord = {
    collectionId: safeAlbumId,
    updatedAt: new Date().toISOString(),
    overallScore: metrics.overallScore,
    ratedCount: metrics.ratedCount,
    includedCount: metrics.includedCount,
    scoredCount: metrics.scoredCount,
    verdict: existingRecord.verdict || '',
    hiddenFromLibrary: hasNewRating ? false : Boolean(existingRecord.hiddenFromLibrary),
    trackRatings: nextTrackRatings
  };

  allRatings[safeAlbumId] = updatedRecord;
  const savedOk = writeSavedRatingsMap(allRatings);

  if (albumMetadata && typeof albumMetadata === 'object') {
    saveAlbumMetadataToCache(albumMetadata, safeTracks.length || albumMetadata.trackCount);
  }

  return {
    savedOk,
    record: updatedRecord,
    trackState: updatedTrackState,
    metrics
  };
}

export function removeAlbumFromLibrary(collectionId) {
  const safeAlbumId = String(collectionId || '').trim();
  if (!safeAlbumId) return null;

  const allRatings = getSavedRatingsMap();
  const existing = allRatings[safeAlbumId];
  if (!existing) return null;

  const updated = {
    ...normalizeAlbumRatingRecord(safeAlbumId, existing),
    hiddenFromLibrary: true
  };

  allRatings[safeAlbumId] = updated;
  writeSavedRatingsMap(allRatings);
  return updated;
}

export function restoreAlbumToLibrary(collectionId) {
  const safeAlbumId = String(collectionId || '').trim();
  if (!safeAlbumId) return null;

  const allRatings = getSavedRatingsMap();
  const existing = allRatings[safeAlbumId];
  if (!existing) return null;

  const updated = {
    ...normalizeAlbumRatingRecord(safeAlbumId, existing),
    hiddenFromLibrary: false,
    updatedAt: existing.updatedAt || new Date().toISOString()
  };

  allRatings[safeAlbumId] = updated;
  writeSavedRatingsMap(allRatings);
  return updated;
}

export function clearAlbumTrackRatings(collectionId, albumTracks = []) {
  const safeAlbumId = String(collectionId || '').trim();
  if (!safeAlbumId) return null;

  const allRatings = getSavedRatingsMap();
  delete allRatings[safeAlbumId];
  writeSavedRatingsMap(allRatings);

  const metrics = calculateAlbumScoreAndHighlights(albumTracks, {});
  return {
    record: null,
    metrics
  };
}

export function getRecentSearches() {
  const storage = getStorage();
  if (!storage) return [];

  try {
    const raw = storage.getItem(APP_CONFIG.storageKeys.recentQueries);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list.slice(0, 6) : [];
  } catch {
    return [];
  }
}

export function saveRecentSearch(query) {
  const storage = getStorage();
  if (!storage) return;

  const cleaned = String(query || '').trim();
  if (cleaned.length < 2) return;
  try {
    const existing = getRecentSearches().filter(
      (item) => item.toLowerCase() !== cleaned.toLowerCase()
    );
    const updated = [cleaned, ...existing].slice(0, 6);
    storage.setItem(APP_CONFIG.storageKeys.recentQueries, JSON.stringify(updated));
  } catch (err) {
    console.warn('[RATEPLAY Storage] Unable to persist recent search:', err);
  }
}

// === PHASE 6 PART 2: PRE-IMPORT BACKUP & BULK MERGE STORAGE HELPERS ===
function getPreImportBackupKey() {
  return APP_CONFIG.storageKeys.preImportBackup || 'sleeve_pre_import_backup_v1';
}

/**
 * Creates a timestamped backup snapshot of current localStorage ratings and metadata
 * before applying any JSON import.
 */
export function createPreImportLocalBackup() {
  const storage = getStorage();
  if (!storage) return null;

  const snapshot = {
    backedUpAt: new Date().toISOString(),
    ratingsMap: getSavedRatingsMap(),
    albumMetadataMap: getAlbumCatalogCacheMap(),
    collectionsMap: getSavedCollectionsMap()
  };

  try {
    storage.setItem(getPreImportBackupKey(), JSON.stringify(snapshot));
    lastStorageError = null;
    return snapshot;
  } catch (err) {
    lastStorageError = err;
    console.warn('[RATEPLAY Storage] Unable to write pre-import backup:', err);
    return null;
  }
}

/**
 * Reads the most recent pre-import backup snapshot if one exists.
 */
export function getPreImportLocalBackup() {
  const storage = getStorage();
  if (!storage) return null;

  try {
    const raw = storage.getItem(getPreImportBackupKey());
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    return {
      backedUpAt: typeof parsed.backedUpAt === 'string' ? parsed.backedUpAt : null,
      ratingsMap:
        parsed.ratingsMap && typeof parsed.ratingsMap === 'object' ? parsed.ratingsMap : {},
      albumMetadataMap:
        parsed.albumMetadataMap && typeof parsed.albumMetadataMap === 'object'
          ? parsed.albumMetadataMap
          : {},
      collectionsMap:
        parsed.collectionsMap && typeof parsed.collectionsMap === 'object'
          ? parsed.collectionsMap
          : null
    };
  } catch {
    return null;
  }
}

/**
 * Restores ratingsMap, albumMetadataMap, and collectionsMap from the saved pre-import backup snapshot.
 */
export function restorePreImportLocalBackup() {
  const storage = getStorage();
  if (!storage) return false;

  const backup = getPreImportLocalBackup();
  if (!backup) return false;

  try {
    storage.setItem(APP_CONFIG.storageKeys.ratingsMap, JSON.stringify(backup.ratingsMap));
    storage.setItem(getMetaStorageKey(), JSON.stringify(backup.albumMetadataMap));
    if (backup.collectionsMap && typeof backup.collectionsMap === 'object') {
      storage.setItem(getCollectionsStorageKey(), JSON.stringify(backup.collectionsMap));
    }
    lastStorageError = null;
    return true;
  } catch (err) {
    lastStorageError = err;
    return false;
  }
}

/**
 * Writes merged ratingsMap, albumMetadataMap, and optional collectionsMap to localStorage
 * after creating an automatic pre-import backup. Never touches unrelated localStorage keys.
 */
export function commitMergedLibraryMaps(
  nextRatingsMap,
  nextMetadataMap,
  nextCollectionsMap = null
) {
  const storage = getStorage();
  if (!storage) {
    return { ok: false, backup: null, error: 'Storage unavailable.' };
  }

  const backup = createPreImportLocalBackup();

  try {
    const normalizedRatings = {};
    if (nextRatingsMap && typeof nextRatingsMap === 'object') {
      Object.keys(nextRatingsMap).forEach((id) => {
        normalizedRatings[String(id)] = normalizeAlbumRatingRecord(id, nextRatingsMap[id]);
      });
    }

    const normalizedMeta = {};
    if (nextMetadataMap && typeof nextMetadataMap === 'object') {
      Object.keys(nextMetadataMap).forEach((id) => {
        const cleanMeta = normalizeCompactAlbumMeta(id, nextMetadataMap[id]);
        if (cleanMeta) {
          normalizedMeta[String(cleanMeta.collectionId)] = cleanMeta;
        }
      });
    }

    storage.setItem(APP_CONFIG.storageKeys.ratingsMap, JSON.stringify(normalizedRatings));
    storage.setItem(getMetaStorageKey(), JSON.stringify(normalizedMeta));

    let collectionsCount = Object.keys(getSavedCollectionsMap()).length;
    if (nextCollectionsMap && typeof nextCollectionsMap === 'object') {
      const normalizedCols = {};
      Object.keys(nextCollectionsMap).forEach((colId) => {
        const cleanCol = normalizeCustomCollectionRecord(colId, nextCollectionsMap[colId]);
        if (cleanCol) {
          normalizedCols[cleanCol.id] = cleanCol;
        }
      });
      storage.setItem(getCollectionsStorageKey(), JSON.stringify(normalizedCols));
      collectionsCount = Object.keys(normalizedCols).length;
    }

    lastStorageError = null;

    return {
      ok: true,
      backup,
      ratingsCount: Object.keys(normalizedRatings).length,
      metadataCount: Object.keys(normalizedMeta).length,
      collectionsCount
    };
  } catch (err) {
    lastStorageError = err;
    return {
      ok: false,
      backup,
      error: err.message || 'Storage quota exceeded while saving imported library.'
    };
  }
}

// === PHASE 8: LISTENING JOURNAL STORAGE ('sleeve_journal_v1') ===
function getJournalStorageKey() {
  return APP_CONFIG.storageKeys.journalMap || 'sleeve_journal_v1';
}

function getJournalBackupKey() {
  return (
    APP_CONFIG.storageKeys.journalPreImportBackup ||
    'sleeve_journal_pre_import_backup_v1'
  );
}

/**
 * Normalizes a single mood tag string.
 */
export function normalizeMoodTag(rawTag) {
  if (typeof rawTag !== 'string') return '';
  return rawTag
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 36);
}

/**
 * Deduplicates and normalizes an array of mood tags (case-insensitive deduplication).
 */
export function normalizeMoodTagsList(rawTags = []) {
  if (!Array.isArray(rawTags)) return [];
  const seen = new Set();
  const result = [];

  for (let i = 0; i < rawTags.length; i += 1) {
    const clean = normalizeMoodTag(rawTags[i]);
    if (!clean) continue;
    const lower = clean.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    result.push(clean);
    if (result.length >= 16) break;
  }
  return result;
}

/**
 * Normalizes favorite track references (array of objects or strings).
 */
export function normalizeFavoriteTracksList(rawFavorites = []) {
  if (!Array.isArray(rawFavorites)) return [];
  const seen = new Set();
  const result = [];

  for (let i = 0; i < rawFavorites.length; i += 1) {
    const item = rawFavorites[i];
    let trackKey = '';
    let trackNumber = null;
    let trackName = '';

    if (typeof item === 'string') {
      trackName = item.replace(/\s+/g, ' ').trim().slice(0, 120);
      trackKey = trackName.toLowerCase();
    } else if (item && typeof item === 'object') {
      trackKey = String(item.trackKey || item.trackId || '').trim();
      trackNumber = Number.isFinite(Number(item.trackNumber))
        ? Number(item.trackNumber)
        : null;
      trackName = String(item.trackName || '').replace(/\s+/g, ' ').trim().slice(0, 120);
      if (!trackKey && trackName) {
        trackKey = trackName.toLowerCase();
      }
    }

    if (!trackKey && !trackName) continue;
    const dedupKey = trackKey || trackName.toLowerCase();
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);

    result.push({
      trackKey: dedupKey,
      trackNumber,
      trackName: trackName || 'Track ' + String(trackNumber || result.length + 1)
    });

    if (result.length >= 25) break;
  }

  return result;
}

/**
 * Normalizes per-track notes (accepts array of {trackKey, trackNumber, trackName, note}
 * or object map keyed by trackKey).
 */
export function normalizeTrackNotesList(rawTrackNotes) {
  if (!rawTrackNotes) return [];

  const rawArray = Array.isArray(rawTrackNotes)
    ? rawTrackNotes
    : typeof rawTrackNotes === 'object'
    ? Object.keys(rawTrackNotes).map((key) => {
        const val = rawTrackNotes[key];
        if (typeof val === 'string') {
          return { trackKey: key, trackName: key, note: val };
        }
        return { trackKey: key, ...(val || {}) };
      })
    : [];

  const seen = new Set();
  const result = [];

  for (let i = 0; i < rawArray.length; i += 1) {
    const item = rawArray[i];
    if (!item || typeof item !== 'object') continue;

    const noteText = String(item.note ?? '')
      .replace(/\r\n/g, '\n')
      .trim()
      .slice(0, 600);
    if (!noteText) continue;

    const trackKey = String(item.trackKey || item.trackId || '').trim();
    const trackNumber = Number.isFinite(Number(item.trackNumber))
      ? Number(item.trackNumber)
      : null;
    const trackName = String(item.trackName || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120);

    const dedupKey = trackKey || trackName.toLowerCase() || 'track-' + String(i + 1);
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);

    result.push({
      trackKey: dedupKey,
      trackNumber,
      trackName: trackName || 'Track ' + String(trackNumber || i + 1),
      note: noteText
    });

    if (result.length >= 60) break;
  }

  return result;
}

/**
 * Normalizes a stored journal entry record for a collectionId.
 */
export function normalizeJournalEntryRecord(collectionId, rawEntry) {
  const safeId = String(collectionId || rawEntry?.collectionId || '').trim();
  if (!safeId || !rawEntry || typeof rawEntry !== 'object' || Array.isArray(rawEntry)) {
    return null;
  }

  const reviewText = String(rawEntry.reviewText ?? '')
    .replace(/\r\n/g, '\n')
    .trim()
    .slice(0, 8000);

  const moodTags = normalizeMoodTagsList(rawEntry.moodTags);
  const favoriteTracks = normalizeFavoriteTracksList(rawEntry.favoriteTracks);
  const trackNotes = normalizeTrackNotesList(rawEntry.trackNotes);

  const hasContent =
    reviewText.length > 0 ||
    moodTags.length > 0 ||
    favoriteTracks.length > 0 ||
    trackNotes.length > 0;

  if (!hasContent) {
    return null;
  }

  const nowIso = new Date().toISOString();
  const validCreatedAt =
    typeof rawEntry.createdAt === 'string' && !Number.isNaN(Date.parse(rawEntry.createdAt))
      ? rawEntry.createdAt
      : typeof rawEntry.updatedAt === 'string' && !Number.isNaN(Date.parse(rawEntry.updatedAt))
      ? rawEntry.updatedAt
      : nowIso;

  const validUpdatedAt =
    typeof rawEntry.updatedAt === 'string' && !Number.isNaN(Date.parse(rawEntry.updatedAt))
      ? rawEntry.updatedAt
      : validCreatedAt;

  return {
    collectionId: safeId,
    reviewText,
    moodTags,
    favoriteTracks,
    trackNotes,
    createdAt: validCreatedAt,
    updatedAt: validUpdatedAt
  };
}

/**
 * Reads all saved journal entries keyed by collectionId from 'sleeve_journal_v1'.
 * Gracefully handles malformed JSON without corrupting data or affecting ratings.
 */
export function getSavedJournalMap() {
  const storage = getStorage();
  if (!storage) return {};

  try {
    const raw = storage.getItem(getJournalStorageKey());
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    const normalizedMap = {};
    Object.keys(parsed).forEach((collectionId) => {
      const normalized = normalizeJournalEntryRecord(collectionId, parsed[collectionId]);
      if (normalized) {
        normalizedMap[String(normalized.collectionId)] = normalized;
      }
    });
    lastStorageError = null;
    return normalizedMap;
  } catch (err) {
    lastStorageError = err;
    if (!customStorageBackend && typeof window !== 'undefined') {
      console.warn(
        '[RATEPLAY Storage] Stored journal JSON could not be parsed; returning empty state.'
      );
    }
    return {};
  }
}

function writeSavedJournalMap(map) {
  const storage = getStorage();
  if (!storage) return false;

  try {
    storage.setItem(getJournalStorageKey(), JSON.stringify(map));
    lastStorageError = null;
    return true;
  } catch (err) {
    lastStorageError = err;
    console.warn('[RATEPLAY Storage] Unable to persist journal map:', err);
    return false;
  }
}

/**
 * Retrieves a single album's journal entry by collectionId.
 */
export function getAlbumJournalEntry(collectionId) {
  if (collectionId === null || collectionId === undefined || collectionId === '') {
    return null;
  }
  const map = getSavedJournalMap();
  return map[String(collectionId)] || null;
}

/**
 * Creates or updates a journal entry for an album in 'sleeve_journal_v1'.
 * Preserves createdAt on updates and updates updatedAt. Never alters 'sleeve_ratings_v1'.
 */
export function saveAlbumJournalEntry(
  collectionId,
  entryPayload = {},
  albumMetadata = null
) {
  const safeId = String(collectionId || entryPayload?.collectionId || '').trim();
  if (!safeId) return null;

  const allEntries = getSavedJournalMap();
  const existing = allEntries[safeId] || null;
  const nowIso = new Date().toISOString();

  const candidate = {
    collectionId: safeId,
    reviewText:
      entryPayload.reviewText !== undefined
        ? entryPayload.reviewText
        : existing?.reviewText || '',
    moodTags:
      entryPayload.moodTags !== undefined
        ? entryPayload.moodTags
        : existing?.moodTags || [],
    favoriteTracks:
      entryPayload.favoriteTracks !== undefined
        ? entryPayload.favoriteTracks
        : existing?.favoriteTracks || [],
    trackNotes:
      entryPayload.trackNotes !== undefined
        ? entryPayload.trackNotes
        : existing?.trackNotes || [],
    createdAt: existing?.createdAt || entryPayload.createdAt || nowIso,
    updatedAt: entryPayload.updatedAt || nowIso
  };

  const normalized = normalizeJournalEntryRecord(safeId, candidate);
  if (!normalized) {
    return {
      savedOk: false,
      error: 'Journal entry must include review notes, mood tags, favorite tracks, or track notes.',
      entry: null
    };
  }

  allEntries[safeId] = normalized;
  const savedOk = writeSavedJournalMap(allEntries);

  if (albumMetadata && typeof albumMetadata === 'object') {
    saveAlbumMetadataToCache(albumMetadata, albumMetadata.trackCount);
  }

  return {
    savedOk,
    isNew: !existing,
    entry: normalized
  };
}

/**
 * Deletes an album's journal entry from 'sleeve_journal_v1' without touching album ratings.
 */
export function deleteAlbumJournalEntry(collectionId) {
  const safeId = String(collectionId || '').trim();
  if (!safeId) return false;

  const allEntries = getSavedJournalMap();
  if (!Object.prototype.hasOwnProperty.call(allEntries, safeId)) {
    return false;
  }

  delete allEntries[safeId];
  return writeSavedJournalMap(allEntries);
}

/**
 * Creates a pre-import backup of 'sleeve_journal_v1' before applying imported journal entries.
 */
export function createPreImportJournalBackup() {
  const storage = getStorage();
  if (!storage) return null;

  const snapshot = {
    backedUpAt: new Date().toISOString(),
    journalMap: getSavedJournalMap()
  };

  try {
    storage.setItem(getJournalBackupKey(), JSON.stringify(snapshot));
    lastStorageError = null;
    return snapshot;
  } catch (err) {
    lastStorageError = err;
    return null;
  }
}

export function getPreImportJournalBackup() {
  const storage = getStorage();
  if (!storage) return null;

  try {
    const raw = storage.getItem(getJournalBackupKey());
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    return {
      backedUpAt: typeof parsed.backedUpAt === 'string' ? parsed.backedUpAt : null,
      journalMap:
        parsed.journalMap && typeof parsed.journalMap === 'object' ? parsed.journalMap : {}
    };
  } catch {
    return null;
  }
}

export function restorePreImportJournalBackup() {
  const storage = getStorage();
  if (!storage) return false;

  const backup = getPreImportJournalBackup();
  if (!backup) return false;

  try {
    storage.setItem(getJournalStorageKey(), JSON.stringify(backup.journalMap));
    lastStorageError = null;
    return true;
  } catch (err) {
    lastStorageError = err;
    return false;
  }
}

/**
 * Commits a merged journalMap and optional albumMetadataMap without touching 'sleeve_ratings_v1'.
 */
export function commitMergedJournalMap(nextJournalMap, nextMetadataMap = null) {
  const storage = getStorage();
  if (!storage) {
    return { ok: false, backup: null, error: 'Storage unavailable.' };
  }

  const backup = createPreImportJournalBackup();

  try {
    const cleanJournal = {};
    if (nextJournalMap && typeof nextJournalMap === 'object') {
      Object.keys(nextJournalMap).forEach((id) => {
        const norm = normalizeJournalEntryRecord(id, nextJournalMap[id]);
        if (norm) {
          cleanJournal[String(norm.collectionId)] = norm;
        }
      });
    }

    storage.setItem(getJournalStorageKey(), JSON.stringify(cleanJournal));

    if (nextMetadataMap && typeof nextMetadataMap === 'object') {
      const currentMeta = getAlbumCatalogCacheMap();
      Object.keys(nextMetadataMap).forEach((id) => {
        const cleanMeta = normalizeCompactAlbumMeta(id, nextMetadataMap[id]);
        if (cleanMeta) {
          currentMeta[String(cleanMeta.collectionId)] = cleanMeta;
        }
      });
      storage.setItem(getMetaStorageKey(), JSON.stringify(currentMeta));
    }

    lastStorageError = null;
    return {
      ok: true,
      backup,
      entriesCount: Object.keys(cleanJournal).length
    };
  } catch (err) {
    lastStorageError = err;
    return {
      ok: false,
      backup,
      error: err.message || 'Storage quota exceeded while saving imported journal.'
    };
  }
}

// === PHASE 9A: CUSTOM COLLECTIONS STORAGE ('sleeve_collections_v1') ===
export const VALID_COLLECTION_THEMES = [
  'obsidian',
  'amber',
  'emerald',
  'signal',
  'crimson',
  'paper'
];

function getCollectionsStorageKey() {
  return APP_CONFIG.storageKeys.collectionsMap || 'sleeve_collections_v1';
}

export function normalizeCollectionTheme(rawTheme) {
  const clean = String(rawTheme || 'obsidian').trim().toLowerCase();
  return VALID_COLLECTION_THEMES.includes(clean) ? clean : 'obsidian';
}

export function isValidCollectionAlbumId(rawAlbumId) {
  const clean = String(rawAlbumId ?? '').trim();
  if (!clean || clean.length > 64) return false;
  if (clean === 'null' || clean === 'undefined' || clean === 'NaN' || clean === '0') {
    return false;
  }
  return !/[^a-zA-Z0-9_-]/.test(clean);
}

/**
 * Normalizes and deduplicates an ordered array of album collectionIds,
 * preserving their first-seen sequence order.
 */
export function normalizeCollectionAlbumIds(rawAlbumIds = []) {
  if (!Array.isArray(rawAlbumIds)) return [];
  const seen = new Set();
  const ordered = [];

  for (let i = 0; i < rawAlbumIds.length; i += 1) {
    const candidate = String(rawAlbumIds[i] ?? '').trim();
    if (!isValidCollectionAlbumId(candidate)) continue;
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    ordered.push(candidate);
    if (ordered.length >= 500) break;
  }

  return ordered;
}

/**
 * Normalizes a smart collection rating threshold (1.0 to 10.0 in 0.5 steps) or null.
 */
function normalizeSmartRatingBound(value) {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') {
    return null;
  }
  const num = Number(value);
  if (!Number.isFinite(num) || num < 1.0 - 1e-9 || num > 10.0 + 1e-9) {
    return null;
  }
  return Math.round(num * 2) / 2;
}

/**
 * Normalizes a release decade rule string (e.g. "1990s", "2000s") or "".
 */
function normalizeSmartDecadeRule(rawDecade) {
  if (typeof rawDecade !== 'string' && typeof rawDecade !== 'number') return '';
  const clean = String(rawDecade).trim().toLowerCase();
  if (!clean) return '';
  const stripped = clean.endsWith('s') ? clean.slice(0, -1) : clean;
  if (stripped.length !== 4 || /[^0-9]/.test(stripped)) return '';
  const num = Number(stripped);
  if (!Number.isFinite(num) || num < 1900 || num > 2090 || num % 10 !== 0) {
    return '';
  }
  return String(num) + 's';
}

/**
 * Normalizes the rule configuration object for a Smart Collection.
 */
export function normalizeSmartCollectionRules(rawRules = {}) {
  if (!rawRules || typeof rawRules !== 'object' || Array.isArray(rawRules)) {
    return {
      minRating: null,
      maxRating: null,
      artist: '',
      decade: '',
      hasJournalEntry: false,
      hasFavoriteTracks: false
    };
  }

  let minRating = normalizeSmartRatingBound(rawRules.minRating);
  let maxRating = normalizeSmartRatingBound(rawRules.maxRating);

  if (minRating !== null && maxRating !== null && minRating > maxRating) {
    const temp = minRating;
    minRating = maxRating;
    maxRating = temp;
  }

  const artist =
    typeof rawRules.artist === 'string'
      ? rawRules.artist.replace(/\s+/g, ' ').trim().slice(0, 80)
      : '';

  const decade = normalizeSmartDecadeRule(rawRules.decade);
  const hasJournalEntry = Boolean(rawRules.hasJournalEntry);
  const hasFavoriteTracks = Boolean(rawRules.hasFavoriteTracks);

  return {
    minRating,
    maxRating,
    artist,
    decade,
    hasJournalEntry,
    hasFavoriteTracks
  };
}

/**
 * Returns true if at least one smart rule is active.
 */
export function hasActiveSmartRules(rawRules = {}) {
  const r = normalizeSmartCollectionRules(rawRules);
  return (
    r.minRating !== null ||
    r.maxRating !== null ||
    r.artist.length > 0 ||
    r.decade.length > 0 ||
    r.hasJournalEntry === true ||
    r.hasFavoriteTracks === true
  );
}

/**
 * Normalizes a single custom or smart collection record.
 * Returns null if the collection ID or title is missing/invalid.
 */
export function normalizeCustomCollectionRecord(collectionId, rawRecord) {
  if (!rawRecord || typeof rawRecord !== 'object' || Array.isArray(rawRecord)) {
    return null;
  }

  const safeId = String(rawRecord.id || collectionId || '').trim();
  if (!safeId || safeId.length > 80 || /[^a-zA-Z0-9_-]/.test(safeId)) {
    return null;
  }

  const title = String(rawRecord.title ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);

  if (!title) {
    return null;
  }

  const description = String(rawRecord.description ?? '')
    .replace(/\r\n/g, '\n')
    .trim()
    .slice(0, 400);

  const type = String(rawRecord.type || 'manual').toLowerCase() === 'smart' ? 'smart' : 'manual';
  const theme = normalizeCollectionTheme(rawRecord.theme);
  const albumIds = normalizeCollectionAlbumIds(rawRecord.albumIds);
  const smartRules = normalizeSmartCollectionRules(rawRecord.smartRules);

  const nowIso = new Date().toISOString();
  const validCreatedAt =
    typeof rawRecord.createdAt === 'string' && !Number.isNaN(Date.parse(rawRecord.createdAt))
      ? rawRecord.createdAt
      : typeof rawRecord.updatedAt === 'string' && !Number.isNaN(Date.parse(rawRecord.updatedAt))
      ? rawRecord.updatedAt
      : nowIso;

  const validUpdatedAt =
    typeof rawRecord.updatedAt === 'string' && !Number.isNaN(Date.parse(rawRecord.updatedAt))
      ? rawRecord.updatedAt
      : validCreatedAt;

  return {
    id: safeId,
    title,
    description,
    type,
    theme,
    albumIds,
    smartRules,
    createdAt: validCreatedAt,
    updatedAt: validUpdatedAt
  };
}

/**
 * Reads all saved custom and smart collections keyed by collection ID from 'sleeve_collections_v1'.
 * Recovers safely from malformed JSON without affecting ratings or journal data.
 */
export function getSavedCollectionsMap() {
  const storage = getStorage();
  if (!storage) return {};

  try {
    const raw = storage.getItem(getCollectionsStorageKey());
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    const normalizedMap = {};
    Object.keys(parsed).forEach((key) => {
      const norm = normalizeCustomCollectionRecord(key, parsed[key]);
      if (norm) {
        normalizedMap[norm.id] = norm;
      }
    });
    lastStorageError = null;
    return normalizedMap;
  } catch (err) {
    lastStorageError = err;
    if (!customStorageBackend && typeof window !== 'undefined') {
      console.warn(
        '[RATEPLAY Storage] Stored collections JSON could not be parsed; returning empty state.'
      );
    }
    return {};
  }
}

function writeSavedCollectionsMap(map) {
  const storage = getStorage();
  if (!storage) return false;

  try {
    storage.setItem(getCollectionsStorageKey(), JSON.stringify(map));
    lastStorageError = null;
    return true;
  } catch (err) {
    lastStorageError = err;
    console.warn('[RATEPLAY Storage] Unable to persist collections map:', err);
    return false;
  }
}

/**
 * Retrieves a single custom or smart collection record by its ID.
 */
export function getCustomCollection(collectionId) {
  if (collectionId === null || collectionId === undefined || collectionId === '') {
    return null;
  }
  const map = getSavedCollectionsMap();
  return map[String(collectionId).trim()] || null;
}

function stripLeadingTrailingHyphens(str) {
  let start = 0;
  let end = str.length;
  while (start < end && str[start] === '-') start += 1;
  while (end > start && str[end - 1] === '-') end -= 1;
  return str.slice(start, end);
}

function generateCollectionId(title = 'collection', existingMap = {}) {
  const rawSlug = String(title || 'collection')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-');
  const baseSlug = stripLeadingTrailingHyphens(rawSlug).slice(0, 28) || 'col';

  let candidate = 'col-' + baseSlug + '-' + String(Date.now()).slice(-6);
  let counter = 1;
  while (Object.prototype.hasOwnProperty.call(existingMap, candidate)) {
    counter += 1;
    candidate = 'col-' + baseSlug + '-' + String(Date.now()).slice(-6) + '-' + String(counter);
  }
  return candidate;
}

/**
 * Creates a new custom/smart collection or updates (renames/edits) an existing one.
 * Validates title, description, type, theme, deduplicated albumIds, and smartRules.
 */
export function saveCustomCollection(payload = {}) {
  if (!payload || typeof payload !== 'object') {
    return {
      savedOk: false,
      error: 'Invalid collection payload.',
      collection: null
    };
  }

  const cleanTitle = String(payload.title ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);

  if (!cleanTitle) {
    return {
      savedOk: false,
      error: 'Collection title is required.',
      collection: null
    };
  }

  const allCollections = getSavedCollectionsMap();
  const requestedId = String(payload.id || '').trim();
  const existing = requestedId ? allCollections[requestedId] || null : null;

  const resolvedId = existing
    ? existing.id
    : requestedId && !/[^a-zA-Z0-9_-]/.test(requestedId)
    ? requestedId
    : generateCollectionId(cleanTitle, allCollections);

  const resolvedType =
    payload.type !== undefined
      ? String(payload.type).toLowerCase() === 'smart'
        ? 'smart'
        : 'manual'
      : existing?.type || 'manual';

  const resolvedSmartRules =
    payload.smartRules !== undefined
      ? normalizeSmartCollectionRules(payload.smartRules)
      : existing?.smartRules || normalizeSmartCollectionRules({});

  if (
    resolvedType === 'smart' &&
    !payload.allowEmptySmartRules &&
    !hasActiveSmartRules(resolvedSmartRules)
  ) {
    return {
      savedOk: false,
      error: 'Smart collections require at least one active rule (rating, artist, decade, journal entry, or favorite tracks).',
      collection: null
    };
  }

  const nowIso = new Date().toISOString();

  const candidate = {
    id: resolvedId,
    title: cleanTitle,
    description:
      payload.description !== undefined
        ? payload.description
        : existing?.description || '',
    type: resolvedType,
    theme:
      payload.theme !== undefined
        ? payload.theme
        : existing?.theme || 'obsidian',
    albumIds:
      payload.albumIds !== undefined
        ? payload.albumIds
        : existing?.albumIds || [],
    smartRules: resolvedSmartRules,
    createdAt: existing?.createdAt || payload.createdAt || nowIso,
    updatedAt: payload.updatedAt || nowIso
  };

  const normalized = normalizeCustomCollectionRecord(resolvedId, candidate);
  if (!normalized) {
    return {
      savedOk: false,
      error: 'Unable to validate collection fields.',
      collection: null
    };
  }

  allCollections[resolvedId] = normalized;
  const savedOk = writeSavedCollectionsMap(allCollections);

  return {
    savedOk,
    isNew: !existing,
    collection: normalized
  };
}

/**
 * Removes or clears a single rule key ('minRating', 'maxRating', 'ratingRange', 'artist',
 * 'decade', 'hasJournalEntry', 'hasFavoriteTracks') from a Smart Collection.
 */
export function removeSmartCollectionRule(collectionId, ruleKey) {
  const safeId = String(collectionId || '').trim();
  const key = String(ruleKey || '').trim();
  if (!safeId || !key) {
    return { ok: false, collection: null };
  }

  const allCollections = getSavedCollectionsMap();
  const existing = allCollections[safeId];
  if (!existing || existing.type !== 'smart') {
    return { ok: false, collection: existing || null };
  }

  const nextRules = { ...existing.smartRules };
  if (key === 'ratingRange') {
    nextRules.minRating = null;
    nextRules.maxRating = null;
  } else if (key === 'minRating') {
    nextRules.minRating = null;
  } else if (key === 'maxRating') {
    nextRules.maxRating = null;
  } else if (key === 'artist') {
    nextRules.artist = '';
  } else if (key === 'decade') {
    nextRules.decade = '';
  } else if (key === 'hasJournalEntry') {
    nextRules.hasJournalEntry = false;
  } else if (key === 'hasFavoriteTracks') {
    nextRules.hasFavoriteTracks = false;
  }

  const updated = normalizeCustomCollectionRecord(safeId, {
    ...existing,
    smartRules: nextRules,
    updatedAt: new Date().toISOString()
  });

  allCollections[safeId] = updated;
  const savedOk = writeSavedCollectionsMap(allCollections);

  return {
    ok: savedOk,
    collection: updated
  };
}

/**
 * Deletes a custom or smart collection by ID without modifying any album ratings or journal entries.
 */
export function deleteCustomCollection(collectionId) {
  const safeId = String(collectionId || '').trim();
  if (!safeId) return false;

  const allCollections = getSavedCollectionsMap();
  if (!Object.prototype.hasOwnProperty.call(allCollections, safeId)) {
    return false;
  }

  delete allCollections[safeId];
  return writeSavedCollectionsMap(allCollections);
}

/**
 * Adds an album (by its stable collectionId) to a manual collection.
 * Strictly prevents duplicate entries within the same collection.
 */
export function addAlbumToCustomCollection(
  collectionId,
  albumId,
  albumMetadata = null
) {
  const safeColId = String(collectionId || '').trim();
  const safeAlbumId = String(albumId ?? '').trim();

  if (!safeColId || !isValidCollectionAlbumId(safeAlbumId)) {
    return {
      ok: false,
      alreadyPresent: false,
      error: 'Invalid collection ID or album ID.',
      collection: null
    };
  }

  const allCollections = getSavedCollectionsMap();
  const existing = allCollections[safeColId];
  if (!existing) {
    return {
      ok: false,
      alreadyPresent: false,
      error: 'Collection not found.',
      collection: null
    };
  }

  if (existing.type === 'smart') {
    return {
      ok: false,
      alreadyPresent: false,
      error: 'Smart collections are populated automatically by their rules.',
      collection: existing
    };
  }

  if (existing.albumIds.includes(safeAlbumId)) {
    return {
      ok: true,
      alreadyPresent: true,
      collection: existing
    };
  }

  const updated = normalizeCustomCollectionRecord(safeColId, {
    ...existing,
    albumIds: [...existing.albumIds, safeAlbumId],
    updatedAt: new Date().toISOString()
  });

  allCollections[safeColId] = updated;
  const savedOk = writeSavedCollectionsMap(allCollections);

  if (albumMetadata && typeof albumMetadata === 'object') {
    saveAlbumMetadataToCache(albumMetadata, albumMetadata.trackCount);
  }

  return {
    ok: savedOk,
    alreadyPresent: false,
    collection: updated
  };
}

/**
 * Removes an album from a manual collection without altering the album's ratings or library state.
 */
export function removeAlbumFromCustomCollection(collectionId, albumId) {
  const safeColId = String(collectionId || '').trim();
  const safeAlbumId = String(albumId ?? '').trim();

  if (!safeColId || !safeAlbumId) {
    return { ok: false, removed: false, collection: null };
  }

  const allCollections = getSavedCollectionsMap();
  const existing = allCollections[safeColId];
  if (!existing || existing.type === 'smart') {
    return { ok: false, removed: false, collection: existing || null };
  }

  const nextAlbumIds = existing.albumIds.filter((id) => id !== safeAlbumId);
  if (nextAlbumIds.length === existing.albumIds.length) {
    return { ok: true, removed: false, collection: existing };
  }

  const updated = normalizeCustomCollectionRecord(safeColId, {
    ...existing,
    albumIds: nextAlbumIds,
    updatedAt: new Date().toISOString()
  });

  allCollections[safeColId] = updated;
  const savedOk = writeSavedCollectionsMap(allCollections);

  return {
    ok: savedOk,
    removed: true,
    collection: updated
  };
}

/**
 * Moves an album up ('up' / -1) or down ('down' / +1) in a manual collection's sequence.
 */
export function moveAlbumInCustomCollection(collectionId, albumId, direction) {
  const safeColId = String(collectionId || '').trim();
  const safeAlbumId = String(albumId ?? '').trim();

  const allCollections = getSavedCollectionsMap();
  const existing = allCollections[safeColId];
  if (!existing || existing.type === 'smart') {
    return { ok: false, moved: false, collection: existing || null };
  }

  const currentIdx = existing.albumIds.indexOf(safeAlbumId);
  if (currentIdx < 0) {
    return { ok: false, moved: false, collection: existing };
  }

  const delta =
    direction === 'up' || direction === -1
      ? -1
      : direction === 'down' || direction === 1
      ? 1
      : 0;

  const targetIdx = currentIdx + delta;
  if (delta === 0 || targetIdx < 0 || targetIdx >= existing.albumIds.length) {
    return { ok: true, moved: false, collection: existing };
  }

  const nextAlbumIds = [...existing.albumIds];
  const temp = nextAlbumIds[currentIdx];
  nextAlbumIds[currentIdx] = nextAlbumIds[targetIdx];
  nextAlbumIds[targetIdx] = temp;

  const updated = normalizeCustomCollectionRecord(safeColId, {
    ...existing,
    albumIds: nextAlbumIds,
    updatedAt: new Date().toISOString()
  });

  allCollections[safeColId] = updated;
  const savedOk = writeSavedCollectionsMap(allCollections);

  return {
    ok: savedOk,
    moved: true,
    fromIndex: currentIdx,
    toIndex: targetIdx,
    collection: updated
  };
}

/**
 * Replaces the manual ordering of albums in a collection with a new deduplicated order.
 */
export function reorderAlbumsInCustomCollection(collectionId, orderedAlbumIds = []) {
  const safeColId = String(collectionId || '').trim();
  const allCollections = getSavedCollectionsMap();
  const existing = allCollections[safeColId];
  if (!existing || existing.type === 'smart') {
    return { ok: false, collection: existing || null };
  }

  const validOrdered = normalizeCollectionAlbumIds(orderedAlbumIds);
  existing.albumIds.forEach((id) => {
    if (!validOrdered.includes(id)) {
      validOrdered.push(id);
    }
  });

  const updated = normalizeCustomCollectionRecord(safeColId, {
    ...existing,
    albumIds: validOrdered,
    updatedAt: new Date().toISOString()
  });

  allCollections[safeColId] = updated;
  const savedOk = writeSavedCollectionsMap(allCollections);

  return {
    ok: savedOk,
    collection: updated
  };
}
