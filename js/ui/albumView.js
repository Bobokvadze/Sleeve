/**
 * SLEEVE - Album Detail, Tracklist Inspector, Track Rating & Journal View (Phases 3-8)
 */

import {
  APP_CONFIG,
  getHighResArtwork,
  getTierInfo,
  formatDuration,
  formatTotalRuntime,
  formatReleaseYear,
  formatFullDate,
  formatUpdatedTimestamp,
  createFallbackCoverDataUri
} from '../config.js';
import {
  VALID_RATINGS,
  getStableTrackKey,
  normalizeTrackState,
  calculateAlbumScoreAndHighlights
} from '../calculator.js';
import { escapeHtml } from './discoverView.js';

export function renderAlbumLoadingState(container) {
  const skeletonRows = Array.from({ length: 10 })
    .map(
      () =>
        '<tr class="track-row">' +
        '<td class="track-cell track-cell--num"><div class="skeleton-box" style="height:14px;width:24px;"></div></td>' +
        '<td class="track-cell track-cell--title"><div class="skeleton-box" style="height:14px;width:65%;"></div></td>' +
        '<td class="track-cell track-cell--duration"><div class="skeleton-box" style="height:14px;width:42px;margin-left:auto;"></div></td>' +
        '</tr>'
    )
    .join('');

  container.innerHTML =
    '<div class="album-view-topbar">' +
    '<button type="button" class="btn btn-secondary" data-action="back-to-discover">&larr; Back to Discover</button>' +
    '</div>' +
    '<div class="album-workspace" aria-busy="true">' +
    '<aside class="album-sidebar">' +
    '<div class="album-sleeve-frame skeleton-box"></div>' +
    '<div class="album-specs-card">' +
    '<div class="skeleton-box" style="height:16px;width:50%;"></div>' +
    '<div class="skeleton-box" style="height:14px;width:100%;"></div>' +
    '<div class="skeleton-box" style="height:14px;width:85%;"></div>' +
    '</div></aside>' +
    '<div class="album-main-column">' +
    '<div class="album-banner-card">' +
    '<div class="skeleton-box" style="height:18px;width:140px;margin-bottom:12px;"></div>' +
    '<div class="skeleton-box" style="height:36px;width:70%;margin-bottom:10px;"></div>' +
    '<div class="skeleton-box" style="height:20px;width:40%;"></div>' +
    '</div>' +
    '<div class="tracklist-panel">' +
    '<div class="tracklist-panel__header">' +
    '<span class="tracklist-panel__heading">Retrieving Tracklist via iTunes Lookup&hellip;</span>' +
    '</div>' +
    '<table class="track-table"><tbody>' +
    skeletonRows +
    '</tbody></table>' +
    '</div></div></div>';
}

export function buildAlbumRatingSummaryHtml(metrics) {
  const hasScore = metrics.scoredCount > 0 && metrics.overallScore !== null;
  const tier = hasScore
    ? getTierInfo(metrics.overallScore)
    : { label: 'No Scored Tracks', color: 'var(--text-muted)' };

  const scoreValueDisplay = hasScore ? escapeHtml(metrics.formattedScore) : '--.-';
  const scoreColor = hasScore ? tier.color : 'var(--text-muted)';

  const trackNoun = metrics.scoredCount === 1 ? 'track' : 'tracks';
  const scoreSubtitle =
    metrics.totalTracks === 0
      ? 'This release has no tracks available to rate.'
      : hasScore
      ? 'Arithmetic mean of ' + String(metrics.scoredCount) + ' rated, included ' + trackNoun + '.'
      : metrics.ratedCount > 0 && metrics.scoredCount === 0
      ? 'All currently rated tracks are excluded from scoring. Include at least one rated track to calculate an album score.'
      : 'Rate any included track from 1.0 to 10.0 (in 0.5 steps) to calculate the live album score.';

  const ratedRatioText = String(metrics.ratedCount) + ' / ' + String(metrics.totalTracks);
  const includedRatioText = String(metrics.includedCount) + ' / ' + String(metrics.totalTracks);
  const scoredRatioText = String(metrics.scoredCount) + ' / ' + String(metrics.totalTracks);

  const shareDisabledAttr = hasScore ? '' : ' disabled';
  const shareTitleAttr = hasScore
    ? 'Generate a 1080x1920 social review card for this album'
    : 'Rate and include at least one track to generate a Share Review card';

  const renderHighlightSlot = (type, label, ratingValue, tracksList) => {
    const isHighest = type === 'highest';
    const slotClass = isHighest ? 'highlight-slot--highest' : 'highlight-slot--lowest';
    const emptyKind = isHighest ? 'standout' : 'lowest-rated';

    if (!hasScore || !tracksList || tracksList.length === 0) {
      return (
        '<div class="highlight-slot ' +
        slotClass +
        '" data-highlight-slot="' +
        type +
        '">' +
        '<div class="highlight-slot__header">' +
        '<span class="highlight-slot__label">' +
        escapeHtml(label) +
        '</span>' +
        '</div>' +
        '<p class="highlight-empty">Rate and include at least one track to identify ' +
        emptyKind +
        ' highlights.</p>' +
        '</div>'
      );
    }

    const slotTier = getTierInfo(ratingValue);
    const headerTitle =
      tracksList.length > 1
        ? escapeHtml(label) + ' &middot; TIED (' + String(tracksList.length) + ')'
        : escapeHtml(label);

    const itemsHtml = tracksList
      .map((item) => {
        const numStr = String(item.trackNumber).padStart(2, '0');
        return (
          '<li class="highlight-track-item">' +
          '<span class="highlight-track-item__num">#' +
          escapeHtml(numStr) +
          '</span>' +
          '<span class="highlight-track-item__title">' +
          escapeHtml(item.trackName) +
          '</span>' +
          '</li>'
        );
      })
      .join('');

    return (
      '<div class="highlight-slot ' +
      slotClass +
      '" data-highlight-slot="' +
      type +
      '">' +
      '<div class="highlight-slot__header">' +
      '<span class="highlight-slot__label">' +
      headerTitle +
      '</span>' +
      '<span class="highlight-slot__score" style="color: ' +
      slotTier.color +
      '">' +
      escapeHtml(ratingValue.toFixed(1)) +
      '</span>' +
      '</div>' +
      '<ul class="highlight-track-list">' +
      itemsHtml +
      '</ul></div>'
    );
  };

  const highestSlotHtml = renderHighlightSlot(
    'highest',
    'Highest-Rated Track',
    metrics.highestRating,
    metrics.highestTracks
  );

  const lowestSlotHtml = renderHighlightSlot(
    'lowest',
    'Lowest-Rated Track',
    metrics.lowestRating,
    metrics.lowestTracks
  );

  return (
    '<div class="rating-dashboard">' +
    '<div class="score-summary-card">' +
    '<div>' +
    '<div class="score-summary-card__top">' +
    '<span class="score-summary-card__eyebrow">OVERALL ALBUM SCORE</span>' +
    '<span class="score-tier-badge" style="color: ' +
    tier.color +
    '">' +
    escapeHtml(tier.label) +
    '</span>' +
    '</div>' +
    '<div class="score-readout-wrap">' +
    '<span class="score-readout-value" id="album-live-score-value" style="color: ' +
    scoreColor +
    '">' +
    scoreValueDisplay +
    '</span>' +
    '<span class="score-readout-scale">/ 10.0</span>' +
    '</div>' +
    '<p class="score-empty-hint" id="album-live-score-hint">' +
    escapeHtml(scoreSubtitle) +
    '</p>' +
    '</div>' +
    '<div class="score-counters-grid" role="group" aria-label="Track rating and inclusion counts">' +
    '<div class="score-counter-box">' +
    '<span class="score-counter-box__label">Rated Tracks</span>' +
    '<span class="score-counter-box__value" data-metric="rated-count">' +
    ratedRatioText +
    '</span>' +
    '</div>' +
    '<div class="score-counter-box">' +
    '<span class="score-counter-box__label">Included Tracks</span>' +
    '<span class="score-counter-box__value" data-metric="included-count">' +
    includedRatioText +
    '</span>' +
    '</div>' +
    '<div class="score-counter-box">' +
    '<span class="score-counter-box__label">Scored in Mean</span>' +
    '<span class="score-counter-box__value" data-metric="scored-count">' +
    scoredRatioText +
    '</span>' +
    '</div></div>' +
    '<div class="score-summary-card__share-bar">' +
    '<button type="button" class="btn btn-primary score-share-btn" data-action="open-share-modal"' +
    shareDisabledAttr +
    ' title="' +
    escapeHtml(shareTitleAttr) +
    '">' +
    '<span>Share Review Card</span>' +
    '</button>' +
    '</div>' +
    '</div>' +
    '<div class="highlights-card">' +
    '<div class="highlights-card__header">' +
    '<span class="highlights-card__title">TRACK HIGHLIGHTS</span>' +
    '<span class="highlights-card__sub">ELIGIBLE: RATED &amp; INCLUDED TRACKS</span>' +
    '</div>' +
    '<div class="highlights-slots">' +
    highestSlotHtml +
    lowestSlotHtml +
    '</div></div></div>'
  );
}

/**
 * Builds the Album Detail Listening Journal Panel HTML so users can view, create,
 * edit, or delete their personal journal entry directly on the album page.
 */
export function buildAlbumJournalPanelHtml(album, journalEntry) {
  const safeId = escapeHtml(album.collectionId);
  const safeTitle = escapeHtml(album.collectionName);

  if (!journalEntry) {
    return (
      '<div class="album-journal-card">' +
      '<div class="album-journal-card__header">' +
      '<div>' +
      '<span class="verdict-editor-card__label">LISTENING JOURNAL // PERSONAL LINER NOTES</span>' +
      '<p class="album-journal-card__sub">Log your long-form review, mood tags, favorite tracks, and individual song notes for this album.</p>' +
      '</div>' +
      '<button type="button" class="btn btn-secondary" data-journal-action="edit-entry" data-album-id="' +
      safeId +
      '">Write Journal Entry</button>' +
      '</div>' +
      '</div>'
    );
  }

  const updatedStr = formatUpdatedTimestamp(journalEntry.updatedAt);
  const tagsHtml =
    journalEntry.moodTags && journalEntry.moodTags.length > 0
      ? '<div class="journal-entry__tags">' +
        journalEntry.moodTags
          .map((t) => '<span class="journal-mood-pill">#' + escapeHtml(t) + '</span>')
          .join('') +
        '</div>'
      : '';

  const reviewHtml = journalEntry.reviewText
    ? '<div class="journal-entry__review">' +
      journalEntry.reviewText
        .split('\n')
        .filter((l) => l.trim().length > 0)
        .map((p) => '<p>' + escapeHtml(p) + '</p>')
        .join('') +
      '</div>'
    : '';

  const favHtml =
    journalEntry.favoriteTracks && journalEntry.favoriteTracks.length > 0
      ? '<div class="journal-entry__subblock">' +
        '<span class="journal-entry__sublabel">FAVORITE TRACKS</span>' +
        '<div class="journal-fav-tracks-row">' +
        journalEntry.favoriteTracks
          .map((ft) => {
            const num = ft.trackNumber
              ? '#' + String(ft.trackNumber).padStart(2, '0') + ' '
              : '';
            return '<span class="journal-fav-track-pill">' + escapeHtml(num + ft.trackName) + '</span>';
          })
          .join('') +
        '</div></div>'
      : '';

  const notesCount = (journalEntry.trackNotes || []).length;
  const notesSummaryHtml =
    notesCount > 0
      ? '<span class="meta-pill">' +
        String(notesCount) +
        ' ' +
        (notesCount === 1 ? 'TRACK NOTE' : 'TRACK NOTES') +
        ' LOGGED</span>'
      : '';

  return (
    '<div class="album-journal-card album-journal-card--populated">' +
    '<div class="album-journal-card__header">' +
    '<div>' +
    '<span class="verdict-editor-card__label">LISTENING JOURNAL ENTRY &middot; UPDATED ' +
    escapeHtml(updatedStr.toUpperCase()) +
    '</span>' +
    '</div>' +
    '<div class="chip-row">' +
    notesSummaryHtml +
    '<button type="button" class="btn btn-secondary btn-sm" data-journal-action="edit-entry" data-album-id="' +
    safeId +
    '">Edit Journal Entry</button>' +
    '<button type="button" class="btn btn-ghost btn-sm" data-action="go-to-journal">Open Full Journal</button>' +
    '<button type="button" class="btn btn-ghost btn-sm journal-delete-btn" data-journal-action="delete-entry" data-album-id="' +
    safeId +
    '" data-album-title="' +
    safeTitle +
    '">Delete Entry</button>' +
    '</div>' +
    '</div>' +
    tagsHtml +
    reviewHtml +
    favHtml +
    '</div>'
  );
}

export function buildTrackRowCellsHtml(track, idx, albumArtistName, rawTrackState) {
  const trackKey = getStableTrackKey(track, idx);
  const trackState = normalizeTrackState(rawTrackState);
  const formattedNum = String(track.trackNumber || idx + 1).padStart(2, '0');
  const isExplicit = track.trackExplicitness === 'explicit';
  const trackTitle = track.trackName || 'Track ' + String(idx + 1);
  const showTrackArtist =
    track.artistName &&
    albumArtistName &&
    track.artistName.toLowerCase() !== albumArtistName.toLowerCase();

  const hasRating = trackState.rating !== null;
  const ratingTier = hasRating ? getTierInfo(trackState.rating) : null;

  const safeTrackKey = escapeHtml(trackKey);
  const safeTrackTitle = escapeHtml(trackTitle);

  const previewBtnHtml = track.previewUrl
    ? '<button type="button" class="preview-audio-btn" data-preview-url="' +
      escapeHtml(track.previewUrl) +
      '" data-track-title="' +
      safeTrackTitle +
      '" aria-label="Play 30 second preview of ' +
      safeTrackTitle +
      '">' +
      '<span class="preview-btn-icon" aria-hidden="true">&#9654;</span>' +
      '<span class="preview-btn-label">30s</span>' +
      '</button>'
    : '';

  const quickButtonsHtml = Array.from({ length: 10 }, (_, i) => {
    const num = i + 1;
    const isSelected = hasRating && Math.floor(trackState.rating) === num;
    const selectedClass = isSelected ? ' is-selected' : '';
    const labelDisplay =
      isSelected && trackState.rating % 1 !== 0
        ? String(num) + '.5'
        : String(num);
    const btnTitle =
      'Rate ' + safeTrackTitle + ' ' + String(num) + '.0 (click again for half-step)';
    const btnAria = 'Quick rate ' + safeTrackTitle + ' ' + String(num);

    return (
      '<button type="button" class="rating-quick-btn' +
      selectedClass +
      '" data-track-action="quick-rate" data-track-key="' +
      safeTrackKey +
      '" data-quick-val="' +
      String(num) +
      '" title="' +
      btnTitle +
      '" aria-label="' +
      btnAria +
      '">' +
      escapeHtml(labelDisplay) +
      '</button>'
    );
  }).join('');

  const unratedSelectedAttr = !hasRating ? ' selected' : '';
  const selectOptionsHtml = [
    '<option value=""' + unratedSelectedAttr + '>Unrated</option>',
    ...VALID_RATINGS.map((val) => {
      const formatted = val.toFixed(1);
      const selected =
        hasRating && Math.abs(trackState.rating - val) < 1e-7 ? ' selected' : '';
      return '<option value="' + formatted + '"' + selected + '>' + formatted + '</option>';
    })
  ].join('');

  const selectColorStyle =
    hasRating && ratingTier ? 'color: ' + ratingTier.color + ';' : '';
  const explicitHtml = isExplicit
    ? '<span class="explicit-tag" title="Explicit Lyrics">E</span>'
    : '';
  const interludeHiddenAttr = trackState.interlude ? '' : ' hidden';
  const excludedHiddenAttr = !trackState.included ? '' : ' hidden';
  const subArtistHtml = showTrackArtist
    ? '<span class="track-artist-sub">' + escapeHtml(track.artistName) + '</span>'
    : '';

  const interludePressed = trackState.interlude ? 'true' : 'false';
  const includePressed = trackState.included ? 'true' : 'false';
  const includeText = trackState.included ? 'Included' : 'Excluded';
  const includeAria =
    (trackState.included ? 'Include ' : 'Exclude ') + safeTrackTitle + ' in album score';

  const stepDownDisabled = hasRating && trackState.rating <= 1.0 ? ' disabled' : '';
  const stepUpDisabled = hasRating && trackState.rating >= 10.0 ? ' disabled' : '';
  const clearDisabled = hasRating ? '' : ' disabled';

  return (
    '<td class="track-cell track-cell--num">' +
    escapeHtml(formattedNum) +
    '</td>' +
    '<td class="track-cell track-cell--title">' +
    '<div class="track-title-wrap">' +
    '<span class="track-title-text">' +
    safeTrackTitle +
    '</span>' +
    explicitHtml +
    '<span class="track-status-pill track-status-pill--interlude" data-role="interlude-badge"' +
    interludeHiddenAttr +
    '>INTERLUDE / SKIT</span>' +
    '<span class="track-status-pill track-status-pill--excluded" data-role="excluded-badge"' +
    excludedHiddenAttr +
    '>EXCLUDED FROM SCORE</span>' +
    '</div>' +
    subArtistHtml +
    '</td>' +
    '<td class="track-cell track-cell--preview">' +
    previewBtnHtml +
    '</td>' +
    '<td class="track-cell track-cell--duration">' +
    escapeHtml(formatDuration(track.trackTimeMillis)) +
    '</td>' +
    '<td class="track-cell track-cell--flags">' +
    '<div class="track-flags-group">' +
    '<button type="button" class="track-flag-btn track-flag-btn--interlude" data-track-action="toggle-interlude" data-track-key="' +
    safeTrackKey +
    '" aria-pressed="' +
    interludePressed +
    '" aria-label="Mark ' +
    safeTrackTitle +
    ' as interlude or skit" title="Mark as Interlude / Skit (preserves track rating)">' +
    '<span>Interlude</span>' +
    '</button>' +
    '<button type="button" class="track-flag-btn track-flag-btn--include" data-track-action="toggle-include" data-track-key="' +
    safeTrackKey +
    '" aria-pressed="' +
    includePressed +
    '" aria-label="' +
    includeAria +
    '" title="Include or exclude this track from the overall album score calculation">' +
    '<span data-role="include-btn-text">' +
    includeText +
    '</span>' +
    '</button>' +
    '</div></td>' +
    '<td class="track-cell track-cell--rating">' +
    '<div class="track-rating-controls">' +
    '<div class="rating-quick-bar" role="group" aria-label="Quick rating 1 to 10 for ' +
    safeTrackTitle +
    '">' +
    quickButtonsHtml +
    '</div>' +
    '<div class="rating-stepper-group">' +
    '<button type="button" class="rating-step-btn" data-track-action="step-down" data-track-key="' +
    safeTrackKey +
    '" aria-label="Decrease rating for ' +
    safeTrackTitle +
    ' by 0.5" title="Decrease by 0.5"' +
    stepDownDisabled +
    '>&minus;</button>' +
    '<select class="track-rating-select" data-track-action="select-rating" data-track-key="' +
    safeTrackKey +
    '" aria-label="Rating for ' +
    safeTrackTitle +
    ' (1.0 to 10.0 in 0.5 increments)" style="' +
    selectColorStyle +
    '">' +
    selectOptionsHtml +
    '</select>' +
    '<button type="button" class="rating-step-btn" data-track-action="step-up" data-track-key="' +
    safeTrackKey +
    '" aria-label="Increase rating for ' +
    safeTrackTitle +
    ' by 0.5" title="Increase by 0.5"' +
    stepUpDisabled +
    '>&#43;</button>' +
    '</div>' +
    '<button type="button" class="rating-clear-btn" data-track-action="clear-rating" data-track-key="' +
    safeTrackKey +
    '" aria-label="Clear rating for ' +
    safeTrackTitle +
    '" title="Clear track rating"' +
    clearDisabled +
    '>&times;</button>' +
    '</div></td>'
  );
}

export function updateTrackRowDom(rowEl, trackState) {
  if (!rowEl) return;
  const normalized = normalizeTrackState(trackState);
  const hasRating = normalized.rating !== null;
  const tier = hasRating ? getTierInfo(normalized.rating) : null;

  rowEl.classList.toggle('is-interlude', normalized.interlude);
  rowEl.classList.toggle('is-excluded', !normalized.included);
  rowEl.classList.toggle('is-rated', hasRating);

  const interludeBadge = rowEl.querySelector('[data-role="interlude-badge"]');
  if (interludeBadge) {
    interludeBadge.hidden = !normalized.interlude;
  }

  const excludedBadge = rowEl.querySelector('[data-role="excluded-badge"]');
  if (excludedBadge) {
    excludedBadge.hidden = normalized.included;
  }

  const interludeBtn = rowEl.querySelector('[data-track-action="toggle-interlude"]');
  if (interludeBtn) {
    interludeBtn.setAttribute('aria-pressed', normalized.interlude ? 'true' : 'false');
  }

  const includeBtn = rowEl.querySelector('[data-track-action="toggle-include"]');
  if (includeBtn) {
    includeBtn.setAttribute('aria-pressed', normalized.included ? 'true' : 'false');
    const labelSpan = includeBtn.querySelector('[data-role="include-btn-text"]');
    if (labelSpan) {
      labelSpan.textContent = normalized.included ? 'Included' : 'Excluded';
    }
  }

  const selectEl = rowEl.querySelector('[data-track-action="select-rating"]');
  if (selectEl) {
    selectEl.value = hasRating ? normalized.rating.toFixed(1) : '';
    selectEl.style.color = hasRating && tier ? tier.color : '';
  }

  const stepDownBtn = rowEl.querySelector('[data-track-action="step-down"]');
  if (stepDownBtn) {
    stepDownBtn.disabled = Boolean(hasRating && normalized.rating <= 1.0);
  }

  const stepUpBtn = rowEl.querySelector('[data-track-action="step-up"]');
  if (stepUpBtn) {
    stepUpBtn.disabled = Boolean(hasRating && normalized.rating >= 10.0);
  }

  const clearBtn = rowEl.querySelector('[data-track-action="clear-rating"]');
  if (clearBtn) {
    clearBtn.disabled = !hasRating;
  }

  const quickBtns = rowEl.querySelectorAll('[data-track-action="quick-rate"]');
  quickBtns.forEach((btn) => {
    const num = Number(btn.getAttribute('data-quick-val'));
    const isSelected = hasRating && Math.floor(normalized.rating) === num;
    btn.classList.toggle('is-selected', isSelected);
    btn.textContent =
      isSelected && normalized.rating % 1 !== 0 ? String(num) + '.5' : String(num);
  });
}

export function updateAlbumSummaryDom(container, metrics, isHiddenFromLibrary = false) {
  const summaryMount = container.querySelector('#album-rating-summary-mount');
  if (summaryMount) {
    summaryMount.innerHTML = buildAlbumRatingSummaryHtml(metrics);
  }
  const hasScore = metrics.scoredCount > 0 && metrics.overallScore !== null;
  const topShareBtn = container.querySelector('#topbar-share-review-btn');
  if (topShareBtn) {
    topShareBtn.disabled = !hasScore;
    topShareBtn.title = hasScore
      ? 'Generate a 1080x1920 social review card for this album'
      : 'Rate and include at least one track to generate a Share Review card';
  }
  const clearAllBtn = container.querySelector('[data-action="clear-all-ratings"]');
  if (clearAllBtn) {
    clearAllBtn.hidden =
      metrics.ratedCount === 0 &&
      metrics.interludeCount === 0 &&
      metrics.excludedCount === 0;
  }
  const hiddenBanner = container.querySelector('#album-hidden-library-banner');
  if (hiddenBanner) {
    hiddenBanner.hidden = !(metrics.ratedCount > 0 && isHiddenFromLibrary);
  }
}

export function updateAlbumJournalMountDom(container, album, journalEntry) {
  const mount = container.querySelector('#album-journal-panel-mount');
  if (mount) {
    mount.innerHTML = buildAlbumJournalPanelHtml(album, journalEntry);
  }
}

export function renderAlbumView(
  container,
  {
    album,
    tracks,
    source,
    trackRatingsMap = {},
    verdict = '',
    journalEntry = null,
    isHiddenFromLibrary = false,
    previousView = 'discover'
  }
) {
  const safeTracks = Array.isArray(tracks) ? tracks : [];
  const coverUrl = getHighResArtwork(album.artworkUrl100, 600);
  const fallbackCover = createFallbackCoverDataUri(album.collectionName);
  const releaseYear = formatReleaseYear(album.releaseDate);
  const fullReleaseDate = formatFullDate(album.releaseDate);
  const totalRuntime = formatTotalRuntime(safeTracks);

  const metrics = calculateAlbumScoreAndHighlights(safeTracks, trackRatingsMap);
  const hasScore = metrics.scoredCount > 0 && metrics.overallScore !== null;

  const discCount = safeTracks.reduce(
    (max, t) => Math.max(max, Number(t.discNumber) || 1),
    1
  );
  let currentDisc = 0;

  const trackRowsHtml = safeTracks
    .map((track, idx) => {
      const trackKey = getStableTrackKey(track, idx);
      const trackState = metrics.normalizedByKey[trackKey] || normalizeTrackState();

      const discHeaderHtml =
        discCount > 1 && (Number(track.discNumber) || 1) !== currentDisc
          ? (() => {
              currentDisc = Number(track.discNumber) || 1;
              return (
                '<tr><td colspan="6" class="disc-divider">DISC ' +
                escapeHtml(currentDisc) +
                '</td></tr>'
              );
            })()
          : '';

      const rowClasses = [
        'track-row',
        trackState.interlude ? 'is-interlude' : '',
        !trackState.included ? 'is-excluded' : '',
        trackState.rating !== null ? 'is-rated' : ''
      ]
        .filter(Boolean)
        .join(' ');

      const rowCells = buildTrackRowCellsHtml(track, idx, album.artistName, trackState);

      return (
        discHeaderHtml +
        '<tr class="' +
        rowClasses +
        '" data-track-row="' +
        escapeHtml(trackKey) +
        '" data-track-id="' +
        escapeHtml(track.trackId ?? trackKey) +
        '">' +
        rowCells +
        '</tr>'
      );
    })
    .join('');

  const hasAnySavedState =
    metrics.ratedCount > 0 ||
    metrics.interludeCount > 0 ||
    metrics.excludedCount > 0 ||
    Boolean(verdict);
  const resetHiddenAttr = hasAnySavedState ? '' : ' hidden';

  const appleMusicBtnHtml = album.collectionViewUrl
    ? '<a href="' +
      escapeHtml(album.collectionViewUrl) +
      '" target="_blank" rel="noopener noreferrer" class="btn btn-secondary">' +
      '<span>Open in Apple Music</span><span aria-hidden="true">&#8599;</span></a>'
    : '';

  const sourceLabel = source === 'live' ? 'iTunes Lookup API' : 'Curated Archive';
  const copyrightHtml = album.copyright
    ? '<p class="album-copyright">' + escapeHtml(album.copyright) + '</p>'
    : '';
  const tracksAndRuntimeBadge =
    String(safeTracks.length) + ' TRACKS &middot; ' + escapeHtml(totalRuntime);

  const summaryHtml = buildAlbumRatingSummaryHtml(metrics);
  const journalPanelHtml = buildAlbumJournalPanelHtml(album, journalEntry);

  const tableOrEmptyHtml =
    safeTracks.length > 0
      ? '<table class="track-table"><tbody>' + trackRowsHtml + '</tbody></table>'
      : '<div class="state-panel"><h3 class="state-panel__title">No Tracklist Returned</h3><p class="state-panel__desc">The catalog did not return individual songs for this release.</p></div>';

  const safeTitle = escapeHtml(album.collectionName);
  const safeArtist = escapeHtml(album.artistName);
  const safeAlbumId = escapeHtml(album.collectionId);

  let backButtonHtml =
    '<button type="button" class="btn btn-secondary" data-action="back-to-discover">&larr; Back to Discover</button>';
  if (previousView === 'library') {
    backButtonHtml =
      '<button type="button" class="btn btn-secondary" data-action="go-to-library">&larr; Back to My Library</button>';
  } else if (previousView === 'journal') {
    backButtonHtml =
      '<button type="button" class="btn btn-secondary" data-action="go-to-journal">&larr; Back to Journal</button>';
  } else if (previousView === 'profile') {
    backButtonHtml =
      '<button type="button" class="btn btn-secondary" data-action="go-to-profile">&larr; Back to Profile</button>';
  } else if (previousView === 'insights') {
    backButtonHtml =
      '<button type="button" class="btn btn-secondary" data-action="go-to-insights">&larr; Back to Insights</button>';
  }

  const hiddenBannerAttr =
    metrics.ratedCount > 0 && isHiddenFromLibrary ? '' : ' hidden';

  const shareDisabledAttr = hasScore ? '' : ' disabled';
  const shareTitleAttr = hasScore
    ? 'Generate a 1080x1920 social review card for this album'
    : 'Rate and include at least one track to generate a Share Review card';

  const maxVerdictLen = APP_CONFIG.maxVerdictLength || 160;
  const safeVerdict = escapeHtml(verdict || '');

  container.innerHTML =
    '<div class="album-view-topbar">' +
    '<div class="chip-row">' +
    backButtonHtml +
    '<button type="button" class="btn btn-ghost" data-action="go-to-library">View My Library</button>' +
    '<button type="button" class="btn btn-ghost" data-action="go-to-journal">Journal</button>' +
    '</div>' +
    '<div class="chip-row">' +
    '<button type="button" class="btn btn-secondary" data-journal-action="edit-entry" data-album-id="' +
    safeAlbumId +
    '">' +
    (journalEntry ? 'Edit Journal Note' : 'Write Journal Note') +
    '</button>' +
    '<button type="button" id="topbar-share-review-btn" class="btn btn-primary" data-action="open-share-modal"' +
    shareDisabledAttr +
    ' title="' +
    escapeHtml(shareTitleAttr) +
    '">Share Review</button>' +
    '<button type="button" class="btn btn-ghost" data-action="clear-all-ratings"' +
    resetHiddenAttr +
    '>Reset Album Ratings</button>' +
    appleMusicBtnHtml +
    '</div></div>' +
    '<div id="album-hidden-library-banner" class="library-hidden-banner"' +
    hiddenBannerAttr +
    '>' +
    '<div class="library-hidden-banner__text">' +
    '<strong>Removed from My Library:</strong> Your track ratings for this album are still saved, but it is currently hidden from your My Library shelf.' +
    '</div>' +
    '<button type="button" class="btn btn-primary" data-action="restore-to-library" data-album-id="' +
    safeAlbumId +
    '">Add Back to My Library</button>' +
    '</div>' +
    '<div class="album-workspace">' +
    '<aside class="album-sidebar">' +
    '<div class="album-sleeve-frame">' +
    '<img src="' +
    escapeHtml(coverUrl) +
    '" alt="' +
    safeTitle +
    ' album sleeve" onerror="this.onerror=null;this.src=\'' +
    escapeHtml(fallbackCover) +
    '\';" />' +
    '</div>' +
    '<div class="album-specs-card">' +
    '<h2 class="album-specs-card__title">Pressing Specifications</h2>' +
    '<div class="spec-row"><span class="spec-row__label">CATALOG ID</span><span class="spec-row__value">#' +
    safeAlbumId +
    '</span></div>' +
    '<div class="spec-row"><span class="spec-row__label">RELEASED</span><span class="spec-row__value">' +
    escapeHtml(fullReleaseDate) +
    '</span></div>' +
    '<div class="spec-row"><span class="spec-row__label">GENRE</span><span class="spec-row__value">' +
    escapeHtml(album.primaryGenreName) +
    '</span></div>' +
    '<div class="spec-row"><span class="spec-row__label">TRACKS</span><span class="spec-row__value">' +
    String(safeTracks.length) +
    '</span></div>' +
    '<div class="spec-row"><span class="spec-row__label">TOTAL RUNTIME</span><span class="spec-row__value">' +
    escapeHtml(totalRuntime) +
    '</span></div>' +
    '<div class="spec-row"><span class="spec-row__label">SOURCE</span><span class="spec-row__value">' +
    sourceLabel +
    '</span></div>' +
    copyrightHtml +
    '</div></aside>' +
    '<div class="album-main-column">' +
    '<header class="album-banner-card">' +
    '<div class="album-banner-card__badges">' +
    '<span class="meta-pill meta-pill--accent">' +
    escapeHtml(releaseYear) +
    '</span>' +
    '<span class="meta-pill">' +
    escapeHtml(album.primaryGenreName) +
    '</span>' +
    '<span class="meta-pill">' +
    tracksAndRuntimeBadge +
    '</span>' +
    '</div>' +
    '<h1 class="album-banner-card__title">' +
    safeTitle +
    '</h1>' +
    '<p class="album-banner-card__artist">By ' +
    '<button type="button" class="album-banner-card__artist-link" data-artist-search="' +
    safeArtist +
    '" title="Search more albums by ' +
    safeArtist +
    '">' +
    safeArtist +
    '</button></p></header>' +
    '<section id="album-rating-summary-mount" aria-label="Album Score and Track Highlights" aria-live="polite">' +
    summaryHtml +
    '</section>' +
    '<section class="verdict-editor-card" aria-label="Optional One-Line Verdict">' +
    '<div class="verdict-editor-card__header">' +
    '<label for="album-verdict-input" class="verdict-editor-card__label">ONE-LINE VERDICT // OPTIONAL SOCIAL CARD HEADLINE</label>' +
    '<span id="album-verdict-char-count" class="verdict-editor-card__count">' +
    String((verdict || '').length) +
    ' / ' +
    String(maxVerdictLen) +
    '</span>' +
    '</div>' +
    '<input type="text" id="album-verdict-input" class="verdict-editor-input" maxlength="' +
    String(maxVerdictLen) +
    '" value="' +
    safeVerdict +
    '" placeholder="Write a concise takeaway for your review card (e.g., Lush, zero-skip late-night masterpiece)..." autocomplete="off" />' +
    '</section>' +
    '<section id="album-collections-bar-mount" aria-label="Album Custom Collections"></section>' +
    '<section id="album-journal-panel-mount" aria-label="Album Listening Journal Entry">' +
    journalPanelHtml +
    '</section>' +
    '<section class="tracklist-panel" aria-label="Album Tracklist and Track Ratings">' +
    '<div class="tracklist-panel__header">' +
    '<div>' +
    '<h2 class="tracklist-panel__heading">Track-by-Track Rating Matrix</h2>' +
    '<p class="tracklist-panel__sub">Rate songs from 1.0 to 10.0 (0.5 steps) &middot; Mark interludes or exclude tracks from scoring independently</p>' +
    '</div>' +
    '<span class="meta-pill">AUTO-SAVED TO LOCAL LIBRARY</span>' +
    '</div>' +
    tableOrEmptyHtml +
    '</section></div></div>';
}

export function renderAlbumErrorState(container, errorMessage, collectionId) {
  container.innerHTML =
    '<div class="album-view-topbar">' +
    '<button type="button" class="btn btn-secondary" data-action="back-to-discover">&larr; Back to Discover</button>' +
    '</div>' +
    '<div class="state-panel">' +
    '<div class="state-panel__icon" aria-hidden="true">!</div>' +
    '<h2 class="state-panel__title">Unable to Load Album Tracklist</h2>' +
    '<p class="state-panel__desc">' +
    escapeHtml(errorMessage) +
    '</p>' +
    '<div class="state-panel__actions">' +
    '<button type="button" class="btn btn-primary" data-action="retry-album" data-album-id="' +
    escapeHtml(collectionId) +
    '">Retry Tracklist Lookup</button>' +
    '<button type="button" class="btn btn-secondary" data-action="back-to-discover">Return to Discover</button>' +
    '</div></div>';
}

// === PHASE 9A: ALBUM DETAIL COLLECTIONS MEMBERSHIP BAR ===
export function buildAlbumCollectionsBarHtml(
  album,
  membership = { containing: [], available: [], matchingSmart: [] }
) {
  const safeAlbumId = escapeHtml(album.collectionId);
  const containing = Array.isArray(membership?.containing) ? membership.containing : [];
  const available = Array.isArray(membership?.available) ? membership.available : [];
  const matchingSmart = Array.isArray(membership?.matchingSmart)
    ? membership.matchingSmart
    : [];

  const manualPillsHtml = containing
    .map((col) => {
      const safeColId = escapeHtml(col.id);
      const safeColTitle = escapeHtml(col.title);
      return (
        '<span class="album-collection-membership-pill" data-membership-type="manual">' +
        '<button type="button" class="album-collection-membership-pill__open" data-collection-action="open-collection" data-collection-id="' +
        safeColId +
        '" title="Open manual collection ' +
        safeColTitle +
        '">' +
        safeColTitle +
        '</button>' +
        '<button type="button" class="album-collection-membership-pill__remove" data-collection-action="remove-album-from-collection" data-collection-id="' +
        safeColId +
        '" data-album-id="' +
        safeAlbumId +
        '" data-album-title="' +
        escapeHtml(album.collectionName) +
        '" aria-label="Remove from ' +
        safeColTitle +
        '" title="Remove from ' +
        safeColTitle +
        '">&times;</button>' +
        '</span>'
      );
    })
    .join('');

  const smartPillsHtml = matchingSmart
    .map((col) => {
      const safeColId = escapeHtml(col.id);
      const safeColTitle = escapeHtml(col.title);
      return (
        '<span class="album-collection-membership-pill album-collection-membership-pill--smart" data-membership-type="smart">' +
        '<button type="button" class="album-collection-membership-pill__open" data-collection-action="open-collection" data-collection-id="' +
        safeColId +
        '" title="Automatically included in Smart Collection ' +
        safeColTitle +
        '">' +
        '<span class="album-collection-smart-tag">SMART</span>' +
        '<span>' +
        safeColTitle +
        '</span>' +
        '</button>' +
        '</span>'
      );
    })
    .join('');

  const combinedPillsHtml =
    manualPillsHtml || smartPillsHtml
      ? manualPillsHtml + smartPillsHtml
      : '<span class="insights-muted-note">Not in any manual or smart collection yet.</span>';

  const selectHtml =
    available.length > 0
      ? '<select id="album-view-add-collection-select" class="library-sort-select" aria-label="Choose a collection to add this album to">' +
        available
          .map(
            (col) =>
              '<option value="' +
              escapeHtml(col.id) +
              '">' +
              escapeHtml(col.title) +
              '</option>'
          )
          .join('') +
        '</select>' +
        '<button type="button" class="btn btn-secondary btn-sm" data-collection-action="add-active-album-to-selected" data-album-id="' +
        safeAlbumId +
        '">+ Add to Shelf</button>'
      : '';

  return (
    '<div class="verdict-editor-card album-collections-bar">' +
    '<div class="album-journal-card__header">' +
    '<div>' +
    '<span class="verdict-editor-card__label">CUSTOM &amp; SMART COLLECTIONS // SHELF MEMBERSHIP</span>' +
    '<div class="chip-row album-collections-pills-row">' +
    combinedPillsHtml +
    '</div>' +
    '</div>' +
    '<div class="chip-row">' +
    selectHtml +
    '<button type="button" class="btn btn-ghost btn-sm" data-collection-action="create-collection-with-album" data-album-id="' +
    safeAlbumId +
    '">+ New Collection</button>' +
    '</div>' +
    '</div>' +
    '</div>'
  );
}

export function upsertAlbumCollectionsBarDom(container, album, membership) {
  if (!container || !album) return;
  let mount = container.querySelector('#album-collections-bar-mount');
  if (!mount) {
    const journalMount = container.querySelector('#album-journal-panel-mount');
    if (!journalMount || !journalMount.parentNode) return;
    mount = document.createElement('section');
    mount.id = 'album-collections-bar-mount';
    mount.setAttribute('aria-label', 'Album Custom Collections');
    journalMount.parentNode.insertBefore(mount, journalMount);
  }
  mount.innerHTML = buildAlbumCollectionsBarHtml(album, membership);
}
