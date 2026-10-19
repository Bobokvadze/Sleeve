/**
 * RATEPLAY - Listening Journal View Renderer (Phase 8)
 * Renders the chronological list of album journal entries, summary metrics,
 * full-text search, mood tag & rating tier filters, sorting controls,
 * quick album picker for creating entries, and JSON Export/Import buttons.
 */

import { formatUpdatedTimestamp } from '../config.js';
import {
  JOURNAL_SORT_MODES,
  JOURNAL_RATING_FILTERS
} from '../journal.js';
import { escapeHtml } from './discoverView.js';

function buildJournalSummaryBarHtml(summary, ratedLibraryCount = 0) {
  return (
    '<div class="library-summary-grid journal-summary-grid" role="region" aria-label="Listening Journal Summary">' +
    '<article class="lib-stat-card lib-stat-card--highlight">' +
    '<span class="lib-stat-card__label">ALBUM JOURNAL ENTRIES</span>' +
    '<div class="lib-stat-card__value" data-journal-stat="total-entries">' +
    String(summary.totalEntries) +
    '</div>' +
    '<span class="lib-stat-card__sub">' +
    String(ratedLibraryCount) +
    ' rated ' +
    (ratedLibraryCount === 1 ? 'album' : 'albums') +
    ' in library</span>' +
    '</article>' +
    '<article class="lib-stat-card">' +
    '<span class="lib-stat-card__label">MOOD &amp; CONTEXT TAGS</span>' +
    '<div class="lib-stat-card__value" data-journal-stat="mood-tags">' +
    String(summary.uniqueMoodTagsCount) +
    '</div>' +
    '<span class="lib-stat-card__sub">Distinct atmosphere tags</span>' +
    '</article>' +
    '<article class="lib-stat-card">' +
    '<span class="lib-stat-card__label">FAVORITE TRACK PICKS</span>' +
    '<div class="lib-stat-card__value" data-journal-stat="favorite-tracks">' +
    String(summary.totalFavoriteTracksCount) +
    '</div>' +
    '<span class="lib-stat-card__sub">Highlighted across entries</span>' +
    '</article>' +
    '<article class="lib-stat-card">' +
    '<span class="lib-stat-card__label">INDIVIDUAL TRACK NOTES</span>' +
    '<div class="lib-stat-card__value" data-journal-stat="track-notes">' +
    String(summary.totalTrackNotesCount) +
    '</div>' +
    '<span class="lib-stat-card__sub">Song-level liner annotations</span>' +
    '</article>' +
    '</div>'
  );
}

function buildJournalEntryCardHtml(entry) {
  const safeId = escapeHtml(entry.collectionId);
  const safeTitle = escapeHtml(entry.collectionName);
  const safeArtist = escapeHtml(entry.artistName);
  const safeYear = escapeHtml(entry.releaseYear);
  const safeCover = escapeHtml(entry.coverUrl);
  const safeFallback = escapeHtml(entry.fallbackCoverUrl);

  const hasScore = entry.overallScore !== null && Number.isFinite(entry.overallScore);
  const scoreDisplay = hasScore ? escapeHtml(entry.formattedScore) : 'UNRATED';
  const scoreColorStyle = hasScore
    ? 'color: ' + entry.tierColor + ';'
    : 'color: var(--text-muted);';

  const createdDateStr = formatUpdatedTimestamp(entry.createdAt);
  const updatedDateStr = formatUpdatedTimestamp(entry.updatedAt);
  const timestampLine =
    createdDateStr === updatedDateStr
      ? 'Created ' + createdDateStr
      : 'Updated ' + updatedDateStr + ' \u00B7 Created ' + createdDateStr;

  const moodTagsHtml =
    entry.moodTags && entry.moodTags.length > 0
      ? '<div class="journal-entry__tags" aria-label="Mood tags">' +
        entry.moodTags
          .map(
            (tag) =>
              '<button type="button" class="journal-mood-pill" data-journal-mood-filter="' +
              escapeHtml(tag) +
              '" title="Filter journal by mood tag: ' +
              escapeHtml(tag) +
              '">#' +
              escapeHtml(tag) +
              '</button>'
          )
          .join('') +
        '</div>'
      : '';

  const reviewHtml = entry.reviewText
    ? '<div class="journal-entry__review">' +
      entry.reviewText
        .split('\n')
        .filter((line) => line.trim().length > 0)
        .map((para) => '<p>' + escapeHtml(para) + '</p>')
        .join('') +
      '</div>'
    : '';

  const favoriteTracksHtml =
    entry.favoriteTracks && entry.favoriteTracks.length > 0
      ? '<div class="journal-entry__subblock">' +
        '<span class="journal-entry__sublabel">FAVORITE TRACKS</span>' +
        '<div class="journal-fav-tracks-row">' +
        entry.favoriteTracks
          .map((ft) => {
            const numPrefix = ft.trackNumber
              ? '#' + String(ft.trackNumber).padStart(2, '0') + ' '
              : '';
            return (
              '<span class="journal-fav-track-pill">' +
              escapeHtml(numPrefix + ft.trackName) +
              '</span>'
            );
          })
          .join('') +
        '</div></div>'
      : '';

  const trackNotesHtml =
    entry.trackNotes && entry.trackNotes.length > 0
      ? '<div class="journal-entry__subblock">' +
        '<span class="journal-entry__sublabel">TRACK-BY-TRACK LINER NOTES (' +
        String(entry.trackNotes.length) +
        ')</span>' +
        '<ul class="journal-track-notes-list">' +
        entry.trackNotes
          .map((tn) => {
            const numPrefix = tn.trackNumber
              ? '#' + String(tn.trackNumber).padStart(2, '0')
              : 'TRACK';
            return (
              '<li class="journal-track-note-item">' +
              '<div class="journal-track-note-item__header">' +
              '<span class="journal-track-note-item__num">' +
              escapeHtml(numPrefix) +
              '</span>' +
              '<strong class="journal-track-note-item__title">' +
              escapeHtml(tn.trackName) +
              '</strong>' +
              '</div>' +
              '<p class="journal-track-note-item__body">' +
              escapeHtml(tn.note) +
              '</p>' +
              '</li>'
            );
          })
          .join('') +
        '</ul></div>'
      : '';

  return (
    '<article class="journal-entry-card" data-journal-card="' +
    safeId +
    '">' +
    '<aside class="journal-entry-card__sidebar">' +
    '<div class="journal-entry-card__art-wrap" tabindex="0" role="button" data-album-id="' +
    safeId +
    '" aria-label="Open album page for ' +
    safeTitle +
    ' by ' +
    safeArtist +
    '">' +
    '<img class="journal-entry-card__art" src="' +
    safeCover +
    '" alt="' +
    safeTitle +
    ' cover" loading="lazy" onerror="this.onerror=null;this.src=\'' +
    safeFallback +
    '\';" />' +
    '</div>' +
    '<div class="journal-entry-card__score-box" style="' +
    scoreColorStyle +
    '">' +
    '<span class="journal-entry-card__score-label">' +
    escapeHtml(entry.tierLabel) +
    '</span>' +
    '<strong class="journal-entry-card__score-val">' +
    scoreDisplay +
    '</strong>' +
    '</div>' +
    '</aside>' +
    '<div class="journal-entry-card__main">' +
    '<header class="journal-entry-card__header">' +
    '<div>' +
    '<span class="journal-entry-card__timestamps">' +
    escapeHtml(timestampLine) +
    '</span>' +
    '<h3 class="journal-entry-card__title">' +
    '<button type="button" class="journal-entry-card__title-btn" data-album-id="' +
    safeId +
    '">' +
    safeTitle +
    '</button>' +
    '</h3>' +
    '<p class="journal-entry-card__artist">' +
    '<button type="button" class="album-banner-card__artist-link" data-artist-search="' +
    safeArtist +
    '">' +
    safeArtist +
    '</button>' +
    ' &middot; <span>' +
    safeYear +
    '</span></p>' +
    '</div>' +
    '<div class="journal-entry-card__actions">' +
    '<button type="button" class="btn btn-secondary btn-sm" data-journal-action="edit-entry" data-album-id="' +
    safeId +
    '" aria-label="Edit journal entry for ' +
    safeTitle +
    '">Edit Entry</button>' +
    '<button type="button" class="btn btn-ghost btn-sm" data-album-id="' +
    safeId +
    '" aria-label="Inspect album tracklist for ' +
    safeTitle +
    '">Album Page</button>' +
    '<button type="button" class="btn btn-ghost btn-sm journal-delete-btn" data-journal-action="delete-entry" data-album-id="' +
    safeId +
    '" data-album-title="' +
    safeTitle +
    '" aria-label="Delete journal entry for ' +
    safeTitle +
    '">Delete</button>' +
    '</div>' +
    '</header>' +
    moodTagsHtml +
    reviewHtml +
    favoriteTracksHtml +
    trackNotesHtml +
    '</div>' +
    '</article>'
  );
}

/**
 * Renders the filtered/sorted journal entries list or empty states.
 */
export function renderJournalResultsMount(
  mountEl,
  queryResult,
  uiState,
  libraryEntries = []
) {
  if (!mountEl) return;

  const { allEntries, visibleEntries, summary } = queryResult;
  const activeQuery = String(uiState.journalQuery || '').trim();
  const activeMood = String(uiState.journalMoodFilter || '').trim();
  const activeRatingFilter =
    uiState.journalRatingFilter || JOURNAL_RATING_FILTERS.ALL;

  if (allEntries.length === 0) {
    const firstLibraryAlbum = libraryEntries[0] || null;
    const writeFirstBtnHtml = firstLibraryAlbum
      ? '<button type="button" class="btn btn-primary" data-journal-action="new-entry-picker">Write Your First Journal Entry</button>'
      : '<button type="button" class="btn btn-primary" data-action="back-to-discover">Discover Albums to Rate &amp; Journal</button>';

    mountEl.innerHTML =
      '<div class="state-panel" data-empty-state="journal-empty">' +
      '<div class="state-panel__icon" aria-hidden="true">' +
      '<svg width="22" height="22" viewBox="0 0 24 24" fill="none">' +
      '<rect x="5" y="3" width="14" height="18" rx="2" stroke="currentColor" stroke-width="2"/>' +
      '<path d="M9 8H15M9 12H15M9 16H12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
      '</svg>' +
      '</div>' +
      '<h2 class="state-panel__title">Your Listening Journal is empty</h2>' +
      '<p class="state-panel__desc">Record personal liner notes, mood tags, favorite tracks, and song-by-song reflections for any album in your library, or import a saved RATEPLAY Journal JSON backup.</p>' +
      '<div class="state-panel__actions">' +
      writeFirstBtnHtml +
      '<button type="button" class="btn btn-secondary" data-journal-action="open-journal-import-modal">Import Journal JSON</button>' +
      '</div>' +
      '</div>';
    return;
  }

  if (visibleEntries.length === 0) {
    mountEl.innerHTML =
      '<div class="state-panel" data-empty-state="journal-filter-empty">' +
      '<div class="state-panel__icon" aria-hidden="true">!</div>' +
      '<h2 class="state-panel__title">No journal entries match your current filters</h2>' +
      '<p class="state-panel__desc">Try clearing your search query, mood tag filter, or rating tier filter.</p>' +
      '<div class="state-panel__actions">' +
      '<button type="button" class="btn btn-primary" data-journal-action="reset-journal-filters">Reset Journal Search &amp; Filters</button>' +
      '</div>' +
      '</div>';
    return;
  }

  const isFiltered =
    activeQuery.length > 0 ||
    activeMood.length > 0 ||
    activeRatingFilter !== JOURNAL_RATING_FILTERS.ALL;

  const countText = isFiltered
    ? 'SHOWING ' +
      String(visibleEntries.length) +
      ' OF ' +
      String(summary.totalEntries) +
      ' ENTRIES'
    : String(visibleEntries.length) +
      ' ' +
      (visibleEntries.length === 1 ? 'JOURNAL ENTRY' : 'JOURNAL ENTRIES');

  const resetBtnHtml = isFiltered
    ? '<button type="button" class="btn btn-secondary btn-sm" data-journal-action="reset-journal-filters">Reset Filters</button>'
    : '';

  const cardsHtml = visibleEntries.map(buildJournalEntryCardHtml).join('');

  mountEl.innerHTML =
    '<div class="section-header">' +
    '<div class="section-header__title-group">' +
    '<span class="section-header__eyebrow">CHRONOLOGICAL LISTENING LOG // LOCAL ARCHIVE</span>' +
    '<h2 class="section-header__title">Personal Liner Notes</h2>' +
    '</div>' +
    '<div class="chip-row">' +
    '<span class="section-header__count">' +
    escapeHtml(countText) +
    '</span>' +
    resetBtnHtml +
    '</div>' +
    '</div>' +
    '<div class="journal-entries-list">' +
    cardsHtml +
    '</div>';
}

/**
 * Renders the complete Listening Journal view.
 */
export function renderJournalView(
  container,
  queryResult,
  uiState = {},
  libraryEntries = []
) {
  if (!container) return;

  const activeQuery = String(uiState.journalQuery || '');
  const activeMood = String(uiState.journalMoodFilter || '');
  const activeRatingFilter =
    uiState.journalRatingFilter || JOURNAL_RATING_FILTERS.ALL;
  const activeSort = uiState.journalSort || JOURNAL_SORT_MODES.UPDATED_DESC;
  const { summary, allEntries, availableMoodTags } = queryResult;

  const hasEntries = allEntries.length > 0;
  const exportDisabledAttr = hasEntries ? '' : ' disabled';

  const sortOptions = [
    { value: JOURNAL_SORT_MODES.UPDATED_DESC, label: 'Recently Updated' },
    { value: JOURNAL_SORT_MODES.CREATED_DESC, label: 'Recently Created' },
    { value: JOURNAL_SORT_MODES.TITLE_ASC, label: 'Album Title A\u2013Z' },
    { value: JOURNAL_SORT_MODES.ARTIST_ASC, label: 'Artist A\u2013Z' }
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

  const ratingFilterOptions = [
    { value: JOURNAL_RATING_FILTERS.ALL, label: 'All Ratings' },
    { value: JOURNAL_RATING_FILTERS.MASTERPIECE, label: 'Masterpiece (9.0+)' },
    { value: JOURNAL_RATING_FILTERS.ESSENTIAL, label: 'Essential (7.5\u20138.9)' },
    { value: JOURNAL_RATING_FILTERS.SOLID, label: 'Solid (6.0\u20137.4)' },
    { value: JOURNAL_RATING_FILTERS.LOWER, label: 'Mixed / Skip (<6.0)' },
    { value: JOURNAL_RATING_FILTERS.UNRATED, label: 'Unrated Albums' }
  ];

  const ratingFilterOptionsHtml = ratingFilterOptions
    .map((opt) => {
      const selected = opt.value === activeRatingFilter ? ' selected' : '';
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

  const moodChipsHtml = [
    '<button type="button" class="query-chip' +
      (!activeMood ? ' is-active' : '') +
      '" data-journal-mood-filter="" aria-pressed="' +
      (!activeMood ? 'true' : 'false') +
      '">All Moods</button>',
    ...availableMoodTags.map((item) => {
      const isSelected =
        activeMood.toLowerCase() === item.tag.toLowerCase();
      return (
        '<button type="button" class="query-chip' +
        (isSelected ? ' is-active' : '') +
        '" data-journal-mood-filter="' +
        escapeHtml(item.tag) +
        '" aria-pressed="' +
        (isSelected ? 'true' : 'false') +
        '">#' +
        escapeHtml(item.tag) +
        ' (' +
        String(item.count) +
        ')</button>'
      );
    })
  ].join('');

  // Quick album selector bar so users can start or edit a journal entry for any album in their library
  const albumPickerOptionsHtml =
    libraryEntries.length > 0
      ? '<option value="">Select a rated album from your library to write or edit notes&hellip;</option>' +
        libraryEntries
          .map((alb) => {
            const hasExisting = allEntries.some(
              (e) => String(e.collectionId) === String(alb.collectionId)
            );
            const prefix = hasExisting ? '[Edit Entry] ' : '[New Entry] ';
            return (
              '<option value="' +
              escapeHtml(alb.collectionId) +
              '">' +
              escapeHtml(
                prefix + alb.collectionName + ' \u2014 ' + alb.artistName
              ) +
              '</option>'
            );
          })
          .join('')
      : '<option value="">Rate an album in Discover first to select it here</option>';

  const clearBtnHidden = activeQuery.trim().length > 0 ? '' : ' hidden';

  container.innerHTML =
    '<section class="library-header-panel journal-header-panel" aria-label="Listening Journal Overview">' +
    '<div class="library-header-panel__top">' +
    '<div>' +
    '<div class="discover-hero__eyebrow">' +
    '<span>RATEPLAY ARCHIVAL NOTEBOOK</span><span>//</span><span>LISTENING JOURNAL</span>' +
    '</div>' +
    '<h1 class="discover-hero__title">Personal Listening Journal</h1>' +
    '<p class="discover-hero__subtitle">Long-form album reflections, favorite track picks, song-by-song liner notes, and mood tags stored alongside your collection.</p>' +
    '</div>' +
    '<div class="chip-row library-portability-actions" role="group" aria-label="Journal Export and Import">' +
    '<button type="button" class="btn btn-secondary" data-journal-action="export-journal-json"' +
    exportDisabledAttr +
    ' title="Export your journal entries to a downloadable JSON file">' +
    'Export Journal JSON' +
    '</button>' +
    '<button type="button" class="btn btn-secondary" data-journal-action="open-journal-import-modal" title="Import journal entries from a RATEPLAY Journal JSON file">' +
    'Import Journal JSON' +
    '</button>' +
    '</div>' +
    '</div>' +
    '<div id="journal-summary-mount">' +
    buildJournalSummaryBarHtml(summary, libraryEntries.length) +
    '</div>' +
    '<div class="journal-compose-bar" role="region" aria-label="Create or edit a journal entry for a library album">' +
    '<label for="journal-album-picker-select" class="chip-label">Write / Edit Note:</label>' +
    '<select id="journal-album-picker-select" class="library-sort-select journal-album-picker-select" aria-label="Choose a library album to write or edit a journal entry">' +
    albumPickerOptionsHtml +
    '</select>' +
    '<button type="button" class="btn btn-primary" id="journal-open-editor-btn" data-journal-action="open-selected-album-editor" ' +
    (libraryEntries.length === 0 ? 'disabled' : '') +
    '>Open Journal Editor</button>' +
    '</div>' +
    '<div class="library-toolbar journal-toolbar" role="region" aria-label="Journal search, filter, and sort controls">' +
    '<div class="library-search-wrap">' +
    '<svg class="search-input-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true">' +
    '<circle cx="9" cy="9" r="6" stroke="currentColor" stroke-width="1.75"/>' +
    '<path d="M13.5 13.5L17 17" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>' +
    '</svg>' +
    '<input type="search" id="journal-search-input" class="search-input library-search-input" ' +
    'placeholder="Search journal by album, artist, review text, track notes, or #mood tag..." ' +
    'value="' +
    escapeHtml(activeQuery) +
    '" autocomplete="off" spellcheck="false" aria-label="Search journal entries" />' +
    '<div class="search-input-actions">' +
    '<button type="button" id="journal-search-clear-btn" class="search-clear-btn"' +
    clearBtnHidden +
    ' aria-label="Clear journal search">CLEAR</button>' +
    '</div>' +
    '</div>' +
    '<div class="library-controls-row">' +
    '<div class="chip-row" id="journal-mood-pills" role="group" aria-label="Filter journal by mood tag">' +
    '<span class="chip-label">Mood Tag:</span>' +
    moodChipsHtml +
    '</div>' +
    '<div class="chip-row">' +
    '<div class="library-sort-group">' +
    '<label for="journal-rating-filter-select" class="chip-label">Rating:</label>' +
    '<select id="journal-rating-filter-select" class="library-sort-select" aria-label="Filter journal entries by album rating">' +
    ratingFilterOptionsHtml +
    '</select>' +
    '</div>' +
    '<div class="library-sort-group">' +
    '<label for="journal-sort-select" class="chip-label">Sort By:</label>' +
    '<select id="journal-sort-select" class="library-sort-select" aria-label="Sort journal entries">' +
    sortOptionsHtml +
    '</select>' +
    '</div>' +
    '</div>' +
    '</div>' +
    '</div>' +
    '</section>' +
    '<section id="journal-results-mount" aria-live="polite"></section>';

  const resultsMount = container.querySelector('#journal-results-mount');
  renderJournalResultsMount(resultsMount, queryResult, uiState, libraryEntries);
}