import { DEFAULT_COMPANY_STATE, DEFAULT_GST_RATE, GST_TYPES } from '../constants.js';
import { GST_UTGST_STATES, INDIAN_STATE_CODES } from '../data/states.js';
import { round2, toNumber } from './helpers.js';

const OUTSIDE_INDIA = 'Outside India';

function normalizeText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase();
}

export function isIndiaCountry(country = 'India') {
  const value = normalizeKey(country || 'India');
  return value === 'india' || value === 'in';
}

export function getGstStateCode(state = '', gstin = '') {
  const gstinCode = String(gstin || '').trim().slice(0, 2);
  if (/^\d{2}$/.test(gstinCode)) return gstinCode;

  const stateKey = normalizeKey(state);
  const matchedState = Object.keys(INDIAN_STATE_CODES).find((item) => normalizeKey(item) === stateKey);
  return matchedState ? INDIAN_STATE_CODES[matchedState] : '';
}

export function isUtgstState(state = '') {
  const stateKey = normalizeKey(state);
  return GST_UTGST_STATES.some((item) => normalizeKey(item) === stateKey);
}

export function getPlaceOfSupplyForClient(client = {}, settings = {}) {
  if (!isIndiaCountry(client?.country || 'India') || client?.gstRegistrationType === 'Overseas') {
    return OUTSIDE_INDIA;
  }

  return client?.placeOfSupply
    || client?.state
    || settings?.company?.state
    || DEFAULT_COMPANY_STATE;
}

export function getDefaultInvoiceTypeForClient(client = {}, settings = {}) {
  const useLut = Boolean(settings?.gst?.lutEnabled);
  if (!isIndiaCountry(client?.country || 'India') || client?.gstRegistrationType === 'Overseas') {
    return useLut ? 'Export without payment of IGST under LUT' : 'Export with payment of IGST';
  }
  if (client?.gstRegistrationType === 'SEZ') {
    return useLut ? 'SEZ without payment of IGST under LUT' : 'SEZ with payment of IGST';
  }
  return 'Regular';
}

export function resolveGstContext({
  companyState = DEFAULT_COMPANY_STATE,
  companyCountry = 'India',
  companyGstin = '',
  clientState = DEFAULT_COMPANY_STATE,
  clientCountry = 'India',
  clientGstin = '',
  placeOfSupply = '',
  invoiceType = 'Regular',
  gstRegistered = true,
  lutEnabled = true
} = {}) {
  const type = normalizeKey(invoiceType || 'Regular');
  const supplierState = normalizeText(companyState || DEFAULT_COMPANY_STATE);
  const destinationState = normalizeText(placeOfSupply || clientState || DEFAULT_COMPANY_STATE);
  const isSupplierInIndia = isIndiaCountry(companyCountry);
  const isRecipientInIndia = isIndiaCountry(clientCountry);
  const withoutPayment = type.includes('without payment') || type.includes('lut');
  const withPayment = type.includes('with payment') && !withoutPayment;
  const exportOrSez = !isRecipientInIndia || type.includes('export') || type.includes('sez');
  const resolvedPlaceOfSupply = isRecipientInIndia ? destinationState : OUTSIDE_INDIA;

  const base = {
    placeOfSupply: resolvedPlaceOfSupply,
    companyState: supplierState,
    companyStateCode: getGstStateCode(supplierState, companyGstin),
    placeOfSupplyStateCode: isRecipientInIndia ? getGstStateCode(destinationState, clientGstin) : '96',
    supplyType: 'Non-GST',
    gstType: GST_TYPES.NONE,
    reason: ''
  };

  if (!gstRegistered) {
    return { ...base, reason: 'Company is not marked as GST registered.' };
  }

  if (!isSupplierInIndia) {
    return { ...base, reason: 'Supplier country is outside India.' };
  }

  if (exportOrSez) {
    if (withoutPayment || (!withPayment && lutEnabled)) {
      return {
        ...base,
        supplyType: type.includes('sez') ? 'SEZ without payment under LUT' : 'Export without payment under LUT',
        reason: 'Zero-rated supply without payment of IGST.'
      };
    }

    return {
      ...base,
      gstType: GST_TYPES.IGST,
      supplyType: type.includes('sez') ? 'SEZ with payment of IGST' : 'Export with payment of IGST',
      reason: 'Zero-rated supply with payment of IGST.'
    };
  }

  if (normalizeKey(supplierState) === normalizeKey(destinationState)) {
    const gstType = isUtgstState(destinationState) ? GST_TYPES.CGST_UTGST : GST_TYPES.CGST_SGST;
    return {
      ...base,
      gstType,
      supplyType: gstType === GST_TYPES.CGST_UTGST ? 'Intra-state UT supply' : 'Intra-state supply',
      reason: 'Supplier state and place of supply are same.'
    };
  }

  return {
    ...base,
    gstType: GST_TYPES.IGST,
    supplyType: 'Inter-state supply',
    reason: 'Supplier state and place of supply are different.'
  };
}

export function getGstType(
  companyState = DEFAULT_COMPANY_STATE,
  clientState = DEFAULT_COMPANY_STATE,
  clientCountry = 'India',
  invoiceType = 'Regular',
  gstRegistered = true,
  companyCountry = 'India'
) {
  return resolveGstContext({
    companyState,
    clientState,
    clientCountry,
    invoiceType,
    gstRegistered,
    companyCountry
  }).gstType;
}

export function calculateExclusiveTax(taxableAmount, gstRate = DEFAULT_GST_RATE) {
  const taxable = round2(taxableAmount);
  const gstAmount = round2(taxable * toNumber(gstRate) / 100);
  return {
    taxableAmount: taxable,
    gstAmount,
    totalAmount: round2(taxable + gstAmount)
  };
}

export function calculateInclusiveTax(totalAmount, gstRate = DEFAULT_GST_RATE) {
  const total = round2(totalAmount);
  const rate = toNumber(gstRate);
  if (rate <= 0) {
    return { taxableAmount: total, gstAmount: 0, totalAmount: total };
  }
  const taxableAmount = round2(total / (1 + rate / 100));
  const gstAmount = round2(total - taxableAmount);
  return { taxableAmount, gstAmount, totalAmount: total };
}

export function splitCgstSgst(gstAmount) {
  const half = round2(toNumber(gstAmount) / 2);
  return {
    cgst: half,
    sgst: round2(toNumber(gstAmount) - half)
  };
}

export function calculateGstBreakdown({
    taxableAmount,
    gstRate = DEFAULT_GST_RATE,
    companyState = DEFAULT_COMPANY_STATE,
    companyCountry = 'India',
    companyGstin = '',
    clientState = DEFAULT_COMPANY_STATE,
    clientCountry = 'India',
    clientGstin = '',
    placeOfSupply = '',
    invoiceType = 'Regular',
    gstRegistered = true,
    lutEnabled = true
}) {
  const context = resolveGstContext({
    companyState,
    companyCountry,
    companyGstin,
    clientState,
    clientCountry,
    clientGstin,
    placeOfSupply,
    invoiceType,
    gstRegistered,
    lutEnabled
  });
  const { gstType } = context;

  if (gstType === GST_TYPES.NONE || toNumber(gstRate) <= 0) {
    return {
      ...context,
      gstType,
      taxableAmount: round2(taxableAmount),
      gstRate: toNumber(gstRate),
      cgst: 0,
      sgst: 0,
      utgst: 0,
      igst: 0,
      gstAmount: 0,
      totalAmount: round2(taxableAmount)
    };
  }

  const gstAmount = round2(toNumber(taxableAmount) * toNumber(gstRate) / 100);
  const split = [GST_TYPES.CGST_SGST, GST_TYPES.CGST_UTGST].includes(gstType)
    ? splitCgstSgst(gstAmount)
    : { cgst: 0, sgst: 0 };

  return {
    ...context,
    gstType,
    taxableAmount: round2(taxableAmount),
    gstRate: toNumber(gstRate),
    cgst: split.cgst,
    sgst: gstType === GST_TYPES.CGST_SGST ? split.sgst : 0,
    utgst: gstType === GST_TYPES.CGST_UTGST ? split.sgst : 0,
    igst: gstType === GST_TYPES.IGST ? gstAmount : 0,
    gstAmount,
    totalAmount: round2(toNumber(taxableAmount) + gstAmount)
  };
}
