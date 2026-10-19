/**
 * SLEEVE - Main Application Controller (Phase 9A)
 * Coordinates Discover, My Library, Taste Profile, Listening Insights,
 * Listening Journal, Custom Collections (#collections & #collection/{id}),
 * Album Detail, JSON Portability, and Social Card Modals.
 */

import { APP_CONFIG, CURATED_ALBUMS } from './config.js';
import { searchAlbums, fetchAlbumTracklist } from './api.js';
import {
  getSavedRatingsMap,
  getSavedAlbumRating,
  getAlbumTrackRatings,
  getAlbumVerdict,
  saveAlbumVerdict,
  getAlbumCatalogCacheMap,
  saveAlbumMetadataToCache,
  saveTrackRatingUpdate,
  removeAlbumFromLibrary,
  restoreAlbumToLibrary,
  clearAlbumTrackRatings,
  saveRecentSearch,
  getSavedJournalMap,
  getAlbumJournalEntry,
  deleteAlbumJournalEntry,
  getSavedCollectionsMap,
  getCustomCollection,
  deleteCustomCollection,
  addAlbumToCustomCollection,
  removeAlbumFromCustomCollection,
  moveAlbumInCustomCollection,
  removeSmartCollectionRule
} from './storage.js';
import {
  parseTrackRating,
  stepTrackRating,
  normalizeTrackState,
  calculateAlbumScoreAndHighlights
} from './calculator.js';
import {
  LIBRARY_SORT_MODES,
  LIBRARY_FILTER_MODES,
  getLibraryEntries,
  queryLibrary
} from './library.js';
import { buildMusicTasteProfile } from './profile.js';
import { buildListeningInsights } from './insights.js';
import {
  JOURNAL_SORT_MODES,
  JOURNAL_RATING_FILTERS,
  queryJournal,
  downloadJournalExportJson
} from './journal.js';
import {
  COLLECTION_SORT_MODES,
  buildEnrichedCollection,
  getEnrichedCollectionsList,
  queryCollectionAlbums,
  getAlbumCollectionMembership
} from './collections.js';
import { downloadLibraryExportJson } from './portability.js';
import {
  clearDiscoverySessionCache,
  deriveDiscoverySignals,
  fetchPersonalizedDiscoveryAlbums
} from './discovery.js';
import {
  renderDiscoverShell,
  renderDiscoverSkeletons,
  renderAlbumGrid,
  renderDiscoverError,
  renderPersonalizedDiscoverySection
} from './ui/discoverView.js';
import {
  renderAlbumLoadingState,
  renderAlbumView,
  renderAlbumErrorState,
  updateTrackRowDom,
  updateAlbumSummaryDom,
  updateAlbumJournalMountDom,
  upsertAlbumCollectionsBarDom
} from './ui/albumView.js';
import {
  renderLibraryView,
  renderLibraryResultsMount,
  buildLibrarySummaryHtml
} from './ui/libraryView.js';
import { renderProfileView } from './ui/profileView.js';
import {
  renderInsightsView,
  buildArtistRankingsListHtml
} from './ui/insightsView.js';
import {
  renderJournalView,
  renderJournalResultsMount
} from './ui/journalView.js';
import {
  renderCollectionsIndexView,
  renderCollectionDetailView,
  buildCollectionDetailAlbumsHtml,
  openCollectionEditorModal,
  closeCollectionEditorModal
} from './ui/collectionsView.js';
import {
  openShareReviewModal,
  openShareProfileModal,
  openShareInsightsModal,
  openShareCollectionPosterModal,
  exportTasteProfilePngDirect,
  exportListeningInsightsPngDirect,
  exportCollectionPosterPngDirect,
  updateOpenShareModalData,
  closeShareReviewModal
} from './ui/shareModal.js';
import {
  openImportLibraryModal,
  closeImportLibraryModal
} from './ui/importModal.js';
import {
  openJournalEditorModal,
  closeJournalEditorModal,
  openJournalImportModal,
  closeJournalImportModal
} from './ui/journalModal.js';

const state = {
  currentView: 'discover',
  previousView: 'discover',
  query: '',
  albums: CURATED_ALBUMS,
  isFallbackSearch: false,
  activeAlbumId: null,
  activeAlbumData: null,
  activeCollectionId: null,
  collectionDetailQuery: '',
  collectionDetailSort: COLLECTION_SORT_MODES.MANUAL,
  libraryQuery: '',
  libraryFilter: LIBRARY_FILTER_MODES.ALL,
  librarySort: LIBRARY_SORT_MODES.SCORE_DESC,
  insightsArtistFilter: 'all',
  journalQuery: '',
  journalMoodFilter: '',
  journalRatingFilter: JOURNAL_RATING_FILTERS.ALL,
  journalSort: JOURNAL_SORT_MODES.UPDATED_DESC,
  searchTimer: null,
  searchRequestId: 0,
  discoveryRequestId: 0,
  audioPlayer: null,
  activePreviewBtn: null
};

const elements = {
  viewRoot: null,
  navDiscoverBtn: null,
  navLibraryBtn: null,
  navLibraryCount: null,
  navProfileBtn: null,
  navInsightsBtn: null,
  navJournalBtn: null,
  navJournalCount: null,
  navCollectionsBtn: null,
  navCollectionsCount: null,
  navInspectorBtn: null,
  navInspectorLabel: null,
  apiStatusDot: null,
  apiStatusText: null,
  toastRegion: null
};

function initApp() {
  elements.viewRoot = document.getElementById('view-root');
  elements.navDiscoverBtn = document.getElementById('nav-discover-btn');
  elements.navLibraryBtn = document.getElementById('nav-library-btn');
  elements.navLibraryCount = document.getElementById('nav-library-count');
  elements.navProfileBtn = document.getElementById('nav-profile-btn');
  elements.navInsightsBtn = document.getElementById('nav-insights-btn');
  elements.navJournalBtn = document.getElementById('nav-journal-btn');
  elements.navJournalCount = document.getElementById('nav-journal-count');
  elements.navCollectionsBtn = document.getElementById('nav-collections-btn');
  elements.navCollectionsCount = document.getElementById('nav-collections-count');
  elements.navInspectorBtn = document.getElementById('nav-inspector-btn');
  elements.navInspectorLabel = document.getElementById('nav-inspector-label');
  elements.apiStatusDot = document.getElementById('api-status-dot');
  elements.apiStatusText = document.getElementById('api-status-text');
  elements.toastRegion = document.getElementById('toast-region');

  state.audioPlayer = new Audio();
  state.audioPlayer.preload = 'none';
  state.audioPlayer.addEventListener('ended', resetAudioPreviewUi);
  state.audioPlayer.addEventListener('pause', resetAudioPreviewUi);

  refreshHeaderCounts();
  bindGlobalEvents();
  handleInitialRoute();
}

function bindGlobalEvents() {
  elements.navDiscoverBtn?.addEventListener('click', () => {
    navigateToDiscover();
  });

  elements.navLibraryBtn?.addEventListener('click', () => {
    navigateToLibrary();
  });

  elements.navProfileBtn?.addEventListener('click', () => {
    navigateToProfile();
  });

  elements.navInsightsBtn?.addEventListener('click', () => {
    navigateToInsights();
  });

  elements.navJournalBtn?.addEventListener('click', () => {
    navigateToJournal();
  });

  elements.navCollectionsBtn?.addEventListener('click', () => {
    navigateToCollections();
  });

  elements.navInspectorBtn?.addEventListener('click', () => {
    if (state.activeAlbumId) {
      openAlbumInspector(state.activeAlbumId);
    }
  });

  elements.viewRoot.addEventListener('click', (event) => {
    // 1. Custom Collections actions
    const colActionBtn = event.target.closest('[data-collection-action]');
    if (colActionBtn) {
      event.stopPropagation();
      handleCollectionActionClick(colActionBtn);
      return;
    }

    // 2. Journal-specific actions
    const journalActionBtn = event.target.closest('[data-journal-action]');
    if (journalActionBtn) {
      event.stopPropagation();
      handleJournalActionClick(journalActionBtn);
      return;
    }

    // 3. Journal mood filter chips
    const journalMoodBtn = event.target.closest('[data-journal-mood-filter]');
    if (journalMoodBtn) {
      event.stopPropagation();
      const clickedMood = journalMoodBtn.getAttribute('data-journal-mood-filter') || '';
      state.journalMoodFilter =
        state.journalMoodFilter.toLowerCase() === clickedMood.toLowerCase() && clickedMood !== ''
          ? ''
          : clickedMood;
      if (state.currentView === 'journal') {
        showJournalView({ updateHash: false });
      }
      return;
    }

    // 4. Library-specific actions
    const libraryActionBtn = event.target.closest('[data-library-action]');
    if (libraryActionBtn) {
      event.stopPropagation();
      handleLibraryActionClick(libraryActionBtn);
      return;
    }

    // 5. Library completion filter chips
    const libraryFilterBtn = event.target.closest('[data-library-filter]');
    if (libraryFilterBtn) {
      const nextFilter =
        libraryFilterBtn.getAttribute('data-library-filter') || LIBRARY_FILTER_MODES.ALL;
      state.libraryFilter = nextFilter;
      refreshLibraryViewInPlace();
      return;
    }

    // 6. Insights Artist Ranking sample-size filter chips
    const insightsFilterBtn = event.target.closest('[data-insights-artist-filter]');
    if (insightsFilterBtn) {
      const nextMode =
        insightsFilterBtn.getAttribute('data-insights-artist-filter') || 'all';
      state.insightsArtistFilter = nextMode;
      refreshInsightsArtistRankingsInPlace();
      return;
    }

    // 7. Track Rating / Interlude / Inclusion Actions
    const trackActionBtn = event.target.closest('[data-track-action]');
    if (trackActionBtn && trackActionBtn.tagName !== 'SELECT') {
      handleTrackControlClick(trackActionBtn);
      return;
    }

    // 8. Quick search chips on Discover
    const quickQueryBtn = event.target.closest('[data-quick-query]');
    if (quickQueryBtn) {
      const selectedQuery = quickQueryBtn.getAttribute('data-quick-query') || '';
      const nextQuery =
        state.query.toLowerCase() === selectedQuery.toLowerCase() ? '' : selectedQuery;
      setSearchQueryAndRun(nextQuery);
      return;
    }

    // 9. General view actions
    const actionEl = event.target.closest('[data-action]');
    if (actionEl) {
      const action = actionEl.getAttribute('data-action');
      if (action === 'reset-search') {
        setSearchQueryAndRun('');
      } else if (action === 'retry-search') {
        executeAlbumSearch(state.query);
      } else if (action === 'refresh-discovery') {
        loadAndRenderPersonalizedDiscovery({ forceRefresh: true });
      } else if (action === 'back-to-discover') {
        navigateToDiscover();
      } else if (action === 'go-to-library') {
        navigateToLibrary();
      } else if (action === 'go-to-profile') {
        navigateToProfile();
      } else if (action === 'go-to-insights') {
        navigateToInsights();
      } else if (action === 'go-to-journal') {
        navigateToJournal();
      } else if (action === 'go-to-collections') {
        navigateToCollections();
      } else if (action === 'retry-album') {
        const retryId = Number(actionEl.getAttribute('data-album-id')) || state.activeAlbumId;
        if (retryId) openAlbumInspector(retryId);
      } else if (action === 'clear-all-ratings') {
        handleResetAlbumRatings();
      } else if (action === 'open-share-modal') {
        handleOpenShareModalClick(actionEl);
      } else if (action === 'open-share-profile-modal') {
        handleOpenShareProfileModalClick(actionEl);
      } else if (action === 'quick-download-profile-png') {
        handleQuickDownloadProfilePng(actionEl);
      } else if (action === 'open-share-insights-modal') {
        handleOpenShareInsightsModalClick(actionEl);
      } else if (action === 'quick-download-insights-png') {
        handleQuickDownloadInsightsPng(actionEl);
      } else if (action === 'restore-to-library') {
        const restoreId = Number(actionEl.getAttribute('data-album-id')) || state.activeAlbumId;
        if (restoreId) {
          restoreAlbumToLibrary(restoreId);
          refreshHeaderCounts();
          const hiddenBanner = document.getElementById('album-hidden-library-banner');
          if (hiddenBanner) hiddenBanner.hidden = true;
          showToast('Album restored to My Library.');
        }
      }
      return;
    }

    // 10. Artist search link
    const artistLinkBtn = event.target.closest('[data-artist-search]');
    if (artistLinkBtn) {
      event.stopPropagation();
      const artistName = artistLinkBtn.getAttribute('data-artist-search') || '';
      navigateToDiscover(artistName);
      return;
    }

    // 11. Open Album Detail from any element with [data-album-id]
    const albumTarget = event.target.closest('[data-album-id]');
    if (albumTarget) {
      const collectionId = Number(albumTarget.getAttribute('data-album-id'));
      if (collectionId) {
        openAlbumInspector(collectionId);
      }
      return;
    }

    // 12. 30-second audio preview button
    const previewBtn = event.target.closest('.preview-audio-btn[data-preview-url]');
    if (previewBtn) {
      toggleTrackPreview(previewBtn);
    }
  });

  elements.viewRoot.addEventListener('change', (event) => {
    const selectEl = event.target.closest('select[data-track-action="select-rating"]');
    if (selectEl) {
      const trackKey = selectEl.getAttribute('data-track-key');
      if (!trackKey || !state.activeAlbumId) return;

      const rawVal = selectEl.value;
      const nextRating = rawVal === '' ? null : parseTrackRating(rawVal);
      applyTrackStatePatch(trackKey, { rating: nextRating });
      return;
    }

    const librarySortSelect = event.target.closest('#library-sort-select');
    if (librarySortSelect) {
      state.librarySort = librarySortSelect.value || LIBRARY_SORT_MODES.SCORE_DESC;
      refreshLibraryViewInPlace();
      return;
    }

    const journalSortSelect = event.target.closest('#journal-sort-select');
    if (journalSortSelect) {
      state.journalSort = journalSortSelect.value || JOURNAL_SORT_MODES.UPDATED_DESC;
      refreshJournalViewInPlace();
      return;
    }

    const journalRatingSelect = event.target.closest('#journal-rating-filter-select');
    if (journalRatingSelect) {
      state.journalRatingFilter =
        journalRatingSelect.value || JOURNAL_RATING_FILTERS.ALL;
      refreshJournalViewInPlace();
      return;
    }

    const colSortSelect = event.target.closest('#collection-detail-sort-select');
    if (colSortSelect) {
      state.collectionDetailSort =
        colSortSelect.value || COLLECTION_SORT_MODES.MANUAL;
      refreshCollectionDetailInPlace();
    }
  });

  elements.viewRoot.addEventListener('input', (event) => {
    const verdictInput = event.target.closest('#album-verdict-input');
    if (!verdictInput || !state.activeAlbumId || !state.activeAlbumData) return;

    const val = verdictInput.value || '';
    const countEl = document.getElementById('album-verdict-char-count');
    if (countEl) {
      countEl.textContent =
        String(val.length) + ' / ' + String(APP_CONFIG.maxVerdictLength || 160);
    }

    const { album, tracks } = state.activeAlbumData;
    const saved = saveAlbumVerdict(state.activeAlbumId, val, tracks, album);
    const clearAllBtn = elements.viewRoot.querySelector('[data-action="clear-all-ratings"]');
    if (clearAllBtn && saved) {
      const r = saved.record;
      clearAllBtn.hidden = (r.ratedCount || 0) === 0 && !r.verdict;
    }
    updateOpenShareModalData({ verdict: saved ? saved.verdict : val });
  });

  elements.viewRoot.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      const colMosaicTarget = event.target.closest(
        '[data-collection-action="open-collection"][role="button"]'
      );
      if (colMosaicTarget) {
        event.preventDefault();
        const colId = colMosaicTarget.getAttribute('data-collection-id');
        if (colId) openCollectionDetail(colId);
        return;
      }

      const albumCard = event.target.closest('[data-album-id][role="button"]');
      if (albumCard) {
        event.preventDefault();
        const collectionId = Number(albumCard.getAttribute('data-album-id'));
        if (collectionId) {
          openAlbumInspector(collectionId);
        }
      }
    }
  });

  window.addEventListener('keydown', (event) => {
    if (document.body.classList.contains('has-open-modal')) return;

    const activeTag = document.activeElement?.tagName?.toLowerCase();
    const isTyping = activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select';

    if (event.key === '/' && !isTyping) {
      event.preventDefault();
      if (state.currentView === 'library') {
        const libSearch = document.getElementById('library-search-input');
        libSearch?.focus();
        libSearch?.select();
        return;
      }
      if (state.currentView === 'journal') {
        const jSearch = document.getElementById('journal-search-input');
        jSearch?.focus();
        jSearch?.select();
        return;
      }
      if (state.currentView === 'collection-detail') {
        const cSearch = document.getElementById('collection-detail-search-input');
        cSearch?.focus();
        cSearch?.select();
        return;
      }
      if (state.currentView !== 'discover') {
        navigateToDiscover();
      }
      const searchInput = document.getElementById('album-search-input');
      searchInput?.focus();
      searchInput?.select();
    } else if (event.key === 'Escape' && isTyping) {
      document.activeElement.blur();
    }
  });

  const onBrowserRouteChange = () => {
    const currentHash = window.location.hash || '#discover';
    if (currentHash === lastHandledRouteHash) return;
    closeAllModals();
    handleInitialRoute();
  };

  window.addEventListener('hashchange', onBrowserRouteChange);
  window.addEventListener('popstate', onBrowserRouteChange);
}

function closeAllModals() {
  closeShareReviewModal();
  closeImportLibraryModal();
  closeJournalEditorModal();
  closeJournalImportModal();
  closeCollectionEditorModal();
}

function handleCollectionActionClick(buttonEl) {
  const action = buttonEl.getAttribute('data-collection-action');

  if (action === 'open-collection') {
    const colId = buttonEl.getAttribute('data-collection-id');
    if (colId) {
      openCollectionDetail(colId);
    }
    return;
  }

  if (action === 'create-smart-collection') {
    const libraryEntries = getLibraryEntries(
      getSavedRatingsMap(),
      getAlbumCatalogCacheMap()
    );
    openCollectionEditorModal({
      collectionId: null,
      initialType: 'smart',
      candidateAlbums: libraryEntries,
      triggerElement: buttonEl,
      onSaveSuccess: (savedCol) => {
        refreshHeaderCounts();
        openCollectionDetail(savedCol.id);
      },
      onToast: (msg) => showToast(msg)
    });
    return;
  }

  if (action === 'remove-smart-rule') {
    const colId = buttonEl.getAttribute('data-collection-id') || state.activeCollectionId;
    const ruleKey = buttonEl.getAttribute('data-rule-key');
    if (!colId || !ruleKey) return;

    const res = removeSmartCollectionRule(colId, ruleKey);
    if (res.ok) {
      showCollectionDetailView(colId, { updateHash: false });
      showToast('Removed rule from Smart Collection.');
    }
    return;
  }

  if (action === 'share-collection-poster') {
    const colId = buttonEl.getAttribute('data-collection-id') || state.activeCollectionId;
    const rawCol = colId ? getCustomCollection(colId) : null;
    if (!rawCol) return;

    openShareCollectionPosterModal({
      collectionId: rawCol.id,
      collection: rawCol,
      ratingsMap: getSavedRatingsMap(),
      metadataMap: getAlbumCatalogCacheMap(),
      journalMap: getSavedJournalMap(),
      triggerElement: buttonEl,
      onToast: (msg) => showToast(msg)
    });
    return;
  }

  if (action === 'quick-download-collection-poster') {
    const colId = buttonEl.getAttribute('data-collection-id') || state.activeCollectionId;
    const rawCol = colId ? getCustomCollection(colId) : null;
    if (!rawCol) return;

    const prevHtml = buttonEl.innerHTML;
    buttonEl.disabled = true;
    buttonEl.textContent = 'Generating PNG...';
    exportCollectionPosterPngDirect({
      collectionId: rawCol.id,
      collection: rawCol,
      ratingsMap: getSavedRatingsMap(),
      metadataMap: getAlbumCatalogCacheMap(),
      journalMap: getSavedJournalMap(),
      onToast: (msg) => showToast(msg)
    })
      .catch((err) => {
        showToast('Unable to export poster: ' + (err.message || 'Browser error'));
      })
      .finally(() => {
        buttonEl.disabled = false;
        buttonEl.innerHTML = prevHtml;
      });
    return;
  }
  if (action === 'create-collection') {
    const libraryEntries = getLibraryEntries(
      getSavedRatingsMap(),
      getAlbumCatalogCacheMap()
    );
    openCollectionEditorModal({
      collectionId: null,
      candidateAlbums: libraryEntries,
      triggerElement: buttonEl,
      onSaveSuccess: (savedCol) => {
        refreshHeaderCounts();
        openCollectionDetail(savedCol.id);
      },
      onToast: (msg) => showToast(msg)
    });
    return;
  }

  if (action === 'create-collection-with-album') {
    const albumId = buttonEl.getAttribute('data-album-id') || state.activeAlbumId;
    const libraryEntries = getLibraryEntries(
      getSavedRatingsMap(),
      getAlbumCatalogCacheMap()
    );
    if (state.activeAlbumData?.album) {
      libraryEntries.unshift(state.activeAlbumData.album);
    }
    openCollectionEditorModal({
      collectionId: null,
      preselectAlbumId: albumId,
      candidateAlbums: libraryEntries,
      triggerElement: buttonEl,
      onSaveSuccess: () => {
        refreshHeaderCounts();
        if (state.currentView === 'album' && state.activeAlbumData) {
          const membership = getAlbumCollectionMembership(
            state.activeAlbumId,
            getSavedCollectionsMap()
          );
          upsertAlbumCollectionsBarDom(
            elements.viewRoot,
            state.activeAlbumData.album,
            membership
          );
        }
      },
      onToast: (msg) => showToast(msg)
    });
    return;
  }

  if (action === 'edit-collection') {
    const colId = buttonEl.getAttribute('data-collection-id') || state.activeCollectionId;
    if (!colId) return;
    const libraryEntries = getLibraryEntries(
      getSavedRatingsMap(),
      getAlbumCatalogCacheMap()
    );
    openCollectionEditorModal({
      collectionId: colId,
      candidateAlbums: libraryEntries,
      triggerElement: buttonEl,
      onSaveSuccess: (savedCol) => {
        refreshHeaderCounts();
        if (state.currentView === 'collection-detail') {
          showCollectionDetailView(savedCol.id, { updateHash: false });
        } else if (state.currentView === 'collections') {
          showCollectionsIndexView({ updateHash: false });
        }
      },
      onToast: (msg) => showToast(msg)
    });
    return;
  }

  if (action === 'delete-collection') {
    const colId = buttonEl.getAttribute('data-collection-id') || state.activeCollectionId;
    const colTitle = buttonEl.getAttribute('data-collection-title') || 'this collection';
    if (!colId) return;

    const confirmed = window.confirm(
      'Delete custom collection "' +
        colTitle +
        '"?\n\nYour albums, ratings, and journal entries will NOT be deleted.'
    );
    if (!confirmed) return;

    deleteCustomCollection(colId);
    refreshHeaderCounts();
    navigateToCollections();
    showToast('Deleted collection "' + colTitle + '".');
    return;
  }

  if (action === 'add-selected-album') {
    const colId = buttonEl.getAttribute('data-collection-id') || state.activeCollectionId;
    const selectEl = document.getElementById('collection-add-album-select');
    const selectedAlbumId = selectEl?.value;
    if (!colId || !selectedAlbumId) {
      showToast('Select an album from the dropdown first.');
      selectEl?.focus();
      return;
    }

    const res = addAlbumToCustomCollection(colId, selectedAlbumId);
    if (res.ok) {
      showCollectionDetailView(colId, { updateHash: false });
      showToast(
        res.alreadyPresent
          ? 'Album is already in this collection.'
          : 'Added album to collection.'
      );
    }
    return;
  }

  if (action === 'add-active-album-to-selected') {
    const albumId = buttonEl.getAttribute('data-album-id') || state.activeAlbumId;
    const selectEl = document.getElementById('album-view-add-collection-select');
    const colId = selectEl?.value;
    if (!colId || !albumId) return;

    const res = addAlbumToCustomCollection(
      colId,
      albumId,
      state.activeAlbumData?.album || null
    );
    if (res.ok && state.activeAlbumData?.album) {
      const membership = getAlbumCollectionMembership(
        albumId,
        getSavedCollectionsMap()
      );
      upsertAlbumCollectionsBarDom(
        elements.viewRoot,
        state.activeAlbumData.album,
        membership
      );
      showToast('Added "' + state.activeAlbumData.album.collectionName + '" to collection.');
    }
    return;
  }

  if (action === 'remove-album-from-collection') {
    const colId = buttonEl.getAttribute('data-collection-id') || state.activeCollectionId;
    const albumId = buttonEl.getAttribute('data-album-id');
    const albumTitle = buttonEl.getAttribute('data-album-title') || 'Album';
    if (!colId || !albumId) return;

    removeAlbumFromCustomCollection(colId, albumId);
    if (state.currentView === 'collection-detail') {
      showCollectionDetailView(colId, { updateHash: false });
    } else if (state.currentView === 'album' && state.activeAlbumData?.album) {
      const membership = getAlbumCollectionMembership(
        state.activeAlbumId,
        getSavedCollectionsMap()
      );
      upsertAlbumCollectionsBarDom(
        elements.viewRoot,
        state.activeAlbumData.album,
        membership
      );
    }
    showToast('Removed "' + albumTitle + '" from collection.');
    return;
  }

  if (action === 'move-album-up' || action === 'move-album-down') {
    const colId = buttonEl.getAttribute('data-collection-id') || state.activeCollectionId;
    const albumId = buttonEl.getAttribute('data-album-id');
    if (!colId || !albumId) return;

    const dir = action === 'move-album-up' ? 'up' : 'down';
    const res = moveAlbumInCustomCollection(colId, albumId, dir);
    if (res.ok && res.moved) {
      refreshCollectionDetailInPlace();
    }
    return;
  }

  if (action === 'reset-collection-search') {
    state.collectionDetailQuery = '';
    const input = document.getElementById('collection-detail-search-input');
    const clearBtn = document.getElementById('collection-detail-search-clear-btn');
    if (input) input.value = '';
    if (clearBtn) clearBtn.hidden = true;
    refreshCollectionDetailInPlace();
    return;
  }

  if (action === 'switch-to-manual-order') {
    state.collectionDetailQuery = '';
    state.collectionDetailSort = COLLECTION_SORT_MODES.MANUAL;
    showCollectionDetailView(state.activeCollectionId, { updateHash: false });
  }
}

async function handleJournalActionClick(buttonEl) {
  const action = buttonEl.getAttribute('data-journal-action');

  if (action === 'edit-entry') {
    const albumId = buttonEl.getAttribute('data-album-id') || state.activeAlbumId;
    if (!albumId) return;
    await launchJournalEditorForAlbum(albumId, buttonEl);
    return;
  }

  if (action === 'open-selected-album-editor') {
    const picker = document.getElementById('journal-album-picker-select');
    const selectedId = picker?.value;
    if (!selectedId) {
      showToast('Select an album from the dropdown first to write or edit a journal entry.');
      picker?.focus();
      return;
    }
    await launchJournalEditorForAlbum(selectedId, buttonEl);
    return;
  }

  if (action === 'new-entry-picker') {
    const libraryEntries = getLibraryEntries(
      getSavedRatingsMap(),
      getAlbumCatalogCacheMap()
    );
    if (libraryEntries.length === 0) {
      navigateToDiscover();
      return;
    }
    await launchJournalEditorForAlbum(libraryEntries[0].collectionId, buttonEl);
    return;
  }

  if (action === 'delete-entry') {
    const albumId = buttonEl.getAttribute('data-album-id');
    const albumTitle = buttonEl.getAttribute('data-album-title') || 'this album';
    if (!albumId) return;

    const confirmed = window.confirm(
      'Delete your Listening Journal entry for "' +
        albumTitle +
        '"?\n\nYour album and track ratings will NOT be affected.'
    );
    if (!confirmed) return;

    deleteAlbumJournalEntry(albumId);
    refreshHeaderCounts();

    if (state.currentView === 'journal') {
      showJournalView({ updateHash: false });
    } else if (state.currentView === 'album' && state.activeAlbumData) {
      updateAlbumJournalMountDom(
        elements.viewRoot,
        state.activeAlbumData.album,
        null
      );
      const membership = getAlbumCollectionMembership(
        state.activeAlbumId,
        getSavedCollectionsMap()
      );
      upsertAlbumCollectionsBarDom(
        elements.viewRoot,
        state.activeAlbumData.album,
        membership
      );
    }
    showToast('Deleted journal entry for "' + albumTitle + '".');
    return;
  }

  if (action === 'reset-journal-filters') {
    state.journalQuery = '';
    state.journalMoodFilter = '';
    state.journalRatingFilter = JOURNAL_RATING_FILTERS.ALL;
    showJournalView({ updateHash: false });
    return;
  }

  if (action === 'export-journal-json') {
    try {
      const res = downloadJournalExportJson(
        getSavedJournalMap(),
        getAlbumCatalogCacheMap()
      );
      showToast(
        'Exported ' +
          String(res.entryCount) +
          ' journal entry/entries to "' +
          res.filename +
          '"'
      );
    } catch (err) {
      showToast('Unable to export journal JSON: ' + (err.message || 'Error'));
    }
    return;
  }

  if (action === 'open-journal-import-modal') {
    openJournalImportModal({
      triggerElement: buttonEl,
      onImportSuccess: () => {
        refreshHeaderCounts();
        if (state.currentView === 'journal') {
          showJournalView({ updateHash: false });
        } else if (state.currentView === 'album' && state.activeAlbumData) {
          const updatedEntry = getAlbumJournalEntry(state.activeAlbumId);
          updateAlbumJournalMountDom(
            elements.viewRoot,
            state.activeAlbumData.album,
            updatedEntry
          );
        }
      },
      onToast: (msg) => showToast(msg)
    });
  }
}

async function launchJournalEditorForAlbum(collectionId, triggerEl) {
  let album = null;
  let tracks = [];

  if (
    state.activeAlbumData &&
    String(state.activeAlbumData.album?.collectionId) === String(collectionId)
  ) {
    album = state.activeAlbumData.album;
    tracks = state.activeAlbumData.tracks || [];
  } else {
    try {
      const fetched = await fetchAlbumTracklist(collectionId);
      album = fetched.album;
      tracks = fetched.tracks || [];
    } catch {
      const metaMap = getAlbumCatalogCacheMap();
      album = metaMap[String(collectionId)] || {
        collectionId,
        collectionName: 'Album #' + String(collectionId),
        artistName: 'Unknown Artist'
      };
      tracks = [];
    }
  }

  openJournalEditorModal({
    collectionId,
    album,
    tracks,
    triggerElement: triggerEl,
    onSaveSuccess: (savedEntry) => {
      refreshHeaderCounts();
      if (state.currentView === 'journal') {
        showJournalView({ updateHash: false });
      } else if (state.currentView === 'album') {
        updateAlbumJournalMountDom(elements.viewRoot, album, savedEntry);
        const membership = getAlbumCollectionMembership(
          state.activeAlbumId,
          getSavedCollectionsMap()
        );
        upsertAlbumCollectionsBarDom(elements.viewRoot, album, membership);
      }
    },
    onToast: (msg) => showToast(msg)
  });
}

function handleOpenShareModalClick(triggerBtn) {
  if (!state.activeAlbumId || !state.activeAlbumData) return;
  const { album, tracks } = state.activeAlbumData;
  const trackRatingsMap = getAlbumTrackRatings(state.activeAlbumId);
  const metrics = calculateAlbumScoreAndHighlights(tracks || [], trackRatingsMap);

  if (metrics.scoredCount === 0 || metrics.overallScore === null) {
    showToast('Rate and include at least one track before generating a Share Review card.');
    return;
  }

  const currentVerdict = getAlbumVerdict(state.activeAlbumId);

  openShareReviewModal({
    album,
    tracks,
    trackRatingsMap,
    verdict: currentVerdict,
    triggerElement: triggerBtn,
    onVerdictChange: (nextVerdict) => {
      const saved = saveAlbumVerdict(state.activeAlbumId, nextVerdict, tracks, album);
      const pageInput = document.getElementById('album-verdict-input');
      const pageCount = document.getElementById('album-verdict-char-count');
      if (pageInput && document.activeElement !== pageInput) {
        pageInput.value = nextVerdict;
      }
      if (pageCount) {
        pageCount.textContent =
          String((nextVerdict || '').length) +
          ' / ' +
          String(APP_CONFIG.maxVerdictLength || 160);
      }
      const clearAllBtn = elements.viewRoot.querySelector('[data-action="clear-all-ratings"]');
      if (clearAllBtn && saved) {
        const r = saved.record;
        clearAllBtn.hidden = (r.ratedCount || 0) === 0 && !r.verdict;
      }
    },
    onToast: (msg) => showToast(msg)
  });
}

function handleOpenShareProfileModalClick(triggerBtn) {
  const ratingsMap = getSavedRatingsMap();
  const metadataMap = getAlbumCatalogCacheMap();
  const profile = buildMusicTasteProfile(ratingsMap, metadataMap);

  if (!profile.isShareable) {
    showToast('Rate at least one album track before generating a Taste Profile card.');
    return;
  }

  openShareProfileModal({
    ratingsMap,
    metadataMap,
    triggerElement: triggerBtn,
    onToast: (msg) => showToast(msg)
  });
}

async function handleQuickDownloadProfilePng(buttonEl) {
  const ratingsMap = getSavedRatingsMap();
  const metadataMap = getAlbumCatalogCacheMap();
  const profile = buildMusicTasteProfile(ratingsMap, metadataMap);

  if (!profile.isShareable) {
    showToast('Rate at least one album track before downloading a Taste Profile card.');
    return;
  }

  const originalLabel = buttonEl.innerHTML;
  buttonEl.disabled = true;
  buttonEl.textContent = 'Generating PNG...';

  try {
    await exportTasteProfilePngDirect({
      ratingsMap,
      metadataMap,
      themeId: 'obsidian',
      onToast: (msg) => showToast(msg)
    });
  } catch (err) {
    showToast('Unable to export PNG: ' + (err.message || 'Browser error'));
  } finally {
    buttonEl.disabled = false;
    buttonEl.innerHTML = originalLabel;
  }
}

function handleOpenShareInsightsModalClick(triggerBtn) {
  const ratingsMap = getSavedRatingsMap();
  const metadataMap = getAlbumCatalogCacheMap();
  const insights = buildListeningInsights(ratingsMap, metadataMap);

  if (!insights.isShareable) {
    showToast('Rate and include at least one album track before generating an Insights card.');
    return;
  }

  openShareInsightsModal({
    ratingsMap,
    metadataMap,
    triggerElement: triggerBtn,
    onToast: (msg) => showToast(msg)
  });
}

async function handleQuickDownloadInsightsPng(buttonEl) {
  const ratingsMap = getSavedRatingsMap();
  const metadataMap = getAlbumCatalogCacheMap();
  const insights = buildListeningInsights(ratingsMap, metadataMap);

  if (!insights.isShareable) {
    showToast('Rate and include at least one album track before downloading an Insights card.');
    return;
  }

  const originalLabel = buttonEl.innerHTML;
  buttonEl.disabled = true;
  buttonEl.textContent = 'Generating PNG...';

  try {
    await exportListeningInsightsPngDirect({
      ratingsMap,
      metadataMap,
      themeId: 'obsidian',
      onToast: (msg) => showToast(msg)
    });
  } catch (err) {
    showToast('Unable to export PNG: ' + (err.message || 'Browser error'));
  } finally {
    buttonEl.disabled = false;
    buttonEl.innerHTML = originalLabel;
  }
}

function handleLibraryActionClick(buttonEl) {
  const action = buttonEl.getAttribute('data-library-action');

  if (action === 'export-json') {
    try {
      const res = downloadLibraryExportJson(
        getSavedRatingsMap(),
        getAlbumCatalogCacheMap()
      );
      showToast(
        'Exported ' +
          String(res.albumCount) +
          ' album(s) to "' +
          res.filename +
          '"'
      );
    } catch (err) {
      showToast('Unable to export library JSON: ' + (err.message || 'Error'));
    }
    return;
  }

  if (action === 'open-import-modal') {
    openImportLibraryModal({
      triggerElement: buttonEl,
      onImportSuccess: () => {
        clearDiscoverySessionCache();
        refreshHeaderCounts();
        if (state.currentView === 'library') {
          showLibraryView({ updateHash: false });
        } else if (state.currentView === 'profile') {
          showProfileView({ updateHash: false });
        } else if (state.currentView === 'insights') {
          showInsightsView({ updateHash: false });
        } else if (state.currentView === 'journal') {
          showJournalView({ updateHash: false });
        } else if (state.currentView === 'collections') {
          showCollectionsIndexView({ updateHash: false });
        } else if (state.currentView === 'collection-detail') {
          showCollectionDetailView(state.activeCollectionId, { updateHash: false });
        } else if (state.currentView === 'discover') {
          showDiscoverView({ updateHash: false });
        }
      },
      onToast: (msg) => showToast(msg)
    });
    return;
  }

  if (action === 'reset-filters') {
    state.libraryQuery = '';
    state.libraryFilter = LIBRARY_FILTER_MODES.ALL;
    showLibraryView({ updateHash: false });
    return;
  }

  if (action === 'remove-album') {
    const albumId = buttonEl.getAttribute('data-album-id');
    const albumTitle = buttonEl.getAttribute('data-album-title') || 'this album';
    if (!albumId) return;

    const confirmed = window.confirm(
      'Remove "' +
        albumTitle +
        '" from My Library?\n\nYour saved track ratings will NOT be deleted, and you can add this album back anytime from its album page.'
    );
    if (!confirmed) return;

    removeAlbumFromLibrary(albumId);
    clearDiscoverySessionCache();
    refreshHeaderCounts();
    showLibraryView({ updateHash: false });
    showToast('Removed "' + albumTitle + '" from My Library (track ratings kept).');
    return;
  }

  if (action === 'restore-all-hidden') {
    const ratingsMap = getSavedRatingsMap();
    let restored = 0;
    Object.keys(ratingsMap).forEach((id) => {
      if (ratingsMap[id]?.hiddenFromLibrary) {
        restoreAlbumToLibrary(id);
        restored += 1;
      }
    });
    refreshHeaderCounts();
    if (state.currentView === 'profile') {
      showProfileView({ updateHash: false });
    } else if (state.currentView === 'insights') {
      showInsightsView({ updateHash: false });
    } else {
      showLibraryView({ updateHash: false });
    }
    if (restored > 0) {
      showToast('Restored ' + String(restored) + ' rated album(s) to My Library.');
    }
  }
}

function handleTrackControlClick(buttonEl) {
  const action = buttonEl.getAttribute('data-track-action');
  const trackKey = buttonEl.getAttribute('data-track-key');
  if (!action || !trackKey || !state.activeAlbumId) return;

  const currentMap = getAlbumTrackRatings(state.activeAlbumId);
  const currentState = normalizeTrackState(currentMap[trackKey]);

  if (action === 'toggle-interlude') {
    applyTrackStatePatch(trackKey, { interlude: !currentState.interlude });
  } else if (action === 'toggle-include') {
    applyTrackStatePatch(trackKey, { included: !currentState.included });
  } else if (action === 'clear-rating') {
    applyTrackStatePatch(trackKey, { rating: null });
  } else if (action === 'step-up') {
    const nextRating = stepTrackRating(currentState.rating, 1);
    applyTrackStatePatch(trackKey, { rating: nextRating });
  } else if (action === 'step-down') {
    const nextRating = stepTrackRating(currentState.rating, -1);
    applyTrackStatePatch(trackKey, { rating: nextRating });
  } else if (action === 'quick-rate') {
    const baseNum = Number(buttonEl.getAttribute('data-quick-val'));
    if (!Number.isFinite(baseNum) || baseNum < 1 || baseNum > 10) return;

    let nextRating = baseNum;
    if (
      currentState.rating !== null &&
      Math.abs(currentState.rating - baseNum) < 1e-7 &&
      baseNum < 10
    ) {
      nextRating = baseNum + 0.5;
    }
    applyTrackStatePatch(trackKey, { rating: nextRating });
  }
}

function applyTrackStatePatch(trackKey, patch) {
  if (!state.activeAlbumId || !state.activeAlbumData) return;
  const { album, tracks } = state.activeAlbumData;
  const safeTracks = tracks || [];

  const result = saveTrackRatingUpdate(
    state.activeAlbumId,
    trackKey,
    patch,
    safeTracks,
    album
  );
  if (!result) return;

  if (!result.savedOk) {
    showToast('Browser storage quota reached. Some changes could not be persisted.');
  }

  const rowEl = Array.from(
    elements.viewRoot.querySelectorAll('[data-track-row]')
  ).find((el) => el.getAttribute('data-track-row') === trackKey);

  if (rowEl) {
    updateTrackRowDom(rowEl, result.trackState);
  }

  updateAlbumSummaryDom(
    elements.viewRoot,
    result.metrics,
    Boolean(result.record?.hiddenFromLibrary)
  );
  if (state.currentView === 'album' && state.activeAlbumData?.album) {
    const membership = getAlbumCollectionMembership(
      state.activeAlbumId,
      getSavedCollectionsMap()
    );
    upsertAlbumCollectionsBarDom(
      elements.viewRoot,
      state.activeAlbumData.album,
      membership
    );
  }
  updateOpenShareModalData({
    trackRatingsMap: result.record?.trackRatings || {}
  });
  clearDiscoverySessionCache();
  refreshHeaderCounts();
}

function handleResetAlbumRatings() {
  if (!state.activeAlbumId || !state.activeAlbumData) return;
  const { album, tracks, source } = state.activeAlbumData;
  clearAlbumTrackRatings(state.activeAlbumId, tracks);
  clearDiscoverySessionCache();
  closeShareReviewModal();
  refreshHeaderCounts();
  renderAlbumView(elements.viewRoot, {
    album,
    tracks,
    source,
    trackRatingsMap: {},
    verdict: '',
    journalEntry: getAlbumJournalEntry(state.activeAlbumId),
    isHiddenFromLibrary: false,
    previousView: state.previousView
  });
  const membership = getAlbumCollectionMembership(
    state.activeAlbumId,
    getSavedCollectionsMap()
  );
  upsertAlbumCollectionsBarDom(elements.viewRoot, album, membership);
  showToast('Cleared track ratings for "' + album.collectionName + '"');
}

let lastHandledRouteHash = '';

/**
 * Pure, testable route parser that maps a URL hash string to a normalized route descriptor.
 */
export function parseRouteHash(rawHash = '') {
  const hash = String(rawHash || '').trim() || '#discover';

  const albumSuffix = hash.startsWith('#album/') ? hash.slice(7).trim() : '';
  if (albumSuffix.length > 0 && !/[^0-9]/.test(albumSuffix)) {
    return {
      view: 'album',
      albumId: Number(albumSuffix),
      collectionId: null,
      canonicalHash: '#album/' + albumSuffix
    };
  }

  const colSuffix = hash.startsWith('#collection/') ? hash.slice(12).trim() : '';
  if (colSuffix.length > 0 && !/[^a-zA-Z0-9_-]/.test(colSuffix)) {
    return {
      view: 'collection-detail',
      albumId: null,
      collectionId: colSuffix,
      canonicalHash: '#collection/' + colSuffix
    };
  }

  if (hash === '#library') {
    return { view: 'library', albumId: null, collectionId: null, canonicalHash: '#library' };
  }
  if (hash === '#profile') {
    return { view: 'profile', albumId: null, collectionId: null, canonicalHash: '#profile' };
  }
  if (hash === '#insights') {
    return { view: 'insights', albumId: null, collectionId: null, canonicalHash: '#insights' };
  }
  if (hash === '#journal') {
    return { view: 'journal', albumId: null, collectionId: null, canonicalHash: '#journal' };
  }
  if (hash === '#collections') {
    return {
      view: 'collections',
      albumId: null,
      collectionId: null,
      canonicalHash: '#collections'
    };
  }

  return { view: 'discover', albumId: null, collectionId: null, canonicalHash: '#discover' };
}

/**
 * Pushes a new hash to browser history only when it differs from the current URL hash,
 * preventing duplicate history entries and redundant re-renders.
 */
function pushRouteHash(targetHash) {
  const normalizedTarget = String(targetHash || '#discover').trim() || '#discover';
  lastHandledRouteHash = normalizedTarget;
  if (typeof window !== 'undefined' && window.location.hash !== normalizedTarget) {
    window.history.pushState(null, '', normalizedTarget);
  }
}

function handleInitialRoute() {
  const currentHash =
    typeof window !== 'undefined' ? window.location.hash || '#discover' : '#discover';
  const parsed = parseRouteHash(currentHash);
  lastHandledRouteHash = currentHash;

  if (parsed.view === 'album' && parsed.albumId) {
    openAlbumInspector(parsed.albumId, { updateHash: false });
  } else if (parsed.view === 'collection-detail' && parsed.collectionId) {
    showCollectionDetailView(parsed.collectionId, { updateHash: false });
  } else if (parsed.view === 'library') {
    showLibraryView({ updateHash: false });
  } else if (parsed.view === 'profile') {
    showProfileView({ updateHash: false });
  } else if (parsed.view === 'insights') {
    showInsightsView({ updateHash: false });
  } else if (parsed.view === 'journal') {
    showJournalView({ updateHash: false });
  } else if (parsed.view === 'collections') {
    showCollectionsIndexView({ updateHash: false });
  } else {
    showDiscoverView({ updateHash: false });
  }
}

function navigateToDiscover(optionalQuery = null) {
  closeAllModals();
  stopAudioPreview();
  if (typeof optionalQuery === 'string') {
    state.query = optionalQuery;
  }
  pushRouteHash('#discover');
  showDiscoverView({ updateHash: false });
  if (typeof optionalQuery === 'string') {
    executeAlbumSearch(optionalQuery);
  }
}

function navigateToLibrary() {
  closeAllModals();
  stopAudioPreview();
  pushRouteHash('#library');
  showLibraryView({ updateHash: false });
}

function navigateToProfile() {
  closeAllModals();
  stopAudioPreview();
  pushRouteHash('#profile');
  showProfileView({ updateHash: false });
}

function navigateToInsights() {
  closeAllModals();
  stopAudioPreview();
  pushRouteHash('#insights');
  showInsightsView({ updateHash: false });
}

function navigateToJournal() {
  closeAllModals();
  stopAudioPreview();
  pushRouteHash('#journal');
  showJournalView({ updateHash: false });
}

function navigateToCollections() {
  closeAllModals();
  stopAudioPreview();
  pushRouteHash('#collections');
  showCollectionsIndexView({ updateHash: false });
}

function openCollectionDetail(collectionId) {
  closeAllModals();
  stopAudioPreview();
  state.collectionDetailQuery = '';
  state.collectionDetailSort = COLLECTION_SORT_MODES.MANUAL;
  pushRouteHash('#collection/' + String(collectionId));
  showCollectionDetailView(collectionId, { updateHash: false });
}

function showCollectionsIndexView({ updateHash = true } = {}) {
  state.currentView = 'collections';
  state.previousView = 'collections';
  if (updateHash) {
    window.history.pushState(null, '', '#collections');
  }

  updateNavSelection('collections');
  refreshHeaderCounts();
  window.scrollTo({ top: 0, behavior: 'smooth' });

  const collectionsList = getEnrichedCollectionsList(
    getSavedCollectionsMap(),
    getSavedRatingsMap(),
    getAlbumCatalogCacheMap()
  );

  renderCollectionsIndexView(elements.viewRoot, collectionsList);
}

function showCollectionDetailView(collectionId, { updateHash = true } = {}) {
  state.currentView = 'collection-detail';
  state.previousView = 'collections';
  state.activeCollectionId = String(collectionId || '').trim();

  if (updateHash && state.activeCollectionId) {
    window.history.pushState(null, '', '#collection/' + state.activeCollectionId);
  }

  updateNavSelection('collections');
  refreshHeaderCounts();
  window.scrollTo({ top: 0, behavior: 'smooth' });

  const rawCol = getCustomCollection(state.activeCollectionId);
  const ratingsMap = getSavedRatingsMap();
  const metadataMap = getAlbumCatalogCacheMap();

  const enriched = rawCol
    ? buildEnrichedCollection(
        state.activeCollectionId,
        rawCol,
        ratingsMap,
        metadataMap
      )
    : null;

  const libraryEntries = getLibraryEntries(ratingsMap, metadataMap);

  renderCollectionDetailView(
    elements.viewRoot,
    enriched,
    state,
    libraryEntries
  );
  bindCollectionDetailToolbarEvents();

  if (enriched) {
    hydrateMissingLibraryMetadata(enriched.albums);
  }
}

function bindCollectionDetailToolbarEvents() {
  const searchInput = document.getElementById('collection-detail-search-input');
  const clearBtn = document.getElementById('collection-detail-search-clear-btn');

  if (!searchInput) return;

  searchInput.addEventListener('input', (event) => {
    const val = event.target.value;
    state.collectionDetailQuery = val;
    if (clearBtn) {
      clearBtn.hidden = val.trim().length === 0;
    }
    refreshCollectionDetailInPlace();
  });

  clearBtn?.addEventListener('click', () => {
    state.collectionDetailQuery = '';
    searchInput.value = '';
    clearBtn.hidden = true;
    refreshCollectionDetailInPlace();
    searchInput.focus();
  });
}

function refreshCollectionDetailInPlace() {
  if (state.currentView !== 'collection-detail' || !state.activeCollectionId) {
    return;
  }

  const rawCol = getCustomCollection(state.activeCollectionId);
  if (!rawCol) return;

  const enriched = buildEnrichedCollection(
    state.activeCollectionId,
    rawCol,
    getSavedRatingsMap(),
    getAlbumCatalogCacheMap()
  );
  if (!enriched) return;

  const queryResult = queryCollectionAlbums(enriched, {
    query: state.collectionDetailQuery,
    sortBy: state.collectionDetailSort
  });

  const countLabel = document.getElementById('collection-detail-count-label');
  if (countLabel) {
    countLabel.textContent =
      'SHOWING ' +
      String(queryResult.visibleAlbums.length) +
      ' OF ' +
      String(enriched.albumCount) +
      ' ALBUMS';
  }

  const mountEl = document.getElementById('collection-detail-albums-mount');
  if (mountEl) {
    mountEl.innerHTML = buildCollectionDetailAlbumsHtml(enriched, queryResult);
  }
}

function showDiscoverView({ updateHash = true } = {}) {
  state.currentView = 'discover';
  state.previousView = 'discover';
  if (updateHash) {
    window.history.pushState(null, '', '#discover');
  }

  updateNavSelection('discover');
  refreshHeaderCounts();
  renderDiscoverShell(elements.viewRoot, state);
  bindSearchInputEvents();

  const mountEl = document.getElementById('discover-results-mount');
  if (mountEl) {
    renderAlbumGrid(mountEl, {
      albums: state.albums,
      query: state.query,
      savedRatingsMap: getSavedRatingsMap(),
      isFallback: state.isFallbackSearch
    });
  }

  if (!state.query || state.query.trim().length === 0) {
    loadAndRenderPersonalizedDiscovery({ forceRefresh: false });
  }
}

async function loadAndRenderPersonalizedDiscovery({ forceRefresh = false } = {}) {
  const discoveryMount = document.getElementById('personal-discovery-mount');
  if (!discoveryMount) return;

  if (state.query && state.query.trim().length > 0) {
    discoveryMount.hidden = true;
    return;
  }
  discoveryMount.hidden = false;

  const ratingsMap = getSavedRatingsMap();
  const metadataMap = getAlbumCatalogCacheMap();
  const signals = deriveDiscoverySignals(ratingsMap, metadataMap);

  if (!signals.hasRatings) {
    renderPersonalizedDiscoverySection(discoveryMount, {
      status: 'empty',
      signals,
      recommendedAlbums: []
    });
    return;
  }

  const reqId = ++state.discoveryRequestId;
  renderPersonalizedDiscoverySection(discoveryMount, {
    status: 'loading',
    signals,
    recommendedAlbums: []
  });

  const discoveryResult = await fetchPersonalizedDiscoveryAlbums(
    ratingsMap,
    metadataMap,
    searchAlbums,
    { forceRefresh }
  );

  if (reqId !== state.discoveryRequestId || state.currentView !== 'discover') {
    return;
  }

  const currentMount = document.getElementById('personal-discovery-mount');
  if (currentMount) {
    renderPersonalizedDiscoverySection(currentMount, discoveryResult);
  }
}

function showLibraryView({ updateHash = true } = {}) {
  state.currentView = 'library';
  state.previousView = 'library';
  if (updateHash) {
    window.history.pushState(null, '', '#library');
  }

  updateNavSelection('library');
  refreshHeaderCounts();
  window.scrollTo({ top: 0, behavior: 'smooth' });

  const ratingsMap = getSavedRatingsMap();
  const metadataMap = getAlbumCatalogCacheMap();
  const queryResult = queryLibrary(ratingsMap, metadataMap, {
    query: state.libraryQuery,
    filterMode: state.libraryFilter,
    sortBy: state.librarySort
  });

  renderLibraryView(elements.viewRoot, queryResult, state);
  bindLibraryToolbarEvents();
  hydrateMissingLibraryMetadata(queryResult.allEntries);
}

function showProfileView({ updateHash = true } = {}) {
  state.currentView = 'profile';
  state.previousView = 'profile';
  if (updateHash) {
    window.history.pushState(null, '', '#profile');
  }

  updateNavSelection('profile');
  refreshHeaderCounts();
  window.scrollTo({ top: 0, behavior: 'smooth' });

  const ratingsMap = getSavedRatingsMap();
  const metadataMap = getAlbumCatalogCacheMap();
  const profile = buildMusicTasteProfile(ratingsMap, metadataMap);

  renderProfileView(elements.viewRoot, profile);
  hydrateMissingLibraryMetadata(profile.allEntries);
}

function showInsightsView({ updateHash = true } = {}) {
  state.currentView = 'insights';
  state.previousView = 'insights';
  if (updateHash) {
    window.history.pushState(null, '', '#insights');
  }

  updateNavSelection('insights');
  refreshHeaderCounts();
  window.scrollTo({ top: 0, behavior: 'smooth' });

  const ratingsMap = getSavedRatingsMap();
  const metadataMap = getAlbumCatalogCacheMap();
  const insights = buildListeningInsights(ratingsMap, metadataMap);

  renderInsightsView(elements.viewRoot, insights, state);
  hydrateMissingLibraryMetadata(insights.allEntries);
}

function showJournalView({ updateHash = true } = {}) {
  state.currentView = 'journal';
  state.previousView = 'journal';
  if (updateHash) {
    window.history.pushState(null, '', '#journal');
  }

  updateNavSelection('journal');
  refreshHeaderCounts();
  window.scrollTo({ top: 0, behavior: 'smooth' });

  const journalMap = getSavedJournalMap();
  const ratingsMap = getSavedRatingsMap();
  const metadataMap = getAlbumCatalogCacheMap();
  const libraryEntries = getLibraryEntries(ratingsMap, metadataMap);

  const queryResult = queryJournal(journalMap, ratingsMap, metadataMap, {
    query: state.journalQuery,
    moodTag: state.journalMoodFilter,
    ratingFilter: state.journalRatingFilter,
    sortBy: state.journalSort
  });

  renderJournalView(elements.viewRoot, queryResult, state, libraryEntries);
  bindJournalToolbarEvents();
  hydrateMissingLibraryMetadata(queryResult.allEntries);
}

function bindJournalToolbarEvents() {
  const searchInput = document.getElementById('journal-search-input');
  const clearBtn = document.getElementById('journal-search-clear-btn');

  if (!searchInput) return;

  searchInput.addEventListener('input', (event) => {
    const val = event.target.value;
    state.journalQuery = val;
    if (clearBtn) {
      clearBtn.hidden = val.trim().length === 0;
    }
    refreshJournalViewInPlace();
  });

  clearBtn?.addEventListener('click', () => {
    state.journalQuery = '';
    searchInput.value = '';
    clearBtn.hidden = true;
    refreshJournalViewInPlace();
    searchInput.focus();
  });
}

function refreshJournalViewInPlace() {
  if (state.currentView !== 'journal') return;

  const journalMap = getSavedJournalMap();
  const ratingsMap = getSavedRatingsMap();
  const metadataMap = getAlbumCatalogCacheMap();
  const libraryEntries = getLibraryEntries(ratingsMap, metadataMap);

  const queryResult = queryJournal(journalMap, ratingsMap, metadataMap, {
    query: state.journalQuery,
    moodTag: state.journalMoodFilter,
    ratingFilter: state.journalRatingFilter,
    sortBy: state.journalSort
  });

  const resultsMount = document.getElementById('journal-results-mount');
  renderJournalResultsMount(resultsMount, queryResult, state, libraryEntries);
}

function refreshInsightsArtistRankingsInPlace() {
  if (state.currentView !== 'insights') return;

  const ratingsMap = getSavedRatingsMap();
  const metadataMap = getAlbumCatalogCacheMap();
  const insights = buildListeningInsights(ratingsMap, metadataMap);

  const filterButtons = document.querySelectorAll('[data-insights-artist-filter]');
  filterButtons.forEach((btn) => {
    const mode = btn.getAttribute('data-insights-artist-filter');
    const isActive = mode === state.insightsArtistFilter;
    btn.classList.toggle('is-active', isActive);
    btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });

  const mountEl = document.getElementById('insights-artist-rankings-mount');
  if (mountEl) {
    mountEl.innerHTML = buildArtistRankingsListHtml(
      insights.artistRankings,
      state.insightsArtistFilter
    );
  }
}

function bindLibraryToolbarEvents() {
  const searchInput = document.getElementById('library-search-input');
  const clearBtn = document.getElementById('library-search-clear-btn');

  if (!searchInput) return;

  searchInput.addEventListener('input', (event) => {
    const val = event.target.value;
    state.libraryQuery = val;
    if (clearBtn) {
      clearBtn.hidden = val.trim().length === 0;
    }
    refreshLibraryViewInPlace();
  });

  clearBtn?.addEventListener('click', () => {
    state.libraryQuery = '';
    searchInput.value = '';
    clearBtn.hidden = true;
    refreshLibraryViewInPlace();
    searchInput.focus();
  });
}

function refreshLibraryViewInPlace() {
  if (state.currentView !== 'library') return;

  const ratingsMap = getSavedRatingsMap();
  const metadataMap = getAlbumCatalogCacheMap();
  const queryResult = queryLibrary(ratingsMap, metadataMap, {
    query: state.libraryQuery,
    filterMode: state.libraryFilter,
    sortBy: state.librarySort
  });

  const summaryMount = document.getElementById('library-summary-mount');
  if (summaryMount) {
    summaryMount.innerHTML = buildLibrarySummaryHtml(queryResult.summary);
  }

  const filterPills = document.querySelectorAll('[data-library-filter]');
  filterPills.forEach((btn) => {
    const mode = btn.getAttribute('data-library-filter');
    const isActive = mode === state.libraryFilter;
    btn.classList.toggle('is-active', isActive);
    btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    if (mode === LIBRARY_FILTER_MODES.ALL) {
      btn.textContent = 'All Rated (' + String(queryResult.summary.totalAlbums) + ')';
    } else if (mode === LIBRARY_FILTER_MODES.COMPLETE) {
      btn.textContent = 'Full LP Rated (' + String(queryResult.summary.completeAlbumsCount) + ')';
    } else if (mode === LIBRARY_FILTER_MODES.INCOMPLETE) {
      btn.textContent = 'In Progress (' + String(queryResult.summary.incompleteAlbumsCount) + ')';
    }
  });

  const resultsMount = document.getElementById('library-results-mount');
  renderLibraryResultsMount(resultsMount, queryResult, state);
}

async function hydrateMissingLibraryMetadata(entries = []) {
  const missing = entries.filter((item) => !item.hasFullMetadata && Number(item.collectionId) > 0);
  if (missing.length === 0) return;

  for (const entry of missing) {
    try {
      const { album, tracks } = await fetchAlbumTracklist(entry.collectionId);
      saveAlbumMetadataToCache(album, tracks.length);
      if (state.currentView === 'library') {
        refreshLibraryViewInPlace();
      } else if (state.currentView === 'profile') {
        const ratingsMap = getSavedRatingsMap();
        const metadataMap = getAlbumCatalogCacheMap();
        renderProfileView(elements.viewRoot, buildMusicTasteProfile(ratingsMap, metadataMap));
      } else if (state.currentView === 'insights') {
        const ratingsMap = getSavedRatingsMap();
        const metadataMap = getAlbumCatalogCacheMap();
        renderInsightsView(
          elements.viewRoot,
          buildListeningInsights(ratingsMap, metadataMap),
          state
        );
      } else if (state.currentView === 'journal') {
        refreshJournalViewInPlace();
      } else if (state.currentView === 'collection-detail') {
        refreshCollectionDetailInPlace();
      }
    } catch {
      // Keep graceful fallback card if offline
    }
  }
}

function bindSearchInputEvents() {
  const searchInput = document.getElementById('album-search-input');
  const clearBtn = document.getElementById('search-clear-btn');

  if (!searchInput) return;

  searchInput.addEventListener('input', (event) => {
    const value = event.target.value;
    state.query = value;

    if (clearBtn) {
      clearBtn.hidden = value.trim().length === 0;
    }

    if (state.searchTimer) {
      window.clearTimeout(state.searchTimer);
    }

    state.searchTimer = window.setTimeout(() => {
      executeAlbumSearch(value);
    }, APP_CONFIG.searchDebounceMs);
  });

  searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (state.searchTimer) {
        window.clearTimeout(state.searchTimer);
      }
      executeAlbumSearch(searchInput.value);
    }
  });

  clearBtn?.addEventListener('click', () => {
    setSearchQueryAndRun('');
    searchInput.focus();
  });
}

function setSearchQueryAndRun(newQuery) {
  state.query = newQuery;
  renderDiscoverShell(elements.viewRoot, state);
  bindSearchInputEvents();
  executeAlbumSearch(newQuery);
}

async function executeAlbumSearch(rawQuery) {
  const trimmed = String(rawQuery || '').trim();
  const requestId = ++state.searchRequestId;
  const mountEl = document.getElementById('discover-results-mount');
  const discoveryMount = document.getElementById('personal-discovery-mount');
  const spinner = document.getElementById('search-loading-spinner');

  if (!trimmed) {
    state.albums = CURATED_ALBUMS;
    state.isFallbackSearch = false;
    if (spinner) spinner.hidden = true;
    if (discoveryMount) {
      discoveryMount.hidden = false;
      loadAndRenderPersonalizedDiscovery({ forceRefresh: false });
    }
    if (mountEl) {
      renderAlbumGrid(mountEl, {
        albums: CURATED_ALBUMS,
        query: '',
        savedRatingsMap: getSavedRatingsMap(),
        isFallback: false
      });
    }
    return;
  }

  if (discoveryMount) {
    discoveryMount.hidden = true;
  }
  if (spinner) spinner.hidden = false;
  if (mountEl) {
    renderDiscoverSkeletons(mountEl, trimmed);
  }

  try {
    const { albums, source } = await searchAlbums(trimmed);
    if (requestId !== state.searchRequestId) return;

    state.albums = albums;
    state.isFallbackSearch = source === 'fallback';
    saveRecentSearch(trimmed);
    updateApiStatusIndicator(source);

    if (mountEl) {
      renderAlbumGrid(mountEl, {
        albums,
        query: trimmed,
        savedRatingsMap: getSavedRatingsMap(),
        isFallback: state.isFallbackSearch
      });
    }
  } catch (err) {
    if (requestId !== state.searchRequestId) return;
    updateApiStatusIndicator('fallback');
    if (mountEl) {
      renderDiscoverError(mountEl, trimmed, err.message);
    }
  } finally {
    if (requestId === state.searchRequestId && spinner) {
      spinner.hidden = true;
    }
  }
}

async function openAlbumInspector(collectionId, { updateHash = true } = {}) {
  closeAllModals();
  stopAudioPreview();
  if (
    state.currentView === 'discover' ||
    state.currentView === 'library' ||
    state.currentView === 'profile' ||
    state.currentView === 'insights' ||
    state.currentView === 'journal' ||
    state.currentView === 'collections' ||
    state.currentView === 'collection-detail'
  ) {
    state.previousView = state.currentView;
  }
  state.currentView = 'album';
  state.activeAlbumId = Number(collectionId);

  if (updateHash) {
    pushRouteHash('#album/' + String(collectionId));
  }

  if (elements.navInspectorBtn) {
    elements.navInspectorBtn.hidden = false;
  }
  updateNavSelection('inspector');
  window.scrollTo({ top: 0, behavior: 'smooth' });

  renderAlbumLoadingState(elements.viewRoot);

  try {
    const { album, tracks, source } = await fetchAlbumTracklist(collectionId);
    state.activeAlbumData = { album, tracks, source };

    saveAlbumMetadataToCache(album, tracks.length);

    if (elements.navInspectorLabel) {
      elements.navInspectorLabel.textContent = album.collectionName;
    }
    updateApiStatusIndicator(source);

    const savedRecord = getSavedAlbumRating(collectionId);
    const savedTrackRatings = getAlbumTrackRatings(collectionId);
    const savedVerdict = getAlbumVerdict(collectionId);
    const savedJournal = getAlbumJournalEntry(collectionId);

    renderAlbumView(elements.viewRoot, {
      album,
      tracks,
      source,
      trackRatingsMap: savedTrackRatings,
      verdict: savedVerdict,
      journalEntry: savedJournal,
      isHiddenFromLibrary: Boolean(savedRecord?.hiddenFromLibrary),
      previousView: state.previousView
    });

    const membership = getAlbumCollectionMembership(
      collectionId,
      getSavedCollectionsMap()
    );
    upsertAlbumCollectionsBarDom(elements.viewRoot, album, membership);
  } catch (err) {
    renderAlbumErrorState(
      elements.viewRoot,
      err.message || 'Could not retrieve album tracklist from iTunes Lookup API.',
      collectionId
    );
  }
}

function refreshHeaderCounts() {
  const ratingsMap = getSavedRatingsMap();
  const metadataMap = getAlbumCatalogCacheMap();

  if (elements.navLibraryCount) {
    const { summary } = queryLibrary(ratingsMap, metadataMap);
    if (summary.totalAlbums > 0) {
      elements.navLibraryCount.textContent = String(summary.totalAlbums);
      elements.navLibraryCount.hidden = false;
    } else {
      elements.navLibraryCount.textContent = '0';
      elements.navLibraryCount.hidden = true;
    }
  }

  if (elements.navJournalCount) {
    const journalMap = getSavedJournalMap();
    const journalCount = Object.keys(journalMap).length;
    if (journalCount > 0) {
      elements.navJournalCount.textContent = String(journalCount);
      elements.navJournalCount.hidden = false;
    } else {
      elements.navJournalCount.textContent = '0';
      elements.navJournalCount.hidden = true;
    }
  }

  if (elements.navCollectionsCount) {
    const collectionsMap = getSavedCollectionsMap();
    const colCount = Object.keys(collectionsMap).length;
    if (colCount > 0) {
      elements.navCollectionsCount.textContent = String(colCount);
      elements.navCollectionsCount.hidden = false;
    } else {
      elements.navCollectionsCount.textContent = '0';
      elements.navCollectionsCount.hidden = true;
    }
  }
}

function toggleTrackPreview(buttonEl) {
  const previewUrl = buttonEl.getAttribute('data-preview-url');
  const trackTitle = buttonEl.getAttribute('data-track-title') || 'Track';
  if (!previewUrl || !state.audioPlayer) return;

  if (state.activePreviewBtn === buttonEl && !state.audioPlayer.paused) {
    stopAudioPreview();
    return;
  }

  stopAudioPreview();
  state.activePreviewBtn = buttonEl;
  buttonEl.classList.add('is-playing');
  const iconEl = buttonEl.querySelector('.preview-btn-icon');
  const labelEl = buttonEl.querySelector('.preview-btn-label');
  if (iconEl) iconEl.innerHTML = '&#9632;';
  if (labelEl) labelEl.textContent = 'STOP';

  state.audioPlayer.src = previewUrl;
  state.audioPlayer.play().catch(() => {
    resetAudioPreviewUi();
    showToast('Preview unavailable for "' + trackTitle + '"');
  });
}

function stopAudioPreview() {
  if (state.audioPlayer && !state.audioPlayer.paused) {
    state.audioPlayer.pause();
  }
  resetAudioPreviewUi();
}

function resetAudioPreviewUi() {
  if (state.activePreviewBtn) {
    state.activePreviewBtn.classList.remove('is-playing');
    const iconEl = state.activePreviewBtn.querySelector('.preview-btn-icon');
    const labelEl = state.activePreviewBtn.querySelector('.preview-btn-label');
    if (iconEl) iconEl.innerHTML = '&#9654;';
    if (labelEl) labelEl.textContent = '30s';
    state.activePreviewBtn = null;
  }
}

function updateNavSelection(activeTab) {
  elements.navDiscoverBtn?.classList.toggle('is-active', activeTab === 'discover');
  elements.navLibraryBtn?.classList.toggle('is-active', activeTab === 'library');
  elements.navProfileBtn?.classList.toggle('is-active', activeTab === 'profile');
  elements.navInsightsBtn?.classList.toggle('is-active', activeTab === 'insights');
  elements.navJournalBtn?.classList.toggle('is-active', activeTab === 'journal');
  elements.navCollectionsBtn?.classList.toggle('is-active', activeTab === 'collections');
  elements.navInspectorBtn?.classList.toggle('is-active', activeTab === 'inspector');
}

function updateApiStatusIndicator(source) {
  if (!elements.apiStatusDot || !elements.apiStatusText) return;
  if (source === 'fallback') {
    elements.apiStatusDot.className = 'status-dot status-dot--fallback';
    elements.apiStatusText.textContent = 'ARCHIVE FALLBACK';
  } else {
    elements.apiStatusDot.className = 'status-dot status-dot--live';
    elements.apiStatusText.textContent = 'CATALOG LIVE';
  }
}

export function showToast(message) {
  if (!elements.toastRegion) return;
  const toast = document.createElement('div');
  toast.className = 'toast-item';
  toast.textContent = message;
  elements.toastRegion.appendChild(toast);

  window.setTimeout(() => {
    toast.remove();
  }, 3200);
}

if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
  document.addEventListener('DOMContentLoaded', initApp);
}