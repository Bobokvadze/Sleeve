/**
 * RATEPLAY - Listening Journal Modals (Phase 8)
 * Provides:
 * 1. Accessible Journal Entry Editor Modal (personal review text, preset + custom mood tags,
 *    favorite track checkboxes, and individual track notes).
 * 2. Accessible Journal JSON Import & Conflict Preview Modal.
 */

import { formatUpdatedTimestamp } from '../config.js';
import { getStableTrackKey } from '../calculator.js';
import {
  getSavedJournalMap,
  getAlbumJournalEntry,
  saveAlbumJournalEntry,
  getAlbumCatalogCacheMap,
  getPreImportJournalBackup,
  restorePreImportJournalBackup,
  normalizeMoodTag,
  normalizeMoodTagsList
} from '../storage.js';
import {
  PRESET_MOOD_TAGS,
  validateAndPreviewJournalImport,
  applyValidatedJournalImport
} from '../journal.js';
import { escapeHtml } from './discoverView.js';

// =========================================================================
// 1. JOURNAL ENTRY EDITOR MODAL
// =========================================================================

let editorState = {
  isOpen: false,
  collectionId: null,
  album: null,
  tracks: [],
  reviewText: '',
  moodTags: [],
  favoriteTrackKeys: new Set(),
  trackNotesByKey: {},
  triggerElement: null,
  onSaveSuccess: null,
  onToast: null
};

function ensureEditorModalMount() {
  let root = document.getElementById('journal-editor-modal-backdrop');
  if (root) return root;

  root = document.createElement('div');
  root.id = 'journal-editor-modal-backdrop';
  root.className = 'share-modal-backdrop journal-editor-backdrop';
  root.hidden = true;
  root.setAttribute('aria-hidden', 'true');

  root.innerHTML =
    '<div class="share-modal-dialog journal-editor-dialog" role="dialog" aria-modal="true" aria-labelledby="journal-editor-title" tabindex="-1">' +
    '<header class="share-modal__header">' +
    '<div>' +
    '<span class="share-modal__eyebrow" id="journal-editor-eyebrow">LISTENING JOURNAL // PERSONAL LINER NOTES</span>' +
    '<h2 class="share-modal__title" id="journal-editor-title">Album Journal Entry</h2>' +
    '</div>' +
    '<button type="button" class="btn btn-secondary share-modal__close-btn" data-jedit-action="close-modal" aria-label="Close Journal Editor">&times; Close</button>' +
    '</header>' +
    '<div class="import-modal__body journal-editor__body" id="journal-editor-body-mount"></div>' +
    '<footer class="import-modal__footer">' +
    '<span id="journal-editor-error" class="journal-editor-error" role="alert" hidden></span>' +
    '<button type="button" class="btn btn-secondary" data-jedit-action="close-modal">Cancel</button>' +
    '<button type="button" class="btn btn-primary" id="journal-editor-save-btn" data-jedit-action="save-entry">Save Journal Entry</button>' +
    '</footer>' +
    '</div>';

  document.body.appendChild(root);
  bindEditorModalEvents(root);
  return root;
}

function bindEditorModalEvents(root) {
  root.addEventListener('click', (event) => {
    if (event.target === root) {
      closeJournalEditorModal();
      return;
    }

    const actionBtn = event.target.closest('[data-jedit-action]');
    if (!actionBtn) return;

    const action = actionBtn.getAttribute('data-jedit-action');
    if (action === 'close-modal') {
      closeJournalEditorModal();
    } else if (action === 'save-entry') {
      handleSaveJournalEntryClick();
    } else if (action === 'toggle-mood-tag') {
      const tag = actionBtn.getAttribute('data-mood-tag') || '';
      toggleMoodTagInEditor(tag);
    } else if (action === 'add-custom-mood') {
      handleAddCustomMoodTag();
    } else if (action === 'toggle-fav-track') {
      const tKey = actionBtn.getAttribute('data-track-key') || '';
      if (tKey) {
        if (editorState.favoriteTrackKeys.has(tKey)) {
          editorState.favoriteTrackKeys.delete(tKey);
        } else {
          editorState.favoriteTrackKeys.add(tKey);
        }
        actionBtn.classList.toggle(
          'is-active',
          editorState.favoriteTrackKeys.has(tKey)
        );
        actionBtn.setAttribute(
          'aria-pressed',
          editorState.favoriteTrackKeys.has(tKey) ? 'true' : 'false'
        );
      }
    }
  });

  root.addEventListener('input', (event) => {
    if (event.target.id === 'journal-editor-review-textarea') {
      editorState.reviewText = event.target.value || '';
      hideEditorError();
      return;
    }

    const trackNoteInput = event.target.closest('[data-jedit-track-note]');
    if (trackNoteInput) {
      const tKey = trackNoteInput.getAttribute('data-jedit-track-note');
      if (tKey) {
        editorState.trackNotesByKey[tKey] = trackNoteInput.value || '';
        hideEditorError();
      }
    }
  });

  root.addEventListener('keydown', (event) => {
    if (event.target.id === 'journal-custom-mood-input' && event.key === 'Enter') {
      event.preventDefault();
      handleAddCustomMoodTag();
    }
  });

  window.addEventListener('keydown', (event) => {
    if (!editorState.isOpen) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeJournalEditorModal();
      return;
    }
    if (event.key === 'Tab') {
      trapFocusInJournalDialog(event, root);
    }
  });
}

function trapFocusInJournalDialog(event, root) {
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

function toggleMoodTagInEditor(rawTag) {
  const clean = normalizeMoodTag(rawTag);
  if (!clean) return;
  const lower = clean.toLowerCase();
  const existsIdx = editorState.moodTags.findIndex(
    (t) => t.toLowerCase() === lower
  );
  if (existsIdx >= 0) {
    editorState.moodTags.splice(existsIdx, 1);
  } else {
    editorState.moodTags = normalizeMoodTagsList([...editorState.moodTags, clean]);
  }
  hideEditorError();
  renderMoodTagsSelectorDom();
}

function handleAddCustomMoodTag() {
  const input = document.getElementById('journal-custom-mood-input');
  if (!input) return;
  const val = normalizeMoodTag(input.value);
  if (!val) return;

  editorState.moodTags = normalizeMoodTagsList([...editorState.moodTags, val]);
  input.value = '';
  hideEditorError();
  renderMoodTagsSelectorDom();
  input.focus();
}

function renderMoodTagsSelectorDom() {
  const mount = document.getElementById('journal-editor-moods-mount');
  if (!mount) return;

  const allTagsPool = normalizeMoodTagsList([
    ...PRESET_MOOD_TAGS,
    ...editorState.moodTags
  ]);

  mount.innerHTML = allTagsPool
    .map((tag) => {
      const isSelected = editorState.moodTags.some(
        (t) => t.toLowerCase() === tag.toLowerCase()
      );
      return (
        '<button type="button" class="query-chip' +
        (isSelected ? ' is-active' : '') +
        '" data-jedit-action="toggle-mood-tag" data-mood-tag="' +
        escapeHtml(tag) +
        '" aria-pressed="' +
        (isSelected ? 'true' : 'false') +
        '">#' +
        escapeHtml(tag) +
        '</button>'
      );
    })
    .join('');
}

function showEditorError(msg) {
  const errEl = document.getElementById('journal-editor-error');
  if (!errEl) return;
  errEl.textContent = msg;
  errEl.hidden = false;
}

function hideEditorError() {
  const errEl = document.getElementById('journal-editor-error');
  if (!errEl) return;
  errEl.hidden = true;
  errEl.textContent = '';
}

function renderEditorBodyDom() {
  const bodyMount = document.getElementById('journal-editor-body-mount');
  const titleEl = document.getElementById('journal-editor-title');
  if (!bodyMount) return;

  const album = editorState.album || {};
  const tracks = Array.isArray(editorState.tracks) ? editorState.tracks : [];

  if (titleEl) {
    titleEl.textContent =
      (album.collectionName || 'Album') +
      (album.artistName ? ' \u2014 ' + album.artistName : '');
  }

  let tracksSectionHtml = '';
  if (tracks.length > 0) {
    const trackRowsHtml = tracks
      .map((track, idx) => {
        const tKey = getStableTrackKey(track, idx);
        const tNum = Number(track.trackNumber) || idx + 1;
        const numFormatted = String(tNum).padStart(2, '0');
        const tName = track.trackName || 'Track ' + String(tNum);
        const isFav = editorState.favoriteTrackKeys.has(tKey);
        const existingNote = editorState.trackNotesByKey[tKey] || '';

        return (
          '<div class="jedit-track-row">' +
          '<div class="jedit-track-row__top">' +
          '<button type="button" class="jedit-fav-btn' +
          (isFav ? ' is-active' : '') +
          '" data-jedit-action="toggle-fav-track" data-track-key="' +
          escapeHtml(tKey) +
          '" aria-pressed="' +
          (isFav ? 'true' : 'false') +
          '" title="Toggle as Favorite Track">' +
          '<span aria-hidden="true">&#9733;</span>' +
          '<span>' +
          (isFav ? 'Favorite' : 'Mark Favorite') +
          '</span>' +
          '</button>' +
          '<span class="jedit-track-row__title">#' +
          escapeHtml(numFormatted) +
          ' ' +
          escapeHtml(tName) +
          '</span>' +
          '</div>' +
          '<input type="text" class="verdict-editor-input jedit-track-note-input" data-jedit-track-note="' +
          escapeHtml(tKey) +
          '" value="' +
          escapeHtml(existingNote) +
          '" maxlength="600" placeholder="Optional note for #' +
          escapeHtml(numFormatted) +
          ' ' +
          escapeHtml(tName) +
          '..." aria-label="Track note for ' +
          escapeHtml(tName) +
          '" />' +
          '</div>'
        );
      })
      .join('');

    tracksSectionHtml =
      '<div class="jedit-section">' +
      '<span class="share-control-label">3. Favorite Tracks &amp; Individual Song Notes (Optional)</span>' +
      '<div class="jedit-tracks-list">' +
      trackRowsHtml +
      '</div>' +
      '</div>';
  }

  bodyMount.innerHTML =
    '<div class="jedit-section">' +
    '<label for="journal-editor-review-textarea" class="share-control-label">1. Personal Album Review &amp; Listening Reflections</label>' +
    '<textarea id="journal-editor-review-textarea" class="share-verdict-textarea jedit-review-textarea" rows="5" maxlength="8000" placeholder="Write your personal thoughts, listening context, production highlights, or memories with this record...">' +
    escapeHtml(editorState.reviewText) +
    '</textarea>' +
    '</div>' +
    '<div class="jedit-section">' +
    '<span class="share-control-label">2. Mood &amp; Context Tags (Select or Add Custom)</span>' +
    '<div class="chip-row" id="journal-editor-moods-mount" role="group" aria-label="Mood tags"></div>' +
    '<div class="jedit-custom-mood-row">' +
    '<input type="text" id="journal-custom-mood-input" class="verdict-editor-input" maxlength="36" placeholder="Add a custom mood tag (e.g., Vinyl Pressing, Rainy Morning)..." aria-label="Custom mood tag" />' +
    '<button type="button" class="btn btn-secondary" data-jedit-action="add-custom-mood">Add Tag</button>' +
    '</div>' +
    '</div>' +
    tracksSectionHtml;

  renderMoodTagsSelectorDom();
}

function handleSaveJournalEntryClick() {
  if (!editorState.collectionId) return;

  const tracks = Array.isArray(editorState.tracks) ? editorState.tracks : [];
  const favoriteTracks = [];
  const trackNotes = [];

  if (tracks.length > 0) {
    tracks.forEach((track, idx) => {
      const tKey = getStableTrackKey(track, idx);
      const tNum = Number(track.trackNumber) || idx + 1;
      const tName = track.trackName || 'Track ' + String(tNum);

      if (editorState.favoriteTrackKeys.has(tKey)) {
        favoriteTracks.push({
          trackKey: tKey,
          trackNumber: tNum,
          trackName: tName
        });
      }

      const noteVal = String(editorState.trackNotesByKey[tKey] || '').trim();
      if (noteVal) {
        trackNotes.push({
          trackKey: tKey,
          trackNumber: tNum,
          trackName: tName,
          note: noteVal
        });
      }
    });
  } else {
    // Preserve any existing favorite tracks or track notes if tracklist wasn't loaded
    const existing = getAlbumJournalEntry(editorState.collectionId);
    if (existing) {
      favoriteTracks.push(...(existing.favoriteTracks || []));
      trackNotes.push(...(existing.trackNotes || []));
    }
  }

  const saveRes = saveAlbumJournalEntry(
    editorState.collectionId,
    {
      reviewText: editorState.reviewText,
      moodTags: editorState.moodTags,
      favoriteTracks,
      trackNotes
    },
    editorState.album
  );

  if (!saveRes || !saveRes.savedOk) {
    showEditorError(
      saveRes?.error ||
        'Please enter review text, select a mood tag, or add a track note before saving.'
    );
    return;
  }

  if (typeof editorState.onSaveSuccess === 'function') {
    editorState.onSaveSuccess(saveRes.entry);
  }
  if (typeof editorState.onToast === 'function') {
    editorState.onToast(
      saveRes.isNew
        ? 'Added journal entry for "' + (editorState.album?.collectionName || 'Album') + '".'
        : 'Updated journal entry for "' + (editorState.album?.collectionName || 'Album') + '".'
    );
  }

  closeJournalEditorModal();
}

export function openJournalEditorModal({
  collectionId,
  album,
  tracks = [],
  triggerElement = null,
  onSaveSuccess = null,
  onToast = null
}) {
  const root = ensureEditorModalMount();
  const safeId = String(collectionId || album?.collectionId || '').trim();
  if (!safeId) return;

  const existing = getAlbumJournalEntry(safeId);

  editorState.isOpen = true;
  editorState.collectionId = safeId;
  editorState.album = album || { collectionId: safeId, collectionName: 'Album #' + safeId };
  editorState.tracks = Array.isArray(tracks) ? tracks : [];
  editorState.reviewText = existing?.reviewText || '';
  editorState.moodTags = existing?.moodTags ? [...existing.moodTags] : [];
  editorState.favoriteTrackKeys = new Set(
    (existing?.favoriteTracks || []).map((f) => String(f.trackKey))
  );

  const notesMap = {};
  (existing?.trackNotes || []).forEach((tn) => {
    notesMap[String(tn.trackKey)] = tn.note;
  });
  editorState.trackNotesByKey = notesMap;

  editorState.triggerElement = triggerElement || document.activeElement;
  editorState.onSaveSuccess = onSaveSuccess;
  editorState.onToast = onToast;

  hideEditorError();
  renderEditorBodyDom();

  root.hidden = false;
  root.setAttribute('aria-hidden', 'false');
  document.body.classList.add('has-open-modal');

  window.setTimeout(() => {
    const textarea = document.getElementById('journal-editor-review-textarea');
    textarea?.focus();
  }, 30);
}

export function closeJournalEditorModal() {
  const root = document.getElementById('journal-editor-modal-backdrop');
  if (!root || !editorState.isOpen) return;

  editorState.isOpen = false;
  root.hidden = true;
  root.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('has-open-modal');

  if (
    editorState.triggerElement &&
    typeof editorState.triggerElement.focus === 'function'
  ) {
    try {
      editorState.triggerElement.focus();
    } catch {
      // Ignore focus error if trigger unmounted
    }
  }
}

// =========================================================================
// 2. JOURNAL JSON IMPORT & PREVIEW MODAL
// =========================================================================

let jImportState = {
  isOpen: false,
  fileName: '',
  previewPlan: null,
  overwriteExisting: false,
  confirmOverwriteChecked: false,
  triggerElement: null,
  onImportSuccess: null,
  onToast: null
};

function ensureJournalImportModalMount() {
  let root = document.getElementById('journal-import-modal-backdrop');
  if (root) return root;

  root = document.createElement('div');
  root.id = 'journal-import-modal-backdrop';
  root.className = 'share-modal-backdrop import-modal-backdrop';
  root.hidden = true;
  root.setAttribute('aria-hidden', 'true');

  root.innerHTML =
    '<div class="share-modal-dialog import-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="journal-import-modal-title" tabindex="-1">' +
    '<header class="share-modal__header">' +
    '<div>' +
    '<span class="share-modal__eyebrow">JOURNAL PORTABILITY // SAFE LOCAL MERGE</span>' +
    '<h2 class="share-modal__title" id="journal-import-modal-title">Import Listening Journal JSON</h2>' +
    '</div>' +
    '<button type="button" class="btn btn-secondary share-modal__close-btn" data-jimp-action="close-modal" aria-label="Close Import Journal modal">&times; Close</button>' +
    '</header>' +
    '<div class="import-modal__body">' +
    '<div class="import-file-picker-box">' +
    '<label for="journal-import-file-input" class="import-file-label">' +
    '<span class="import-file-label__title">Select a RATEPLAY Journal JSON Backup (.json)</span>' +
    '<span class="import-file-label__sub">Merges journal entries safely without deleting existing entries or changing any album ratings.</span>' +
    '</label>' +
    '<input type="file" id="journal-import-file-input" class="import-file-input" accept=".json,application/json" aria-label="Choose RATEPLAY journal JSON file to import" />' +
    '</div>' +
    '<div id="journal-import-backup-bar" class="import-backup-restore-bar" hidden></div>' +
    '<div id="journal-import-validation-mount" aria-live="polite"></div>' +
    '</div>' +
    '<footer class="import-modal__footer">' +
    '<button type="button" class="btn btn-secondary" data-jimp-action="close-modal">Cancel</button>' +
    '<button type="button" class="btn btn-primary" id="journal-import-apply-btn" data-jimp-action="apply-import" disabled>Apply Journal Import</button>' +
    '</footer>' +
    '</div>';

  document.body.appendChild(root);
  bindJournalImportModalEvents(root);
  return root;
}

function bindJournalImportModalEvents(root) {
  root.addEventListener('click', (event) => {
    if (event.target === root) {
      closeJournalImportModal();
      return;
    }

    const actionBtn = event.target.closest('[data-jimp-action]');
    if (!actionBtn) return;

    const action = actionBtn.getAttribute('data-jimp-action');
    if (action === 'close-modal') {
      closeJournalImportModal();
    } else if (action === 'apply-import') {
      handleApplyJournalImportClick();
    } else if (action === 'restore-journal-backup') {
      handleRestoreJournalBackupClick();
    }
  });

  root.addEventListener('change', (event) => {
    if (event.target.id === 'journal-import-file-input') {
      const file = event.target.files?.[0];
      if (file) {
        readAndValidateJournalFile(file);
      }
      return;
    }

    const modeRadio = event.target.closest('input[name="journal-conflict-mode"]');
    if (modeRadio) {
      jImportState.overwriteExisting = modeRadio.value === 'overwrite';
      if (!jImportState.overwriteExisting) {
        jImportState.confirmOverwriteChecked = false;
      }
      renderJournalImportPreviewContent();
      return;
    }

    if (event.target.id === 'journal-confirm-overwrite-checkbox') {
      jImportState.confirmOverwriteChecked = Boolean(event.target.checked);
      syncJournalImportApplyButton();
    }
  });

  window.addEventListener('keydown', (event) => {
    if (!jImportState.isOpen) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeJournalImportModal();
      return;
    }
    if (event.key === 'Tab') {
      trapFocusInJournalDialog(event, root);
    }
  });
}

function readAndValidateJournalFile(file) {
  jImportState.fileName = file.name || 'journal.json';
  const mount = document.getElementById('journal-import-validation-mount');
  if (mount) {
    mount.innerHTML =
      '<div class="import-status-banner">Validating &ldquo;' +
      escapeHtml(jImportState.fileName) +
      '&rdquo;&hellip;</div>';
  }

  const reader = new FileReader();
  reader.onload = () => {
    const rawText = typeof reader.result === 'string' ? reader.result : '';
    const plan = validateAndPreviewJournalImport(
      rawText,
      getSavedJournalMap(),
      getAlbumCatalogCacheMap()
    );
    jImportState.previewPlan = plan;
    jImportState.overwriteExisting = false;
    jImportState.confirmOverwriteChecked = false;
    renderJournalImportPreviewContent();
  };

  reader.onerror = () => {
    jImportState.previewPlan = {
      ok: false,
      error: 'Unable to read the selected file from disk.'
    };
    renderJournalImportPreviewContent();
  };

  reader.readAsText(file, 'utf-8');
}

function renderJournalBackupRestoreBar() {
  const bar = document.getElementById('journal-import-backup-bar');
  if (!bar) return;

  const backup = getPreImportJournalBackup();
  if (!backup) {
    bar.hidden = true;
    bar.innerHTML = '';
    return;
  }

  const count = Object.keys(backup.journalMap || {}).length;
  const dateText = backup.backedUpAt
    ? formatUpdatedTimestamp(backup.backedUpAt)
    : 'Recent';

  bar.hidden = false;
  bar.innerHTML =
    '<div class="import-backup-restore-bar__info">' +
    '<span>PRE-IMPORT JOURNAL SNAPSHOT AVAILABLE</span>' +
    '<strong>' +
    String(count) +
    ' ' +
    (count === 1 ? 'entry' : 'entries') +
    ' backed up (' +
    escapeHtml(dateText) +
    ')</strong>' +
    '</div>' +
    '<button type="button" class="btn btn-secondary btn-sm" data-jimp-action="restore-journal-backup">' +
    'Restore Snapshot' +
    '</button>';
}

function renderJournalImportPreviewContent() {
  const mount = document.getElementById('journal-import-validation-mount');
  if (!mount) return;

  const plan = jImportState.previewPlan;
  if (!plan) {
    mount.innerHTML = '';
    syncJournalImportApplyButton();
    return;
  }

  if (!plan.ok) {
    mount.innerHTML =
      '<div class="import-error-alert" role="alert">' +
      '<strong>Journal Import Validation Failed:</strong> ' +
      escapeHtml(plan.error) +
      '</div>';
    syncJournalImportApplyButton();
    return;
  }

  const addRows = plan.entriesToAdd
    .map(
      (item) =>
        '<li class="import-preview-row">' +
        '<span class="import-preview-tag import-preview-tag--add">NEW</span>' +
        '<span class="import-preview-title">' +
        escapeHtml(item.collectionName) +
        ' <small>by ' +
        escapeHtml(item.artistName) +
        '</small></span>' +
        '<span class="import-preview-meta">' +
        String(item.tagCount) +
        ' tags &middot; ' +
        String(item.trackNoteCount) +
        ' track notes</span>' +
        '</li>'
    )
    .join('');

  const updateRows = plan.entriesToUpdate
    .map(
      (item) =>
        '<li class="import-preview-row">' +
        '<span class="import-preview-tag import-preview-tag--update">CONFLICT</span>' +
        '<span class="import-preview-title">' +
        escapeHtml(item.collectionName) +
        ' <small>by ' +
        escapeHtml(item.artistName) +
        '</small></span>' +
        '<span class="import-preview-meta">Existing entry differs</span>' +
        '</li>'
    )
    .join('');

  let conflictHtml = '';
  if (plan.hasConflicts) {
    const keepChecked = !jImportState.overwriteExisting ? ' checked' : '';
    const replaceChecked = jImportState.overwriteExisting ? ' checked' : '';
    const confirmChecked = jImportState.confirmOverwriteChecked ? ' checked' : '';

    conflictHtml =
      '<div class="import-conflict-panel">' +
      '<span class="import-conflict-panel__title">Conflicting Journal Entries Detected (' +
      String(plan.entriesToUpdate.length) +
      ')</span>' +
      '<label class="import-radio-option">' +
      '<input type="radio" name="journal-conflict-mode" value="keep"' +
      keepChecked +
      ' />' +
      '<span><strong>Keep my existing entries (Safe Default):</strong> Only add the ' +
      String(plan.entriesToAdd.length) +
      ' new entry/entries and keep my ' +
      String(plan.entriesToUpdate.length) +
      ' existing entry/entries unchanged.</span>' +
      '</label>' +
      '<label class="import-radio-option">' +
      '<input type="radio" name="journal-conflict-mode" value="overwrite"' +
      replaceChecked +
      ' />' +
      '<span><strong>Replace conflicting entries from file:</strong> Add ' +
      String(plan.entriesToAdd.length) +
      ' new entry/entries and replace ' +
      String(plan.entriesToUpdate.length) +
      ' conflicting entry/entries (album ratings are never changed).</span>' +
      '</label>' +
      (jImportState.overwriteExisting
        ? '<label class="import-confirm-checkbox">' +
          '<input type="checkbox" id="journal-confirm-overwrite-checkbox"' +
          confirmChecked +
          ' />' +
          '<span>I confirm that I want to replace my existing journal notes for ' +
          String(plan.entriesToUpdate.length) +
          ' album(s).</span>' +
          '</label>'
        : '') +
      '</div>';
  }

  const combinedRows = addRows + updateRows;
  const listHtml = combinedRows
    ? '<ul class="import-preview-list">' + combinedRows + '</ul>'
    : '<p class="import-no-changes-note">All entries in this file already match your current Listening Journal.</p>';

  mount.innerHTML =
    '<div class="import-preview-summary">' +
    '<div class="import-preview-stat">' +
    '<span class="import-preview-stat__label">NEW ENTRIES TO ADD</span>' +
    '<strong class="import-preview-stat__val import-preview-stat__val--add">' +
    String(plan.entriesToAdd.length) +
    '</strong>' +
    '</div>' +
    '<div class="import-preview-stat">' +
    '<span class="import-preview-stat__label">CONFLICTS / UPDATES</span>' +
    '<strong class="import-preview-stat__val import-preview-stat__val--update">' +
    String(plan.entriesToUpdate.length) +
    '</strong>' +
    '</div>' +
    '<div class="import-preview-stat">' +
    '<span class="import-preview-stat__label">ALREADY IDENTICAL</span>' +
    '<strong class="import-preview-stat__val">' +
    String(plan.entriesUnchanged.length) +
    '</strong>' +
    '</div>' +
    '<div class="import-preview-stat">' +
    '<span class="import-preview-stat__label">LOCAL ENTRIES KEPT</span>' +
    '<strong class="import-preview-stat__val">' +
    String(plan.untouchedExistingCount) +
    '</strong>' +
    '</div>' +
    '</div>' +
    conflictHtml +
    listHtml;

  syncJournalImportApplyButton();
}

function syncJournalImportApplyButton() {
  const applyBtn = document.getElementById('journal-import-apply-btn');
  if (!applyBtn) return;

  const plan = jImportState.previewPlan;
  if (!plan || !plan.ok) {
    applyBtn.disabled = true;
    return;
  }

  const addCount = plan.entriesToAdd.length;
  const updateCount = jImportState.overwriteExisting
    ? plan.entriesToUpdate.length
    : 0;

  if (addCount === 0 && updateCount === 0) {
    applyBtn.disabled = true;
    return;
  }

  if (
    jImportState.overwriteExisting &&
    plan.entriesToUpdate.length > 0 &&
    !jImportState.confirmOverwriteChecked
  ) {
    applyBtn.disabled = true;
    return;
  }

  applyBtn.disabled = false;
}

function handleApplyJournalImportClick() {
  const plan = jImportState.previewPlan;
  if (!plan || !plan.ok) return;

  if (jImportState.overwriteExisting && plan.entriesToUpdate.length > 0) {
    if (!jImportState.confirmOverwriteChecked) return;
    const confirmed = window.confirm(
      'Replace ' +
        String(plan.entriesToUpdate.length) +
        ' conflicting journal entry/entries and add ' +
        String(plan.entriesToAdd.length) +
        ' new entry/entries?\n\nYour album ratings will NOT be changed, and a backup of your current journal will be saved automatically.'
    );
    if (!confirmed) return;
  }

  const res = applyValidatedJournalImport(plan, {
    overwriteExisting: jImportState.overwriteExisting
  });

  if (!res.ok) {
    if (typeof jImportState.onToast === 'function') {
      jImportState.onToast('Journal import failed: ' + (res.error || 'Storage error'));
    }
    return;
  }

  if (typeof jImportState.onImportSuccess === 'function') {
    jImportState.onImportSuccess(res);
  }
  if (typeof jImportState.onToast === 'function') {
    jImportState.onToast(
      'Imported journal: ' +
        String(res.addedCount) +
        ' added, ' +
        String(res.updatedCount) +
        ' updated.'
    );
  }

  closeJournalImportModal();
}

function handleRestoreJournalBackupClick() {
  const confirmed = window.confirm(
    'Restore your Listening Journal to the pre-import backup snapshot?'
  );
  if (!confirmed) return;

  if (restorePreImportJournalBackup()) {
    if (typeof jImportState.onImportSuccess === 'function') {
      jImportState.onImportSuccess({ restoredFromBackup: true });
    }
    if (typeof jImportState.onToast === 'function') {
      jImportState.onToast('Restored Listening Journal from pre-import backup.');
    }
    closeJournalImportModal();
  }
}

export function openJournalImportModal({
  triggerElement = null,
  onImportSuccess = null,
  onToast = null
} = {}) {
  const root = ensureJournalImportModalMount();

  jImportState.isOpen = true;
  jImportState.fileName = '';
  jImportState.previewPlan = null;
  jImportState.overwriteExisting = false;
  jImportState.confirmOverwriteChecked = false;
  jImportState.triggerElement = triggerElement || document.activeElement;
  jImportState.onImportSuccess = onImportSuccess;
  jImportState.onToast = onToast;

  const fileInput = root.querySelector('#journal-import-file-input');
  if (fileInput) fileInput.value = '';

  renderJournalBackupRestoreBar();
  renderJournalImportPreviewContent();

  root.hidden = false;
  root.setAttribute('aria-hidden', 'false');
  document.body.classList.add('has-open-modal');

  window.setTimeout(() => {
    fileInput?.focus();
  }, 30);
}

export function closeJournalImportModal() {
  const root = document.getElementById('journal-import-modal-backdrop');
  if (!root || !jImportState.isOpen) return;

  jImportState.isOpen = false;
  root.hidden = true;
  root.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('has-open-modal');

  if (
    jImportState.triggerElement &&
    typeof jImportState.triggerElement.focus === 'function'
  ) {
    try {
      jImportState.triggerElement.focus();
    } catch {
      // Ignore focus error
    }
  }
}