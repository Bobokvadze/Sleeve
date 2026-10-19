/**
 * SLEEVE - Discover View & Personalized Recommendations Renderer (Phase 6 - Part 2)
 */

import {
  QUICK_DISCOVERY_QUERIES,
  getHighResArtwork,
  getTierInfo,
  formatReleaseYear,
  createFallbackCoverDataUri
} from '../config.js';

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderDiscoverShell(container, state) {
  const activeQuery = state.query || '';

  const chipsHtml = QUICK_DISCOVERY_QUERIES.map((chip) => {
    const isActive = activeQuery.toLowerCase() === chip.toLowerCase();
    const activeClass = isActive ? ' is-active' : '';
    const safeChip = escapeHtml(chip);
    return (
      '<button type="button" class="query-chip' +
      activeClass +
      '" data-quick-query="' +
      safeChip +
      '"><span>' +
      safeChip +
      '</span></button>'
    );
  }).join('');

  const clearHiddenAttr = activeQuery ? '' : ' hidden';
  const safeActiveQuery = escapeHtml(activeQuery);
  const discoveryHiddenAttr = activeQuery.trim().length > 0 ? ' hidden' : '';

  container.innerHTML =
    '<section class="discover-hero" aria-label="Album Discovery Search">' +
    '<div class="discover-hero__eyebrow">' +
    '<span>SLEEVE CATALOG ENGINE</span><span>//</span><span>ARCHIVE &amp; TRACKLIST INSPECTOR</span>' +
    '</div>' +
    '<h1 class="discover-hero__title">Every great record deserves a full listen.</h1>' +
    '<p class="discover-hero__subtitle">' +
    'Search millions of releases via the public music catalog or explore our curated essential pressings below. Select any record to inspect its full tracklist and rate every song.' +
    '</p>' +
    '<div class="search-console">' +
    '<div class="search-input-wrap">' +
    '<svg class="search-input-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true">' +
    '<circle cx="9" cy="9" r="6" stroke="currentColor" stroke-width="1.75"/>' +
    '<path d="M13.5 13.5L17 17" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>' +
    '</svg>' +
    '<input type="search" id="album-search-input" class="search-input" ' +
    'placeholder="Search by album title or artist (e.g., In Rainbows, Sade, Kendrick Lamar)..." ' +
    'value="' +
    safeActiveQuery +
    '" autocomplete="off" spellcheck="false" aria-label="Search albums by title or artist" />' +
    '<div class="search-input-actions">' +
    '<div id="search-loading-spinner" class="search-spinner" hidden aria-hidden="true"></div>' +
    '<button type="button" id="search-clear-btn" class="search-clear-btn"' +
    clearHiddenAttr +
    ' aria-label="Clear search query">CLEAR</button>' +
    '</div></div>' +
    '<div class="chip-row" role="group" aria-label="Quick artist searches">' +
    '<span class="chip-label">Quick Pressings:</span>' +
    chipsHtml +
    '</div></div></section>' +
    '<section id="personal-discovery-mount" class="personal-discovery-mount"' +
    discoveryHiddenAttr +
    ' aria-live="polite"></section>' +
    '<section id="discover-results-mount" aria-live="polite"></section>';
}

/**
 * Renders the personalized discovery section derived from the user's local ratings:
 * 1. Highly-rated artists the user has only rated 1-2 albums from.
 * 2. Additional unrated albums from the user's top-rated library artists via iTunes API.
 */
export function renderPersonalizedDiscoverySection(mountEl, discoveryState) {
  if (!mountEl) return;

  const { status, signals, recommendedAlbums = [], error = null } = discoveryState || {};

  // Empty library state
  if (!signals || !signals.hasRatings) {
    mountEl.innerHTML =
      '<div class="discovery-callout-panel" data-discovery-state="empty">' +
      '<div class="discovery-callout-panel__content">' +
      '<span class="section-header__eyebrow">PERSONALIZED DISCOVERY // SIGNAL ENGINE</span>' +
      '<h2 class="discovery-callout-panel__title">Rate your first album to unlock tailored artist &amp; catalog recommendations</h2>' +
      '<p class="discovery-callout-panel__desc">Once you rate tracks on any record, SLEEVE analyzes your highest-scored artists to surface deeper catalog cuts and unrated pressings.</p>' +
      '</div>' +
      '</div>';
    return;
  }

  // Build "Highly Rated Artists to Explore Further" cards (artists with <= 2 rated albums)
  const underExploredHtml =
    signals.underExploredArtists.length > 0
      ? '<div class="discovery-artists-strip">' +
        '<div class="discovery-sub-header">' +
        '<span class="discovery-sub-header__label">EXPLORE DEEPER // HIGHLY RATED ARTISTS WITH FEW RATED ALBUMS</span>' +
        '</div>' +
        '<div class="discovery-artist-pills">' +
        signals.underExploredArtists
          .map((art) => {
            const tier = getTierInfo(art.averageScore);
            const safeArtist = escapeHtml(art.artistName);
            const lpLabel =
              String(art.albumCount) + ' ' + (art.albumCount === 1 ? 'LP' : 'LPs') + ' RATED';
            return (
              '<button type="button" class="discovery-artist-chip" data-artist-search="' +
              safeArtist +
              '" title="Search full discography for ' +
              safeArtist +
              '">' +
              '<span class="discovery-artist-chip__name">' +
              safeArtist +
              '</span>' +
              '<span class="discovery-artist-chip__meta">' +
              escapeHtml(lpLabel) +
              '</span>' +
              '<span class="discovery-artist-chip__score" style="color: ' +
              tier.color +
              '">AVG ' +
              escapeHtml(art.formattedAverageScore || '--.-') +
              '</span>' +
              '<span class="discovery-artist-chip__arrow" aria-hidden="true">&rarr;</span>' +
              '</button>'
            );
          })
          .join('') +
        '</div></div>'
      : '';

  let catalogBodyHtml = '';

  if (status === 'loading') {
    const skeletonCards = Array.from({ length: 4 })
      .map(
        () =>
          '<div class="album-card album-card--skeleton" aria-hidden="true">' +
          '<div class="album-card__artwork-wrap skeleton-box"></div>' +
          '<div class="album-card__body">' +
          '<div class="skeleton-box skeleton-line"></div>' +
          '<div class="skeleton-box skeleton-line skeleton-line--short"></div>' +
          '</div></div>'
      )
      .join('');

    catalogBodyHtml =
      '<div class="discovery-sub-header">' +
      '<span class="discovery-sub-header__label">FETCHING UNRATED PRESSINGS FROM YOUR TOP ARTISTS&hellip;</span>' +
      '</div>' +
      '<div class="album-grid discovery-album-grid">' +
      skeletonCards +
      '</div>';
  } else if (status === 'error') {
    catalogBodyHtml =
      '<div class="discovery-error-box" role="alert">' +
      '<div>' +
      '<strong>Could not load catalog recommendations:</strong> ' +
      escapeHtml(error || 'iTunes API connection interrupted.') +
      '</div>' +
      '<button type="button" class="btn btn-secondary btn-sm" data-action="refresh-discovery">Retry</button>' +
      '</div>';
  } else if (recommendedAlbums.length === 0) {
    catalogBodyHtml =
      '<div class="discovery-empty-catalog-note">' +
      '<span>No additional unrated albums found for your current top artists right now. Click any artist above to search their full catalog.</span>' +
      '</div>';
  } else {
    const cardsHtml = recommendedAlbums
      .map((album) => {
        const year = formatReleaseYear(album.releaseDate);
        const coverUrl = getHighResArtwork(album.artworkUrl100, 600);
        const fallbackCover = createFallbackCoverDataUri(album.collectionName);
        const trackLabel =
          album.trackCount > 0 ? String(album.trackCount) + ' TRACKS' : 'LP';

        const safeId = escapeHtml(album.collectionId);
        const safeTitle = escapeHtml(album.collectionName);
        const safeArtist = escapeHtml(album.artistName);
        const safeYear = escapeHtml(year);
        const safeGenre = escapeHtml(album.primaryGenreName);
        const safeCover = escapeHtml(coverUrl);
        const safeFallback = escapeHtml(fallbackCover);

        const signal = album.discoverySignal;
        const signalBadgeText =
          signal && signal.seedArtistAverageScore
            ? 'RATED ' + signal.seedArtistAverageScore + ' ARTIST'
            : 'FROM YOUR LIBRARY';

        return (
          '<article class="album-card discovery-rec-card" tabindex="0" role="button" data-album-id="' +
          safeId +
          '" aria-label="Inspect recommended album ' +
          safeTitle +
          ' by ' +
          safeArtist +
          ' (' +
          safeYear +
          ')">' +
          '<div class="album-card__artwork-wrap">' +
          '<img class="album-card__artwork" src="' +
          safeCover +
          '" alt="' +
          safeTitle +
          ' cover artwork" loading="lazy" onerror="this.onerror=null;this.src=\'' +
          safeFallback +
          '\';" />' +
          '<span class="discovery-signal-badge">' +
          escapeHtml(signalBadgeText) +
          '</span>' +
          '<div class="album-card__hover-badge"><span>INSPECT &amp; RATE</span><span aria-hidden="true">&rarr;</span></div>' +
          '</div>' +
          '<div class="album-card__body">' +
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
          '<div class="album-card__meta">' +
          '<span>' +
          safeYear +
          ' &middot; ' +
          escapeHtml(trackLabel) +
          '</span>' +
          '<span class="album-card__genre">' +
          safeGenre +
          '</span>' +
          '</div></article>'
        );
      })
      .join('');

    catalogBodyHtml =
      '<div class="discovery-sub-header">' +
      '<span class="discovery-sub-header__label">UNRATED ALBUMS FROM HIGHLY RATED ARTISTS IN YOUR LIBRARY</span>' +
      '</div>' +
      '<div class="album-grid discovery-album-grid">' +
      cardsHtml +
      '</div>';
  }

  mountEl.innerHTML =
    '<div class="personal-discovery-panel" data-discovery-state="' +
    escapeHtml(status || 'ready') +
    '">' +
    '<div class="section-header discovery-section-header">' +
    '<div class="section-header__title-group">' +
    '<span class="section-header__eyebrow">PERSONALIZED DISCOVERY // BASED ON YOUR RATINGS</span>' +
    '<h2 class="section-header__title">Recommended From Your Library Signals</h2>' +
    '</div>' +
    '<div class="chip-row">' +
    '<button type="button" class="btn btn-ghost btn-sm" data-action="refresh-discovery" title="Refresh discovery recommendations">Refresh</button>' +
    '</div>' +
    '</div>' +
    underExploredHtml +
    catalogBodyHtml +
    '</div>';
}

export function renderDiscoverSkeletons(mountEl, queryText = '') {
  const cards = Array.from({ length: 8 })
    .map(
      () =>
        '<div class="album-card album-card--skeleton" aria-hidden="true">' +
        '<div class="album-card__artwork-wrap skeleton-box"></div>' +
        '<div class="album-card__body">' +
        '<div class="skeleton-box skeleton-line"></div>' +
        '<div class="skeleton-box skeleton-line skeleton-line--short"></div>' +
        '</div></div>'
    )
    .join('');

  mountEl.innerHTML =
    '<div class="section-header">' +
    '<div class="section-header__title-group">' +
    '<span class="section-header__eyebrow">SEARCHING CATALOG</span>' +
    '<h2 class="section-header__title">Looking up &ldquo;' +
    escapeHtml(queryText) +
    '&rdquo;&hellip;</h2>' +
    '</div></div>' +
    '<div class="album-grid">' +
    cards +
    '</div>';
}

export function renderAlbumGrid(mountEl, { albums, query, savedRatingsMap, isFallback }) {
  const isSearch = Boolean(query && query.trim().length > 0);

  if (!albums || albums.length === 0) {
    mountEl.innerHTML =
      '<div class="state-panel">' +
      '<div class="state-panel__icon" aria-hidden="true">' +
      '<svg width="22" height="22" viewBox="0 0 24 24" fill="none">' +
      '<circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2"/>' +
      '<path d="M16.5 16.5L21 21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
      '</svg></div>' +
      '<h2 class="state-panel__title">No pressings found for &ldquo;' +
      escapeHtml(query) +
      '&rdquo;</h2>' +
      '<p class="state-panel__desc">Check the spelling of the artist or album title, or return to the curated Essential Listening shelf.</p>' +
      '<div class="state-panel__actions">' +
      '<button type="button" class="btn btn-primary" data-action="reset-search">Return to Essential Listening</button>' +
      '</div></div>';
    return;
  }

  const eyebrow = isSearch
    ? isFallback
      ? 'OFFLINE ARCHIVE MATCH'
      : 'LIVE CATALOG RESULTS'
    : 'CURATED ARCHIVE // HOUSE PRESSINGS';

  const heading = isSearch
    ? 'Results for "' + escapeHtml(query) + '"'
    : 'Essential Listening';

  const cardsHtml = albums
    .map((album) => {
      const year = formatReleaseYear(album.releaseDate);
      const coverUrl = getHighResArtwork(album.artworkUrl100, 600);
      const fallbackCover = createFallbackCoverDataUri(album.collectionName);
      const savedEntry = savedRatingsMap?.[String(album.collectionId)];
      const hasValidOverall =
        savedEntry &&
        savedEntry.overallScore !== null &&
        savedEntry.overallScore !== undefined &&
        Number.isFinite(Number(savedEntry.overallScore));
      const tier = hasValidOverall ? getTierInfo(savedEntry.overallScore) : null;

      const scoreBadgeHtml =
        hasValidOverall && tier
          ? '<span class="album-card__score-badge" style="color: ' +
            tier.color +
            '">' +
            Number(savedEntry.overallScore).toFixed(1) +
            '</span>'
          : '';

      const trackLabel =
        album.trackCount > 0 ? String(album.trackCount) + ' TRACKS' : 'LP';

      const safeId = escapeHtml(album.collectionId);
      const safeTitle = escapeHtml(album.collectionName);
      const safeArtist = escapeHtml(album.artistName);
      const safeYear = escapeHtml(year);
      const safeGenre = escapeHtml(album.primaryGenreName);
      const safeCover = escapeHtml(coverUrl);
      const safeFallback = escapeHtml(fallbackCover);

      return (
        '<article class="album-card" tabindex="0" role="button" data-album-id="' +
        safeId +
        '" aria-label="Inspect ' +
        safeTitle +
        ' by ' +
        safeArtist +
        ' (' +
        safeYear +
        ')">' +
        '<div class="album-card__artwork-wrap">' +
        '<img class="album-card__artwork" src="' +
        safeCover +
        '" alt="' +
        safeTitle +
        ' cover artwork" loading="lazy" onerror="this.onerror=null;this.src=\'' +
        safeFallback +
        '\';" />' +
        scoreBadgeHtml +
        '<div class="album-card__hover-badge"><span>INSPECT &amp; RATE</span><span aria-hidden="true">&rarr;</span></div>' +
        '</div>' +
        '<div class="album-card__body">' +
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
        '<div class="album-card__meta">' +
        '<span>' +
        safeYear +
        ' &middot; ' +
        escapeHtml(trackLabel) +
        '</span>' +
        '<span class="album-card__genre">' +
        safeGenre +
        '</span>' +
        '</div></article>'
      );
    })
    .join('');

  const countLabel =
    String(albums.length) + ' ' + (albums.length === 1 ? 'ALBUM' : 'ALBUMS');
  const resetBtnHtml = isSearch
    ? '<button type="button" class="btn btn-secondary" data-action="reset-search">Reset Shelf</button>'
    : '';

  mountEl.innerHTML =
    '<div class="section-header">' +
    '<div class="section-header__title-group">' +
    '<span class="section-header__eyebrow">' +
    eyebrow +
    '</span>' +
    '<h2 class="section-header__title">' +
    heading +
    '</h2>' +
    '</div>' +
    '<div class="chip-row">' +
    '<span class="section-header__count">' +
    countLabel +
    '</span>' +
    resetBtnHtml +
    '</div></div>' +
    '<div class="album-grid">' +
    cardsHtml +
    '</div>';
}

export function renderDiscoverError(mountEl, query, errorMessage) {
  const safeMsg = escapeHtml(
    errorMessage || 'Unable to reach the iTunes search endpoint right now.'
  );
  mountEl.innerHTML =
    '<div class="state-panel">' +
    '<div class="state-panel__icon" aria-hidden="true">!</div>' +
    '<h2 class="state-panel__title">Catalog Connection Interrupted</h2>' +
    '<p class="state-panel__desc">' +
    safeMsg +
    '</p>' +
    '<div class="state-panel__actions">' +
    '<button type="button" class="btn btn-primary" data-action="retry-search">Retry Search</button>' +
    '<button type="button" class="btn btn-secondary" data-action="reset-search">Load Offline Essentials</button>' +
    '</div></div>';
}