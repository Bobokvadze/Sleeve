/**
 * SLEEVE - Pure Album Score & Track Highlights Calculator (Phase 3 & 4)
 */

export const RATING_MIN = 1.0;
export const RATING_MAX = 10.0;
export const RATING_STEP = 0.5;

export const VALID_RATINGS = Array.from(
  { length: Math.round((RATING_MAX - RATING_MIN) / RATING_STEP) + 1 },
  (_, idx) => Number((RATING_MIN + idx * RATING_STEP).toFixed(1))
);

export function isValidTrackRating(value) {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') {
    return false;
  }
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) {
    return false;
  }
  if (num < RATING_MIN - 1e-9 || num > RATING_MAX + 1e-9) {
    return false;
  }
  const doubled = num * 2;
  return Math.abs(doubled - Math.round(doubled)) < 1e-7;
}

export function parseTrackRating(value) {
  if (!isValidTrackRating(value)) {
    return null;
  }
  const num = Number(value);
  return Math.round(num * 2) / 2;
}

export function stepTrackRating(currentRating, direction = 1) {
  const validCurrent = parseTrackRating(currentRating);
  if (validCurrent === null) {
    return direction >= 0 ? 7.0 : 6.0;
  }
  const delta = direction >= 0 ? RATING_STEP : -RATING_STEP;
  const next = Math.round((validCurrent + delta) * 2) / 2;
  if (next < RATING_MIN) return RATING_MIN;
  if (next > RATING_MAX) return RATING_MAX;
  return next;
}

export function getStableTrackKey(track, index = 0) {
  if (track && track.trackId !== undefined && track.trackId !== null) {
    const rawId = String(track.trackId).trim();
    if (rawId.length > 0 && rawId !== '0' && rawId !== 'NaN') {
      return rawId;
    }
  }
  const disc = Number(track?.discNumber) || 1;
  const num = Number(track?.trackNumber) || index + 1;
  const fallbackName = 'track-' + String(index + 1);
  const rawSlug = String(track?.trackName || fallbackName)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-');
  let startIdx = 0;
  let endIdx = rawSlug.length;
  while (startIdx < endIdx && rawSlug[startIdx] === '-') startIdx += 1;
  while (endIdx > startIdx && rawSlug[endIdx - 1] === '-') endIdx -= 1;
  const slug = rawSlug.slice(startIdx, endIdx) || 'track';
  return 'd' + String(disc) + '-t' + String(num) + '-' + slug;
}

export function normalizeTrackState(rawState = {}) {
  if (!rawState || typeof rawState !== 'object') {
    return {
      rating: null,
      interlude: false,
      included: true
    };
  }

  return {
    rating: parseTrackRating(rawState.rating),
    interlude: Boolean(rawState.interlude),
    included: rawState.included === undefined ? true : Boolean(rawState.included)
  };
}

export function mergeTrackState(existingState = {}, patch = {}) {
  const base = normalizeTrackState(existingState);
  const next = { ...base };

  if (Object.prototype.hasOwnProperty.call(patch, 'rating')) {
    next.rating = parseTrackRating(patch.rating);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'interlude')) {
    next.interlude = Boolean(patch.interlude);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'included')) {
    next.included = Boolean(patch.included);
  }

  return next;
}

/**
 * Computes score metrics directly from a saved trackRatings map even when
 * the full external tracklist array is not currently loaded in memory.
 */
export function calculateMetricsFromTrackRatingsMap(trackRatingsMap = {}, knownTotalTracks = 0) {
  const safeMap =
    trackRatingsMap && typeof trackRatingsMap === 'object' && !Array.isArray(trackRatingsMap)
      ? trackRatingsMap
      : {};

  const keys = Object.keys(safeMap);
  let ratedCount = 0;
  let scoredCount = 0;
  let excludedRatedCount = 0;
  let excludedUnratedCount = 0;
  let interludeCount = 0;
  let sumScored = 0;

  keys.forEach((key) => {
    const st = normalizeTrackState(safeMap[key]);
    const hasRating = st.rating !== null;
    if (st.interlude) {
      interludeCount += 1;
    }
    if (hasRating) {
      ratedCount += 1;
      if (st.included) {
        scoredCount += 1;
        sumScored += st.rating;
      } else {
        excludedRatedCount += 1;
      }
    } else if (!st.included) {
      excludedUnratedCount += 1;
    }
  });

  const totalKnown = Math.max(0, Number(knownTotalTracks) || 0);
  const totalExcluded = excludedRatedCount + excludedUnratedCount;
  const includedCount = totalKnown > 0 ? Math.max(0, totalKnown - totalExcluded) : scoredCount;

  let overallScore = null;
  let formattedScore = null;
  if (scoredCount > 0) {
    const mean = sumScored / scoredCount;
    overallScore = Math.round(mean * 10) / 10;
    formattedScore = overallScore.toFixed(1);
  }

  return {
    ratedCount,
    scoredCount,
    excludedRatedCount,
    excludedUnratedCount,
    interludeCount,
    includedCount,
    overallScore,
    formattedScore
  };
}

export function calculateAlbumScoreAndHighlights(tracks = [], trackRatingsMap = {}) {
  const safeTracks = Array.isArray(tracks) ? tracks : [];
  const safeMap =
    trackRatingsMap && typeof trackRatingsMap === 'object' ? trackRatingsMap : {};

  let ratedCount = 0;
  let includedCount = 0;
  let excludedCount = 0;
  let interludeCount = 0;
  let scoredCount = 0;
  let sumScoredRatings = 0;

  const eligibleScoredTracks = [];
  const normalizedByKey = {};

  safeTracks.forEach((track, idx) => {
    const trackKey = getStableTrackKey(track, idx);
    const state = normalizeTrackState(safeMap[trackKey]);
    normalizedByKey[trackKey] = state;

    const hasValidRating = state.rating !== null;
    if (hasValidRating) {
      ratedCount += 1;
    }

    if (state.interlude) {
      interludeCount += 1;
    }

    if (state.included) {
      includedCount += 1;
    } else {
      excludedCount += 1;
    }

    if (state.included && hasValidRating) {
      scoredCount += 1;
      sumScoredRatings += state.rating;
      eligibleScoredTracks.push({
        trackKey,
        trackId: track?.trackId ?? trackKey,
        trackNumber: Number(track?.trackNumber) || idx + 1,
        discNumber: Number(track?.discNumber) || 1,
        trackName: String(track?.trackName || 'Track ' + String(idx + 1)),
        trackTimeMillis: Number(track?.trackTimeMillis) || 0,
        rating: state.rating,
        formattedRating: state.rating.toFixed(1),
        interlude: state.interlude
      });
    }
  });

  let rawMean = null;
  let overallScore = null;
  let formattedScore = null;

  if (scoredCount > 0) {
    rawMean = sumScoredRatings / scoredCount;
    overallScore = Math.round(rawMean * 10) / 10;
    formattedScore = overallScore.toFixed(1);
  }

  let highestRating = null;
  let lowestRating = null;
  let highestTracks = [];
  let lowestTracks = [];

  if (eligibleScoredTracks.length > 0) {
    highestRating = eligibleScoredTracks.reduce(
      (max, item) => (item.rating > max ? item.rating : max),
      eligibleScoredTracks[0].rating
    );
    lowestRating = eligibleScoredTracks.reduce(
      (min, item) => (item.rating < min ? item.rating : min),
      eligibleScoredTracks[0].rating
    );

    highestTracks = eligibleScoredTracks.filter(
      (item) => Math.abs(item.rating - highestRating) < 1e-7
    );
    lowestTracks = eligibleScoredTracks.filter(
      (item) => Math.abs(item.rating - lowestRating) < 1e-7
    );
  }

  return {
    totalTracks: safeTracks.length,
    ratedCount,
    includedCount,
    excludedCount,
    interludeCount,
    scoredCount,
    rawMean,
    overallScore,
    formattedScore,
    highestRating,
    lowestRating,
    highestTracks,
    lowestTracks,
    normalizedByKey
  };
}