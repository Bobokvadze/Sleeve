/**
 * SLEEVE - Custom & Smart Collections Domain Engine (Phases 9A & 9B)
 * Pure functions for:
 * - Enriching manual and rule-based smart collections
 * - Evaluating smart rules dynamically against existing ratings, metadata, and journal entries
 * - Explaining active rules transparently & handling missing metadata safely
 * - Searching and sorting albums within any collection
 */

import {
  CURATED_ALBUMS,
  getTierDetails,
  createFallbackCoverDataUri
} from './config.js';
import {
  getSavedCollectionsMap,
  getSavedRatingsMap,
  getAlbumCatalogCacheMap,
  getSavedJournalMap,
  normalizeCustomCollectionRecord,
  normalizeSmartCollectionRules,
  hasActiveSmartRules
} from './storage.js';
import {
  LIBRARY_SORT_MODES,
  getLibraryEntries,
  buildLibraryEntry,
  sortLibraryEntries
} from './library.js';
import {
  hasKnownArtistMetadata,
  extractReleaseDecade
} from './insights.js';

export { normalizeSmartCollectionRules, hasActiveSmartRules };

export const COLLECTION_SORT_MODES = {
  MANUAL: 'manual',
  SCORE_DESC: 'score-desc',
  SCORE_ASC: 'score-asc',
  TITLE_ASC: 'title-asc',
  ARTIST_ASC: 'artist-asc',
  YEAR_DESC: 'year-desc'
};

export const AVAILABLE_DECADE_RULES = [
  '1960s',
  '1970s',
  '1980s',
  '1990s',
  '2000s',
  '2010s',
  '2020s'
];

export const COLLECTION_THEME_OPTIONS = {
  obsidian: {
    id: 'obsidian',
    label: 'Obsidian',
    tagline: 'Carbon matte & warm amber',
    accentColor: 'var(--accent-primary)',
    accentHex: '#E8A838',
    canvasThemeId: 'obsidian'
  },
  amber: {
    id: 'amber',
    label: 'Warm Amber',
    tagline: 'Analog VU-meter gold',
    accentColor: 'var(--tier-great)',
    accentHex: '#E8A838',
    canvasThemeId: 'obsidian'
  },
  emerald: {
    id: 'emerald',
    label: 'Studio Emerald',
    tagline: 'Console LED green',
    accentColor: 'var(--tier-masterpiece)',
    accentHex: '#10B981',
    canvasThemeId: 'signal'
  },
  signal: {
    id: 'signal',
    label: 'Signal Blue',
    tagline: 'High-contrast studio cyan',
    accentColor: 'var(--tier-solid)',
    accentHex: '#38BDF8',
    canvasThemeId: 'signal'
  },
  crimson: {
    id: 'crimson',
    label: 'Peak Crimson',
    tagline: 'Warm archival red accent',
    accentColor: 'var(--tier-poor)',
    accentHex: '#EF4444',
    canvasThemeId: 'obsidian'
  },
  paper: {
    id: 'paper',
    label: 'Archival Paper',
    tagline: 'Warm ivory liner notes',
    accentColor: '#D6CFC2',
    accentHex: '#D6CFC2',
    canvasThemeId: 'paper'
  }
};

export function getCollectionThemeMeta(themeId) {
  const key = String(themeId || 'obsidian').toLowerCase();
  return COLLECTION_THEME_OPTIONS[key] || COLLECTION_THEME_OPTIONS.obsidian;
}

/**
 * Generates transparent, human-readable descriptions for all active smart rules.
 */
export function describeSmartCollectionRules(rawRules = {}) {
  const rules = normalizeSmartCollectionRules(rawRules);
  const activeRulePills = [];

  if (rules.minRating !== null && rules.maxRating !== null) {
    activeRulePills.push({
      key: 'ratingRange',
      label: 'Rating',
      valueText: rules.minRating.toFixed(1) + ' \u2013 ' + rules.maxRating.toFixed(1),
      fullText: 'Rating: ' + rules.minRating.toFixed(1) + ' \u2013 ' + rules.maxRating.toFixed(1)
    });
  } else if (rules.minRating !== null) {
    activeRulePills.push({
      key: 'minRating',
      label: 'Min Rating',
      valueText: rules.minRating.toFixed(1) + '+',
      fullText: 'Min Rating: ' + rules.minRating.toFixed(1) + '+'
    });
  } else if (rules.maxRating !== null) {
    activeRulePills.push({
      key: 'maxRating',
      label: 'Max Rating',
      valueText: '\u2264 ' + rules.maxRating.toFixed(1),
      fullText: 'Max Rating: \u2264 ' + rules.maxRating.toFixed(1)
    });
  }

  if (rules.artist) {
    activeRulePills.push({
      key: 'artist',
      label: 'Artist',
      valueText: rules.artist,
      fullText: 'Artist: ' + rules.artist
    });
  }

  if (rules.decade) {
    activeRulePills.push({
      key: 'decade',
      label: 'Decade',
      valueText: rules.decade,
      fullText: 'Decade: ' + rules.decade
    });
  }

  if (rules.hasJournalEntry) {
    activeRulePills.push({
      key: 'hasJournalEntry',
      label: 'Journal',
      valueText: 'Has Journal Entry',
      fullText: 'Has Listening Journal Entry'
    });
  }

  if (rules.hasFavoriteTracks) {
    activeRulePills.push({
      key: 'hasFavoriteTracks',
      label: 'Favorites',
      valueText: 'Has Favorite Tracks',
      fullText: 'Has Favorite Tracks in Journal'
    });
  }

  const summaryText =
    activeRulePills.length > 0
      ? activeRulePills.map((p) => p.fullText).join('  \u00B7  ')
      : 'No active rules configured';

  return {
    rules,
    hasActiveRules: activeRulePills.length > 0,
    activeRulePills,
    summaryText
  };
}

/**
 * Dynamically evaluates a Smart Collection's rules against the user's local library,
 * ratings, metadata, and journal entries.
 * - Never modifies ratings or journal entries.
 * - Deduplicates albums by collectionId.
 * - Handles missing metadata safely and reports skipped counts.
 */
export function evaluateSmartCollectionRules(
  rawRules = {},
  ratingsMap = getSavedRatingsMap(),
  metadataMap = getAlbumCatalogCacheMap(),
  journalMap = getSavedJournalMap(),
  curatedList = CURATED_ALBUMS
) {
  const ruleDesc = describeSmartCollectionRules(rawRules);
  const { rules, hasActiveRules, activeRulePills, summaryText } = ruleDesc;

  const skippedMissingMetadata = {
    unratedForScoreRule: 0,
    unknownArtistForArtistRule: 0,
    missingDecadeForDecadeRule: 0
  };

  if (!hasActiveRules) {
    return {
      rules,
      hasActiveRules: false,
      activeRulePills,
      summaryText,
      matchedAlbums: [],
      matchedAlbumIds: [],
      skippedMissingMetadata
    };
  }

  const safeRatings =
    ratingsMap && typeof ratingsMap === 'object' ? ratingsMap : {};
  const safeMeta =
    metadataMap && typeof metadataMap === 'object' ? metadataMap : {};
  const safeJournal =
    journalMap && typeof journalMap === 'object' ? journalMap : {};

  // Build deduplicated pool of user's library entries + any album with a journal entry
  const libraryEntries = getLibraryEntries(safeRatings, safeMeta, curatedList);
  const candidateMap = new Map();

  libraryEntries.forEach((entry) => {
    candidateMap.set(String(entry.collectionId), entry);
  });

  Object.keys(safeJournal).forEach((rawAlbumId) => {
    const idStr = String(rawAlbumId).trim();
    if (!idStr || candidateMap.has(idStr)) return;
    const ratingRec = safeRatings[idStr];
    if (ratingRec && ratingRec.hiddenFromLibrary === true) return;
    const built = buildLibraryEntry(idStr, ratingRec || {}, safeMeta, curatedList);
    candidateMap.set(idStr, built);
  });

  const targetArtistLower = rules.artist ? rules.artist.toLowerCase() : '';
  const targetDecadeLower = rules.decade ? rules.decade.toLowerCase() : '';
  const needsScoreCheck = rules.minRating !== null || rules.maxRating !== null;

  const matched = [];

  candidateMap.forEach((album, albumId) => {
    // 1. Minimum / Maximum Album Rating Rule
    if (needsScoreCheck) {
      const hasValidScore =
        album.overallScore !== null && Number.isFinite(album.overallScore);
      if (!hasValidScore) {
        skippedMissingMetadata.unratedForScoreRule += 1;
        return;
      }
      if (rules.minRating !== null && album.overallScore < rules.minRating - 1e-7) {
        return;
      }
      if (rules.maxRating !== null && album.overallScore > rules.maxRating + 1e-7) {
        return;
      }
    }

    // 2. Artist Name Rule
    if (targetArtistLower) {
      if (!hasKnownArtistMetadata(album)) {
        skippedMissingMetadata.unknownArtistForArtistRule += 1;
        return;
      }
      const albumArtistLower = String(album.artistName || '').trim().toLowerCase();
      if (
        albumArtistLower !== targetArtistLower &&
        !albumArtistLower.includes(targetArtistLower)
      ) {
        return;
      }
    }

    // 3. Release Decade Rule
    if (targetDecadeLower) {
      const decadeInfo = extractReleaseDecade(album);
      if (!decadeInfo) {
        skippedMissingMetadata.missingDecadeForDecadeRule += 1;
        return;
      }
      if (decadeInfo.decadeLabel.toLowerCase() !== targetDecadeLower) {
        return;
      }
    }

    // 4. Has Listening Journal Entry Rule
    const journalEntry = safeJournal[albumId] || null;
    if (rules.hasJournalEntry && !journalEntry) {
      return;
    }

    // 5. Has Favorite Tracks Rule (from Listening Journal favoriteTracks)
    if (rules.hasFavoriteTracks) {
      const favList = journalEntry?.favoriteTracks;
      if (!Array.isArray(favList) || favList.length === 0) {
        return;
      }
    }

    matched.push(album);
  });

  // Sort matched albums deterministically by score descending, then title A-Z
  const sortedMatched = sortLibraryEntries(matched, LIBRARY_SORT_MODES.SCORE_DESC);

  return {
    rules,
    hasActiveRules: true,
    activeRulePills,
    summaryText,
    matchedAlbums: sortedMatched,
    matchedAlbumIds: sortedMatched.map((a) => String(a.collectionId)),
    skippedMissingMetadata
  };
}

/**
 * Enriches a stored manual or smart collection with full album entries, ratings,
 * average score, active rule descriptions, and a 4-tile cover mosaic.
 */
export function buildEnrichedCollection(
  collectionId,
  rawCollection,
  ratingsMap = getSavedRatingsMap(),
  metadataMap = getAlbumCatalogCacheMap(),
  curatedList = CURATED_ALBUMS,
  journalMap = getSavedJournalMap()
) {
  const normalized = normalizeCustomCollectionRecord(collectionId, rawCollection);
  if (!normalized) return null;

  const safeRatings =
    ratingsMap && typeof ratingsMap === 'object' ? ratingsMap : {};
  const safeMeta =
    metadataMap && typeof metadataMap === 'object' ? metadataMap : {};
  const safeJournal =
    journalMap && typeof journalMap === 'object' ? journalMap : {};

  const isSmart = normalized.type === 'smart';
  let sourceAlbums = [];
  let effectiveAlbumIds = [];
  let smartEvaluation = null;

  if (isSmart) {
    smartEvaluation = evaluateSmartCollectionRules(
      normalized.smartRules,
      safeRatings,
      safeMeta,
      safeJournal,
      curatedList
    );
    sourceAlbums = smartEvaluation.matchedAlbums;
    effectiveAlbumIds = smartEvaluation.matchedAlbumIds;
  } else {
    effectiveAlbumIds = normalized.albumIds;
    sourceAlbums = effectiveAlbumIds.map((albumId) => {
      const ratingRecord = safeRatings[String(albumId)] || {};
      return buildLibraryEntry(albumId, ratingRecord, safeMeta, curatedList);
    });
  }

  let ratedAlbumCount = 0;
  let scoredAlbumCount = 0;
  let sumScores = 0;

  const albums = sourceAlbums.map((libEntry, index) => {
    const hasScore =
      libEntry.overallScore !== null && Number.isFinite(libEntry.overallScore);
    if (libEntry.ratedTrackCount > 0 || hasScore) {
      ratedAlbumCount += 1;
    }
    if (hasScore) {
      scoredAlbumCount += 1;
      sumScores += libEntry.overallScore;
    }

    const tier = getTierDetails(libEntry.overallScore);
    const hasJournal = Boolean(safeJournal[String(libEntry.collectionId)]);
    const favCount = Array.isArray(safeJournal[String(libEntry.collectionId)]?.favoriteTracks)
      ? safeJournal[String(libEntry.collectionId)].favoriteTracks.length
      : 0;

    return {
      ...libEntry,
      manualIndex: index,
      manualPosition: index + 1,
      tierLabel: hasScore ? tier.label : 'Unrated',
      tierColor: hasScore ? tier.color : 'var(--text-muted)',
      hasJournalEntry: hasJournal,
      favoriteTracksCount: favCount
    };
  });

  let averageScore = null;
  let formattedAverageScore = null;
  if (scoredAlbumCount > 0) {
    const rawMean = sumScores / scoredAlbumCount;
    averageScore = Math.round(rawMean * 10) / 10;
    formattedAverageScore = averageScore.toFixed(1);
  }

  const avgTier = getTierDetails(averageScore);
  const themeMeta = getCollectionThemeMeta(normalized.theme);

  const mosaicCovers = [];
  for (let i = 0; i < 4; i += 1) {
    const alb = albums[i];
    if (alb) {
      mosaicCovers.push({
        albumTitle: alb.collectionName,
        coverUrl: alb.coverUrl,
        fallbackCoverUrl: alb.fallbackCoverUrl
      });
    } else {
      mosaicCovers.push({
        albumTitle: normalized.title,
        coverUrl: createFallbackCoverDataUri(normalized.title),
        fallbackCoverUrl: createFallbackCoverDataUri(normalized.title)
      });
    }
  }

  const createdMs = Date.parse(normalized.createdAt);
  const updatedMs = Date.parse(normalized.updatedAt);

  return {
    id: normalized.id,
    title: normalized.title,
    description: normalized.description,
    type: normalized.type,
    isSmart,
    theme: normalized.theme,
    themeMeta,
    smartRules: normalized.smartRules,
    activeRulePills: smartEvaluation ? smartEvaluation.activeRulePills : [],
    rulesSummaryText: smartEvaluation ? smartEvaluation.summaryText : '',
    skippedMissingMetadata: smartEvaluation ? smartEvaluation.skippedMissingMetadata : null,
    albumIds: effectiveAlbumIds,
    albums,
    albumCount: albums.length,
    ratedAlbumCount,
    scoredAlbumCount,
    averageScore,
    formattedAverageScore,
    averageTierLabel: scoredAlbumCount > 0 ? avgTier.label : 'Unrated',
    averageTierColor: scoredAlbumCount > 0 ? avgTier.color : 'var(--text-muted)',
    mosaicCovers,
    createdAt: normalized.createdAt,
    updatedAt: normalized.updatedAt,
    createdTimestampMs: Number.isFinite(createdMs) ? createdMs : 0,
    updatedTimestampMs: Number.isFinite(updatedMs) ? updatedMs : 0
  };
}

/**
 * Returns all enriched custom & smart collections sorted by recently updated descending.
 */
export function getEnrichedCollectionsList(
  collectionsMap = getSavedCollectionsMap(),
  ratingsMap = getSavedRatingsMap(),
  metadataMap = getAlbumCatalogCacheMap(),
  curatedList = CURATED_ALBUMS,
  journalMap = getSavedJournalMap()
) {
  if (!collectionsMap || typeof collectionsMap !== 'object' || Array.isArray(collectionsMap)) {
    return [];
  }

  const list = [];
  Object.keys(collectionsMap).forEach((id) => {
    const enriched = buildEnrichedCollection(
      id,
      collectionsMap[id],
      ratingsMap,
      metadataMap,
      curatedList,
      journalMap
    );
    if (enriched) {
      list.push(enriched);
    }
  });

  list.sort((a, b) => {
    if (b.updatedTimestampMs !== a.updatedTimestampMs) {
      return b.updatedTimestampMs - a.updatedTimestampMs;
    }
    if (b.createdTimestampMs !== a.createdTimestampMs) {
      return b.createdTimestampMs - a.createdTimestampMs;
    }
    return a.title.localeCompare(b.title, 'en', { sensitivity: 'base' });
  });

  return list;
}

function compareTextAsc(a, b) {
  return String(a || '').localeCompare(String(b || ''), 'en', {
    sensitivity: 'base'
  });
}

/**
 * Filters and sorts the albums inside a single enriched collection.
 * Manual reordering is only enabled for manual collections when unfiltered and in manual sort mode.
 */
export function queryCollectionAlbums(
  enrichedCollection,
  {
    query = '',
    sortBy = COLLECTION_SORT_MODES.MANUAL
  } = {}
) {
  const allAlbums = Array.isArray(enrichedCollection?.albums)
    ? enrichedCollection.albums
    : [];
  const isSmart = Boolean(enrichedCollection?.isSmart);
  const cleanQuery = String(query || '').trim().toLowerCase();
  const mode = String(sortBy || COLLECTION_SORT_MODES.MANUAL);

  const filtered = allAlbums.filter((album) => {
    if (!cleanQuery) return true;
    const inTitle = String(album.collectionName || '')
      .toLowerCase()
      .includes(cleanQuery);
    const inArtist = String(album.artistName || '')
      .toLowerCase()
      .includes(cleanQuery);
    const inGenre = String(album.primaryGenreName || '')
      .toLowerCase()
      .includes(cleanQuery);
    const inYear = String(album.releaseYear || '')
      .toLowerCase()
      .includes(cleanQuery);
    return inTitle || inArtist || inGenre || inYear;
  });

  const sorted = [...filtered];

  if (mode === COLLECTION_SORT_MODES.MANUAL) {
    sorted.sort((a, b) => a.manualIndex - b.manualIndex);
  } else if (mode === COLLECTION_SORT_MODES.SCORE_DESC) {
    sorted.sort((a, b) => {
      const hasA = a.overallScore !== null && Number.isFinite(a.overallScore);
      const hasB = b.overallScore !== null && Number.isFinite(b.overallScore);
      if (hasA && !hasB) return -1;
      if (!hasA && hasB) return 1;
      if (hasA && hasB && Math.abs(b.overallScore - a.overallScore) > 1e-7) {
        return b.overallScore - a.overallScore;
      }
      return a.manualIndex - b.manualIndex;
    });
  } else if (mode === COLLECTION_SORT_MODES.SCORE_ASC) {
    sorted.sort((a, b) => {
      const hasA = a.overallScore !== null && Number.isFinite(a.overallScore);
      const hasB = b.overallScore !== null && Number.isFinite(b.overallScore);
      if (hasA && !hasB) return -1;
      if (!hasA && hasB) return 1;
      if (hasA && hasB && Math.abs(a.overallScore - b.overallScore) > 1e-7) {
        return a.overallScore - b.overallScore;
      }
      return a.manualIndex - b.manualIndex;
    });
  } else if (mode === COLLECTION_SORT_MODES.TITLE_ASC) {
    sorted.sort((a, b) => {
      const cmp = compareTextAsc(a.collectionName, b.collectionName);
      return cmp !== 0 ? cmp : a.manualIndex - b.manualIndex;
    });
  } else if (mode === COLLECTION_SORT_MODES.ARTIST_ASC) {
    sorted.sort((a, b) => {
      const cmp = compareTextAsc(a.artistName, b.artistName);
      if (cmp !== 0) return cmp;
      return compareTextAsc(a.collectionName, b.collectionName);
    });
  } else if (mode === COLLECTION_SORT_MODES.YEAR_DESC) {
    sorted.sort((a, b) => {
      const yearA = Number(a.releaseYear) || 0;
      const yearB = Number(b.releaseYear) || 0;
      if (yearB !== yearA) return yearB - yearA;
      return a.manualIndex - b.manualIndex;
    });
  }

  const isManualReorderEnabled =
    !isSmart && cleanQuery.length === 0 && mode === COLLECTION_SORT_MODES.MANUAL;

  return {
    allAlbums,
    visibleAlbums: sorted,
    isFiltered: cleanQuery.length > 0,
    sortBy: mode,
    isManualReorderEnabled
  };
}

/**
 * Returns which manual collections contain a given albumId, which manual collections
 * are available to add it to, and which smart collections dynamically match it.
 */
export function getAlbumCollectionMembership(
  albumId,
  collectionsMap = getSavedCollectionsMap(),
  ratingsMap = getSavedRatingsMap(),
  metadataMap = getAlbumCatalogCacheMap(),
  journalMap = getSavedJournalMap(),
  curatedList = CURATED_ALBUMS
) {
  const targetId = String(albumId ?? '').trim();
  const safeMap =
    collectionsMap && typeof collectionsMap === 'object' ? collectionsMap : {};

  const containing = [];
  const available = [];
  const matchingSmart = [];

  Object.keys(safeMap).forEach((colId) => {
    const col = normalizeCustomCollectionRecord(colId, safeMap[colId]);
    if (!col) return;

    if (col.type === 'smart') {
      const evalRes = evaluateSmartCollectionRules(
        col.smartRules,
        ratingsMap,
        metadataMap,
        journalMap,
        curatedList
      );
      if (evalRes.matchedAlbumIds.includes(targetId)) {
        matchingSmart.push(col);
      }
      return;
    }

    if (col.albumIds.includes(targetId)) {
      containing.push(col);
    } else {
      available.push(col);
    }
  });

  return {
    containing,
    available,
    matchingSmart
  };
}