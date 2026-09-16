import { useState, useEffect, useMemo, useCallback, useRef, createContext, useContext, type ReactNode } from 'react';
import { Search, Banknote, ChevronDown, RefreshCw, Globe, Check } from 'lucide-react';
import { API_BASE } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import FloatingMenu from './FloatingMenu';
import './CurrencyMaster.css';

// ─── Types ──────────────────────────────────────────────────

export interface CurrencyInfo {
  code: string;
  name: string;
  symbol: string;
  countryCode: string; // ISO 3166-1 alpha-2 for flag emoji
  countryName?: string; // For search purposes
}

export interface CurrencyRates {
  base: string;
  date: string;
  rates: Record<string, number>;
}

const DEFAULT_CURRENCY = 'KES';

/** Convert a 2-letter country code to a flag emoji */
function getFlagEmoji(countryCode: string): string {
  if (!countryCode || countryCode.length !== 2) return '';
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map((ch) => 0x1F1E6 + ch.charCodeAt(0) - 65);
  return String.fromCodePoint(...codePoints);
}

/** Mapping from currency code → country code for flag display */
const CURRENCY_COUNTRY_MAP: Record<string, { countryCode: string; countryName: string }> = {
  AED: { countryCode: 'AE', countryName: 'United Arab Emirates' },
  AFN: { countryCode: 'AF', countryName: 'Afghanistan' },
  ALL: { countryCode: 'AL', countryName: 'Albania' },
  AMD: { countryCode: 'AM', countryName: 'Armenia' },
  ANG: { countryCode: 'CW', countryName: 'Curaçao' },
  AOA: { countryCode: 'AO', countryName: 'Angola' },
  ARS: { countryCode: 'AR', countryName: 'Argentina' },
  AUD: { countryCode: 'AU', countryName: 'Australia' },
  AWG: { countryCode: 'AW', countryName: 'Aruba' },
  AZN: { countryCode: 'AZ', countryName: 'Azerbaijan' },
  BAM: { countryCode: 'BA', countryName: 'Bosnia & Herzegovina' },
  BBD: { countryCode: 'BB', countryName: 'Barbados' },
  BDT: { countryCode: 'BD', countryName: 'Bangladesh' },
  BGN: { countryCode: 'BG', countryName: 'Bulgaria' },
  BHD: { countryCode: 'BH', countryName: 'Bahrain' },
  BIF: { countryCode: 'BI', countryName: 'Burundi' },
  BMD: { countryCode: 'BM', countryName: 'Bermuda' },
  BND: { countryCode: 'BN', countryName: 'Brunei' },
  BOB: { countryCode: 'BO', countryName: 'Bolivia' },
  BRL: { countryCode: 'BR', countryName: 'Brazil' },
  BSD: { countryCode: 'BS', countryName: 'Bahamas' },
  BTN: { countryCode: 'BT', countryName: 'Bhutan' },
  BWP: { countryCode: 'BW', countryName: 'Botswana' },
  BYN: { countryCode: 'BY', countryName: 'Belarus' },
  BZD: { countryCode: 'BZ', countryName: 'Belize' },
  CAD: { countryCode: 'CA', countryName: 'Canada' },
  CDF: { countryCode: 'CD', countryName: 'DR Congo' },
  CHF: { countryCode: 'CH', countryName: 'Switzerland' },
  CLP: { countryCode: 'CL', countryName: 'Chile' },
  CNY: { countryCode: 'CN', countryName: 'China' },
  COP: { countryCode: 'CO', countryName: 'Colombia' },
  CRC: { countryCode: 'CR', countryName: 'Costa Rica' },
  CUP: { countryCode: 'CU', countryName: 'Cuba' },
  CVE: { countryCode: 'CV', countryName: 'Cape Verde' },
  CZK: { countryCode: 'CZ', countryName: 'Czech Republic' },
  DJF: { countryCode: 'DJ', countryName: 'Djibouti' },
  DKK: { countryCode: 'DK', countryName: 'Denmark' },
  DOP: { countryCode: 'DO', countryName: 'Dominican Republic' },
  DZD: { countryCode: 'DZ', countryName: 'Algeria' },
  EGP: { countryCode: 'EG', countryName: 'Egypt' },
  ERN: { countryCode: 'ER', countryName: 'Eritrea' },
  ETB: { countryCode: 'ET', countryName: 'Ethiopia' },
  EUR: { countryCode: 'EU', countryName: 'European Union' },
  FJD: { countryCode: 'FJ', countryName: 'Fiji' },
  FKP: { countryCode: 'FK', countryName: 'Falkland Islands' },
  FOK: { countryCode: 'FO', countryName: 'Faroe Islands' },
  GBP: { countryCode: 'GB', countryName: 'United Kingdom' },
  GEL: { countryCode: 'GE', countryName: 'Georgia' },
  GGP: { countryCode: 'GG', countryName: 'Guernsey' },
  GHS: { countryCode: 'GH', countryName: 'Ghana' },
  GIP: { countryCode: 'GI', countryName: 'Gibraltar' },
  GMD: { countryCode: 'GM', countryName: 'Gambia' },
  GNF: { countryCode: 'GN', countryName: 'Guinea' },
  GTQ: { countryCode: 'GT', countryName: 'Guatemala' },
  GYD: { countryCode: 'GY', countryName: 'Guyana' },
  HKD: { countryCode: 'HK', countryName: 'Hong Kong' },
  HNL: { countryCode: 'HN', countryName: 'Honduras' },
  HRK: { countryCode: 'HR', countryName: 'Croatia' },
  HTG: { countryCode: 'HT', countryName: 'Haiti' },
  HUF: { countryCode: 'HU', countryName: 'Hungary' },
  IDR: { countryCode: 'ID', countryName: 'Indonesia' },
  ILS: { countryCode: 'IL', countryName: 'Israel' },
  IMP: { countryCode: 'IM', countryName: 'Isle of Man' },
  INR: { countryCode: 'IN', countryName: 'India' },
  IQD: { countryCode: 'IQ', countryName: 'Iraq' },
  IRR: { countryCode: 'IR', countryName: 'Iran' },
  ISK: { countryCode: 'IS', countryName: 'Iceland' },
  JEP: { countryCode: 'JE', countryName: 'Jersey' },
  JMD: { countryCode: 'JM', countryName: 'Jamaica' },
  JOD: { countryCode: 'JO', countryName: 'Jordan' },
  JPY: { countryCode: 'JP', countryName: 'Japan' },
  KES: { countryCode: 'KE', countryName: 'Kenya' },
  KGS: { countryCode: 'KG', countryName: 'Kyrgyzstan' },
  KHR: { countryCode: 'KH', countryName: 'Cambodia' },
  KID: { countryCode: 'KI', countryName: 'Kiribati' },
  KMF: { countryCode: 'KM', countryName: 'Comoros' },
  KRW: { countryCode: 'KR', countryName: 'South Korea' },
  KWD: { countryCode: 'KW', countryName: 'Kuwait' },
  KYD: { countryCode: 'KY', countryName: 'Cayman Islands' },
  KZT: { countryCode: 'KZ', countryName: 'Kazakhstan' },
  LAK: { countryCode: 'LA', countryName: 'Laos' },
  LBP: { countryCode: 'LB', countryName: 'Lebanon' },
  LKR: { countryCode: 'LK', countryName: 'Sri Lanka' },
  LRD: { countryCode: 'LR', countryName: 'Liberia' },
  LSL: { countryCode: 'LS', countryName: 'Lesotho' },
  LYD: { countryCode: 'LY', countryName: 'Libya' },
  MAD: { countryCode: 'MA', countryName: 'Morocco' },
  MDL: { countryCode: 'MD', countryName: 'Moldova' },
  MGA: { countryCode: 'MG', countryName: 'Madagascar' },
  MKD: { countryCode: 'MK', countryName: 'North Macedonia' },
  MMK: { countryCode: 'MM', countryName: 'Myanmar' },
  MNT: { countryCode: 'MN', countryName: 'Mongolia' },
  MOP: { countryCode: 'MO', countryName: 'Macau' },
  MRU: { countryCode: 'MR', countryName: 'Mauritania' },
  MUR: { countryCode: 'MU', countryName: 'Mauritius' },
  MVR: { countryCode: 'MV', countryName: 'Maldives' },
  MWK: { countryCode: 'MW', countryName: 'Malawi' },
  MXN: { countryCode: 'MX', countryName: 'Mexico' },
  MYR: { countryCode: 'MY', countryName: 'Malaysia' },
  MZN: { countryCode: 'MZ', countryName: 'Mozambique' },
  NAD: { countryCode: 'NA', countryName: 'Namibia' },
  NGN: { countryCode: 'NG', countryName: 'Nigeria' },
  NIO: { countryCode: 'NI', countryName: 'Nicaragua' },
  NOK: { countryCode: 'NO', countryName: 'Norway' },
  NPR: { countryCode: 'NP', countryName: 'Nepal' },
  NZD: { countryCode: 'NZ', countryName: 'New Zealand' },
  OMR: { countryCode: 'OM', countryName: 'Oman' },
  PAB: { countryCode: 'PA', countryName: 'Panama' },
  PEN: { countryCode: 'PE', countryName: 'Peru' },
  PGK: { countryCode: 'PG', countryName: 'Papua New Guinea' },
  PHP: { countryCode: 'PH', countryName: 'Philippines' },
  PKR: { countryCode: 'PK', countryName: 'Pakistan' },
  PLN: { countryCode: 'PL', countryName: 'Poland' },
  PYG: { countryCode: 'PY', countryName: 'Paraguay' },
  QAR: { countryCode: 'QA', countryName: 'Qatar' },
  RON: { countryCode: 'RO', countryName: 'Romania' },
  RSD: { countryCode: 'RS', countryName: 'Serbia' },
  RUB: { countryCode: 'RU', countryName: 'Russia' },
  RWF: { countryCode: 'RW', countryName: 'Rwanda' },
  SAR: { countryCode: 'SA', countryName: 'Saudi Arabia' },
  SBD: { countryCode: 'SB', countryName: 'Solomon Islands' },
  SCR: { countryCode: 'SC', countryName: 'Seychelles' },
  SDG: { countryCode: 'SD', countryName: 'Sudan' },
  SEK: { countryCode: 'SE', countryName: 'Sweden' },
  SGD: { countryCode: 'SG', countryName: 'Singapore' },
  SHP: { countryCode: 'SH', countryName: 'St Helena' },
  SLL: { countryCode: 'SL', countryName: 'Sierra Leone' },
  SOS: { countryCode: 'SO', countryName: 'Somalia' },
  SPL: { countryCode: 'SPL', countryName: 'Seborga' },
  SRD: { countryCode: 'SR', countryName: 'Suriname' },
  STN: { countryCode: 'ST', countryName: 'São Tomé & Príncipe' },
  SVC: { countryCode: 'SV', countryName: 'El Salvador' },
  SYP: { countryCode: 'SY', countryName: 'Syria' },
  SZL: { countryCode: 'SZ', countryName: 'Eswatini' },
  THB: { countryCode: 'TH', countryName: 'Thailand' },
  TJS: { countryCode: 'TJ', countryName: 'Tajikistan' },
  TMT: { countryCode: 'TM', countryName: 'Turkmenistan' },
  TND: { countryCode: 'TN', countryName: 'Tunisia' },
  TOP: { countryCode: 'TO', countryName: 'Tonga' },
  TRY: { countryCode: 'TR', countryName: 'Turkey' },
  TTD: { countryCode: 'TT', countryName: 'Trinidad & Tobago' },
  TVD: { countryCode: 'TV', countryName: 'Tuvalu' },
  TWD: { countryCode: 'TW', countryName: 'Taiwan' },
  TZS: { countryCode: 'TZ', countryName: 'Tanzania' },
  UAH: { countryCode: 'UA', countryName: 'Ukraine' },
  UGX: { countryCode: 'UG', countryName: 'Uganda' },
  USD: { countryCode: 'US', countryName: 'United States' },
  UYU: { countryCode: 'UY', countryName: 'Uruguay' },
  UZS: { countryCode: 'UZ', countryName: 'Uzbekistan' },
  VES: { countryCode: 'VE', countryName: 'Venezuela' },
  VND: { countryCode: 'VN', countryName: 'Vietnam' },
  VUV: { countryCode: 'VU', countryName: 'Vanuatu' },
  WST: { countryCode: 'WS', countryName: 'Samoa' },
  XAF: { countryCode: 'CM', countryName: 'Central Africa (CFA)' },
  XCD: { countryCode: 'AG', countryName: 'East Caribbean' },
  XDR: { countryCode: 'IMF', countryName: 'IMF SDR' },
  XOF: { countryCode: 'CI', countryName: 'West Africa (CFA)' },
  XPF: { countryCode: 'PF', countryName: 'French Polynesia' },
  YER: { countryCode: 'YE', countryName: 'Yemen' },
  ZAR: { countryCode: 'ZA', countryName: 'South Africa' },
  ZMW: { countryCode: 'ZM', countryName: 'Zambia' },
  ZWL: { countryCode: 'ZW', countryName: 'Zimbabwe' },
};

/**
 * Common currency symbols, names, and country data for display
 * Full list fetched from Frankfurter API, but we provide a fallback
 * in case the API is unavailable.
 */
const FALLBACK_CURRENCIES: CurrencyInfo[] = [
  // East African (defaults)
  { code: 'KES', name: 'Kenyan Shilling', symbol: 'KSh', countryCode: 'KE', countryName: 'Kenya' },
  { code: 'UGX', name: 'Ugandan Shilling', symbol: 'USh', countryCode: 'UG', countryName: 'Uganda' },
  { code: 'TZS', name: 'Tanzanian Shilling', symbol: 'TSh', countryCode: 'TZ', countryName: 'Tanzania' },
  { code: 'RWF', name: 'Rwandan Franc', symbol: 'FRw', countryCode: 'RW', countryName: 'Rwanda' },
  { code: 'BIF', name: 'Burundian Franc', symbol: 'FBu', countryCode: 'BI', countryName: 'Burundi' },
  { code: 'ETB', name: 'Ethiopian Birr', symbol: 'Br', countryCode: 'ET', countryName: 'Ethiopia' },
  { code: 'SOS', name: 'Somali Shilling', symbol: 'S', countryCode: 'SO', countryName: 'Somalia' },
  { code: 'DJF', name: 'Djiboutian Franc', symbol: 'Fdj', countryCode: 'DJ', countryName: 'Djibouti' },
  // West African
  { code: 'NGN', name: 'Nigerian Naira', symbol: '₦', countryCode: 'NG', countryName: 'Nigeria' },
  { code: 'GHS', name: 'Ghanaian Cedi', symbol: '₵', countryCode: 'GH', countryName: 'Ghana' },
  { code: 'XOF', name: 'West African CFA Franc', symbol: 'CFA', countryCode: 'CI', countryName: 'West Africa (CFA)' },
  { code: 'GMD', name: 'Gambian Dalasi', symbol: 'D', countryCode: 'GM', countryName: 'Gambia' },
  { code: 'SLL', name: 'Sierra Leonean Leone', symbol: 'Le', countryCode: 'SL', countryName: 'Sierra Leone' },
  { code: 'LRD', name: 'Liberian Dollar', symbol: 'L$', countryCode: 'LR', countryName: 'Liberia' },
  // Southern African
  { code: 'ZAR', name: 'South African Rand', symbol: 'R', countryCode: 'ZA', countryName: 'South Africa' },
  { code: 'NAD', name: 'Namibian Dollar', symbol: 'N$', countryCode: 'NA', countryName: 'Namibia' },
  { code: 'BWP', name: 'Botswana Pula', symbol: 'P', countryCode: 'BW', countryName: 'Botswana' },
  { code: 'ZMW', name: 'Zambian Kwacha', symbol: 'ZK', countryCode: 'ZM', countryName: 'Zambia' },
  { code: 'MWK', name: 'Malawian Kwacha', symbol: 'MK', countryCode: 'MW', countryName: 'Malawi' },
  { code: 'MZN', name: 'Mozambican Metical', symbol: 'MT', countryCode: 'MZ', countryName: 'Mozambique' },
  { code: 'ZWL', name: 'Zimbabwean Dollar', symbol: 'Z$', countryCode: 'ZW', countryName: 'Zimbabwe' },
  { code: 'SZL', name: 'Eswatini Lilangeni', symbol: 'E', countryCode: 'SZ', countryName: 'Eswatini' },
  { code: 'LSL', name: 'Lesotho Loti', symbol: 'L', countryCode: 'LS', countryName: 'Lesotho' },
  { code: 'AOA', name: 'Angolan Kwanza', symbol: 'Kz', countryCode: 'AO', countryName: 'Angola' },
  { code: 'CDF', name: 'Congolese Franc', symbol: 'FC', countryCode: 'CD', countryName: 'DR Congo' },
  // North African & Middle Eastern
  { code: 'AED', name: 'UAE Dirham', symbol: 'د.إ', countryCode: 'AE', countryName: 'United Arab Emirates' },
  { code: 'SAR', name: 'Saudi Riyal', symbol: '﷼', countryCode: 'SA', countryName: 'Saudi Arabia' },
  { code: 'EGP', name: 'Egyptian Pound', symbol: '£', countryCode: 'EG', countryName: 'Egypt' },
  { code: 'MAD', name: 'Moroccan Dirham', symbol: 'د.م.', countryCode: 'MA', countryName: 'Morocco' },
  { code: 'TND', name: 'Tunisian Dinar', symbol: 'د.ت', countryCode: 'TN', countryName: 'Tunisia' },
  { code: 'DZD', name: 'Algerian Dinar', symbol: 'د.ج', countryCode: 'DZ', countryName: 'Algeria' },
  { code: 'LYD', name: 'Libyan Dinar', symbol: 'ل.د', countryCode: 'LY', countryName: 'Libya' },
  { code: 'SDG', name: 'Sudanese Pound', symbol: 'ج.س', countryCode: 'SD', countryName: 'Sudan' },
  { code: 'QAR', name: 'Qatari Riyal', symbol: 'ر.ق', countryCode: 'QA', countryName: 'Qatar' },
  { code: 'OMR', name: 'Omani Rial', symbol: 'ر.ع.', countryCode: 'OM', countryName: 'Oman' },
  { code: 'KWD', name: 'Kuwaiti Dinar', symbol: 'د.ك', countryCode: 'KW', countryName: 'Kuwait' },
  { code: 'BHD', name: 'Bahraini Dinar', symbol: 'د.ب', countryCode: 'BH', countryName: 'Bahrain' },
  { code: 'JOD', name: 'Jordanian Dinar', symbol: 'د.ا', countryCode: 'JO', countryName: 'Jordan' },
  { code: 'IQD', name: 'Iraqi Dinar', symbol: 'ع.د', countryCode: 'IQ', countryName: 'Iraq' },
  { code: 'ILS', name: 'Israeli Shekel', symbol: '₪', countryCode: 'IL', countryName: 'Israel' },
  { code: 'TRY', name: 'Turkish Lira', symbol: '₺', countryCode: 'TR', countryName: 'Turkey' },
  { code: 'IRR', name: 'Iranian Rial', symbol: '﷼', countryCode: 'IR', countryName: 'Iran' },
  // Major Global
  { code: 'USD', name: 'US Dollar', symbol: '$', countryCode: 'US', countryName: 'United States' },
  { code: 'EUR', name: 'Euro', symbol: '€', countryCode: 'EU', countryName: 'European Union' },
  { code: 'GBP', name: 'British Pound', symbol: '£', countryCode: 'GB', countryName: 'United Kingdom' },
  { code: 'INR', name: 'Indian Rupee', symbol: '₹', countryCode: 'IN', countryName: 'India' },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥', countryCode: 'JP', countryName: 'Japan' },
  { code: 'CNY', name: 'Chinese Yuan', symbol: '¥', countryCode: 'CN', countryName: 'China' },
  { code: 'CHF', name: 'Swiss Franc', symbol: 'Fr', countryCode: 'CH', countryName: 'Switzerland' },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$', countryCode: 'AU', countryName: 'Australia' },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$', countryCode: 'CA', countryName: 'Canada' },
  { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$', countryCode: 'SG', countryName: 'Singapore' },
  { code: 'HKD', name: 'Hong Kong Dollar', symbol: 'HK$', countryCode: 'HK', countryName: 'Hong Kong' },
  // South & Southeast Asian
  { code: 'PKR', name: 'Pakistani Rupee', symbol: '₨', countryCode: 'PK', countryName: 'Pakistan' },
  { code: 'BDT', name: 'Bangladeshi Taka', symbol: '৳', countryCode: 'BD', countryName: 'Bangladesh' },
  { code: 'LKR', name: 'Sri Lankan Rupee', symbol: 'Rs', countryCode: 'LK', countryName: 'Sri Lanka' },
  { code: 'NPR', name: 'Nepalese Rupee', symbol: '₨', countryCode: 'NP', countryName: 'Nepal' },
  { code: 'MYR', name: 'Malaysian Ringgit', symbol: 'RM', countryCode: 'MY', countryName: 'Malaysia' },
  { code: 'THB', name: 'Thai Baht', symbol: '฿', countryCode: 'TH', countryName: 'Thailand' },
  { code: 'IDR', name: 'Indonesian Rupiah', symbol: 'Rp', countryCode: 'ID', countryName: 'Indonesia' },
  { code: 'PHP', name: 'Philippine Peso', symbol: '₱', countryCode: 'PH', countryName: 'Philippines' },
  { code: 'VND', name: 'Vietnamese Dong', symbol: '₫', countryCode: 'VN', countryName: 'Vietnam' },
  { code: 'KRW', name: 'South Korean Won', symbol: '₩', countryCode: 'KR', countryName: 'South Korea' },
  { code: 'TWD', name: 'Taiwan Dollar', symbol: 'NT$', countryCode: 'TW', countryName: 'Taiwan' },
  { code: 'KHR', name: 'Cambodian Riel', symbol: '៛', countryCode: 'KH', countryName: 'Cambodia' },
  { code: 'MMK', name: 'Myanmar Kyat', symbol: 'K', countryCode: 'MM', countryName: 'Myanmar' },
  { code: 'MNT', name: 'Mongolian Tugrik', symbol: '₮', countryCode: 'MN', countryName: 'Mongolia' },
  { code: 'MVR', name: 'Maldivian Rufiyaa', symbol: 'Rf', countryCode: 'MV', countryName: 'Maldives' },
  { code: 'LAK', name: 'Laotian Kip', symbol: '₭', countryCode: 'LA', countryName: 'Laos' },
  { code: 'MOP', name: 'Macanese Pataca', symbol: 'MOP$', countryCode: 'MO', countryName: 'Macau' },
  // European & Other
  { code: 'SEK', name: 'Swedish Krona', symbol: 'kr', countryCode: 'SE', countryName: 'Sweden' },
  { code: 'NOK', name: 'Norwegian Krone', symbol: 'kr', countryCode: 'NO', countryName: 'Norway' },
  { code: 'DKK', name: 'Danish Krone', symbol: 'kr', countryCode: 'DK', countryName: 'Denmark' },
  { code: 'PLN', name: 'Polish Zloty', symbol: 'zł', countryCode: 'PL', countryName: 'Poland' },
  { code: 'CZK', name: 'Czech Koruna', symbol: 'Kč', countryCode: 'CZ', countryName: 'Czech Republic' },
  { code: 'HUF', name: 'Hungarian Forint', symbol: 'Ft', countryCode: 'HU', countryName: 'Hungary' },
  { code: 'RON', name: 'Romanian Leu', symbol: 'lei', countryCode: 'RO', countryName: 'Romania' },
  { code: 'BGN', name: 'Bulgarian Lev', symbol: 'лв', countryCode: 'BG', countryName: 'Bulgaria' },
  { code: 'UAH', name: 'Ukrainian Hryvnia', symbol: '₴', countryCode: 'UA', countryName: 'Ukraine' },
  { code: 'RUB', name: 'Russian Ruble', symbol: '₽', countryCode: 'RU', countryName: 'Russia' },
  { code: 'HRK', name: 'Croatian Kuna', symbol: 'kn', countryCode: 'HR', countryName: 'Croatia' },
  { code: 'RSD', name: 'Serbian Dinar', symbol: 'дин', countryCode: 'RS', countryName: 'Serbia' },
  // Americas
  { code: 'MXN', name: 'Mexican Peso', symbol: 'Mex$', countryCode: 'MX', countryName: 'Mexico' },
  { code: 'BRL', name: 'Brazilian Real', symbol: 'R$', countryCode: 'BR', countryName: 'Brazil' },
  { code: 'ARS', name: 'Argentine Peso', symbol: 'AR$', countryCode: 'AR', countryName: 'Argentina' },
  { code: 'CLP', name: 'Chilean Peso', symbol: 'CLP$', countryCode: 'CL', countryName: 'Chile' },
  { code: 'COP', name: 'Colombian Peso', symbol: 'COL$', countryCode: 'CO', countryName: 'Colombia' },
  { code: 'PEN', name: 'Peruvian Sol', symbol: 'S/', countryCode: 'PE', countryName: 'Peru' },
  { code: 'NZD', name: 'New Zealand Dollar', symbol: 'NZ$', countryCode: 'NZ', countryName: 'New Zealand' },
  { code: 'XAF', name: 'Central African CFA Franc', symbol: 'FCFA', countryCode: 'CM', countryName: 'Central Africa (CFA)' },
];

const BACKEND_RATES_URL = `${API_BASE}/exchange-rates`;

// ─── Context (for sharing rates across app without re-fetching) ─

interface CurrencyContextValue {
  currencies: CurrencyInfo[];
  rates: CurrencyRates | null;
  loading: boolean;
  error: string | null;
  convert: (amount: number, from: string, to: string) => number;
  formatAmount: (amount: number, currency: string) => string;
  getSymbol: (code: string) => string;
  refresh: () => void;
  /** Default currency for the current company (from CompanyProfile). Falls back to 'KES'. */
  companyDefaultCurrency: string;
  /** Update the company default currency in real-time (triggers re-render of all consumers). */
  setCompanyDefaultCurrency: (currency: string) => void;
}

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

function getSymbol(code: string): string {
  const found = FALLBACK_CURRENCIES.find((c) => c.code === code);
  return found?.symbol || code.slice(0, 2);
}

const LOCALE_BY_CURRENCY: Record<string, string> = {
  INR: 'en-IN',
  USD: 'en-US',
  EUR: 'de-DE',
  GBP: 'en-GB',
  JPY: 'ja-JP',
  CNY: 'zh-CN',
  AUD: 'en-AU',
  CAD: 'en-CA',
  CHF: 'de-CH',
  SGD: 'en-SG',
  HKD: 'en-HK',
  AED: 'ar-AE',
  SAR: 'ar-SA',
  MYR: 'ms-MY',
  THB: 'th-TH',
  KRW: 'ko-KR',
  KES: 'en-KE',
  UGX: 'en-UG',
  TZS: 'en-TZ',
  RWF: 'en-RW',
  BIF: 'en-BI',
  ETB: 'am-ET',
  SOS: 'so-SO',
  DJF: 'en-DJ',
  NGN: 'en-NG',
  GHS: 'en-GH',
  GMD: 'en-GM',
  SLL: 'en-SL',
  LRD: 'en-LR',
  ZAR: 'en-ZA',
  NAD: 'en-NA',
  BWP: 'en-BW',
  ZMW: 'en-ZM',
  MWK: 'en-MW',
  MZN: 'pt-MZ',
  ZWL: 'en-ZW',
  SZL: 'en-SZ',
  LSL: 'en-LS',
  AOA: 'pt-AO',
  CDF: 'fr-CD',
  XOF: 'fr-CI',
  XAF: 'fr-CM',
  EGP: 'ar-EG',
  MAD: 'ar-MA',
  TND: 'ar-TN',
  DZD: 'ar-DZ',
  LYD: 'ar-LY',
  SDG: 'ar-SD',
  QAR: 'ar-QA',
  OMR: 'ar-OM',
  KWD: 'ar-KW',
  BHD: 'ar-BH',
  JOD: 'ar-JO',
  IQD: 'ar-IQ',
  ILS: 'he-IL',
  TRY: 'tr-TR',
  IRR: 'fa-IR',
  PKR: 'en-PK',
  BDT: 'bn-BD',
  LKR: 'si-LK',
  NPR: 'ne-NP',
  IDR: 'id-ID',
  PHP: 'en-PH',
  VND: 'vi-VN',
  TWD: 'zh-TW',
  KHR: 'km-KH',
  MMK: 'my-MM',
  MNT: 'mn-MN',
  MVR: 'dv-MV',
  LAK: 'lo-LA',
  MOP: 'zh-MO',
  SEK: 'sv-SE',
  NOK: 'nb-NO',
  DKK: 'da-DK',
  PLN: 'pl-PL',
  CZK: 'cs-CZ',
  HUF: 'hu-HU',
  RON: 'ro-RO',
  BGN: 'bg-BG',
  UAH: 'uk-UA',
  HRK: 'hr-HR',
  RSD: 'sr-RS',
  BRL: 'pt-BR',
  MXN: 'es-MX',
  ARS: 'es-AR',
  CLP: 'es-CL',
  COP: 'es-CO',
  PEN: 'es-PE',
  NZD: 'en-NZ',
};

function formatAmount(amount: any, currency: any): string {
  const safeNum = typeof amount === 'number' && !isNaN(amount) ? amount : (Number(amount) || 0);
  const safeCurr = typeof currency === 'string' && currency ? currency : 'KES';
  try {
    const locale = LOCALE_BY_CURRENCY[safeCurr] || 'en-US';
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: safeCurr,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(safeNum);
  } catch {
    const sym = getSymbol(safeCurr);
    return `${sym}${safeNum.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
  }
}

function convertAmount(amount: number, from: string, to: string, rates: CurrencyRates | null): number {
  if (!rates || from === to) return amount;
  // Convert via base currency (EUR)
  const fromRate = from === rates.base ? 1 : rates.rates[from];
  const toRate = to === rates.base ? 1 : rates.rates[to];
  if (!fromRate || !toRate) return amount;
  return (amount / fromRate) * toRate;
}

// ─── Provider ───────────────────────────────────────────────

interface CurrencyProviderProps {
  children: ReactNode;
}

export function CurrencyProvider({ children }: CurrencyProviderProps) {
  // Start with the comprehensive fallback list which includes KES, AED, etc.
  const [currencies, setCurrencies] = useState<CurrencyInfo[]>(FALLBACK_CURRENCIES);
  const [rates, setRates] = useState<CurrencyRates | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [companyDefaultCurrency, setCompanyDefaultCurrency] = useState<string>(DEFAULT_CURRENCY);

  // Fetch the company default currency from the backend.
  // Works for BOTH admin and vendor users (backend resolves company via req.user or req.vendor).
  // Re-fetches whenever the user logs in or switches accounts.
  const { user, isAuthenticated } = useAuth();
  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    (async () => {
      try {
        const { companySettingsService } = await import('../../services/companySettingsService');
        const currency = await companySettingsService.getDefaultCurrency();
        if (!cancelled && currency) {
          setCompanyDefaultCurrency(currency);
        }
      } catch {
        // Keep default KES if fetch fails
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id, isAuthenticated]);

/** Fetch with timeout using AbortController */
const fetchWithTimeout = (url: string, timeoutMs = 5000): Promise<Response> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));
};

/** Parse Frankfurter-style API response */
const parseFrankfurterRates = (raw: any): { base: string; date: string; rates: Record<string, number> } | null => {
  if (raw?.rates) {
    return {
      base: raw.base || raw.base_code || 'USD',
      date: raw.date || raw.time_last_update_utc || new Date().toISOString(),
      rates: raw.rates,
    };
  }
  return null;
};

const RATE_SOURCES = [
  { url: BACKEND_RATES_URL, name: 'backend' },
  { url: 'https://open.er-api.com/v6/latest/USD', name: 'open.er-api.com' },
  { url: 'https://api.frankfurter.dev/v1/latest?base=USD', name: 'frankfurter.dev' },
];

  const fetchRates = useCallback(async () => {
    setLoading(true);
    setError(null);

    // Try each rate source in order until one succeeds
    let fetched = false;
    for (const source of RATE_SOURCES) {
      try {
        const res = await fetchWithTimeout(source.url);
        if (!res.ok) continue;

        if (source.name === 'backend') {
          const body = await res.json();
          if (body?.data) {
            setRates(body.data);
            fetched = true;
            break;
          }
        } else {
          const raw = await res.json();
          const parsed = parseFrankfurterRates(raw);
          if (parsed) {
            setRates(parsed);
            fetched = true;
            break;
          }
        }
      } catch {
        continue; // Try next source
      }
    }

    if (!fetched) {
      setRates(null);
      setError('Could not fetch live rates. Using defaults.');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchRates();
  }, [fetchRates]);

  const convert = useCallback(
    (amount: number, from: string, to: string) => convertAmount(amount, from, to, rates),
    [rates]
  );

  const ctxValue = useMemo<CurrencyContextValue>(
    () => ({
      currencies,
      rates,
      loading,
      error,
      convert,
      formatAmount: (amount, currency) => formatAmount(amount, currency),
      getSymbol,
      refresh: fetchRates,
      companyDefaultCurrency,
      setCompanyDefaultCurrency,
    }),
    [currencies, rates, loading, error, convert, fetchRates, companyDefaultCurrency]
  );

  return <CurrencyContext.Provider value={ctxValue}>{children}</CurrencyContext.Provider>;
}

// ─── Hook ───────────────────────────────────────────────────

export function useCurrency() {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error('useCurrency must be used within a CurrencyProvider');
  return ctx;
}

// ─── Searchable Currency Selector Component ─────────────────

interface CurrencySelectorProps {
  value: string;
  onChange: (code: string) => void;
  label?: string;
  disabled?: boolean;
  size?: 'sm' | 'md';
  className?: string;
  style?: React.CSSProperties;
  showRefresh?: boolean;
  zIndex?: number;
}

export function CurrencySelector({
  value,
  onChange,
  label,
  disabled = false,
  size = 'md',
  className = '',
  style,
  showRefresh = false,
  zIndex = 999999,
}: CurrencySelectorProps) {
  const { currencies, loading, refresh } = useCurrency();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [dropdownWidth, setDropdownWidth] = useState<number | undefined>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const selected = currencies.find((c) => c.code === value);

  // Focus input when opening
  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  // Filter currencies by search query
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return currencies;
    return currencies.filter(
      (c) =>
        c.code.toLowerCase().includes(q) ||
        c.name.toLowerCase().includes(q) ||
        (c.countryName && c.countryName.toLowerCase().includes(q))
    );
  }, [currencies, search]);

  const handleSelect = (code: string) => {
    onChange(code);
    setOpen(false);
    setSearch('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setOpen(false);
      setSearch('');
    }
    if (e.key === 'Enter' && filtered.length > 0) {
      handleSelect(filtered[0].code);
    }
  };

  return (
    <div className={`cur-selector cur-selector--${size} ${className}`} style={style}>
      {label && <label className="cur-selector__label">{label}</label>}
      <div className="cur-selector__trigger-row">
        {/* Trigger Button */}
        <button
          ref={triggerRef}
          type="button"
          className={`cur-selector__trigger ${open ? 'cur-selector__trigger--open' : ''}`}
          onClick={() => {
            if (!disabled) {
              // Measure the trigger button width so the dropdown matches
              // the trigger width exactly — no min-width forcing 300px.
              if (!open && triggerRef.current) {
                setDropdownWidth(triggerRef.current.offsetWidth);
              }
              setOpen(!open);
              setSearch('');
            }
          }}
          disabled={disabled}
        >
          <Globe size={size === 'sm' ? 13 : 15} className="cur-selector__trigger-icon" />
          {selected && (
            <span className="cur-selector__selected">
              {selected.countryCode && (
                <span className="cur-selector__flag">{getFlagEmoji(selected.countryCode)}</span>
              )}
              <span className="cur-selector__selected-code">
                {selected.symbol} {selected.code}
              </span>
              <span className="cur-selector__selected-name">— {selected.countryName || selected.name}</span>
            </span>
          )}
          <span className="cur-selector__chevron-wrap">
            <ChevronDown size={size === 'sm' ? 12 : 14} className={`cur-selector__chevron ${open ? 'cur-selector__chevron--up' : ''}`} />
          </span>
        </button>
        {showRefresh && (
          <button
            type="button"
            className={`cur-selector__refresh ${loading ? 'cur-selector__refresh--spinning' : ''}`}
            onClick={refresh}
            title="Refresh exchange rates"
            disabled={loading}
          >
            <RefreshCw size={size === 'sm' ? 11 : 13} />
          </button>
        )}
      </div>

      {/* FloatingMenu renders the dropdown via portal to document.body.
          The dropdown is positioned manually using getBoundingClientRect
          for reliable positioning without any flash. */}
      <FloatingMenu
        open={open}
        onClose={() => { setOpen(false); setSearch(''); }}
        anchorRef={triggerRef}
        className="cur-selector__dropdown"
        width={dropdownWidth}
        minWidth={260}
        offset={4}
        placement="bottom-start"
        preventFlip={true}
        animation="slide"
        zIndex={zIndex}
      >
        <div className="cur-selector__search">
          <Search size={14} className="cur-selector__search-icon" />
          <input
            ref={inputRef}
            type="text"
            className="cur-selector__search-input"
            placeholder="Search currency or country..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>
        {loading && (
          <div className="cur-selector__loading-hint">
            <RefreshCw size={12} className="cur-selector__loading-spin" />
            Loading rates...
          </div>
        )}
        <div className="cur-selector__options">
          {filtered.length === 0 ? (
            <div className="cur-selector__no-results">No currencies found</div>
          ) : (
            filtered.map((c) => {
              const isSelected = c.code === value;
              return (
                <button
                  key={c.code}
                  type="button"
                  className={`cur-selector__option ${isSelected ? 'cur-selector__option--selected' : ''}`}
                  onClick={() => handleSelect(c.code)}
                >
                  <span className="cur-selector__option-flag">
                    {c.countryCode ? getFlagEmoji(c.countryCode) : <Globe size={14} />}
                  </span>
                  <span className="cur-selector__option-info">
                    <span className="cur-selector__option-code">{c.code}</span>
                    <span className="cur-selector__option-symbol">{c.symbol}</span>
                    <span className="cur-selector__option-name">{c.countryName || c.name}</span>
                  </span>
                  {isSelected && <Check size={14} className="cur-selector__option-check" />}
                </button>
              );
            })
          )}
        </div>
      </FloatingMenu>
    </div>
  );
}

// ─── Converted Amount Display ───────────────────────────────

interface ConvertedAmountProps {
  amount: number;
  from: string;
  to: string;
  showDirection?: boolean;
  className?: string;
}

export function ConvertedAmount({
  amount,
  from,
  to,
  showDirection = true,
  className = '',
}: ConvertedAmountProps) {
  const { convert, formatAmount, loading } = useCurrency();
  const converted = convert(amount, from, to);

  if (from === to) return null;

  return (
    <span className={`cur-converted ${className}`}>
      {showDirection && (
        <span className="cur-converted__arrow">
          <Banknote size={11} />
        </span>
      )}
      {loading ? (
        <span className="cur-converted__loading">...</span>
      ) : (
        <span className="cur-converted__value" title={`${formatAmount(amount, from)} → ${formatAmount(converted, to)}`}>
          ~{formatAmount(converted, to)}
        </span>
      )}
    </span>
  );
}

// ─── Amount Input with Currency ─────────────────────────────

interface CurrencyAmountInputProps {
  amount: number | '';
  currency: string;
  onAmountChange: (val: number | '') => void;
  onCurrencyChange: (code: string) => void;
  placeholder?: string;
  min?: number;
  disabled?: boolean;
}

export function CurrencyAmountInput({
  amount,
  currency,
  onAmountChange,
  onCurrencyChange,
  placeholder = 'Amount',
  min = 0,
  disabled = false,
}: CurrencyAmountInputProps) {
  const { currencies } = useCurrency();
  const selected = currencies.find((c) => c.code === currency);
  const sym = selected?.symbol || getSymbol(currency);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return currencies;
    return currencies.filter(
      (c) =>
        c.code.toLowerCase().includes(q) ||
        c.name.toLowerCase().includes(q) ||
        (c.countryName && c.countryName.toLowerCase().includes(q))
    );
  }, [currencies, search]);

  const handleSelect = (code: string) => {
    onCurrencyChange(code);
    setOpen(false);
    setSearch('');
  };

  return (
    <div className="cur-amount-input">
      <div ref={triggerRef} className="cur-amount-input__currency" onClick={() => !disabled && setOpen(!open)}>
        {selected?.countryCode ? (
          <span style={{ fontSize: 17, lineHeight: 1 }}>{getFlagEmoji(selected.countryCode)}</span>
        ) : (
          <Globe size={13} />
        )}
        <span className="cur-amount-input__cur-text">{currency}</span>
        <ChevronDown size={12} className={`cur-amount-input__chevron ${open ? 'cur-amount-input__chevron--up' : ''}`} />
      </div>
      <div className="cur-amount-input__amount">
        <span className="cur-amount-input__symbol">{sym}</span>
        <input
          type="number"
          min={min}
          placeholder={placeholder}
          value={amount}
          onChange={(e) => onAmountChange(e.target.value === '' ? '' : Math.max(min, Number(e.target.value)))}
          disabled={disabled}
        />
      </div>
      {/* Dropdown for currency picker — using FloatingMenu */}
      <FloatingMenu
        open={open}
        onClose={() => { setOpen(false); setSearch(''); }}
        anchorRef={triggerRef}
        className="cur-amount-input__dropdown"
        width={260}
        offset={4}
        placement="bottom-start"
        preventFlip={true}
        animation="slide"
      >
        <div className="cur-selector__search">
          <Search size={14} className="cur-selector__search-icon" />
          <input
            ref={inputRef}
            type="text"
            className="cur-selector__search-input"
            placeholder="Search currency..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') { setOpen(false); setSearch(''); }
              if (e.key === 'Enter' && filtered.length > 0) { handleSelect(filtered[0].code); }
            }}
          />
        </div>
        <div className="cur-selector__options">
          {filtered.length === 0 ? (
            <div className="cur-selector__no-results">No currencies found</div>
          ) : (
            filtered.map((c) => {
              const isSelected = c.code === currency;
              return (
                <button
                  key={c.code}
                  type="button"
                  className={`cur-selector__option ${isSelected ? 'cur-selector__option--selected' : ''}`}
                  onClick={() => handleSelect(c.code)}
                >
                  <span className="cur-selector__option-flag">
                    {c.countryCode ? getFlagEmoji(c.countryCode) : <Globe size={14} />}
                  </span>
                  <span className="cur-selector__option-info cur-selector__option-info--compact">
                    <span className="cur-selector__option-code">{c.code}</span>
                    <span className="cur-selector__option-name">{c.name}</span>
                  </span>
                  {isSelected && <Check size={14} className="cur-selector__option-check" />}
                </button>
              );
            })
          )}
        </div>
      </FloatingMenu>
    </div>
  );
}

// ─── Format Utils (export for direct use) ───────────────────

export { formatAmount as formatCurrency, getSymbol as getCurrencySymbol, convertAmount as convertCurrency, DEFAULT_CURRENCY };

// ─── Currency Badge ─────────────────────────────────────────

interface CurrencyBadgeProps {
  currency: string;
  className?: string;
  size?: 'sm' | 'md';
  style?: React.CSSProperties;
}

export function CurrencyBadge({ currency, className = '', size = 'sm', style }: CurrencyBadgeProps) {
  const { currencies } = useCurrency();
  const info = currencies.find((c) => c.code === currency);
  const flag = info?.countryCode ? getFlagEmoji(info.countryCode) : '';
  return (
    <span className={`cur-badge cur-badge--${size} ${className}`} title={info?.name || currency} style={style}>
      {flag ? <span className="cur-badge__flag">{flag}</span> : <Banknote size={size === 'sm' ? 11 : 13} />}
      {info?.symbol || getSymbol(currency)} {currency}
    </span>
  );
}
