/**
 * RATEPLAY - Browser-Native 1080x1920 Social Review Card Generator (Phase 5)
 * Uses pure HTML5 2D Canvas API with zero external screenshot or color libraries.
 */

import {
  getHighResArtwork,
  getTierDetails,
  formatReleaseYear,
  formatUpdatedTimestamp
} from './config.js';
import {
  getStableTrackKey,
  calculateAlbumScoreAndHighlights
} from './calculator.js';
import { buildMusicTasteProfile } from './profile.js';
import { buildListeningInsights } from './insights.js';
import { buildEnrichedCollection } from './collections.js';
import {
  getCustomCollection,
  getSavedRatingsMap,
  getAlbumCatalogCacheMap,
  getSavedJournalMap
} from './storage.js';

export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1920;

export const CARD_THEMES = {
  obsidian: {
    id: 'obsidian',
    name: 'Obsidian',
    tagline: 'Carbon dark & warm amber',
    isLight: false,
    bgCanvas: '#0B0B0C',
    bgSurface: '#131316',
    bgElevated: '#1C1C21',
    bgSubtle: '#222228',
    borderSubtle: '#242429',
    borderStrong: '#34343D',
    textPrimary: '#F3F2EE',
    textSecondary: '#9E9D99',
    textMuted: '#63625F',
    accent: '#E8A838',
    accentSoft: 'rgba(232, 168, 56, 0.14)'
  },
  paper: {
    id: 'paper',
    name: 'Paper',
    tagline: 'Archival off-white & ink',
    isLight: true,
    bgCanvas: '#F4F1EA',
    bgSurface: '#EAE5DB',
    bgElevated: '#E1DBD0',
    bgSubtle: '#D6CFC2',
    borderSubtle: '#D0C9BC',
    borderStrong: '#B8B0A0',
    textPrimary: '#121214',
    textSecondary: '#4E4C48',
    textMuted: '#78756F',
    accent: '#B87308',
    accentSoft: 'rgba(184, 115, 8, 0.12)'
  },
  signal: {
    id: 'signal',
    name: 'Signal',
    tagline: 'Hero cover stage & studio contrast',
    isLight: false,
    bgCanvas: '#08080A',
    bgSurface: '#111115',
    bgElevated: '#191920',
    bgSubtle: '#23232C',
    borderSubtle: '#282833',
    borderStrong: '#3E3E4E',
    textPrimary: '#F3F2EE',
    textSecondary: '#A8A7A2',
    textMuted: '#6E6D68',
    accent: '#E8A838',
    accentSoft: 'rgba(232, 168, 56, 0.18)'
  }
};

const artworkMemoryCache = new Map();

/**
 * Ensures no NaN, undefined, null, or Infinity string ever leaks onto the Canvas.
 */
export function sanitizeCardText(value, fallback = '') {
  if (value === null || value === undefined || typeof value === 'boolean') {
    return fallback;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return fallback;
    return String(value);
  }
  const str = String(value).replace(/\s+/g, ' ').trim();
  if (
    !str ||
    str === 'NaN' ||
    str === 'undefined' ||
    str === 'null' ||
    str === 'Infinity' ||
    str === '-Infinity'
  ) {
    return fallback;
  }
  return str;
}

/**
 * Generates a clean, predictable, filesystem-safe PNG filename:
 * "RATEPLAY - Artist - Album.png"
 */
export function buildSanitizedCardFilename(artistName, albumName) {
  const cleanPart = (input, fallback) => {
    const raw = sanitizeCardText(input, fallback);
    const cleaned = raw
      .replace(/[<>:"/\\|?*\x00-\x1F]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^[.\s]+|[.\s]+$/g, '');
    return cleaned.slice(0, 60) || fallback;
  };

  const safeArtist = cleanPart(artistName, 'Unknown Artist');
  const safeAlbum = cleanPart(albumName, 'Untitled Album');
  return 'RATEPLAY - ' + safeArtist + ' - ' + safeAlbum + '.png';
}

export function resolveCardTheme(themeId) {
  const key = String(themeId || 'obsidian').toLowerCase();
  return CARD_THEMES[key] || CARD_THEMES.obsidian;
}

function getThemeTierColor(score, theme) {
  const details = getTierDetails(score);
  return theme && theme.isLight ? details.hexLight : details.hexDark;
}

/**
 * Formats a highlight slot (Standout or Lowest-Rated track) including graceful tie handling.
 */
function formatHighlightSummary(tracksList, ratingValue, theme) {
  if (
    !Array.isArray(tracksList) ||
    tracksList.length === 0 ||
    ratingValue === null ||
    !Number.isFinite(Number(ratingValue))
  ) {
    return null;
  }

  const primary = tracksList[0];
  const numStr = '#' + String(primary.trackNumber || 1).padStart(2, '0');
  const primaryTitle = sanitizeCardText(primary.trackName, 'Track');
  const tieCount = tracksList.length - 1;

  let displayTitle = numStr + ' ' + primaryTitle;
  let tieSubtitle = '';

  if (tieCount === 1) {
    const second = tracksList[1];
    const secondNum = '#' + String(second.trackNumber || 2).padStart(2, '0');
    tieSubtitle = 'Tied with ' + secondNum + ' ' + sanitizeCardText(second.trackName, 'Track');
  } else if (tieCount > 1) {
    tieSubtitle = 'Tied across ' + String(tracksList.length) + ' tracks at ' + Number(ratingValue).toFixed(1);
  }

  return {
    primaryLine: displayTitle,
    tieSubtitle,
    scoreText: Number(ratingValue).toFixed(1),
    scoreColor: getThemeTierColor(ratingValue, theme),
    tiedCount: tracksList.length
  };
}

/**
 * Gathers and normalizes all data required to render a 1080x1920 Review Card.
 * Uses the existing Phase 3 calculateAlbumScoreAndHighlights() engine directly.
 */
export function prepareReviewCardPayload({
  album = {},
  tracks = [],
  trackRatingsMap = {},
  verdict = '',
  themeId = 'obsidian'
} = {}) {
  const theme = resolveCardTheme(themeId);
  const safeTracks = Array.isArray(tracks) ? tracks : [];
  const metrics = calculateAlbumScoreAndHighlights(safeTracks, trackRatingsMap);

  const hasValidScore =
    metrics.scoredCount > 0 &&
    metrics.overallScore !== null &&
    Number.isFinite(metrics.overallScore);

  const tierDetails = getTierDetails(metrics.overallScore);
  const tierColor = getThemeTierColor(metrics.overallScore, theme);

  const rawYear = formatReleaseYear(album?.releaseDate);
  const hasReleaseYear = rawYear && rawYear !== '----';

  // Build ordered list of rated, included tracks that contributed to the score
  const scoredTrackItems = [];
  safeTracks.forEach((track, idx) => {
    const key = getStableTrackKey(track, idx);
    const state = metrics.normalizedByKey[key];
    if (state && state.included && state.rating !== null && Number.isFinite(state.rating)) {
      scoredTrackItems.push({
        trackNumber: Number(track?.trackNumber) || idx + 1,
        numFormatted: String(Number(track?.trackNumber) || idx + 1).padStart(2, '0'),
        trackName: sanitizeCardText(track?.trackName, 'Track ' + String(idx + 1)),
        rating: state.rating,
        ratingFormatted: state.rating.toFixed(1),
        tierColor: getThemeTierColor(state.rating, theme),
        interlude: Boolean(state.interlude)
      });
    }
  });

  const cleanVerdict = sanitizeCardText(verdict, '').slice(0, 160);
  const albumTitle = sanitizeCardText(album?.collectionName, 'Untitled Album');
  const artistName = sanitizeCardText(album?.artistName, 'Unknown Artist');
  const genreName = sanitizeCardText(album?.primaryGenreName, 'Music');

  const standoutHighlight = formatHighlightSummary(
    metrics.highestTracks,
    metrics.highestRating,
    theme
  );
  const lowestHighlight = formatHighlightSummary(
    metrics.lowestTracks,
    metrics.lowestRating,
    theme
  );

  const artworkUrl = album?.artworkUrl100
    ? getHighResArtwork(album.artworkUrl100, 600)
    : '';

  return {
    isShareable: hasValidScore,
    theme,
    albumTitle,
    artistName,
    genreName,
    releaseYear: hasReleaseYear ? rawYear : '',
    artworkUrl,
    overallScore: hasValidScore ? metrics.overallScore : null,
    formattedScore: hasValidScore ? metrics.formattedScore : '--.-',
    tierLabel: hasValidScore ? tierDetails.label : 'Unrated',
    tierColor,
    totalTracks: metrics.totalTracks,
    ratedCount: metrics.ratedCount,
    includedCount: metrics.includedCount,
    scoredCount: metrics.scoredCount,
    standoutHighlight,
    lowestHighlight,
    scoredTracks: scoredTrackItems,
    verdict: cleanVerdict,
    hasVerdict: cleanVerdict.length > 0,
    filename: buildSanitizedCardFilename(artistName, albumTitle)
  };
}

/**
 * Waits for document.fonts.ready when supported by the browser.
 */
export async function waitForCanvasFonts(timeoutMs = 2200) {
  if (typeof document === 'undefined' || !document.fonts || !document.fonts.ready) {
    return;
  }
  let timerId = null;
  try {
    await Promise.race([
      document.fonts.ready,
      new Promise((resolve) => {
        timerId = setTimeout(resolve, timeoutMs);
      })
    ]);
  } catch {
    // Proceed with fallback system fonts if font loading fails
  } finally {
    if (timerId) clearTimeout(timerId);
  }
}

/**
 * Loads album artwork with crossOrigin = "anonymous" and verifies that drawing it
 * does not taint the 2D canvas. Caches valid images in memory.
 */
export async function loadCorsSafeArtwork(artworkUrl, timeoutMs = 5500) {
  const cleanUrl = sanitizeCardText(artworkUrl, '');
  if (!cleanUrl || typeof Image === 'undefined' || cleanUrl.startsWith('data:')) {
    return null;
  }

  if (artworkMemoryCache.has(cleanUrl)) {
    return artworkMemoryCache.get(cleanUrl);
  }

  return new Promise((resolve) => {
    const img = new Image();
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (timerId) clearTimeout(timerId);
      if (result) {
        artworkMemoryCache.set(cleanUrl, result);
      }
      resolve(result);
    };

    const timerId = setTimeout(() => {
      finish(null);
    }, timeoutMs);

    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        if (typeof document !== 'undefined') {
          const testCanvas = document.createElement('canvas');
          testCanvas.width = 2;
          testCanvas.height = 2;
          const testCtx = testCanvas.getContext('2d');
          if (testCtx) {
            testCtx.drawImage(img, 0, 0, 2, 2);
            testCtx.getImageData(0, 0, 1, 1);
          }
        }
        finish(img);
      } catch {
        // Image tainted the canvas due to CORS restriction; use procedural fallback
        finish(null);
      }
    };

    img.onerror = () => {
      finish(null);
    };

    img.src = cleanUrl;
  });
}

/**
 * Draws a rounded rectangle path on a 2D canvas context.
 */
function traceRoundedRect(ctx, x, y, width, height, radius) {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function fillRoundedRect(ctx, x, y, width, height, radius, fillStyle, strokeStyle = null, lineWidth = 1) {
  ctx.save();
  traceRoundedRect(ctx, x, y, width, height, radius);
  if (fillStyle) {
    ctx.fillStyle = fillStyle;
    ctx.fill();
  }
  if (strokeStyle) {
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Truncates single-line text with an ellipsis so its measured pixel width <= maxWidth.
 */
export function fitTextWithEllipsis(ctx, text, maxWidth) {
  const safe = sanitizeCardText(text, '');
  if (!safe || maxWidth <= 0) return '';

  if (ctx.measureText(safe).width <= maxWidth) {
    return safe;
  }

  const ellipsis = '\u2026';
  let low = 0;
  let high = safe.length;
  let best = '';

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const candidate = safe.slice(0, mid).trimEnd() + ellipsis;
    if (ctx.measureText(candidate).width <= maxWidth) {
      best = candidate;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return best || ellipsis;
}

/**
 * Wraps text into at most maxLines lines within maxWidth, applying ellipsis on the last line.
 */
export function wrapTextLines(ctx, text, maxWidth, maxLines = 2) {
  const safe = sanitizeCardText(text, '');
  if (!safe) return [];

  const words = safe.split(' ');
  const lines = [];
  let currentLine = '';

  for (let i = 0; i < words.length; i += 1) {
    const word = words[i];
    const testLine = currentLine ? currentLine + ' ' + word : word;

    if (ctx.measureText(testLine).width <= maxWidth) {
      currentLine = testLine;
    } else {
      if (lines.length + 1 >= maxLines) {
        const remaining = currentLine ? currentLine + ' ' + words.slice(i).join(' ') : words.slice(i).join(' ');
        lines.push(fitTextWithEllipsis(ctx, remaining, maxWidth));
        return lines;
      }
      if (currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        lines.push(fitTextWithEllipsis(ctx, word, maxWidth));
        currentLine = '';
      }
    }
  }

  if (currentLine) {
    if (lines.length < maxLines) {
      lines.push(fitTextWithEllipsis(ctx, currentLine, maxWidth));
    }
  }

  return lines;
}

/**
 * Draws either the loaded CORS-safe album cover or a refined archival vinyl rateplay fallback.
 */
function drawAlbumArtwork(ctx, img, x, y, size, payload) {
  const { theme, albumTitle, artistName } = payload;

  ctx.save();
  traceRoundedRect(ctx, x, y, size, size, 16);
  ctx.clip();

  if (img) {
    ctx.drawImage(img, x, y, size, size);
  } else {
    // Procedural editorial vinyl/rateplay fallback when artwork is unavailable or CORS-blocked
    ctx.fillStyle = theme.bgElevated;
    ctx.fillRect(x, y, size, size);

    const cx = x + size / 2;
    const cy = y + size / 2;

    // Vinyl grooves
    const outerRadius = size * 0.38;
    ctx.beginPath();
    ctx.arc(cx, cy, outerRadius, 0, Math.PI * 2);
    ctx.fillStyle = theme.isLight ? '#1C1C21' : '#0B0B0C';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = theme.borderStrong;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, outerRadius * 0.72, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(232, 168, 56, 0.28)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Center label
    ctx.beginPath();
    ctx.arc(cx, cy, outerRadius * 0.34, 0, Math.PI * 2);
    ctx.fillStyle = theme.accent;
    ctx.fill();

    // Initials on center label
    const initials =
      sanitizeCardText(albumTitle, 'RP')
        .replace(/[^a-zA-Z0-9 ]+/g, '')
        .trim()
        .slice(0, 2)
        .toUpperCase() || 'RP';

    ctx.fillStyle = '#0B0B0C';
    ctx.font = '700 ' + String(Math.round(size * 0.085)) + 'px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initials, cx, cy);

    // Subtle archival caption at bottom of cover
    ctx.fillStyle = theme.textMuted;
    ctx.font = '600 ' + String(Math.round(size * 0.036)) + 'px "JetBrains Mono", monospace';
    ctx.fillText(
      fitTextWithEllipsis(ctx, artistName.toUpperCase(), size - 40),
      cx,
      y + size - 22
    );
  }

  ctx.restore();

  // Crisp 1.5px inner architectural frame
  traceRoundedRect(ctx, x, y, size, size, 16);
  ctx.lineWidth = 2;
  ctx.strokeStyle = theme.isLight ? 'rgba(18, 18, 20, 0.14)' : 'rgba(255, 255, 255, 0.12)';
  ctx.stroke();
}

/**
 * Renders the complete 1080x1920 RATEPLAY social review graphic onto a <canvas>.
 */
export function renderReviewCardToCanvas(canvas, payload, artworkImage = null) {
  if (!canvas || typeof canvas.getContext !== 'function') {
    throw new Error('Valid HTMLCanvasElement is required to render the review card.');
  }

  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Unable to initialize 2D Canvas rendering context.');
  }

  const { theme } = payload;
  const padX = 72;
  const contentW = CARD_WIDTH - padX * 2; // 936px

  ctx.save();
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';

  // 1. Canvas Background
  ctx.fillStyle = theme.bgCanvas;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // Signal theme atmospheric backdrop treatment
  if (theme.id === 'signal') {
    if (artworkImage) {
      ctx.save();
      ctx.globalAlpha = 0.16;
      ctx.drawImage(artworkImage, -120, -60, CARD_WIDTH + 240, 820);
      ctx.restore();
    }
    ctx.fillStyle = 'rgba(8, 8, 10, 0.78)';
    ctx.fillRect(0, 0, CARD_WIDTH, 820);
  }

  // Outer architectural border frame
  ctx.strokeStyle = theme.borderSubtle;
  ctx.lineWidth = 2;
  ctx.strokeRect(28, 28, CARD_WIDTH - 56, CARD_HEIGHT - 56);

  // Top accent bar (6px height inside frame)
  ctx.fillStyle = theme.accent;
  ctx.fillRect(28, 28, CARD_WIDTH - 56, 6);

  // -----------------------------------------------------------------------
  // 2. Editorial Header (y = 76 .. 148)
  // -----------------------------------------------------------------------
  const headerY = 82;

  // Brand emblem icon (rateplay + vinyl disc)
  fillRoundedRect(ctx, padX, headerY, 34, 42, 4, theme.bgSurface, theme.textPrimary, 2.5);
  ctx.fillStyle = theme.accent;
  ctx.fillRect(padX + 7, headerY + 9, 16, 4);

  ctx.beginPath();
  ctx.arc(padX + 38, headerY + 21, 17, 0, Math.PI * 2);
  ctx.fillStyle = theme.accent;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(padX + 38, headerY + 21, 5, 0, Math.PI * 2);
  ctx.fillStyle = theme.bgCanvas;
  ctx.fill();

  // Brand Wordmark
  ctx.fillStyle = theme.textPrimary;
  ctx.font = '700 32px "Space Grotesk", sans-serif';
  ctx.fillText('RATEPLAY', padX + 68, headerY + 26);

  ctx.fillStyle = theme.textMuted;
  ctx.font = '500 13px "JetBrains Mono", monospace';
  ctx.fillText('LISTEN IN FULL', padX + 68, headerY + 44);

  // Right Header Pill: ALBUM REVIEW [+ Release Year]
  const headerBadgeText = payload.releaseYear
    ? 'ALBUM REVIEW // ' + payload.releaseYear
    : 'ALBUM REVIEW';
  ctx.font = '700 15px "JetBrains Mono", monospace';
  const badgeTextW = ctx.measureText(headerBadgeText).width;
  const badgeW = badgeTextW + 36;
  const badgeX = CARD_WIDTH - padX - badgeW;

  fillRoundedRect(ctx, badgeX, headerY + 4, badgeW, 36, 18, theme.bgSurface, theme.borderStrong, 1.5);
  ctx.fillStyle = theme.accent;
  ctx.textAlign = 'center';
  ctx.fillText(headerBadgeText, badgeX + badgeW / 2, headerY + 27);
  ctx.textAlign = 'left';

  // Header divider hairline
  ctx.strokeStyle = theme.borderSubtle;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(padX, 146);
  ctx.lineTo(CARD_WIDTH - padX, 146);
  ctx.stroke();

  // -----------------------------------------------------------------------
  // 3. Album Identity & Main Score Block (y = 174 .. 690)
  // -----------------------------------------------------------------------
  const heroTopY = 176;
  const coverSize = theme.id === 'signal' ? 380 : 360;

  // Draw Album Cover Artwork on Left
  drawAlbumArtwork(ctx, artworkImage, padX, heroTopY, coverSize, payload);

  // Right Identity & Score Column
  const infoX = padX + coverSize + 44;
  const infoW = CARD_WIDTH - padX - infoX;
  let cursorY = heroTopY + 12;

  // Metadata Pill: Release Year + Genre
  const metaLine = [
    payload.releaseYear ? payload.releaseYear : null,
    payload.genreName ? payload.genreName.toUpperCase() : null
  ]
    .filter(Boolean)
    .join('  \u00B7  ');

  ctx.fillStyle = theme.accent;
  ctx.font = '700 16px "JetBrains Mono", monospace';
  ctx.fillText(fitTextWithEllipsis(ctx, metaLine, infoW), infoX, cursorY + 14);
  cursorY += 46;

  // Album Title (up to 2 lines, bold Space Grotesk)
  ctx.fillStyle = theme.textPrimary;
  ctx.font = '700 44px "Space Grotesk", sans-serif';
  const titleLines = wrapTextLines(ctx, payload.albumTitle, infoW, 2);
  titleLines.forEach((line) => {
    ctx.fillText(line, infoX, cursorY + 34);
    cursorY += 50;
  });

  // Artist Name
  cursorY += 6;
  ctx.fillStyle = theme.textSecondary;
  ctx.font = '600 26px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(fitTextWithEllipsis(ctx, payload.artistName, infoW), infoX, cursorY + 20);
  cursorY += 46;

  // Prominent Score Card Box inside Right Column
  const scoreBoxH = 148;
  const scoreBoxY = Math.max(cursorY + 8, heroTopY + coverSize - scoreBoxH);
  fillRoundedRect(
    ctx,
    infoX,
    scoreBoxY,
    infoW,
    scoreBoxH,
    14,
    theme.bgSurface,
    theme.borderStrong,
    2
  );

  // Left accent bar on score box
  ctx.fillStyle = payload.tierColor;
  ctx.fillRect(infoX, scoreBoxY + 14, 6, scoreBoxH - 28);

  // Score Label & Tier Pill
  ctx.fillStyle = theme.textMuted;
  ctx.font = '700 14px "JetBrains Mono", monospace';
  ctx.fillText('OVERALL ALBUM SCORE', infoX + 26, scoreBoxY + 34);

  // Large Tabular Score Readout
  ctx.fillStyle = payload.tierColor;
  ctx.font = '700 74px "JetBrains Mono", monospace';
  const scoreStr = sanitizeCardText(payload.formattedScore, '--.-');
  ctx.fillText(scoreStr, infoX + 24, scoreBoxY + 114);
  const scoreDigitsW = ctx.measureText(scoreStr).width;

  ctx.fillStyle = theme.textMuted;
  ctx.font = '500 22px "JetBrains Mono", monospace';
  ctx.fillText('/ 10', infoX + 32 + scoreDigitsW, scoreBoxY + 110);

  // Rating Tier Badge + Scored Track Ratio on right side of Score Box
  const tierBadgeText = sanitizeCardText(payload.tierLabel, 'Unrated').toUpperCase();
  ctx.font = '700 16px "JetBrains Mono", monospace';
  const tierTextW = ctx.measureText(tierBadgeText).width;
  const tierPillW = tierTextW + 30;
  const tierPillX = infoX + infoW - tierPillW - 22;
  const tierPillY = scoreBoxY + 46;

  fillRoundedRect(
    ctx,
    tierPillX,
    tierPillY,
    tierPillW,
    36,
    8,
    theme.bgElevated,
    payload.tierColor,
    1.5
  );
  ctx.fillStyle = payload.tierColor;
  ctx.textAlign = 'center';
  ctx.fillText(tierBadgeText, tierPillX + tierPillW / 2, tierPillY + 24);

  const scoredCountCaption =
    String(payload.scoredCount) +
    ' / ' +
    String(payload.totalTracks || payload.scoredCount) +
    ' SCORED';
  ctx.fillStyle = theme.textSecondary;
  ctx.font = '600 14px "JetBrains Mono", monospace';
  ctx.textAlign = 'right';
  ctx.fillText(scoredCountCaption, infoX + infoW - 22, scoreBoxY + 112);
  ctx.textAlign = 'left';

  let sectionY = Math.max(heroTopY + coverSize, scoreBoxY + scoreBoxH) + 34;

  // -----------------------------------------------------------------------
  // 4. Track Highlights Row (Standout & Lowest-Rated Tracks)
  // -----------------------------------------------------------------------
  const highlightGap = 24;
  const highlightBoxW = (contentW - highlightGap) / 2;
  const highlightBoxH = 128;

  const drawHighlightBox = (boxX, label, highlightData, topBorderColor) => {
    fillRoundedRect(
      ctx,
      boxX,
      sectionY,
      highlightBoxW,
      highlightBoxH,
      12,
      theme.bgSurface,
      theme.borderSubtle,
      1.5
    );

    // Top semantic accent rule
    ctx.fillStyle = topBorderColor;
    ctx.fillRect(boxX + 14, sectionY, highlightBoxW - 28, 3);

    ctx.fillStyle = theme.textMuted;
    ctx.font = '700 14px "JetBrains Mono", monospace';
    ctx.fillText(label, boxX + 22, sectionY + 34);

    if (!highlightData) {
      ctx.fillStyle = theme.textMuted;
      ctx.font = '500 18px "Plus Jakarta Sans", sans-serif';
      ctx.fillText('Not enough scored tracks', boxX + 22, sectionY + 76);
      return;
    }

    // Score pill in top-right of highlight card
    ctx.font = '700 18px "JetBrains Mono", monospace';
    const hlScoreText = highlightData.scoreText;
    const hlScoreW = ctx.measureText(hlScoreText).width + 24;
    const hlScoreX = boxX + highlightBoxW - hlScoreW - 18;

    fillRoundedRect(
      ctx,
      hlScoreX,
      sectionY + 14,
      hlScoreW,
      30,
      6,
      theme.bgElevated,
      highlightData.scoreColor,
      1.5
    );
    ctx.fillStyle = highlightData.scoreColor;
    ctx.textAlign = 'center';
    ctx.fillText(hlScoreText, hlScoreX + hlScoreW / 2, sectionY + 35);
    ctx.textAlign = 'left';

    // Track Title
    ctx.fillStyle = theme.textPrimary;
    ctx.font = '700 22px "Plus Jakarta Sans", sans-serif';
    const maxTitleW = highlightBoxW - 44;
    ctx.fillText(
      fitTextWithEllipsis(ctx, highlightData.primaryLine, maxTitleW),
      boxX + 22,
      sectionY + 76
    );

    // Tie subtitle or status caption
    ctx.fillStyle = theme.textSecondary;
    ctx.font = '500 14px "JetBrains Mono", monospace';
    const subCaption = highlightData.tieSubtitle || 'INCLUDED IN ALBUM SCORE';
    ctx.fillText(
      fitTextWithEllipsis(ctx, subCaption, maxTitleW),
      boxX + 22,
      sectionY + 106
    );
  };

  drawHighlightBox(
    padX,
    'STANDOUT TRACK',
    payload.standoutHighlight,
    theme.isLight ? '#059669' : '#10B981'
  );
  drawHighlightBox(
    padX + highlightBoxW + highlightGap,
    'LOWEST-RATED TRACK',
    payload.lowestHighlight,
    theme.isLight ? '#64748B' : '#94A3B8'
  );

  sectionY += highlightBoxH + 32;

  // -----------------------------------------------------------------------
  // 5. Optional Verdict Block + Track Rating List Allocation
  // -----------------------------------------------------------------------
  const footerTopY = 1812;
  const verdictBlockH = payload.hasVerdict ? 148 : 0;
  const verdictGap = payload.hasVerdict ? 28 : 0;
  const tracklistPanelH = footerTopY - sectionY - verdictBlockH - verdictGap - 28;

  // Draw Track Rating List Panel
  fillRoundedRect(
    ctx,
    padX,
    sectionY,
    contentW,
    tracklistPanelH,
    14,
    theme.bgSurface,
    theme.borderSubtle,
    1.5
  );

  // Panel Header
  fillRoundedRect(
    ctx,
    padX,
    sectionY,
    contentW,
    56,
    14,
    theme.bgElevated,
    null,
    0
  );
  ctx.strokeStyle = theme.borderSubtle;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(padX, sectionY + 56);
  ctx.lineTo(padX + contentW, sectionY + 56);
  ctx.stroke();

  ctx.fillStyle = theme.textPrimary;
  ctx.font = '700 18px "Space Grotesk", sans-serif';
  ctx.fillText('RATED TRACKLIST LOG', padX + 26, sectionY + 35);

  const trackHeaderMeta =
    String(payload.scoredTracks.length) +
    (payload.scoredTracks.length === 1 ? ' SCORED TRACK' : ' SCORED TRACKS') +
    (payload.ratedCount > payload.scoredCount
      ? '  \u00B7  ' + String(payload.ratedCount - payload.scoredCount) + ' EXCLUDED'
      : '');
  ctx.fillStyle = theme.textMuted;
  ctx.font = '600 14px "JetBrains Mono", monospace';
  ctx.textAlign = 'right';
  ctx.fillText(trackHeaderMeta, padX + contentW - 26, sectionY + 34);
  ctx.textAlign = 'left';

  // Render Track Rows inside Panel
  const listAreaTop = sectionY + 72;
  const listAreaH = tracklistPanelH - 88;
  const tracksToRender = payload.scoredTracks;

  if (tracksToRender.length === 0) {
    ctx.fillStyle = theme.textMuted;
    ctx.font = '500 22px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(
      'Rate and include tracks to populate the tracklist log.',
      CARD_WIDTH / 2,
      listAreaTop + listAreaH / 2
    );
    ctx.textAlign = 'left';
  } else {
    const useTwoColumns = tracksToRender.length > 10;
    const maxRowsPerCol = useTwoColumns ? 12 : 10;
    const maxVisibleTracks = useTwoColumns ? maxRowsPerCol * 2 : maxRowsPerCol;
    const hasOverflow = tracksToRender.length > maxVisibleTracks;
    const visibleLimit = hasOverflow ? maxVisibleTracks - 1 : tracksToRender.length;
    const visibleTracks = tracksToRender.slice(0, visibleLimit);

    const colCount = useTwoColumns ? 2 : 1;
    const colGap = 28;
    const colW = (contentW - 52 - (colCount - 1) * colGap) / colCount;
    const rowsInFirstCol = useTwoColumns
      ? Math.min(maxRowsPerCol, Math.ceil((visibleTracks.length + (hasOverflow ? 1 : 0)) / 2))
      : visibleTracks.length;
    const rowH = Math.min(62, Math.floor(listAreaH / Math.max(1, rowsInFirstCol)));

    visibleTracks.forEach((tr, idx) => {
      const colIdx = useTwoColumns ? Math.floor(idx / rowsInFirstCol) : 0;
      const rowIdx = useTwoColumns ? idx % rowsInFirstCol : idx;

      const rowX = padX + 26 + colIdx * (colW + colGap);
      const rowY = listAreaTop + rowIdx * rowH;

      // Subtle alternating row fill
      if (rowIdx % 2 === 0) {
        fillRoundedRect(
          ctx,
          rowX,
          rowY + 2,
          colW,
          rowH - 6,
          8,
          theme.bgCanvas,
          theme.borderSubtle,
          1
        );
      }

      const textBaselineY = rowY + Math.round(rowH * 0.62);

      // Track number
      ctx.fillStyle = theme.textMuted;
      ctx.font = '600 16px "JetBrains Mono", monospace';
      ctx.fillText(tr.numFormatted, rowX + 14, textBaselineY);

      // Rating pill on right of row
      ctx.font = '700 17px "JetBrains Mono", monospace';
      const pillW = 62;
      const pillH = Math.min(32, rowH - 12);
      const pillX = rowX + colW - pillW - 12;
      const pillY = rowY + Math.round((rowH - pillH) / 2) - 1;

      fillRoundedRect(ctx, pillX, pillY, pillW, pillH, 6, theme.bgElevated, tr.tierColor, 1.5);
      ctx.fillStyle = tr.tierColor;
      ctx.textAlign = 'center';
      ctx.fillText(tr.ratingFormatted, pillX + pillW / 2, pillY + Math.round(pillH * 0.72));
      ctx.textAlign = 'left';

      // Track Title (truncated cleanly so it never collides with score pill)
      const titleStartX = rowX + 54;
      const maxTrackTitleW = pillX - titleStartX - 14;
      ctx.fillStyle = theme.textPrimary;
      ctx.font = useTwoColumns
        ? '600 18px "Plus Jakarta Sans", sans-serif'
        : '600 20px "Plus Jakarta Sans", sans-serif';
      ctx.fillText(
        fitTextWithEllipsis(ctx, tr.trackName, maxTrackTitleW),
        titleStartX,
        textBaselineY
      );
    });

    if (hasOverflow) {
      const remainingCount = tracksToRender.length - visibleLimit;
      const overflowIdx = visibleTracks.length;
      const colIdx = useTwoColumns ? Math.floor(overflowIdx / rowsInFirstCol) : 0;
      const rowIdx = useTwoColumns ? overflowIdx % rowsInFirstCol : overflowIdx;
      const rowX = padX + 26 + colIdx * (colW + colGap);
      const rowY = listAreaTop + rowIdx * rowH;

      fillRoundedRect(
        ctx,
        rowX,
        rowY + 2,
        colW,
        rowH - 6,
        8,
        theme.accentSoft,
        theme.accent,
        1
      );
      ctx.fillStyle = theme.accent;
      ctx.font = '700 16px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(
        '+' + String(remainingCount) + ' MORE SCORED TRACKS',
        rowX + colW / 2,
        rowY + Math.round(rowH * 0.62)
      );
      ctx.textAlign = 'left';
    }
  }

  sectionY += tracklistPanelH + verdictGap;

  // -----------------------------------------------------------------------
  // 6. Optional Editorial Verdict Box (Only drawn when verdict exists)
  // -----------------------------------------------------------------------
  if (payload.hasVerdict) {
    fillRoundedRect(
      ctx,
      padX,
      sectionY,
      contentW,
      verdictBlockH,
      14,
      theme.bgSurface,
      theme.borderStrong,
      1.5
    );

    ctx.fillStyle = theme.accent;
    ctx.fillRect(padX, sectionY + 16, 5, verdictBlockH - 32);

    ctx.fillStyle = theme.accent;
    ctx.font = '700 13px "JetBrains Mono", monospace';
    ctx.fillText('VERDICT // LINER NOTE', padX + 26, sectionY + 34);

    ctx.fillStyle = theme.textPrimary;
    ctx.font = '600 23px "Plus Jakarta Sans", sans-serif';
    const quotedVerdict = '\u201C' + payload.verdict + '\u201D';
    const verdictLines = wrapTextLines(ctx, quotedVerdict, contentW - 52, 2);
    verdictLines.forEach((line, idx) => {
      ctx.fillText(line, padX + 26, sectionY + 74 + idx * 34);
    });
  }

  // -----------------------------------------------------------------------
  // 7. Subtle Editorial Footer (y = 1812 .. 1868)
  // -----------------------------------------------------------------------
  ctx.strokeStyle = theme.borderSubtle;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(padX, footerTopY);
  ctx.lineTo(CARD_WIDTH - padX, footerTopY);
  ctx.stroke();

  ctx.fillStyle = theme.textMuted;
  ctx.font = '700 16px "JetBrains Mono", monospace';
  ctx.fillText('RATEPLAY // LISTEN IN FULL', padX, footerTopY + 38);

  const footerRightText =
    'RATED ' +
    String(payload.ratedCount) +
    ' OF ' +
    String(payload.totalTracks || payload.ratedCount) +
    ' TRACKS  \u00B7  1080\u00D71920 ARCHIVAL CARD';
  ctx.textAlign = 'right';
  ctx.font = '500 15px "JetBrains Mono", monospace';
  ctx.fillText(footerRightText, CARD_WIDTH - padX, footerTopY + 38);
  ctx.textAlign = 'left';

  ctx.restore();

  return {
    width: canvas.width,
    height: canvas.height,
    themeId: theme.id,
    filename: payload.filename,
    usedFallbackArtwork: !artworkImage
  };
}

/**
 * Full async rendering pipeline: waits for fonts, loads CORS-safe artwork,
 * and renders the 1080x1920 review card onto the target canvas.
 */
export async function generateReviewCardOnCanvas(canvas, rawOptions = {}) {
  const payload = prepareReviewCardPayload(rawOptions);
  await waitForCanvasFonts();
  const artworkImg = await loadCorsSafeArtwork(payload.artworkUrl);
  const renderResult = renderReviewCardToCanvas(canvas, payload, artworkImg);
  return {
    payload,
    renderResult
  };
}

/**
 * Exports a rendered <canvas> to a PNG Blob (or DataURL fallback) and triggers a browser download.
 */
export async function downloadCanvasAsPng(canvas, filename) {
  if (!canvas || typeof document === 'undefined') {
    throw new Error('Canvas download requires a browser document environment.');
  }

  const safeFilename = sanitizeCardText(filename, 'RATEPLAY - Album Review.png');

  const triggerDownloadUrl = (url, revokeAfter = false) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = safeFilename;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    if (revokeAfter && typeof URL !== 'undefined' && URL.revokeObjectURL) {
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    }
  };

  if (typeof canvas.toBlob === 'function') {
    const blob = await new Promise((resolve) => {
      try {
        canvas.toBlob((b) => resolve(b), 'image/png');
      } catch {
        resolve(null);
      }
    });

    if (blob && typeof URL !== 'undefined' && URL.createObjectURL) {
      const objectUrl = URL.createObjectURL(blob);
      triggerDownloadUrl(objectUrl, true);
      return { filename: safeFilename, method: 'blob' };
    }
  }

  const dataUrl = canvas.toDataURL('image/png');
  triggerDownloadUrl(dataUrl, false);
  return { filename: safeFilename, method: 'dataurl' };
}

// === PHASE 6 PART 1: SHAREABLE TASTE PROFILE CARD GENERATOR ===

/**
 * Generates a clean, filesystem-safe filename for the exported Taste Profile PNG.
 */
export function buildSanitizedProfileFilename(customLabel = 'Taste Profile') {
  const safePart = sanitizeCardText(customLabel, 'Taste Profile')
    .replace(/[<>:"/\\|?*\x00-\x1F]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 50) || 'Taste Profile';
  return 'RATEPLAY - ' + safePart + '.png';
}

/**
 * Prepares the normalized payload for rendering a 1080x1920 Music Taste Profile Card.
 */
export function prepareTasteProfileCardPayload({
  ratingsMap = {},
  metadataMap = {},
  themeId = 'obsidian',
  curatedList = undefined
} = {}) {
  const theme = resolveCardTheme(themeId);
  const profile = buildMusicTasteProfile(
    ratingsMap,
    metadataMap,
    {
      topAlbumsLimit: 4,
      topArtistsLimit: 4,
      recentAlbumsLimit: 3
    },
    curatedList
  );

  const hasAvg =
    profile.averageRating !== null && Number.isFinite(profile.averageRating);
  const avgTierDetails = getTierDetails(profile.averageRating);
  const avgTierColor = theme.isLight ? avgTierDetails.hexLight : avgTierDetails.hexDark;

  const topAlbums = profile.highestRatedAlbums.map((alb, idx) => {
    const tierDet = getTierDetails(alb.overallScore);
    return {
      rank: '#' + String(idx + 1).padStart(2, '0'),
      collectionId: alb.collectionId,
      title: sanitizeCardText(alb.collectionName, 'Untitled Album'),
      artist: sanitizeCardText(alb.artistName, 'Unknown Artist'),
      year: alb.releaseYear && alb.releaseYear !== '----' ? alb.releaseYear : '',
      scoreText: alb.formattedScore ? sanitizeCardText(alb.formattedScore, '--.-') : '--.-',
      scoreColor: theme.isLight ? tierDet.hexLight : tierDet.hexDark,
      artworkUrl: alb.coverUrl || ''
    };
  });

  const topArtists = profile.mostFrequentArtists.map((art, idx) => {
    const hasArtScore = art.averageScore !== null && Number.isFinite(art.averageScore);
    const tierDet = getTierDetails(art.averageScore);
    return {
      rank: '#' + String(idx + 1).padStart(2, '0'),
      artistName: sanitizeCardText(art.artistName, 'Unknown Artist'),
      albumCountText:
        String(art.albumCount) + ' ' + (art.albumCount === 1 ? 'ALBUM' : 'ALBUMS'),
      trackCountText:
        String(art.ratedTrackCount) + ' ' + (art.ratedTrackCount === 1 ? 'TRACK' : 'TRACKS'),
      topAlbumTitle: sanitizeCardText(art.topAlbumTitle, ''),
      avgScoreText: hasArtScore ? sanitizeCardText(art.formattedAverageScore, '--.-') : '--.-',
      scoreColor: hasArtScore
        ? theme.isLight
          ? tierDet.hexLight
          : tierDet.hexDark
        : theme.textMuted
    };
  });

  const recentAlbums = profile.recentlyRatedAlbums.map((alb) => {
    const hasAlbScore = alb.overallScore !== null && Number.isFinite(alb.overallScore);
    const tierDet = getTierDetails(alb.overallScore);
    const dateLabel = alb.updatedAt
      ? formatUpdatedTimestamp(alb.updatedAt)
      : 'Saved in archive';
    return {
      title: sanitizeCardText(alb.collectionName, 'Untitled Album'),
      artist: sanitizeCardText(alb.artistName, 'Unknown Artist'),
      dateLabel: sanitizeCardText(dateLabel, 'Saved'),
      scoreText: hasAlbScore ? sanitizeCardText(alb.formattedScore, '--.-') : '--.-',
      scoreColor: hasAlbScore
        ? theme.isLight
          ? tierDet.hexLight
          : tierDet.hexDark
        : theme.textMuted,
      artworkUrl: alb.coverUrl || ''
    };
  });

  // Collect up to 4 distinct cover URLs for the mosaic
  const mosaicCandidateEntries =
    profile.highestRatedAlbums.length > 0
      ? profile.highestRatedAlbums
      : profile.recentlyRatedAlbums;

  const mosaicItems = mosaicCandidateEntries.slice(0, 4).map((alb) => ({
    title: sanitizeCardText(alb.collectionName, 'RP'),
    artist: sanitizeCardText(alb.artistName, 'RATEPLAY'),
    artworkUrl: alb.coverUrl || ''
  }));

  return {
    isShareable: profile.isShareable,
    theme,
    totalRatedAlbums: profile.totalRatedAlbums,
    scoredAlbumsCount: profile.scoredAlbumsCount,
    totalRatedTracks: profile.totalRatedTracks,
    totalScoredTracks: profile.totalScoredTracks,
    averageRating: hasAvg ? profile.averageRating : null,
    formattedAverageRating: hasAvg ? sanitizeCardText(profile.formattedAverageRating, '--.-') : '--.-',
    averageTierLabel: hasAvg ? sanitizeCardText(avgTierDetails.label, 'Rated') : 'Unrated',
    averageTierColor: hasAvg ? avgTierColor : theme.textMuted,
    topAlbums,
    topArtists,
    recentAlbums,
    mosaicItems,
    filename: buildSanitizedProfileFilename('Taste Profile')
  };
}

/**
 * Renders the 1080x1920 Music Taste Profile graphic onto an HTMLCanvasElement.
 */
export function renderTasteProfileCardToCanvas(canvas, payload, loadedImagesMap = {}) {
  if (!canvas || typeof canvas.getContext !== 'function') {
    throw new Error('Valid HTMLCanvasElement is required to render the taste profile card.');
  }

  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Unable to initialize 2D Canvas rendering context.');
  }

  const { theme } = payload;
  const padX = 72;
  const contentW = CARD_WIDTH - padX * 2; // 936px
  const safeImages =
    loadedImagesMap && typeof loadedImagesMap === 'object' ? loadedImagesMap : {};

  ctx.save();
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';

  // 1. Canvas Background
  ctx.fillStyle = theme.bgCanvas;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  if (theme.id === 'signal') {
    const firstHeroUrl = payload.mosaicItems[0]?.artworkUrl;
    const heroImg = firstHeroUrl ? safeImages[firstHeroUrl] : null;
    if (heroImg) {
      ctx.save();
      ctx.globalAlpha = 0.15;
      ctx.drawImage(heroImg, -120, -60, CARD_WIDTH + 240, 720);
      ctx.restore();
    }
    ctx.fillStyle = 'rgba(8, 8, 10, 0.8)';
    ctx.fillRect(0, 0, CARD_WIDTH, 720);
  }

  // Architectural outer frame + top accent bar
  ctx.strokeStyle = theme.borderSubtle;
  ctx.lineWidth = 2;
  ctx.strokeRect(28, 28, CARD_WIDTH - 56, CARD_HEIGHT - 56);

  ctx.fillStyle = theme.accent;
  ctx.fillRect(28, 28, CARD_WIDTH - 56, 6);

  // -----------------------------------------------------------------------
  // 2. Editorial Header (y = 82 .. 146)
  // -----------------------------------------------------------------------
  const headerY = 82;

  fillRoundedRect(ctx, padX, headerY, 34, 42, 4, theme.bgSurface, theme.textPrimary, 2.5);
  ctx.fillStyle = theme.accent;
  ctx.fillRect(padX + 7, headerY + 9, 16, 4);

  ctx.beginPath();
  ctx.arc(padX + 38, headerY + 21, 17, 0, Math.PI * 2);
  ctx.fillStyle = theme.accent;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(padX + 38, headerY + 21, 5, 0, Math.PI * 2);
  ctx.fillStyle = theme.bgCanvas;
  ctx.fill();

  ctx.fillStyle = theme.textPrimary;
  ctx.font = '700 32px "Space Grotesk", sans-serif';
  ctx.fillText('RATEPLAY', padX + 68, headerY + 26);

  ctx.fillStyle = theme.textMuted;
  ctx.font = '500 13px "JetBrains Mono", monospace';
  ctx.fillText('LISTEN IN FULL', padX + 68, headerY + 44);

  const headerBadgeText = 'MUSIC TASTE PROFILE';
  ctx.font = '700 15px "JetBrains Mono", monospace';
  const badgeW = ctx.measureText(headerBadgeText).width + 36;
  const badgeX = CARD_WIDTH - padX - badgeW;

  fillRoundedRect(ctx, badgeX, headerY + 4, badgeW, 36, 18, theme.bgSurface, theme.borderStrong, 1.5);
  ctx.fillStyle = theme.accent;
  ctx.textAlign = 'center';
  ctx.fillText(headerBadgeText, badgeX + badgeW / 2, headerY + 27);
  ctx.textAlign = 'left';

  ctx.strokeStyle = theme.borderSubtle;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(padX, 146);
  ctx.lineTo(CARD_WIDTH - padX, 146);
  ctx.stroke();

  // -----------------------------------------------------------------------
  // 3. Hero Overview & 2x2 Cover Mosaic (y = 172 .. 492)
  // -----------------------------------------------------------------------
  const heroY = 172;
  const mosaicSize = 316;
  const statsW = contentW - mosaicSize - 32;

  // Left Summary Box
  fillRoundedRect(
    ctx,
    padX,
    heroY,
    statsW,
    mosaicSize,
    16,
    theme.bgSurface,
    theme.borderStrong,
    2
  );

  ctx.fillStyle = theme.accent;
  ctx.fillRect(padX, heroY + 18, 6, mosaicSize - 36);

  ctx.fillStyle = theme.accent;
  ctx.font = '700 15px "JetBrains Mono", monospace';
  ctx.fillText('LISTENER ARCHIVE SUMMARY', padX + 28, heroY + 40);

  ctx.fillStyle = theme.textPrimary;
  ctx.font = '700 38px "Space Grotesk", sans-serif';
  ctx.fillText('Personal Rating Index', padX + 28, heroY + 86);

  // Average Score Readout
  ctx.fillStyle = theme.textMuted;
  ctx.font = '700 13px "JetBrains Mono", monospace';
  ctx.fillText('AVERAGE ALBUM RATING', padX + 28, heroY + 132);

  ctx.fillStyle = payload.averageTierColor;
  ctx.font = '700 72px "JetBrains Mono", monospace';
  const avgStr = sanitizeCardText(payload.formattedAverageRating, '--.-');
  ctx.fillText(avgStr, padX + 28, heroY + 204);
  const avgW = ctx.measureText(avgStr).width;

  ctx.fillStyle = theme.textMuted;
  ctx.font = '500 22px "JetBrains Mono", monospace';
  ctx.fillText('/ 10', padX + 36 + avgW, heroY + 200);

  // Tier Badge Pill
  const tierText = sanitizeCardText(payload.averageTierLabel, 'Unrated').toUpperCase();
  ctx.font = '700 15px "JetBrains Mono", monospace';
  const tierPillW = ctx.measureText(tierText).width + 28;
  const tierPillX = padX + statsW - tierPillW - 24;
  fillRoundedRect(
    ctx,
    tierPillX,
    heroY + 148,
    tierPillW,
    34,
    8,
    theme.bgElevated,
    payload.averageTierColor,
    1.5
  );
  ctx.fillStyle = payload.averageTierColor;
  ctx.textAlign = 'center';
  ctx.fillText(tierText, tierPillX + tierPillW / 2, heroY + 170);
  ctx.textAlign = 'left';

  // Bottom Counters inside Left Summary Box
  ctx.strokeStyle = theme.borderSubtle;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(padX + 28, heroY + 234);
  ctx.lineTo(padX + statsW - 24, heroY + 234);
  ctx.stroke();

  const counterColW = (statsW - 52) / 2;
  ctx.fillStyle = theme.textMuted;
  ctx.font = '700 12px "JetBrains Mono", monospace';
  ctx.fillText('TOTAL RATED ALBUMS', padX + 28, heroY + 260);
  ctx.fillText('INDIVIDUAL TRACKS RATED', padX + 28 + counterColW, heroY + 260);

  ctx.fillStyle = theme.textPrimary;
  ctx.font = '700 28px "JetBrains Mono", monospace';
  ctx.fillText(
    String(payload.totalRatedAlbums) +
      ' ' +
      (payload.totalRatedAlbums === 1 ? 'LP' : 'LPs'),
    padX + 28,
    heroY + 294
  );
  ctx.fillText(
    String(payload.totalRatedTracks) +
      ' ' +
      (payload.totalRatedTracks === 1 ? 'TRACK' : 'TRACKS'),
    padX + 28 + counterColW,
    heroY + 294
  );

  // Right 2x2 Album Artwork Mosaic
  const mosaicX = padX + statsW + 32;
  const cellGap = 12;
  const cellSize = (mosaicSize - cellGap) / 2;

  for (let slot = 0; slot < 4; slot += 1) {
    const col = slot % 2;
    const row = Math.floor(slot / 2);
    const cx = mosaicX + col * (cellSize + cellGap);
    const cy = heroY + row * (cellSize + cellGap);
    const item = payload.mosaicItems[slot] || payload.mosaicItems[0] || {
      title: 'RP',
      artist: 'RATEPLAY',
      artworkUrl: ''
    };
    const imgObj = item.artworkUrl ? safeImages[item.artworkUrl] || null : null;
    drawAlbumArtwork(
      ctx,
      imgObj,
      cx,
      cy,
      cellSize,
      {
        theme,
        albumTitle: item.title,
        artistName: item.artist
      }
    );
  }

  let sectionY = heroY + mosaicSize + 34;

  // -----------------------------------------------------------------------
  // 4. Highest-Rated Albums Section (y = 522 .. 994)
  // -----------------------------------------------------------------------
  const topAlbumsH = 468;
  fillRoundedRect(
    ctx,
    padX,
    sectionY,
    contentW,
    topAlbumsH,
    14,
    theme.bgSurface,
    theme.borderSubtle,
    1.5
  );

  fillRoundedRect(ctx, padX, sectionY, contentW, 54, 14, theme.bgElevated, null, 0);
  ctx.strokeStyle = theme.borderSubtle;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(padX, sectionY + 54);
  ctx.lineTo(padX + contentW, sectionY + 54);
  ctx.stroke();

  ctx.fillStyle = theme.textPrimary;
  ctx.font = '700 18px "Space Grotesk", sans-serif';
  ctx.fillText('HIGHEST-RATED ALBUMS', padX + 26, sectionY + 34);

  ctx.fillStyle = theme.accent;
  ctx.font = '600 13px "JetBrains Mono", monospace';
  ctx.textAlign = 'right';
  ctx.fillText('TOP SCORED PRESSINGS', padX + contentW - 26, sectionY + 34);
  ctx.textAlign = 'left';

  if (payload.topAlbums.length === 0) {
    ctx.fillStyle = theme.textMuted;
    ctx.font = '500 20px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(
      'Rate and include tracks on any album to rank your highest-rated records.',
      CARD_WIDTH / 2,
      sectionY + topAlbumsH / 2 + 12
    );
    ctx.textAlign = 'left';
  } else {
    const rowStartY = sectionY + 68;
    const rowH = 94;

    payload.topAlbums.slice(0, 4).forEach((alb, idx) => {
      const ry = rowStartY + idx * rowH;
      fillRoundedRect(
        ctx,
        padX + 22,
        ry,
        contentW - 44,
        rowH - 10,
        10,
        theme.bgCanvas,
        theme.borderSubtle,
        1
      );

      // Rank label
      ctx.fillStyle = theme.accent;
      ctx.font = '700 18px "JetBrains Mono", monospace';
      ctx.fillText(alb.rank, padX + 40, ry + 50);

      // Mini cover artwork (64x64)
      const thumbSize = 64;
      const thumbX = padX + 94;
      const thumbY = ry + 10;
      const albImg = alb.artworkUrl ? safeImages[alb.artworkUrl] || null : null;
      drawAlbumArtwork(ctx, albImg, thumbX, thumbY, thumbSize, {
        theme,
        albumTitle: alb.title,
        artistName: alb.artist
      });

      // Score pill on right
      const pillW = 86;
      const pillH = 44;
      const pillX = padX + contentW - 44 - pillW;
      const pillY = ry + 20;
      fillRoundedRect(ctx, pillX, pillY, pillW, pillH, 8, theme.bgElevated, alb.scoreColor, 1.5);
      ctx.fillStyle = alb.scoreColor;
      ctx.font = '700 22px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(alb.scoreText, pillX + pillW / 2, pillY + 30);
      ctx.textAlign = 'left';

      // Album title + artist/year
      const textX = thumbX + thumbSize + 20;
      const maxTextW = pillX - textX - 20;
      ctx.fillStyle = theme.textPrimary;
      ctx.font = '700 22px "Space Grotesk", sans-serif';
      ctx.fillText(fitTextWithEllipsis(ctx, alb.title, maxTextW), textX, ry + 38);

      const subLine = alb.year ? alb.artist + '  \u00B7  ' + alb.year : alb.artist;
      ctx.fillStyle = theme.textSecondary;
      ctx.font = '500 17px "Plus Jakarta Sans", sans-serif';
      ctx.fillText(fitTextWithEllipsis(ctx, subLine, maxTextW), textX, ry + 66);
    });
  }

  sectionY += topAlbumsH + 28;

  // -----------------------------------------------------------------------
  // 5. Most Frequently Rated Artists Section (y = 1018 .. 1434)
  // -----------------------------------------------------------------------
  const topArtistsH = 412;
  fillRoundedRect(
    ctx,
    padX,
    sectionY,
    contentW,
    topArtistsH,
    14,
    theme.bgSurface,
    theme.borderSubtle,
    1.5
  );

  fillRoundedRect(ctx, padX, sectionY, contentW, 54, 14, theme.bgElevated, null, 0);
  ctx.strokeStyle = theme.borderSubtle;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(padX, sectionY + 54);
  ctx.lineTo(padX + contentW, sectionY + 54);
  ctx.stroke();

  ctx.fillStyle = theme.textPrimary;
  ctx.font = '700 18px "Space Grotesk", sans-serif';
  ctx.fillText('MOST FREQUENTLY RATED ARTISTS', padX + 26, sectionY + 34);

  ctx.fillStyle = theme.textMuted;
  ctx.font = '600 13px "JetBrains Mono", monospace';
  ctx.textAlign = 'right';
  ctx.fillText('BY RATED CATALOG DEPTH', padX + contentW - 26, sectionY + 34);
  ctx.textAlign = 'left';

  if (payload.topArtists.length === 0) {
    ctx.fillStyle = theme.textMuted;
    ctx.font = '500 20px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(
      'No rated artists in your library yet.',
      CARD_WIDTH / 2,
      sectionY + topArtistsH / 2 + 12
    );
    ctx.textAlign = 'left';
  } else {
    const gridX = padX + 22;
    const gridY = sectionY + 72;
    const colGap = 20;
    const rowGap = 18;
    const cardW = (contentW - 44 - colGap) / 2;
    const cardH = 148;

    payload.topArtists.slice(0, 4).forEach((art, idx) => {
      const col = idx % 2;
      const row = Math.floor(idx / 2);
      const ax = gridX + col * (cardW + colGap);
      const ay = gridY + row * (cardH + rowGap);

      fillRoundedRect(ctx, ax, ay, cardW, cardH, 10, theme.bgCanvas, theme.borderSubtle, 1.5);
      ctx.fillStyle = art.scoreColor;
      ctx.fillRect(ax + 14, ay, cardW - 28, 3);

      // Rank + Album/Track count
      ctx.fillStyle = theme.accent;
      ctx.font = '700 14px "JetBrains Mono", monospace';
      ctx.fillText(
        art.rank + '  //  ' + art.albumCountText + ' \u00B7 ' + art.trackCountText,
        ax + 20,
        ay + 34
      );

      // Average Score Pill in top right of artist card
      ctx.font = '700 16px "JetBrains Mono", monospace';
      const scoreBadge = 'AVG ' + art.avgScoreText;
      const sbW = ctx.measureText(scoreBadge).width + 20;
      const sbX = ax + cardW - sbW - 16;
      fillRoundedRect(ctx, sbX, ay + 14, sbW, 28, 6, theme.bgElevated, art.scoreColor, 1);
      ctx.fillStyle = art.scoreColor;
      ctx.textAlign = 'center';
      ctx.fillText(scoreBadge, sbX + sbW / 2, ay + 33);
      ctx.textAlign = 'left';

      // Artist Name
      ctx.fillStyle = theme.textPrimary;
      ctx.font = '700 24px "Space Grotesk", sans-serif';
      ctx.fillText(fitTextWithEllipsis(ctx, art.artistName, cardW - 40), ax + 20, ay + 78);

      // Top album caption
      const topLabel = art.topAlbumTitle
        ? 'Top Record: ' + art.topAlbumTitle
        : 'Rated in personal library';
      ctx.fillStyle = theme.textSecondary;
      ctx.font = '500 15px "Plus Jakarta Sans", sans-serif';
      ctx.fillText(fitTextWithEllipsis(ctx, topLabel, cardW - 40), ax + 20, ay + 114);
    });
  }

  sectionY += topArtistsH + 28;

  // -----------------------------------------------------------------------
  // 6. Recently Rated Activity Strip (y = 1458 .. 1784)
  // -----------------------------------------------------------------------
  const footerTopY = 1812;
  const recentPanelH = footerTopY - sectionY - 26;

  fillRoundedRect(
    ctx,
    padX,
    sectionY,
    contentW,
    recentPanelH,
    14,
    theme.bgSurface,
    theme.borderSubtle,
    1.5
  );

  fillRoundedRect(ctx, padX, sectionY, contentW, 50, 14, theme.bgElevated, null, 0);
  ctx.strokeStyle = theme.borderSubtle;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(padX, sectionY + 50);
  ctx.lineTo(padX + contentW, sectionY + 50);
  ctx.stroke();

  ctx.fillStyle = theme.textPrimary;
  ctx.font = '700 17px "Space Grotesk", sans-serif';
  ctx.fillText('RECENTLY RATED ACTIVITY', padX + 26, sectionY + 32);

  ctx.fillStyle = theme.textMuted;
  ctx.font = '600 13px "JetBrains Mono", monospace';
  ctx.textAlign = 'right';
  ctx.fillText('LATEST LOGGED ENTRIES', padX + contentW - 26, sectionY + 32);
  ctx.textAlign = 'left';

  if (payload.recentAlbums.length > 0) {
    const recGap = 18;
    const recCols = Math.min(3, payload.recentAlbums.length);
    const recCardW = (contentW - 44 - (recCols - 1) * recGap) / recCols;
    const recCardH = recentPanelH - 74;
    const recY = sectionY + 62;

    payload.recentAlbums.slice(0, 3).forEach((rec, idx) => {
      const rx = padX + 22 + idx * (recCardW + recGap);
      fillRoundedRect(
        ctx,
        rx,
        recY,
        recCardW,
        recCardH,
        10,
        theme.bgCanvas,
        theme.borderSubtle,
        1
      );

      // Score badge on top right
      ctx.font = '700 16px "JetBrains Mono", monospace';
      const scW = 58;
      const scX = rx + recCardW - scW - 14;
      fillRoundedRect(ctx, scX, recY + 14, scW, 28, 6, theme.bgElevated, rec.scoreColor, 1);
      ctx.fillStyle = rec.scoreColor;
      ctx.textAlign = 'center';
      ctx.fillText(rec.scoreText, scX + scW / 2, recY + 33);
      ctx.textAlign = 'left';

      // Date stamp
      ctx.fillStyle = theme.textMuted;
      ctx.font = '600 12px "JetBrains Mono", monospace';
      ctx.fillText(
        fitTextWithEllipsis(ctx, rec.dateLabel.toUpperCase(), scX - rx - 24),
        rx + 16,
        recY + 32
      );

      // Album title
      ctx.fillStyle = theme.textPrimary;
      ctx.font = '700 19px "Space Grotesk", sans-serif';
      ctx.fillText(
        fitTextWithEllipsis(ctx, rec.title, recCardW - 32),
        rx + 16,
        recY + 72
      );

      // Artist name
      ctx.fillStyle = theme.textSecondary;
      ctx.font = '500 15px "Plus Jakarta Sans", sans-serif';
      ctx.fillText(
        fitTextWithEllipsis(ctx, rec.artist, recCardW - 32),
        rx + 16,
        recY + 98
      );
    });
  }

  // -----------------------------------------------------------------------
  // 7. Editorial Footer (y = 1812 .. 1868)
  // -----------------------------------------------------------------------
  ctx.strokeStyle = theme.borderSubtle;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(padX, footerTopY);
  ctx.lineTo(CARD_WIDTH - padX, footerTopY);
  ctx.stroke();

  ctx.fillStyle = theme.textMuted;
  ctx.font = '700 16px "JetBrains Mono", monospace';
  ctx.fillText('RATEPLAY // LISTEN IN FULL', padX, footerTopY + 38);

  const footerRightText =
    String(payload.totalRatedAlbums) +
    ' RATED ALBUMS  \u00B7  1080\u00D71920 TASTE PROFILE CARD';
  ctx.textAlign = 'right';
  ctx.font = '500 15px "JetBrains Mono", monospace';
  ctx.fillText(footerRightText, CARD_WIDTH - padX, footerTopY + 38);
  ctx.textAlign = 'left';

  ctx.restore();

  return {
    width: canvas.width,
    height: canvas.height,
    themeId: theme.id,
    filename: payload.filename
  };
}

/**
 * Full async rendering pipeline for the 1080x1920 Music Taste Profile Card:
 * Waits for fonts, loads CORS-safe artwork for top/mosaic albums in parallel,
 * and renders onto the target <canvas>.
 */
export async function generateTasteProfileCardOnCanvas(canvas, rawOptions = {}) {
  const payload = prepareTasteProfileCardPayload(rawOptions);
  await waitForCanvasFonts();

  const urlsToLoad = new Set();
  payload.mosaicItems.forEach((item) => {
    if (item.artworkUrl) urlsToLoad.add(item.artworkUrl);
  });
  payload.topAlbums.forEach((alb) => {
    if (alb.artworkUrl) urlsToLoad.add(alb.artworkUrl);
  });

  const loadedImagesMap = {};
  await Promise.all(
    Array.from(urlsToLoad).map(async (url) => {
      const img = await loadCorsSafeArtwork(url);
      if (img) {
        loadedImagesMap[url] = img;
      }
    })
  );

  const renderResult = renderTasteProfileCardToCanvas(canvas, payload, loadedImagesMap);
  return {
    payload,
    renderResult
  };
}

// === PHASE 7: SHAREABLE LISTENING INSIGHTS 1080x1920 CARD GENERATOR ===

/**
 * Generates a clean, filesystem-safe filename for the exported Listening Insights PNG.
 */
export function buildSanitizedInsightsFilename(customLabel = 'Listening Insights') {
  const safePart =
    sanitizeCardText(customLabel, 'Listening Insights')
      .replace(/[<>:"/\\|?*\x00-\x1F]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 50) || 'Listening Insights';
  return 'RATEPLAY - ' + safePart + '.png';
}

/**
 * Prepares the normalized payload for rendering a 1080x1920 Listening Insights Card.
 */
export function prepareListeningInsightsCardPayload({
  ratingsMap = {},
  metadataMap = {},
  themeId = 'obsidian',
  curatedList = undefined
} = {}) {
  const theme = resolveCardTheme(themeId);
  const insights = buildListeningInsights(ratingsMap, metadataMap, curatedList);
  const dist = insights.ratingDistribution;
  const dna = insights.tasteDna;

  const hasAvg = dist.averageScore !== null && Number.isFinite(dist.averageScore);
  const avgTier = getTierDetails(dist.averageScore);
  const avgColor = hasAvg
    ? theme.isLight
      ? avgTier.hexLight
      : avgTier.hexDark
    : theme.textMuted;

  const hasMedian = dist.medianScore !== null && Number.isFinite(dist.medianScore);

  const topGenres = dna.availableGenres.slice(0, 3).map((g) => ({
    name: sanitizeCardText(g.genreName, 'Genre'),
    countText: String(g.albumCount) + (g.albumCount === 1 ? ' LP' : ' LPs'),
    shareText: String(g.sharePercent) + '%',
    avgText: g.formattedAverageScore ? sanitizeCardText(g.formattedAverageScore, '--.-') : '--.-'
  }));

  const topDecades = insights.decadeBreakdown.preferredDecades.slice(0, 3).map((d) => ({
    label: sanitizeCardText(d.decadeLabel, '----'),
    countText: String(d.albumCount) + (d.albumCount === 1 ? ' LP' : ' LPs'),
    avgText: d.formattedAverageScore ? sanitizeCardText(d.formattedAverageScore, '--.-') : '--.-',
    color: theme.isLight ? d.hexLight : d.hexDark
  }));

  const distributionBars = dist.tierBuckets.map((b) => ({
    label: sanitizeCardText(b.label, 'Tier'),
    rangeLabel: sanitizeCardText(b.rangeLabel, ''),
    count: b.count,
    percentage: b.percentage,
    barWidthPercent: b.barWidthPercent,
    color: theme.isLight ? b.hexLight : b.hexDark
  }));

  const rankedArtists = insights.artistRankings.rankedArtists.slice(0, 4).map((art, idx) => ({
    rank: '#' + String(idx + 1).padStart(2, '0'),
    artistName: sanitizeCardText(art.artistName, 'Unknown Artist'),
    sampleBadge: sanitizeCardText(art.sampleBadgeText, '1 LP SAMPLE'),
    avgText: sanitizeCardText(art.formattedAverageScore, '--.-'),
    color: theme.isLight ? art.hexLight : art.hexDark
  }));

  const hiddenGems = insights.hiddenGems.gems.slice(0, 2).map((gem) => ({
    title: sanitizeCardText(gem.collectionName, 'Untitled Album'),
    artist: sanitizeCardText(gem.artistName, 'Unknown Artist'),
    scoreText: sanitizeCardText(gem.formattedScore, '--.-'),
    tag: sanitizeCardText(gem.criteriaTags[0] || 'LOCAL GEM', 'LOCAL GEM'),
    color: theme.isLight ? gem.hexLight : gem.hexDark,
    artworkUrl: gem.coverUrl || ''
  }));

  const mosaicCandidates =
    insights.hiddenGems.gems.length > 0
      ? insights.hiddenGems.gems
      : insights.allEntries;

  const mosaicItems = mosaicCandidates.slice(0, 4).map((alb) => ({
    title: sanitizeCardText(alb.collectionName, 'RP'),
    artist: sanitizeCardText(alb.artistName, 'RATEPLAY'),
    artworkUrl: alb.coverUrl || ''
  }));

  const cov = dna.metadataCoverage;
  const coverageLine =
    'METADATA COVERAGE: ' +
    String(cov.knownGenreAlbums) +
    '/' +
    String(cov.totalAlbums) +
    ' GENRES  \u00B7  ' +
    String(cov.knownDecadeAlbums) +
    '/' +
    String(cov.totalAlbums) +
    ' DECADES';

  return {
    isShareable: insights.isShareable,
    theme,
    totalRatedAlbums: insights.totalRatedAlbums,
    scoredAlbumsCount: insights.scoredAlbumsCount,
    formattedAverageScore: hasAvg ? sanitizeCardText(dist.formattedAverageScore, '--.-') : '--.-',
    averageTierLabel: hasAvg ? sanitizeCardText(avgTier.label, 'Rated') : 'Unrated',
    averageTierColor: avgColor,
    formattedMedianScore: hasMedian ? sanitizeCardText(dist.formattedMedianScore, '--.-') : '--.-',
    dnaHeadline: sanitizeCardText(dna.dnaHeadline, 'Personal listening insights.'),
    coverageLine,
    topGenres,
    topDecades,
    distributionBars,
    rankedArtists,
    hiddenGems,
    mosaicItems,
    filename: buildSanitizedInsightsFilename('Listening Insights')
  };
}

/**
 * Renders the 1080x1920 Listening Insights graphic onto an HTMLCanvasElement.
 */
export function renderListeningInsightsCardToCanvas(canvas, payload, loadedImagesMap = {}) {
  if (!canvas || typeof canvas.getContext !== 'function') {
    throw new Error('Valid HTMLCanvasElement is required to render the listening insights card.');
  }

  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Unable to initialize 2D Canvas rendering context.');
  }

  const { theme } = payload;
  const padX = 72;
  const contentW = CARD_WIDTH - padX * 2; // 936px
  const safeImages =
    loadedImagesMap && typeof loadedImagesMap === 'object' ? loadedImagesMap : {};

  ctx.save();
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';

  // 1. Canvas Background
  ctx.fillStyle = theme.bgCanvas;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  if (theme.id === 'signal') {
    const heroUrl = payload.mosaicItems[0]?.artworkUrl;
    const heroImg = heroUrl ? safeImages[heroUrl] : null;
    if (heroImg) {
      ctx.save();
      ctx.globalAlpha = 0.14;
      ctx.drawImage(heroImg, -120, -60, CARD_WIDTH + 240, 700);
      ctx.restore();
    }
    ctx.fillStyle = 'rgba(8, 8, 10, 0.82)';
    ctx.fillRect(0, 0, CARD_WIDTH, 700);
  }

  // Outer frame + top accent bar
  ctx.strokeStyle = theme.borderSubtle;
  ctx.lineWidth = 2;
  ctx.strokeRect(28, 28, CARD_WIDTH - 56, CARD_HEIGHT - 56);

  ctx.fillStyle = theme.accent;
  ctx.fillRect(28, 28, CARD_WIDTH - 56, 6);

  // -----------------------------------------------------------------------
  // 2. Editorial Header (y = 82 .. 146)
  // -----------------------------------------------------------------------
  const headerY = 82;

  fillRoundedRect(ctx, padX, headerY, 34, 42, 4, theme.bgSurface, theme.textPrimary, 2.5);
  ctx.fillStyle = theme.accent;
  ctx.fillRect(padX + 7, headerY + 9, 16, 4);

  ctx.beginPath();
  ctx.arc(padX + 38, headerY + 21, 17, 0, Math.PI * 2);
  ctx.fillStyle = theme.accent;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(padX + 38, headerY + 21, 5, 0, Math.PI * 2);
  ctx.fillStyle = theme.bgCanvas;
  ctx.fill();

  ctx.fillStyle = theme.textPrimary;
  ctx.font = '700 32px "Space Grotesk", sans-serif';
  ctx.fillText('RATEPLAY', padX + 68, headerY + 26);

  ctx.fillStyle = theme.textMuted;
  ctx.font = '500 13px "JetBrains Mono", monospace';
  ctx.fillText('LISTEN IN FULL', padX + 68, headerY + 44);

  const badgeText = 'LISTENING INSIGHTS // TASTE DNA';
  ctx.font = '700 15px "JetBrains Mono", monospace';
  const badgeW = ctx.measureText(badgeText).width + 36;
  const badgeX = CARD_WIDTH - padX - badgeW;

  fillRoundedRect(ctx, badgeX, headerY + 4, badgeW, 36, 18, theme.bgSurface, theme.borderStrong, 1.5);
  ctx.fillStyle = theme.accent;
  ctx.textAlign = 'center';
  ctx.fillText(badgeText, badgeX + badgeW / 2, headerY + 27);
  ctx.textAlign = 'left';

  ctx.strokeStyle = theme.borderSubtle;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(padX, 146);
  ctx.lineTo(CARD_WIDTH - padX, 146);
  ctx.stroke();

  // -----------------------------------------------------------------------
  // 3. Hero Overview: Mean, Median, Total Albums & 2x2 Mosaic (y = 172 .. 468)
  // -----------------------------------------------------------------------
  const heroY = 172;
  const mosaicSize = 296;
  const statsW = contentW - mosaicSize - 28;

  fillRoundedRect(ctx, padX, heroY, statsW, mosaicSize, 16, theme.bgSurface, theme.borderStrong, 2);
  ctx.fillStyle = theme.accent;
  ctx.fillRect(padX, heroY + 18, 6, mosaicSize - 36);

  ctx.fillStyle = theme.accent;
  ctx.font = '700 14px "JetBrains Mono", monospace';
  ctx.fillText('TASTE DNA SYNTHESIS', padX + 26, heroY + 38);

  ctx.fillStyle = theme.textPrimary;
  ctx.font = '700 24px "Space Grotesk", sans-serif';
  ctx.fillText(
    fitTextWithEllipsis(ctx, payload.dnaHeadline, statsW - 48),
    padX + 26,
    heroY + 74
  );

  // Mean, Median, and Scored Count Boxes
  const statBoxY = heroY + 98;
  const statBoxH = 128;
  const statColW = (statsW - 52 - 24) / 3;

  const drawHeroMetricBox = (bx, label, valueText, subText, valColor) => {
    fillRoundedRect(ctx, bx, statBoxY, statColW, statBoxH, 10, theme.bgCanvas, theme.borderSubtle, 1.5);
    ctx.fillStyle = theme.textMuted;
    ctx.font = '700 12px "JetBrains Mono", monospace';
    ctx.fillText(label, bx + 16, statBoxY + 28);

    ctx.fillStyle = valColor;
    ctx.font = '700 42px "JetBrains Mono", monospace';
    ctx.fillText(valueText, bx + 16, statBoxY + 80);

    ctx.fillStyle = theme.textSecondary;
    ctx.font = '600 13px "JetBrains Mono", monospace';
    ctx.fillText(fitTextWithEllipsis(ctx, subText, statColW - 28), bx + 16, statBoxY + 110);
  };

  drawHeroMetricBox(
    padX + 26,
    'AVERAGE RATING',
    payload.formattedAverageScore,
    payload.averageTierLabel.toUpperCase(),
    payload.averageTierColor
  );
  drawHeroMetricBox(
    padX + 26 + statColW + 12,
    'MEDIAN RATING',
    payload.formattedMedianScore,
    '50TH PERCENTILE',
    theme.textPrimary
  );
  drawHeroMetricBox(
    padX + 26 + (statColW + 12) * 2,
    'RATED ALBUMS',
    String(payload.totalRatedAlbums),
    String(payload.scoredAlbumsCount) + ' SCORED IN MEAN',
    theme.accent
  );

  // Metadata Coverage Line at bottom of hero box
  ctx.fillStyle = theme.textMuted;
  ctx.font = '600 13px "JetBrains Mono", monospace';
  ctx.fillText(
    fitTextWithEllipsis(ctx, payload.coverageLine, statsW - 52),
    padX + 26,
    heroY + mosaicSize - 22
  );

  // Right 2x2 Mosaic
  const mosaicX = padX + statsW + 28;
  const cellGap = 12;
  const cellSize = (mosaicSize - cellGap) / 2;

  for (let slot = 0; slot < 4; slot += 1) {
    const col = slot % 2;
    const row = Math.floor(slot / 2);
    const cx = mosaicX + col * (cellSize + cellGap);
    const cy = heroY + row * (cellSize + cellGap);
    const item = payload.mosaicItems[slot] || payload.mosaicItems[0] || {
      title: 'RP',
      artist: 'RATEPLAY',
      artworkUrl: ''
    };
    const imgObj = item.artworkUrl ? safeImages[item.artworkUrl] || null : null;
    drawAlbumArtwork(ctx, imgObj, cx, cy, cellSize, {
      theme,
      albumTitle: item.title,
      artistName: item.artist
    });
  }

  let sectionY = heroY + mosaicSize + 28;

  // -----------------------------------------------------------------------
  // 4. Taste DNA: Available Genres & Preferred Decades (y = 496 .. 826)
  // -----------------------------------------------------------------------
  const dnaRowH = 326;
  const halfGap = 24;
  const halfW = (contentW - halfGap) / 2;

  // Left Half: Available Genres
  fillRoundedRect(ctx, padX, sectionY, halfW, dnaRowH, 14, theme.bgSurface, theme.borderSubtle, 1.5);
  fillRoundedRect(ctx, padX, sectionY, halfW, 50, 14, theme.bgElevated, null, 0);
  ctx.fillStyle = theme.textPrimary;
  ctx.font = '700 17px "Space Grotesk", sans-serif';
  ctx.fillText('TASTE DNA // GENRES', padX + 22, sectionY + 32);

  if (payload.topGenres.length === 0) {
    ctx.fillStyle = theme.textMuted;
    ctx.font = '500 17px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('Genre metadata unavailable.', padX + 22, sectionY + 120);
  } else {
    payload.topGenres.forEach((g, idx) => {
      const gy = sectionY + 68 + idx * 80;
      fillRoundedRect(ctx, padX + 18, gy, halfW - 36, 68, 8, theme.bgCanvas, theme.borderSubtle, 1);
      ctx.fillStyle = theme.textPrimary;
      ctx.font = '700 20px "Space Grotesk", sans-serif';
      ctx.fillText(fitTextWithEllipsis(ctx, g.name, halfW - 190), padX + 34, gy + 30);

      ctx.fillStyle = theme.textSecondary;
      ctx.font = '600 14px "JetBrains Mono", monospace';
      ctx.fillText(g.countText + '  \u00B7  ' + g.shareText + ' OF KNOWN', padX + 34, gy + 54);

      ctx.fillStyle = theme.accent;
      ctx.font = '700 18px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      ctx.fillText('AVG ' + g.avgText, padX + halfW - 34, gy + 42);
      ctx.textAlign = 'left';
    });
  }

  // Right Half: Preferred Decades
  const rightX = padX + halfW + halfGap;
  fillRoundedRect(ctx, rightX, sectionY, halfW, dnaRowH, 14, theme.bgSurface, theme.borderSubtle, 1.5);
  fillRoundedRect(ctx, rightX, sectionY, halfW, 50, 14, theme.bgElevated, null, 0);
  ctx.fillStyle = theme.textPrimary;
  ctx.font = '700 17px "Space Grotesk", sans-serif';
  ctx.fillText('DECADE BREAKDOWN', rightX + 22, sectionY + 32);

  if (payload.topDecades.length === 0) {
    ctx.fillStyle = theme.textMuted;
    ctx.font = '500 17px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('Release decades unavailable.', rightX + 22, sectionY + 120);
  } else {
    payload.topDecades.forEach((d, idx) => {
      const dy = sectionY + 68 + idx * 80;
      fillRoundedRect(ctx, rightX + 18, dy, halfW - 36, 68, 8, theme.bgCanvas, theme.borderSubtle, 1);
      ctx.fillStyle = theme.textPrimary;
      ctx.font = '700 22px "Space Grotesk", sans-serif';
      ctx.fillText(d.label, rightX + 34, dy + 32);

      ctx.fillStyle = theme.textSecondary;
      ctx.font = '600 14px "JetBrains Mono", monospace';
      ctx.fillText(d.countText + ' RATED', rightX + 34, dy + 54);

      ctx.fillStyle = d.color;
      ctx.font = '700 18px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      ctx.fillText('AVG ' + d.avgText, rightX + halfW - 34, dy + 42);
      ctx.textAlign = 'left';
    });
  }

  sectionY += dnaRowH + 26;

  // -----------------------------------------------------------------------
  // 5. Rating Distribution Histogram (y = 848 .. 1228)
  // -----------------------------------------------------------------------
  const distH = 376;
  fillRoundedRect(ctx, padX, sectionY, contentW, distH, 14, theme.bgSurface, theme.borderSubtle, 1.5);
  fillRoundedRect(ctx, padX, sectionY, contentW, 50, 14, theme.bgElevated, null, 0);

  ctx.fillStyle = theme.textPrimary;
  ctx.font = '700 17px "Space Grotesk", sans-serif';
  ctx.fillText('RATING DISTRIBUTION // BY SCORE TIER', padX + 24, sectionY + 32);

  ctx.fillStyle = theme.textMuted;
  ctx.font = '600 13px "JetBrains Mono", monospace';
  ctx.textAlign = 'right';
  ctx.fillText(
    'MEAN ' + payload.formattedAverageScore + '  \u00B7  MEDIAN ' + payload.formattedMedianScore,
    padX + contentW - 24,
    sectionY + 32
  );
  ctx.textAlign = 'left';

  const barStartY = sectionY + 68;
  const barRowH = 58;
  const barTrackX = padX + 250;
  const barTrackW = contentW - 250 - 150;

  payload.distributionBars.forEach((b, idx) => {
    const by = barStartY + idx * barRowH;

    ctx.fillStyle = theme.textPrimary;
    ctx.font = '700 17px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(b.label, padX + 24, by + 26);

    ctx.fillStyle = theme.textMuted;
    ctx.font = '500 13px "JetBrains Mono", monospace';
    ctx.fillText(b.rangeLabel, padX + 148, by + 26);

    // Bar track background
    fillRoundedRect(ctx, barTrackX, by + 8, barTrackW, 24, 6, theme.bgCanvas, theme.borderSubtle, 1);

    // Filled bar
    if (b.count > 0) {
      const fillW = Math.max(18, Math.round((b.barWidthPercent / 100) * barTrackW));
      fillRoundedRect(ctx, barTrackX, by + 8, fillW, 24, 6, b.color, null, 0);
    }

    // Count + percentage readout
    const countLabel = String(b.count) + ' (' + String(b.percentage) + '%)';
    ctx.fillStyle = b.count > 0 ? theme.textPrimary : theme.textMuted;
    ctx.font = '700 15px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.fillText(countLabel, padX + contentW - 24, by + 26);
    ctx.textAlign = 'left';
  });

  sectionY += distH + 26;

  // -----------------------------------------------------------------------
  // 6. Artist Rankings (with Sample Sizes) & Hidden Gems (y = 1250 .. 1784)
  // -----------------------------------------------------------------------
  const footerTopY = 1812;
  const bottomRowH = footerTopY - sectionY - 26;

  // Left Half: Artist Rankings with Sample Sizes
  fillRoundedRect(ctx, padX, sectionY, halfW, bottomRowH, 14, theme.bgSurface, theme.borderSubtle, 1.5);
  fillRoundedRect(ctx, padX, sectionY, halfW, 50, 14, theme.bgElevated, null, 0);
  ctx.fillStyle = theme.textPrimary;
  ctx.font = '700 17px "Space Grotesk", sans-serif';
  ctx.fillText('ARTIST RANKINGS (SAMPLE-WEIGHTED)', padX + 22, sectionY + 32);

  if (payload.rankedArtists.length === 0) {
    ctx.fillStyle = theme.textMuted;
    ctx.font = '500 17px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('No scored artists yet.', padX + 22, sectionY + 120);
  } else {
    payload.rankedArtists.slice(0, 4).forEach((art, idx) => {
      const ay = sectionY + 66 + idx * 112;
      fillRoundedRect(ctx, padX + 18, ay, halfW - 36, 98, 10, theme.bgCanvas, theme.borderSubtle, 1);

      ctx.fillStyle = theme.accent;
      ctx.font = '700 14px "JetBrains Mono", monospace';
      ctx.fillText(art.rank + '  //  ' + art.sampleBadge, padX + 34, ay + 30);

      ctx.fillStyle = theme.textPrimary;
      ctx.font = '700 22px "Space Grotesk", sans-serif';
      ctx.fillText(fitTextWithEllipsis(ctx, art.artistName, halfW - 160), padX + 34, ay + 68);

      ctx.fillStyle = art.color;
      ctx.font = '700 22px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      ctx.fillText(art.avgText, padX + halfW - 34, ay + 64);
      ctx.textAlign = 'left';
    });
  }

  // Right Half: Hidden Gems
  fillRoundedRect(ctx, rightX, sectionY, halfW, bottomRowH, 14, theme.bgSurface, theme.borderSubtle, 1.5);
  fillRoundedRect(ctx, rightX, sectionY, halfW, 50, 14, theme.bgElevated, null, 0);
  ctx.fillStyle = theme.textPrimary;
  ctx.font = '700 17px "Space Grotesk", sans-serif';
  ctx.fillText('HIDDEN GEMS // LOCAL LIBRARY', rightX + 22, sectionY + 32);

  if (payload.hiddenGems.length === 0) {
    ctx.fillStyle = theme.textMuted;
    ctx.font = '500 17px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('Rate albums 7.5+ to surface hidden gems.', rightX + 22, sectionY + 120);
  } else {
    payload.hiddenGems.slice(0, 2).forEach((gem, idx) => {
      const gy = sectionY + 68 + idx * 196;
      fillRoundedRect(ctx, rightX + 18, gy, halfW - 36, 178, 10, theme.bgCanvas, theme.borderSubtle, 1);

      ctx.fillStyle = theme.accent;
      ctx.font = '700 13px "JetBrains Mono", monospace';
      ctx.fillText(fitTextWithEllipsis(ctx, gem.tag, halfW - 150), rightX + 34, gy + 34);

      ctx.fillStyle = gem.color;
      ctx.font = '700 22px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      ctx.fillText(gem.scoreText, rightX + halfW - 34, gy + 36);
      ctx.textAlign = 'left';

      ctx.fillStyle = theme.textPrimary;
      ctx.font = '700 23px "Space Grotesk", sans-serif';
      ctx.fillText(fitTextWithEllipsis(ctx, gem.title, halfW - 68), rightX + 34, gy + 82);

      ctx.fillStyle = theme.textSecondary;
      ctx.font = '500 18px "Plus Jakarta Sans", sans-serif';
      ctx.fillText(fitTextWithEllipsis(ctx, gem.artist, halfW - 68), rightX + 34, gy + 114);

      ctx.fillStyle = theme.textMuted;
      ctx.font = '500 13px "JetBrains Mono", monospace';
      ctx.fillText('HIGH SCORE \u00B7 LOW LIBRARY SAMPLE SIZE', rightX + 34, gy + 150);
    });
  }

  // -----------------------------------------------------------------------
  // 7. Editorial Footer (y = 1812 .. 1868)
  // -----------------------------------------------------------------------
  ctx.strokeStyle = theme.borderSubtle;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(padX, footerTopY);
  ctx.lineTo(CARD_WIDTH - padX, footerTopY);
  ctx.stroke();

  ctx.fillStyle = theme.textMuted;
  ctx.font = '700 16px "JetBrains Mono", monospace';
  ctx.fillText('RATEPLAY // LISTEN IN FULL', padX, footerTopY + 38);

  const footerRightText =
    String(payload.totalRatedAlbums) +
    ' RATED ALBUMS  \u00B7  1080\u00D71920 LISTENING INSIGHTS CARD';
  ctx.textAlign = 'right';
  ctx.font = '500 15px "JetBrains Mono", monospace';
  ctx.fillText(footerRightText, CARD_WIDTH - padX, footerTopY + 38);
  ctx.textAlign = 'left';

  ctx.restore();

  return {
    width: canvas.width,
    height: canvas.height,
    themeId: theme.id,
    filename: payload.filename
  };
}

/**
 * Full async rendering pipeline for the 1080x1920 Listening Insights Card.
 */
export async function generateListeningInsightsCardOnCanvas(canvas, rawOptions = {}) {
  const payload = prepareListeningInsightsCardPayload(rawOptions);
  await waitForCanvasFonts();

  const urlsToLoad = new Set();
  payload.mosaicItems.forEach((item) => {
    if (item.artworkUrl) urlsToLoad.add(item.artworkUrl);
  });

  const loadedImagesMap = {};
  await Promise.all(
    Array.from(urlsToLoad).map(async (url) => {
      const img = await loadCorsSafeArtwork(url);
      if (img) {
        loadedImagesMap[url] = img;
      }
    })
  );

  const renderResult = renderListeningInsightsCardToCanvas(canvas, payload, loadedImagesMap);
  return {
    payload,
    renderResult
  };
}

// === PHASE 9B: SHAREABLE 1080x1920 COLLECTION POSTER GENERATOR ===

function trimSurroundingDotsAndSpaces(str) {
  let start = 0;
  let end = str.length;
  while (start < end && (str[start] === '.' || str[start] === ' ')) start += 1;
  while (end > start && (str[end - 1] === '.' || str[end - 1] === ' ')) end -= 1;
  return str.slice(start, end);
}

/**
 * Generates a clean, filesystem-safe filename for a Collection Poster PNG.
 */
export function buildSanitizedCollectionPosterFilename(collectionTitle = 'Collection') {
  const raw = sanitizeCardText(collectionTitle, 'Collection');
  const cleaned = trimSurroundingDotsAndSpaces(
    raw
      .replace(/[<>:"/\\|?*\x00-\x1F]+/g, ' ')
      .replace(/\s+/g, ' ')
  );
  const safeTitle = cleaned.slice(0, 56) || 'Collection';
  return 'RATEPLAY - Collection - ' + safeTitle + '.png';
}

/**
 * Prepares the normalized payload for rendering a 1080x1920 Collection Poster.
 */
export function prepareCollectionPosterPayload({
  collectionId = null,
  collection = null,
  ratingsMap = getSavedRatingsMap(),
  metadataMap = getAlbumCatalogCacheMap(),
  journalMap = getSavedJournalMap(),
  themeId = 'obsidian',
  curatedList = undefined
} = {}) {
  const theme = resolveCardTheme(themeId);
  const rawCol =
    collection || (collectionId ? getCustomCollection(collectionId) : null);

  const fallbackCol = {
    id: 'col-preview',
    title: 'Untitled Collection',
    description: '',
    type: 'manual',
    theme: 'obsidian',
    albumIds: [],
    smartRules: {}
  };

  const enriched =
    buildEnrichedCollection(
      rawCol?.id || collectionId || 'col-preview',
      rawCol || fallbackCol,
      ratingsMap,
      metadataMap,
      curatedList,
      journalMap
    ) ||
    buildEnrichedCollection(
      'col-preview',
      fallbackCol,
      ratingsMap,
      metadataMap,
      curatedList,
      journalMap
    );

  const hasAvg =
    enriched.averageScore !== null && Number.isFinite(enriched.averageScore);
  const avgTier = getTierDetails(enriched.averageScore);
  const avgTierColor = hasAvg
    ? theme.isLight
      ? avgTier.hexLight
      : avgTier.hexDark
    : theme.textMuted;

  const cleanDesc = sanitizeCardText(enriched.description, '').slice(0, 260);
  const isSmart = Boolean(enriched.isSmart);

  const rulesSubtitle = isSmart
    ? sanitizeCardText(enriched.rulesSummaryText, 'Dynamic Smart Collection')
    : 'Curated Record Shelf';

  const mosaicItems = enriched.albums.slice(0, 4).map((alb) => ({
    title: sanitizeCardText(alb.collectionName, 'RP'),
    artist: sanitizeCardText(alb.artistName, 'RATEPLAY'),
    artworkUrl: alb.artworkUrl100 ? getHighResArtwork(alb.artworkUrl100, 600) : ''
  }));

  const featuredAlbums = enriched.albums.slice(0, 12).map((alb, idx) => {
    const hasAlbScore = alb.overallScore !== null && Number.isFinite(alb.overallScore);
    const tierDet = getTierDetails(alb.overallScore);
    return {
      rank: '#' + String(idx + 1).padStart(2, '0'),
      title: sanitizeCardText(alb.collectionName, 'Untitled Album'),
      artist: sanitizeCardText(alb.artistName, 'Unknown Artist'),
      year: alb.releaseYear && alb.releaseYear !== '----' ? alb.releaseYear : '',
      scoreText: hasAlbScore ? sanitizeCardText(alb.formattedScore, '--.-') : 'UNRATED',
      scoreColor: hasAlbScore
        ? theme.isLight
          ? tierDet.hexLight
          : tierDet.hexDark
        : theme.textMuted,
      artworkUrl: alb.artworkUrl100 ? getHighResArtwork(alb.artworkUrl100, 600) : ''
    };
  });

  return {
    isShareable: true,
    theme,
    collectionId: enriched.id,
    collectionTitle: sanitizeCardText(enriched.title, 'Untitled Collection'),
    description: cleanDesc,
    hasDescription: cleanDesc.length > 0,
    isSmart,
    rulesSubtitle,
    activeRulePills: (enriched.activeRulePills || []).map((p) =>
      sanitizeCardText(p.fullText, '')
    ).filter(Boolean),
    albumCount: enriched.albumCount,
    scoredAlbumCount: enriched.scoredAlbumCount,
    formattedAverageScore: hasAvg
      ? sanitizeCardText(enriched.formattedAverageScore, '--.-')
      : '--.-',
    averageTierLabel: hasAvg ? sanitizeCardText(avgTier.label, 'Rated') : 'Unrated',
    averageTierColor: avgTierColor,
    mosaicItems,
    featuredAlbums,
    remainingAlbumsCount: Math.max(0, enriched.albumCount - featuredAlbums.length),
    filename: buildSanitizedCollectionPosterFilename(enriched.title)
  };
}

/**
 * Renders a 1080x1920 Collection Poster onto an HTMLCanvasElement.
 */
export function renderCollectionPosterToCanvas(canvas, payload, loadedImagesMap = {}) {
  if (!canvas || typeof canvas.getContext !== 'function') {
    throw new Error('Valid HTMLCanvasElement is required to render the collection poster.');
  }

  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Unable to initialize 2D Canvas rendering context.');
  }

  const { theme } = payload;
  const padX = 72;
  const contentW = CARD_WIDTH - padX * 2; // 936px
  const safeImages =
    loadedImagesMap && typeof loadedImagesMap === 'object' ? loadedImagesMap : {};

  ctx.save();
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';

  // 1. Canvas Background
  ctx.fillStyle = theme.bgCanvas;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  if (theme.id === 'signal') {
    const heroUrl = payload.mosaicItems[0]?.artworkUrl;
    const heroImg = heroUrl ? safeImages[heroUrl] : null;
    if (heroImg) {
      ctx.save();
      ctx.globalAlpha = 0.16;
      ctx.drawImage(heroImg, -120, -60, CARD_WIDTH + 240, 740);
      ctx.restore();
    }
    ctx.fillStyle = 'rgba(8, 8, 10, 0.8)';
    ctx.fillRect(0, 0, CARD_WIDTH, 740);
  }

  // Outer architectural frame + top accent bar
  ctx.strokeStyle = theme.borderSubtle;
  ctx.lineWidth = 2;
  ctx.strokeRect(28, 28, CARD_WIDTH - 56, CARD_HEIGHT - 56);

  ctx.fillStyle = theme.accent;
  ctx.fillRect(28, 28, CARD_WIDTH - 56, 6);

  // -----------------------------------------------------------------------
  // 2. Editorial Header (y = 82 .. 146)
  // -----------------------------------------------------------------------
  const headerY = 82;

  fillRoundedRect(ctx, padX, headerY, 34, 42, 4, theme.bgSurface, theme.textPrimary, 2.5);
  ctx.fillStyle = theme.accent;
  ctx.fillRect(padX + 7, headerY + 9, 16, 4);

  ctx.beginPath();
  ctx.arc(padX + 38, headerY + 21, 17, 0, Math.PI * 2);
  ctx.fillStyle = theme.accent;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(padX + 38, headerY + 21, 5, 0, Math.PI * 2);
  ctx.fillStyle = theme.bgCanvas;
  ctx.fill();

  ctx.fillStyle = theme.textPrimary;
  ctx.font = '700 32px "Space Grotesk", sans-serif';
  ctx.fillText('RATEPLAY', padX + 68, headerY + 26);

  ctx.fillStyle = theme.textMuted;
  ctx.font = '500 13px "JetBrains Mono", monospace';
  ctx.fillText('LISTEN IN FULL', padX + 68, headerY + 44);

  const headerBadgeText = payload.isSmart
    ? 'SMART COLLECTION // DYNAMIC SHELF'
    : 'CUSTOM COLLECTION // ARCHIVAL POSTER';
  ctx.font = '700 14px "JetBrains Mono", monospace';
  const badgeW = ctx.measureText(headerBadgeText).width + 36;
  const badgeX = CARD_WIDTH - padX - badgeW;

  fillRoundedRect(ctx, badgeX, headerY + 4, badgeW, 36, 18, theme.bgSurface, theme.borderStrong, 1.5);
  ctx.fillStyle = theme.accent;
  ctx.textAlign = 'center';
  ctx.fillText(headerBadgeText, badgeX + badgeW / 2, headerY + 27);
  ctx.textAlign = 'left';

  ctx.strokeStyle = theme.borderSubtle;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(padX, 146);
  ctx.lineTo(CARD_WIDTH - padX, 146);
  ctx.stroke();

  // -----------------------------------------------------------------------
  // 3. Collection Identity & 2x2 Cover Showcase (y = 172 .. 532)
  // -----------------------------------------------------------------------
  const heroY = 172;
  const mosaicSize = 356;
  const infoW = contentW - mosaicSize - 36;

  fillRoundedRect(ctx, padX, heroY, infoW, mosaicSize, 16, theme.bgSurface, theme.borderStrong, 2);
  ctx.fillStyle = theme.accent;
  ctx.fillRect(padX, heroY + 18, 6, mosaicSize - 36);

  // Eyebrow
  ctx.fillStyle = theme.accent;
  ctx.font = '700 14px "JetBrains Mono", monospace';
  ctx.fillText(
    payload.isSmart ? 'RULE-BASED SMART COLLECTION' : 'CURATED ALBUM COLLECTION',
    padX + 28,
    heroY + 38
  );

  // Collection Title (wrapped up to 2 lines)
  ctx.fillStyle = theme.textPrimary;
  ctx.font = '700 38px "Space Grotesk", sans-serif';
  const titleLines = wrapTextLines(ctx, payload.collectionTitle, infoW - 52, 2);
  let textY = heroY + 82;
  titleLines.forEach((line) => {
    ctx.fillText(line, padX + 28, textY);
    textY += 44;
  });

  // Optional Description or Smart Rules summary
  if (payload.hasDescription) {
    ctx.fillStyle = theme.textSecondary;
    ctx.font = '500 18px "Plus Jakarta Sans", sans-serif';
    const descLines = wrapTextLines(ctx, payload.description, infoW - 52, 2);
    descLines.forEach((line) => {
      ctx.fillText(line, padX + 28, textY + 6);
      textY += 26;
    });
  } else if (payload.isSmart) {
    ctx.fillStyle = theme.textSecondary;
    ctx.font = '500 16px "JetBrains Mono", monospace';
    const ruleLines = wrapTextLines(ctx, payload.rulesSubtitle, infoW - 52, 2);
    ruleLines.forEach((line) => {
      ctx.fillText(line, padX + 28, textY + 6);
      textY += 24;
    });
  }

  // Bottom Stats Strip inside Left Identity Card
  const statsDividerY = heroY + mosaicSize - 112;
  ctx.strokeStyle = theme.borderSubtle;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(padX + 28, statsDividerY);
  ctx.lineTo(padX + infoW - 24, statsDividerY);
  ctx.stroke();

  ctx.fillStyle = theme.textMuted;
  ctx.font = '700 12px "JetBrains Mono", monospace';
  ctx.fillText('COLLECTION SIZE', padX + 28, statsDividerY + 28);
  ctx.fillText('AVERAGE RATING', padX + 260, statsDividerY + 28);

  ctx.fillStyle = theme.textPrimary;
  ctx.font = '700 34px "JetBrains Mono", monospace';
  ctx.fillText(
    String(payload.albumCount) + ' ' + (payload.albumCount === 1 ? 'ALBUM' : 'ALBUMS'),
    padX + 28,
    statsDividerY + 72
  );

  ctx.fillStyle = payload.averageTierColor;
  ctx.font = '700 34px "JetBrains Mono", monospace';
  ctx.fillText(
    payload.formattedAverageScore + ' (' + payload.averageTierLabel.toUpperCase() + ')',
    padX + 260,
    statsDividerY + 72
  );

  // Right 2x2 Album Artwork Mosaic
  const mosaicX = padX + infoW + 36;
  const cellGap = 12;
  const cellSize = (mosaicSize - cellGap) / 2;

  for (let slot = 0; slot < 4; slot += 1) {
    const col = slot % 2;
    const row = Math.floor(slot / 2);
    const cx = mosaicX + col * (cellSize + cellGap);
    const cy = heroY + row * (cellSize + cellGap);
    const item = payload.mosaicItems[slot] || payload.mosaicItems[0] || {
      title: payload.collectionTitle,
      artist: 'RATEPLAY',
      artworkUrl: ''
    };
    const imgObj = item.artworkUrl ? safeImages[item.artworkUrl] || null : null;
    drawAlbumArtwork(ctx, imgObj, cx, cy, cellSize, {
      theme,
      albumTitle: item.title,
      artistName: item.artist
    });
  }

  let sectionY = heroY + mosaicSize + 30;

  // -----------------------------------------------------------------------
  // 4. Active Smart Rules Strip (if Smart Collection)
  // -----------------------------------------------------------------------
  if (payload.isSmart) {
    const ruleBarH = 64;
    fillRoundedRect(
      ctx,
      padX,
      sectionY,
      contentW,
      ruleBarH,
      12,
      theme.bgSurface,
      theme.accent,
      1.5
    );

    ctx.fillStyle = theme.accent;
    ctx.font = '700 14px "JetBrains Mono", monospace';
    ctx.fillText('ACTIVE RULES:', padX + 22, sectionY + 38);

    ctx.fillStyle = theme.textPrimary;
    ctx.font = '600 16px "JetBrains Mono", monospace';
    ctx.fillText(
      fitTextWithEllipsis(ctx, payload.rulesSubtitle, contentW - 180),
      padX + 152,
      sectionY + 38
    );

    sectionY += ruleBarH + 24;
  }

  // -----------------------------------------------------------------------
  // 5. Collection Albums Roster Panel
  // -----------------------------------------------------------------------
  const footerTopY = 1812;
  const rosterPanelH = footerTopY - sectionY - 26;

  fillRoundedRect(
    ctx,
    padX,
    sectionY,
    contentW,
    rosterPanelH,
    14,
    theme.bgSurface,
    theme.borderSubtle,
    1.5
  );

  fillRoundedRect(ctx, padX, sectionY, contentW, 54, 14, theme.bgElevated, null, 0);
  ctx.strokeStyle = theme.borderSubtle;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(padX, sectionY + 54);
  ctx.lineTo(padX + contentW, sectionY + 54);
  ctx.stroke();

  ctx.fillStyle = theme.textPrimary;
  ctx.font = '700 18px "Space Grotesk", sans-serif';
  ctx.fillText(
    payload.isSmart ? 'DYNAMICALLY MATCHED ALBUMS' : 'CURATED COLLECTION ROSTER',
    padX + 26,
    sectionY + 34
  );

  ctx.fillStyle = theme.textMuted;
  ctx.font = '600 14px "JetBrains Mono", monospace';
  ctx.textAlign = 'right';
  ctx.fillText(
    String(payload.albumCount) +
      ' ' +
      (payload.albumCount === 1 ? 'RECORD' : 'RECORDS') +
      '  \u00B7  ' +
      String(payload.scoredAlbumCount) +
      ' SCORED',
    padX + contentW - 26,
    sectionY + 34
  );
  ctx.textAlign = 'left';

  if (payload.featuredAlbums.length === 0) {
    ctx.fillStyle = theme.textMuted;
    ctx.font = '500 22px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(
      payload.isSmart
        ? 'No library albums currently match this Smart Collection\u2019s rules.'
        : 'This collection has no albums yet.',
      CARD_WIDTH / 2,
      sectionY + rosterPanelH / 2
    );
    ctx.textAlign = 'left';
  } else {
    const listTopY = sectionY + 70;
    const listAvailH = rosterPanelH - 86;
    const albumsList = payload.featuredAlbums;
    const useTwoCols = albumsList.length > 6;
    const maxPerCol = 6;
    const colCount = useTwoCols ? 2 : 1;
    const colGap = 24;
    const colW = (contentW - 44 - (colCount - 1) * colGap) / colCount;
    const rowsInFirstCol = useTwoCols
      ? Math.min(maxPerCol, Math.ceil(albumsList.length / 2))
      : Math.min(maxPerCol, albumsList.length);
    const rowH = Math.min(118, Math.floor(listAvailH / Math.max(1, rowsInFirstCol)));

    albumsList.forEach((alb, idx) => {
      const colIdx = useTwoCols ? Math.floor(idx / rowsInFirstCol) : 0;
      const rowIdx = useTwoCols ? idx % rowsInFirstCol : idx;
      if (colIdx >= 2) return;

      const rx = padX + 22 + colIdx * (colW + colGap);
      const ry = listTopY + rowIdx * rowH;

      fillRoundedRect(
        ctx,
        rx,
        ry,
        colW,
        rowH - 10,
        10,
        theme.bgCanvas,
        theme.borderSubtle,
        1
      );

      // Rank label
      ctx.fillStyle = theme.accent;
      ctx.font = '700 16px "JetBrains Mono", monospace';
      ctx.fillText(alb.rank, rx + 16, ry + Math.round((rowH - 10) / 2) + 6);

      // Mini cover artwork
      const thumbSize = Math.min(68, rowH - 26);
      const thumbX = rx + 62;
      const thumbY = ry + Math.round((rowH - 10 - thumbSize) / 2);
      const albImg = alb.artworkUrl ? safeImages[alb.artworkUrl] || null : null;
      drawAlbumArtwork(ctx, albImg, thumbX, thumbY, thumbSize, {
        theme,
        albumTitle: alb.title,
        artistName: alb.artist
      });

      // Score badge on right
      const pillW = alb.scoreText === 'UNRATED' ? 88 : 68;
      const pillH = 36;
      const pillX = rx + colW - pillW - 16;
      const pillY = ry + Math.round((rowH - 10 - pillH) / 2);
      fillRoundedRect(ctx, pillX, pillY, pillW, pillH, 8, theme.bgElevated, alb.scoreColor, 1.5);
      ctx.fillStyle = alb.scoreColor;
      ctx.font =
        alb.scoreText === 'UNRATED'
          ? '700 13px "JetBrains Mono", monospace'
          : '700 19px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(alb.scoreText, pillX + pillW / 2, pillY + 24);
      ctx.textAlign = 'left';

      // Album title + artist/year
      const textX = thumbX + thumbSize + 16;
      const maxTextW = pillX - textX - 14;
      const centerLineY = ry + Math.round((rowH - 10) / 2);

      ctx.fillStyle = theme.textPrimary;
      ctx.font = useTwoCols
        ? '700 18px "Space Grotesk", sans-serif'
        : '700 22px "Space Grotesk", sans-serif';
      ctx.fillText(fitTextWithEllipsis(ctx, alb.title, maxTextW), textX, centerLineY - 4);

      const subLine = alb.year ? alb.artist + '  \u00B7  ' + alb.year : alb.artist;
      ctx.fillStyle = theme.textSecondary;
      ctx.font = useTwoCols
        ? '500 14px "Plus Jakarta Sans", sans-serif'
        : '500 16px "Plus Jakarta Sans", sans-serif';
      ctx.fillText(fitTextWithEllipsis(ctx, subLine, maxTextW), textX, centerLineY + 20);
    });
  }

  // -----------------------------------------------------------------------
  // 6. Editorial Footer (y = 1812 .. 1868)
  // -----------------------------------------------------------------------
  ctx.strokeStyle = theme.borderSubtle;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(padX, footerTopY);
  ctx.lineTo(CARD_WIDTH - padX, footerTopY);
  ctx.stroke();

  ctx.fillStyle = theme.textMuted;
  ctx.font = '700 16px "JetBrains Mono", monospace';
  ctx.fillText('RATEPLAY // LISTEN IN FULL', padX, footerTopY + 38);

  const footerRightText =
    String(payload.albumCount) +
    ' ' +
    (payload.albumCount === 1 ? 'ALBUM' : 'ALBUMS') +
    '  \u00B7  1080\u00D71920 COLLECTION POSTER';
  ctx.textAlign = 'right';
  ctx.font = '500 15px "JetBrains Mono", monospace';
  ctx.fillText(footerRightText, CARD_WIDTH - padX, footerTopY + 38);
  ctx.textAlign = 'left';

  ctx.restore();

  return {
    width: canvas.width,
    height: canvas.height,
    themeId: theme.id,
    filename: payload.filename
  };
}

/**
 * Full async rendering pipeline for a 1080x1920 Collection Poster.
 */
export async function generateCollectionPosterOnCanvas(canvas, rawOptions = {}) {
  const payload = prepareCollectionPosterPayload(rawOptions);
  await waitForCanvasFonts();

  const urlsToLoad = new Set();
  payload.mosaicItems.forEach((item) => {
    if (item.artworkUrl) urlsToLoad.add(item.artworkUrl);
  });
  payload.featuredAlbums.forEach((alb) => {
    if (alb.artworkUrl) urlsToLoad.add(alb.artworkUrl);
  });

  const loadedImagesMap = {};
  await Promise.all(
    Array.from(urlsToLoad).map(async (url) => {
      const img = await loadCorsSafeArtwork(url);
      if (img) {
        loadedImagesMap[url] = img;
      }
    })
  );

  const renderResult = renderCollectionPosterToCanvas(canvas, payload, loadedImagesMap);
  return {
    payload,
    renderResult
  };
}
