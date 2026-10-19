/**
 * RATEPLAY - iTunes Search & Lookup Metadata Client
 */

import { APP_CONFIG, CURATED_ALBUMS } from './config.js';

const searchCache = new Map();
const lookupCache = new Map();

async function fetchItunesJson(url) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), APP_CONFIG.requestTimeoutMs);

  try {
    const response = await window.fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: { Accept: 'application/json' }
    });

    if (!response.ok) {
      throw new Error('iTunes HTTP ' + String(response.status));
    }

    return await response.json();
  } catch (fetchErr) {
    return await fetchItunesJsonp(url);
  } finally {
    window.clearTimeout(timer);
  }
}

function fetchItunesJsonp(url) {
  return new Promise((resolve, reject) => {
    const callbackName =
      '__rateplayItunesCb_' + String(Date.now()) + '_' + String(Math.floor(Math.random() * 10000));
    const script = document.createElement('script');
    const separator = url.includes('?') ? '&' : '?';
    let settled = false;

    const cleanup = () => {
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
      try {
        delete window[callbackName];
      } catch {
        window[callbackName] = undefined;
      }
    };

    const timeoutId = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error('iTunes metadata request timed out.'));
    }, APP_CONFIG.requestTimeoutMs);

    window[callbackName] = (data) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      cleanup();
      resolve(data);
    };

    script.onerror = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      cleanup();
      reject(new Error('Network error while contacting iTunes catalog.'));
    };

    script.src = url + separator + 'callback=' + callbackName;
    document.head.appendChild(script);
  });
}

function normalizeAlbum(raw) {
  return {
    collectionId: Number(raw.collectionId),
    collectionName: raw.collectionName || 'Untitled Album',
    artistName: raw.artistName || 'Unknown Artist',
    primaryGenreName: raw.primaryGenreName || 'Music',
    releaseDate: raw.releaseDate || '',
    trackCount: Number(raw.trackCount) || 0,
    copyright: raw.copyright || '',
    collectionViewUrl: raw.collectionViewUrl || '',
    artworkUrl100: raw.artworkUrl100 || '',
    explicitness: raw.collectionExplicitness || 'notExplicit'
  };
}

function normalizeTrack(raw, index) {
  return {
    trackId: Number(raw.trackId) || index + 1,
    trackNumber: Number(raw.trackNumber) || index + 1,
    discNumber: Number(raw.discNumber) || 1,
    trackName: raw.trackName || 'Track ' + String(index + 1),
    artistName: raw.artistName || '',
    trackTimeMillis: Number(raw.trackTimeMillis) || 0,
    previewUrl: raw.previewUrl || '',
    trackExplicitness: raw.trackExplicitness || 'notExplicit'
  };
}

export async function searchAlbums(query) {
  const cleaned = String(query || '').trim();
  if (!cleaned) {
    return { albums: CURATED_ALBUMS.map(normalizeAlbum), source: 'curated' };
  }

  const cacheKey = cleaned.toLowerCase();
  if (searchCache.has(cacheKey)) {
    return { albums: searchCache.get(cacheKey), source: 'live' };
  }

  const params = new URLSearchParams({
    term: cleaned,
    entity: 'album',
    media: 'music',
    limit: String(APP_CONFIG.searchLimit),
    country: 'US'
  });

  const url = APP_CONFIG.itunesSearchUrl + '?' + params.toString();

  try {
    const payload = await fetchItunesJson(url);
    const results = Array.isArray(payload.results) ? payload.results : [];

    const albums = results
      .filter((item) => item.wrapperType === 'collection' && item.collectionId)
      .map(normalizeAlbum);

    albums.forEach((album) => {
      if (!lookupCache.has(album.collectionId)) {
        lookupCache.set(album.collectionId, { album, tracks: null });
      }
    });

    searchCache.set(cacheKey, albums);
    return { albums, source: 'live' };
  } catch (err) {
    const localMatches = CURATED_ALBUMS.filter(
      (item) =>
        item.collectionName.toLowerCase().includes(cacheKey) ||
        item.artistName.toLowerCase().includes(cacheKey) ||
        item.primaryGenreName.toLowerCase().includes(cacheKey)
    ).map(normalizeAlbum);

    if (localMatches.length > 0) {
      return { albums: localMatches, source: 'fallback' };
    }
    throw err;
  }
}

export async function fetchAlbumTracklist(collectionId) {
  const numericId = Number(collectionId);
  if (!numericId) {
    throw new Error('Invalid album collection ID.');
  }

  const cached = lookupCache.get(numericId);
  if (cached && Array.isArray(cached.tracks) && cached.tracks.length > 0) {
    return { album: cached.album, tracks: cached.tracks, source: 'live' };
  }

  const curatedMatch = CURATED_ALBUMS.find((item) => Number(item.collectionId) === numericId);

  const params = new URLSearchParams({
    id: String(numericId),
    entity: 'song',
    limit: '200',
    country: 'US'
  });

  const url = APP_CONFIG.itunesLookupUrl + '?' + params.toString();

  try {
    const payload = await fetchItunesJson(url);
    const results = Array.isArray(payload.results) ? payload.results : [];

    const collectionRaw = results.find(
      (item) => item.wrapperType === 'collection' || Number(item.collectionId) === numericId
    );

    if (!collectionRaw && !curatedMatch) {
      throw new Error('Album not found in the iTunes catalog.');
    }

    const album = normalizeAlbum(collectionRaw || curatedMatch);
    const rawTracks = results.filter(
      (item) => item.wrapperType === 'track' && item.kind === 'song'
    );

    rawTracks.sort((a, b) => {
      const discDiff = (Number(a.discNumber) || 1) - (Number(b.discNumber) || 1);
      if (discDiff !== 0) return discDiff;
      return (Number(a.trackNumber) || 0) - (Number(b.trackNumber) || 0);
    });

    const tracks =
      rawTracks.length > 0
        ? rawTracks.map(normalizeTrack)
        : (curatedMatch?.fallbackTracks || []).map(normalizeTrack);

    lookupCache.set(numericId, { album, tracks });
    return { album, tracks, source: rawTracks.length > 0 ? 'live' : 'fallback' };
  } catch (err) {
    if (curatedMatch) {
      const album = normalizeAlbum(curatedMatch);
      const tracks = (curatedMatch.fallbackTracks || []).map(normalizeTrack);
      lookupCache.set(numericId, { album, tracks });
      return { album, tracks, source: 'fallback' };
    }
    throw err;
  }
}