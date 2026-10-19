/**
 * RATEPLAY - Phase 10B Automated Verification Suite (Node.js)
 * Verifies:
 * 1. Route parsing contract (parseRouteHash) across all 8 views, direct album/collection links,
 *    and fallback recovery from invalid or malformed URL hashes.
 * 2. Static accessibility & modal reliability checks across all modal modules
 *    (dialog roles, aria-modal, aria-labelledby, Escape handling, and Tab focus trapping).
 * 3. Responsive CSS & reduced-motion integrity checks without altering 1080x1920 Canvas output.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseRouteHash } from '../js/app.js';
import { CARD_WIDTH, CARD_HEIGHT } from '../js/canvas-card.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

let passed = 0;
function runTest(name, fn) {
  try {
    fn();
    passed += 1;
    console.log('  [PASS] ' + name);
  } catch (err) {
    console.error('  [FAIL] ' + name);
    console.error('         ' + err.message);
    process.exit(1);
  }
}

console.log('\n[PHASE 10B] Running Routing, Modal Accessibility & Responsive Contract Suite...');

// Test 1: Pure route hash parsing contract
runTest('1. parseRouteHash resolves all application routes and recovers safely from invalid hashes', () => {
  assert.deepEqual(parseRouteHash(''), {
    view: 'discover',
    albumId: null,
    collectionId: null,
    canonicalHash: '#discover'
  });

  assert.deepEqual(parseRouteHash('#discover'), {
    view: 'discover',
    albumId: null,
    collectionId: null,
    canonicalHash: '#discover'
  });

  assert.deepEqual(parseRouteHash('#library'), {
    view: 'library',
    albumId: null,
    collectionId: null,
    canonicalHash: '#library'
  });

  assert.deepEqual(parseRouteHash('#profile'), {
    view: 'profile',
    albumId: null,
    collectionId: null,
    canonicalHash: '#profile'
  });

  assert.deepEqual(parseRouteHash('#insights'), {
    view: 'insights',
    albumId: null,
    collectionId: null,
    canonicalHash: '#insights'
  });

  assert.deepEqual(parseRouteHash('#journal'), {
    view: 'journal',
    albumId: null,
    collectionId: null,
    canonicalHash: '#journal'
  });

  assert.deepEqual(parseRouteHash('#collections'), {
    view: 'collections',
    albumId: null,
    collectionId: null,
    canonicalHash: '#collections'
  });

  assert.deepEqual(parseRouteHash('#album/1097862870'), {
    view: 'album',
    albumId: 1097862870,
    collectionId: null,
    canonicalHash: '#album/1097862870'
  });

  assert.deepEqual(parseRouteHash('#collection/col-late-night-123'), {
    view: 'collection-detail',
    albumId: null,
    collectionId: 'col-late-night-123',
    canonicalHash: '#collection/col-late-night-123'
  });

  // Malformed or unknown hashes fall back safely to #discover
  assert.equal(parseRouteHash('#album/not-a-number').view, 'discover');
  assert.equal(parseRouteHash('#collection/bad<script>').view, 'discover');
  assert.equal(parseRouteHash('#unknown-route').view, 'discover');
});

// Test 2: Browser history listener & duplicate push prevention contract in js/app.js
runTest('2. js/app.js registers both hashchange and popstate listeners and guards against duplicate history pushes', () => {
  const appSource = fs.readFileSync(path.join(projectRoot, 'js', 'app.js'), 'utf8');
  assert.ok(
    appSource.includes("window.addEventListener('hashchange', onBrowserRouteChange)"),
    'hashchange listener must be bound to onBrowserRouteChange'
  );
  assert.ok(
    appSource.includes("window.addEventListener('popstate', onBrowserRouteChange)"),
    'popstate listener must be bound to onBrowserRouteChange'
  );
  assert.ok(
    appSource.includes('function pushRouteHash(targetHash)'),
    'pushRouteHash helper must be defined'
  );
  assert.ok(
    appSource.includes('window.location.hash !== normalizedTarget'),
    'pushRouteHash must guard against pushing duplicate consecutive hashes'
  );
});

// Test 3: Static modal accessibility & keyboard focus containment contract across all modal modules
runTest('3. All modal modules expose role="dialog", aria-modal="true", Escape handling, and Tab focus trapping', () => {
  const modalFiles = [
    { file: 'js/ui/shareModal.js', trapFn: 'trapFocusInsideModal' },
    { file: 'js/ui/importModal.js', trapFn: 'trapFocusInImportModal' },
    { file: 'js/ui/journalModal.js', trapFn: 'trapFocusInJournalDialog' },
    { file: 'js/ui/collectionsView.js', trapFn: 'trapFocusInCollectionModal' }
  ];

  for (const item of modalFiles) {
    const content = fs.readFileSync(path.join(projectRoot, item.file), 'utf8');
    assert.ok(
      content.includes('role="dialog"'),
      item.file + ' must include role="dialog"'
    );
    assert.ok(
      content.includes('aria-modal="true"'),
      item.file + ' must include aria-modal="true"'
    );
    assert.ok(
      content.includes('aria-labelledby='),
      item.file + ' must include aria-labelledby'
    );
    assert.ok(
      content.includes("event.key === 'Escape'"),
      item.file + ' must handle Escape key dismissal'
    );
    assert.ok(
      content.includes("event.key === 'Tab'") && content.includes(item.trapFn),
      item.file + ' must trap Tab focus inside active modal'
    );
  }
});

// Test 4: Responsive CSS & reduced-motion rules present while Canvas dimensions remain strictly 1080x1920
runTest('4. Responsive CSS breakpoints and prefers-reduced-motion exist and Canvas dimensions remain 1080x1920', () => {
  const baseCss = fs.readFileSync(path.join(projectRoot, 'css', 'base.css'), 'utf8');
  const compCss = fs.readFileSync(path.join(projectRoot, 'css', 'components.css'), 'utf8');
  const viewsCss = fs.readFileSync(path.join(projectRoot, 'css', 'views.css'), 'utf8');

  assert.ok(
    baseCss.includes('prefers-reduced-motion: reduce'),
    'css/base.css must respect prefers-reduced-motion: reduce'
  );
  assert.ok(
    baseCss.includes('@media (max-width: 1024px)'),
    'css/base.css must include tablet/mobile header wrapping breakpoint'
  );
  assert.ok(
    compCss.includes('100dvh'),
    'css/components.css must constrain modal max-height for mobile viewports'
  );
  assert.ok(
    viewsCss.includes('overflow-wrap: anywhere'),
    'css/views.css must prevent long titles from causing horizontal overflow'
  );

  // Exported Canvas resolution must remain strictly 1080x1920
  assert.equal(CARD_WIDTH, 1080);
  assert.equal(CARD_HEIGHT, 1920);
});

console.log('\nAll ' + String(passed) + ' Phase 10B automated verification suites passed.\n');