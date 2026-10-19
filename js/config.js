/**
 * RATEPLAY - Configuration, Formatting Utilities & Curated Starter Catalog
 */

export const APP_CONFIG = {
  appName: 'RATEPLAY',
  tagline: 'Listen in Full',
  itunesSearchUrl: 'https://itunes.apple.com/search',
  itunesLookupUrl: 'https://itunes.apple.com/lookup',
  searchLimit: 24,
  searchDebounceMs: 320,
  requestTimeoutMs: 8500,
  maxVerdictLength: 160,
  storageKeys: {
    ratingsMap: 'sleeve_ratings_v1',
    albumCatalogCache: 'sleeve_album_meta_v1',
    recentQueries: 'sleeve_recent_queries_v1',
    preImportBackup: 'sleeve_pre_import_backup_v1',
    journalMap: 'sleeve_journal_v1',
    journalPreImportBackup: 'sleeve_journal_pre_import_backup_v1',
    collectionsMap: 'sleeve_collections_v1'
  }
};

export const QUICK_DISCOVERY_QUERIES = [
  'Radiohead',
  'Kendrick Lamar',
  'Daft Punk',
  'Bj\u00F6rk',
  'Frank Ocean',
  'Charli xcx',
  'Tame Impala',
  'Sade'
];

export function getHighResArtwork(artworkUrl, size = 600) {
  if (!artworkUrl || typeof artworkUrl !== 'string') {
    return createFallbackCoverDataUri('RATEPLAY');
  }
  const targetSize = String(size) + 'x' + String(size) + 'bb.';
  return artworkUrl.replace(/\/\d+x\d+bb\.(jpg|png|webp)/i, function (match, ext) {
    return '/' + targetSize + ext;
  });
}

export function createFallbackCoverDataUri(title = 'ALBUM') {
  const safeInitials =
    String(title || 'ALBUM')
      .replace(/[^a-zA-Z0-9 ]+/g, '')
      .trim()
      .slice(0, 2)
      .toUpperCase() || 'RP';
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">' +
    '<rect width="400" height="400" fill="#131316"/>' +
    '<circle cx="200" cy="200" r="135" fill="#1C1C21" stroke="#242429" stroke-width="3"/>' +
    '<circle cx="200" cy="200" r="46" fill="#E8A838"/>' +
    '<text x="200" y="208" text-anchor="middle" fill="#0B0B0C" font-family="monospace" font-weight="bold" font-size="24">' +
    safeInitials +
    '</text></svg>';
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

/**
 * Returns unified rating tier metadata including CSS variable and raw hex colors
 * so DOM components and the HTML5 2D Canvas generator use identical tier logic.
 */
export function getTierDetails(score) {
  const numeric = Number(score);
  if (score === null || score === undefined || score === '' || !Number.isFinite(numeric) || numeric <= 0) {
    return {
      label: 'Unrated',
      color: 'var(--text-muted)',
      hexDark: '#63625F',
      hexLight: '#7D7A74'
    };
  }
  if (numeric >= 9.0) {
    return {
      label: 'Masterpiece',
      color: 'var(--tier-masterpiece)',
      hexDark: '#10B981',
      hexLight: '#059669'
    };
  }
  if (numeric >= 7.5) {
    return {
      label: 'Essential',
      color: 'var(--tier-great)',
      hexDark: '#E8A838',
      hexLight: '#B87308'
    };
  }
  if (numeric >= 6.0) {
    return {
      label: 'Solid',
      color: 'var(--tier-solid)',
      hexDark: '#38BDF8',
      hexLight: '#0284C7'
    };
  }
  if (numeric >= 4.0) {
    return {
      label: 'Mixed',
      color: 'var(--tier-mixed)',
      hexDark: '#94A3B8',
      hexLight: '#475569'
    };
  }
  return {
    label: 'Skip',
    color: 'var(--tier-poor)',
    hexDark: '#EF4444',
    hexLight: '#DC2626'
  };
}

export function getTierInfo(score) {
  const details = getTierDetails(score);
  return { label: details.label, color: details.color };
}

export function formatDuration(ms) {
  const totalSeconds = Math.round((Number(ms) || 0) / 1000);
  if (totalSeconds <= 0) return '--:--';
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return String(minutes) + ':' + String(seconds).padStart(2, '0');
}

export function formatTotalRuntime(tracks = []) {
  const totalMs = tracks.reduce((sum, track) => sum + (Number(track.trackTimeMillis) || 0), 0);
  const totalSeconds = Math.round(totalMs / 1000);
  if (totalSeconds <= 0) return 'Runtime unavailable';
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return String(hours) + ' hr ' + String(minutes) + ' min';
  }
  return String(minutes) + ' min ' + String(seconds).padStart(2, '0') + ' sec';
}

export function formatReleaseYear(releaseDate) {
  if (!releaseDate) return '----';
  const year = String(releaseDate).trim().slice(0, 4);
  return year.length === 4 && !/[^0-9]/.test(year) ? year : '----';
}

export function formatFullDate(releaseDate) {
  if (!releaseDate) return 'Unknown Date';
  const parsed = new Date(releaseDate);
  if (Number.isNaN(parsed.getTime())) {
    return formatReleaseYear(releaseDate);
  }
  return parsed.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

export function formatUpdatedTimestamp(isoString) {
  if (!isoString || typeof isoString !== 'string') {
    return 'Date unavailable';
  }
  const parsed = new Date(isoString);
  if (Number.isNaN(parsed.getTime())) {
    return 'Date unavailable';
  }
  return parsed.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

export const CURATED_ALBUMS = [
  {
    collectionId: 1097862870,
    collectionName: 'In Rainbows',
    artistName: 'Radiohead',
    primaryGenreName: 'Alternative',
    releaseDate: '2007-10-10T07:00:00Z',
    trackCount: 10,
    copyright: '\u2117 2007 XL Recordings Ltd',
    collectionViewUrl: 'https://music.apple.com/us/album/in-rainbows/1097862870',
    artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/Music126/v4/dd/50/c7/dd50c790-99c5-c3c2-a0e1-96f9f983770d/634904032463.png/100x100bb.jpg',
    fallbackTracks: [
      { trackId: 1097863022, trackNumber: 1, discNumber: 1, trackName: '15 Step', trackTimeMillis: 237986 },
      { trackId: 1097863026, trackNumber: 2, discNumber: 1, trackName: 'Bodysnatchers', trackTimeMillis: 242293 },
      { trackId: 1097863028, trackNumber: 3, discNumber: 1, trackName: 'Nude', trackTimeMillis: 255386 },
      { trackId: 1097863030, trackNumber: 4, discNumber: 1, trackName: 'Weird Fishes/ Arpeggi', trackTimeMillis: 318186 },
      { trackId: 1097863031, trackNumber: 5, discNumber: 1, trackName: 'All I Need', trackTimeMillis: 228746 },
      { trackId: 1097863032, trackNumber: 6, discNumber: 1, trackName: 'Faust Arp', trackTimeMillis: 129760 },
      { trackId: 1097863033, trackNumber: 7, discNumber: 1, trackName: 'Reckoner', trackTimeMillis: 290213 },
      { trackId: 1097863034, trackNumber: 8, discNumber: 1, trackName: 'House of Cards', trackTimeMillis: 328266 },
      { trackId: 1097863035, trackNumber: 9, discNumber: 1, trackName: 'Jigsaw Falling Into Place', trackTimeMillis: 248893 },
      { trackId: 1097863036, trackNumber: 10, discNumber: 1, trackName: 'Videotape', trackTimeMillis: 279693 }
    ]
  },
  {
    collectionId: 697194953,
    collectionName: 'Random Access Memories',
    artistName: 'Daft Punk',
    primaryGenreName: 'Dance',
    releaseDate: '2013-05-17T07:00:00Z',
    trackCount: 13,
    copyright: '\u2117 2013 Daft Life Limited under exclusive license to Columbia Records',
    collectionViewUrl: 'https://music.apple.com/us/album/random-access-memories/697194953',
    artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/e8/43/5f/e8435ffa-b669-b171-3348-39511127d9b6/886443927087.jpg/100x100bb.jpg',
    fallbackTracks: [
      { trackId: 697195051, trackNumber: 1, discNumber: 1, trackName: 'Give Life Back to Music', trackTimeMillis: 275386 },
      { trackId: 697195264, trackNumber: 2, discNumber: 1, trackName: 'The Game of Love', trackTimeMillis: 322146 },
      { trackId: 697195384, trackNumber: 3, discNumber: 1, trackName: 'Giorgio by Moroder', trackTimeMillis: 544626 },
      { trackId: 697195529, trackNumber: 4, discNumber: 1, trackName: 'Within', trackTimeMillis: 228506 },
      { trackId: 697195645, trackNumber: 5, discNumber: 1, trackName: 'Instant Crush (feat. Julian Casablancas)', trackTimeMillis: 337560 },
      { trackId: 697195787, trackNumber: 6, discNumber: 1, trackName: 'Lose Yourself to Dance (feat. Pharrell Williams)', trackTimeMillis: 353893 },
      { trackId: 697195915, trackNumber: 7, discNumber: 1, trackName: 'Touch (feat. Paul Williams)', trackTimeMillis: 498960 },
      { trackId: 697196030, trackNumber: 8, discNumber: 1, trackName: 'Get Lucky (feat. Pharrell Williams & Nile Rodgers)', trackTimeMillis: 369626 },
      { trackId: 697196126, trackNumber: 9, discNumber: 1, trackName: 'Beyond', trackTimeMillis: 290493 },
      { trackId: 697196215, trackNumber: 10, discNumber: 1, trackName: 'Motherboard', trackTimeMillis: 341853 },
      { trackId: 697196331, trackNumber: 11, discNumber: 1, trackName: 'Fragments of Time (feat. Todd Edwards)', trackTimeMillis: 279693 },
      { trackId: 697196452, trackNumber: 12, discNumber: 1, trackName: "Doin' It Right (feat. Panda Bear)", trackTimeMillis: 251480 },
      { trackId: 697196556, trackNumber: 13, discNumber: 1, trackName: 'Contact', trackTimeMillis: 383400 }
    ]
  },
  {
    collectionId: 1146195596,
    collectionName: 'Blonde',
    artistName: 'Frank Ocean',
    primaryGenreName: 'R&B/Soul',
    releaseDate: '2016-08-20T07:00:00Z',
    trackCount: 17,
    copyright: "\u2117 2016 Boys Don't Cry",
    collectionViewUrl: 'https://music.apple.com/us/album/blonde/1146195596',
    artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/bb/45/68/bb4568f3-68cd-639d-fb82-46c025d364d2/075679916020.jpg/100x100bb.jpg',
    fallbackTracks: [
      { trackId: 1146195601, trackNumber: 1, discNumber: 1, trackName: 'Nikes', trackTimeMillis: 314075 },
      { trackId: 1146195602, trackNumber: 2, discNumber: 1, trackName: 'Ivy', trackTimeMillis: 249191 },
      { trackId: 1146195603, trackNumber: 3, discNumber: 1, trackName: 'Pink + White', trackTimeMillis: 184516 },
      { trackId: 1146195604, trackNumber: 4, discNumber: 1, trackName: 'Be Yourself', trackTimeMillis: 86924 },
      { trackId: 1146195605, trackNumber: 5, discNumber: 1, trackName: 'Solo', trackTimeMillis: 257380 },
      { trackId: 1146195606, trackNumber: 6, discNumber: 1, trackName: 'Skyline To', trackTimeMillis: 184600 },
      { trackId: 1146195607, trackNumber: 7, discNumber: 1, trackName: 'Self Control', trackTimeMillis: 249668 },
      { trackId: 1146195608, trackNumber: 8, discNumber: 1, trackName: 'Good Guy', trackTimeMillis: 66625 },
      { trackId: 1146195609, trackNumber: 9, discNumber: 1, trackName: 'Nights', trackTimeMillis: 307151 },
      { trackId: 1146195610, trackNumber: 10, discNumber: 1, trackName: 'Solo (Reprise)', trackTimeMillis: 78795 },
      { trackId: 1146195611, trackNumber: 11, discNumber: 1, trackName: 'Pretty Sweet', trackTimeMillis: 158476 },
      { trackId: 1146195612, trackNumber: 12, discNumber: 1, trackName: 'Facebook Story', trackTimeMillis: 68605 },
      { trackId: 1146195613, trackNumber: 13, discNumber: 1, trackName: 'Close to You', trackTimeMillis: 85755 },
      { trackId: 1146195614, trackNumber: 14, discNumber: 1, trackName: 'White Ferrari', trackTimeMillis: 248808 },
      { trackId: 1146195615, trackNumber: 15, discNumber: 1, trackName: 'Seigfried', trackTimeMillis: 334570 },
      { trackId: 1146195616, trackNumber: 16, discNumber: 1, trackName: 'Godspeed', trackTimeMillis: 177922 },
      { trackId: 1146195617, trackNumber: 17, discNumber: 1, trackName: 'Futura Free', trackTimeMillis: 564165 }
    ]
  },
  {
    collectionId: 1440818584,
    collectionName: 'To Pimp a Butterfly',
    artistName: 'Kendrick Lamar',
    primaryGenreName: 'Hip-Hop/Rap',
    releaseDate: '2015-03-16T07:00:00Z',
    trackCount: 16,
    copyright: '\u2117 2015 Aftermath/Interscope (Top Dawg Entertainment)',
    collectionViewUrl: 'https://music.apple.com/us/album/to-pimp-a-butterfly/1440818584',
    artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/Music112/v4/fc/67/c6/fc67c6a9-9157-8306-b675-f6b6d3c9f71b/15UMGIM11922.rgb.jpg/100x100bb.jpg',
    fallbackTracks: [
      { trackId: 1440818587, trackNumber: 1, discNumber: 1, trackName: "Wesley's Theory (feat. George Clinton & Thundercat)", trackTimeMillis: 287360 },
      { trackId: 1440818590, trackNumber: 2, discNumber: 1, trackName: 'For Free? (Interlude)', trackTimeMillis: 130960 },
      { trackId: 1440818593, trackNumber: 3, discNumber: 1, trackName: 'King Kunta', trackTimeMillis: 234693 },
      { trackId: 1440818596, trackNumber: 4, discNumber: 1, trackName: 'Institutionalized (feat. Bilal, Anna Wise & Snoop Dogg)', trackTimeMillis: 271560 },
      { trackId: 1440818600, trackNumber: 5, discNumber: 1, trackName: 'These Walls (feat. Bilal, Anna Wise & Thundercat)', trackTimeMillis: 300973 },
      { trackId: 1440818874, trackNumber: 6, discNumber: 1, trackName: 'u', trackTimeMillis: 268493 },
      { trackId: 1440818881, trackNumber: 7, discNumber: 1, trackName: 'Alright', trackTimeMillis: 219333 },
      { trackId: 1440818883, trackNumber: 8, discNumber: 1, trackName: 'For Sale? (Interlude)', trackTimeMillis: 291720 },
      { trackId: 1440818887, trackNumber: 9, discNumber: 1, trackName: 'Momma', trackTimeMillis: 283120 },
      { trackId: 1440818890, trackNumber: 10, discNumber: 1, trackName: 'Hood Politics', trackTimeMillis: 292520 },
      { trackId: 1440818896, trackNumber: 11, discNumber: 1, trackName: 'How Much a Dollar Cost (feat. James Fauntleroy & Ronald Isley)', trackTimeMillis: 261773 },
      { trackId: 1440818900, trackNumber: 12, discNumber: 1, trackName: 'Complexion (A Zulu Love) [feat. Rapsody]', trackTimeMillis: 263360 },
      { trackId: 1440818903, trackNumber: 13, discNumber: 1, trackName: 'The Blacker the Berry', trackTimeMillis: 328853 },
      { trackId: 1440818906, trackNumber: 14, discNumber: 1, trackName: "You Ain't Gotta Lie (Momma Said)", trackTimeMillis: 241680 },
      { trackId: 1440818909, trackNumber: 15, discNumber: 1, trackName: 'i', trackTimeMillis: 336026 },
      { trackId: 1440818912, trackNumber: 16, discNumber: 1, trackName: 'Mortal Man', trackTimeMillis: 727106 }
    ]
  },
  {
    collectionId: 1440783617,
    collectionName: 'Currents',
    artistName: 'Tame Impala',
    primaryGenreName: 'Alternative',
    releaseDate: '2015-07-17T07:00:00Z',
    trackCount: 13,
    copyright: '\u2117 2015 Modular Recordings Pty Ltd',
    collectionViewUrl: 'https://music.apple.com/us/album/currents/1440783617',
    artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/a4/2e/b4/a42eb4f5-f815-7721-9b19-0f61f8498f86/15UMGIM26115.rgb.jpg/100x100bb.jpg',
    fallbackTracks: [
      { trackId: 1440783624, trackNumber: 1, discNumber: 1, trackName: 'Let It Happen', trackTimeMillis: 466893 },
      { trackId: 1440783629, trackNumber: 2, discNumber: 1, trackName: 'Nangs', trackTimeMillis: 107533 },
      { trackId: 1440783631, trackNumber: 3, discNumber: 1, trackName: 'The Moment', trackTimeMillis: 255413 },
      { trackId: 1440783635, trackNumber: 4, discNumber: 1, trackName: "Yes I'm Changing", trackTimeMillis: 270680 },
      { trackId: 1440783639, trackNumber: 5, discNumber: 1, trackName: 'Eventually', trackTimeMillis: 318599 },
      { trackId: 1440783641, trackNumber: 6, discNumber: 1, trackName: 'Gossip', trackTimeMillis: 55426 },
      { trackId: 1440783770, trackNumber: 7, discNumber: 1, trackName: 'The Less I Know the Better', trackTimeMillis: 216320 },
      { trackId: 1440783776, trackNumber: 8, discNumber: 1, trackName: 'Past Life', trackTimeMillis: 227560 },
      { trackId: 1440783778, trackNumber: 9, discNumber: 1, trackName: 'Disciples', trackTimeMillis: 108546 },
      { trackId: 1440783781, trackNumber: 10, discNumber: 1, trackName: "'Cause I'm a Man", trackTimeMillis: 241200 },
      { trackId: 1440783784, trackNumber: 11, discNumber: 1, trackName: 'Reality in Motion', trackTimeMillis: 252160 },
      { trackId: 1440783787, trackNumber: 12, discNumber: 1, trackName: 'Love/Paranoia', trackTimeMillis: 186586 },
      { trackId: 1440783791, trackNumber: 13, discNumber: 1, trackName: 'New Person, Same Old Mistakes', trackTimeMillis: 363240 }
    ]
  },
  {
    collectionId: 1739079974,
    collectionName: 'BRAT',
    artistName: 'Charli xcx',
    primaryGenreName: 'Pop',
    releaseDate: '2024-06-07T07:00:00Z',
    trackCount: 15,
    copyright: '\u2117 2024 Atlantic Recording Corporation',
    collectionViewUrl: 'https://music.apple.com/us/album/brat/1739079974',
    artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/c9/2a/c7/c92ac762-9756-3004-0d60-3694ca4800b6/075679655189.jpg/100x100bb.jpg',
    fallbackTracks: [
      { trackId: 1739079975, trackNumber: 1, discNumber: 1, trackName: '360', trackTimeMillis: 133805 },
      { trackId: 1739079976, trackNumber: 2, discNumber: 1, trackName: 'Club classics', trackTimeMillis: 153511 },
      { trackId: 1739079977, trackNumber: 3, discNumber: 1, trackName: 'Sympathy is a knife', trackTimeMillis: 151126 },
      { trackId: 1739079978, trackNumber: 4, discNumber: 1, trackName: 'I might say something stupid', trackTimeMillis: 109195 },
      { trackId: 1739079979, trackNumber: 5, discNumber: 1, trackName: 'Talk talk', trackTimeMillis: 161872 },
      { trackId: 1739079980, trackNumber: 6, discNumber: 1, trackName: 'Von dutch', trackTimeMillis: 164284 },
      { trackId: 1739079981, trackNumber: 7, discNumber: 1, trackName: 'Everything is romantic', trackTimeMillis: 203369 },
      { trackId: 1739079982, trackNumber: 8, discNumber: 1, trackName: 'Rewind', trackTimeMillis: 168475 },
      { trackId: 1739079983, trackNumber: 9, discNumber: 1, trackName: 'So I', trackTimeMillis: 211369 },
      { trackId: 1739079984, trackNumber: 10, discNumber: 1, trackName: 'Girl, so confusing', trackTimeMillis: 172531 },
      { trackId: 1739079985, trackNumber: 11, discNumber: 1, trackName: 'Apple', trackTimeMillis: 151739 },
      { trackId: 1739079986, trackNumber: 12, discNumber: 1, trackName: 'B2b', trackTimeMillis: 178577 },
      { trackId: 1739079987, trackNumber: 13, discNumber: 1, trackName: 'Mean girls', trackTimeMillis: 189288 },
      { trackId: 1739079988, trackNumber: 14, discNumber: 1, trackName: 'I think about it all the time', trackTimeMillis: 135989 },
      { trackId: 1739079989, trackNumber: 15, discNumber: 1, trackName: '365', trackTimeMillis: 203645 }
    ]
  },
  {
    collectionId: 1440857781,
    collectionName: 'Homogenic',
    artistName: 'Bj\u00F6rk',
    primaryGenreName: 'Electronic',
    releaseDate: '1997-09-22T07:00:00Z',
    trackCount: 10,
    copyright: '\u2117 1997 One Little Independent Records',
    collectionViewUrl: 'https://music.apple.com/us/album/homogenic/1440857781',
    artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/Music124/v4/7d/49/0c/7d490c1c-6a28-7a21-60f6-59b7d6510b1c/00044006348728.rgb.jpg/100x100bb.jpg',
    fallbackTracks: [
      { trackId: 1440857782, trackNumber: 1, discNumber: 1, trackName: 'Hunter', trackTimeMillis: 255000 },
      { trackId: 1440857783, trackNumber: 2, discNumber: 1, trackName: 'J\u00F3ga', trackTimeMillis: 305000 },
      { trackId: 1440857784, trackNumber: 3, discNumber: 1, trackName: 'Unravel', trackTimeMillis: 197000 },
      { trackId: 1440857785, trackNumber: 4, discNumber: 1, trackName: 'Bachelorette', trackTimeMillis: 312000 },
      { trackId: 1440857786, trackNumber: 5, discNumber: 1, trackName: 'All Neon Like', trackTimeMillis: 353000 },
      { trackId: 1440857787, trackNumber: 6, discNumber: 1, trackName: '5 Years', trackTimeMillis: 269000 },
      { trackId: 1440857788, trackNumber: 7, discNumber: 1, trackName: 'Immature', trackTimeMillis: 186000 },
      { trackId: 1440857789, trackNumber: 8, discNumber: 1, trackName: 'Alarm Call', trackTimeMillis: 259000 },
      { trackId: 1440857790, trackNumber: 9, discNumber: 1, trackName: 'Pluto', trackTimeMillis: 200000 },
      { trackId: 1440857791, trackNumber: 10, discNumber: 1, trackName: 'All Is Full of Love', trackTimeMillis: 272000 }
    ]
  },
  {
    collectionId: 1586472452,
    collectionName: 'Love Deluxe',
    artistName: 'Sade',
    primaryGenreName: 'R&B/Soul',
    releaseDate: '1992-10-26T07:00:00Z',
    trackCount: 9,
    copyright: '\u2117 1992 Sony Music Entertainment UK Limited',
    collectionViewUrl: 'https://music.apple.com/us/album/love-deluxe/1586472452',
    artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/85/d1/ee/85d1ee60-85a4-0e18-4510-f9e184f2b31b/886448640714.jpg/100x100bb.jpg',
    fallbackTracks: [
      { trackId: 1586472453, trackNumber: 1, discNumber: 1, trackName: 'No Ordinary Love', trackTimeMillis: 440000 },
      { trackId: 1586472454, trackNumber: 2, discNumber: 1, trackName: 'Feel No Pain', trackTimeMillis: 308000 },
      { trackId: 1586472455, trackNumber: 3, discNumber: 1, trackName: "I Couldn't Love You More", trackTimeMillis: 229000 },
      { trackId: 1586472456, trackNumber: 4, discNumber: 1, trackName: 'Like a Tattoo', trackTimeMillis: 218000 },
      { trackId: 1586472457, trackNumber: 5, discNumber: 1, trackName: 'Kiss of Life', trackTimeMillis: 251000 },
      { trackId: 1586472458, trackNumber: 6, discNumber: 1, trackName: 'Cherish the Day', trackTimeMillis: 334000 },
      { trackId: 1586472459, trackNumber: 7, discNumber: 1, trackName: 'Pearls', trackTimeMillis: 274000 },
      { trackId: 1586472460, trackNumber: 8, discNumber: 1, trackName: 'Bullet Proof Soul', trackTimeMillis: 326000 },
      { trackId: 1586472461, trackNumber: 9, discNumber: 1, trackName: 'Mermaid', trackTimeMillis: 263000 }
    ]
  }
];