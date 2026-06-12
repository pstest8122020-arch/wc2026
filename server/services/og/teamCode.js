// FIFA 3-letter country codes for OG cards (server-side copy of the client's
// flags.js map, so cards render "BRA 2-1 SRB" without crossing into client code).

const FIFA_CODES = {
  Mexico: 'MEX', Canada: 'CAN', Honduras: 'HON', Panama: 'PAN', 'Costa Rica': 'CRC',
  Jamaica: 'JAM', 'El Salvador': 'SLV', 'Curaçao': 'CUW', Curacao: 'CUW',
  'Trinidad and Tobago': 'TRI', Haiti: 'HAI', 'United States': 'USA', USA: 'USA',
  Argentina: 'ARG', Brazil: 'BRA', Uruguay: 'URU', Colombia: 'COL', Ecuador: 'ECU',
  Paraguay: 'PAR', Peru: 'PER', Chile: 'CHI', Bolivia: 'BOL', Venezuela: 'VEN',
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
  Morocco: 'MAR', Senegal: 'SEN', Egypt: 'EGY', Nigeria: 'NGA', Cameroon: 'CMR',
  Ghana: 'GHA', Tunisia: 'TUN', Algeria: 'ALG', 'Ivory Coast': 'CIV',
  "Côte d'Ivoire": 'CIV', "Cote d'Ivoire": 'CIV',
  'South Africa': 'RSA', Mali: 'MLI', 'Burkina Faso': 'BFA',
  'DR Congo': 'COD', 'Congo DR': 'COD', 'Democratic Republic of Congo': 'COD',
  'Cape Verde': 'CPV', 'Cape Verde Islands': 'CPV', 'Cabo Verde': 'CPV',
  Zambia: 'ZAM', Zimbabwe: 'ZIM', Kenya: 'KEN', Tanzania: 'TAN', Angola: 'ANG',
  Madagascar: 'MAD', Mauritania: 'MTN', Guinea: 'GUI', 'Equatorial Guinea': 'EQG',
  Gabon: 'GAB', Benin: 'BEN', Togo: 'TOG',
  Japan: 'JPN', 'South Korea': 'KOR', 'Korea Republic': 'KOR',
  'Republic of Korea': 'KOR', 'North Korea': 'PRK', 'Korea DPR': 'PRK',
  Australia: 'AUS', Iran: 'IRN', 'IR Iran': 'IRN', 'Saudi Arabia': 'KSA', Qatar: 'QAT',
  UAE: 'UAE', 'United Arab Emirates': 'UAE', Iraq: 'IRQ', Jordan: 'JOR',
  Uzbekistan: 'UZB', Bahrain: 'BHR', Oman: 'OMA', Kuwait: 'KUW', Lebanon: 'LBN',
  China: 'CHN', 'China PR': 'CHN', India: 'IND', Indonesia: 'IDN', Vietnam: 'VIE',
  Thailand: 'THA', Malaysia: 'MAS', Singapore: 'SGP', Philippines: 'PHI',
  'New Zealand': 'NZL', Fiji: 'FIJ', 'Papua New Guinea': 'PNG', Tahiti: 'TAH',
  'Solomon Islands': 'SOL',
};

function normalizeName(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z]+/g, '');
}

export function teamCode(name) {
  if (!name || name === 'TBD') return name === 'TBD' ? 'TBD' : '';
  if (FIFA_CODES[name]) return FIFA_CODES[name];
  const target = normalizeName(name);
  for (const [k, v] of Object.entries(FIFA_CODES)) {
    if (normalizeName(k) === target) return v;
  }
  return name.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase();
}
