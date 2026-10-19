/**
 * RATEPLAY - Listening Insights & Taste DNA Engine (Phase 7)
 * Pure functions computing:
 * 1. Taste DNA (top artists, available genres, preferred decades, and explicit metadata coverage)
 * 2. Rating Distribution (mean, median, scored vs unscored counts, and tier distribution bars)
 * 3. Artist Rankings (with explicit sample sizes and multi-album confidence prioritization)
 * 4. Decade Breakdown (grouped by release decade with safe missing-date handling)
 * 5. Hidden Gems (transparently selected from local library data without fabricated popularity claims)
 */

import {
  CURATED_ALBUMS,
  getTierDetails,
  formatReleaseYear,
  getHighResArtwork,
  createFallbackCoverDataUri
} from './config.js';
import {
  LIBRARY_SORT_MODES,
  getLibraryEntries,
  sortLibraryEntries,
  getHiddenLibraryCount
} from './library.js';

/**
 * Checks whether an album entry has a specific, non-placeholder genre.
 */
export function hasKnownGenreMetadata(entry) {
  if (!entry || !entry.hasFullMetadata) return false;
  const raw = String(entry.primaryGenreName || '').trim().toLowerCase();
  if (!raw || raw === 'music' || raw === 'unknown' || raw === 'unknown genre' || raw === 'n/a') {
    return false;
  }
  return true;
}

/**
 * Checks whether an album entry has a known, non-placeholder artist name.
 */
export function hasKnownArtistMetadata(entry) {
  if (!entry) return false;
  const raw = String(entry.artistName || '').trim().toLowerCase();
  if (!raw || raw === 'unknown artist' || raw === 'unknown') {
    return false;
  }
  return true;
}

/**
 * Safely extracts a release decade object from an album entry or release date string.
 * Returns null if the release year is missing, malformed, or outside 1900..2099.
 */
export function extractReleaseDecade(entryOrDateString) {
  const rawYear =
    typeof entryOrDateString === 'object' && entryOrDateString !== null
      ? entryOrDateString.releaseYear || formatReleaseYear(entryOrDateString.releaseDate)
      : formatReleaseYear(entryOrDateString);

  const cleanYear = String(rawYear || '').trim();
  if (cleanYear.length !== 4 || /[^0-9]/.test(cleanYear)) {
    return null;
  }

  const numericYear = Number(cleanYear);
  if (!Number.isFinite(numericYear) || numericYear < 1900 || numericYear > 2099) {
    return null;
  }

  const decadeStart = Math.floor(numericYear / 10) * 10;
  return {
    year: numericYear,
    decadeStart,
    decadeLabel: String(decadeStart) + 's'
  };
}

/**
 * Calculates the exact statistical median of an array of numeric scores,
 * rounded to 1 decimal place. Returns null for empty arrays.
 */
export function calculateMedianScore(numericScores = []) {
  const valid = (Array.isArray(numericScores) ? numericScores : [])
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n) && n >= 1.0 && n <= 10.0)
    .sort((a, b) => a - b);

  if (valid.length === 0) {
    return null;
  }

  const mid = Math.floor(valid.length / 2);
  const rawMedian =
    valid.length % 2 === 1
      ? valid[mid]
      : (valid[mid - 1] + valid[mid]) / 2;

  return Math.round(rawMedian * 10) / 10;
}

/**
 * 2. RATING DISTRIBUTION
 * Computes average rating, median rating, total rated albums, scored albums,
 * and visual tier distribution buckets. Excludes unscored/unrated albums from score math.
 */
export function calculateRatingDistribution(entries = []) {
  const safeEntries = Array.isArray(entries) ? entries : [];
  const scoredEntries = safeEntries.filter(
    (e) => e && e.overallScore !== null && Number.isFinite(Number(e.overallScore))
  );
  const unscoredCount = Math.max(0, safeEntries.length - scoredEntries.length);

  const scores = scoredEntries.map((e) => Number(e.overallScore));
  const scoredCount = scores.length;

  let averageScore = null;
  let formattedAverageScore = null;
  let highestScore = null;
  let lowestScore = null;

  if (scoredCount > 0) {
    const sum = scores.reduce((acc, val) => acc + val, 0);
    averageScore = Math.round((sum / scoredCount) * 10) / 10;
    formattedAverageScore = averageScore.toFixed(1);
    highestScore = Math.max(...scores);
    lowestScore = Math.min(...scores);
  }

  const medianScore = calculateMedianScore(scores);
  const formattedMedianScore = medianScore !== null ? medianScore.toFixed(1) : null;

  const tierDefinitions = [
    {
      id: 'masterpiece',
      label: 'Masterpiece',
      rangeLabel: '9.0 \u2013 10.0',
      min: 9.0,
      max: 10.0,
      color: 'var(--tier-masterpiece)',
      hexDark: '#10B981',
      hexLight: '#059669'
    },
    {
      id: 'essential',
      label: 'Essential',
      rangeLabel: '7.5 \u2013 8.9',
      min: 7.5,
      max: 8.99,
      color: 'var(--tier-great)',
      hexDark: '#E8A838',
      hexLight: '#B87308'
    },
    {
      id: 'solid',
      label: 'Solid',
      rangeLabel: '6.0 \u2013 7.4',
      min: 6.0,
      max: 7.49,
      color: 'var(--tier-solid)',
      hexDark: '#38BDF8',
      hexLight: '#0284C7'
    },
    {
      id: 'mixed',
      label: 'Mixed',
      rangeLabel: '4.0 \u2013 5.9',
      min: 4.0,
      max: 5.99,
      color: 'var(--tier-mixed)',
      hexDark: '#94A3B8',
      hexLight: '#475569'
    },
    {
      id: 'skip',
      label: 'Skip',
      rangeLabel: '1.0 \u2013 3.9',
      min: 1.0,
      max: 3.99,
      color: 'var(--tier-poor)',
      hexDark: '#EF4444',
      hexLight: '#DC2626'
    }
  ];

  const tierBuckets = tierDefinitions.map((def) => {
    const matching = scoredEntries.filter(
      (e) => e.overallScore >= def.min - 1e-7 && e.overallScore <= def.max + 1e-7
    );
    const count = matching.length;
    const percentage =
      scoredCount > 0 ? Math.round((count / scoredCount) * 100) : 0;

    return {
      ...def,
      count,
      percentage
    };
  });

  const maxBucketCount = tierBuckets.reduce(
    (max, b) => (b.count > max ? b.count : max),
    0
  );

  const enrichedBuckets = tierBuckets.map((b) => ({
    ...b,
    barWidthPercent:
      maxBucketCount > 0 ? Math.round((b.count / maxBucketCount) * 100) : 0
  }));

  const avgTier = getTierDetails(averageScore);
  const medianTier = getTierDetails(medianScore);

  return {
    totalRatedAlbums: safeEntries.length,
    scoredAlbumsCount: scoredCount,
    unscoredAlbumsCount: unscoredCount,
    averageScore,
    formattedAverageScore,
    averageTierLabel: avgTier.label,
    averageTierColor: avgTier.color,
    medianScore,
    formattedMedianScore,
    medianTierLabel: medianTier.label,
    medianTierColor: medianTier.color,
    highestScore,
    formattedHighestScore: highestScore !== null ? highestScore.toFixed(1) : null,
    lowestScore,
    formattedLowestScore: lowestScore !== null ? lowestScore.toFixed(1) : null,
    tierBuckets: enrichedBuckets
  };
}

/**
 * 3. ARTIST RANKINGS
 * Ranks artists using the user's existing album ratings.
 * Displays rated album counts, scored album counts, rated track counts, and average score.
 * Avoids misleading rankings based on only 1 album by separating/prioritizing
 * Multi-Album Catalog Artists (2+ scored albums) ahead of Single-Album Samples (1 scored album)
 * and attaching explicit sample-size labels to every artist.
 */
export function calculateArtistRankings(entries = []) {
  const safeEntries = Array.isArray(entries) ? entries : [];
  const buckets = new Map();
  let unknownArtistAlbumCount = 0;

  safeEntries.forEach((entry) => {
    if (!hasKnownArtistMetadata(entry)) {
      unknownArtistAlbumCount += 1;
      return;
    }

    const rawName = String(entry.artistName).trim();
    const key = rawName.toLowerCase();

    if (!buckets.has(key)) {
      buckets.set(key, {
        artistKey: key,
        artistName: rawName,
        albumCount: 0,
        scoredAlbumCount: 0,
        ratedTrackCount: 0,
        scoredTrackCount: 0,
        sumScores: 0,
        albums: []
      });
    }

    const bucket = buckets.get(key);
    bucket.albumCount += 1;
    bucket.ratedTrackCount += Number(entry.ratedTrackCount) || 0;
    bucket.scoredTrackCount += Number(entry.scoredTrackCount) || 0;
    if (entry.overallScore !== null && Number.isFinite(entry.overallScore)) {
      bucket.scoredAlbumCount += 1;
      bucket.sumScores += entry.overallScore;
    }
    bucket.albums.push(entry);
  });

  const allArtists = Array.from(buckets.values()).map((bucket) => {
    const sortedAlbums = sortLibraryEntries(
      bucket.albums,
      LIBRARY_SORT_MODES.SCORE_DESC
    );
    const topAlbum = sortedAlbums[0] || null;

    let averageScore = null;
    let formattedAverageScore = null;
    if (bucket.scoredAlbumCount > 0) {
      const mean = bucket.sumScores / bucket.scoredAlbumCount;
      averageScore = Math.round(mean * 10) / 10;
      formattedAverageScore = averageScore.toFixed(1);
    }

    const tier = getTierDetails(averageScore);
    const isMultiAlbumSample = bucket.scoredAlbumCount >= 2;
    const isSingleAlbumSample = bucket.scoredAlbumCount === 1;

    const sampleBadgeText = isMultiAlbumSample
      ? String(bucket.scoredAlbumCount) +
        ' SCORED LPs \u00B7 ' +
        String(bucket.ratedTrackCount) +
        ' TRACKS'
      : isSingleAlbumSample
      ? '1 LP SAMPLE \u00B7 ' + String(bucket.ratedTrackCount) + ' TRACKS'
      : String(bucket.albumCount) + ' LP (UNSCORED)';

    const sampleConfidenceNote = isMultiAlbumSample
      ? 'Multi-album catalog sample (' + String(bucket.scoredAlbumCount) + ' scored albums)'
      : isSingleAlbumSample
      ? 'Single-album sample (based on 1 rated album)'
      : 'Excluded from score ranking (no scored tracks)';

    const artworkUrl100 = topAlbum?.artworkUrl100 || '';
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
      tierLabel: tier.label,
      tierColor: tier.color,
      hexDark: tier.hexDark,
      hexLight: tier.hexLight,
      isMultiAlbumSample,
      isSingleAlbumSample,
      sampleCategory: isMultiAlbumSample
        ? 'multi'
        : isSingleAlbumSample
        ? 'single'
        : 'unscored',
      sampleBadgeText,
      sampleConfidenceNote,
      topAlbum,
      topAlbumTitle: topAlbum ? topAlbum.collectionName : '',
      topAlbumId: topAlbum ? topAlbum.collectionId : null,
      coverUrl,
      fallbackCoverUrl: createFallbackCoverDataUri(bucket.artistName)
    };
  });

  const compareScoredArtists = (a, b) => {
    if (Math.abs(b.averageScore - a.averageScore) > 1e-7) {
      return b.averageScore - a.averageScore;
    }
    if (b.scoredAlbumCount !== a.scoredAlbumCount) {
      return b.scoredAlbumCount - a.scoredAlbumCount;
    }
    if (b.ratedTrackCount !== a.ratedTrackCount) {
      return b.ratedTrackCount - a.ratedTrackCount;
    }
    return a.artistName.localeCompare(b.artistName, 'en', { sensitivity: 'base' });
  };

  // Multi-album artists (2+ scored albums) ranked by averageScore desc
  const multiAlbumArtists = allArtists
    .filter((a) => a.isMultiAlbumSample)
    .sort(compareScoredArtists);

  // Single-album artists (1 scored album) ranked by averageScore desc
  const singleAlbumArtists = allArtists
    .filter((a) => a.isSingleAlbumSample)
    .sort(compareScoredArtists);

  // Combined confidence-aware ranking:
  // Multi-album sample artists lead so a single 1-LP rating does not outrank a multi-album catalog average.
  const rankedArtists = [...multiAlbumArtists, ...singleAlbumArtists];

  return {
    rankedArtists,
    multiAlbumArtists,
    singleAlbumArtists,
    totalKnownArtists: allArtists.length,
    unknownArtistAlbumCount
  };
}

/**
 * 4. DECADE BREAKDOWN
 * Groups rated albums by release decade, calculates album counts and average ratings,
 * and handles missing or invalid release dates safely without NaN.
 */
export function calculateDecadeBreakdown(entries = []) {
  const safeEntries = Array.isArray(entries) ? entries : [];
  const decadeBuckets = new Map();
  const unknownDecadeAlbums = [];

  safeEntries.forEach((entry) => {
    const decadeInfo = extractReleaseDecade(entry);
    if (!decadeInfo) {
      unknownDecadeAlbums.push(entry);
      return;
    }

    const key = decadeInfo.decadeLabel;
    if (!decadeBuckets.has(key)) {
      decadeBuckets.set(key, {
        decadeLabel: key,
        decadeStart: decadeInfo.decadeStart,
        albumCount: 0,
        scoredAlbumCount: 0,
        ratedTrackCount: 0,
        sumScores: 0,
        albums: []
      });
    }

    const bucket = decadeBuckets.get(key);
    bucket.albumCount += 1;
    bucket.ratedTrackCount += Number(entry.ratedTrackCount) || 0;
    if (entry.overallScore !== null && Number.isFinite(entry.overallScore)) {
      bucket.scoredAlbumCount += 1;
      bucket.sumScores += entry.overallScore;
    }
    bucket.albums.push(entry);
  });

  const maxDecadeCount = Array.from(decadeBuckets.values()).reduce(
    (max, b) => (b.albumCount > max ? b.albumCount : max),
    0
  );

  const decadesChronological = Array.from(decadeBuckets.values())
    .map((bucket) => {
      const sortedAlbums = sortLibraryEntries(
        bucket.albums,
        LIBRARY_SORT_MODES.SCORE_DESC
      );
      const topAlbum = sortedAlbums[0] || null;

      let averageScore = null;
      let formattedAverageScore = null;
      if (bucket.scoredAlbumCount > 0) {
        const mean = bucket.sumScores / bucket.scoredAlbumCount;
        averageScore = Math.round(mean * 10) / 10;
        formattedAverageScore = averageScore.toFixed(1);
      }

      const tier = getTierDetails(averageScore);

      return {
        decadeLabel: bucket.decadeLabel,
        decadeStart: bucket.decadeStart,
        albumCount: bucket.albumCount,
        scoredAlbumCount: bucket.scoredAlbumCount,
        ratedTrackCount: bucket.ratedTrackCount,
        averageScore,
        formattedAverageScore,
        tierLabel: tier.label,
        tierColor: tier.color,
        hexDark: tier.hexDark,
        hexLight: tier.hexLight,
        barWidthPercent:
          maxDecadeCount > 0
            ? Math.round((bucket.albumCount / maxDecadeCount) * 100)
            : 0,
        topAlbum,
        topAlbumTitle: topAlbum ? topAlbum.collectionName : '',
        topAlbumArtist: topAlbum ? topAlbum.artistName : '',
        topAlbumId: topAlbum ? topAlbum.collectionId : null
      };
    })
    .sort((a, b) => a.decadeStart - b.decadeStart);

  // Preferred decades sorted by albumCount desc, then averageScore desc
  const preferredDecades = [...decadesChronological].sort((a, b) => {
    if (b.albumCount !== a.albumCount) {
      return b.albumCount - a.albumCount;
    }
    const scoreA = a.averageScore ?? -1;
    const scoreB = b.averageScore ?? -1;
    if (Math.abs(scoreB - scoreA) > 1e-7) {
      return scoreB - scoreA;
    }
    return b.decadeStart - a.decadeStart;
  });

  // Unknown decade summary when releaseDate is missing or invalid
  let unknownScoredCount = 0;
  let unknownSumScores = 0;
  let unknownRatedTracks = 0;
  unknownDecadeAlbums.forEach((alb) => {
    unknownRatedTracks += Number(alb.ratedTrackCount) || 0;
    if (alb.overallScore !== null && Number.isFinite(alb.overallScore)) {
      unknownScoredCount += 1;
      unknownSumScores += alb.overallScore;
    }
  });

  const unknownAvg =
    unknownScoredCount > 0
      ? Math.round((unknownSumScores / unknownScoredCount) * 10) / 10
      : null;

  return {
    decades: decadesChronological,
    preferredDecades,
    preferredDecade: preferredDecades[0] || null,
    knownDecadeAlbumCount: safeEntries.length - unknownDecadeAlbums.length,
    unavailableDecadeAlbumCount: unknownDecadeAlbums.length,
    unknownDecadeSummary: {
      decadeLabel: 'Release Year Unavailable',
      albumCount: unknownDecadeAlbums.length,
      scoredAlbumCount: unknownScoredCount,
      ratedTrackCount: unknownRatedTracks,
      averageScore: unknownAvg,
      formattedAverageScore: unknownAvg !== null ? unknownAvg.toFixed(1) : null
    }
  };
}

/**
 * 1. TASTE DNA
 * Summarizes the user's music taste using existing rated albums:
 * - Top artists
 * - Available genres
 * - Preferred release decades
 * - Explicit distinction between known metadata and unavailable metadata
 */
export function calculateTasteDna(entries = []) {
  const safeEntries = Array.isArray(entries) ? entries : [];
  const artistRankings = calculateArtistRankings(safeEntries);
  const decadeBreakdown = calculateDecadeBreakdown(safeEntries);

  // Aggregate available genres vs unavailable genre metadata
  const genreBuckets = new Map();
  let unavailableGenreAlbumCount = 0;

  safeEntries.forEach((entry) => {
    if (!hasKnownGenreMetadata(entry)) {
      unavailableGenreAlbumCount += 1;
      return;
    }

    const rawGenre = String(entry.primaryGenreName).trim();
    const key = rawGenre.toLowerCase();

    if (!genreBuckets.has(key)) {
      genreBuckets.set(key, {
        genreName: rawGenre,
        albumCount: 0,
        scoredAlbumCount: 0,
        ratedTrackCount: 0,
        sumScores: 0
      });
    }

    const bucket = genreBuckets.get(key);
    bucket.albumCount += 1;
    bucket.ratedTrackCount += Number(entry.ratedTrackCount) || 0;
    if (entry.overallScore !== null && Number.isFinite(entry.overallScore)) {
      bucket.scoredAlbumCount += 1;
      bucket.sumScores += entry.overallScore;
    }
  });

  const knownGenreAlbumCount = safeEntries.length - unavailableGenreAlbumCount;

  const availableGenres = Array.from(genreBuckets.values())
    .map((bucket) => {
      let averageScore = null;
      let formattedAverageScore = null;
      if (bucket.scoredAlbumCount > 0) {
        const mean = bucket.sumScores / bucket.scoredAlbumCount;
        averageScore = Math.round(mean * 10) / 10;
        formattedAverageScore = averageScore.toFixed(1);
      }

      const sharePercent =
        knownGenreAlbumCount > 0
          ? Math.round((bucket.albumCount / knownGenreAlbumCount) * 100)
          : 0;

      const tier = getTierDetails(averageScore);

      return {
        genreName: bucket.genreName,
        albumCount: bucket.albumCount,
        scoredAlbumCount: bucket.scoredAlbumCount,
        ratedTrackCount: bucket.ratedTrackCount,
        averageScore,
        formattedAverageScore,
        sharePercent,
        tierColor: tier.color,
        hexDark: tier.hexDark,
        hexLight: tier.hexLight
      };
    })
    .sort((a, b) => {
      if (b.albumCount !== a.albumCount) {
        return b.albumCount - a.albumCount;
      }
      const scoreA = a.averageScore ?? -1;
      const scoreB = b.averageScore ?? -1;
      if (Math.abs(scoreB - scoreA) > 1e-7) {
        return scoreB - scoreA;
      }
      return a.genreName.localeCompare(b.genreName, 'en', { sensitivity: 'base' });
    });

  const metadataCoverage = {
    totalAlbums: safeEntries.length,
    knownArtistAlbums: safeEntries.length - artistRankings.unknownArtistAlbumCount,
    unavailableArtistAlbums: artistRankings.unknownArtistAlbumCount,
    knownGenreAlbums: knownGenreAlbumCount,
    unavailableGenreAlbums: unavailableGenreAlbumCount,
    knownDecadeAlbums: decadeBreakdown.knownDecadeAlbumCount,
    unavailableDecadeAlbums: decadeBreakdown.unavailableDecadeAlbumCount
  };

  // Build concise, factual Taste DNA synthesis sentence from known data only
  const topArtist = artistRankings.rankedArtists[0]?.artistName || null;
  const topGenre = availableGenres[0]?.genreName || null;
  const topDecade = decadeBreakdown.preferredDecade?.decadeLabel || null;

  const summaryParts = [];
  if (topGenre) summaryParts.push(topGenre);
  if (topDecade) summaryParts.push(topDecade + ' pressings');
  if (topArtist) summaryParts.push('anchored by ' + topArtist);

  const dnaHeadline =
    safeEntries.length === 0
      ? 'No rated albums in your library yet.'
      : summaryParts.length > 0
      ? 'Centered on ' + summaryParts.join(', ') + '.'
      : 'Built from ' + String(safeEntries.length) + ' rated library album(s) with partial catalog metadata.';

  return {
    dnaHeadline,
    topArtists: artistRankings.rankedArtists.slice(0, 5),
    availableGenres,
    preferredDecades: decadeBreakdown.preferredDecades,
    metadataCoverage
  };
}

/**
 * 5. HIDDEN GEMS
 * Identifies highly rated albums (overallScore >= 7.5) in the user's existing library
 * that have relatively few ratings (fewer rated tracks than the library median or <= 3 tracks)
 * OR represent less frequently rated artists (artists with only 1 rated album in the library).
 * Never invents external popularity data.
 */
export function identifyHiddenGems(entries = [], { minScore = 7.5, limit = 6 } = {}) {
  const safeEntries = Array.isArray(entries) ? entries : [];
  const scoredEntries = safeEntries.filter(
    (e) => e && e.overallScore !== null && Number.isFinite(e.overallScore)
  );

  const methodologyText =
    'Selected strictly from your local RATEPLAY library: albums scored ' +
    minScore.toFixed(1) +
    '+ that either represent an artist you have only rated once in your library or have fewer logged track ratings than your collection median. No external streaming or commercial popularity data is assumed.';

  if (scoredEntries.length === 0) {
    return {
      methodologyText,
      medianRatedTracks: 0,
      gems: []
    };
  }

  // Count how many rated albums each artist has in the user's library
  const artistAlbumCounts = new Map();
  safeEntries.forEach((e) => {
    const key = String(e.artistName || 'Unknown Artist').trim().toLowerCase();
    artistAlbumCounts.set(key, (artistAlbumCounts.get(key) || 0) + 1);
  });

  // Compute median ratedTrackCount across the library
  const trackCountsSorted = safeEntries
    .map((e) => Number(e.ratedTrackCount) || 0)
    .filter((c) => c > 0)
    .sort((a, b) => a - b);

  const midIdx = Math.floor(trackCountsSorted.length / 2);
  const medianRatedTracks =
    trackCountsSorted.length === 0
      ? 0
      : trackCountsSorted.length % 2 === 1
      ? trackCountsSorted[midIdx]
      : (trackCountsSorted[midIdx - 1] + trackCountsSorted[midIdx]) / 2;

  const lowTrackThreshold = Math.max(3, Math.floor(medianRatedTracks));

  const candidateGems = [];

  scoredEntries.forEach((entry) => {
    if (entry.overallScore < minScore - 1e-7) return;

    const artistKey = String(entry.artistName || 'Unknown Artist').trim().toLowerCase();
    const artistCount = artistAlbumCounts.get(artistKey) || 1;
    const isSingleAlbumArtist = artistCount === 1;
    const hasFewerRatedTracks =
      entry.ratedTrackCount <= lowTrackThreshold ||
      entry.completionStatus === 'incomplete';

    if (!isSingleAlbumArtist && !hasFewerRatedTracks) {
      return;
    }

    const criteriaTags = [];
    const reasons = [];

    if (isSingleAlbumArtist) {
      criteriaTags.push('1 LP BY ARTIST IN LIBRARY');
      reasons.push(
        'only 1 album by ' + entry.artistName + ' is rated in your library'
      );
    }

    if (hasFewerRatedTracks) {
      const ratioStr =
        entry.totalTrackCount > 0
          ? String(entry.ratedTrackCount) + '/' + String(entry.totalTrackCount) + ' tracks rated'
          : String(entry.ratedTrackCount) +
            ' ' +
            (entry.ratedTrackCount === 1 ? 'track' : 'tracks') +
            ' rated';
      criteriaTags.push(ratioStr.toUpperCase());
      reasons.push('logged with ' + ratioStr);
    }

    const tier = getTierDetails(entry.overallScore);

    candidateGems.push({
      ...entry,
      artistAlbumCountInLibrary: artistCount,
      isSingleAlbumArtist,
      hasFewerRatedTracks,
      tierLabel: tier.label,
      tierColor: tier.color,
      hexDark: tier.hexDark,
      hexLight: tier.hexLight,
      criteriaTags,
      criteriaExplanation:
        'Scored ' +
        entry.formattedScore +
        ' (' +
        tier.label +
        ') \u2014 selected because ' +
        reasons.join(' and ') +
        '.'
    });
  });

  // Sort Hidden Gems:
  // 1. Albums meeting BOTH criteria (single-album artist + fewer rated tracks) or single-album artist first
  // 2. Highest overallScore descending
  // 3. Fewest ratedTrackCount ascending (least rated first)
  // 4. Album Title A-Z
  candidateGems.sort((a, b) => {
    if (a.isSingleAlbumArtist !== b.isSingleAlbumArtist) {
      return a.isSingleAlbumArtist ? -1 : 1;
    }
    if (Math.abs(b.overallScore - a.overallScore) > 1e-7) {
      return b.overallScore - a.overallScore;
    }
    if (a.ratedTrackCount !== b.ratedTrackCount) {
      return a.ratedTrackCount - b.ratedTrackCount;
    }
    return String(a.collectionName).localeCompare(String(b.collectionName), 'en', {
      sensitivity: 'base'
    });
  });

  return {
    methodologyText,
    medianRatedTracks,
    gems: limit > 0 ? candidateGems.slice(0, limit) : candidateGems
  };
}

/**
 * Master orchestrator that computes all Phase 7 Listening Insights sections
 * from the user's saved ratingsMap and albumMetadataMap.
 */
export function buildListeningInsights(
  ratingsMap = {},
  metadataMap = {},
  curatedList = CURATED_ALBUMS
) {
  const allEntries = getLibraryEntries(ratingsMap, metadataMap, curatedList);
  const hiddenCount = getHiddenLibraryCount(ratingsMap);

  const tasteDna = calculateTasteDna(allEntries);
  const ratingDistribution = calculateRatingDistribution(allEntries);
  const artistRankings = calculateArtistRankings(allEntries);
  const decadeBreakdown = calculateDecadeBreakdown(allEntries);
  const hiddenGems = identifyHiddenGems(allEntries);

  return {
    isEmpty: allEntries.length === 0,
    isShareable: ratingDistribution.scoredAlbumsCount > 0,
    hiddenCount,
    totalRatedAlbums: allEntries.length,
    scoredAlbumsCount: ratingDistribution.scoredAlbumsCount,
    tasteDna,
    ratingDistribution,
    artistRankings,
    decadeBreakdown,
    hiddenGems,
    allEntries
  };
}