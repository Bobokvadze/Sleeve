/**
 * SLEEVE - Library JSON Export, Validation, Preview & Safe Merge Engine (Phases 6 & 10A)
 * Pure functions + browser download helper for exporting and importing the user's
 * personal ratings, album metadata, and custom/smart collections without overwriting
 * existing data by default. Maintains full backward compatibility with v1 exports.
 */

import { CURATED_ALBUMS } from './config.js';
import {
  isValidTrackRating,
  parseTrackRating,
  normalizeTrackState,
  calculateMetricsFromTrackRatingsMap
} from './calculator.js';
import {
  getSavedRatingsMap,
  getAlbumCatalogCacheMap,
  getSavedCollectionsMap,
  normalizeVerdictText,
  normalizeCustomCollectionRecord,
  hasActiveSmartRules,
  commitMergedLibraryMaps
} from './storage.js';

export const EXPORT_FORMAT_ID = 'SLEEVE_LIBRARY_EXPORT';
export const EXPORT_FORMAT_VERSION = 1;

/**
 * Generates a predictable date-stamped filename for the exported JSON backup.
 */
export function buildExportFilename(dateObj = new Date()) {
  const safeDate =
    dateObj instanceof Date && !Number.isNaN(dateObj.getTime()) ? dateObj : new Date();
  const yyyy = String(safeDate.getFullYear());
  const mm = String(safeDate.getMonth() + 1).padStart(2, '0');
  const dd = String(safeDate.getDate()).padStart(2, '0');
  return 'SLEEVE-Library-Backup-' + yyyy + '-' + mm + '-' + dd + '.json';
}

/**
 * Builds the complete export object containing user ratings, relevant album metadata,
 * and custom/smart collections.
 */
export function buildLibraryExportPayload(
  ratingsMap = getSavedRatingsMap(),
  metadataMap = getAlbumCatalogCacheMap(),
  curatedList = CURATED_ALBUMS,
  collectionsMap = getSavedCollectionsMap()
) {
  const safeRatings =
    ratingsMap && typeof ratingsMap === 'object' && !Array.isArray(ratingsMap)
      ? ratingsMap
      : {};
  const safeMeta =
    metadataMap && typeof metadataMap === 'object' && !Array.isArray(metadataMap)
      ? metadataMap
      : {};
  const safeCollections =
    collectionsMap && typeof collectionsMap === 'object' && !Array.isArray(collectionsMap)
      ? collectionsMap
      : {};

  const exportedRatingsMap = {};
  const exportedMetadataMap = {};
  const exportedCollectionsMap = {};
  let totalRatedTracks = 0;

  const ensureMetadataExported = (cleanId) => {
    if (exportedMetadataMap[cleanId]) return;
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
  };

  Object.keys(safeRatings).forEach((rawId) => {
    const cleanId = String(rawId).trim();
    if (!cleanId) return;

    const record = safeRatings[rawId];
    if (!record || typeof record !== 'object' || Array.isArray(record)) return;

    const rawTrackMap =
      record.trackRatings &&
      typeof record.trackRatings === 'object' &&
      !Array.isArray(record.trackRatings)
        ? record.trackRatings
        : {};

    const cleanTrackRatings = {};
    Object.keys(rawTrackMap).forEach((tKey) => {
      const st = normalizeTrackState(rawTrackMap[tKey]);
      if (st.rating !== null || st.interlude || !st.included) {
        cleanTrackRatings[tKey] = st;
      }
    });

    const verdict = normalizeVerdictText(record.verdict);
    const metrics = calculateMetricsFromTrackRatingsMap(cleanTrackRatings, 0);

    if (
      Object.keys(cleanTrackRatings).length === 0 &&
      !verdict &&
      (record.overallScore === null || record.overallScore === undefined)
    ) {
      return;
    }

    totalRatedTracks += metrics.ratedCount;

    exportedRatingsMap[cleanId] = {
      collectionId: cleanId,
      updatedAt:
        typeof record.updatedAt === 'string' && record.updatedAt
          ? record.updatedAt
          : new Date().toISOString(),
      overallScore: metrics.overallScore ?? record.overallScore ?? null,
      ratedCount: metrics.ratedCount,
      includedCount: record.includedCount ?? metrics.includedCount,
      scoredCount: metrics.scoredCount,
      verdict,
      hiddenFromLibrary: Boolean(record.hiddenFromLibrary),
      trackRatings: cleanTrackRatings
    };

    ensureMetadataExported(cleanId);
  });

  Object.keys(safeCollections).forEach((colId) => {
    const normCol = normalizeCustomCollectionRecord(colId, safeCollections[colId]);
    if (!normCol) return;
    exportedCollectionsMap[normCol.id] = normCol;
    (normCol.albumIds || []).forEach((albId) => {
      ensureMetadataExported(String(albId));
    });
  });

  const albumCount = Object.keys(exportedRatingsMap).length;
  const collectionCount = Object.keys(exportedCollectionsMap).length;

  return {
    format: EXPORT_FORMAT_ID,
    version: EXPORT_FORMAT_VERSION,
    app: 'SLEEVE',
    exportedAt: new Date().toISOString(),
    summary: {
      albumCount,
      ratedTrackCount: totalRatedTracks,
      collectionCount
    },
    ratingsMap: exportedRatingsMap,
    albumMetadataMap: exportedMetadataMap,
    collectionsMap: exportedCollectionsMap
  };
}

/**
 * Serializes the user's library into a formatted JSON string.
 */
export function serializeLibraryExportJson(
  ratingsMap = getSavedRatingsMap(),
  metadataMap = getAlbumCatalogCacheMap(),
  curatedList = CURATED_ALBUMS,
  collectionsMap = getSavedCollectionsMap()
) {
  const payload = buildLibraryExportPayload(
    ratingsMap,
    metadataMap,
    curatedList,
    collectionsMap
  );
  return JSON.stringify(payload, null, 2);
}

/**
 * Triggers a browser file download of the exported JSON library.
 */
export function downloadLibraryExportJson(
  ratingsMap = getSavedRatingsMap(),
  metadataMap = getAlbumCatalogCacheMap(),
  collectionsMap = getSavedCollectionsMap()
) {
  if (typeof document === 'undefined') {
    throw new Error('Browser document environment is required to download JSON.');
  }

  const payload = buildLibraryExportPayload(
    ratingsMap,
    metadataMap,
    CURATED_ALBUMS,
    collectionsMap
  );
  const jsonText = JSON.stringify(payload, null, 2);
  const filename = buildExportFilename(new Date());

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
    albumCount: payload.summary.albumCount,
    ratedTrackCount: payload.summary.ratedTrackCount,
    collectionCount: payload.summary.collectionCount
  };
}

/**
 * Deeply compares two normalized album rating records to see if an import would change anything.
 */
function areAlbumRatingRecordsEquivalent(recA, recB) {
  if (!recA || !recB) return false;
  if (Boolean(recA.hiddenFromLibrary) !== Boolean(recB.hiddenFromLibrary)) return false;
  if (normalizeVerdictText(recA.verdict) !== normalizeVerdictText(recB.verdict)) return false;

  const tracksA = recA.trackRatings || {};
  const tracksB = recB.trackRatings || {};
  const keysA = Object.keys(tracksA);
  const keysB = Object.keys(tracksB);

  if (keysA.length !== keysB.length) return false;

  for (let i = 0; i < keysA.length; i += 1) {
    const k = keysA[i];
    if (!Object.prototype.hasOwnProperty.call(tracksB, k)) return false;
    const stA = normalizeTrackState(tracksA[k]);
    const stB = normalizeTrackState(tracksB[k]);
    if (stA.rating !== stB.rating) return false;
    if (stA.interlude !== stB.interlude) return false;
    if (stA.included !== stB.included) return false;
  }

  return true;
}

/**
 * Deeply compares two normalized custom/smart collection records.
 */
function areCollectionRecordsEquivalent(colA, colB) {
  if (!colA || !colB) return false;
  if (String(colA.title || '') !== String(colB.title || '')) return false;
  if (String(colA.description || '') !== String(colB.description || '')) return false;
  if (String(colA.type || 'manual') !== String(colB.type || 'manual')) return false;
  if (String(colA.theme || 'obsidian') !== String(colB.theme || 'obsidian')) return false;
  if (JSON.stringify(colA.albumIds || []) !== JSON.stringify(colB.albumIds || [])) {
    return false;
  }
  if (JSON.stringify(colA.smartRules || {}) !== JSON.stringify(colB.smartRules || {})) {
    return false;
  }
  return true;
}

/**
 * Validates a single raw album rating record from an import file.
 */
function validateImportedAlbumEntry(rawKey, rawRecord, rawMetadataMap = {}) {
  const resolvedId = String(rawRecord?.collectionId ?? rawKey ?? '').trim();
  const isValidId =
    resolvedId.length >= 1 &&
    resolvedId.length <= 64 &&
    !/[^a-zA-Z0-9_-]/.test(resolvedId);
  if (!isValidId) {
    return { valid: false, reason: 'Invalid or missing album collectionId.' };
  }

  if (!rawRecord || typeof rawRecord !== 'object' || Array.isArray(rawRecord)) {
    return { valid: false, reason: 'Album record for ID ' + resolvedId + ' is not an object.' };
  }

  if (
    rawRecord.trackRatings === undefined ||
    rawRecord.trackRatings === null ||
    typeof rawRecord.trackRatings !== 'object' ||
    Array.isArray(rawRecord.trackRatings)
  ) {
    return {
      valid: false,
      reason: 'Album record for ID ' + resolvedId + ' is missing a valid trackRatings object.'
    };
  }

  const cleanTrackRatings = {};
  const trackKeys = Object.keys(rawRecord.trackRatings);

  for (let i = 0; i < trackKeys.length; i += 1) {
    const tKey = String(trackKeys[i]).trim();
    if (!tKey) continue;

    const rawTrackState = rawRecord.trackRatings[tKey];
    if (!rawTrackState || typeof rawTrackState !== 'object' || Array.isArray(rawTrackState)) {
      return {
        valid: false,
        reason: 'Track "' + tKey + '" on album ' + resolvedId + ' is malformed.'
      };
    }

    if (
      rawTrackState.rating !== null &&
      rawTrackState.rating !== undefined &&
      rawTrackState.rating !== ''
    ) {
      if (!isValidTrackRating(rawTrackState.rating)) {
        return {
          valid: false,
          reason:
            'Track "' +
            tKey +
            '" on album ' +
            resolvedId +
            ' has an invalid rating (' +
            String(rawTrackState.rating) +
            '). Ratings must be 1.0 to 10.0 in 0.5 increments.'
        };
      }
    }

    cleanTrackRatings[tKey] = {
      rating: parseTrackRating(rawTrackState.rating),
      interlude: Boolean(rawTrackState.interlude),
      included: rawTrackState.included === undefined ? true : Boolean(rawTrackState.included)
    };
  }

  const verdict = normalizeVerdictText(rawRecord.verdict);
  const metrics = calculateMetricsFromTrackRatingsMap(cleanTrackRatings, 0);

  if (metrics.ratedCount === 0 && !verdict) {
    return {
      valid: false,
      reason: 'Album ' + resolvedId + ' has no rated tracks or verdict.'
    };
  }

  const candidateMeta =
    (rawMetadataMap && typeof rawMetadataMap === 'object' ? rawMetadataMap[resolvedId] : null) ||
    rawRecord.metadata ||
    null;

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

  const normalizedRecord = {
    collectionId: resolvedId,
    updatedAt:
      typeof rawRecord.updatedAt === 'string' && !Number.isNaN(Date.parse(rawRecord.updatedAt))
        ? rawRecord.updatedAt
        : new Date().toISOString(),
    overallScore: metrics.overallScore,
    ratedCount: metrics.ratedCount,
    includedCount:
      Number.isFinite(Number(rawRecord.includedCount)) && Number(rawRecord.includedCount) > 0
        ? Number(rawRecord.includedCount)
        : metrics.includedCount,
    scoredCount: metrics.scoredCount,
    verdict,
    hiddenFromLibrary: Boolean(rawRecord.hiddenFromLibrary),
    trackRatings: cleanTrackRatings
  };

  return {
    valid: true,
    collectionId: resolvedId,
    record: normalizedRecord,
    metadata: cleanMeta
  };
}

/**
 * Validates an imported JSON string and builds a detailed preview of album and
 * collection changes before modifying localStorage.
 */
export function validateAndPreviewLibraryImport(
  rawJsonText,
  currentRatingsMap = getSavedRatingsMap(),
  currentMetadataMap = getAlbumCatalogCacheMap(),
  curatedList = CURATED_ALBUMS,
  currentCollectionsMap = getSavedCollectionsMap()
) {
  if (typeof rawJsonText !== 'string' || !rawJsonText.trim()) {
    return {
      ok: false,
      error: 'The selected file is empty. Please choose a valid SLEEVE JSON backup file.'
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

  if (parsed.format !== undefined && parsed.format !== EXPORT_FORMAT_ID) {
    return {
      ok: false,
      error:
        'Unsupported export format "' +
        String(parsed.format) +
        '". Expected "' +
        EXPORT_FORMAT_ID +
        '".'
    };
  }

  if (
    parsed.version !== undefined &&
    Number(parsed.version) !== EXPORT_FORMAT_VERSION
  ) {
    return {
      ok: false,
      error:
        'Unsupported export version (' +
        String(parsed.version) +
        '). This version of SLEEVE supports version ' +
        String(EXPORT_FORMAT_VERSION) +
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
    parsed.ratingsMap &&
    typeof parsed.ratingsMap === 'object' &&
    !Array.isArray(parsed.ratingsMap)
  ) {
    rawEntriesList = Object.keys(parsed.ratingsMap).map((key) => ({
      key,
      record: parsed.ratingsMap[key]
    }));
  } else if (Array.isArray(parsed.albums)) {
    rawEntriesList = parsed.albums.map((item) => ({
      key: item?.collectionId,
      record: item
    }));
  } else {
    return {
      ok: false,
      error:
        'Missing required "ratingsMap" field. Make sure you selected a SLEEVE Library export file.'
    };
  }

  // Validate optional collectionsMap if present in the import file
  const hasCollectionsField =
    parsed.collectionsMap !== undefined && parsed.collectionsMap !== null;
  if (
    hasCollectionsField &&
    (typeof parsed.collectionsMap !== 'object' || Array.isArray(parsed.collectionsMap))
  ) {
    return {
      ok: false,
      error: 'Invalid "collectionsMap" field in import file. Expected an object map.'
    };
  }

  const rawCollectionsObj = hasCollectionsField ? parsed.collectionsMap : {};
  const rawCollectionKeys = Object.keys(rawCollectionsObj);

  if (rawEntriesList.length === 0 && rawCollectionKeys.length === 0) {
    return {
      ok: false,
      error: 'The import file contains zero album records and zero collections.'
    };
  }

  const deduplicatedById = new Map();
  let duplicateInputCount = 0;

  for (let i = 0; i < rawEntriesList.length; i += 1) {
    const item = rawEntriesList[i];
    const validation = validateImportedAlbumEntry(
      item.key,
      item.record,
      rawMetadataMap
    );

    if (!validation.valid) {
      return {
        ok: false,
        error: validation.reason
      };
    }

    const id = validation.collectionId;
    if (deduplicatedById.has(id)) {
      duplicateInputCount += 1;
      const existing = deduplicatedById.get(id);
      const timeExisting = Date.parse(existing.record.updatedAt || '') || 0;
      const timeNew = Date.parse(validation.record.updatedAt || '') || 0;
      if (timeNew >= timeExisting) {
        deduplicatedById.set(id, validation);
      }
    } else {
      deduplicatedById.set(id, validation);
    }
  }

  // Validate and deduplicate collections if present
  const deduplicatedCollectionsById = new Map();
  for (let i = 0; i < rawCollectionKeys.length; i += 1) {
    const cKey = rawCollectionKeys[i];
    const rawCol = rawCollectionsObj[cKey];
    const normCol = normalizeCustomCollectionRecord(cKey, rawCol);
    if (!normCol) {
      return {
        ok: false,
        error: 'Collection entry "' + String(cKey) + '" is missing a valid id or title.'
      };
    }
    if (normCol.type === 'smart' && !hasActiveSmartRules(normCol.smartRules)) {
      return {
        ok: false,
        error:
          'Smart collection "' +
          normCol.title +
          '" in import file has no active rules.'
      };
    }
    deduplicatedCollectionsById.set(normCol.id, normCol);
  }

  const safeCurrentRatings =
    currentRatingsMap && typeof currentRatingsMap === 'object' ? currentRatingsMap : {};
  const safeCurrentMeta =
    currentMetadataMap && typeof currentMetadataMap === 'object' ? currentMetadataMap : {};
  const safeCurrentCollections =
    currentCollectionsMap && typeof currentCollectionsMap === 'object'
      ? currentCollectionsMap
      : {};

  const combinedMetaForPreview = { ...safeCurrentMeta };
  Object.keys(rawMetadataMap).forEach((mId) => {
    const candidate = rawMetadataMap[mId];
    if (candidate && typeof candidate === 'object') {
      combinedMetaForPreview[String(mId)] = candidate;
    }
  });
  deduplicatedById.forEach((val, id) => {
    if (val.metadata) {
      combinedMetaForPreview[id] = val.metadata;
    }
  });

  const albumsToAdd = [];
  const albumsToUpdate = [];
  const albumsUnchanged = [];

  deduplicatedById.forEach((val, id) => {
    const existingRecord = safeCurrentRatings[id];
    const resolvedMeta =
      combinedMetaForPreview[id] ||
      (Array.isArray(curatedList)
        ? curatedList.find((c) => String(c.collectionId) === id)
        : null);

    const summaryItem = {
      collectionId: id,
      collectionName: resolvedMeta?.collectionName || 'Album #' + id,
      artistName: resolvedMeta?.artistName || 'Unknown Artist',
      newScore:
        val.record.overallScore !== null
          ? Number(val.record.overallScore).toFixed(1)
          : '--.-',
      previousScore:
        existingRecord &&
        existingRecord.overallScore !== null &&
        existingRecord.overallScore !== undefined
          ? Number(existingRecord.overallScore).toFixed(1)
          : '--.-',
      newRatedCount: val.record.ratedCount,
      previousRatedCount: existingRecord ? Number(existingRecord.ratedCount) || 0 : 0,
      record: val.record,
      metadata: val.metadata
    };

    if (!existingRecord) {
      albumsToAdd.push(summaryItem);
    } else if (areAlbumRatingRecordsEquivalent(existingRecord, val.record)) {
      albumsUnchanged.push(summaryItem);
    } else {
      albumsToUpdate.push(summaryItem);
    }
  });

  const untouchedExistingCount = Object.keys(safeCurrentRatings).filter(
    (id) => !deduplicatedById.has(String(id))
  ).length;

  const collectionsToAdd = [];
  const collectionsToUpdate = [];
  const collectionsUnchanged = [];

  deduplicatedCollectionsById.forEach((normCol, colId) => {
    const existingCol = safeCurrentCollections[colId]
      ? normalizeCustomCollectionRecord(colId, safeCurrentCollections[colId])
      : null;

    const colSummaryItem = {
      id: normCol.id,
      title: normCol.title,
      type: normCol.type,
      albumCount: normCol.albumIds.length,
      collection: normCol
    };

    if (!existingCol) {
      collectionsToAdd.push(colSummaryItem);
    } else if (areCollectionRecordsEquivalent(existingCol, normCol)) {
      collectionsUnchanged.push(colSummaryItem);
    } else {
      collectionsToUpdate.push(colSummaryItem);
    }
  });

  const untouchedCollectionsCount = Object.keys(safeCurrentCollections).filter(
    (colId) => !deduplicatedCollectionsById.has(String(colId))
  ).length;

  const hasAlbumConflicts = albumsToUpdate.length > 0;
  const hasCollectionConflicts = collectionsToUpdate.length > 0;

  return {
    ok: true,
    exportedAt: typeof parsed.exportedAt === 'string' ? parsed.exportedAt : null,
    totalValidInFile: deduplicatedById.size,
    duplicateInputCount,
    albumsToAdd,
    albumsToUpdate,
    albumsUnchanged,
    untouchedExistingCount,
    collectionsToAdd,
    collectionsToUpdate,
    collectionsUnchanged,
    untouchedCollectionsCount,
    extraMetadataMap: rawMetadataMap,
    hasAlbumConflicts,
    hasCollectionConflicts,
    hasConflicts: hasAlbumConflicts || hasCollectionConflicts
  };
}

/**
 * Merges a validated import preview plan with existing ratings, metadata, and collections.
 * Never deletes existing albums or collections not present in the import file.
 * When overwriteExisting is false, only new albums and new collections are added.
 */
export function buildMergedLibraryState(
  previewPlan,
  currentRatingsMap = getSavedRatingsMap(),
  currentMetadataMap = getAlbumCatalogCacheMap(),
  { overwriteExisting = true } = {},
  currentCollectionsMap = getSavedCollectionsMap()
) {
  if (!previewPlan || !previewPlan.ok) {
    throw new Error('Cannot merge an invalid import preview plan.');
  }

  const nextRatingsMap = { ...(currentRatingsMap || {}) };
  const nextMetadataMap = { ...(currentMetadataMap || {}) };
  const nextCollectionsMap = { ...(currentCollectionsMap || {}) };

  if (previewPlan.extraMetadataMap && typeof previewPlan.extraMetadataMap === 'object') {
    Object.keys(previewPlan.extraMetadataMap).forEach((id) => {
      if (!nextMetadataMap[id] || overwriteExisting) {
        nextMetadataMap[id] = previewPlan.extraMetadataMap[id];
      }
    });
  }

  let addedCount = 0;
  let updatedCount = 0;
  let skippedConflictCount = 0;

  previewPlan.albumsToAdd.forEach((item) => {
    nextRatingsMap[item.collectionId] = item.record;
    if (item.metadata) {
      nextMetadataMap[item.collectionId] = item.metadata;
    }
    addedCount += 1;
  });

  previewPlan.albumsToUpdate.forEach((item) => {
    if (overwriteExisting) {
      nextRatingsMap[item.collectionId] = item.record;
      if (item.metadata) {
        nextMetadataMap[item.collectionId] = item.metadata;
      }
      updatedCount += 1;
    } else {
      if (item.metadata && !nextMetadataMap[item.collectionId]) {
        nextMetadataMap[item.collectionId] = item.metadata;
      }
      skippedConflictCount += 1;
    }
  });

  previewPlan.albumsUnchanged.forEach((item) => {
    if (item.metadata && !nextMetadataMap[item.collectionId]) {
      nextMetadataMap[item.collectionId] = item.metadata;
    }
  });

  let addedCollectionsCount = 0;
  let updatedCollectionsCount = 0;
  let skippedCollectionConflictCount = 0;

  (previewPlan.collectionsToAdd || []).forEach((colItem) => {
    nextCollectionsMap[colItem.id] = colItem.collection;
    addedCollectionsCount += 1;
  });

  (previewPlan.collectionsToUpdate || []).forEach((colItem) => {
    if (overwriteExisting) {
      const existingCol = nextCollectionsMap[colItem.id];
      nextCollectionsMap[colItem.id] = {
        ...colItem.collection,
        createdAt: existingCol?.createdAt || colItem.collection.createdAt
      };
      updatedCollectionsCount += 1;
    } else {
      skippedCollectionConflictCount += 1;
    }
  });

  return {
    nextRatingsMap,
    nextMetadataMap,
    nextCollectionsMap,
    addedCount,
    updatedCount,
    skippedConflictCount,
    unchangedCount: previewPlan.albumsUnchanged.length,
    preservedExistingCount: previewPlan.untouchedExistingCount,
    addedCollectionsCount,
    updatedCollectionsCount,
    skippedCollectionConflictCount,
    unchangedCollectionsCount: (previewPlan.collectionsUnchanged || []).length,
    preservedCollectionsCount: previewPlan.untouchedCollectionsCount ?? Object.keys(currentCollectionsMap || {}).length
  };
}

/**
 * Creates a localStorage backup of current data and commits the merged import.
 */
export function applyValidatedLibraryImport(
  previewPlan,
  { overwriteExisting = true } = {}
) {
  const currentRatings = getSavedRatingsMap();
  const currentMeta = getAlbumCatalogCacheMap();
  const currentCollections = getSavedCollectionsMap();

  const merged = buildMergedLibraryState(
    previewPlan,
    currentRatings,
    currentMeta,
    { overwriteExisting },
    currentCollections
  );

  const commitResult = commitMergedLibraryMaps(
    merged.nextRatingsMap,
    merged.nextMetadataMap,
    merged.nextCollectionsMap
  );

  return {
    ...commitResult,
    addedCount: merged.addedCount,
    updatedCount: merged.updatedCount,
    skippedConflictCount: merged.skippedConflictCount,
    unchangedCount: merged.unchangedCount,
    preservedExistingCount: merged.preservedExistingCount,
    addedCollectionsCount: merged.addedCollectionsCount,
    updatedCollectionsCount: merged.updatedCollectionsCount,
    skippedCollectionConflictCount: merged.skippedCollectionConflictCount,
    unchangedCollectionsCount: merged.unchangedCollectionsCount,
    preservedCollectionsCount: merged.preservedCollectionsCount
  };
}