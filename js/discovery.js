/**
 * SLEEVE - Personalized Music Discovery Engine (Phase 6 - Part 2)
 * Uses the user's existing localStorage ratings as signals to:
 * 1. Highlight highly-rated artists the user has only rated 1-2 albums from.
 * 2. Discover additional unrated albums by highly-rated library artists via the
 *    existing iTunes Search API, with session caching to avoid repeated network calls.
 * Never fabricates albums, ratings, or artist data.
 */

import { CURATED_ALBUMS } from './config.js';
import { getLibraryEntries } from './library.js';
import { calculateMostFrequentlyRatedArtists } from './profile.js';

let discoverySessionCache = {
  fingerprint: '',
  result: null
};

export function clearDiscoverySessionCache() {
  discoverySessionCache = {
    fingerprint: '',
    result: null
  };
}

/**
 * Normalizes an artist or album name for reliable comparison.
 */
function normalizeNameKey(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Derives discovery signals directly from the user's rated library:
 * - underExploredArtists: Highly-rated artists (score >= 7.0) where the user has rated <= 2 albums.
 * - seedArtists: Top-rated artists in the user's library used to query additional albums from the API.
 * - ratedAlbumIds: Set of collectionIds already rated by the user.
 * - ratedAlbumTitleKeys: Set of normalized "artist::title" keys already rated so deluxe/reissue duplicates are avoided.
 */
export function deriveDiscoverySignals(
  ratingsMap = {},
  metadataMap = {},
  curatedList = CURATED_ALBUMS
) {
  const entries = getLibraryEntries(ratingsMap, metadataMap, curatedList);
  const ratedAlbumIds = new Set(entries.map((e) => String(e.collectionId)));
  const ratedAlbumTitleKeys = new Set(
    entries.map(
      (e) => normalizeNameKey(e.artistName) + '::' + normalizeNameKey(e.collectionName)
    )
  );

  if (entries.length === 0) {
    return {
      hasRatings: false,
      totalRatedAlbums: 0,
      underExploredArtists: [],
      seedArtists: [],
      ratedAlbumIds,
      ratedAlbumTitleKeys,
      fingerprint: 'empty'
    };
  }

  // Get all rated artists with their average score and album counts
  const allArtists = calculateMostFrequentlyRatedArtists(entries, 0);

  // Filter artists with a valid average score
  const scoredArtists = allArtists.filter(
    (art) => art.averageScore !== null && Number.isFinite(art.averageScore)
  );

  // Prefer highly rated artists (averageScore >= 7.0); fall back to top scored artists if all are < 7.0
  const highRatedPool = scoredArtists.filter((art) => art.averageScore >= 7.0);
  const candidatePool = highRatedPool.length > 0 ? highRatedPool : scoredArtists;

  // 1. Highly-rated artists the user has not rated many albums from (albumCount <= 2)
  // Sorted by highest averageScore first, then lowest albumCount (1 album before 2), then A-Z
  const underExploredArtists = [...candidatePool]
    .filter((art) => art.albumCount <= 2)
    .sort((a, b) => {
      if (Math.abs(b.averageScore - a.averageScore) > 1e-7) {
        return b.averageScore - a.averageScore;
      }
      if (a.albumCount !== b.albumCount) {
        return a.albumCount - b.albumCount;
      }
      return a.artistName.localeCompare(b.artistName, 'en', { sensitivity: 'base' });
    })
    .slice(0, 6);

  // 2. Seed artists for fetching additional unrated albums via the iTunes API
  // Sorted by highest averageScore descending, then ratedTrackCount descending
  const seedArtists = [...candidatePool]
    .sort((a, b) => {
      if (Math.abs(b.averageScore - a.averageScore) > 1e-7) {
        return b.averageScore - a.averageScore;
      }
      if (b.albumCount !== a.albumCount) {
        return b.albumCount - a.albumCount;
      }
      return a.artistName.localeCompare(b.artistName, 'en', { sensitivity: 'base' });
    })
    .slice(0, 3);

  const seedPart = seedArtists
    .map((s) => s.artistName + ':' + String(s.formattedAverageScore))
    .join('|');
  const idsPart = Array.from(ratedAlbumIds).sort().join(',');
  const fingerprint = seedPart + '__' + idsPart;

  return {
    hasRatings: true,
    totalRatedAlbums: entries.length,
    underExploredArtists,
    seedArtists,
    ratedAlbumIds,
    ratedAlbumTitleKeys,
    fingerprint
  };
}

/**
 * Filters raw album search results for a seed artist so only genuine, unrated albums
 * by that artist are returned. Never fabricates any album or rating fields.
 */
export function filterCandidateDiscoveryAlbums(
  candidateAlbums = [],
  seedArtist,
  ratedAlbumIds = new Set(),
  ratedAlbumTitleKeys = new Set(),
  seenAlbumIds = new Set(),
  perArtistLimit = 3
) {
  if (!Array.isArray(candidateAlbums) || !seedArtist || !seedArtist.artistName) {
    return [];
  }

  const targetArtistKey = normalizeNameKey(seedArtist.artistName);
  if (!targetArtistKey) return [];

  const matched = [];

  for (let i = 0; i < candidateAlbums.length; i += 1) {
    const album = candidateAlbums[i];
    if (!album || !album.collectionId || !album.collectionName) continue;

    const idStr = String(album.collectionId);
    if (ratedAlbumIds.has(idStr) || seenAlbumIds.has(idStr)) continue;

    const albumArtistKey = normalizeNameKey(album.artistName);
    if (!albumArtistKey) continue;

    // Require artist match so unrelated search results are never attributed to the seed artist
    const isSameArtist =
      albumArtistKey === targetArtistKey ||
      albumArtistKey.includes(targetArtistKey) ||
      targetArtistKey.includes(albumArtistKey);

    if (!isSameArtist) continue;

    const titleKey = albumArtistKey + '::' + normalizeNameKey(album.collectionName);
    if (ratedAlbumTitleKeys.has(titleKey)) continue;

    seenAlbumIds.add(idStr);
    ratedAlbumTitleKeys.add(titleKey);

    matched.push({
      ...album,
      discoverySignal: {
        seedArtistName: seedArtist.artistName,
        seedArtistAverageScore: seedArtist.formattedAverageScore || null,
        referenceAlbumTitle: seedArtist.topAlbumTitle || ''
      }
    });

    if (matched.length >= perArtistLimit) {
      break;
    }
  }

  return matched;
}

/**
 * Fetches unrated albums from the user's highest-rated library artists using
 * the existing searchAlbums API function, with session-level caching.
 */
export async function fetchPersonalizedDiscoveryAlbums(
  ratingsMap = {},
  metadataMap = {},
  searchAlbumsFn,
  { forceRefresh = false, curatedList = CURATED_ALBUMS } = {}
) {
  const signals = deriveDiscoverySignals(ratingsMap, metadataMap, curatedList);

  if (!signals.hasRatings || signals.seedArtists.length === 0) {
    return {
      status: 'empty',
      signals,
      recommendedAlbums: [],
      error: null,
      fromCache: false
    };
  }

  if (
    !forceRefresh &&
    discoverySessionCache.fingerprint === signals.fingerprint &&
    discoverySessionCache.result
  ) {
    return {
      ...discoverySessionCache.result,
      fromCache: true
    };
  }

  if (typeof searchAlbumsFn !== 'function') {
    return {
      status: 'error',
      signals,
      recommendedAlbums: [],
      error: 'Catalog search function is unavailable.',
      fromCache: false
    };
  }

  const seenAlbumIds = new Set();
  const titleKeysCopy = new Set(signals.ratedAlbumTitleKeys);
  const recommendedAlbums = [];
  let lastError = null;
  let successCount = 0;

  for (let i = 0; i < signals.seedArtists.length; i += 1) {
    const seedArtist = signals.seedArtists[i];
    try {
      const response = await searchAlbumsFn(seedArtist.artistName);
      const albums = Array.isArray(response?.albums) ? response.albums : [];
      successCount += 1;

      const filtered = filterCandidateDiscoveryAlbums(
        albums,
        seedArtist,
        signals.ratedAlbumIds,
        titleKeysCopy,
        seenAlbumIds,
        3
      );
      recommendedAlbums.push(...filtered);
    } catch (err) {
      lastError = err;
    }
  }

  if (successCount === 0 && lastError) {
    return {
      status: 'error',
      signals,
      recommendedAlbums: [],
      error: lastError.message || 'Unable to load artist catalog recommendations.',
      fromCache: false
    };
  }

  const finalResult = {
    status: 'ready',
    signals,
    recommendedAlbums: recommendedAlbums.slice(0, 6),
    error: null,
    fromCache: false
  };

  discoverySessionCache = {
    fingerprint: signals.fingerprint,
    result: finalResult
  };

  return finalResult;
}