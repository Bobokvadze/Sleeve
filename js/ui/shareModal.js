/**
 * RATEPLAY - Share Card Modal Controller (Phases 5, 6, 7 & 9B)
 * Supports:
 * 1. Album Review 1080x1920 Social Card ('album' mode)
 * 2. Music Taste Profile 1080x1920 Social Card ('profile' mode)
 * 3. Listening Insights 1080x1920 Social Card ('insights' mode)
 * 4. Custom & Smart Collection 1080x1920 Poster ('collection' mode)
 */

import { APP_CONFIG } from '../config.js';
import {
  CARD_THEMES,
  CARD_WIDTH,
  CARD_HEIGHT,
  generateReviewCardOnCanvas,
  generateTasteProfileCardOnCanvas,
  generateListeningInsightsCardOnCanvas,
  generateCollectionPosterOnCanvas,
  downloadCanvasAsPng
} from '../canvas-card.js';
import { getCollectionThemeMeta } from '../collections.js';
import { escapeHtml } from './discoverView.js';

let modalState = {
  isOpen: false,
  mode: 'album', // 'album' | 'profile' | 'insights' | 'collection'
  themeId: 'obsidian',
  album: null,
  tracks: [],
  trackRatingsMap: {},
  verdict: '',
  collectionId: null,
  collection: null,
  ratingsMap: {},
  metadataMap: {},
  journalMap: {},
  lastFilename: 'RATEPLAY - Album Review.png',
  renderToken: 0,
  triggerElement: null,
  onVerdictChange: null,
  onToast: null
};

function ensureModalMount() {
  let root = document.getElementById('share-modal-backdrop');
  if (root) return root;

  root = document.createElement('div');
  root.id = 'share-modal-backdrop';
  root.className = 'share-modal-backdrop';
  root.hidden = true;
  root.setAttribute('aria-hidden', 'true');

  const themeButtonsHtml = Object.values(CARD_THEMES)
    .map((th) => {
      return (
        '<button type="button" class="share-theme-btn" data-share-theme="' +
        escapeHtml(th.id) +
        '" aria-pressed="false">' +
        '<span class="share-theme-swatch share-theme-swatch--' +
        escapeHtml(th.id) +
        '" aria-hidden="true"></span>' +
        '<span class="share-theme-btn__copy">' +
        '<span class="share-theme-btn__name">' +
        escapeHtml(th.name) +
        '</span>' +
        '<span class="share-theme-btn__desc">' +
        escapeHtml(th.tagline) +
        '</span>' +
        '</span>' +
        '</button>'
      );
    })
    .join('');

  root.innerHTML =
    '<div class="share-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="share-modal-title" aria-describedby="share-card-sr-summary" tabindex="-1">' +
    '<header class="share-modal__header">' +
    '<div>' +
    '<span class="share-modal__eyebrow" id="share-modal-eyebrow">1080\u00D71920 STORY GRAPHIC // NATIVE CANVAS</span>' +
    '<h2 class="share-modal__title" id="share-modal-title">Share Album Review Card</h2>' +
    '</div>' +
    '<button type="button" class="btn btn-secondary share-modal__close-btn" data-share-action="close-modal" aria-label="Close Share modal">&times; Close</button>' +
    '</header>' +
    '<div class="share-modal__body">' +
    '<div class="share-preview-stage">' +
    '<div class="share-canvas-frame">' +
    '<canvas id="share-review-canvas" width="' +
    String(CARD_WIDTH) +
    '" height="' +
    String(CARD_HEIGHT) +
    '" aria-label="Generated 1080 by 1920 social card preview"></canvas>' +
    '<div id="share-canvas-loading" class="share-canvas-loading" hidden>Rendering card&hellip;</div>' +
    '</div>' +
    '<p id="share-card-sr-summary" class="sr-only"></p>' +
    '</div>' +
    '<aside class="share-controls-panel">' +
    '<div class="share-control-group">' +
    '<span class="share-control-label">1. Select Editorial Theme</span>' +
    '<div class="share-theme-list" role="group" aria-label="Card visual theme">' +
    themeButtonsHtml +
    '</div>' +
    '</div>' +
    '<div class="share-control-group" id="share-verdict-control-group">' +
    '<div class="share-control-label-row">' +
    '<label for="share-modal-verdict-input" class="share-control-label">2. Short Verdict (Optional)</label>' +
    '<span id="share-modal-verdict-count" class="share-verdict-counter">0 / ' +
    String(APP_CONFIG.maxVerdictLength || 160) +
    '</span>' +
    '</div>' +
    '<textarea id="share-modal-verdict-input" class="share-verdict-textarea" rows="3" maxlength="' +
    String(APP_CONFIG.maxVerdictLength || 160) +
    '" placeholder="Add a concise one-line verdict for the card (leave blank to omit)..."></textarea>' +
    '<span class="share-control-hint">Omitted automatically on the exported graphic when left blank.</span>' +
    '</div>' +
    '<div class="share-control-group share-export-box">' +
    '<div class="share-spec-line">' +
    '<span>OUTPUT FORMAT</span>' +
    '<strong>1080 \u00D7 1920 PNG (9:16)</strong>' +
    '</div>' +
    '<div class="share-spec-line">' +
    '<span>FILE NAME</span>' +
    '<strong id="share-filename-preview">RATEPLAY - Album.png</strong>' +
    '</div>' +
    '<div class="share-modal__actions">' +
    '<button type="button" class="btn btn-primary share-download-btn" id="share-download-png-btn" data-share-action="download-png">' +
    '<span>Download PNG</span>' +
    '</button>' +
    '<button type="button" class="btn btn-secondary" data-share-action="close-modal">Done</button>' +
    '</div>' +
    '</div>' +
    '</aside>' +
    '</div>' +
    '</div>';

  document.body.appendChild(root);
  bindModalDomEvents(root);
  return root;
}

function bindModalDomEvents(root) {
  root.addEventListener('click', (event) => {
    if (event.target === root) {
      closeShareReviewModal();
      return;
    }

    const actionBtn = event.target.closest('[data-share-action]');
    if (actionBtn) {
      const action = actionBtn.getAttribute('data-share-action');
      if (action === 'close-modal') {
        closeShareReviewModal();
      } else if (action === 'download-png') {
        handleDownloadPngClick(actionBtn);
      }
      return;
    }

    const themeBtn = event.target.closest('[data-share-theme]');
    if (themeBtn) {
      const nextTheme = themeBtn.getAttribute('data-share-theme') || 'obsidian';
      if (modalState.themeId !== nextTheme) {
        modalState.themeId = nextTheme;
        syncThemeButtonsUi(root);
        scheduleModalCanvasRedraw();
      }
    }
  });

  const verdictInput = root.querySelector('#share-modal-verdict-input');
  if (verdictInput) {
    verdictInput.addEventListener('input', (event) => {
      if (modalState.mode !== 'album') return;
      const val = event.target.value || '';
      modalState.verdict = val;
      updateVerdictCounterUi(root, val);
      if (typeof modalState.onVerdictChange === 'function') {
        modalState.onVerdictChange(val);
      }
      scheduleModalCanvasRedraw();
    });
  }

  window.addEventListener('keydown', (event) => {
    if (!modalState.isOpen) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      closeShareReviewModal();
      return;
    }

    if (event.key === 'Tab') {
      trapFocusInsideModal(event, root);
    }
  });
}

function trapFocusInsideModal(event, root) {
  const dialog = root.querySelector('.share-modal-dialog');
  if (!dialog) return;

  const focusable = Array.from(
    dialog.querySelectorAll(
      'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
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

function syncThemeButtonsUi(root) {
  const buttons = root.querySelectorAll('[data-share-theme]');
  buttons.forEach((btn) => {
    const id = btn.getAttribute('data-share-theme');
    const active = id === modalState.themeId;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}

function updateVerdictCounterUi(root, text) {
  const counterEl = root.querySelector('#share-modal-verdict-count');
  if (!counterEl) return;
  const maxLen = APP_CONFIG.maxVerdictLength || 160;
  const len = String(text || '').length;
  counterEl.textContent = String(len) + ' / ' + String(maxLen);
}

function updateAccessibleCardSummary(root, payload) {
  const srEl = root.querySelector('#share-card-sr-summary');
  if (!srEl) return;

  if (modalState.mode === 'collection') {
    srEl.textContent =
      'RATEPLAY Collection Poster for ' +
      payload.collectionTitle +
      '. ' +
      String(payload.albumCount) +
      ' albums, average score ' +
      payload.formattedAverageScore +
      '.';
    return;
  }

  if (modalState.mode === 'insights') {
    srEl.textContent =
      'RATEPLAY Listening Insights card. Total rated albums: ' +
      String(payload.totalRatedAlbums) +
      '. Average rating: ' +
      payload.formattedAverageScore +
      '. Median rating: ' +
      payload.formattedMedianScore +
      '. ' +
      payload.dnaHeadline;
    return;
  }

  if (modalState.mode === 'profile') {
    const topAlb = payload.topAlbums[0]?.title || 'None';
    const topArt = payload.topArtists[0]?.artistName || 'None';
    srEl.textContent =
      'RATEPLAY Music Taste Profile card. Total rated albums: ' +
      String(payload.totalRatedAlbums) +
      '. Average rating: ' +
      payload.formattedAverageRating +
      ' out of 10 (' +
      payload.averageTierLabel +
      '). Top album: ' +
      topAlb +
      '. Most rated artist: ' +
      topArt +
      '.';
    return;
  }

  const standoutText = payload.standoutHighlight
    ? 'Standout track: ' + payload.standoutHighlight.primaryLine + ' (' + payload.standoutHighlight.scoreText + '). '
    : '';
  const lowestText = payload.lowestHighlight
    ? 'Lowest-rated track: ' + payload.lowestHighlight.primaryLine + ' (' + payload.lowestHighlight.scoreText + '). '
    : '';
  const verdictText = payload.hasVerdict ? 'Verdict: ' + payload.verdict : '';

  srEl.textContent =
    'RATEPLAY review card for ' +
    payload.albumTitle +
    ' by ' +
    payload.artistName +
    '. Overall score: ' +
    payload.formattedScore +
    ' out of 10 (' +
    payload.tierLabel +
    '). ' +
    String(payload.scoredCount) +
    ' tracks scored. ' +
    standoutText +
    lowestText +
    verdictText;
}

async function scheduleModalCanvasRedraw() {
  if (!modalState.isOpen) return;
  const root = document.getElementById('share-modal-backdrop');
  if (!root) return;

  const canvas = root.querySelector('#share-review-canvas');
  const loadingEl = root.querySelector('#share-canvas-loading');
  const filenameEl = root.querySelector('#share-filename-preview');
  const downloadBtn = root.querySelector('#share-download-png-btn');

  if (!canvas) return;

  const token = ++modalState.renderToken;
  if (loadingEl) loadingEl.hidden = false;

  try {
    let payload = null;
    if (modalState.mode === 'collection') {
      const res = await generateCollectionPosterOnCanvas(canvas, {
        collectionId: modalState.collectionId,
        collection: modalState.collection,
        ratingsMap: modalState.ratingsMap,
        metadataMap: modalState.metadataMap,
        journalMap: modalState.journalMap,
        themeId: modalState.themeId
      });
      payload = res.payload;
    } else if (modalState.mode === 'insights') {
      const res = await generateListeningInsightsCardOnCanvas(canvas, {
        ratingsMap: modalState.ratingsMap,
        metadataMap: modalState.metadataMap,
        themeId: modalState.themeId
      });
      payload = res.payload;
    } else if (modalState.mode === 'profile') {
      const res = await generateTasteProfileCardOnCanvas(canvas, {
        ratingsMap: modalState.ratingsMap,
        metadataMap: modalState.metadataMap,
        themeId: modalState.themeId
      });
      payload = res.payload;
    } else {
      const res = await generateReviewCardOnCanvas(canvas, {
        album: modalState.album,
        tracks: modalState.tracks,
        trackRatingsMap: modalState.trackRatingsMap,
        verdict: modalState.verdict,
        themeId: modalState.themeId
      });
      payload = res.payload;
    }

    if (token !== modalState.renderToken || !payload) return;

    modalState.lastFilename = payload.filename;
    if (filenameEl) {
      filenameEl.textContent = payload.filename;
    }
    if (downloadBtn) {
      downloadBtn.disabled = !payload.isShareable;
    }
    updateAccessibleCardSummary(root, payload);
  } catch (err) {
    console.warn('[RATEPLAY Share Modal] Canvas render error:', err);
  } finally {
    if (token === modalState.renderToken && loadingEl) {
      loadingEl.hidden = true;
    }
  }
}

async function handleDownloadPngClick(buttonEl) {
  const root = document.getElementById('share-modal-backdrop');
  const canvas = root?.querySelector('#share-review-canvas');
  if (!canvas) return;

  const prevText = buttonEl.textContent;
  buttonEl.disabled = true;
  buttonEl.textContent = 'Exporting PNG...';

  try {
    if (modalState.mode === 'collection') {
      await generateCollectionPosterOnCanvas(canvas, {
        collectionId: modalState.collectionId,
        collection: modalState.collection,
        ratingsMap: modalState.ratingsMap,
        metadataMap: modalState.metadataMap,
        journalMap: modalState.journalMap,
        themeId: modalState.themeId
      });
    } else if (modalState.mode === 'insights') {
      await generateListeningInsightsCardOnCanvas(canvas, {
        ratingsMap: modalState.ratingsMap,
        metadataMap: modalState.metadataMap,
        themeId: modalState.themeId
      });
    } else if (modalState.mode === 'profile') {
      await generateTasteProfileCardOnCanvas(canvas, {
        ratingsMap: modalState.ratingsMap,
        metadataMap: modalState.metadataMap,
        themeId: modalState.themeId
      });
    } else {
      await generateReviewCardOnCanvas(canvas, {
        album: modalState.album,
        tracks: modalState.tracks,
        trackRatingsMap: modalState.trackRatingsMap,
        verdict: modalState.verdict,
        themeId: modalState.themeId
      });
    }

    const result = await downloadCanvasAsPng(canvas, modalState.lastFilename);
    if (typeof modalState.onToast === 'function') {
      modalState.onToast('Downloaded "' + result.filename + '"');
    }
  } catch (err) {
    if (typeof modalState.onToast === 'function') {
      modalState.onToast('Unable to export PNG: ' + (err.message || 'Browser restriction'));
    }
  } finally {
    buttonEl.disabled = false;
    buttonEl.textContent = prevText || 'Download PNG';
  }
}

function configureModalHeaderAndControls(root, mode) {
  const titleEl = root.querySelector('#share-modal-title');
  const eyebrowEl = root.querySelector('#share-modal-eyebrow');
  const verdictGroup = root.querySelector('#share-verdict-control-group');

  if (mode === 'collection') {
    if (eyebrowEl) {
      eyebrowEl.textContent = '1080\u00D71920 COLLECTION POSTER // NATIVE CANVAS';
    }
    if (titleEl) {
      titleEl.textContent = 'Share Collection Poster';
    }
    if (verdictGroup) {
      verdictGroup.hidden = true;
    }
  } else if (mode === 'insights') {
    if (eyebrowEl) {
      eyebrowEl.textContent = '1080\u00D71920 LISTENING INSIGHTS GRAPHIC // NATIVE CANVAS';
    }
    if (titleEl) {
      titleEl.textContent = 'Share Listening Insights Card';
    }
    if (verdictGroup) {
      verdictGroup.hidden = true;
    }
  } else if (mode === 'profile') {
    if (eyebrowEl) {
      eyebrowEl.textContent = '1080\u00D71920 TASTE PROFILE GRAPHIC // NATIVE CANVAS';
    }
    if (titleEl) {
      titleEl.textContent = 'Share Music Taste Profile Card';
    }
    if (verdictGroup) {
      verdictGroup.hidden = true;
    }
  } else {
    if (eyebrowEl) {
      eyebrowEl.textContent = '1080\u00D71920 STORY GRAPHIC // NATIVE CANVAS';
    }
    if (titleEl) {
      titleEl.textContent = 'Share Album Review Card';
    }
    if (verdictGroup) {
      verdictGroup.hidden = false;
    }
  }
}

export function openShareReviewModal({
  album,
  tracks,
  trackRatingsMap,
  verdict = '',
  triggerElement = null,
  onVerdictChange = null,
  onToast = null
}) {
  const root = ensureModalMount();

  modalState.isOpen = true;
  modalState.mode = 'album';
  modalState.album = album;
  modalState.tracks = Array.isArray(tracks) ? tracks : [];
  modalState.trackRatingsMap = trackRatingsMap || {};
  modalState.verdict = verdict || '';
  modalState.triggerElement = triggerElement || document.activeElement;
  modalState.onVerdictChange = onVerdictChange;
  modalState.onToast = onToast;

  configureModalHeaderAndControls(root, 'album');

  const verdictInput = root.querySelector('#share-modal-verdict-input');
  if (verdictInput) {
    verdictInput.value = modalState.verdict;
  }
  updateVerdictCounterUi(root, modalState.verdict);
  syncThemeButtonsUi(root);

  root.hidden = false;
  root.setAttribute('aria-hidden', 'false');
  document.body.classList.add('has-open-modal');

  scheduleModalCanvasRedraw();

  const downloadBtn = root.querySelector('#share-download-png-btn');
  window.setTimeout(() => {
    downloadBtn?.focus();
  }, 30);
}

export function openShareProfileModal({
  ratingsMap = {},
  metadataMap = {},
  triggerElement = null,
  onToast = null
}) {
  const root = ensureModalMount();

  modalState.isOpen = true;
  modalState.mode = 'profile';
  modalState.ratingsMap = ratingsMap || {};
  modalState.metadataMap = metadataMap || {};
  modalState.triggerElement = triggerElement || document.activeElement;
  modalState.onVerdictChange = null;
  modalState.onToast = onToast;

  configureModalHeaderAndControls(root, 'profile');
  syncThemeButtonsUi(root);

  root.hidden = false;
  root.setAttribute('aria-hidden', 'false');
  document.body.classList.add('has-open-modal');

  scheduleModalCanvasRedraw();

  const downloadBtn = root.querySelector('#share-download-png-btn');
  window.setTimeout(() => {
    downloadBtn?.focus();
  }, 30);
}

export function openShareInsightsModal({
  ratingsMap = {},
  metadataMap = {},
  triggerElement = null,
  onToast = null
}) {
  const root = ensureModalMount();

  modalState.isOpen = true;
  modalState.mode = 'insights';
  modalState.ratingsMap = ratingsMap || {};
  modalState.metadataMap = metadataMap || {};
  modalState.triggerElement = triggerElement || document.activeElement;
  modalState.onVerdictChange = null;
  modalState.onToast = onToast;

  configureModalHeaderAndControls(root, 'insights');
  syncThemeButtonsUi(root);

  root.hidden = false;
  root.setAttribute('aria-hidden', 'false');
  document.body.classList.add('has-open-modal');

  scheduleModalCanvasRedraw();

  const downloadBtn = root.querySelector('#share-download-png-btn');
  window.setTimeout(() => {
    downloadBtn?.focus();
  }, 30);
}

export function openShareCollectionPosterModal({
  collectionId = null,
  collection = null,
  ratingsMap = {},
  metadataMap = {},
  journalMap = {},
  triggerElement = null,
  onToast = null
}) {
  const root = ensureModalMount();

  const colTheme = collection?.theme || 'obsidian';
  const themeMeta = getCollectionThemeMeta(colTheme);

  modalState.isOpen = true;
  modalState.mode = 'collection';
  modalState.themeId = themeMeta.canvasThemeId || 'obsidian';
  modalState.collectionId = collectionId || collection?.id || null;
  modalState.collection = collection || null;
  modalState.ratingsMap = ratingsMap || {};
  modalState.metadataMap = metadataMap || {};
  modalState.journalMap = journalMap || {};
  modalState.triggerElement = triggerElement || document.activeElement;
  modalState.onVerdictChange = null;
  modalState.onToast = onToast;

  configureModalHeaderAndControls(root, 'collection');
  syncThemeButtonsUi(root);

  root.hidden = false;
  root.setAttribute('aria-hidden', 'false');
  document.body.classList.add('has-open-modal');

  scheduleModalCanvasRedraw();

  const downloadBtn = root.querySelector('#share-download-png-btn');
  window.setTimeout(() => {
    downloadBtn?.focus();
  }, 30);
}

export async function exportTasteProfilePngDirect({
  ratingsMap = {},
  metadataMap = {},
  themeId = 'obsidian',
  onToast = null
}) {
  const offscreen = document.createElement('canvas');
  offscreen.width = CARD_WIDTH;
  offscreen.height = CARD_HEIGHT;

  const { payload } = await generateTasteProfileCardOnCanvas(offscreen, {
    ratingsMap,
    metadataMap,
    themeId
  });

  const result = await downloadCanvasAsPng(offscreen, payload.filename);
  if (typeof onToast === 'function') {
    onToast('Downloaded "' + result.filename + '"');
  }
  return result;
}

export async function exportListeningInsightsPngDirect({
  ratingsMap = {},
  metadataMap = {},
  themeId = 'obsidian',
  onToast = null
}) {
  const offscreen = document.createElement('canvas');
  offscreen.width = CARD_WIDTH;
  offscreen.height = CARD_HEIGHT;

  const { payload } = await generateListeningInsightsCardOnCanvas(offscreen, {
    ratingsMap,
    metadataMap,
    themeId
  });

  const result = await downloadCanvasAsPng(offscreen, payload.filename);
  if (typeof onToast === 'function') {
    onToast('Downloaded "' + result.filename + '"');
  }
  return result;
}

export async function exportCollectionPosterPngDirect({
  collectionId = null,
  collection = null,
  ratingsMap = {},
  metadataMap = {},
  journalMap = {},
  themeId = null,
  onToast = null
}) {
  const offscreen = document.createElement('canvas');
  offscreen.width = CARD_WIDTH;
  offscreen.height = CARD_HEIGHT;

  const colTheme = collection?.theme || 'obsidian';
  const resolvedCanvasTheme =
    themeId || getCollectionThemeMeta(colTheme).canvasThemeId || 'obsidian';

  const { payload } = await generateCollectionPosterOnCanvas(offscreen, {
    collectionId,
    collection,
    ratingsMap,
    metadataMap,
    journalMap,
    themeId: resolvedCanvasTheme
  });

  const result = await downloadCanvasAsPng(offscreen, payload.filename);
  if (typeof onToast === 'function') {
    onToast('Downloaded "' + result.filename + '"');
  }
  return result;
}

export function updateOpenShareModalData({ trackRatingsMap, verdict, ratingsMap, metadataMap }) {
  if (!modalState.isOpen) return;
  if (
    modalState.mode === 'profile' ||
    modalState.mode === 'insights' ||
    modalState.mode === 'collection'
  ) {
    if (ratingsMap !== undefined) modalState.ratingsMap = ratingsMap;
    if (metadataMap !== undefined) modalState.metadataMap = metadataMap;
    scheduleModalCanvasRedraw();
    return;
  }
  if (trackRatingsMap !== undefined) {
    modalState.trackRatingsMap = trackRatingsMap;
  }
  if (verdict !== undefined) {
    modalState.verdict = verdict;
    const root = document.getElementById('share-modal-backdrop');
    const verdictInput = root?.querySelector('#share-modal-verdict-input');
    if (verdictInput && document.activeElement !== verdictInput) {
      verdictInput.value = verdict;
      updateVerdictCounterUi(root, verdict);
    }
  }
  scheduleModalCanvasRedraw();
}

export function closeShareReviewModal() {
  const root = document.getElementById('share-modal-backdrop');
  if (!root || !modalState.isOpen) return;

  modalState.isOpen = false;
  root.hidden = true;
  root.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('has-open-modal');

  if (modalState.triggerElement && typeof modalState.triggerElement.focus === 'function') {
    try {
      modalState.triggerElement.focus();
    } catch {
      // Ignore focus errors if trigger element was unmounted
    }
  }
}