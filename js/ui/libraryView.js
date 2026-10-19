/**
 * RATEPLAY - My Library View Renderer (Phase 4 & Phase 6 Part 2)
 * Renders the Library Summary dashboard, Export/Import JSON portability controls,
 * search/filter/sort controls, responsive personal album cards, and empty states.
 */

import { getTierInfo, formatUpdatedTimestamp } from '../config.js';
import { LIBRARY_SORT_MODES, LIBRARY_FILTER_MODES } from '../library.js';
import { escapeHtml } from './discoverView.js';

export function buildLibrarySummaryHtml(summary) {
  const hasAverage =
    summary.averageAlbumScore !== null && Number.isFinite(summary.averageAlbumScore);
  const avgTier = hasAverage
    ? getTierInfo(summary.averageAlbumScore)
    : { label: 'No Scored Albums', color: 'var(--text-muted)' };
  const avgDisplay = hasAverage ? escapeHtml(summary.formattedAverageScore) : '--.-';
  const avgColor = hasAverage ? avgTier.color : 'var(--text-muted)';

  const albumsSub =
    summary.totalAlbums === 0
      ? 'Rate any track to start your archive'
      : String(summary.completeAlbumsCount) +
        ' complete \u00B7 ' +
        String(summary.incompleteAlbumsCount) +
        ' in progress';

  const tracksSub =
    summary.totalExcludedRatedTracks > 0
      ? String(summary.totalScoredTracks) +
        ' scored \u00B7 ' +
        String(summary.totalExcludedRatedTracks) +
        ' excluded'
      : String(summary.totalScoredTracks) + ' included in album scores';

  const avgSub =
    summary.scoredAlbumsCount > 0
      ? 'Across ' +
        String(summary.scoredAlbumsCount) +
        ' scored ' +
        (summary.scoredAlbumsCount === 1 ? 'album' : 'albums')
      : 'Requires at least 1 scored album';

  let highestBodyHtml =
    '<p class="lib-stat-card__empty">No scored albums yet</p>' +
    '<span class="lib-stat-card__sub">Rate &amp; include tracks to rank</span>';

  if (summary.highestRatedAlbum && summary.highestAlbumScore !== null) {
    const topAlbum = summary.highestRatedAlbum;
    const topTier = getTierInfo(summary.highestAlbumScore);
    const tiedCount = summary.highestRatedAlbums.length;
    const tieSuffix =
      tiedCount > 1 ? ' (+' + String(tiedCount - 1) + ' tied)' : '';

    highestBodyHtml =
      '<div class="lib-top-album">' +
      '<button type="button" class="lib-top-album__title-btn" data-album-id="' +
      escapeHtml(topAlbum.collectionId) +
      '" title="Open ' +
      escapeHtml(topAlbum.collectionName) +
      '">' +
      escapeHtml(topAlbum.collectionName) +
      escapeHtml(tieSuffix) +
      '</button>' +
      '<span class="lib-top-album__score" style="color: ' +
      topTier.color +
      '">' +
      escapeHtml(summary.highestAlbumScore.toFixed(1)) +
      '</span>' +
      '</div>' +
      '<span class="lib-stat-card__sub">' +
      escapeHtml(topAlbum.artistName) +
      ' (' +
      escapeHtml(topAlbum.releaseYear) +
      ')</span>';
  }

  return (
    '<div class="library-summary-grid" role="region" aria-label="Library Summary Statistics">' +
    '<article class="lib-stat-card">' +
    '<span class="lib-stat-card__label">TOTAL ALBUMS RATED</span>' +
    '<div class="lib-stat-card__value" data-lib-stat="total-albums">' +
    String(summary.totalAlbums) +
    '</div>' +
    '<span class="lib-stat-card__sub">' +
    escapeHtml(albumsSub) +
    '</span>' +
    '</article>' +
    '<article class="lib-stat-card">' +
    '<span class="lib-stat-card__label">INDIVIDUAL TRACKS RATED</span>' +
    '<div class="lib-stat-card__value" data-lib-stat="total-tracks">' +
    String(summary.totalRatedTracks) +
    '</div>' +
    '<span class="lib-stat-card__sub">' +
    escapeHtml(tracksSub) +
    '</span>' +
    '</article>' +
    '<article class="lib-stat-card">' +
    '<span class="lib-stat-card__label">AVERAGE ALBUM SCORE</span>' +
    '<div class="lib-stat-card__value" data-lib-stat="average-score" style="color: ' +
    avgColor +
    '">' +
    avgDisplay +
    '</div>' +
    '<span class="lib-stat-card__sub">' +
    escapeHtml(avgSub) +
    '</span>' +
    '</article>' +
    '<article class="lib-stat-card lib-stat-card--highlight">' +
    '<span class="lib-stat-card__label">HIGHEST-RATED ALBUM</span>' +
    highestBodyHtml +
    '</article>' +
    '</div>'
  );
}

function buildLibraryCardHtml(entry) {
  const hasScore = entry.overallScore !== null && Number.isFinite(entry.overallScore);
  const tier = hasScore
    ? getTierInfo(entry.overallScore)
    : { label: 'Excluded / Unscored', color: 'var(--text-muted)' };

  const scoreText = hasScore ? escapeHtml(entry.formattedScore) : '--.-';
  const scoreBadgeStyle = hasScore
    ? 'color: ' + tier.color + ';'
    : 'color: var(--text-secondary);';

  const tracksRatedLabel =
    entry.totalTrackCount > 0
      ? String(entry.ratedTrackCount) + ' / ' + String(entry.totalTrackCount) + ' RATED'
      : String(entry.ratedTrackCount) +
        ' ' +
        (entry.ratedTrackCount === 1 ? 'TRACK' : 'TRACKS') +
        ' RATED';

  let completionBadgeHtml = '';
  if (entry.completionStatus === 'complete') {
    completionBadgeHtml =
      '<span class="lib-completion-pill lib-completion-pill--complete" title="All included tracks on this album have been rated">FULL LP RATED</span>';
  } else if (entry.completionStatus === 'incomplete') {
    completionBadgeHtml =
      '<span class="lib-completion-pill lib-completion-pill--incomplete" title="Some tracks on this album are still unrated">IN PROGRESS</span>';
  } else {
    completionBadgeHtml =
      '<span class="lib-completion-pill lib-completion-pill--partial" title="Rated tracks saved">RATED</span>';
  }

  const updatedLabel = entry.updatedAt
    ? 'Updated ' + formatUpdatedTimestamp(entry.updatedAt)
    : 'Saved in local library';

  const safeId = escapeHtml(entry.collectionId);
  const safeTitle = escapeHtml(entry.collectionName);
  const safeArtist = escapeHtml(entry.artistName);
  const safeYear = escapeHtml(entry.releaseYear);
  const safeCover = escapeHtml(entry.coverUrl);
  const safeFallback = escapeHtml(entry.fallbackCoverUrl);

  return (
    '<article class="album-card library-album-card" data-library-card="' +
    safeId +
    '">' +
    '<div class="album-card__artwork-wrap" tabindex="0" role="button" data-album-id="' +
    safeId +
    '" aria-label="Open and edit ratings for ' +
    safeTitle +
    ' by ' +
    safeArtist +
    '">' +
    '<img class="album-card__artwork" src="' +
    safeCover +
    '" alt="' +
    safeTitle +
    ' cover artwork" loading="lazy" onerror="this.onerror=null;this.src=\'' +
    safeFallback +
    '\';" />' +
    '<span class="album-card__score-badge" style="' +
    scoreBadgeStyle +
    '" title="Overall Album Score: ' +
    scoreText +
    ' (' +
    escapeHtml(tier.label) +
    ')">' +
    scoreText +
    '</span>' +
    '<div class="album-card__hover-badge"><span>EDIT TRACK RATINGS</span><span aria-hidden="true">&rarr;</span></div>' +
    '</div>' +
    '<div class="album-card__body" data-album-id="' +
    safeId +
    '">' +
    '<div class="library-card__status-row">' +
    completionBadgeHtml +
    '<span class="library-card__year">' +
    safeYear +
    '</span>' +
    '</div>' +
    '<h3 class="album-card__title" title="' +
    safeTitle +
    '">' +
    safeTitle +
    '</h3>' +
    '<p class="album-card__artist" title="' +
    safeArtist +
    '">' +
    safeArtist +
    '</p>' +
    '</div>' +
    '<div class="library-card__metrics">' +
    '<span class="library-card__tracks-count">' +
    escapeHtml(tracksRatedLabel) +
    '</span>' +
    '<span class="library-card__updated">' +
    escapeHtml(updatedLabel) +
    '</span>' +
    '</div>' +
    '<div class="library-card__actions">' +
    '<button type="button" class="btn btn-secondary library-card__edit-btn" data-album-id="' +
    safeId +
    '" aria-label="Edit ratings for ' +
    safeTitle +
    '">Edit Ratings</button>' +
    '<button type="button" class="btn btn-ghost library-card__remove-btn" data-library-action="remove-album" data-album-id="' +
    safeId +
    '" data-album-title="' +
    safeTitle +
    '" aria-label="Remove ' +
    safeTitle +
    ' from My Library (keeps saved track ratings)" title="Remove from My Library without deleting track ratings">Remove</button>' +
    '</div>' +
    '</article>'
  );
}

export function renderLibraryResultsMount(mountEl, queryResult, uiState) {
  if (!mountEl) return;

  const { allEntries, visibleEntries, summary, hiddenCount } = queryResult;
  const activeQuery = String(uiState.libraryQuery || '').trim();
  const activeFilter = uiState.libraryFilter || LIBRARY_FILTER_MODES.ALL;

  if (allEntries.length === 0) {
    const hiddenNoticeHtml =
      hiddenCount > 0
        ? '<p class="state-panel__desc">You also have ' +
          String(hiddenCount) +
          ' rated ' +
          (hiddenCount === 1 ? 'album' : 'albums') +
          ' currently hidden from My Library with preserved track ratings.</p>'
        : '';

    const restoreAllBtnHtml =
      hiddenCount > 0
        ? '<button type="button" class="btn btn-secondary" data-library-action="restore-all-hidden">Restore Hidden ' +
          (hiddenCount === 1 ? 'Album' : 'Albums') +
          ' (' +
          String(hiddenCount) +
          ')</button>'
        : '';

    mountEl.innerHTML =
      '<div class="state-panel" data-empty-state="library-empty">' +
      '<div class="state-panel__icon" aria-hidden="true">' +
      '<svg width="22" height="22" viewBox="0 0 24 24" fill="none">' +
      '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/>' +
      '<circle cx="12" cy="12" r="3" fill="currentColor"/>' +
      '</svg>' +
      '</div>' +
      '<h2 class="state-panel__title">Your personal library is empty</h2>' +
      '<p class="state-panel__desc">Albums appear here automatically as soon as you rate at least one track. Head to Discover to inspect a record or import a previously exported RATEPLAY JSON backup.</p>' +
      hiddenNoticeHtml +
      '<div class="state-panel__actions">' +
      '<button type="button" class="btn btn-primary" data-action="back-to-discover">Explore Albums in Discover</button>' +
      '<button type="button" class="btn btn-secondary" data-library-action="open-import-modal">Import Library JSON</button>' +
      restoreAllBtnHtml +
      '</div>' +
      '</div>';
    return;
  }

  if (visibleEntries.length === 0) {
    mountEl.innerHTML =
      '<div class="state-panel" data-empty-state="filter-empty">' +
      '<div class="state-panel__icon" aria-hidden="true">' +
      '<svg width="22" height="22" viewBox="0 0 24 24" fill="none">' +
      '<circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2"/>' +
      '<path d="M16.5 16.5L21 21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
      '</svg>' +
      '</div>' +
      '<h2 class="state-panel__title">No library albums match your filter</h2>' +
      '<p class="state-panel__desc">No rated albums matched ' +
      (activeQuery ? '&ldquo;' + escapeHtml(activeQuery) + '&rdquo; ' : '') +
      'under the current filter settings.</p>' +
      '<div class="state-panel__actions">' +
      '<button type="button" class="btn btn-primary" data-library-action="reset-filters">Reset Search &amp; Filters</button>' +
      '</div>' +
      '</div>';
    return;
  }

  const isFiltered =
    activeQuery.length > 0 || activeFilter !== LIBRARY_FILTER_MODES.ALL;
  const countText = isFiltered
    ? 'SHOWING ' + String(visibleEntries.length) + ' OF ' + String(summary.totalAlbums) + ' ALBUMS'
    : String(visibleEntries.length) + ' ' + (visibleEntries.length === 1 ? 'ALBUM' : 'ALBUMS');

  const resetBtnHtml = isFiltered
    ? '<button type="button" class="btn btn-secondary" data-library-action="reset-filters">Reset Filters</button>'
    : '';

  const cardsHtml = visibleEntries.map(buildLibraryCardHtml).join('');

  mountEl.innerHTML =
    '<div class="section-header">' +
    '<div class="section-header__title-group">' +
    '<span class="section-header__eyebrow">PERSONAL ARCHIVE // SAVED IN BROWSER</span>' +
    '<h2 class="section-header__title">Rated Collection</h2>' +
    '</div>' +
    '<div class="chip-row">' +
    '<span class="section-header__count">' +
    escapeHtml(countText) +
    '</span>' +
    resetBtnHtml +
    '</div>' +
    '</div>' +
    '<div class="album-grid library-album-grid">' +
    cardsHtml +
    '</div>';
}

export function renderLibraryView(container, queryResult, uiState) {
  const activeQuery = String(uiState.libraryQuery || '');
  const activeFilter = uiState.libraryFilter || LIBRARY_FILTER_MODES.ALL;
  const activeSort = uiState.librarySort || LIBRARY_SORT_MODES.SCORE_DESC;
  const { summary, allEntries, hiddenCount } = queryResult;
  const hasExportableData = allEntries.length > 0 || hiddenCount > 0;
  const exportDisabledAttr = hasExportableData ? '' : ' disabled';

  const sortOptions = [
    { value: LIBRARY_SORT_MODES.SCORE_DESC, label: 'Highest Score' },
    { value: LIBRARY_SORT_MODES.SCORE_ASC, label: 'Lowest Score' },
    { value: LIBRARY_SORT_MODES.UPDATED_DESC, label: 'Recently Updated' },
    { value: LIBRARY_SORT_MODES.TITLE_ASC, label: 'Album Title A\u2013Z' },
    { value: LIBRARY_SORT_MODES.ARTIST_ASC, label: 'Artist A\u2013Z' }
  ];

  const sortOptionsHtml = sortOptions
    .map((opt) => {
      const selected = opt.value === activeSort ? ' selected' : '';
      return (
        '<option value="' +
        escapeHtml(opt.value) +
        '"' +
        selected +
        '>' +
        escapeHtml(opt.label) +
        '</option>'
      );
    })
    .join('');

  const filterButtons = [
    {
      mode: LIBRARY_FILTER_MODES.ALL,
      label: 'All Rated (' + String(summary.totalAlbums) + ')'
    },
    {
      mode: LIBRARY_FILTER_MODES.COMPLETE,
      label: 'Full LP Rated (' + String(summary.completeAlbumsCount) + ')'
    },
    {
      mode: LIBRARY_FILTER_MODES.INCOMPLETE,
      label: 'In Progress (' + String(summary.incompleteAlbumsCount) + ')'
    }
  ];

  const filterPillsHtml = filterButtons
    .map((btn) => {
      const isActive = activeFilter === btn.mode;
      const activeClass = isActive ? ' is-active' : '';
      return (
        '<button type="button" class="query-chip' +
        activeClass +
        '" data-library-filter="' +
        escapeHtml(btn.mode) +
        '" aria-pressed="' +
        (isActive ? 'true' : 'false') +
        '">' +
        escapeHtml(btn.label) +
        '</button>'
      );
    })
    .join('');

  const clearBtnHidden = activeQuery.trim().length > 0 ? '' : ' hidden';

  container.innerHTML =
    '<section class="library-header-panel" aria-label="My Library Overview">' +
    '<div class="library-header-panel__top">' +
    '<div>' +
    '<div class="discover-hero__eyebrow">' +
    '<span>RATEPLAY PERSONAL ARCHIVE</span><span>//</span><span>MY LIBRARY</span>' +
    '</div>' +
    '<h1 class="discover-hero__title">Your Rated Record Shelf</h1>' +
    '<p class="discover-hero__subtitle">Every album you have rated is cataloged below with live score calculations, completion tracking, and JSON backup portability.</p>' +
    '</div>' +
    '<div class="chip-row library-portability-actions" role="group" aria-label="Library JSON Export and Import">' +
    '<button type="button" class="btn btn-secondary" data-library-action="export-json"' +
    exportDisabledAttr +
    ' title="Export your ratings and album metadata to a downloadable JSON file">' +
    'Export Library JSON' +
    '</button>' +
    '<button type="button" class="btn btn-secondary" data-library-action="open-import-modal" title="Import ratings and metadata from a RATEPLAY JSON backup file">' +
    'Import Library JSON' +
    '</button>' +
    '<button type="button" class="btn btn-ghost" data-action="go-to-profile">Taste Profile</button>' +
    '</div>' +
    '</div>' +
    '<div id="library-summary-mount">' +
    buildLibrarySummaryHtml(summary) +
    '</div>' +
    '<div class="library-toolbar" role="region" aria-label="Library search, filter, and sort controls">' +
    '<div class="library-search-wrap">' +
    '<svg class="search-input-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true">' +
    '<circle cx="9" cy="9" r="6" stroke="currentColor" stroke-width="1.75"/>' +
    '<path d="M13.5 13.5L17 17" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>' +
    '</svg>' +
    '<input type="search" id="library-search-input" class="search-input library-search-input" ' +
    'placeholder="Filter library by album title or artist..." ' +
    'value="' +
    escapeHtml(activeQuery) +
    '" autocomplete="off" spellcheck="false" aria-label="Filter library by album title or artist" />' +
    '<div class="search-input-actions">' +
    '<button type="button" id="library-search-clear-btn" class="search-clear-btn"' +
    clearBtnHidden +
    ' aria-label="Clear library search">CLEAR</button>' +
    '</div>' +
    '</div>' +
    '<div class="library-controls-row">' +
    '<div class="chip-row" id="library-filter-pills" role="group" aria-label="Filter albums by rating completion">' +
    '<span class="chip-label">Status:</span>' +
    filterPillsHtml +
    '</div>' +
    '<div class="library-sort-group">' +
    '<label for="library-sort-select" class="chip-label">Sort By:</label>' +
    '<select id="library-sort-select" class="library-sort-select" aria-label="Sort library albums">' +
    sortOptionsHtml +
    '</select>' +
    '</div>' +
    '</div>' +
    '</div>' +
    '</section>' +
    '<section id="library-results-mount" aria-live="polite"></section>';

  const resultsMount = container.querySelector('#library-results-mount');
  renderLibraryResultsMount(resultsMount, queryResult, uiState);
}