/**
 * RATEPLAY - Music Taste Profile Engine (Phase 6 - Part 1)
 * Pure aggregation functions that compute the user's music taste profile
 * directly from existing localStorage rating records and album metadata.
 */

import {
  CURATED_ALBUMS,
  getTierDetails,
  getHighResArtwork,
  createFallbackCoverDataUri
} from './config.js';
import {
  LIBRARY_SORT_MODES,
  getLibraryEntries,
  sortLibraryEntries,
  calculateLibrarySummary,
  getHiddenLibraryCount
} from './library.js';

/**
 * Aggregates rated albums by artist and returns a deterministically sorted list
 * of the user's most frequently rated artists.
 *
 * Sorting priority:
 * 1. Rated album count (descending)
 * 2. Artist average album score across scored albums (descending)
 * 3. Total rated tracks across artist's albums (descending)
 * 4. Artist name (A-Z)
 */
export function calculateMostFrequentlyRatedArtists(entries = [], limit = 6) {
  const safeEntries = Array.isArray(entries) ? entries : [];
  const artistBuckets = new Map();

  safeEntries.forEach((entry) => {
    const rawArtist = String(entry?.artistName || 'Unknown Artist').trim() || 'Unknown Artist';
    const key = rawArtist.toLowerCase();

    if (!artistBuckets.has(key)) {
      artistBuckets.set(key, {
        artistKey: key,
        artistName: rawArtist,
        albumCount: 0,
        scoredAlbumCount: 0,
        ratedTrackCount: 0,
        scoredTrackCount: 0,
        sumScores: 0,
        albums: []
      });
    }

    const bucket = artistBuckets.get(key);
    bucket.albumCount += 1;
    bucket.ratedTrackCount += Number(entry.ratedTrackCount) || 0;
    bucket.scoredTrackCount += Number(entry.scoredTrackCount) || 0;
    if (entry.overallScore !== null && Number.isFinite(entry.overallScore)) {
      bucket.scoredAlbumCount += 1;
      bucket.sumScores += entry.overallScore;
    }
    bucket.albums.push(entry);
  });

  const artistList = Array.from(artistBuckets.values()).map((bucket) => {
    const sortedArtistAlbums = sortLibraryEntries(
      bucket.albums,
      LIBRARY_SORT_MODES.SCORE_DESC
    );
    const representativeAlbum = sortedArtistAlbums[0] || null;

    let averageScore = null;
    let formattedAverageScore = null;
    if (bucket.scoredAlbumCount > 0) {
      const rawMean = bucket.sumScores / bucket.scoredAlbumCount;
      averageScore = Math.round(rawMean * 10) / 10;
      formattedAverageScore = averageScore.toFixed(1);
    }

    const tierDetails = getTierDetails(averageScore);
    const artworkUrl100 = representativeAlbum?.artworkUrl100 || '';
    const coverUrl = artworkUrl100
      ? getHighResArtwork(artworkUrl100, 600)
      : createFallbackCoverDataUri(bucket.artistName);

    return {
      artistName: bucket.artistName,
      albumCount: bucket.albumCount,
      scoredAlbumCount: bucket.scoredAlbumCount,
      ratedTrackCount: bucket.ratedTrackCount,
      scoredTrackCount: bucket.scoredTrackCount,
      averageScore,
      formattedAverageScore,
      tierLabel: tierDetails.label,
      tierColor: tierDetails.color,
      topAlbum: representativeAlbum,
      topAlbumTitle: representativeAlbum ? representativeAlbum.collectionName : '',
      topAlbumId: representativeAlbum ? representativeAlbum.collectionId : null,
      artworkUrl100,
      coverUrl,
      fallbackCoverUrl: createFallbackCoverDataUri(bucket.artistName)
    };
  });

  artistList.sort((a, b) => {
    if (b.albumCount !== a.albumCount) {
      return b.albumCount - a.albumCount;
    }
    const hasScoreA = a.averageScore !== null && Number.isFinite(a.averageScore);
    const hasScoreB = b.averageScore !== null && Number.isFinite(b.averageScore);
    if (hasScoreA && !hasScoreB) return -1;
    if (!hasScoreA && hasScoreB) return 1;
    if (hasScoreA && hasScoreB && Math.abs(b.averageScore - a.averageScore) > 1e-7) {
      return b.averageScore - a.averageScore;
    }
    if (b.ratedTrackCount !== a.ratedTrackCount) {
      return b.ratedTrackCount - a.ratedTrackCount;
    }
    return a.artistName.localeCompare(b.artistName, 'en', { sensitivity: 'base' });
  });

  return limit > 0 ? artistList.slice(0, limit) : artistList;
}

/**
 * Builds the complete Music Taste Profile object from saved ratings and cached metadata.
 */
export function buildMusicTasteProfile(
  ratingsMap = {},
  metadataMap = {},
  options = {},
  curatedList = CURATED_ALBUMS
) {
  const topAlbumsLimit = Number(options.topAlbumsLimit) > 0 ? Number(options.topAlbumsLimit) : 5;
  const topArtistsLimit = Number(options.topArtistsLimit) > 0 ? Number(options.topArtistsLimit) : 5;
  const recentAlbumsLimit =
    Number(options.recentAlbumsLimit) > 0 ? Number(options.recentAlbumsLimit) : 5;

  const allEntries = getLibraryEntries(ratingsMap, metadataMap, curatedList);
  const summary = calculateLibrarySummary(allEntries);
  const hiddenCount = getHiddenLibraryCount(ratingsMap);

  const scoredEntries = allEntries.filter(
    (entry) => entry.overallScore !== null && Number.isFinite(entry.overallScore)
  );

  const highestRatedAlbums = sortLibraryEntries(
    scoredEntries,
    LIBRARY_SORT_MODES.SCORE_DESC
  ).slice(0, topAlbumsLimit);

  const mostFrequentArtists = calculateMostFrequentlyRatedArtists(
    allEntries,
    topArtistsLimit
  );

  const recentlyRatedAlbums = sortLibraryEntries(
    allEntries,
    LIBRARY_SORT_MODES.UPDATED_DESC
  ).slice(0, recentAlbumsLimit);

  const averageTier = getTierDetails(summary.averageAlbumScore);

  return {
    isEmpty: allEntries.length === 0,
    isShareable: allEntries.length > 0,
    hiddenCount,
    totalRatedAlbums: summary.totalAlbums,
    scoredAlbumsCount: summary.scoredAlbumsCount,
    completeAlbumsCount: summary.completeAlbumsCount,
    incompleteAlbumsCount: summary.incompleteAlbumsCount,
    totalRatedTracks: summary.totalRatedTracks,
    totalScoredTracks: summary.totalScoredTracks,
    totalExcludedRatedTracks: summary.totalExcludedRatedTracks,
    averageRating: summary.averageAlbumScore,
    formattedAverageRating: summary.formattedAverageScore,
    averageTierLabel: averageTier.label,
    averageTierColor: averageTier.color,
    highestRatedAlbums,
    mostFrequentArtists,
    recentlyRatedAlbums,
    allEntries
  };
}