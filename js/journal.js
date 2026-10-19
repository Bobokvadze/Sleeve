/**
 * SLEEVE - Listening Journal Engine & JSON Portability (Phase 8)
 * Pure functions for enriching journal entries with album metadata and ratings,
 * searching across titles/artists/notes/track notes/tags, filtering by mood tag
 * and rating tier, sorting, and validating/merging JSON exports and imports.
 */

import {
  CURATED_ALBUMS,
  getTierDetails,
  formatReleaseYear,
  getHighResArtwork,
  createFallbackCoverDataUri
} from './config.js';
import {
  getSavedJournalMap,
  getSavedRatingsMap,
  getAlbumCatalogCacheMap,
  normalizeJournalEntryRecord,
  commitMergedJournalMap
} from './storage.js';
import { buildLibraryEntry } from './library.js';

export const JOURNAL_EXPORT_FORMAT_ID = 'SLEEVE_JOURNAL_EXPORT';
export const JOURNAL_EXPORT_VERSION = 1;

export const JOURNAL_SORT_MODES = {
  UPDATED_DESC: 'updated-desc',
  CREATED_DESC: 'created-desc',
  TITLE_ASC: 'title-asc',
  ARTIST_ASC: 'artist-asc'
};

export const JOURNAL_RATING_FILTERS = {
  ALL: 'all',
  MASTERPIECE: 'masterpiece', // 9.0 - 10.0
  ESSENTIAL: 'essential',     // 7.5 - 8.9
  SOLID: 'solid',             // 6.0 - 7.4
  LOWER: 'lower',             // 1.0 - 5.9
  UNRATED: 'unrated'          // No album score
};

export const PRESET_MOOD_TAGS = [
  'Late Night',
  'Warm Analog',
  'Nocturnal',
  'Melancholic',
  'Euphoric',
  'Headphones',
  'Experimental',
  'Focus',
  'Road Trip',
  'Cathartic'
];

/**
 * Reconstructs a rich Journal View Entry by combining the stored journal record
 * with album metadata and the user's current rating from 'sleeve_ratings_v1'.
 */
export function buildEnrichedJournalEntry(
  collectionId,
  rawJournalEntry,
  ratingsMap = {},
  metadataMap = {},
  curatedList = CURATED_ALBUMS
) {
  const cleanEntry = normalizeJournalEntryRecord(collectionId, rawJournalEntry);
  if (!cleanEntry) return null;

  const key = String(cleanEntry.collectionId);
  const ratingRecord = ratingsMap && typeof ratingsMap === 'object' ? ratingsMap[key] : null;
  const libEntry = buildLibraryEntry(key, ratingRecord || {}, metadataMap, curatedList);

  const hasScore =
    libEntry.overallScore !== null && Number.isFinite(libEntry.overallScore);
  const tier = getTierDetails(libEntry.overallScore);

  const createdMs = Date.parse(cleanEntry.createdAt);
  const updatedMs = Date.parse(cleanEntry.updatedAt);

  return {
    collectionId: Number(key) || key,
    collectionKey: key,
    collectionName: libEntry.collectionName,
    artistName: libEntry.artistName,
    primaryGenreName: libEntry.primaryGenreName,
    releaseDate: libEntry.releaseDate,
    releaseYear: libEntry.releaseYear,
    artworkUrl100: libEntry.artworkUrl100,
    coverUrl: libEntry.coverUrl,
    fallbackCoverUrl: libEntry.fallbackCoverUrl,
    hasFullMetadata: libEntry.hasFullMetadata,
    overallScore: hasScore ? libEntry.overallScore : null,
    formattedScore: hasScore ? libEntry.formattedScore : null,
    tierLabel: hasScore ? tier.label : 'Unrated',
    tierColor: hasScore ? tier.color : 'var(--text-muted)',
    ratedTrackCount: libEntry.ratedTrackCount,
    totalTrackCount: libEntry.totalTrackCount,
    reviewText: cleanEntry.reviewText,
    moodTags: cleanEntry.moodTags,
    favoriteTracks: cleanEntry.favoriteTracks,
    trackNotes: cleanEntry.trackNotes,
    createdAt: cleanEntry.createdAt,
    updatedAt: cleanEntry.updatedAt,
    createdTimestampMs: Number.isFinite(createdMs) ? createdMs : 0,
    updatedTimestampMs: Number.isFinite(updatedMs) ? updatedMs : 0
  };
}

/**
 * Builds all enriched journal entries from the saved journal map.
 */
export function getEnrichedJournalEntries(
  journalMap = getSavedJournalMap(),
  ratingsMap = getSavedRatingsMap(),
  metadataMap = getAlbumCatalogCacheMap(),
  curatedList = CURATED_ALBUMS
) {
  if (!journalMap || typeof journalMap !== 'object' || Array.isArray(journalMap)) {
    return [];
  }

  const seenIds = new Set();
  const entries = [];

  Object.keys(journalMap).forEach((rawId) => {
    const key = String(rawId).trim();
    if (!key || seenIds.has(key)) return;

    const enriched = buildEnrichedJournalEntry(
      key,
      journalMap[rawId],
      ratingsMap,
      metadataMap,
      curatedList
    );
    if (enriched) {
      seenIds.add(key);
      entries.push(enriched);
    }
  });

  return entries;
}

/**
 * Collects all unique mood tags currently used across all journal entries,
 * sorted by frequency descending then alphabetically.
 */
export function collectAvailableMoodTags(entries = []) {
  const safeEntries = Array.isArray(entries) ? entries : [];
  const counts = new Map();

  safeEntries.forEach((entry) => {
    (entry.moodTags || []).forEach((tag) => {
      const key = String(tag).toLowerCase();
      if (!counts.has(key)) {
        counts.set(key, { tag, count: 0 });
      }
      counts.get(key).count += 1;
    });
  });

  return Array.from(counts.values()).sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.tag.localeCompare(b.tag, 'en', { sensitivity: 'base' });
  });
}

/**
 * Matches an entry against a rating tier filter.
 */
function matchesRatingFilter(entry, ratingFilter) {
  const mode = String(ratingFilter || JOURNAL_RATING_FILTERS.ALL).toLowerCase();
  if (mode === JOURNAL_RATING_FILTERS.ALL) return true;

  const hasScore = entry.overallScore !== null && Number.isFinite(entry.overallScore);
  if (mode === JOURNAL_RATING_FILTERS.UNRATED) {
    return !hasScore;
  }
  if (!hasScore) return false;

  const s = entry.overallScore;
  if (mode === JOURNAL_RATING_FILTERS.MASTERPIECE) return s >= 9.0 - 1e-7;
  if (mode === JOURNAL_RATING_FILTERS.ESSENTIAL) return s >= 7.5 - 1e-7 && s < 9.0 - 1e-7;
  if (mode === JOURNAL_RATING_FILTERS.SOLID) return s >= 6.0 - 1e-7 && s < 7.5 - 1e-7;
  if (mode === JOURNAL_RATING_FILTERS.LOWER) return s < 6.0 - 1e-7;

  return true;
}

/**
 * Filters journal entries by:
 * - Search query across album title, artist, personal review notes, track notes, favorite tracks, and mood tags
 * - Mood tag filter
 * - Rating tier filter
 */
export function filterJournalEntries(
  entries = [],
  {
    query = '',
    moodTag = '',
    ratingFilter = JOURNAL_RATING_FILTERS.ALL
  } = {}
) {
  const safeEntries = Array.isArray(entries) ? entries : [];
  const cleanQuery = String(query || '').trim().toLowerCase();
  const cleanMood = String(moodTag || '').trim().toLowerCase();

  return safeEntries.filter((entry) => {
    if (cleanMood) {
      const hasMood = (entry.moodTags || []).some(
        (t) => String(t).toLowerCase() === cleanMood
      );
      if (!hasMood) return false;
    }

    if (!matchesRatingFilter(entry, ratingFilter)) {
      return false;
    }

    if (cleanQuery) {
      const inTitle = String(entry.collectionName || '')
        .toLowerCase()
        .includes(cleanQuery);
      const inArtist = String(entry.artistName || '')
        .toLowerCase()
        .includes(cleanQuery);
      const inReview = String(entry.reviewText || '')
        .toLowerCase()
        .includes(cleanQuery);
      const inTags = (entry.moodTags || []).some((t) =>
        String(t).toLowerCase().includes(cleanQuery)
      );
      const inFavorites = (entry.favoriteTracks || []).some((f) =>
        String(f.trackName || '').toLowerCase().includes(cleanQuery)
      );
      const inTrackNotes = (entry.trackNotes || []).some(
        (tn) =>
          String(tn.trackName || '').toLowerCase().includes(cleanQuery) ||
          String(tn.note || '').toLowerCase().includes(cleanQuery)
      );

      if (
        !inTitle &&
        !inArtist &&
        !inReview &&
        !inTags &&
        !inFavorites &&
        !inTrackNotes
      ) {
        return false;
      }
    }

    return true;
  });
}

function compareTextAsc(a, b) {
  return String(a || '').localeCompare(String(b || ''), 'en', {
    sensitivity: 'base'
  });
}

function compareEntryIds(a, b) {
  const numA = Number(a.collectionId);
  const numB = Number(b.collectionId);
  if (Number.isFinite(numA) && Number.isFinite(numB) && numA !== numB) {
    return numA - numB;
  }
  return compareTextAsc(a.collectionKey, b.collectionKey);
}

/**
 * Sorts journal entries by:
 * - Recently updated (updated-desc)
 * - Recently created (created-desc)
 * - Album title A-Z (title-asc)
 * - Artist A-Z (artist-asc)
 */
export function sortJournalEntries(
  entries = [],
  sortBy = JOURNAL_SORT_MODES.UPDATED_DESC
) {
  const copy = Array.isArray(entries) ? [...entries] : [];
  const mode = String(sortBy || JOURNAL_SORT_MODES.UPDATED_DESC);

  copy.sort((a, b) => {
    if (mode === JOURNAL_SORT_MODES.UPDATED_DESC) {
      if (b.updatedTimestampMs !== a.updatedTimestampMs) {
        return b.updatedTimestampMs - a.updatedTimestampMs;
      }
      if (b.createdTimestampMs !== a.createdTimestampMs) {
        return b.createdTimestampMs - a.createdTimestampMs;
      }
      const titleCmp = compareTextAsc(a.collectionName, b.collectionName);
      if (titleCmp !== 0) return titleCmp;
      return compareEntryIds(a, b);
    }

    if (mode === JOURNAL_SORT_MODES.CREATED_DESC) {
      if (b.createdTimestampMs !== a.createdTimestampMs) {
        return b.createdTimestampMs - a.createdTimestampMs;
      }
      if (b.updatedTimestampMs !== a.updatedTimestampMs) {
        return b.updatedTimestampMs - a.updatedTimestampMs;
      }
      const titleCmp = compareTextAsc(a.collectionName, b.collectionName);
      if (titleCmp !== 0) return titleCmp;
      return compareEntryIds(a, b);
    }

    if (mode === JOURNAL_SORT_MODES.TITLE_ASC) {
      const titleCmp = compareTextAsc(a.collectionName, b.collectionName);
      if (titleCmp !== 0) return titleCmp;
      const artistCmp = compareTextAsc(a.artistName, b.artistName);
      if (artistCmp !== 0) return artistCmp;
      return compareEntryIds(a, b);
    }

    if (mode === JOURNAL_SORT_MODES.ARTIST_ASC) {
      const artistCmp = compareTextAsc(a.artistName, b.artistName);
      if (artistCmp !== 0) return artistCmp;
      const titleCmp = compareTextAsc(a.collectionName, b.collectionName);
      if (titleCmp !== 0) return titleCmp;
      return compareEntryIds(a, b);
    }

    return compareEntryIds(a, b);
  });

  return copy;
}

/**
 * Master query pipeline for the Listening Journal view.
 */
export function queryJournal(
  journalMap = getSavedJournalMap(),
  ratingsMap = getSavedRatingsMap(),
  metadataMap = getAlbumCatalogCacheMap(),
  {
    query = '',
    moodTag = '',
    ratingFilter = JOURNAL_RATING_FILTERS.ALL,
    sortBy = JOURNAL_SORT_MODES.UPDATED_DESC
  } = {},
  curatedList = CURATED_ALBUMS
) {
  const allEntries = getEnrichedJournalEntries(
    journalMap,
    ratingsMap,
    metadataMap,
    curatedList
  );
  const availableMoodTags = collectAvailableMoodTags(allEntries);
  const filtered = filterJournalEntries(allEntries, {
    query,
    moodTag,
    ratingFilter
  });
  const visibleEntries = sortJournalEntries(filtered, sortBy);

  let totalTrackNotesCount = 0;
  let totalFavoriteTracksCount = 0;
  allEntries.forEach((e) => {
    totalTrackNotesCount += (e.trackNotes || []).length;
    totalFavoriteTracksCount += (e.favoriteTracks || []).length;
  });

  return {
    allEntries,
    visibleEntries,
    availableMoodTags,
    summary: {
      totalEntries: allEntries.length,
      uniqueMoodTagsCount: availableMoodTags.length,
      totalTrackNotesCount,
      totalFavoriteTracksCount
    }
  };
}

// =========================================================================
// JOURNAL JSON EXPORT & IMPORT PORTABILITY
// =========================================================================

export function buildJournalExportFilename(dateObj = new Date()) {
  const safeDate =
    dateObj instanceof Date && !Number.isNaN(dateObj.getTime()) ? dateObj : new Date();
  const yyyy = String(safeDate.getFullYear());
  const mm = String(safeDate.getMonth() + 1).padStart(2, '0');
  const dd = String(safeDate.getDate()).padStart(2, '0');
  return 'SLEEVE-Journal-Backup-' + yyyy + '-' + mm + '-' + dd + '.json';
}

export function buildJournalExportPayload(
  journalMap = getSavedJournalMap(),
  metadataMap = getAlbumCatalogCacheMap(),
  curatedList = CURATED_ALBUMS
) {
  const safeJournal =
    journalMap && typeof journalMap === 'object' && !Array.isArray(journalMap)
      ? journalMap
      : {};
  const safeMeta =
    metadataMap && typeof metadataMap === 'object' && !Array.isArray(metadataMap)
      ? metadataMap
      : {};

  const exportedJournalMap = {};
  const exportedMetadataMap = {};
  let totalTrackNotes = 0;

  Object.keys(safeJournal).forEach((rawId) => {
    const cleanId = String(rawId).trim();
    if (!cleanId) return;

    const normalized = normalizeJournalEntryRecord(cleanId, safeJournal[rawId]);
    if (!normalized) return;

    exportedJournalMap[cleanId] = normalized;
    totalTrackNotes += normalized.trackNotes.length;

    const cachedMeta = safeMeta[cleanId];
    const curatedMeta = Array.isArray(curatedList)
      ? curatedList.find((c) => String(c.collectionId) === cleanId)
      : null;
    const sourceMeta = cachedMeta || curatedMeta;

    if (sourceMeta) {
      exportedMetadataMap[cleanId] = {
        collectionId: Number(cleanId) || cleanId,
        collectionName: String(sourceMeta.collectionName || 'Untitled Album').trim(),
        artistName: String(sourceMeta.artistName || 'Unknown Artist').trim(),
        primaryGenreName: String(sourceMeta.primaryGenreName || 'Music').trim(),
        releaseDate: String(sourceMeta.releaseDate || ''),
        trackCount: Math.max(0, Number(sourceMeta.trackCount) || 0),
        artworkUrl100: String(sourceMeta.artworkUrl100 || '')
      };
    }
  });

  return {
    format: JOURNAL_EXPORT_FORMAT_ID,
    version: JOURNAL_EXPORT_VERSION,
    app: 'SLEEVE',
    exportedAt: new Date().toISOString(),
    summary: {
      entryCount: Object.keys(exportedJournalMap).length,
      trackNoteCount: totalTrackNotes
    },
    journalMap: exportedJournalMap,
    albumMetadataMap: exportedMetadataMap
  };
}

export function downloadJournalExportJson(
  journalMap = getSavedJournalMap(),
  metadataMap = getAlbumCatalogCacheMap()
) {
  if (typeof document === 'undefined') {
    throw new Error('Browser document environment is required to download JSON.');
  }

  const payload = buildJournalExportPayload(journalMap, metadataMap);
  const jsonText = JSON.stringify(payload, null, 2);
  const filename = buildJournalExportFilename(new Date());

  const blob = new Blob([jsonText], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 4000);

  return {
    filename,
    entryCount: payload.summary.entryCount,
    trackNoteCount: payload.summary.trackNoteCount
  };
}

function areJournalEntriesEquivalent(a, b) {
  if (!a || !b) return false;
  if (String(a.reviewText || '') !== String(b.reviewText || '')) return false;
  if (JSON.stringify(a.moodTags || []) !== JSON.stringify(b.moodTags || [])) return false;
  if (
    JSON.stringify(a.favoriteTracks || []) !==
    JSON.stringify(b.favoriteTracks || [])
  ) {
    return false;
  }
  if (JSON.stringify(a.trackNotes || []) !== JSON.stringify(b.trackNotes || [])) {
    return false;
  }
  return true;
}

/**
 * Validates an imported Journal JSON string and builds a preview of additions,
 * updates/conflicts, unchanged entries, and preserved local entries.
 * Never touches or accepts rating overrides.
 */
export function validateAndPreviewJournalImport(
  rawJsonText,
  currentJournalMap = getSavedJournalMap(),
  currentMetadataMap = getAlbumCatalogCacheMap(),
  curatedList = CURATED_ALBUMS
) {
  if (typeof rawJsonText !== 'string' || !rawJsonText.trim()) {
    return {
      ok: false,
      error: 'The selected file is empty. Please choose a valid SLEEVE Journal JSON file.'
    };
  }

  let parsed = null;
  try {
    parsed = JSON.parse(rawJsonText);
  } catch {
    return {
      ok: false,
      error: 'Invalid JSON file format. The file could not be parsed as JSON.'
    };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      ok: false,
      error: 'Unsupported file structure. Expected a JSON object at the root.'
    };
  }

  if (parsed.format !== undefined && parsed.format !== JOURNAL_EXPORT_FORMAT_ID) {
    return {
      ok: false,
      error:
        'Unsupported export format "' +
        String(parsed.format) +
        '". Expected "' +
        JOURNAL_EXPORT_FORMAT_ID +
        '".'
    };
  }

  if (
    parsed.version !== undefined &&
    Number(parsed.version) !== JOURNAL_EXPORT_VERSION
  ) {
    return {
      ok: false,
      error:
        'Unsupported journal export version (' +
        String(parsed.version) +
        '). Supported version is ' +
        String(JOURNAL_EXPORT_VERSION) +
        '.'
    };
  }

  let rawEntriesList = [];
  const rawMetadataMap =
    parsed.albumMetadataMap &&
    typeof parsed.albumMetadataMap === 'object' &&
    !Array.isArray(parsed.albumMetadataMap)
      ? parsed.albumMetadataMap
      : {};

  if (
    parsed.journalMap &&
    typeof parsed.journalMap === 'object' &&
    !Array.isArray(parsed.journalMap)
  ) {
    rawEntriesList = Object.keys(parsed.journalMap).map((key) => ({
      key,
      entry: parsed.journalMap[key]
    }));
  } else if (Array.isArray(parsed.entries)) {
    rawEntriesList = parsed.entries.map((item) => ({
      key: item?.collectionId,
      entry: item
    }));
  } else {
    return {
      ok: false,
      error:
        'Missing required "journalMap" field. Please select a valid SLEEVE Journal export file.'
    };
  }

  if (rawEntriesList.length === 0) {
    return {
      ok: false,
      error: 'The import file contains zero journal entries.'
    };
  }

  const deduplicatedById = new Map();
  let duplicateInputCount = 0;

  for (let i = 0; i < rawEntriesList.length; i += 1) {
    const item = rawEntriesList[i];
    const resolvedId = String(item.entry?.collectionId ?? item.key ?? '').trim();
    const isValidId =
      resolvedId.length >= 1 &&
      resolvedId.length <= 64 &&
      !/[^a-zA-Z0-9_-]/.test(resolvedId);

    if (!isValidId) {
      return {
        ok: false,
        error: 'Invalid or missing album collectionId in journal import.'
      };
    }

    if (!item.entry || typeof item.entry !== 'object' || Array.isArray(item.entry)) {
      return {
        ok: false,
        error: 'Journal entry for album ' + resolvedId + ' is not a valid object.'
      };
    }

    if (
      item.entry.reviewText !== undefined &&
      typeof item.entry.reviewText !== 'string'
    ) {
      return {
        ok: false,
        error: 'Journal entry for album ' + resolvedId + ' has an invalid reviewText field.'
      };
    }

    if (
      item.entry.moodTags !== undefined &&
      !Array.isArray(item.entry.moodTags)
    ) {
      return {
        ok: false,
        error: 'Journal entry for album ' + resolvedId + ' has a non-array moodTags field.'
      };
    }

    const normalizedEntry = normalizeJournalEntryRecord(resolvedId, item.entry);
    if (!normalizedEntry) {
      return {
        ok: false,
        error:
          'Journal entry for album ' +
          resolvedId +
          ' is empty (must contain review text, mood tags, favorite tracks, or track notes).'
      };
    }

    const candidateMeta = rawMetadataMap[resolvedId] || item.entry.metadata || null;
    let cleanMeta = null;
    if (candidateMeta && typeof candidateMeta === 'object' && !Array.isArray(candidateMeta)) {
      const numId = Number(candidateMeta.collectionId || resolvedId);
      if (numId > 0) {
        cleanMeta = {
          collectionId: numId,
          collectionName: String(candidateMeta.collectionName || 'Untitled Album').trim(),
          artistName: String(candidateMeta.artistName || 'Unknown Artist').trim(),
          primaryGenreName: String(candidateMeta.primaryGenreName || 'Music').trim(),
          releaseDate: String(candidateMeta.releaseDate || ''),
          trackCount: Math.max(0, Number(candidateMeta.trackCount) || 0),
          artworkUrl100: String(candidateMeta.artworkUrl100 || '')
        };
      }
    }

    if (deduplicatedById.has(resolvedId)) {
      duplicateInputCount += 1;
      const prev = deduplicatedById.get(resolvedId);
      const prevTime = Date.parse(prev.entry.updatedAt || '') || 0;
      const nextTime = Date.parse(normalizedEntry.updatedAt || '') || 0;
      if (nextTime >= prevTime) {
        deduplicatedById.set(resolvedId, {
          collectionId: resolvedId,
          entry: normalizedEntry,
          metadata: cleanMeta
        });
      }
    } else {
      deduplicatedById.set(resolvedId, {
        collectionId: resolvedId,
        entry: normalizedEntry,
        metadata: cleanMeta
      });
    }
  }

  const safeCurrentJournal =
    currentJournalMap && typeof currentJournalMap === 'object' ? currentJournalMap : {};
  const safeCurrentMeta =
    currentMetadataMap && typeof currentMetadataMap === 'object' ? currentMetadataMap : {};

  const entriesToAdd = [];
  const entriesToUpdate = [];
  const entriesUnchanged = [];

  deduplicatedById.forEach((val, id) => {
    const existingEntry = safeCurrentJournal[id];
    const resolvedMeta =
      val.metadata ||
      safeCurrentMeta[id] ||
      (Array.isArray(curatedList)
        ? curatedList.find((c) => String(c.collectionId) === id)
        : null);

    const previewItem = {
      collectionId: id,
      collectionName: resolvedMeta?.collectionName || 'Album #' + id,
      artistName: resolvedMeta?.artistName || 'Unknown Artist',
      tagCount: val.entry.moodTags.length,
      trackNoteCount: val.entry.trackNotes.length,
      entry: val.entry,
      metadata: val.metadata
    };

    if (!existingEntry) {
      entriesToAdd.push(previewItem);
    } else if (areJournalEntriesEquivalent(existingEntry, val.entry)) {
      entriesUnchanged.push(previewItem);
    } else {
      entriesToUpdate.push(previewItem);
    }
  });

  const untouchedExistingCount = Object.keys(safeCurrentJournal).filter(
    (id) => !deduplicatedById.has(String(id))
  ).length;

  return {
    ok: true,
    exportedAt: typeof parsed.exportedAt === 'string' ? parsed.exportedAt : null,
    totalValidInFile: deduplicatedById.size,
    duplicateInputCount,
    entriesToAdd,
    entriesToUpdate,
    entriesUnchanged,
    untouchedExistingCount,
    hasConflicts: entriesToUpdate.length > 0
  };
}

/**
 * Merges a validated journal import preview plan with existing journal entries.
 * Never modifies album ratings ('sleeve_ratings_v1') and never deletes existing entries.
 */
export function applyValidatedJournalImport(
  previewPlan,
  { overwriteExisting = false } = {}
) {
  if (!previewPlan || !previewPlan.ok) {
    throw new Error('Cannot apply an invalid journal import preview plan.');
  }

  const currentJournal = getSavedJournalMap();
  const nextJournalMap = { ...(currentJournal || {}) };
  const nextMetadataMap = {};

  let addedCount = 0;
  let updatedCount = 0;
  let skippedConflictCount = 0;

  previewPlan.entriesToAdd.forEach((item) => {
    nextJournalMap[item.collectionId] = item.entry;
    if (item.metadata) {
      nextMetadataMap[item.collectionId] = item.metadata;
    }
    addedCount += 1;
  });

  previewPlan.entriesToUpdate.forEach((item) => {
    if (overwriteExisting) {
      // Preserve original createdAt if earlier than imported createdAt
      const existing = nextJournalMap[item.collectionId];
      nextJournalMap[item.collectionId] = {
        ...item.entry,
        createdAt: existing?.createdAt || item.entry.createdAt
      };
      if (item.metadata) {
        nextMetadataMap[item.collectionId] = item.metadata;
      }
      updatedCount += 1;
    } else {
      if (item.metadata) {
        nextMetadataMap[item.collectionId] = item.metadata;
      }
      skippedConflictCount += 1;
    }
  });

  previewPlan.entriesUnchanged.forEach((item) => {
    if (item.metadata) {
      nextMetadataMap[item.collectionId] = item.metadata;
    }
  });

  const commitRes = commitMergedJournalMap(nextJournalMap, nextMetadataMap);

  return {
    ...commitRes,
    addedCount,
    updatedCount,
    skippedConflictCount,
    unchangedCount: previewPlan.entriesUnchanged.length,
    preservedExistingCount: previewPlan.untouchedExistingCount
  };
}