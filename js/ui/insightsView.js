/**
 * RATEPLAY - Listening Insights View Renderer (Phase 7)
 * Renders:
 * 1. Taste DNA (top artists, available genres, preferred decades, and metadata coverage)
 * 2. Rating Distribution (mean, median, total rated/scored albums, and visual tier bars)
 * 3. Artist Rankings (sample-size aware rankings with multi-album vs single-album filter)
 * 4. Decade Breakdown (release decade counts, average scores, and unknown-year handling)
 * 5. Hidden Gems (transparent local selection criteria)
 * 6. Share Insights actions (1080x1920 PNG preview modal & direct download)
 */

import { getTierInfo } from '../config.js';
import { escapeHtml } from './discoverView.js';

function buildTasteDnaSectionHtml(tasteDna) {
  const cov = tasteDna.metadataCoverage;

  // Top Artists Pills
  const topArtistsHtml =
    tasteDna.topArtists.length > 0
      ? '<div class="dna-pill-list">' +
        tasteDna.topArtists
          .map((art, idx) => {
            const tier = getTierInfo(art.averageScore);
            return (
              '<button type="button" class="dna-entity-pill" data-artist-search="' +
              escapeHtml(art.artistName) +
              '" title="Search more albums by ' +
              escapeHtml(art.artistName) +
              '">' +
              '<span class="dna-entity-pill__rank">#' +
              String(idx + 1) +
              '</span>' +
              '<span class="dna-entity-pill__name">' +
              escapeHtml(art.artistName) +
              '</span>' +
              '<span class="dna-entity-pill__meta">' +
              String(art.albumCount) +
              (art.albumCount === 1 ? ' LP' : ' LPs') +
              '</span>' +
              '<span class="dna-entity-pill__score" style="color: ' +
              tier.color +
              '">' +
              escapeHtml(art.formattedAverageScore || '--.-') +
              '</span>' +
              '</button>'
            );
          })
          .join('') +
        '</div>'
      : '<p class="insights-muted-note">No known artist metadata available yet.</p>';

  // Available Genres List
  const genresHtml =
    tasteDna.availableGenres.length > 0
      ? '<div class="dna-bar-list">' +
        tasteDna.availableGenres
          .slice(0, 6)
          .map((g) => {
            const avgText = g.formattedAverageScore
              ? 'AVG ' + escapeHtml(g.formattedAverageScore)
              : 'UNSCORED';
            return (
              '<div class="dna-bar-row">' +
              '<div class="dna-bar-row__top">' +
              '<span class="dna-bar-row__name">' +
              escapeHtml(g.genreName) +
              '</span>' +
              '<span class="dna-bar-row__stats">' +
              String(g.albumCount) +
              (g.albumCount === 1 ? ' album' : ' albums') +
              ' (' +
              String(g.sharePercent) +
              '% of known) &middot; <strong style="color: ' +
              g.tierColor +
              '">' +
              avgText +
              '</strong></span>' +
              '</div>' +
              '<div class="dna-bar-track">' +
              '<div class="dna-bar-fill" style="width: ' +
              String(Math.max(6, g.sharePercent)) +
              '%; background: ' +
              g.tierColor +
              '"></div>' +
              '</div>' +
              '</div>'
            );
          })
          .join('') +
        '</div>'
      : '<p class="insights-muted-note">No specific genre metadata available for your current rated albums.</p>';

  // Preferred Release Decades Pills
  const decadesPillsHtml =
    tasteDna.preferredDecades.length > 0
      ? '<div class="dna-pill-list">' +
        tasteDna.preferredDecades
          .slice(0, 5)
          .map((d) => {
            return (
              '<div class="dna-entity-pill dna-entity-pill--static">' +
              '<span class="dna-entity-pill__name">' +
              escapeHtml(d.decadeLabel) +
              '</span>' +
              '<span class="dna-entity-pill__meta">' +
              String(d.albumCount) +
              (d.albumCount === 1 ? ' LP' : ' LPs') +
              '</span>' +
              '<span class="dna-entity-pill__score" style="color: ' +
              d.tierColor +
              '">AVG ' +
              escapeHtml(d.formattedAverageScore || '--.-') +
              '</span>' +
              '</div>'
            );
          })
          .join('') +
        '</div>'
      : '<p class="insights-muted-note">No valid 4-digit release years available yet.</p>';

  return (
    '<section class="profile-panel insights-panel--full" aria-label="Taste DNA Summary">' +
    '<header class="profile-panel__header">' +
    '<div>' +
    '<span class="profile-panel__eyebrow">SECTION 01 // TASTE DNA &amp; METADATA TRANSPARENCY</span>' +
    '<h2 class="profile-panel__title">Taste DNA</h2>' +
    '</div>' +
    '<span class="meta-pill meta-pill--accent">' +
    escapeHtml(tasteDna.dnaHeadline) +
    '</span>' +
    '</header>' +
    '<div class="taste-dna-grid">' +
    '<div class="taste-dna-col">' +
    '<div class="taste-dna-col__header">' +
    '<h3 class="taste-dna-col__title">Top Artists</h3>' +
    '<span class="taste-dna-coverage-badge" data-dna-coverage="artists">' +
    String(cov.knownArtistAlbums) +
    ' known &middot; ' +
    String(cov.unavailableArtistAlbums) +
    ' unavailable</span>' +
    '</div>' +
    topArtistsHtml +
    '</div>' +
    '<div class="taste-dna-col">' +
    '<div class="taste-dna-col__header">' +
    '<h3 class="taste-dna-col__title">Available Genres</h3>' +
    '<span class="taste-dna-coverage-badge" data-dna-coverage="genres">' +
    String(cov.knownGenreAlbums) +
    ' known &middot; ' +
    String(cov.unavailableGenreAlbums) +
    ' unavailable</span>' +
    '</div>' +
    genresHtml +
    '</div>' +
    '<div class="taste-dna-col">' +
    '<div class="taste-dna-col__header">' +
    '<h3 class="taste-dna-col__title">Preferred Release Decades</h3>' +
    '<span class="taste-dna-coverage-badge" data-dna-coverage="decades">' +
    String(cov.knownDecadeAlbums) +
    ' known &middot; ' +
    String(cov.unavailableDecadeAlbums) +
    ' unavailable</span>' +
    '</div>' +
    decadesPillsHtml +
    '</div>' +
    '</div>' +
    '</section>'
  );
}

function buildRatingDistributionSectionHtml(dist) {
  const avgDisplay = dist.formattedAverageScore
    ? escapeHtml(dist.formattedAverageScore)
    : '--.-';
  const medianDisplay = dist.formattedMedianScore
    ? escapeHtml(dist.formattedMedianScore)
    : '--.-';
  const rangeDisplay =
    dist.formattedHighestScore && dist.formattedLowestScore
      ? escapeHtml(dist.formattedLowestScore) + ' \u2013 ' + escapeHtml(dist.formattedHighestScore)
      : '--.-';

  const unscoredNote =
    dist.unscoredAlbumsCount > 0
      ? String(dist.unscoredAlbumsCount) +
        ' rated album(s) with only excluded tracks are omitted from score math'
      : 'All rated library albums have valid included track scores';

  const barsHtml = dist.tierBuckets
    .map((bucket) => {
      return (
        '<div class="dist-tier-row" data-dist-tier="' +
        escapeHtml(bucket.id) +
        '">' +
        '<div class="dist-tier-row__label-col">' +
        '<span class="dist-tier-row__name" style="color: ' +
        bucket.color +
        '">' +
        escapeHtml(bucket.label) +
        '</span>' +
        '<span class="dist-tier-row__range">' +
        escapeHtml(bucket.rangeLabel) +
        '</span>' +
        '</div>' +
        '<div class="dist-tier-row__bar-col">' +
        '<div class="dist-bar-track">' +
        '<div class="dist-bar-fill" style="width: ' +
        String(bucket.count > 0 ? Math.max(4, bucket.barWidthPercent) : 0) +
        '%; background: ' +
        bucket.color +
        '"></div>' +
        '</div>' +
        '</div>' +
        '<div class="dist-tier-row__count-col">' +
        '<strong>' +
        String(bucket.count) +
        '</strong>' +
        '<span>(' +
        String(bucket.percentage) +
        '%)</span>' +
        '</div>' +
        '</div>'
      );
    })
    .join('');

  return (
    '<section class="profile-panel" aria-label="Album Rating Distribution">' +
    '<header class="profile-panel__header">' +
    '<div>' +
    '<span class="profile-panel__eyebrow">SECTION 02 // STATISTICAL SPREAD</span>' +
    '<h2 class="profile-panel__title">Rating Distribution</h2>' +
    '</div>' +
    '<span class="meta-pill">' +
    String(dist.scoredAlbumsCount) +
    ' SCORED ALBUMS</span>' +
    '</header>' +
    '<div class="insights-panel-body">' +
    '<div class="dist-metrics-strip">' +
    '<div class="dist-metric-box">' +
    '<span class="dist-metric-box__label">AVERAGE RATING</span>' +
    '<strong class="dist-metric-box__val" data-insights-stat="mean-score" style="color: ' +
    dist.averageTierColor +
    '">' +
    avgDisplay +
    '</strong>' +
    '<span class="dist-metric-box__sub">' +
    escapeHtml(dist.averageTierLabel) +
    ' mean</span>' +
    '</div>' +
    '<div class="dist-metric-box">' +
    '<span class="dist-metric-box__label">MEDIAN RATING</span>' +
    '<strong class="dist-metric-box__val" data-insights-stat="median-score" style="color: ' +
    dist.medianTierColor +
    '">' +
    medianDisplay +
    '</strong>' +
    '<span class="dist-metric-box__sub">Middle scored LP</span>' +
    '</div>' +
    '<div class="dist-metric-box">' +
    '<span class="dist-metric-box__label">TOTAL RATED LPs</span>' +
    '<strong class="dist-metric-box__val" data-insights-stat="total-albums">' +
    String(dist.totalRatedAlbums) +
    '</strong>' +
    '<span class="dist-metric-box__sub">' +
    String(dist.scoredAlbumsCount) +
    ' scored</span>' +
    '</div>' +
    '<div class="dist-metric-box">' +
    '<span class="dist-metric-box__label">SCORE RANGE</span>' +
    '<strong class="dist-metric-box__val">' +
    rangeDisplay +
    '</strong>' +
    '<span class="dist-metric-box__sub">Min to Max</span>' +
    '</div>' +
    '</div>' +
    '<div class="dist-bars-container" role="region" aria-label="Score tier histogram">' +
    barsHtml +
    '</div>' +
    '<p class="insights-footnote">' +
    escapeHtml(unscoredNote) +
    '.</p>' +
    '</div>' +
    '</section>'
  );
}

export function buildArtistRankingsListHtml(artistRankings, filterMode = 'all') {
  const mode = String(filterMode || 'all');
  let list = artistRankings.rankedArtists;
  if (mode === 'multi') {
    list = artistRankings.multiAlbumArtists;
  } else if (mode === 'single') {
    list = artistRankings.singleAlbumArtists;
  }

  if (!list || list.length === 0) {
    const emptyMsg =
      mode === 'multi'
        ? 'You have not rated 2+ albums by the same artist yet. Rate a second album by any artist to unlock multi-album catalog rankings, or switch to "All Scored Artists" above.'
        : 'No scored artists match this sample filter.';
    return '<div class="profile-empty-box"><p>' + escapeHtml(emptyMsg) + '</p></div>';
  }

  const rowsHtml = list
    .slice(0, 8)
    .map((art, idx) => {
      const rankStr = '#' + String(idx + 1).padStart(2, '0');
      const safeArtist = escapeHtml(art.artistName);
      const safeCover = escapeHtml(art.coverUrl);
      const safeFallback = escapeHtml(art.fallbackCoverUrl);
      const samplePillClass = art.isMultiAlbumSample
        ? 'sample-size-pill sample-size-pill--multi'
        : 'sample-size-pill sample-size-pill--single';

      return (
        '<article class="insights-artist-row" data-ranked-artist="' +
        safeArtist +
        '" data-sample-category="' +
        escapeHtml(art.sampleCategory) +
        '">' +
        '<span class="profile-rank-row__num">' +
        escapeHtml(rankStr) +
        '</span>' +
        '<div class="profile-rank-row__thumb-wrap">' +
        '<img class="profile-rank-row__thumb" src="' +
        safeCover +
        '" alt="' +
        safeArtist +
        '" loading="lazy" onerror="this.onerror=null;this.src=\'' +
        safeFallback +
        '\';" />' +
        '</div>' +
        '<div class="profile-rank-row__info">' +
        '<div class="insights-artist-row__title-line">' +
        '<button type="button" class="album-banner-card__artist-link insights-artist-name-btn" data-artist-search="' +
        safeArtist +
        '" title="Search more albums by ' +
        safeArtist +
        '">' +
        safeArtist +
        '</button>' +
        '<span class="' +
        samplePillClass +
        '" title="' +
        escapeHtml(art.sampleConfidenceNote) +
        '">' +
        escapeHtml(art.sampleBadgeText) +
        '</span>' +
        '</div>' +
        '<p class="profile-rank-row__meta">' +
        escapeHtml(art.sampleConfidenceNote) +
        (art.topAlbumTitle ? ' &middot; Top LP: ' + escapeHtml(art.topAlbumTitle) : '') +
        '</p>' +
        '</div>' +
        '<div class="profile-rank-row__score-wrap">' +
        '<span class="profile-rank-row__tier">AVG SCORE</span>' +
        '<span class="profile-rank-row__score" style="color: ' +
        art.tierColor +
        '">' +
        escapeHtml(art.formattedAverageScore || '--.-') +
        '</span>' +
        '</div>' +
        '</article>'
      );
    })
    .join('');

  return '<div class="profile-rank-list">' + rowsHtml + '</div>';
}

function buildArtistRankingsSectionHtml(artistRankings, activeFilter = 'all') {
  const filterOptions = [
    {
      id: 'all',
      label: 'All Scored (' + String(artistRankings.rankedArtists.length) + ')'
    },
    {
      id: 'multi',
      label: '2+ Albums Sample (' + String(artistRankings.multiAlbumArtists.length) + ')'
    },
    {
      id: 'single',
      label: '1 Album Sample (' + String(artistRankings.singleAlbumArtists.length) + ')'
    }
  ];

  const filterChipsHtml = filterOptions
    .map((opt) => {
      const isActive = opt.id === activeFilter;
      return (
        '<button type="button" class="query-chip' +
        (isActive ? ' is-active' : '') +
        '" data-insights-artist-filter="' +
        escapeHtml(opt.id) +
        '" aria-pressed="' +
        (isActive ? 'true' : 'false') +
        '">' +
        escapeHtml(opt.label) +
        '</button>'
      );
    })
    .join('');

  return (
    '<section class="profile-panel" aria-label="Artist Rankings">' +
    '<header class="profile-panel__header">' +
    '<div>' +
    '<span class="profile-panel__eyebrow">SECTION 03 // SAMPLE-SIZE AWARE RANKING</span>' +
    '<h2 class="profile-panel__title">Artist Rankings</h2>' +
    '</div>' +
    '<div class="chip-row" role="group" aria-label="Filter artist rankings by sample size">' +
    filterChipsHtml +
    '</div>' +
    '</header>' +
    '<div class="insights-methodology-banner">' +
    '<strong>Ranking Methodology:</strong> Artists with 2+ scored albums are prioritized ahead of single-album entries so a single high-scoring LP does not masquerade as a multi-album catalog average. Every row displays its exact album and track sample size.' +
    '</div>' +
    '<div id="insights-artist-rankings-mount">' +
    buildArtistRankingsListHtml(artistRankings, activeFilter) +
    '</div>' +
    '</section>'
  );
}

function buildDecadeBreakdownSectionHtml(decadeBreakdown) {
  const cards = decadeBreakdown.decades.map((d) => {
    const avgDisplay = d.formattedAverageScore
      ? escapeHtml(d.formattedAverageScore)
      : '--.-';
    const topRecordHtml =
      d.topAlbumTitle && d.topAlbumId
        ? '<button type="button" class="decade-card__top-album" data-album-id="' +
          escapeHtml(d.topAlbumId) +
          '">Standout: ' +
          escapeHtml(d.topAlbumTitle) +
          ' (' +
          escapeHtml(d.topAlbumArtist) +
          ') &rarr;</button>'
        : '';

    return (
      '<article class="decade-card" data-decade-card="' +
      escapeHtml(d.decadeLabel) +
      '">' +
      '<div class="decade-card__top">' +
      '<div>' +
      '<h3 class="decade-card__title">' +
      escapeHtml(d.decadeLabel) +
      '</h3>' +
      '<span class="decade-card__counts">' +
      String(d.albumCount) +
      ' ' +
      (d.albumCount === 1 ? 'album' : 'albums') +
      ' &middot; ' +
      String(d.ratedTrackCount) +
      ' tracks rated</span>' +
      '</div>' +
      '<div class="decade-card__score-box">' +
      '<span class="decade-card__score-label">AVG RATING</span>' +
      '<strong class="decade-card__score-val" style="color: ' +
      d.tierColor +
      '">' +
      avgDisplay +
      '</strong>' +
      '</div>' +
      '</div>' +
      '<div class="dist-bar-track">' +
      '<div class="dist-bar-fill" style="width: ' +
      String(Math.max(8, d.barWidthPercent)) +
      '%; background: ' +
      d.tierColor +
      '"></div>' +
      '</div>' +
      topRecordHtml +
      '</article>'
    );
  });

  if (decadeBreakdown.unavailableDecadeAlbumCount > 0) {
    const unk = decadeBreakdown.unknownDecadeSummary;
    cards.push(
      '<article class="decade-card decade-card--unknown" data-decade-card="unknown">' +
      '<div class="decade-card__top">' +
      '<div>' +
      '<h3 class="decade-card__title">Release Year Unavailable</h3>' +
      '<span class="decade-card__counts">' +
      String(unk.albumCount) +
      ' ' +
      (unk.albumCount === 1 ? 'album' : 'albums') +
      ' without a valid 4-digit year</span>' +
      '</div>' +
      '<div class="decade-card__score-box">' +
      '<span class="decade-card__score-label">AVG RATING</span>' +
      '<strong class="decade-card__score-val">' +
      escapeHtml(unk.formattedAverageScore || '--.-') +
      '</strong>' +
      '</div>' +
      '</div>' +
      '</article>'
    );
  }

  const bodyHtml =
    cards.length > 0
      ? '<div class="decade-cards-grid">' + cards.join('') + '</div>'
      : '<div class="profile-empty-box"><p>No rated albums available for decade grouping.</p></div>';

  return (
    '<section class="profile-panel insights-panel--full" aria-label="Release Decade Breakdown">' +
    '<header class="profile-panel__header">' +
    '<div>' +
    '<span class="profile-panel__eyebrow">SECTION 04 // CHRONOLOGICAL ERAS</span>' +
    '<h2 class="profile-panel__title">Decade Breakdown</h2>' +
    '</div>' +
    '<span class="meta-pill">' +
    String(decadeBreakdown.decades.length) +
    ' ACTIVE DECADES</span>' +
    '</header>' +
    bodyHtml +
    '</section>'
  );
}

function buildHiddenGemsSectionHtml(hiddenGems) {
  const gemsList = hiddenGems.gems || [];

  const bodyHtml =
    gemsList.length === 0
      ? '<div class="profile-empty-box">' +
        '<p>No Hidden Gems identified yet. Rate tracks on an album to 7.5 or higher to surface standout records from less frequently rated artists or compact rating logs.</p>' +
        '</div>'
      : '<div class="hidden-gems-grid">' +
        gemsList
          .map((gem) => {
            const safeId = escapeHtml(gem.collectionId);
            const safeTitle = escapeHtml(gem.collectionName);
            const safeArtist = escapeHtml(gem.artistName);
            const safeYear = escapeHtml(gem.releaseYear);
            const safeCover = escapeHtml(gem.coverUrl);
            const safeFallback = escapeHtml(gem.fallbackCoverUrl);

            const tagsHtml = (gem.criteriaTags || [])
              .map(
                (t) =>
                  '<span class="gem-criteria-pill">' + escapeHtml(t) + '</span>'
              )
              .join('');

            return (
              '<article class="gem-card" tabindex="0" role="button" data-album-id="' +
              safeId +
              '" aria-label="Open hidden gem ' +
              safeTitle +
              ' by ' +
              safeArtist +
              '">' +
              '<div class="gem-card__top">' +
              '<div class="gem-card__art">' +
              '<img src="' +
              safeCover +
              '" alt="' +
              safeTitle +
              ' cover" loading="lazy" onerror="this.onerror=null;this.src=\'' +
              safeFallback +
              '\';" />' +
              '</div>' +
              '<div class="gem-card__identity">' +
              '<div class="gem-card__tags">' +
              tagsHtml +
              '</div>' +
              '<h3 class="gem-card__title">' +
              safeTitle +
              '</h3>' +
              '<p class="gem-card__artist">' +
              safeArtist +
              ' &middot; ' +
              safeYear +
              '</p>' +
              '</div>' +
              '<div class="gem-card__score" style="color: ' +
              gem.tierColor +
              '">' +
              escapeHtml(gem.formattedScore) +
              '</div>' +
              '</div>' +
              '<p class="gem-card__reason">' +
              escapeHtml(gem.criteriaExplanation) +
              '</p>' +
              '</article>'
            );
          })
          .join('') +
        '</div>';

  return (
    '<section class="profile-panel insights-panel--full" aria-label="Hidden Gems in Your Library">' +
    '<header class="profile-panel__header">' +
    '<div>' +
    '<span class="profile-panel__eyebrow">SECTION 05 // HIGH SCORE &amp; LOW SAMPLE DEPTH</span>' +
    '<h2 class="profile-panel__title">Hidden Gems in Your Library</h2>' +
    '</div>' +
    '<span class="meta-pill">' +
    String(gemsList.length) +
    ' IDENTIFIED</span>' +
    '</header>' +
    '<div class="insights-methodology-banner">' +
    '<strong>Selection Criteria:</strong> ' +
    escapeHtml(hiddenGems.methodologyText) +
    '</div>' +
    bodyHtml +
    '</section>'
  );
}

/**
 * Renders the complete Phase 7 Listening Insights view.
 */
export function renderInsightsView(container, insights, uiState = {}) {
  if (!container) return;

  const activeArtistFilter = uiState.insightsArtistFilter || 'all';
  const shareDisabledAttr = insights.isShareable ? '' : ' disabled';
  const shareTitleAttr = insights.isShareable
    ? 'Preview and download a 1080x1920 PNG summary of your Listening Insights'
    : 'Rate and include at least one album track to generate a Shareable Insights card';

  if (insights.isEmpty) {
    container.innerHTML =
      '<section class="library-header-panel" aria-label="Listening Insights">' +
      '<div class="profile-hero-top">' +
      '<div>' +
      '<div class="discover-hero__eyebrow">' +
      '<span>RATEPLAY ANALYTICS ENGINE</span><span>//</span><span>LISTENING INSIGHTS</span>' +
      '</div>' +
      '<h1 class="discover-hero__title">Listening Insights &amp; Taste DNA</h1>' +
      '<p class="discover-hero__subtitle">Deep statistical breakdown of your rating distribution, sample-weighted artist rankings, release decades, and local library hidden gems.</p>' +
      '</div>' +
      '<div class="chip-row">' +
      '<button type="button" class="btn btn-primary" data-action="open-share-insights-modal" disabled title="' +
      escapeHtml(shareTitleAttr) +
      '">Share Insights Card</button>' +
      '</div>' +
      '</div>' +
      '</section>' +
      '<div class="state-panel" data-empty-state="insights-empty">' +
      '<div class="state-panel__icon" aria-hidden="true">' +
      '<svg width="22" height="22" viewBox="0 0 24 24" fill="none">' +
      '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/>' +
      '<path d="M12 7V12L15 14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
      '</svg>' +
      '</div>' +
      '<h2 class="state-panel__title">No rated albums to analyze yet</h2>' +
      '<p class="state-panel__desc">Rate tracks on any album in Discover (or import a RATEPLAY library backup) to unlock your Taste DNA, Rating Distribution, Artist Rankings, Decade Breakdown, and Hidden Gems.</p>' +
      '<div class="state-panel__actions">' +
      '<button type="button" class="btn btn-primary" data-action="back-to-discover">Explore Albums in Discover</button>' +
      '<button type="button" class="btn btn-secondary" data-library-action="open-import-modal">Import Library JSON</button>' +
      '</div>' +
      '</div>';
    return;
  }

  container.innerHTML =
    '<section class="library-header-panel" aria-label="Listening Insights Header">' +
    '<div class="profile-hero-top">' +
    '<div>' +
    '<div class="discover-hero__eyebrow">' +
    '<span>RATEPLAY ANALYTICS ENGINE</span><span>//</span><span>LISTENING INSIGHTS</span>' +
    '</div>' +
    '<h1 class="discover-hero__title">Listening Insights &amp; Taste DNA</h1>' +
    '<p class="discover-hero__subtitle">Derived strictly from your saved ratings in localStorage with explicit sample sizes and metadata coverage reporting.</p>' +
    '</div>' +
    '<div class="chip-row profile-hero-actions">' +
    '<button type="button" class="btn btn-primary" id="open-share-insights-btn" data-action="open-share-insights-modal"' +
    shareDisabledAttr +
    ' title="' +
    escapeHtml(shareTitleAttr) +
    '">Share Insights Card</button>' +
    '<button type="button" class="btn btn-secondary" id="quick-download-insights-btn" data-action="quick-download-insights-png"' +
    shareDisabledAttr +
    ' title="Generate and download a 1080x1920 PNG summary of your Listening Insights">' +
    'Download 1080&times;1920 PNG' +
    '</button>' +
    '<button type="button" class="btn btn-ghost" data-action="go-to-profile">Taste Profile</button>' +
    '</div>' +
    '</div>' +
    '</section>' +
    buildTasteDnaSectionHtml(insights.tasteDna) +
    '<div class="profile-sections-grid">' +
    buildRatingDistributionSectionHtml(insights.ratingDistribution) +
    buildArtistRankingsSectionHtml(insights.artistRankings, activeArtistFilter) +
    '</div>' +
    buildDecadeBreakdownSectionHtml(insights.decadeBreakdown) +
    buildHiddenGemsSectionHtml(insights.hiddenGems);
}