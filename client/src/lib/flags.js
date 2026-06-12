// Country name → ISO-3166 alpha-2 code map.
// Covers every FIFA member that might appear in WC 2026 plus common name variants
// returned by football-data.org (e.g. "Czechia", "South Korea", "Bosnia-Herzegovina").

const COUNTRY_TO_ISO = {
  // CONCACAF hosts + qualifiers
  'United States': 'us',
  'United States of America': 'us',
  'USA': 'us',
  'Mexico': 'mx',
  'Canada': 'ca',
  'Costa Rica': 'cr',
  'Honduras': 'hn',
  'Panama': 'pa',
  'Jamaica': 'jm',
  'El Salvador': 'sv',
  'Curaçao': 'cw',
  'Curacao': 'cw',
  'Trinidad and Tobago': 'tt',
  'Haiti': 'ht',

  // CONMEBOL
  'Argentina': 'ar',
  'Brazil': 'br',
  'Uruguay': 'uy',
  'Colombia': 'co',
  'Ecuador': 'ec',
  'Paraguay': 'py',
  'Peru': 'pe',
  'Chile': 'cl',
  'Bolivia': 'bo',
  'Venezuela': 've',

  // UEFA
  'England': 'gb-eng',
  'Scotland': 'gb-sct',
  'Wales': 'gb-wls',
  'Northern Ireland': 'gb-nir',
  'Republic of Ireland': 'ie',
  'Ireland': 'ie',
  'Spain': 'es',
  'France': 'fr',
  'Germany': 'de',
  'Italy': 'it',
  'Netherlands': 'nl',
  'Portugal': 'pt',
  'Belgium': 'be',
  'Croatia': 'hr',
  'Serbia': 'rs',
  'Switzerland': 'ch',
  'Denmark': 'dk',
  'Sweden': 'se',
  'Norway': 'no',
  'Finland': 'fi',
  'Iceland': 'is',
  'Poland': 'pl',
  'Austria': 'at',
  'Czech Republic': 'cz',
  'Czechia': 'cz',
  'Slovakia': 'sk',
  'Slovenia': 'si',
  'Hungary': 'hu',
  'Romania': 'ro',
  'Bulgaria': 'bg',
  'Greece': 'gr',
  'Turkey': 'tr',
  'Türkiye': 'tr',
  'Albania': 'al',
  'North Macedonia': 'mk',
  'Macedonia': 'mk',
  'Montenegro': 'me',
  'Kosovo': 'xk',
  'Bosnia-Herzegovina': 'ba',
  'Bosnia and Herzegovina': 'ba',
  'Russia': 'ru',
  'Ukraine': 'ua',
  'Belarus': 'by',
  'Estonia': 'ee',
  'Latvia': 'lv',
  'Lithuania': 'lt',
  'Moldova': 'md',
  'Georgia': 'ge',
  'Armenia': 'am',
  'Azerbaijan': 'az',
  'Cyprus': 'cy',
  'Malta': 'mt',
  'Luxembourg': 'lu',
  'Liechtenstein': 'li',
  'Andorra': 'ad',
  'San Marino': 'sm',
  'Gibraltar': 'gi',
  'Faroe Islands': 'fo',

  // CAF
  'Morocco': 'ma',
  'Senegal': 'sn',
  'Egypt': 'eg',
  'Nigeria': 'ng',
  'Cameroon': 'cm',
  'Ghana': 'gh',
  'Tunisia': 'tn',
  'Algeria': 'dz',
  'Ivory Coast': 'ci',
  "Côte d'Ivoire": 'ci',
  'Cote d\'Ivoire': 'ci',
  'South Africa': 'za',
  'Mali': 'ml',
  'Burkina Faso': 'bf',
  'DR Congo': 'cd',
  'Congo DR': 'cd',
  'Democratic Republic of Congo': 'cd',
  'Congo': 'cg',
  'Cape Verde': 'cv',
  'Cape Verde Islands': 'cv',
  'Cabo Verde': 'cv',
  'Zambia': 'zm',
  'Zimbabwe': 'zw',
  'Kenya': 'ke',
  'Uganda': 'ug',
  'Tanzania': 'tz',
  'Angola': 'ao',
  'Mozambique': 'mz',
  'Madagascar': 'mg',
  'Mauritania': 'mr',
  'Guinea': 'gn',
  'Guinea-Bissau': 'gw',
  'Equatorial Guinea': 'gq',
  'Gabon': 'ga',
  'Benin': 'bj',
  'Togo': 'tg',
  'Sierra Leone': 'sl',
  'Liberia': 'lr',
  'Niger': 'ne',
  'Chad': 'td',
  'Sudan': 'sd',
  'South Sudan': 'ss',
  'Ethiopia': 'et',
  'Eritrea': 'er',
  'Somalia': 'so',
  'Botswana': 'bw',
  'Namibia': 'na',
  'Malawi': 'mw',
  'Lesotho': 'ls',
  'Eswatini': 'sz',
  'Comoros': 'km',
  'Rwanda': 'rw',
  'Burundi': 'bi',
  'Central African Republic': 'cf',
  'Sao Tome and Principe': 'st',
  'São Tomé and Príncipe': 'st',
  'Djibouti': 'dj',
  'Mauritius': 'mu',
  'Seychelles': 'sc',
  'Libya': 'ly',

  // AFC
  'Japan': 'jp',
  'South Korea': 'kr',
  'Korea Republic': 'kr',
  'Republic of Korea': 'kr',
  'North Korea': 'kp',
  'Korea DPR': 'kp',
  'Australia': 'au',
  'Iran': 'ir',
  'Saudi Arabia': 'sa',
  'Qatar': 'qa',
  'UAE': 'ae',
  'United Arab Emirates': 'ae',
  'Iraq': 'iq',
  'Jordan': 'jo',
  'Uzbekistan': 'uz',
  'Bahrain': 'bh',
  'Oman': 'om',
  'Kuwait': 'kw',
  'Lebanon': 'lb',
  'Palestine': 'ps',
  'Syria': 'sy',
  'China': 'cn',
  'China PR': 'cn',
  "Chinese Taipei": 'tw',
  'India': 'in',
  'Indonesia': 'id',
  'Vietnam': 'vn',
  'Thailand': 'th',
  'Malaysia': 'my',
  'Singapore': 'sg',
  'Philippines': 'ph',
  'Hong Kong': 'hk',
  'Tajikistan': 'tj',
  'Turkmenistan': 'tm',
  'Kyrgyzstan': 'kg',
  'Kazakhstan': 'kz',
  'Afghanistan': 'af',
  'Pakistan': 'pk',
  'Bangladesh': 'bd',
  'Sri Lanka': 'lk',
  'Nepal': 'np',
  'Bhutan': 'bt',
  'Maldives': 'mv',
  'Yemen': 'ye',
  'Myanmar': 'mm',
  'Cambodia': 'kh',
  'Laos': 'la',
  'Mongolia': 'mn',
  'Brunei': 'bn',
  'Timor-Leste': 'tl',
  'Guam': 'gu',

  // OFC
  'New Zealand': 'nz',
  'Fiji': 'fj',
  'Solomon Islands': 'sb',
  'Vanuatu': 'vu',
  'Tahiti': 'pf',
  'New Caledonia': 'nc',
  'Papua New Guinea': 'pg',
  'Samoa': 'ws',
  'Tonga': 'to',
  'Cook Islands': 'ck',
};

// Sub-national flags don't render as Unicode regional indicators on most
// platforms (England, Scotland, Wales). For those we fall back to a small
// inline image via flagcdn.com (which supports `gb-eng`, `gb-sct`, etc.).
const SUBDIVISION_CODES = new Set(['gb-eng', 'gb-sct', 'gb-wls', 'gb-nir', 'xk']);

function normalizeName(s) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritics
    .replace(/[^a-z]+/g, '');
}

function isoToEmoji(iso2) {
  if (!iso2 || iso2.length !== 2) return '';
  return String.fromCodePoint(
    ...iso2.toUpperCase().split('').map((c) => 0x1f1e6 + c.charCodeAt(0) - 65),
  );
}

export function isoForCountry(name) {
  if (!name) return null;
  const direct = COUNTRY_TO_ISO[name];
  if (direct) return direct;
  // Loose match: lowercase, strip diacritics + non-alphanumerics
  const norm = normalizeName(name);
  for (const [k, v] of Object.entries(COUNTRY_TO_ISO)) {
    if (normalizeName(k) === norm) return v;
  }
  return null;
}

// Returns a string like "🇲🇽" for emoji-capable codes, or '' for sub-national.
// Use <Flag> for a renderable element that handles both.
export function flagEmoji(name) {
  const iso = isoForCountry(name);
  if (!iso) return '';
  if (SUBDIVISION_CODES.has(iso)) return ''; // Will fall back to img
  return isoToEmoji(iso);
}

// Flags are self-hosted SVGs under /public/flags — Untitled UI's "rectangle" set,
// every flag normalized to a 30x20 (3:2) viewBox so they share one aspect ratio.
// The handful Untitled UI doesn't ship (England, Northern Ireland, Kosovo, New
// Caledonia) come from flagcdn, downloaded into the same folder. SVG scales
// cleanly, so there are no per-size variants — render them in a fixed box.
export function flagImgUrl(name) {
  const iso = isoForCountry(name);
  if (!iso) return null;
  return `/flags/${iso}.svg`;
}

export function hasFlag(name) {
  return !!isoForCountry(name);
}

// FIFA 3-letter codes — what every football broadcast uses. Keyed by the
// same names football-data.org returns (with the common aliases too).
const FIFA_CODES = {
  // CONCACAF
  Mexico: 'MEX', Canada: 'CAN', Honduras: 'HON', Panama: 'PAN', 'Costa Rica': 'CRC',
  Jamaica: 'JAM', 'El Salvador': 'SLV', 'Curaçao': 'CUW', Curacao: 'CUW',
  'Trinidad and Tobago': 'TRI', Haiti: 'HAI', 'United States': 'USA', USA: 'USA',
  // CONMEBOL
  Argentina: 'ARG', Brazil: 'BRA', Uruguay: 'URU', Colombia: 'COL', Ecuador: 'ECU',
  Paraguay: 'PAR', Peru: 'PER', Chile: 'CHI', Bolivia: 'BOL', Venezuela: 'VEN',
  // UEFA
  England: 'ENG', Scotland: 'SCO', Wales: 'WAL', 'Northern Ireland': 'NIR',
  Ireland: 'IRL', 'Republic of Ireland': 'IRL',
  Spain: 'ESP', France: 'FRA', Germany: 'GER', Italy: 'ITA', Netherlands: 'NED',
  Portugal: 'POR', Belgium: 'BEL', Croatia: 'CRO', Serbia: 'SRB', Switzerland: 'SUI',
  Denmark: 'DEN', Sweden: 'SWE', Norway: 'NOR', Finland: 'FIN', Iceland: 'ISL',
  Poland: 'POL', Austria: 'AUT', 'Czech Republic': 'CZE', Czechia: 'CZE',
  Slovakia: 'SVK', Slovenia: 'SVN', Hungary: 'HUN', Romania: 'ROU', Bulgaria: 'BUL',
  Greece: 'GRE', Turkey: 'TUR', 'Türkiye': 'TUR', Albania: 'ALB',
  'North Macedonia': 'MKD', Macedonia: 'MKD', Montenegro: 'MNE', Kosovo: 'KVX',
  'Bosnia-Herzegovina': 'BIH', 'Bosnia and Herzegovina': 'BIH',
  Russia: 'RUS', Ukraine: 'UKR', Belarus: 'BLR', Georgia: 'GEO', Armenia: 'ARM',
  Azerbaijan: 'AZE',
  // CAF
  Morocco: 'MAR', Senegal: 'SEN', Egypt: 'EGY', Nigeria: 'NGA', Cameroon: 'CMR',
  Ghana: 'GHA', Tunisia: 'TUN', Algeria: 'ALG', 'Ivory Coast': 'CIV',
  "Côte d'Ivoire": 'CIV', "Cote d'Ivoire": 'CIV',
  'South Africa': 'RSA', Mali: 'MLI', 'Burkina Faso': 'BFA',
  'DR Congo': 'COD', 'Congo DR': 'COD', 'Democratic Republic of Congo': 'COD',
  'Cape Verde': 'CPV', 'Cape Verde Islands': 'CPV', 'Cabo Verde': 'CPV',
  Zambia: 'ZAM', Zimbabwe: 'ZIM', Kenya: 'KEN', Tanzania: 'TAN', Angola: 'ANG',
  Madagascar: 'MAD', Mauritania: 'MTN', Guinea: 'GUI', 'Equatorial Guinea': 'EQG',
  Gabon: 'GAB', Benin: 'BEN', Togo: 'TOG',
  // AFC
  Japan: 'JPN', 'South Korea': 'KOR', 'Korea Republic': 'KOR',
  'Republic of Korea': 'KOR', 'North Korea': 'PRK', 'Korea DPR': 'PRK',
  Australia: 'AUS', Iran: 'IRN', 'IR Iran': 'IRN', 'Saudi Arabia': 'KSA', Qatar: 'QAT',
  UAE: 'UAE', 'United Arab Emirates': 'UAE', Iraq: 'IRQ', Jordan: 'JOR',
  Uzbekistan: 'UZB', Bahrain: 'BHR', Oman: 'OMA', Kuwait: 'KUW', Lebanon: 'LBN',
  China: 'CHN', 'China PR': 'CHN', India: 'IND', Indonesia: 'IDN', Vietnam: 'VIE',
  Thailand: 'THA', Malaysia: 'MAS', Singapore: 'SGP', Philippines: 'PHI',
  // OFC
  'New Zealand': 'NZL', Fiji: 'FIJ', 'Papua New Guinea': 'PNG', Tahiti: 'TAH',
  'Solomon Islands': 'SOL',
};

export function fifaCode(name) {
  if (!name) return '';
  if (FIFA_CODES[name]) return FIFA_CODES[name];
  // Loose-match fallback via normalized name
  const target = normalizeName(name);
  for (const [k, v] of Object.entries(FIFA_CODES)) {
    if (normalizeName(k) === target) return v;
  }
  // Last resort: first 3 uppercase letters
  return name.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase();
}
