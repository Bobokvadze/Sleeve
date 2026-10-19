/**
 * SLEEVE - Accessible Library JSON Import & Preview Modal (Phase 6 - Part 2)
 * Validates selected JSON files, displays a detailed preview of albums to be
 * added or updated, asks for confirmation before overwriting existing ratings,
 * and creates an automatic localStorage backup before applying changes.
 */

import {
  getSavedRatingsMap,
  getAlbumCatalogCacheMap,
  getPreImportLocalBackup,
  restorePreImportLocalBackup
} from '../storage.js';
import {
  validateAndPreviewLibraryImport,
  applyValidatedLibraryImport
} from '../portability.js';
import { formatUpdatedTimestamp } from '../config.js';
import { escapeHtml } from './discoverView.js';

let importModalState = {
  isOpen: false,
  fileName: '',
  previewPlan: null,
  overwriteExisting: false,
  confirmOverwriteChecked: false,
  triggerElement: null,
  onImportSuccess: null,
  onToast: null
};

function ensureImportModalMount() {
  let root = document.getElementById('import-modal-backdrop');
  if (root) return root;

  root = document.createElement('div');
  root.id = 'import-modal-backdrop';
  root.className = 'share-modal-backdrop import-modal-backdrop';
  root.hidden = true;
  root.setAttribute('aria-hidden', 'true');

  root.innerHTML =
    '<div class="share-modal-dialog import-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="import-modal-title" tabindex="-1">' +
    '<header class="share-modal__header">' +
    '<div>' +
    '<span class="share-modal__eyebrow">DATA PORTABILITY // SAFE LOCAL MERGE</span>' +
    '<h2 class="share-modal__title" id="import-modal-title">Import Personal Library JSON</h2>' +
    '</div>' +
    '<button type="button" class="btn btn-secondary share-modal__close-btn" data-import-action="close-modal" aria-label="Close Import Library modal">&times; Close</button>' +
    '</header>' +
    '<div class="import-modal__body">' +
    '<div class="import-file-picker-box">' +
    '<label for="import-json-file-input" class="import-file-label">' +
    '<span class="import-file-label__title">Select a SLEEVE Library JSON Backup (.json)</span>' +
    '<span class="import-file-label__sub">Your existing library is never erased. A local backup snapshot is created automatically before any changes are applied.</span>' +
    '</label>' +
    '<input type="file" id="import-json-file-input" class="import-file-input" accept=".json,application/json" aria-label="Choose SLEEVE library JSON file to import" />' +
    '</div>' +
    '<div id="import-backup-restore-bar" class="import-backup-restore-bar" hidden></div>' +
    '<div id="import-validation-mount" aria-live="polite"></div>' +
    '</div>' +
    '<footer class="import-modal__footer">' +
    '<button type="button" class="btn btn-secondary" data-import-action="close-modal">Cancel</button>' +
    '<button type="button" class="btn btn-primary" id="import-apply-btn" data-import-action="apply-import" disabled>Apply Library Import</button>' +
    '</footer>' +
    '</div>';

  document.body.appendChild(root);
  bindImportModalEvents(root);
  return root;
}

function bindImportModalEvents(root) {
  root.addEventListener('click', (event) => {
    if (event.target === root) {
      closeImportLibraryModal();
      return;
    }

    const actionBtn = event.target.closest('[data-import-action]');
    if (!actionBtn) return;

    const action = actionBtn.getAttribute('data-import-action');
    if (action === 'close-modal') {
      closeImportLibraryModal();
    } else if (action === 'apply-import') {
      handleApplyImportClick();
    } else if (action === 'restore-pre-import-backup') {
      handleRestorePreImportBackup();
    }
  });

  root.addEventListener('change', (event) => {
    if (event.target.id === 'import-json-file-input') {
      const file = event.target.files?.[0];
      if (file) {
        readAndValidateSelectedFile(file);
      }
      return;
    }

    const modeRadio = event.target.closest('input[name="import-conflict-mode"]');
    if (modeRadio) {
      importModalState.overwriteExisting = modeRadio.value === 'overwrite';
      if (!importModalState.overwriteExisting) {
        importModalState.confirmOverwriteChecked = false;
      }
      renderImportPreviewContent();
      return;
    }

    if (event.target.id === 'import-confirm-overwrite-checkbox') {
      importModalState.confirmOverwriteChecked = Boolean(event.target.checked);
      syncApplyButtonState();
    }
  });

  window.addEventListener('keydown', (event) => {
    if (!importModalState.isOpen) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeImportLibraryModal();
      return;
    }
    if (event.key === 'Tab') {
      trapFocusInImportModal(event, root);
    }
  });
}

function trapFocusInImportModal(event, root) {
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

function readAndValidateSelectedFile(file) {
  importModalState.fileName = file.name || 'library.json';
  const mount = document.getElementById('import-validation-mount');
  if (mount) {
    mount.innerHTML =
      '<div class="import-status-banner">Validating &ldquo;' +
      escapeHtml(importModalState.fileName) +
      '&rdquo;&hellip;</div>';
  }

  const reader = new FileReader();
  reader.onload = () => {
    const rawText = typeof reader.result === 'string' ? reader.result : '';
    const plan = validateAndPreviewLibraryImport(
      rawText,
      getSavedRatingsMap(),
      getAlbumCatalogCacheMap()
    );
    importModalState.previewPlan = plan;
    // Default to safe non-overwriting mode if conflicts exist, or allow user to opt in
    importModalState.overwriteExisting = !plan.hasConflicts;
    importModalState.confirmOverwriteChecked = false;
    renderImportPreviewContent();
  };

  reader.onerror = () => {
    importModalState.previewPlan = {
      ok: false,
      error: 'Unable to read the selected file from disk.'
    };
    renderImportPreviewContent();
  };

  reader.readAsText(file, 'utf-8');
}

function renderBackupRestoreBar() {
  const bar = document.getElementById('import-backup-restore-bar');
  if (!bar) return;

  const backup = getPreImportLocalBackup();
  if (!backup) {
    bar.hidden = true;
    bar.innerHTML = '';
    return;
  }

  const albumCount = Object.keys(backup.ratingsMap || {}).length;
  const dateText = backup.backedUpAt
    ? formatUpdatedTimestamp(backup.backedUpAt)
    : 'Recent';

  bar.hidden = false;
  bar.innerHTML =
    '<div class="import-backup-restore-bar__info">' +
    '<span>PRE-IMPORT SAFETY SNAPSHOT AVAILABLE</span>' +
    '<strong>' +
    String(albumCount) +
    ' ' +
    (albumCount === 1 ? 'album' : 'albums') +
    ' backed up (' +
    escapeHtml(dateText) +
    ')</strong>' +
    '</div>' +
    '<button type="button" class="btn btn-secondary btn-sm" data-import-action="restore-pre-import-backup">' +
    'Restore Pre-Import Snapshot' +
    '</button>';
}

function renderImportPreviewContent() {
  const mount = document.getElementById('import-validation-mount');
  if (!mount) return;

  const plan = importModalState.previewPlan;
  if (!plan) {
    mount.innerHTML = '';
    syncApplyButtonState();
    return;
  }

  if (!plan.ok) {
    mount.innerHTML =
      '<div class="import-error-alert" role="alert">' +
      '<strong>Import Validation Failed:</strong> ' +
      escapeHtml(plan.error) +
      '</div>';
    syncApplyButtonState();
    return;
  }

  const addListItems = plan.albumsToAdd
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
        escapeHtml(item.newScore) +
        ' (' +
        String(item.newRatedCount) +
        ' tracks)</span>' +
        '</li>'
    )
    .join('');

  const updateListItems = plan.albumsToUpdate
    .map(
      (item) =>
        '<li class="import-preview-row">' +
        '<span class="import-preview-tag import-preview-tag--update">EXISTING</span>' +
        '<span class="import-preview-title">' +
        escapeHtml(item.collectionName) +
        ' <small>by ' +
        escapeHtml(item.artistName) +
        '</small></span>' +
        '<span class="import-preview-meta">' +
        escapeHtml(item.previousScore) +
        ' &rarr; ' +
        escapeHtml(item.newScore) +
        '</span>' +
        '</li>'
    )
    .join('');

  let conflictControlsHtml = '';
  if (plan.hasConflicts) {
    const addOnlyChecked = !importModalState.overwriteExisting ? ' checked' : '';
    const overwriteChecked = importModalState.overwriteExisting ? ' checked' : '';
    const confirmBoxChecked = importModalState.confirmOverwriteChecked ? ' checked' : '';

    conflictControlsHtml =
      '<div class="import-conflict-panel">' +
      '<span class="import-conflict-panel__title">Existing Album Ratings Detected (' +
      String(plan.albumsToUpdate.length) +
      ')</span>' +
      '<p class="import-conflict-panel__desc">Choose how to handle albums in this file that you have already rated:</p>' +
      '<label class="import-radio-option">' +
      '<input type="radio" name="import-conflict-mode" value="add-only"' +
      addOnlyChecked +
      ' />' +
      '<span><strong>Keep my existing ratings (Safe Default):</strong> Only import the ' +
      String(plan.albumsToAdd.length) +
      ' new album(s) and leave my ' +
      String(plan.albumsToUpdate.length) +
      ' existing album(s) untouched.</span>' +
      '</label>' +
      '<label class="import-radio-option">' +
      '<input type="radio" name="import-conflict-mode" value="overwrite"' +
      overwriteChecked +
      ' />' +
      '<span><strong>Update existing albums from file:</strong> Add ' +
      String(plan.albumsToAdd.length) +
      ' new album(s) and update ' +
      String(plan.albumsToUpdate.length) +
      ' existing album(s) with the imported ratings.</span>' +
      '</label>' +
      (importModalState.overwriteExisting
        ? '<label class="import-confirm-checkbox">' +
          '<input type="checkbox" id="import-confirm-overwrite-checkbox"' +
          confirmBoxChecked +
          ' />' +
          '<span>I confirm that I want to overwrite my existing ratings for ' +
          String(plan.albumsToUpdate.length) +
          ' album(s) (an automatic local backup will be saved first).</span>' +
          '</label>'
        : '') +
      '</div>';
  }

  const combinedRowsHtml = addListItems + updateListItems;
  const previewListSectionHtml = combinedRowsHtml
    ? '<ul class="import-preview-list" aria-label="Albums to be added or updated">' +
      combinedRowsHtml +
      '</ul>'
    : '<p class="import-no-changes-note">All albums in this file already match your current library ratings.</p>';

  mount.innerHTML =
    '<div class="import-preview-summary">' +
    '<div class="import-preview-stat">' +
    '<span class="import-preview-stat__label">NEW ALBUMS TO ADD</span>' +
    '<strong class="import-preview-stat__val import-preview-stat__val--add">' +
    String(plan.albumsToAdd.length) +
    '</strong>' +
    '</div>' +
    '<div class="import-preview-stat">' +
    '<span class="import-preview-stat__label">EXISTING TO UPDATE</span>' +
    '<strong class="import-preview-stat__val import-preview-stat__val--update">' +
    String(plan.albumsToUpdate.length) +
    '</strong>' +
    '</div>' +
    '<div class="import-preview-stat">' +
    '<span class="import-preview-stat__label">ALREADY IDENTICAL</span>' +
    '<strong class="import-preview-stat__val">' +
    String(plan.albumsUnchanged.length) +
    '</strong>' +
    '</div>' +
    '<div class="import-preview-stat">' +
    '<span class="import-preview-stat__label">OTHER LOCAL ALBUMS KEPT</span>' +
    '<strong class="import-preview-stat__val">' +
    String(plan.untouchedExistingCount) +
    '</strong>' +
    '</div>' +
    '</div>' +
    conflictControlsHtml +
    previewListSectionHtml;

  syncApplyButtonState();
}

function syncApplyButtonState() {
  const applyBtn = document.getElementById('import-apply-btn');
  if (!applyBtn) return;

  const plan = importModalState.previewPlan;
  if (!plan || !plan.ok) {
    applyBtn.disabled = true;
    return;
  }

  const effectiveAddCount =
    plan.albumsToAdd.length + (plan.collectionsToAdd?.length || 0);
  const effectiveUpdateCount = importModalState.overwriteExisting
    ? plan.albumsToUpdate.length + (plan.collectionsToUpdate?.length || 0)
    : 0;

  if (effectiveAddCount === 0 && effectiveUpdateCount === 0) {
    applyBtn.disabled = true;
    return;
  }

  if (
    importModalState.overwriteExisting &&
    plan.hasConflicts &&
    !importModalState.confirmOverwriteChecked
  ) {
    applyBtn.disabled = true;
    return;
  }

  applyBtn.disabled = false;
}

function handleApplyImportClick() {
  const plan = importModalState.previewPlan;
  if (!plan || !plan.ok) return;

  if (
    importModalState.overwriteExisting &&
    plan.hasConflicts
  ) {
    if (!importModalState.confirmOverwriteChecked) return;
    const confirmed = window.confirm(
      'Update ' +
        String(plan.albumsToUpdate.length) +
        ' existing album(s) and ' +
        String(plan.collectionsToUpdate?.length || 0) +
        ' existing collection(s)?\n\nA backup of your current localStorage library will be saved automatically before applying.'
    );
    if (!confirmed) return;
  }

  const result = applyValidatedLibraryImport(plan, {
    overwriteExisting: importModalState.overwriteExisting
  });

  if (!result.ok) {
    if (typeof importModalState.onToast === 'function') {
      importModalState.onToast('Import failed: ' + (result.error || 'Storage error'));
    }
    return;
  }

  if (typeof importModalState.onImportSuccess === 'function') {
    importModalState.onImportSuccess(result);
  }

  if (typeof importModalState.onToast === 'function') {
    importModalState.onToast(
      'Imported library: ' +
        String(result.addedCount) +
        ' added, ' +
        String(result.updatedCount) +
        ' updated (pre-import backup saved).'
    );
  }

  closeImportLibraryModal();
}

function handleRestorePreImportBackup() {
  const confirmed = window.confirm(
    'Restore your library to the pre-import backup snapshot?'
  );
  if (!confirmed) return;

  const restored = restorePreImportLocalBackup();
  if (restored) {
    if (typeof importModalState.onImportSuccess === 'function') {
      importModalState.onImportSuccess({ restoredFromBackup: true });
    }
    if (typeof importModalState.onToast === 'function') {
      importModalState.onToast('Restored library from pre-import backup snapshot.');
    }
    closeImportLibraryModal();
  }
}

export function openImportLibraryModal({
  triggerElement = null,
  onImportSuccess = null,
  onToast = null
} = {}) {
  const root = ensureImportModalMount();

  importModalState.isOpen = true;
  importModalState.fileName = '';
  importModalState.previewPlan = null;
  importModalState.overwriteExisting = false;
  importModalState.confirmOverwriteChecked = false;
  importModalState.triggerElement = triggerElement || document.activeElement;
  importModalState.onImportSuccess = onImportSuccess;
  importModalState.onToast = onToast;

  const fileInput = root.querySelector('#import-json-file-input');
  if (fileInput) {
    fileInput.value = '';
  }

  renderBackupRestoreBar();
  renderImportPreviewContent();

  root.hidden = false;
  root.setAttribute('aria-hidden', 'false');
  document.body.classList.add('has-open-modal');

  window.setTimeout(() => {
    fileInput?.focus();
  }, 30);
}

export function closeImportLibraryModal() {
  const root = document.getElementById('import-modal-backdrop');
  if (!root || !importModalState.isOpen) return;

  importModalState.isOpen = false;
  root.hidden = true;
  root.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('has-open-modal');

  if (
    importModalState.triggerElement &&
    typeof importModalState.triggerElement.focus === 'function'
  ) {
    try {
      importModalState.triggerElement.focus();
    } catch {
      // Ignore focus errors if trigger element was unmounted
    }
  }
}