/**
 * RATEPLAY - Music Taste Profile View Renderer (Phase 6 - Part 1)
 * Displays total rated albums, average album rating, highest-rated albums,
 * most frequently rated artists, recently rated albums, and shareable PNG actions.
 */

import { getTierInfo, formatUpdatedTimestamp } from '../config.js';
import { escapeHtml } from './discoverView.js';

function buildProfileOverviewStatsHtml(profile) {
  const hasAvg =
    profile.averageRating !== null && Number.isFinite(profile.averageRating);
  const avgTier = hasAvg
    ? getTierInfo(profile.averageRating)
    : { label: 'No Scored Albums', color: 'var(--text-muted)' };
  const avgDisplay = hasAvg ? escapeHtml(profile.formattedAverageRating) : '--.-';
  const avgColor = hasAvg ? avgTier.color : 'var(--text-muted)';

  const albumsSub =
    profile.totalRatedAlbums === 0
      ? 'Rate any track to build your profile'
      : String(profile.completeAlbumsCount) +
        ' full LP \u00B7 ' +
        String(profile.incompleteAlbumsCount) +
        ' in progress';

  const avgSub =
    profile.scoredAlbumsCount > 0
      ? escapeHtml(avgTier.label) +
        ' tier \u00B7 ' +
        String(profile.scoredAlbumsCount) +
        ' scored'
      : 'Requires at least 1 scored album';

  const tracksSub =
    profile.totalExcludedRatedTracks > 0
      ? String(profile.totalScoredTracks) +
        ' scored \u00B7 ' +
        String(profile.totalExcludedRatedTracks) +
        ' excluded'
      : String(profile.totalScoredTracks) + ' included in album means';

  const topArtist = profile.mostFrequentArtists[0] || null;
  const topArtistValue = topArtist ? escapeHtml(topArtist.artistName) : 'None yet';
  const topArtistSub = topArtist
    ? String(topArtist.albumCount) +
      ' ' +
      (topArtist.albumCount === 1 ? 'album' : 'albums') +
      ' \u00B7 ' +
      String(topArtist.ratedTrackCount) +
      ' ' +
      (topArtist.ratedTrackCount === 1 ? 'track' : 'tracks')
    : 'Rate albums to rank artists';

  return (
    '<div class="library-summary-grid profile-stats-grid" role="region" aria-label="Music Taste Profile Summary">' +
    '<article class="lib-stat-card">' +
    '<span class="lib-stat-card__label">TOTAL RATED ALBUMS</span>' +
    '<div class="lib-stat-card__value" data-profile-stat="total-albums">' +
    String(profile.totalRatedAlbums) +
    '</div>' +
    '<span class="lib-stat-card__sub">' +
    escapeHtml(albumsSub) +
    '</span>' +
    '</article>' +
    '<article class="lib-stat-card lib-stat-card--highlight">' +
    '<span class="lib-stat-card__label">AVERAGE ALBUM RATING</span>' +
    '<div class="lib-stat-card__value" data-profile-stat="average-rating" style="color: ' +
    avgColor +
    '">' +
    avgDisplay +
    '</div>' +
    '<span class="lib-stat-card__sub">' +
    avgSub +
    '</span>' +
    '</article>' +
    '<article class="lib-stat-card">' +
    '<span class="lib-stat-card__label">TOTAL TRACKS RATED</span>' +
    '<div class="lib-stat-card__value" data-profile-stat="total-tracks">' +
    String(profile.totalRatedTracks) +
    '</div>' +
    '<span class="lib-stat-card__sub">' +
    escapeHtml(tracksSub) +
    '</span>' +
    '</article>' +
    '<article class="lib-stat-card">' +
    '<span class="lib-stat-card__label">MOST RATED ARTIST</span>' +
    '<div class="lib-stat-card__value profile-stat-artist-name" data-profile-stat="top-artist" title="' +
    topArtistValue +
    '">' +
    topArtistValue +
    '</div>' +
    '<span class="lib-stat-card__sub">' +
    escapeHtml(topArtistSub) +
    '</span>' +
    '</article>' +
    '</div>'
  );
}

function buildHighestRatedAlbumsSectionHtml(highestRatedAlbums) {
  if (!highestRatedAlbums || highestRatedAlbums.length === 0) {
    return (
      '<div class="profile-empty-box">' +
      '<p>No scored albums yet. Rate and include at least one track on an album to rank your highest-rated records.</p>' +
      '</div>'
    );
  }

  const rowsHtml = highestRatedAlbums
    .map((album, idx) => {
      const rankStr = '#' + String(idx + 1).padStart(2, '0');
      const tier = getTierInfo(album.overallScore);
      const safeId = escapeHtml(album.collectionId);
      const safeTitle = escapeHtml(album.collectionName);
      const safeArtist = escapeHtml(album.artistName);
      const safeYear = escapeHtml(album.releaseYear);
      const safeCover = escapeHtml(album.coverUrl);
      const safeFallback = escapeHtml(album.fallbackCoverUrl);
      const tracksMeta =
        album.totalTrackCount > 0
          ? String(album.ratedTrackCount) + '/' + String(album.totalTrackCount) + ' tracks'
          : String(album.ratedTrackCount) + ' rated';

      return (
        '<article class="profile-rank-row" tabindex="0" role="button" data-album-id="' +
        safeId +
        '" aria-label="Open ' +
        safeTitle +
        ' by ' +
        safeArtist +
        ', scored ' +
        escapeHtml(album.formattedScore) +
        '">' +
        '<span class="profile-rank-row__num">' +
        escapeHtml(rankStr) +
        '</span>' +
        '<div class="profile-rank-row__thumb-wrap">' +
        '<img class="profile-rank-row__thumb" src="' +
        safeCover +
        '" alt="' +
        safeTitle +
        ' cover" loading="lazy" onerror="this.onerror=null;this.src=\'' +
        safeFallback +
        '\';" />' +
        '</div>' +
        '<div class="profile-rank-row__info">' +
        '<h3 class="profile-rank-row__title">' +
        safeTitle +
        '</h3>' +
        '<p class="profile-rank-row__meta">' +
        safeArtist +
        ' &middot; ' +
        safeYear +
        ' &middot; ' +
        escapeHtml(tracksMeta) +
        '</p>' +
        '</div>' +
        '<div class="profile-rank-row__score-wrap">' +
        '<span class="profile-rank-row__tier">' +
        escapeHtml(tier.label) +
        '</span>' +
        '<span class="profile-rank-row__score" style="color: ' +
        tier.color +
        '">' +
        escapeHtml(album.formattedScore) +
        '</span>' +
        '</div>' +
        '</article>'
      );
    })
    .join('');

  return '<div class="profile-rank-list">' + rowsHtml + '</div>';
}

function buildMostFrequentArtistsSectionHtml(mostFrequentArtists) {
  if (!mostFrequentArtists || mostFrequentArtists.length === 0) {
    return (
      '<div class="profile-empty-box">' +
      '<p>No artists rated yet.</p>' +
      '</div>'
    );
  }

  const cardsHtml = mostFrequentArtists
    .map((artist, idx) => {
      const rankStr = '#' + String(idx + 1).padStart(2, '0');
      const hasScore =
        artist.averageScore !== null && Number.isFinite(artist.averageScore);
      const tier = hasScore
        ? getTierInfo(artist.averageScore)
        : { label: 'Unscored', color: 'var(--text-muted)' };
      const scoreDisplay = hasScore
        ? escapeHtml(artist.formattedAverageScore)
        : '--.-';

      const safeArtist = escapeHtml(artist.artistName);
      const safeCover = escapeHtml(artist.coverUrl);
      const safeFallback = escapeHtml(artist.fallbackCoverUrl);
      const albumCountBadge =
        String(artist.albumCount) +
        ' ' +
        (artist.albumCount === 1 ? 'ALBUM' : 'ALBUMS') +
        ' \u00B7 ' +
        String(artist.ratedTrackCount) +
        ' ' +
        (artist.ratedTrackCount === 1 ? 'TRACK' : 'TRACKS');

      const topRecordHtml =
        artist.topAlbumTitle && artist.topAlbumId
          ? '<button type="button" class="profile-artist-card__top-link" data-album-id="' +
            escapeHtml(artist.topAlbumId) +
            '">Top Record: ' +
            escapeHtml(artist.topAlbumTitle) +
            ' &rarr;</button>'
          : '';

      return (
        '<article class="profile-artist-card" data-profile-artist="' +
        safeArtist +
        '">' +
        '<div class="profile-artist-card__top">' +
        '<div class="profile-artist-card__avatar-wrap">' +
        '<img class="profile-artist-card__avatar" src="' +
        safeCover +
        '" alt="' +
        safeArtist +
        '" loading="lazy" onerror="this.onerror=null;this.src=\'' +
        safeFallback +
        '\';" />' +
        '<span class="profile-artist-card__rank">' +
        escapeHtml(rankStr) +
        '</span>' +
        '</div>' +
        '<div class="profile-artist-card__identity">' +
        '<span class="profile-artist-card__counts">' +
        escapeHtml(albumCountBadge) +
        '</span>' +
        '<h3 class="profile-artist-card__name">' +
        '<button type="button" class="album-banner-card__artist-link" data-artist-search="' +
        safeArtist +
        '" title="Search more albums by ' +
        safeArtist +
        ' in Discover">' +
        safeArtist +
        '</button>' +
        '</h3>' +
        '</div>' +
        '<div class="profile-artist-card__score-box">' +
        '<span class="profile-artist-card__score-label">AVG</span>' +
        '<span class="profile-artist-card__score-val" style="color: ' +
        tier.color +
        '">' +
        scoreDisplay +
        '</span>' +
        '</div>' +
        '</div>' +
        '<div class="profile-artist-card__footer">' +
        topRecordHtml +
        '</div>' +
        '</article>'
      );
    })
    .join('');

  return '<div class="profile-artists-grid">' + cardsHtml + '</div>';
}

function buildRecentlyRatedAlbumsSectionHtml(recentlyRatedAlbums) {
  if (!recentlyRatedAlbums || recentlyRatedAlbums.length === 0) {
    return (
      '<div class="profile-empty-box">' +
      '<p>No recent rating activity recorded yet.</p>' +
      '</div>'
    );
  }

  const itemsHtml = recentlyRatedAlbums
    .map((album) => {
      const hasScore =
        album.overallScore !== null && Number.isFinite(album.overallScore);
      const tier = hasScore
        ? getTierInfo(album.overallScore)
        : { label: 'Excluded / Unscored', color: 'var(--text-muted)' };
      const scoreText = hasScore ? escapeHtml(album.formattedScore) : '--.-';
      const dateStr = album.updatedAt
        ? 'Rated ' + formatUpdatedTimestamp(album.updatedAt)
        : 'Saved in local library';

      const safeId = escapeHtml(album.collectionId);
      const safeTitle = escapeHtml(album.collectionName);
      const safeArtist = escapeHtml(album.artistName);
      const safeCover = escapeHtml(album.coverUrl);
      const safeFallback = escapeHtml(album.fallbackCoverUrl);

      return (
        '<article class="profile-recent-card" tabindex="0" role="button" data-album-id="' +
        safeId +
        '" aria-label="Open ' +
        safeTitle +
        ' by ' +
        safeArtist +
        '">' +
        '<div class="profile-recent-card__art">' +
        '<img src="' +
        safeCover +
        '" alt="' +
        safeTitle +
        ' cover" loading="lazy" onerror="this.onerror=null;this.src=\'' +
        safeFallback +
        '\';" />' +
        '</div>' +
        '<div class="profile-recent-card__body">' +
        '<div class="profile-recent-card__top">' +
        '<span class="profile-recent-card__date">' +
        escapeHtml(dateStr) +
        '</span>' +
        '<span class="profile-recent-card__score" style="color: ' +
        tier.color +
        '">' +
        scoreText +
        '</span>' +
        '</div>' +
        '<h3 class="profile-recent-card__title">' +
        safeTitle +
        '</h3>' +
        '<p class="profile-recent-card__artist">' +
        safeArtist +
        '</p>' +
        '<span class="profile-recent-card__tracks">' +
        String(album.ratedTrackCount) +
        (album.totalTrackCount > 0 ? '/' + String(album.totalTrackCount) : '') +
        ' tracks rated</span>' +
        '</div>' +
        '</article>'
      );
    })
    .join('');

  return '<div class="profile-recent-grid">' + itemsHtml + '</div>';
}

/**
 * Renders the complete Music Taste Profile view inside the main container.
 */
export function renderProfileView(container, profile) {
  if (!container) return;

  const shareDisabledAttr = profile.isShareable ? '' : ' disabled';
  const shareTitleAttr = profile.isShareable
    ? 'Preview and download a 1080x1920 PNG image of your Music Taste Profile'
    : 'Rate at least one album track to generate a Shareable Taste Profile card';

  if (profile.isEmpty) {
    const hiddenNoticeHtml =
      profile.hiddenCount > 0
        ? '<p class="state-panel__desc">You have ' +
          String(profile.hiddenCount) +
          ' rated ' +
          (profile.hiddenCount === 1 ? 'album' : 'albums') +
          ' currently hidden from My Library.</p>'
        : '';

    const restoreBtnHtml =
      profile.hiddenCount > 0
        ? '<button type="button" class="btn btn-secondary" data-library-action="restore-all-hidden">Restore Hidden ' +
          (profile.hiddenCount === 1 ? 'Album' : 'Albums') +
          ' (' +
          String(profile.hiddenCount) +
          ')</button>'
        : '';

    container.innerHTML =
      '<section class="library-header-panel profile-hero-panel" aria-label="Music Taste Profile">' +
      '<div class="profile-hero-top">' +
      '<div>' +
      '<div class="discover-hero__eyebrow">' +
      '<span>RATEPLAY LISTENER ARCHIVE</span><span>//</span><span>MUSIC TASTE PROFILE</span>' +
      '</div>' +
      '<h1 class="discover-hero__title">Your Music Taste Profile</h1>' +
      '<p class="discover-hero__subtitle">Calculated automatically from your saved album and track ratings in localStorage.</p>' +
      '</div>' +
      '<div class="chip-row">' +
      '<button type="button" class="btn btn-primary" data-action="open-share-profile-modal" disabled title="' +
      escapeHtml(shareTitleAttr) +
      '">Share Taste Profile Card</button>' +
      '</div>' +
      '</div>' +
      buildProfileOverviewStatsHtml(profile) +
      '</section>' +
      '<div class="state-panel" data-empty-state="profile-empty">' +
      '<div class="state-panel__icon" aria-hidden="true">' +
      '<svg width="22" height="22" viewBox="0 0 24 24" fill="none">' +
      '<path d="M4 18V12M12 18V6M20 18V9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
      '</svg>' +
      '</div>' +
      '<h2 class="state-panel__title">Your Taste Profile is waiting for your first rating</h2>' +
      '<p class="state-panel__desc">Rate tracks on any album in Discover to unlock your highest-rated albums, most frequently rated artists, recent rating activity, and a downloadable 1080&times;1920 Taste Profile graphic.</p>' +
      hiddenNoticeHtml +
      '<div class="state-panel__actions">' +
      '<button type="button" class="btn btn-primary" data-action="back-to-discover">Discover Albums to Rate</button>' +
      restoreBtnHtml +
      '</div>' +
      '</div>';
    return;
  }

  container.innerHTML =
    '<section class="library-header-panel profile-hero-panel" aria-label="Music Taste Profile Overview">' +
    '<div class="profile-hero-top">' +
    '<div>' +
    '<div class="discover-hero__eyebrow">' +
    '<span>RATEPLAY LISTENER ARCHIVE</span><span>//</span><span>MUSIC TASTE PROFILE</span>' +
    '</div>' +
    '<h1 class="discover-hero__title">Your Music Taste Profile</h1>' +
    '<p class="discover-hero__subtitle">Live archival synthesis of your top-scored records, most-listened artists, and recent rating activity.</p>' +
    '</div>' +
    '<div class="chip-row profile-hero-actions">' +
    '<button type="button" class="btn btn-primary" id="open-share-profile-btn" data-action="open-share-profile-modal"' +
    shareDisabledAttr +
    ' title="' +
    escapeHtml(shareTitleAttr) +
    '">Share Taste Profile Card</button>' +
    '<button type="button" class="btn btn-secondary" id="quick-download-profile-btn" data-action="quick-download-profile-png"' +
    shareDisabledAttr +
    ' title="Generate and download a 1080x1920 PNG image of your Music Taste Profile">' +
    'Download 1080&times;1920 PNG' +
    '</button>' +
    '<button type="button" class="btn btn-ghost" data-action="go-to-library">View My Library</button>' +
    '</div>' +
    '</div>' +
    buildProfileOverviewStatsHtml(profile) +
    '</section>' +
    '<div class="profile-sections-grid">' +
    '<section class="profile-panel" aria-label="Highest-Rated Albums">' +
    '<header class="profile-panel__header">' +
    '<div>' +
    '<span class="profile-panel__eyebrow">RANKED BY OVERALL SCORE</span>' +
    '<h2 class="profile-panel__title">Highest-Rated Albums</h2>' +
    '</div>' +
    '<span class="meta-pill">TOP ' +
    String(profile.highestRatedAlbums.length) +
    '</span>' +
    '</header>' +
    buildHighestRatedAlbumsSectionHtml(profile.highestRatedAlbums) +
    '</section>' +
    '<section class="profile-panel" aria-label="Most Frequently Rated Artists">' +
    '<header class="profile-panel__header">' +
    '<div>' +
    '<span class="profile-panel__eyebrow">RANKED BY RATED ALBUM COUNT</span>' +
    '<h2 class="profile-panel__title">Most Frequently Rated Artists</h2>' +
    '</div>' +
    '<span class="meta-pill">TOP ' +
    String(profile.mostFrequentArtists.length) +
    '</span>' +
    '</header>' +
    buildMostFrequentArtistsSectionHtml(profile.mostFrequentArtists) +
    '</section>' +
    '</div>' +
    '<section class="profile-panel profile-panel--full" aria-label="Recently Rated Albums">' +
    '<header class="profile-panel__header">' +
    '<div>' +
    '<span class="profile-panel__eyebrow">CHRONOLOGICAL LOG</span>' +
    '<h2 class="profile-panel__title">Recently Rated Albums</h2>' +
    '</div>' +
    '<span class="meta-pill">LATEST ' +
    String(profile.recentlyRatedAlbums.length) +
    '</span>' +
    '</header>' +
    buildRecentlyRatedAlbumsSectionHtml(profile.recentlyRatedAlbums) +
    '</section>';
}