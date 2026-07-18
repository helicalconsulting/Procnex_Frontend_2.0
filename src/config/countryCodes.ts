export interface CountryCode {
  code: string;   // ISO 3166-1 alpha-2
  dial: string;   // e.g. '+91'
  name: string;   // Country name
  flag: string;   // Emoji flag
}

/** Convert 2-letter country code to flag emoji */
function getFlag(countryCode: string): string {
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65);
  return String.fromCodePoint(...codePoints);
}

const RAW_COUNTRY_CODES: { code: string; dial: string; name: string }[] = [
  { code: 'KE', dial: '+254', name: 'Kenya' },
  { code: 'IN', dial: '+91',  name: 'India' },
  { code: 'US', dial: '+1',   name: 'United States' },
  { code: 'CA', dial: '+1',   name: 'Canada' },
  { code: 'GB', dial: '+44',  name: 'United Kingdom' },
  { code: 'AU', dial: '+61',  name: 'Australia' },
  { code: 'NG', dial: '+234', name: 'Nigeria' },
  { code: 'ZA', dial: '+27',  name: 'South Africa' },
  { code: 'EG', dial: '+20',  name: 'Egypt' },
  { code: 'GH', dial: '+233', name: 'Ghana' },
  { code: 'TZ', dial: '+255', name: 'Tanzania' },
  { code: 'UG', dial: '+256', name: 'Uganda' },
  { code: 'RW', dial: '+250', name: 'Rwanda' },
  { code: 'ET', dial: '+251', name: 'Ethiopia' },
  { code: 'AE', dial: '+971', name: 'UAE' },
  { code: 'SA', dial: '+966', name: 'Saudi Arabia' },
  { code: 'PK', dial: '+92',  name: 'Pakistan' },
  { code: 'BD', dial: '+880', name: 'Bangladesh' },
  { code: 'LK', dial: '+94',  name: 'Sri Lanka' },
  { code: 'NP', dial: '+977', name: 'Nepal' },
  { code: 'CN', dial: '+86',  name: 'China' },
  { code: 'JP', dial: '+81',  name: 'Japan' },
  { code: 'KR', dial: '+82',  name: 'South Korea' },
  { code: 'SG', dial: '+65',  name: 'Singapore' },
  { code: 'MY', dial: '+60',  name: 'Malaysia' },
  { code: 'PH', dial: '+63',  name: 'Philippines' },
  { code: 'VN', dial: '+84',  name: 'Vietnam' },
  { code: 'TH', dial: '+66',  name: 'Thailand' },
  { code: 'ID', dial: '+62',  name: 'Indonesia' },
  { code: 'DE', dial: '+49',  name: 'Germany' },
  { code: 'FR', dial: '+33',  name: 'France' },
  { code: 'IT', dial: '+39',  name: 'Italy' },
  { code: 'ES', dial: '+34',  name: 'Spain' },
  { code: 'NL', dial: '+31',  name: 'Netherlands' },
  { code: 'BE', dial: '+32',  name: 'Belgium' },
  { code: 'CH', dial: '+41',  name: 'Switzerland' },
  { code: 'SE', dial: '+46',  name: 'Sweden' },
  { code: 'NO', dial: '+47',  name: 'Norway' },
  { code: 'DK', dial: '+45',  name: 'Denmark' },
  { code: 'FI', dial: '+358', name: 'Finland' },
  { code: 'BR', dial: '+55',  name: 'Brazil' },
  { code: 'MX', dial: '+52',  name: 'Mexico' },
  { code: 'AR', dial: '+54',  name: 'Argentina' },
  { code: 'CL', dial: '+56',  name: 'Chile' },
  { code: 'CO', dial: '+57',  name: 'Colombia' },
  { code: 'PE', dial: '+51',  name: 'Peru' },
  { code: 'RU', dial: '+7',   name: 'Russia' },
  { code: 'TR', dial: '+90',  name: 'Turkey' },
  { code: 'IL', dial: '+972', name: 'Israel' },
  { code: 'HK', dial: '+852', name: 'Hong Kong' },
  { code: 'TW', dial: '+886', name: 'Taiwan' },
  { code: 'AT', dial: '+43',  name: 'Austria' },
  { code: 'IE', dial: '+353', name: 'Ireland' },
  { code: 'PT', dial: '+351', name: 'Portugal' },
  { code: 'GR', dial: '+30',  name: 'Greece' },
  { code: 'PL', dial: '+48',  name: 'Poland' },
  { code: 'CZ', dial: '+420', name: 'Czech Republic' },
  { code: 'HU', dial: '+36',  name: 'Hungary' },
  { code: 'RO', dial: '+40',  name: 'Romania' },
  { code: 'UA', dial: '+380', name: 'Ukraine' },
  { code: 'MA', dial: '+212', name: 'Morocco' },
  { code: 'DZ', dial: '+213', name: 'Algeria' },
  { code: 'TN', dial: '+216', name: 'Tunisia' },
  { code: 'MU', dial: '+230', name: 'Mauritius' },
  { code: 'SC', dial: '+248', name: 'Seychelles' },
  { code: 'MW', dial: '+265', name: 'Malawi' },
  { code: 'ZM', dial: '+260', name: 'Zambia' },
  { code: 'ZW', dial: '+263', name: 'Zimbabwe' },
  { code: 'AO', dial: '+244', name: 'Angola' },
  { code: 'MZ', dial: '+258', name: 'Mozambique' },
  { code: 'BW', dial: '+267', name: 'Botswana' },
  { code: 'NA', dial: '+264', name: 'Namibia' },
  { code: 'LS', dial: '+266', name: 'Lesotho' },
  { code: 'SZ', dial: '+268', name: 'Eswatini' },
  { code: 'MG', dial: '+261', name: 'Madagascar' },
  { code: 'CM', dial: '+237', name: 'Cameroon' },
  { code: 'CI', dial: '+225', name: "Côte d'Ivoire" },
  { code: 'SN', dial: '+221', name: 'Senegal' },
  { code: 'ML', dial: '+223', name: 'Mali' },
  { code: 'BF', dial: '+226', name: 'Burkina Faso' },
  { code: 'NE', dial: '+227', name: 'Niger' },
  { code: 'TG', dial: '+228', name: 'Togo' },
  { code: 'BJ', dial: '+229', name: 'Benin' },
  { code: 'SL', dial: '+232', name: 'Sierra Leone' },
  { code: 'LR', dial: '+231', name: 'Liberia' },
  { code: 'GM', dial: '+220', name: 'Gambia' },
  { code: 'SO', dial: '+252', name: 'Somalia' },
  { code: 'SD', dial: '+249', name: 'Sudan' },
  { code: 'SS', dial: '+211', name: 'South Sudan' },
  { code: 'DJ', dial: '+253', name: 'Djibouti' },
  { code: 'ER', dial: '+291', name: 'Eritrea' },
  { code: 'CF', dial: '+236', name: 'Central African Republic' },
  { code: 'CD', dial: '+243', name: 'DR Congo' },
  { code: 'CG', dial: '+242', name: 'Republic of the Congo' },
  { code: 'GA', dial: '+241', name: 'Gabon' },
  { code: 'GQ', dial: '+240', name: 'Equatorial Guinea' },
  { code: 'TD', dial: '+235', name: 'Chad' },
  { code: 'MR', dial: '+222', name: 'Mauritania' },
  { code: 'CV', dial: '+238', name: 'Cape Verde' },
  { code: 'ST', dial: '+239', name: 'São Tomé and Príncipe' },
  { code: 'KM', dial: '+269', name: 'Comoros' },
  // European micro-states
  { code: 'LU', dial: '+352', name: 'Luxembourg' },
  { code: 'MT', dial: '+356', name: 'Malta' },
  { code: 'CY', dial: '+357', name: 'Cyprus' },
  { code: 'IS', dial: '+354', name: 'Iceland' },
  { code: 'LI', dial: '+423', name: 'Liechtenstein' },
  { code: 'MC', dial: '+377', name: 'Monaco' },
  { code: 'SM', dial: '+378', name: 'San Marino' },
  { code: 'VA', dial: '+379', name: 'Vatican City' },
  { code: 'AD', dial: '+376', name: 'Andorra' },
  // Caribbean
  { code: 'CU', dial: '+53',  name: 'Cuba' },
  { code: 'JM', dial: '+1-876', name: 'Jamaica' },
  { code: 'DO', dial: '+1-809', name: 'Dominican Republic' },
  { code: 'PR', dial: '+1-787', name: 'Puerto Rico' },
  { code: 'BS', dial: '+1-242', name: 'Bahamas' },
  { code: 'BB', dial: '+1-246', name: 'Barbados' },
  { code: 'TT', dial: '+1-868', name: 'Trinidad and Tobago' },
  // Pacific
  { code: 'NZ', dial: '+64',  name: 'New Zealand' },
  { code: 'FJ', dial: '+679', name: 'Fiji' },
  { code: 'PG', dial: '+675', name: 'Papua New Guinea' },
  { code: 'SB', dial: '+677', name: 'Solomon Islands' },
  { code: 'VU', dial: '+678', name: 'Vanuatu' },
  { code: 'WS', dial: '+685', name: 'Samoa' },
  // Middle East
  { code: 'QA', dial: '+974', name: 'Qatar' },
  { code: 'KW', dial: '+965', name: 'Kuwait' },
  { code: 'BH', dial: '+973', name: 'Bahrain' },
  { code: 'OM', dial: '+968', name: 'Oman' },
  { code: 'JO', dial: '+962', name: 'Jordan' },
  { code: 'LB', dial: '+961', name: 'Lebanon' },
  { code: 'IQ', dial: '+964', name: 'Iraq' },
  { code: 'YE', dial: '+967', name: 'Yemen' },
  { code: 'SY', dial: '+963', name: 'Syria' },
  { code: 'PS', dial: '+970', name: 'Palestine' },
  // Central Asia
  { code: 'KZ', dial: '+7',   name: 'Kazakhstan' },
  { code: 'UZ', dial: '+998', name: 'Uzbekistan' },
  { code: 'TM', dial: '+993', name: 'Turkmenistan' },
  { code: 'KG', dial: '+996', name: 'Kyrgyzstan' },
  { code: 'TJ', dial: '+992', name: 'Tajikistan' },
  { code: 'MN', dial: '+976', name: 'Mongolia' },
  // South America
  { code: 'VE', dial: '+58',  name: 'Venezuela' },
  { code: 'EC', dial: '+593', name: 'Ecuador' },
  { code: 'BO', dial: '+591', name: 'Bolivia' },
  { code: 'PY', dial: '+595', name: 'Paraguay' },
  { code: 'UY', dial: '+598', name: 'Uruguay' },
  { code: 'GY', dial: '+592', name: 'Guyana' },
  { code: 'SR', dial: '+597', name: 'Suriname' },
  // Central America
  { code: 'GT', dial: '+502', name: 'Guatemala' },
  { code: 'BZ', dial: '+501', name: 'Belize' },
  { code: 'SV', dial: '+503', name: 'El Salvador' },
  { code: 'HN', dial: '+504', name: 'Honduras' },
  { code: 'NI', dial: '+505', name: 'Nicaragua' },
  { code: 'CR', dial: '+506', name: 'Costa Rica' },
  { code: 'PA', dial: '+507', name: 'Panama' },
  // Others
  { code: 'GE', dial: '+995', name: 'Georgia' },
  { code: 'AM', dial: '+374', name: 'Armenia' },
  { code: 'AZ', dial: '+994', name: 'Azerbaijan' },
  { code: 'BY', dial: '+375', name: 'Belarus' },
  { code: 'MD', dial: '+373', name: 'Moldova' },
  { code: 'MK', dial: '+389', name: 'North Macedonia' },
  { code: 'AL', dial: '+355', name: 'Albania' },
  { code: 'BA', dial: '+387', name: 'Bosnia and Herzegovina' },
  { code: 'RS', dial: '+381', name: 'Serbia' },
  { code: 'ME', dial: '+382', name: 'Montenegro' },
  { code: 'XK', dial: '+383', name: 'Kosovo' },
  { code: 'BG', dial: '+359', name: 'Bulgaria' },
  { code: 'SK', dial: '+421', name: 'Slovakia' },
  { code: 'SI', dial: '+386', name: 'Slovenia' },
  { code: 'HR', dial: '+385', name: 'Croatia' },
  { code: 'LT', dial: '+370', name: 'Lithuania' },
  { code: 'LV', dial: '+371', name: 'Latvia' },
  { code: 'EE', dial: '+372', name: 'Estonia' },
  { code: 'AF', dial: '+93',  name: 'Afghanistan' },
  { code: 'IR', dial: '+98',  name: 'Iran' },
  { code: 'MM', dial: '+95',  name: 'Myanmar' },
  { code: 'KH', dial: '+855', name: 'Cambodia' },
  { code: 'LA', dial: '+856', name: 'Laos' },
  { code: 'MO', dial: '+853', name: 'Macau' },
  { code: 'BN', dial: '+673', name: 'Brunei' },
  { code: 'MV', dial: '+960', name: 'Maldives' },
  { code: 'BT', dial: '+975', name: 'Bhutan' },
  { code: 'TL', dial: '+670', name: 'Timor-Leste' },
  { code: 'KP', dial: '+850', name: 'North Korea' },
  { code: 'HT', dial: '+509', name: 'Haiti' },
  { code: 'MN', dial: '+976', name: 'Mongolia' },
  { code: 'LA', dial: '+856', name: 'Laos' },
];

/** Deduplicated list of country codes — first occurrence kept */
const seen = new Set<string>();
export const COUNTRY_CODES: CountryCode[] = RAW_COUNTRY_CODES
  .filter((c) => {
    const key = c.code;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  })
  .map((c) => ({
    ...c,
    flag: getFlag(c.code),
  }))
  .sort((a, b) => {
    // KE (Kenya) first
    if (a.code === 'KE') return -1;
    if (b.code === 'KE') return 1;
    // Then common business regions
    const top = ['IN', 'US', 'GB', 'AE', 'CN'];
    const ai = top.indexOf(a.code);
    const bi = top.indexOf(b.code);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.name.localeCompare(b.name);
  });
