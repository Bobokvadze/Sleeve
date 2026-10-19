/**
 * RATEPLAY - Personal Album Library Engine (Phase 4)
 * Pure functions for reconstructing library cards, computing completion status,
 * filtering, sorting with deterministic tie-breakers, and calculating library summaries.
 */

import {
  CURATED_ALBUMS,
  formatReleaseYear,
  getHighResArtwork,
  createFallbackCoverDataUri
} from './config.js';
import { calculateMetricsFromTrackRatingsMap } from './calculator.js';

export const LIBRARY_SORT_MODES = {
  SCORE_DESC: 'score-desc',
  SCORE_ASC: 'score-asc',
  UPDATED_DESC: 'updated-desc',
  TITLE_ASC: 'title-asc',
  ARTIST_ASC: 'artist-asc'
};

export const LIBRARY_FILTER_MODES = {
  ALL: 'all',
  COMPLETE: 'complete',
  INCOMPLETE: 'incomplete'
};

/**
 * Determines whether a stored album rating record belongs in My Library.
 * An album belongs in My Library when:
 * 1. It is not marked hiddenFromLibrary, AND
 * 2. The user has rated at least one track (ratedCount >= 1) OR established a valid overallScore.
 */
export function isAlbumEligibleForLibrary(rawRecord) {
  if (!rawRecord || typeof rawRecord !== 'object' || Array.isArray(rawRecord)) {
    return false;
  }
  if (rawRecord.hiddenFromLibrary === true) {
    return false;
  }

  const metrics = calculateMetricsFromTrackRatingsMap(rawRecord.trackRatings || {}, 0);
  if (metrics.ratedCount >= 1) {
    return true;
  }

  const fallbackRatedCount = Number(rawRecord.ratedCount) || 0;
  const fallbackScore = Number(rawRecord.overallScore);
  const hasFallbackScore =
    rawRecord.overallScore !== null &&
    rawRecord.overallScore !== undefined &&
    Number.isFinite(fallbackScore) &&
    fallbackScore >= 1.0 &&
    fallbackScore <= 10.0;

  return fallbackRatedCount >= 1 || hasFallbackScore;
}

/**
 * Looks up album metadata from the persisted metadata map or the curated catalog.
 */
function resolveAlbumMetadata(collectionId, metadataMap = {}, curatedList = CURATED_ALBUMS) {
  const key = String(collectionId);
  const cached =
    metadataMap && typeof metadataMap === 'object' ? metadataMap[key] : null;
  const curated = Array.isArray(curatedList)
    ? curatedList.find((item) => String(item.collectionId) === key)
    : null;

  if (cached || curated) {
    const source = cached || curated;
    const knownTracks =
      Number(cached?.trackCount) > 0
        ? Number(cached.trackCount)
        : Number(curated?.trackCount) > 0
        ? Number(curated.trackCount)
        : Array.isArray(curated?.fallbackTracks)
        ? curated.fallbackTracks.length
        : 0;

    return {
      collectionId: Number(collectionId) || key,
      collectionName:
        source.collectionName || curated?.collectionName || 'Album #' + key,
      artistName: source.artistName || curated?.artistName || 'Unknown Artist',
      primaryGenreName:
        source.primaryGenreName || curated?.primaryGenreName || 'Music',
      releaseDate: source.releaseDate || curated?.releaseDate || '',
      trackCount: knownTracks,
      artworkUrl100: source.artworkUrl100 || curated?.artworkUrl100 || '',
      hasFullMetadata: true
    };
  }

  return {
    collectionId: Number(collectionId) || key,
    collectionName: 'Album #' + key,
    artistName: 'Unknown Artist',
    primaryGenreName: 'Music',
    releaseDate: '',
    trackCount: 0,
    artworkUrl100: '',
    hasFullMetadata: false
  };
}

/**
 * Reconstructs a single normalized Library Entry from user rating data and metadata.
 */
export function buildLibraryEntry(
  collectionId,
  rawRecord,
  metadataMap = {},
  curatedList = CURATED_ALBUMS
) {
  const key = String(collectionId);
  const meta = resolveAlbumMetadata(key, metadataMap, curatedList);
  const knownTrackCount = Math.max(0, Number(meta.trackCount) || 0);

  const trackRatings =
    rawRecord &&
    rawRecord.trackRatings &&
    typeof rawRecord.trackRatings === 'object' &&
    !Array.isArray(rawRecord.trackRatings)
      ? rawRecord.trackRatings
      : {};

  const hasTrackMapEntries = Object.keys(trackRatings).length > 0;
  const metrics = calculateMetricsFromTrackRatingsMap(trackRatings, knownTrackCount);

  const ratedTrackCount = hasTrackMapEntries
    ? metrics.ratedCount
    : Math.max(0, Number(rawRecord?.ratedCount) || 0);

  const scoredTrackCount = hasTrackMapEntries
    ? metrics.scoredCount
    : Math.max(0, Number(rawRecord?.scoredCount) || ratedTrackCount);

  let overallScore = metrics.overallScore;
  if (overallScore === null && !hasTrackMapEntries) {
    const legacyScore = Number(rawRecord?.overallScore);
    if (
      rawRecord?.overallScore !== null &&
      rawRecord?.overallScore !== undefined &&
      Number.isFinite(legacyScore) &&
      legacyScore >= 1.0 &&
      legacyScore <= 10.0
    ) {
      overallScore = Math.round(legacyScore * 10) / 10;
    }
  }

  // Conservatively determine whether all eligible tracks on the album are rated.
  // Never label an album 'complete' unless totalTrackCount > 0 is reliably known.
  const effectiveTargetTracks =
    knownTrackCount > 0
      ? Math.max(1, knownTrackCount - metrics.excludedUnratedCount)
      : 0;

  let completionStatus = 'unknown';
  let isComplete = false;

  if (knownTrackCount > 0) {
    if (ratedTrackCount >= effectiveTargetTracks && ratedTrackCount > 0) {
      completionStatus = 'complete';
      isComplete = true;
    } else {
      completionStatus = 'incomplete';
      isComplete = false;
    }
  }

  const parsedUpdated = rawRecord?.updatedAt ? Date.parse(rawRecord.updatedAt) : NaN;
  const updatedTimestampMs = Number.isFinite(parsedUpdated) ? parsedUpdated : null;

  const releaseYear = formatReleaseYear(meta.releaseDate);
  const coverUrl = meta.artworkUrl100
    ? getHighResArtwork(meta.artworkUrl100, 600)
    : createFallbackCoverDataUri(meta.collectionName);

  return {
    collectionId: Number(key) || key,
    collectionKey: key,
    collectionName: meta.collectionName,
    artistName: meta.artistName,
    primaryGenreName: meta.primaryGenreName,
    releaseDate: meta.releaseDate,
    releaseYear,
    artworkUrl100: meta.artworkUrl100,
    coverUrl,
    fallbackCoverUrl: createFallbackCoverDataUri(meta.collectionName),
    hasFullMetadata: meta.hasFullMetadata,
    totalTrackCount: knownTrackCount,
    effectiveTargetTracks,
    ratedTrackCount,
    scoredTrackCount,
    excludedRatedCount: metrics.excludedRatedCount,
    interludeCount: metrics.interludeCount,
    overallScore,
    formattedScore: overallScore !== null ? overallScore.toFixed(1) : null,
    completionStatus,
    isComplete,
    updatedAt: typeof rawRecord?.updatedAt === 'string' ? rawRecord.updatedAt : null,
    updatedTimestampMs
  };
}

/**
 * Builds deduplicated Library Entries for all eligible rated albums.
 */
export function getLibraryEntries(
  ratingsMap = {},
  metadataMap = {},
  curatedList = CURATED_ALBUMS
) {
  if (!ratingsMap || typeof ratingsMap !== 'object' || Array.isArray(ratingsMap)) {
    return [];
  }

  const seenIds = new Set();
  const entries = [];

  Object.keys(ratingsMap).forEach((rawId) => {
    const key = String(rawId).trim();
    if (!key || seenIds.has(key)) return;

    const record = ratingsMap[rawId];
    if (!isAlbumEligibleForLibrary(record)) return;

    seenIds.add(key);
    entries.push(buildLibraryEntry(key, record, metadataMap, curatedList));
  });

  return entries;
}

/**
 * Counts how many rated albums are currently hidden from My Library (via Remove from Library).
 */
export function getHiddenLibraryCount(ratingsMap = {}) {
  if (!ratingsMap || typeof ratingsMap !== 'object' || Array.isArray(ratingsMap)) {
    return 0;
  }

  let count = 0;
  Object.keys(ratingsMap).forEach((key) => {
    const rec = ratingsMap[key];
    if (rec && rec.hiddenFromLibrary === true) {
      const checkCopy = { ...rec, hiddenFromLibrary: false };
      if (isAlbumEligibleForLibrary(checkCopy)) {
        count += 1;
      }
    }
  });
  return count;
}

/**
 * Filters library entries by local search query (title or artist) and completion filter mode.
 */
export function filterLibraryEntries(entries = [], { query = '', filterMode = 'all' } = {}) {
  const safeEntries = Array.isArray(entries) ? entries : [];
  const normalizedQuery = String(query || '').trim().toLowerCase();
  const normalizedFilter = String(filterMode || 'all').toLowerCase();

  return safeEntries.filter((entry) => {
    if (normalizedQuery.length > 0) {
      const titleMatch = String(entry.collectionName || '')
        .toLowerCase()
        .includes(normalizedQuery);
      const artistMatch = String(entry.artistName || '')
        .toLowerCase()
        .includes(normalizedQuery);
      if (!titleMatch && !artistMatch) {
        return false;
      }
    }

    if (normalizedFilter === LIBRARY_FILTER_MODES.COMPLETE) {
      return entry.completionStatus === 'complete';
    }
    if (normalizedFilter === LIBRARY_FILTER_MODES.INCOMPLETE) {
      return entry.completionStatus !== 'complete';
    }
    return true;
  });
}

function compareStringsAsc(a, b) {
  const strA = String(a || '').trim();
  const strB = String(b || '').trim();
  return strA.localeCompare(strB, 'en', { sensitivity: 'base' });
}

function compareIdsAsc(a, b) {
  const numA = Number(a.collectionId);
  const numB = Number(b.collectionId);
  if (Number.isFinite(numA) && Number.isFinite(numB) && numA !== numB) {
    return numA - numB;
  }
  return compareStringsAsc(a.collectionKey, b.collectionKey);
}

/**
 * Sorts library entries using one of the 5 supported modes with deterministic tie-breakers.
 * Missing scores and missing dates never crash sorting and are placed at the end of score/date sorts.
 */
export function sortLibraryEntries(entries = [], sortBy = LIBRARY_SORT_MODES.SCORE_DESC) {
  const copy = Array.isArray(entries) ? [...entries] : [];
  const mode = String(sortBy || LIBRARY_SORT_MODES.SCORE_DESC);

  copy.sort((a, b) => {
    if (mode === LIBRARY_SORT_MODES.SCORE_DESC) {
      const hasScoreA = a.overallScore !== null && Number.isFinite(a.overallScore);
      const hasScoreB = b.overallScore !== null && Number.isFinite(b.overallScore);
      if (hasScoreA && !hasScoreB) return -1;
      if (!hasScoreA && hasScoreB) return 1;
      if (hasScoreA && hasScoreB && Math.abs(b.overallScore - a.overallScore) > 1e-7) {
        return b.overallScore - a.overallScore;
      }
      if (b.scoredTrackCount !== a.scoredTrackCount) {
        return b.scoredTrackCount - a.scoredTrackCount;
      }
      if (b.ratedTrackCount !== a.ratedTrackCount) {
        return b.ratedTrackCount - a.ratedTrackCount;
      }
      const titleCmp = compareStringsAsc(a.collectionName, b.collectionName);
      if (titleCmp !== 0) return titleCmp;
      return compareIdsAsc(a, b);
    }

    if (mode === LIBRARY_SORT_MODES.SCORE_ASC) {
      const hasScoreA = a.overallScore !== null && Number.isFinite(a.overallScore);
      const hasScoreB = b.overallScore !== null && Number.isFinite(b.overallScore);
      if (hasScoreA && !hasScoreB) return -1;
      if (!hasScoreA && hasScoreB) return 1;
      if (hasScoreA && hasScoreB && Math.abs(a.overallScore - b.overallScore) > 1e-7) {
        return a.overallScore - b.overallScore;
      }
      const titleCmp = compareStringsAsc(a.collectionName, b.collectionName);
      if (titleCmp !== 0) return titleCmp;
      return compareIdsAsc(a, b);
    }

    if (mode === LIBRARY_SORT_MODES.UPDATED_DESC) {
      const hasDateA = a.updatedTimestampMs !== null && Number.isFinite(a.updatedTimestampMs);
      const hasDateB = b.updatedTimestampMs !== null && Number.isFinite(b.updatedTimestampMs);
      if (hasDateA && !hasDateB) return -1;
      if (!hasDateA && hasDateB) return 1;
      if (hasDateA && hasDateB && b.updatedTimestampMs !== a.updatedTimestampMs) {
        return b.updatedTimestampMs - a.updatedTimestampMs;
      }
      const scoreA = a.overallScore ?? -1;
      const scoreB = b.overallScore ?? -1;
      if (Math.abs(scoreB - scoreA) > 1e-7) {
        return scoreB - scoreA;
      }
      const titleCmp = compareStringsAsc(a.collectionName, b.collectionName);
      if (titleCmp !== 0) return titleCmp;
      return compareIdsAsc(a, b);
    }

    if (mode === LIBRARY_SORT_MODES.TITLE_ASC) {
      const titleCmp = compareStringsAsc(a.collectionName, b.collectionName);
      if (titleCmp !== 0) return titleCmp;
      const artistCmp = compareStringsAsc(a.artistName, b.artistName);
      if (artistCmp !== 0) return artistCmp;
      return compareIdsAsc(a, b);
    }

    if (mode === LIBRARY_SORT_MODES.ARTIST_ASC) {
      const artistCmp = compareStringsAsc(a.artistName, b.artistName);
      if (artistCmp !== 0) return artistCmp;
      const titleCmp = compareStringsAsc(a.collectionName, b.collectionName);
      if (titleCmp !== 0) return titleCmp;
      return compareIdsAsc(a, b);
    }

    return compareIdsAsc(a, b);
  });

  return copy;
}

/**
 * Calculates summary statistics across the user's library entries.
 * Uses Phase 3 scoring rules (excluded and unrated tracks do not contribute to album scores).
 * Never produces NaN or Infinity on empty or unscored datasets.
 */
export function calculateLibrarySummary(entries = []) {
  const safeEntries = Array.isArray(entries) ? entries : [];

  let totalAlbums = safeEntries.length;
  let scoredAlbumsCount = 0;
  let completeAlbumsCount = 0;
  let incompleteAlbumsCount = 0;
  let totalRatedTracks = 0;
  let totalScoredTracks = 0;
  let totalExcludedRatedTracks = 0;
  let sumAlbumScores = 0;

  const scoredAlbums = [];

  safeEntries.forEach((entry) => {
    totalRatedTracks += Number(entry.ratedTrackCount) || 0;
    totalScoredTracks += Number(entry.scoredTrackCount) || 0;
    totalExcludedRatedTracks += Number(entry.excludedRatedCount) || 0;

    if (entry.completionStatus === 'complete') {
      completeAlbumsCount += 1;
    } else {
      incompleteAlbumsCount += 1;
    }

    if (entry.overallScore !== null && Number.isFinite(entry.overallScore)) {
      scoredAlbumsCount += 1;
      sumAlbumScores += entry.overallScore;
      scoredAlbums.push(entry);
    }
  });

  let averageAlbumScore = null;
  let formattedAverageScore = null;

  if (scoredAlbumsCount > 0) {
    const rawAvg = sumAlbumScores / scoredAlbumsCount;
    averageAlbumScore = Math.round(rawAvg * 10) / 10;
    formattedAverageScore = averageAlbumScore.toFixed(1);
  }

  let highestAlbumScore = null;
  let highestRatedAlbums = [];

  if (scoredAlbums.length > 0) {
    highestAlbumScore = scoredAlbums.reduce(
      (max, item) => (item.overallScore > max ? item.overallScore : max),
      scoredAlbums[0].overallScore
    );

    highestRatedAlbums = sortLibraryEntries(
      scoredAlbums.filter((item) => Math.abs(item.overallScore - highestAlbumScore) < 1e-7),
      LIBRARY_SORT_MODES.TITLE_ASC
    );
  }

  return {
    totalAlbums,
    scoredAlbumsCount,
    completeAlbumsCount,
    incompleteAlbumsCount,
    totalRatedTracks,
    totalScoredTracks,
    totalExcludedRatedTracks,
    averageAlbumScore,
    formattedAverageScore,
    highestAlbumScore,
    highestRatedAlbum: highestRatedAlbums[0] || null,
    highestRatedAlbums
  };
}

/**
 * Convenience pipeline that builds, summarizes, filters, and sorts the user's library.
 */
export function queryLibrary(
  ratingsMap = {},
  metadataMap = {},
  {
    query = '',
    filterMode = LIBRARY_FILTER_MODES.ALL,
    sortBy = LIBRARY_SORT_MODES.SCORE_DESC
  } = {},
  curatedList = CURATED_ALBUMS
) {
  const allEntries = getLibraryEntries(ratingsMap, metadataMap, curatedList);
  const summary = calculateLibrarySummary(allEntries);
  const filtered = filterLibraryEntries(allEntries, { query, filterMode });
  const visibleEntries = sortLibraryEntries(filtered, sortBy);
  const hiddenCount = getHiddenLibraryCount(ratingsMap);

  return {
    allEntries,
    visibleEntries,
    summary,
    hiddenCount
  };
}