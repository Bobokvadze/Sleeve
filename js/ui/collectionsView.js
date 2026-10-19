/**
 * SLEEVE - Custom & Smart Collections View & Editor Modal Renderer (Phases 9A & 9B)
 * Renders:
 * 1. Collections Index View (manual & smart collections grid, rule badges, Poster actions)
 * 2. Collection Detail View (active smart rule chips with one-click rule removal,
 *    metadata coverage notice, Share Collection Poster / Download PNG, search, sort,
 *    and manual Move Up/Down ordering for manual collections)
 * 3. Create / Edit Collection Modal (Manual vs. Smart mode toggle, rule builder with
 *    live matched album preview, visual theme selector, and manual album picker)
 */

import { formatUpdatedTimestamp, CURATED_ALBUMS } from '../config.js';
import { VALID_RATINGS } from '../calculator.js';
import {
  saveCustomCollection,
  getCustomCollection,
  getSavedRatingsMap,
  getAlbumCatalogCacheMap,
  getSavedJournalMap,
  normalizeSmartCollectionRules
} from '../storage.js';
import {
  COLLECTION_SORT_MODES,
  COLLECTION_THEME_OPTIONS,
  AVAILABLE_DECADE_RULES,
  describeSmartCollectionRules,
  evaluateSmartCollectionRules,
  queryCollectionAlbums
} from '../collections.js';
import { escapeHtml } from './discoverView.js';

function buildCollectionsOverviewBarHtml(collections = []) {
  const totalCollections = collections.length;
  const smartCount = collections.filter((c) => c.isSmart).length;
  const manualCount = totalCollections - smartCount;

  let totalAlbumSlots = 0;
  const uniqueAlbumIds = new Set();

  collections.forEach((col) => {
    totalAlbumSlots += col.albumCount;
    (col.albumIds || []).forEach((id) => uniqueAlbumIds.add(String(id)));
  });

  const latestCol = collections[0] || null;
  const latestTitle = latestCol ? escapeHtml(latestCol.title) : 'None yet';
  const latestSub = latestCol
    ? 'Updated ' + formatUpdatedTimestamp(latestCol.updatedAt)
    : 'Create your first shelf';

  return (
    '<div class="library-summary-grid collections-summary-grid" role="region" aria-label="Custom and Smart Collections Summary">' +
    '<article class="lib-stat-card lib-stat-card--highlight">' +
    '<span class="lib-stat-card__label">TOTAL COLLECTIONS</span>' +
    '<div class="lib-stat-card__value" data-collections-stat="total-collections">' +
    String(totalCollections) +
    '</div>' +
    '<span class="lib-stat-card__sub">' +
    String(manualCount) +
    ' manual \u00B7 ' +
    String(smartCount) +
    ' smart</span>' +
    '</article>' +
    '<article class="lib-stat-card">' +
    '<span class="lib-stat-card__label">SMART COLLECTIONS</span>' +
    '<div class="lib-stat-card__value" data-collections-stat="smart-collections">' +
    String(smartCount) +
    '</div>' +
    '<span class="lib-stat-card__sub">Dynamic rule-based shelves</span>' +
    '</article>' +
    '<article class="lib-stat-card">' +
    '<span class="lib-stat-card__label">ALBUMS REPRESENTED</span>' +
    '<div class="lib-stat-card__value" data-collections-stat="total-slots">' +
    String(uniqueAlbumIds.size) +
    '</div>' +
    '<span class="lib-stat-card__sub">' +
    String(totalAlbumSlots) +
    ' total shelf placements</span>' +
    '</article>' +
    '<article class="lib-stat-card">' +
    '<span class="lib-stat-card__label">LATEST UPDATED SHELF</span>' +
    '<div class="lib-stat-card__value profile-stat-artist-name" title="' +
    latestTitle +
    '">' +
    latestTitle +
    '</div>' +
    '<span class="lib-stat-card__sub">' +
    escapeHtml(latestSub) +
    '</span>' +
    '</article>' +
    '</div>'
  );
}

function buildCollectionGridCardHtml(collection) {
  const safeId = escapeHtml(collection.id);
  const safeTitle = escapeHtml(collection.title);
  const safeDesc = escapeHtml(collection.description || '');
  const themeMeta = collection.themeMeta;

  const hasAvg =
    collection.averageScore !== null && Number.isFinite(collection.averageScore);
  const scoreDisplay = hasAvg
    ? 'AVG ' + escapeHtml(collection.formattedAverageScore)
    : 'UNRATED';

  const mosaicCellsHtml = (collection.mosaicCovers || [])
    .slice(0, 4)
    .map((cell) => {
      return (
        '<div class="collection-card__mosaic-cell">' +
        '<img src="' +
        escapeHtml(cell.coverUrl) +
        '" alt="' +
        escapeHtml(cell.albumTitle) +
        ' cover" loading="lazy" onerror="this.onerror=null;this.src=\'' +
        escapeHtml(cell.fallbackCoverUrl) +
        '\';" />' +
        '</div>'
      );
    })
    .join('');

  const typeBadgeHtml = collection.isSmart
    ? '<span class="collection-type-badge collection-type-badge--smart">SMART // DYNAMIC</span>'
    : '<span class="collection-type-badge collection-type-badge--manual">MANUAL SHELF</span>';

  const rulesSummaryHtml =
    collection.isSmart && collection.rulesSummaryText
      ? '<div class="collection-card__rules-line" title="' +
        escapeHtml(collection.rulesSummaryText) +
        '">' +
        escapeHtml(collection.rulesSummaryText) +
        '</div>'
      : '';

  return (
    '<article class="collection-card collection-card--theme-' +
    escapeHtml(collection.theme) +
    '" data-collection-card="' +
    safeId +
    '" data-collection-type="' +
    escapeHtml(collection.type) +
    '" style="--collection-accent: ' +
    escapeHtml(themeMeta.accentHex) +
    '">' +
    '<div class="collection-card__top-accent"></div>' +
    '<div class="collection-card__mosaic" tabindex="0" role="button" data-collection-action="open-collection" data-collection-id="' +
    safeId +
    '" aria-label="Open collection ' +
    safeTitle +
    ' (' +
    String(collection.albumCount) +
    ' albums)">' +
    mosaicCellsHtml +
    '<div class="collection-card__overlay-badges">' +
    '<span class="collection-card__count-pill">' +
    String(collection.albumCount) +
    ' ' +
    (collection.albumCount === 1 ? 'ALBUM' : 'ALBUMS') +
    '</span>' +
    '<span class="collection-card__score-pill" style="color: ' +
    collection.averageTierColor +
    '">' +
    scoreDisplay +
    '</span>' +
    '</div>' +
    '</div>' +
    '<div class="collection-card__body">' +
    '<div class="collection-card__meta-row">' +
    typeBadgeHtml +
    '<span class="collection-theme-tag">' +
    escapeHtml(themeMeta.label) +
    '</span>' +
    '</div>' +
    '<h3 class="collection-card__title">' +
    '<button type="button" class="collection-card__title-btn" data-collection-action="open-collection" data-collection-id="' +
    safeId +
    '">' +
    safeTitle +
    '</button>' +
    '</h3>' +
    rulesSummaryHtml +
    (safeDesc
      ? '<p class="collection-card__desc">' + safeDesc + '</p>'
      : !collection.isSmart
      ? '<p class="collection-card__desc collection-card__desc--muted">No description added.</p>'
      : '') +
    '</div>' +
    '<div class="collection-card__actions">' +
    '<button type="button" class="btn btn-secondary btn-sm collection-card__open-btn" data-collection-action="open-collection" data-collection-id="' +
    safeId +
    '">Open</button>' +
    '<button type="button" class="btn btn-ghost btn-sm" data-collection-action="share-collection-poster" data-collection-id="' +
    safeId +
    '" title="Preview and download 1080x1920 Collection Poster">Poster</button>' +
    '<button type="button" class="btn btn-ghost btn-sm" data-collection-action="edit-collection" data-collection-id="' +
    safeId +
    '" aria-label="Edit collection ' +
    safeTitle +
    '">Edit</button>' +
    '<button type="button" class="btn btn-ghost btn-sm journal-delete-btn" data-collection-action="delete-collection" data-collection-id="' +
    safeId +
    '" data-collection-title="' +
    safeTitle +
    '" aria-label="Delete collection ' +
    safeTitle +
    '">Delete</button>' +
    '</div>' +
    '</article>'
  );
}

/**
 * Renders the Collections Index View (#collections).
 */
export function renderCollectionsIndexView(container, collections = []) {
  if (!container) return;

  const gridOrEmptyHtml =
    collections.length === 0
      ? '<div class="state-panel" data-empty-state="collections-empty">' +
        '<div class="state-panel__icon" aria-hidden="true">' +
        '<svg width="22" height="22" viewBox="0 0 24 24" fill="none">' +
        '<rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="2"/>' +
        '<rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="2"/>' +
        '<rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="2"/>' +
        '<rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="2"/>' +
        '</svg>' +
        '</div>' +
        '<h2 class="state-panel__title">No collections yet</h2>' +
        '<p class="state-panel__desc">Create a <strong>Manual Collection</strong> to sequence records by hand, or build a <strong>Smart Collection</strong> that updates automatically by rating range, artist, release decade, journal entries, or favorite tracks.</p>' +
        '<div class="state-panel__actions">' +
        '<button type="button" class="btn btn-primary" data-collection-action="create-collection">+ Create Manual Collection</button>' +
        '<button type="button" class="btn btn-secondary" data-collection-action="create-smart-collection">+ Create Smart Collection</button>' +
        '</div>' +
        '</div>'
      : '<div class="section-header">' +
        '<div class="section-header__title-group">' +
        '<span class="section-header__eyebrow">CURATED &amp; DYNAMIC SHELVES // SAVED IN BROWSER</span>' +
        '<h2 class="section-header__title">Your Album Collections</h2>' +
        '</div>' +
        '<span class="section-header__count">' +
        String(collections.length) +
        ' ' +
        (collections.length === 1 ? 'COLLECTION' : 'COLLECTIONS') +
        '</span>' +
        '</div>' +
        '<div class="collections-grid">' +
        collections.map(buildCollectionGridCardHtml).join('') +
        '</div>';

  container.innerHTML =
    '<section class="library-header-panel collections-header-panel" aria-label="Custom and Smart Collections Overview">' +
    '<div class="library-header-panel__top">' +
    '<div>' +
    '<div class="discover-hero__eyebrow">' +
    '<span>SLEEVE CURATION ENGINE</span><span>//</span><span>CUSTOM &amp; SMART COLLECTIONS</span>' +
    '</div>' +
    '<h1 class="discover-hero__title">Album Collections &amp; Smart Shelves</h1>' +
    '<p class="discover-hero__subtitle">Curate hand-sequenced shelves, build dynamic rule-based Smart Collections, and export 1080&times;1920 Collection Posters.</p>' +
    '</div>' +
    '<div class="chip-row library-portability-actions">' +
    '<button type="button" class="btn btn-primary" data-collection-action="create-collection">+ New Manual Shelf</button>' +
    '<button type="button" class="btn btn-secondary" data-collection-action="create-smart-collection">+ New Smart Collection</button>' +
    '</div>' +
    '</div>' +
    buildCollectionsOverviewBarHtml(collections) +
    '</section>' +
    '<section id="collections-grid-mount" aria-live="polite">' +
    gridOrEmptyHtml +
    '</section>';
}

/**
 * Builds the album cards inside an opened collection (manual or smart).
 */
export function buildCollectionDetailAlbumsHtml(
  enrichedCollection,
  queryResult
) {
  const { allAlbums, visibleAlbums, isManualReorderEnabled } = queryResult;
  const safeColId = escapeHtml(enrichedCollection.id);
  const isSmart = Boolean(enrichedCollection.isSmart);

  if (allAlbums.length === 0) {
    if (isSmart) {
      return (
        '<div class="state-panel" data-empty-state="smart-collection-empty">' +
        '<div class="state-panel__icon" aria-hidden="true">&#9881;</div>' +
        '<h2 class="state-panel__title">No library albums match these Smart Rules yet</h2>' +
        '<p class="state-panel__desc">This Smart Collection updates automatically whenever your ratings or journal entries match its rules. You can also adjust or remove rules above.</p>' +
        '<div class="state-panel__actions">' +
        '<button type="button" class="btn btn-primary" data-collection-action="edit-collection" data-collection-id="' +
        safeColId +
        '">Edit Smart Rules</button>' +
        '<button type="button" class="btn btn-secondary" data-action="back-to-discover">Rate More Albums in Discover</button>' +
        '</div>' +
        '</div>'
      );
    }

    return (
      '<div class="state-panel" data-empty-state="collection-albums-empty">' +
      '<div class="state-panel__icon" aria-hidden="true">+</div>' +
      '<h2 class="state-panel__title">This collection has no albums yet</h2>' +
      '<p class="state-panel__desc">Use the &ldquo;Add Album to Collection&rdquo; selector above or add records directly from any album page.</p>' +
      '<div class="state-panel__actions">' +
      '<button type="button" class="btn btn-primary" data-action="back-to-discover">Browse Albums in Discover</button>' +
      '</div>' +
      '</div>'
    );
  }

  if (visibleAlbums.length === 0) {
    return (
      '<div class="state-panel" data-empty-state="collection-search-empty">' +
      '<div class="state-panel__icon" aria-hidden="true">!</div>' +
      '<h2 class="state-panel__title">No albums in this collection match your search</h2>' +
      '<p class="state-panel__desc">Clear the collection search box to view all ' +
      String(allAlbums.length) +
      ' albums in this shelf.</p>' +
      '<div class="state-panel__actions">' +
      '<button type="button" class="btn btn-primary" data-collection-action="reset-collection-search">Clear Search</button>' +
      '</div>' +
      '</div>'
    );
  }

  const reorderBannerHtml =
    !isSmart && !isManualReorderEnabled
      ? '<div class="collection-reorder-notice">' +
        '<span>Manual Move Up / Move Down controls are active when viewing in <strong>Manual Order</strong> without a search filter.</span>' +
        '<button type="button" class="btn btn-secondary btn-sm" data-collection-action="switch-to-manual-order">Switch to Manual Order</button>' +
        '</div>'
      : '';

  const totalCount = allAlbums.length;

  const cardsHtml = visibleAlbums
    .map((album, displayIdx) => {
      const safeAlbumId = escapeHtml(album.collectionId);
      const safeTitle = escapeHtml(album.collectionName);
      const safeArtist = escapeHtml(album.artistName);
      const safeYear = escapeHtml(album.releaseYear);
      const safeCover = escapeHtml(album.coverUrl);
      const safeFallback = escapeHtml(album.fallbackCoverUrl);

      const seqNumber = isManualReorderEnabled
        ? album.manualPosition
        : displayIdx + 1;
      const seqLabel = '#' + String(seqNumber).padStart(2, '0');

      const hasScore =
        album.overallScore !== null && Number.isFinite(album.overallScore);
      const scoreBadgeHtml = hasScore
        ? '<span class="album-card__score-badge" style="color: ' +
          album.tierColor +
          '" title="Overall Score: ' +
          escapeHtml(album.formattedScore) +
          ' (' +
          escapeHtml(album.tierLabel) +
          ')">' +
          escapeHtml(album.formattedScore) +
          '</span>'
        : '<span class="album-card__score-badge" style="color: var(--text-muted)">UNRATED</span>';

      const canMoveUp = isManualReorderEnabled && album.manualIndex > 0;
      const canMoveDown =
        isManualReorderEnabled && album.manualIndex < totalCount - 1;

      const topBarRightHtml = isSmart
        ? '<span class="smart-match-pill">DYNAMIC MATCH</span>'
        : '<div class="collection-album-card__order-btns" role="group" aria-label="Reorder ' +
          safeTitle +
          '">' +
          '<button type="button" class="collection-order-btn" data-collection-action="move-album-up" data-collection-id="' +
          safeColId +
          '" data-album-id="' +
          safeAlbumId +
          '" aria-label="Move ' +
          safeTitle +
          ' up in collection" title="Move Up"' +
          (canMoveUp ? '' : ' disabled') +
          '>&uarr;</button>' +
          '<button type="button" class="collection-order-btn" data-collection-action="move-album-down" data-collection-id="' +
          safeColId +
          '" data-album-id="' +
          safeAlbumId +
          '" aria-label="Move ' +
          safeTitle +
          ' down in collection" title="Move Down"' +
          (canMoveDown ? '' : ' disabled') +
          '>&darr;</button>' +
          '</div>';

      const bottomActionsHtml = isSmart
        ? '<div class="library-card__actions">' +
          '<button type="button" class="btn btn-secondary library-card__edit-btn" data-album-id="' +
          safeAlbumId +
          '">Inspect Album &amp; Ratings</button>' +
          '</div>'
        : '<div class="library-card__actions">' +
          '<button type="button" class="btn btn-secondary library-card__edit-btn" data-album-id="' +
          safeAlbumId +
          '">Open Album</button>' +
          '<button type="button" class="btn btn-ghost library-card__remove-btn" data-collection-action="remove-album-from-collection" data-collection-id="' +
          safeColId +
          '" data-album-id="' +
          safeAlbumId +
          '" data-album-title="' +
          safeTitle +
          '" aria-label="Remove ' +
          safeTitle +
          ' from collection">Remove</button>' +
          '</div>';

      const tracksRatedSub =
        album.ratedTrackCount > 0
          ? String(album.ratedTrackCount) +
            (album.totalTrackCount > 0 ? '/' + String(album.totalTrackCount) : '') +
            ' RATED'
          : 'UNRATED IN LIBRARY';

      return (
        '<article class="album-card collection-album-card" data-collection-album-card="' +
        safeAlbumId +
        '">' +
        '<div class="collection-album-card__top-bar">' +
        '<span class="collection-album-card__seq" title="Position in collection">' +
        escapeHtml(seqLabel) +
        '</span>' +
        topBarRightHtml +
        '</div>' +
        '<div class="album-card__artwork-wrap" tabindex="0" role="button" data-album-id="' +
        safeAlbumId +
        '" aria-label="Open album page for ' +
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
        scoreBadgeHtml +
        '<div class="album-card__hover-badge"><span>INSPECT &amp; RATE</span><span aria-hidden="true">&rarr;</span></div>' +
        '</div>' +
        '<div class="album-card__body" data-album-id="' +
        safeAlbumId +
        '">' +
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
        escapeHtml(tracksRatedSub) +
        '</span>' +
        '<span class="album-card__genre">' +
        escapeHtml(album.primaryGenreName) +
        '</span>' +
        '</div>' +
        bottomActionsHtml +
        '</article>'
      );
    })
    .join('');

  return (
    reorderBannerHtml +
    '<div class="album-grid collection-detail-grid">' +
    cardsHtml +
    '</div>'
  );
}

function buildSmartRulesDetailPanelHtml(enrichedCollection) {
  const safeColId = escapeHtml(enrichedCollection.id);
  const pills = enrichedCollection.activeRulePills || [];
  const skipped = enrichedCollection.skippedMissingMetadata || {};

  const ruleChipsHtml =
    pills.length > 0
      ? pills
          .map((pill) => {
            return (
              '<span class="smart-rule-chip" data-smart-rule-key="' +
              escapeHtml(pill.key) +
              '">' +
              '<span class="smart-rule-chip__label">' +
              escapeHtml(pill.label) +
              ':</span>' +
              '<strong class="smart-rule-chip__val">' +
              escapeHtml(pill.valueText) +
              '</strong>' +
              '<button type="button" class="smart-rule-chip__remove" data-collection-action="remove-smart-rule" data-collection-id="' +
              safeColId +
              '" data-rule-key="' +
              escapeHtml(pill.key) +
              '" title="Remove this rule" aria-label="Remove rule ' +
              escapeHtml(pill.fullText) +
              '">&times;</button>' +
              '</span>'
            );
          })
          .join('')
      : '<span class="insights-muted-note">No active rules configured. Click &ldquo;Edit Smart Rules&rdquo; to add rules.</span>';

  const skipNotes = [];
  if (skipped.unratedForScoreRule > 0) {
    skipNotes.push(
      String(skipped.unratedForScoreRule) +
        ' unrated album(s) skipped by rating rule'
    );
  }
  if (skipped.unknownArtistForArtistRule > 0) {
    skipNotes.push(
      String(skipped.unknownArtistForArtistRule) +
        ' album(s) with unavailable artist metadata skipped'
    );
  }
  if (skipped.missingDecadeForDecadeRule > 0) {
    skipNotes.push(
      String(skipped.missingDecadeForDecadeRule) +
        ' album(s) with unavailable release year skipped'
    );
  }

  const skipFootnoteHtml =
    skipNotes.length > 0
      ? '<p class="smart-rules-panel__footnote">Metadata safety: ' +
        escapeHtml(skipNotes.join(' \u00B7 ')) +
        '.</p>'
      : '';

  return (
    '<div class="smart-rules-panel" role="region" aria-label="Active Smart Collection Rules">' +
    '<div class="smart-rules-panel__header">' +
    '<div>' +
    '<span class="smart-rules-panel__eyebrow">DYNAMIC SMART COLLECTION // AUTO-UPDATING RULES</span>' +
    '<p class="smart-rules-panel__desc">Albums in your local library matching ALL active rules below are included automatically:</p>' +
    '</div>' +
    '<button type="button" class="btn btn-secondary btn-sm" data-collection-action="edit-collection" data-collection-id="' +
    safeColId +
    '">Edit Smart Rules</button>' +
    '</div>' +
    '<div class="chip-row smart-rules-chips-row">' +
    ruleChipsHtml +
    '</div>' +
    skipFootnoteHtml +
    '</div>'
  );
}

/**
 * Renders the single Collection Detail View (#collection/{id}).
 */
export function renderCollectionDetailView(
  container,
  enrichedCollection,
  uiState = {},
  candidateLibraryAlbums = []
) {
  if (!container) return;

  if (!enrichedCollection) {
    container.innerHTML =
      '<div class="album-view-topbar">' +
      '<button type="button" class="btn btn-secondary" data-action="go-to-collections">&larr; Back to Collections</button>' +
      '</div>' +
      '<div class="state-panel">' +
      '<div class="state-panel__icon" aria-hidden="true">!</div>' +
      '<h2 class="state-panel__title">Collection Not Found</h2>' +
      '<p class="state-panel__desc">The requested collection could not be found in your local storage.</p>' +
      '<div class="state-panel__actions">' +
      '<button type="button" class="btn btn-primary" data-action="go-to-collections">Return to Collections</button>' +
      '</div></div>';
    return;
  }

  const isSmart = Boolean(enrichedCollection.isSmart);
  const activeQuery = String(uiState.collectionDetailQuery || '');
  const activeSort =
    uiState.collectionDetailSort ||
    (isSmart ? COLLECTION_SORT_MODES.SCORE_DESC : COLLECTION_SORT_MODES.MANUAL);

  const queryResult = queryCollectionAlbums(enrichedCollection, {
    query: activeQuery,
    sortBy: activeSort
  });

  const safeColId = escapeHtml(enrichedCollection.id);
  const safeTitle = escapeHtml(enrichedCollection.title);
  const safeDesc = escapeHtml(enrichedCollection.description || '');
  const themeMeta = enrichedCollection.themeMeta;

  const createdStr = formatUpdatedTimestamp(enrichedCollection.createdAt);
  const updatedStr = formatUpdatedTimestamp(enrichedCollection.updatedAt);
  const avgDisplay = enrichedCollection.formattedAverageScore
    ? escapeHtml(enrichedCollection.formattedAverageScore)
    : '--.-';

  let addOrRulesBarHtml = '';

  if (isSmart) {
    addOrRulesBarHtml = buildSmartRulesDetailPanelHtml(enrichedCollection);
  } else {
    const existingSet = new Set(enrichedCollection.albumIds.map((id) => String(id)));
    const candidatePool = [];
    const seenCandidates = new Set();

    candidateLibraryAlbums.forEach((alb) => {
      const idStr = String(alb.collectionId);
      if (!existingSet.has(idStr) && !seenCandidates.has(idStr)) {
        seenCandidates.add(idStr);
        candidatePool.push({
          collectionId: idStr,
          label:
            alb.collectionName +
            ' \u2014 ' +
            alb.artistName +
            (alb.formattedScore ? ' (' + alb.formattedScore + ')' : '')
        });
      }
    });

    CURATED_ALBUMS.forEach((cur) => {
      const idStr = String(cur.collectionId);
      if (!existingSet.has(idStr) && !seenCandidates.has(idStr)) {
        seenCandidates.add(idStr);
        candidatePool.push({
          collectionId: idStr,
          label: cur.collectionName + ' \u2014 ' + cur.artistName + ' [Catalog]'
        });
      }
    });

    const addAlbumOptionsHtml =
      candidatePool.length > 0
        ? '<option value="">Select an album from your library or catalog to add&hellip;</option>' +
          candidatePool
            .map(
              (item) =>
                '<option value="' +
                escapeHtml(item.collectionId) +
                '">' +
                escapeHtml(item.label) +
                '</option>'
            )
            .join('')
        : '<option value="">All library albums are already in this collection</option>';

    addOrRulesBarHtml =
      '<div class="journal-compose-bar collection-add-album-bar" role="region" aria-label="Add an album to this collection">' +
      '<label for="collection-add-album-select" class="chip-label">Add Album:</label>' +
      '<select id="collection-add-album-select" class="library-sort-select journal-album-picker-select" aria-label="Select an album to add to this collection">' +
      addAlbumOptionsHtml +
      '</select>' +
      '<button type="button" class="btn btn-primary" data-collection-action="add-selected-album" data-collection-id="' +
      safeColId +
      '" ' +
      (candidatePool.length === 0 ? 'disabled' : '') +
      '>+ Add to Collection</button>' +
      '</div>';
  }

  const sortOptions = [
    ...(isSmart
      ? []
      : [{ value: COLLECTION_SORT_MODES.MANUAL, label: 'Manual Order (Custom Sequence)' }]),
    { value: COLLECTION_SORT_MODES.SCORE_DESC, label: 'Highest Score' },
    { value: COLLECTION_SORT_MODES.SCORE_ASC, label: 'Lowest Score' },
    { value: COLLECTION_SORT_MODES.TITLE_ASC, label: 'Album Title A\u2013Z' },
    { value: COLLECTION_SORT_MODES.ARTIST_ASC, label: 'Artist A\u2013Z' },
    { value: COLLECTION_SORT_MODES.YEAR_DESC, label: 'Release Year (Newest)' }
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

  const clearBtnHidden = activeQuery.trim().length > 0 ? '' : ' hidden';

  container.innerHTML =
    '<div class="album-view-topbar">' +
    '<div class="chip-row">' +
    '<button type="button" class="btn btn-secondary" data-action="go-to-collections">&larr; All Collections</button>' +
    '<button type="button" class="btn btn-ghost" data-action="go-to-library">My Library</button>' +
    '</div>' +
    '<div class="chip-row">' +
    '<button type="button" class="btn btn-primary" data-collection-action="share-collection-poster" data-collection-id="' +
    safeColId +
    '" title="Preview and download a 1080x1920 PNG poster for this collection">Share Collection Poster</button>' +
    '<button type="button" class="btn btn-secondary" data-collection-action="quick-download-collection-poster" data-collection-id="' +
    safeColId +
    '" title="Download 1080x1920 PNG poster directly">Download 1080&times;1920 PNG</button>' +
    '<button type="button" class="btn btn-secondary" data-collection-action="edit-collection" data-collection-id="' +
    safeColId +
    '">' +
    (isSmart ? 'Edit Smart Rules' : 'Edit Collection') +
    '</button>' +
    '<button type="button" class="btn btn-ghost journal-delete-btn" data-collection-action="delete-collection" data-collection-id="' +
    safeColId +
    '" data-collection-title="' +
    safeTitle +
    '">Delete</button>' +
    '</div>' +
    '</div>' +
    '<section class="library-header-panel collection-detail-hero" style="--collection-accent: ' +
    escapeHtml(themeMeta.accentHex) +
    '" aria-label="Collection Overview">' +
    '<div class="library-header-panel__top">' +
    '<div>' +
    '<div class="album-banner-card__badges">' +
    '<span class="meta-pill meta-pill--accent">' +
    (isSmart ? 'SMART COLLECTION // DYNAMIC' : 'MANUAL COLLECTION') +
    '</span>' +
    '<span class="meta-pill">' +
    escapeHtml(themeMeta.label.toUpperCase()) +
    ' THEME</span>' +
    '<span class="meta-pill">' +
    String(enrichedCollection.albumCount) +
    ' ' +
    (enrichedCollection.albumCount === 1 ? 'ALBUM' : 'ALBUMS') +
    '</span>' +
    '<span class="meta-pill">CREATED ' +
    escapeHtml(createdStr.toUpperCase()) +
    ' &middot; UPDATED ' +
    escapeHtml(updatedStr.toUpperCase()) +
    '</span>' +
    '</div>' +
    '<h1 class="discover-hero__title">' +
    safeTitle +
    '</h1>' +
    (safeDesc
      ? '<p class="discover-hero__subtitle">' + safeDesc + '</p>'
      : '') +
    '</div>' +
    '<div class="collection-detail-hero__score-box">' +
    '<span class="score-summary-card__eyebrow">COLLECTION AVG RATING</span>' +
    '<strong class="collection-detail-hero__score-val" style="color: ' +
    enrichedCollection.averageTierColor +
    '">' +
    avgDisplay +
    '</strong>' +
    '<span class="lib-stat-card__sub">' +
    String(enrichedCollection.scoredAlbumCount) +
    ' of ' +
    String(enrichedCollection.albumCount) +
    ' scored</span>' +
    '</div>' +
    '</div>' +
    addOrRulesBarHtml +
    '<div class="library-toolbar" role="region" aria-label="Search and sort albums in this collection">' +
    '<div class="library-search-wrap">' +
    '<svg class="search-input-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true">' +
    '<circle cx="9" cy="9" r="6" stroke="currentColor" stroke-width="1.75"/>' +
    '<path d="M13.5 13.5L17 17" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>' +
    '</svg>' +
    '<input type="search" id="collection-detail-search-input" class="search-input library-search-input" ' +
    'placeholder="Search albums in this collection by title, artist, genre, or year..." ' +
    'value="' +
    escapeHtml(activeQuery) +
    '" autocomplete="off" spellcheck="false" aria-label="Search albums in this collection" />' +
    '<div class="search-input-actions">' +
    '<button type="button" id="collection-detail-search-clear-btn" class="search-clear-btn"' +
    clearBtnHidden +
    ' aria-label="Clear collection search">CLEAR</button>' +
    '</div>' +
    '</div>' +
    '<div class="library-controls-row">' +
    '<span class="section-header__count" id="collection-detail-count-label">' +
    'SHOWING ' +
    String(queryResult.visibleAlbums.length) +
    ' OF ' +
    String(enrichedCollection.albumCount) +
    ' ALBUMS' +
    '</span>' +
    '<div class="library-sort-group">' +
    '<label for="collection-detail-sort-select" class="chip-label">Order By:</label>' +
    '<select id="collection-detail-sort-select" class="library-sort-select" aria-label="Sort albums in this collection">' +
    sortOptionsHtml +
    '</select>' +
    '</div>' +
    '</div>' +
    '</div>' +
    '</section>' +
    '<section id="collection-detail-albums-mount" aria-live="polite">' +
    buildCollectionDetailAlbumsHtml(enrichedCollection, queryResult) +
    '</section>';
}

// =========================================================================
// 3. CREATE / EDIT CUSTOM OR SMART COLLECTION MODAL
// =========================================================================

let colModalState = {
  isOpen: false,
  collectionId: null,
  type: 'manual', // 'manual' | 'smart'
  title: '',
  description: '',
  theme: 'obsidian',
  selectedAlbumIds: new Set(),
  smartRules: {
    minRating: null,
    maxRating: null,
    artist: '',
    decade: '',
    hasJournalEntry: false,
    hasFavoriteTracks: false
  },
  candidateAlbums: [],
  triggerElement: null,
  onSaveSuccess: null,
  onToast: null
};

function ensureCollectionEditorModalMount() {
  let root = document.getElementById('collection-editor-modal-backdrop');
  if (root) return root;

  root = document.createElement('div');
  root.id = 'collection-editor-modal-backdrop';
  root.className = 'share-modal-backdrop collection-editor-backdrop';
  root.hidden = true;
  root.setAttribute('aria-hidden', 'true');

  root.innerHTML =
    '<div class="share-modal-dialog journal-editor-dialog" role="dialog" aria-modal="true" aria-labelledby="collection-editor-title" tabindex="-1">' +
    '<header class="share-modal__header">' +
    '<div>' +
    '<span class="share-modal__eyebrow" id="collection-editor-eyebrow">COLLECTION CURATION // MANUAL OR SMART RULES</span>' +
    '<h2 class="share-modal__title" id="collection-editor-title">Create Collection</h2>' +
    '</div>' +
    '<button type="button" class="btn btn-secondary share-modal__close-btn" data-coledit-action="close-modal" aria-label="Close Collection modal">&times; Close</button>' +
    '</header>' +
    '<div class="import-modal__body journal-editor__body" id="collection-editor-body-mount"></div>' +
    '<footer class="import-modal__footer">' +
    '<span id="collection-editor-error" class="journal-editor-error" role="alert" hidden></span>' +
    '<button type="button" class="btn btn-secondary" data-coledit-action="close-modal">Cancel</button>' +
    '<button type="button" class="btn btn-primary" id="collection-editor-save-btn" data-coledit-action="save-collection">Save Collection</button>' +
    '</footer>' +
    '</div>';

  document.body.appendChild(root);
  bindCollectionEditorModalEvents(root);
  return root;
}

function bindCollectionEditorModalEvents(root) {
  root.addEventListener('click', (event) => {
    if (event.target === root) {
      closeCollectionEditorModal();
      return;
    }

    const actionBtn = event.target.closest('[data-coledit-action]');
    if (!actionBtn) return;

    const action = actionBtn.getAttribute('data-coledit-action');
    if (action === 'close-modal') {
      closeCollectionEditorModal();
    } else if (action === 'save-collection') {
      handleSaveCollectionModalClick();
    } else if (action === 'select-type') {
      const nextType =
        actionBtn.getAttribute('data-collection-type') === 'smart'
          ? 'smart'
          : 'manual';
      if (colModalState.type !== nextType) {
        colModalState.type = nextType;
        hideCollectionEditorError();
        renderCollectionEditorBodyDom();
      }
    } else if (action === 'select-theme') {
      const nextTheme = actionBtn.getAttribute('data-theme-id') || 'obsidian';
      colModalState.theme = nextTheme;
      syncCollectionThemeButtonsDom(root);
    } else if (action === 'toggle-album') {
      const albId = String(actionBtn.getAttribute('data-album-id') || '').trim();
      if (!albId) return;
      if (colModalState.selectedAlbumIds.has(albId)) {
        colModalState.selectedAlbumIds.delete(albId);
      } else {
        colModalState.selectedAlbumIds.add(albId);
      }
      const isSelected = colModalState.selectedAlbumIds.has(albId);
      actionBtn.classList.toggle('is-active', isSelected);
      actionBtn.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
    } else if (action === 'clear-modal-rule') {
      const ruleKey = actionBtn.getAttribute('data-rule-key') || '';
      clearModalSmartRuleKey(ruleKey);
      renderCollectionEditorBodyDom();
    }
  });

  root.addEventListener('input', (event) => {
    if (event.target.id === 'collection-editor-title-input') {
      colModalState.title = event.target.value || '';
      hideCollectionEditorError();
    } else if (event.target.id === 'collection-editor-desc-textarea') {
      colModalState.description = event.target.value || '';
    } else if (event.target.id === 'smart-rule-artist-input') {
      colModalState.smartRules.artist = event.target.value || '';
      hideCollectionEditorError();
      refreshModalSmartPreviewDom();
    }
  });

  root.addEventListener('change', (event) => {
    if (event.target.id === 'smart-rule-min-rating') {
      const v = event.target.value;
      colModalState.smartRules.minRating = v === '' ? null : Number(v);
      hideCollectionEditorError();
      refreshModalSmartPreviewDom();
    } else if (event.target.id === 'smart-rule-max-rating') {
      const v = event.target.value;
      colModalState.smartRules.maxRating = v === '' ? null : Number(v);
      hideCollectionEditorError();
      refreshModalSmartPreviewDom();
    } else if (event.target.id === 'smart-rule-decade-select') {
      colModalState.smartRules.decade = event.target.value || '';
      hideCollectionEditorError();
      refreshModalSmartPreviewDom();
    } else if (event.target.id === 'smart-rule-journal-checkbox') {
      colModalState.smartRules.hasJournalEntry = Boolean(event.target.checked);
      hideCollectionEditorError();
      refreshModalSmartPreviewDom();
    } else if (event.target.id === 'smart-rule-favorites-checkbox') {
      colModalState.smartRules.hasFavoriteTracks = Boolean(event.target.checked);
      hideCollectionEditorError();
      refreshModalSmartPreviewDom();
    }
  });

  root.addEventListener('keydown', (event) => {
    if (event.target.id === 'collection-editor-title-input' && event.key === 'Enter') {
      event.preventDefault();
      handleSaveCollectionModalClick();
    }
  });

  window.addEventListener('keydown', (event) => {
    if (!colModalState.isOpen) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeCollectionEditorModal();
      return;
    }
    if (event.key === 'Tab') {
      trapFocusInCollectionModal(event, root);
    }
  });
}

function trapFocusInCollectionModal(event, root) {
  const dialog = root.querySelector('.share-modal-dialog');
  if (!dialog) return;

  const focusable = Array.from(
    dialog.querySelectorAll(
      'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  ).filter((el) => !el.hidden && el.offsetParent !== null);

  if (focusable.length === 0) return;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function clearModalSmartRuleKey(ruleKey) {
  if (ruleKey === 'ratingRange' || ruleKey === 'minRating') {
    colModalState.smartRules.minRating = null;
  }
  if (ruleKey === 'ratingRange' || ruleKey === 'maxRating') {
    colModalState.smartRules.maxRating = null;
  }
  if (ruleKey === 'artist') {
    colModalState.smartRules.artist = '';
  }
  if (ruleKey === 'decade') {
    colModalState.smartRules.decade = '';
  }
  if (ruleKey === 'hasJournalEntry') {
    colModalState.smartRules.hasJournalEntry = false;
  }
  if (ruleKey === 'hasFavoriteTracks') {
    colModalState.smartRules.hasFavoriteTracks = false;
  }
}

function syncCollectionThemeButtonsDom(root) {
  const btns = root.querySelectorAll('[data-coledit-action="select-theme"]');
  btns.forEach((btn) => {
    const id = btn.getAttribute('data-theme-id');
    const isActive = id === colModalState.theme;
    btn.classList.toggle('is-active', isActive);
    btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
}

function showCollectionEditorError(msg) {
  const errEl = document.getElementById('collection-editor-error');
  if (!errEl) return;
  errEl.textContent = msg;
  errEl.hidden = false;
}

function hideCollectionEditorError() {
  const errEl = document.getElementById('collection-editor-error');
  if (!errEl) return;
  errEl.hidden = true;
  errEl.textContent = '';
}

function buildSmartRulesLivePreviewHtml() {
  const evalRes = evaluateSmartCollectionRules(
    colModalState.smartRules,
    getSavedRatingsMap(),
    getAlbumCatalogCacheMap(),
    getSavedJournalMap()
  );

  if (!evalRes.hasActiveRules) {
    return (
      '<div class="smart-modal-preview-box">' +
      '<span class="smart-modal-preview-box__status">Configure at least one rule above to preview matching albums from your local library.</span>' +
      '</div>'
    );
  }

  const pillsHtml = evalRes.activeRulePills
    .map((p) => {
      return (
        '<span class="smart-rule-chip">' +
        '<span class="smart-rule-chip__label">' +
        escapeHtml(p.label) +
        ':</span>' +
        '<strong class="smart-rule-chip__val">' +
        escapeHtml(p.valueText) +
        '</strong>' +
        '<button type="button" class="smart-rule-chip__remove" data-coledit-action="clear-modal-rule" data-rule-key="' +
        escapeHtml(p.key) +
        '" title="Remove this rule">&times;</button>' +
        '</span>'
      );
    })
    .join('');

  const matchNames = evalRes.matchedAlbums
    .slice(0, 5)
    .map((a) => a.collectionName)
    .join(', ');

  return (
    '<div class="smart-modal-preview-box">' +
    '<div class="smart-modal-preview-box__top">' +
    '<strong>ACTIVE RULES (' +
    String(evalRes.activeRulePills.length) +
    '):</strong>' +
    '<span class="meta-pill meta-pill--accent">' +
    String(evalRes.matchedAlbums.length) +
    ' MATCHING ' +
    (evalRes.matchedAlbums.length === 1 ? 'ALBUM' : 'ALBUMS') +
    '</span>' +
    '</div>' +
    '<div class="chip-row">' +
    pillsHtml +
    '</div>' +
    (evalRes.matchedAlbums.length > 0
      ? '<p class="smart-modal-preview-box__matches">Matches: ' +
        escapeHtml(matchNames) +
        (evalRes.matchedAlbums.length > 5
          ? ' +' + String(evalRes.matchedAlbums.length - 5) + ' more'
          : '') +
        '</p>'
      : '<p class="smart-modal-preview-box__matches">0 albums currently match, but this collection will update automatically as you rate more records.</p>') +
    '</div>'
  );
}

function refreshModalSmartPreviewDom() {
  const previewMount = document.getElementById('smart-modal-live-preview-mount');
  if (previewMount) {
    previewMount.innerHTML = buildSmartRulesLivePreviewHtml();
  }
}

function renderCollectionEditorBodyDom() {
  const root = document.getElementById('collection-editor-modal-backdrop');
  const bodyMount = document.getElementById('collection-editor-body-mount');
  const modalTitle = document.getElementById('collection-editor-title');
  if (!bodyMount || !root) return;

  const isSmart = colModalState.type === 'smart';

  if (modalTitle) {
    if (colModalState.collectionId) {
      modalTitle.textContent = isSmart
        ? 'Edit Smart Collection & Rules'
        : 'Edit Collection Details';
    } else {
      modalTitle.textContent = isSmart
        ? 'Create Smart Collection'
        : 'Create Manual Collection';
    }
  }

  const themeButtonsHtml = Object.values(COLLECTION_THEME_OPTIONS)
    .map((th) => {
      const isSelected = th.id === colModalState.theme;
      return (
        '<button type="button" class="query-chip' +
        (isSelected ? ' is-active' : '') +
        '" data-coledit-action="select-theme" data-theme-id="' +
        escapeHtml(th.id) +
        '" aria-pressed="' +
        (isSelected ? 'true' : 'false') +
        '">' +
        '<span class="collection-theme-dot" style="background:' +
        escapeHtml(th.accentHex) +
        '"></span>' +
        '<span>' +
        escapeHtml(th.label) +
        '</span>' +
        '</button>'
      );
    })
    .join('');

  let modeSpecificSectionHtml = '';

  if (isSmart) {
    const r = colModalState.smartRules;
    const minRatingOptions = [
      '<option value=""' + (r.minRating === null ? ' selected' : '') + '>Any Minimum</option>',
      ...VALID_RATINGS.map((val) => {
        const f = val.toFixed(1);
        const sel =
          r.minRating !== null && Math.abs(r.minRating - val) < 1e-7
            ? ' selected'
            : '';
        return '<option value="' + f + '"' + sel + '>' + f + ' or higher</option>';
      })
    ].join('');

    const maxRatingOptions = [
      '<option value=""' + (r.maxRating === null ? ' selected' : '') + '>Any Maximum</option>',
      ...VALID_RATINGS.map((val) => {
        const f = val.toFixed(1);
        const sel =
          r.maxRating !== null && Math.abs(r.maxRating - val) < 1e-7
            ? ' selected'
            : '';
        return '<option value="' + f + '"' + sel + '>' + f + ' or lower</option>';
      })
    ].join('');

    const decadeOptions = [
      '<option value=""' + (!r.decade ? ' selected' : '') + '>Any Release Decade</option>',
      ...AVAILABLE_DECADE_RULES.map((dec) => {
        const sel = r.decade.toLowerCase() === dec.toLowerCase() ? ' selected' : '';
        return '<option value="' + dec + '"' + sel + '>' + dec + '</option>';
      })
    ].join('');

    const uniqueArtists = Array.from(
      new Set(
        colModalState.candidateAlbums
          .map((a) => String(a.artistName || '').trim())
          .filter((name) => name && name.toLowerCase() !== 'unknown artist')
      )
    ).slice(0, 30);

    const datalistHtml =
      '<datalist id="smart-rule-artists-datalist">' +
      uniqueArtists
        .map((art) => '<option value="' + escapeHtml(art) + '"></option>')
        .join('') +
      '</datalist>';

    modeSpecificSectionHtml =
      '<div class="jedit-section smart-rules-builder-box">' +
      '<span class="share-control-label">4. Configure Dynamic Smart Rules (Combine Any)</span>' +
      '<div class="smart-rules-form-grid">' +
      '<div class="smart-rule-field">' +
      '<label for="smart-rule-min-rating" class="chip-label">Minimum Rating</label>' +
      '<select id="smart-rule-min-rating" class="library-sort-select">' +
      minRatingOptions +
      '</select>' +
      '</div>' +
      '<div class="smart-rule-field">' +
      '<label for="smart-rule-max-rating" class="chip-label">Maximum Rating</label>' +
      '<select id="smart-rule-max-rating" class="library-sort-select">' +
      maxRatingOptions +
      '</select>' +
      '</div>' +
      '<div class="smart-rule-field">' +
      '<label for="smart-rule-decade-select" class="chip-label">Release Decade</label>' +
      '<select id="smart-rule-decade-select" class="library-sort-select">' +
      decadeOptions +
      '</select>' +
      '</div>' +
      '<div class="smart-rule-field">' +
      '<label for="smart-rule-artist-input" class="chip-label">Artist Name</label>' +
      '<input type="text" id="smart-rule-artist-input" list="smart-rule-artists-datalist" class="verdict-editor-input smart-rule-text-input" maxlength="80" value="' +
      escapeHtml(r.artist || '') +
      '" placeholder="e.g., Radiohead, Daft Punk..." autocomplete="off" />' +
      datalistHtml +
      '</div>' +
      '</div>' +
      '<div class="smart-rules-checkboxes">' +
      '<label class="import-radio-option">' +
      '<input type="checkbox" id="smart-rule-journal-checkbox"' +
      (r.hasJournalEntry ? ' checked' : '') +
      ' />' +
      '<span><strong>Has Listening Journal Entry:</strong> Only include albums with personal liner notes logged in your Journal.</span>' +
      '</label>' +
      '<label class="import-radio-option">' +
      '<input type="checkbox" id="smart-rule-favorites-checkbox"' +
      (r.hasFavoriteTracks ? ' checked' : '') +
      ' />' +
      '<span><strong>Has Favorite Tracks:</strong> Only include albums where you marked favorite tracks in your Journal.</span>' +
      '</label>' +
      '</div>' +
      '<div id="smart-modal-live-preview-mount">' +
      buildSmartRulesLivePreviewHtml() +
      '</div>' +
      '</div>';
  } else if (colModalState.candidateAlbums.length > 0) {
    modeSpecificSectionHtml =
      '<div class="jedit-section">' +
      '<span class="share-control-label">4. Included Albums (Click to Toggle Membership)</span>' +
      '<div class="collection-modal-albums-list" role="group" aria-label="Select albums to include in this collection">' +
      colModalState.candidateAlbums
        .map((alb) => {
          const idStr = String(alb.collectionId);
          const isSelected = colModalState.selectedAlbumIds.has(idStr);
          return (
            '<button type="button" class="collection-modal-album-pill' +
            (isSelected ? ' is-active' : '') +
            '" data-coledit-action="toggle-album" data-album-id="' +
            escapeHtml(idStr) +
            '" aria-pressed="' +
            (isSelected ? 'true' : 'false') +
            '">' +
            '<span class="collection-modal-album-pill__check" aria-hidden="true">' +
            (isSelected ? '&#10003;' : '+') +
            '</span>' +
            '<span class="collection-modal-album-pill__title">' +
            escapeHtml(alb.collectionName) +
            '</span>' +
            '<span class="collection-modal-album-pill__artist">' +
            escapeHtml(alb.artistName) +
            '</span>' +
            '</button>'
          );
        })
        .join('') +
      '</div>' +
      '</div>';
  }

  bodyMount.innerHTML =
    '<div class="jedit-section">' +
    '<span class="share-control-label">Collection Mode</span>' +
    '<div class="chip-row" role="group" aria-label="Collection type">' +
    '<button type="button" class="query-chip' +
    (!isSmart ? ' is-active' : '') +
    '" data-coledit-action="select-type" data-collection-type="manual" aria-pressed="' +
    (!isSmart ? 'true' : 'false') +
    '">Manual Shelf (Hand-Picked &amp; Ordered)</button>' +
    '<button type="button" class="query-chip' +
    (isSmart ? ' is-active' : '') +
    '" data-coledit-action="select-type" data-collection-type="smart" aria-pressed="' +
    (isSmart ? 'true' : 'false') +
    '">Smart Collection (Dynamic Rules)</button>' +
    '</div>' +
    '</div>' +
    '<div class="jedit-section">' +
    '<label for="collection-editor-title-input" class="share-control-label">1. Collection Title (Required)</label>' +
    '<input type="text" id="collection-editor-title-input" class="verdict-editor-input" maxlength="80" value="' +
    escapeHtml(colModalState.title) +
    '" placeholder="' +
    (isSmart
      ? 'e.g., 9.0+ Masterpieces, 2000s Essentials, Journaled Favorites...'
      : 'e.g., Late Night Headphones, 1990s Electronic Classics...') +
    '" autocomplete="off" />' +
    '</div>' +
    '<div class="jedit-section">' +
    '<label for="collection-editor-desc-textarea" class="share-control-label">2. Description / Curation Note (Optional)</label>' +
    '<textarea id="collection-editor-desc-textarea" class="share-verdict-textarea" rows="2" maxlength="400" placeholder="Describe the mood, era, or thread connecting these records...">' +
    escapeHtml(colModalState.description) +
    '</textarea>' +
    '</div>' +
    '<div class="jedit-section">' +
    '<span class="share-control-label">3. Visual Theme Accent</span>' +
    '<div class="chip-row" role="group" aria-label="Collection visual theme">' +
    themeButtonsHtml +
    '</div>' +
    '</div>' +
    modeSpecificSectionHtml;
}

function handleSaveCollectionModalClick() {
  const cleanTitle = String(colModalState.title || '').trim();
  if (!cleanTitle) {
    showCollectionEditorError('Please enter a title for your collection.');
    const input = document.getElementById('collection-editor-title-input');
    input?.focus();
    return;
  }

  let orderedAlbumIds = [];
  if (colModalState.type === 'manual') {
    if (colModalState.collectionId) {
      const existing = getCustomCollection(colModalState.collectionId);
      if (existing && Array.isArray(existing.albumIds)) {
        orderedAlbumIds = existing.albumIds.filter((id) =>
          colModalState.selectedAlbumIds.has(String(id))
        );
      }
    }
    colModalState.selectedAlbumIds.forEach((id) => {
      if (!orderedAlbumIds.includes(String(id))) {
        orderedAlbumIds.push(String(id));
      }
    });
  }

  const res = saveCustomCollection({
    id: colModalState.collectionId || undefined,
    title: cleanTitle,
    description: colModalState.description,
    type: colModalState.type,
    theme: colModalState.theme,
    albumIds: orderedAlbumIds,
    smartRules: colModalState.smartRules
  });

  if (!res || !res.savedOk) {
    showCollectionEditorError(res?.error || 'Could not save collection.');
    return;
  }

  if (typeof colModalState.onSaveSuccess === 'function') {
    colModalState.onSaveSuccess(res.collection, res.isNew);
  }
  if (typeof colModalState.onToast === 'function') {
    colModalState.onToast(
      res.isNew
        ? 'Created ' +
          (res.collection.type === 'smart' ? 'Smart Collection' : 'collection') +
          ' "' +
          res.collection.title +
          '".'
        : 'Updated "' + res.collection.title + '".'
    );
  }

  closeCollectionEditorModal();
}

export function openCollectionEditorModal({
  collectionId = null,
  initialType = 'manual',
  preselectAlbumId = null,
  candidateAlbums = [],
  triggerElement = null,
  onSaveSuccess = null,
  onToast = null
} = {}) {
  const root = ensureCollectionEditorModalMount();
  const existing = collectionId ? getCustomCollection(collectionId) : null;

  colModalState.isOpen = true;
  colModalState.collectionId = existing ? existing.id : null;
  colModalState.type = existing
    ? existing.type || 'manual'
    : initialType === 'smart'
    ? 'smart'
    : 'manual';
  colModalState.title = existing ? existing.title : '';
  colModalState.description = existing ? existing.description : '';
  colModalState.theme = existing ? existing.theme : 'obsidian';
  colModalState.selectedAlbumIds = new Set(
    existing ? existing.albumIds.map((id) => String(id)) : []
  );
  colModalState.smartRules = existing
    ? normalizeSmartCollectionRules(existing.smartRules)
    : normalizeSmartCollectionRules({});

  if (preselectAlbumId) {
    colModalState.selectedAlbumIds.add(String(preselectAlbumId));
  }

  const combinedCandidates = [];
  const seenIds = new Set();
  (Array.isArray(candidateAlbums) ? candidateAlbums : []).forEach((alb) => {
    const idStr = String(alb.collectionId);
    if (!seenIds.has(idStr)) {
      seenIds.add(idStr);
      combinedCandidates.push(alb);
    }
  });
  CURATED_ALBUMS.forEach((cur) => {
    const idStr = String(cur.collectionId);
    if (!seenIds.has(idStr)) {
      seenIds.add(idStr);
      combinedCandidates.push(cur);
    }
  });

  colModalState.candidateAlbums = combinedCandidates;
  colModalState.triggerElement = triggerElement || document.activeElement;
  colModalState.onSaveSuccess = onSaveSuccess;
  colModalState.onToast = onToast;

  hideCollectionEditorError();
  renderCollectionEditorBodyDom();

  root.hidden = false;
  root.setAttribute('aria-hidden', 'false');
  document.body.classList.add('has-open-modal');

  window.setTimeout(() => {
    const input = document.getElementById('collection-editor-title-input');
    input?.focus();
    input?.select();
  }, 30);
}

export function closeCollectionEditorModal() {
  const root = document.getElementById('collection-editor-modal-backdrop');
  if (!root || !colModalState.isOpen) return;

  colModalState.isOpen = false;
  root.hidden = true;
  root.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('has-open-modal');

  if (
    colModalState.triggerElement &&
    typeof colModalState.triggerElement.focus === 'function'
  ) {
    try {
      colModalState.triggerElement.focus();
    } catch {
      // Ignore focus error
    }
  }
}