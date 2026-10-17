const xlsx = require('xlsx');
const { randomUUID } = require('crypto');
const { Member, MemberDemandDefault, RecoveryImportBatch, RecoveryImportRow } = require('../models/banking.models');
const { toPaise, toRupees } = require('../utils/money');

// ---------------------------------------------------------------------------
// Legacy Template Detection
// ---------------------------------------------------------------------------

/**
 * Normalise a raw column header for matching:
 *   - trim outer whitespace, lowercase, strip trailing periods, collapse whitespace
 * Examples: "S.No." → "s no"  |  "PF No." → "pf no"  |  "Total Amt." → "total amt"
 */
function normalizeHeader(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\.+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isPfNoHeader(norm) {
  return (
    norm === 'pf no' || norm === 'pfno' || norm === 'pf number' ||
    norm === 'pf_no' || norm === 'pfnumber' || norm.startsWith('pf no') || norm === 'pf'
  );
}

function isTotalAmtHeader(norm) {
  return (
    norm === 'total amt' || norm === 'totalamt' || norm === 'total amount' ||
    norm === 'total' || norm === 'amt' || norm === 'amount' ||
    norm === 'recovery amt' || norm === 'recovery amount' || norm === 'total recovery' ||
    norm.includes('total amt') || norm.includes('total amount')
  );
}

function isBranchHeader(norm) {
  return norm === 'branch' || norm === 'branch name';
}

function isEmpNameHeader(norm) {
  return (
    norm === 'emp name' || norm === 'employee name' || norm === 'empname' || norm === 'name'
  );
}

function isGradeHeader(norm) {
  return norm === 'grade' || norm === 'grade code' || norm === 'designation';
}

/**
 * Detect legacy "Divide Demand" Excel template from a list of header strings.
 * Returns { isLegacy, colMap } where colMap values are raw header strings.
 */
function detectLegacyTemplate(headers) {
  let pfNoHeader = null;
  let amountHeader = null;
  let branchHeader = null;
  let empNameHeader = null;
  let gradeHeader = null;

  for (const h of headers) {
    const norm = normalizeHeader(h);
    if (!pfNoHeader && isPfNoHeader(norm)) pfNoHeader = h;
    if (!amountHeader && isTotalAmtHeader(norm)) amountHeader = h;
    if (!branchHeader && isBranchHeader(norm)) branchHeader = h;
    if (!empNameHeader && isEmpNameHeader(norm)) empNameHeader = h;
    if (!gradeHeader && isGradeHeader(norm)) gradeHeader = h;
  }

  if (pfNoHeader && amountHeader) {
    return {
      isLegacy: true,
      colMap: {
        pfNo: pfNoHeader,
        amount: amountHeader,
        branch: branchHeader || null,
        empName: empNameHeader || null,
        grade: gradeHeader || null
      }
    };
  }

  return { isLegacy: false, colMap: null };
}

// The sheet as rows (row i = sheet row i, blanks kept), plus the sheet.
function readSheet(buffer) {
  const workbook = xlsx.read(buffer, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet || !sheet['!ref']) return { sheet, rows: [], firstRow: 0, firstCol: 0 };
  const range = xlsx.utils.decode_range(sheet['!ref']);
  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: null, blankrows: true, raw: true });
  return { sheet, rows, firstRow: range.s.r, firstCol: range.s.c };
}

const HEADER_SCAN_ROWS = 25;

function isNumericCell(value) {
  if (value == null || value === '') return false;
  return Number.isFinite(Number(String(value).replace(/,/g, '')));
}

// The bank's workbook has a title (and a salary-register line) above the
// headings, so the heading row is looked for in the first rows: the first
// row that has a PF column and an amount column. When the amount column has
// a name we don't know (the bank's "COECOS RD"), it is the last heading
// whose values below are numbers.
function findHeaderRow(rows = []) {
  for (let i = 0; i < Math.min(HEADER_SCAN_ROWS, rows.length); i += 1) {
    const headers = (rows[i] || []).map((h) => String(h == null ? '' : h));
    const detection = detectLegacyTemplate(headers);
    if (detection.isLegacy) return { index: i, headers, detection };
    if (!headers.some((h) => isPfNoHeader(normalizeHeader(h)))) continue;
    const below = rows.slice(i + 1, i + 12).filter((row) => row && row.some((cell) => cell != null && cell !== ''));
    for (let c = headers.length - 1; c >= 0; c -= 1) {
      if (!headers[c].trim() || isPfNoHeader(normalizeHeader(headers[c]))) continue;
      const values = below.map((row) => row[c]).filter((v) => v != null && v !== '');
      if (values.length && values.filter(isNumericCell).length >= Math.ceil(values.length * 0.8)) {
        const withAmount = [...headers];
        const fallback = detectLegacyTemplate(withAmount.map((h, k) => (k === c ? 'Total Amt' : h)));
        if (fallback.isLegacy) {
          fallback.colMap.amount = headers[c];
          return { index: i, headers, detection: fallback };
        }
      }
    }
  }
  const headers = ((rows[0] || [])).map((h) => String(h == null ? '' : h));
  return { index: 0, headers, detection: detectLegacyTemplate(headers) };
}

/**
 * Analyse the uploaded file and return the heading row, its headers and the
 * auto-detected column mapping. Used by the frontend /analyze step.
 */
function analyzeFileHeaders(buffer) {
  const { rows } = readSheet(buffer);
  const { index, headers, detection } = findHeaderRow(rows);
  return { headers, headerRow: index + 1, ...detection };
}

// ---------------------------------------------------------------------------
// File Parsing
// ---------------------------------------------------------------------------

// A row of column numbers under the headings ("1 2 3 4 5 6").
function isColumnNumberRow(row = []) {
  const cells = row.map((cell, index) => ({ cell, index })).filter(({ cell }) => cell != null && cell !== '');
  if (cells.length < 3) return false;
  return cells.every(({ cell }, k) => isNumericCell(cell) && Number(cell) === Number(cells[0].cell) + k)
    && Number(cells[0].cell) === 1;
}

// The PF as written in the sheet: a text cell as is, a number as Excel shows
// it — leading zeros kept, never re-formatted.
function cellText(sheet, r, c, fallback) {
  const cell = sheet ? sheet[xlsx.utils.encode_cell({ r, c })] : null;
  if (!cell) return fallback == null ? '' : String(fallback).trim();
  if (cell.t === 's') return String(cell.v).trim();
  return String(cell.w != null ? cell.w : cell.v).trim();
}

/**
 * Parse the Excel file from its heading row on. colMap is name-based
 * ({ pfNo: 'PF', amount: 'COECOS RD', ... }) or index-based ({ pfNo: 2,
 * amount: 5 }); both refer to the heading row found by findHeaderRow.
 * Only member rows are returned: blank rows, the column-number row and
 * total/footer lines (no PF) are skipped. The footer total, when present,
 * is returned as rows.footerTotal to check the member rows against.
 */
function parseImportFile(buffer, colMap) {
  const { sheet, rows, firstRow, firstCol } = readSheet(buffer);

  // Formulas are read by the value Excel saved with them. One without a saved
  // value (file written by a tool that does not calculate) cannot be read.
  for (const key in sheet || {}) {
    if (key[0] === '!') continue;
    if (sheet[key].f && sheet[key].v === undefined) {
      throw new Error(`Cell ${key} has a formula with no saved value. Open the file in Excel, save it, and import again (or paste values only).`);
    }
  }

  const { index: headerIndex, headers } = findHeaderRow(rows);
  const columnOf = (key) => {
    if (key == null || key === '') return null;
    if (typeof key === 'number' || (typeof key === 'string' && key.trim() !== '' && !Number.isNaN(Number(key)))) return Number(key);
    const at = headers.indexOf(key);
    return at >= 0 ? at : null;
  };
  const pfCol = columnOf(colMap.pfNo);
  const amountCol = columnOf(colMap.amount);
  if (pfCol == null || amountCol == null) throw new Error('The PF and amount columns were not found in the heading row.');
  const branchCol = columnOf(colMap.branch);
  const nameCol = columnOf(colMap.empName);
  const gradeCol = columnOf(colMap.grade);
  const textAt = (row, col) => (col != null && row[col] != null && String(row[col]).trim() !== '' ? String(row[col]).trim() : null);

  const parsedRows = [];
  let footerTotal = null;
  for (let i = headerIndex + 1; i < rows.length; i += 1) {
    const row = rows[i] || [];
    if (!row.some((cell) => cell != null && String(cell).trim() !== '')) continue;
    if (isColumnNumberRow(row)) continue;
    const pfNo = cellText(sheet, firstRow + i, firstCol + pfCol, row[pfCol]);
    const rawAmount = row[amountCol];
    const amount = isNumericCell(rawAmount) ? Number(String(rawAmount).replace(/,/g, '')) : null;
    if (!pfNo) {
      // A total / footer line: kept to check the member rows against.
      if (amount != null) footerTotal = amount;
      continue;
    }
    const rawPayload = Object.fromEntries(headers.map((h, k) => [h || `Column ${k + 1}`, row[k] ?? null]));
    parsedRows.push({
      sourceRowNo: firstRow + i + 1,
      pfNo,
      importedTotalAmount: amount == null ? 0 : amount,
      sourceBranch: textAt(row, branchCol),
      sourceEmployeeName: textAt(row, nameCol),
      sourceGrade: textAt(row, gradeCol),
      rawPayload
    });
  }
  parsedRows.footerTotal = footerTotal;
  parsedRows.headerRow = headerIndex + 1;
  return parsedRows;
}

// A member's PF No. is the master's pfNo, or — for members migrated from
// legacy, whose pfNo column was never filled — legacy MstAccountMaster.PFNo
// kept in payload.raw. Matching stays exact (trimmed string, leading zeros
// kept); only members whose effective PF is one of `pfNos` are returned.
function memberPfNo(member = {}) {
  const raw = member?.payload?.raw || {};
  const pf = member.pfNo != null && String(member.pfNo).trim() !== '' ? member.pfNo : raw.PFNo;
  return pf == null ? '' : String(pf).trim();
}

async function findMembersByPf(pfNos = []) {
  const wanted = new Set(pfNos.map((pf) => String(pf).trim()).filter(Boolean));
  const membersByPf = {};
  if (!wanted.size) return { members: [], membersByPf };
  const members = (await Member.find({})).filter((m) => wanted.has(memberPfNo(m)));
  for (const m of members) {
    const pf = memberPfNo(m);
    if (!membersByPf[pf]) membersByPf[pf] = [];
    membersByPf[pf].push(m);
  }
  return { members, membersByPf };
}

function calculateAllocation(importedTotalAmount, demand) {
  // Convert everything to paise for safe integer math
  const importedTotal = toPaise(importedTotalAmount);
  let remaining = importedTotal;

  const demandShare = toPaise(demand.share);
  const demandSpecialDeposit = toPaise(demand.specialDeposit);
  const demandCompulsoryDeposit = toPaise(demand.compulsoryDeposit);
  const demandRegularLoan = toPaise(demand.regularLoan);
  const demandLoanAgainstDeposit = toPaise(demand.loanAgainstDeposit);

  const allocatedShare = Math.min(remaining, demandShare);
  remaining -= allocatedShare;

  const allocatedSpecialDeposit = Math.min(remaining, demandSpecialDeposit);
  remaining -= allocatedSpecialDeposit;

  const allocatedCompulsoryDeposit = Math.min(remaining, demandCompulsoryDeposit);
  remaining -= allocatedCompulsoryDeposit;

  const allocatedRegularLoan = Math.min(remaining, demandRegularLoan);
  remaining -= allocatedRegularLoan;

  const allocatedLoanAgainstDeposit = Math.min(remaining, demandLoanAgainstDeposit);
  remaining -= allocatedLoanAgainstDeposit;

  const allocatedTotal = allocatedShare + allocatedSpecialDeposit + allocatedCompulsoryDeposit + allocatedRegularLoan + allocatedLoanAgainstDeposit;
  
  const configuredDemandTotal = demandShare + demandSpecialDeposit + demandCompulsoryDeposit + demandRegularLoan + demandLoanAgainstDeposit;

  let status = 'VALID';
  let errorMessage = null;

  if (configuredDemandTotal > importedTotal) {
    status = 'SHORT';
    errorMessage = 'Demand Total > Imported Total';
  } else if (configuredDemandTotal < importedTotal) {
    status = 'EXTRA';
    errorMessage = 'Demand Total < Imported Total';
  } else if (allocatedTotal !== importedTotal) {
    status = 'EXTRA';
    errorMessage = 'Allocated Total !== Imported Total';
  } else if (remaining !== 0) {
    status = 'EXTRA';
    errorMessage = 'Remaining !== 0';
  }

  // Convert back to Rupees for DB persistence
  return {
    configuredShare: toRupees(demandShare),
    configuredSpecialDeposit: toRupees(demandSpecialDeposit),
    configuredCompulsoryDeposit: toRupees(demandCompulsoryDeposit),
    configuredRegularLoan: toRupees(demandRegularLoan),
    configuredLoanAgainstDeposit: toRupees(demandLoanAgainstDeposit),
    configuredDemandTotal: toRupees(configuredDemandTotal),
    
    allocatedShare: toRupees(allocatedShare),
    allocatedSpecialDeposit: toRupees(allocatedSpecialDeposit),
    allocatedCompulsoryDeposit: toRupees(allocatedCompulsoryDeposit),
    allocatedRegularLoan: toRupees(allocatedRegularLoan),
    allocatedLoanAgainstDeposit: toRupees(allocatedLoanAgainstDeposit),
    allocatedTotal: toRupees(allocatedTotal),
    
    differenceAmount: toRupees(importedTotal - configuredDemandTotal),
    status,
    errorMessage
  };
}

/**
 * Normalise a string for soft-match comparison (name/branch differences).
 * Strips punctuation, collapses whitespace, lowercases.
 */
function softNormalize(str) {
  if (!str) return '';
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function validateAndBuildRow(batchId, parsedRow, membersByPf, demandsByMemberCode, pfCounts) {
  const pfNo = parsedRow.pfNo;
  let status = 'VALID';
  let errorMessage = null;
  let memberId = null;
  let allocation = null;
  const warningParts = [];
  
  if (!pfNo) {
    status = 'INVALID ROW';
    errorMessage = 'Missing PF No.';
  } else if (pfCounts[pfNo] > 1) {
    status = 'DUPLICATE IMPORT ROW';
    errorMessage = `PF No. ${pfNo} appears multiple times in file.`;
  } else {
    const matchedMembers = membersByPf[pfNo] || [];
    if (matchedMembers.length === 0) {
      status = 'MEMBER NOT FOUND';
      errorMessage = `No member found with PF No: ${pfNo}`;
    } else if (matchedMembers.length > 1) {
      status = 'DUPLICATE PF';
      errorMessage = `Multiple members found with PF No: ${pfNo}`;
    } else {
      const member = matchedMembers[0];
      memberId = member.id;
      
      // --- Soft match warnings (do not fail the row) ---
      if (parsedRow.sourceEmployeeName) {
        const excelName = softNormalize(parsedRow.sourceEmployeeName);
        const memberName = softNormalize(member.name || '');
        if (excelName && memberName && excelName !== memberName) {
          warningParts.push(`SOURCE NAME DIFFERENCE: Excel "${parsedRow.sourceEmployeeName}" vs Member "${member.name}"`);
        }
      }

      if (parsedRow.sourceBranch) {
        const excelBranch = softNormalize(parsedRow.sourceBranch);
        const memberBranch = softNormalize(member.branchCode || member.branch || '');
        if (excelBranch && memberBranch && excelBranch !== memberBranch) {
          warningParts.push(`SOURCE BRANCH DIFFERENCE: Excel "${parsedRow.sourceBranch}" vs Member branch "${member.branchCode}"`);
        }
      }

      const demand = demandsByMemberCode[member.code] || {};
      const demandObj = {
        share: Number(demand.share || 0),
        specialDeposit: Number(demand.specialDeposit || 0),
        compulsoryDeposit: Number(demand.compulsoryDeposit || 0),
        regularLoan: Number(demand.regularLoan || 0),
        loanAgainstDeposit: Number(demand.loanAgainstDeposit || 0)
      };

      if (!parsedRow.importedTotalAmount || parsedRow.importedTotalAmount < 0) {
        status = 'INVALID AMOUNT';
        errorMessage = 'Imported amount is invalid or negative.';
      } else {
        allocation = calculateAllocation(parsedRow.importedTotalAmount, demandObj);
        status = allocation.status;
        errorMessage = allocation.errorMessage;
      }
    }
  }

  const rowRecord = {
    batchId,
    sourceRowNo: parsedRow.sourceRowNo,
    pfNo,
    memberId,
    sourceBranch: parsedRow.sourceBranch || null,
    sourceEmployeeName: parsedRow.sourceEmployeeName || null,
    sourceGrade: parsedRow.sourceGrade || null,
    importedTotalAmount: parsedRow.importedTotalAmount || 0,
    
    configuredShare: allocation ? allocation.configuredShare : 0,
    configuredSpecialDeposit: allocation ? allocation.configuredSpecialDeposit : 0,
    configuredCompulsoryDeposit: allocation ? allocation.configuredCompulsoryDeposit : 0,
    configuredRegularLoan: allocation ? allocation.configuredRegularLoan : 0,
    configuredLoanAgainstDeposit: allocation ? allocation.configuredLoanAgainstDeposit : 0,
    configuredDemandTotal: allocation ? allocation.configuredDemandTotal : 0,

    allocatedShare: allocation ? allocation.allocatedShare : 0,
    allocatedSpecialDeposit: allocation ? allocation.allocatedSpecialDeposit : 0,
    allocatedCompulsoryDeposit: allocation ? allocation.allocatedCompulsoryDeposit : 0,
    allocatedRegularLoan: allocation ? allocation.allocatedRegularLoan : 0,
    allocatedLoanAgainstDeposit: allocation ? allocation.allocatedLoanAgainstDeposit : 0,
    allocatedTotal: allocation ? allocation.allocatedTotal : 0,

    differenceAmount: allocation ? allocation.differenceAmount : 0,
    status,
    errorMessage,
    warnings: warningParts.length > 0 ? warningParts.join('\n') : null,
    payload: parsedRow.rawPayload
  };

  return rowRecord;
}

function summarizeBatch(rows) {
  let totalRows = rows.length;
  let validRows = 0;
  let shortRows = 0;
  let extraRows = 0;
  let errorRows = 0;
  
  let totalImportedAmountPaise = 0;
  let totalDemandAmountPaise = 0;
  let totalAllocatedAmountPaise = 0;

  for (const row of rows) {
    totalImportedAmountPaise += toPaise(row.importedTotalAmount);
    totalDemandAmountPaise += toPaise(row.configuredDemandTotal);
    totalAllocatedAmountPaise += toPaise(row.allocatedTotal);

    if (row.status === 'VALID') validRows++;
    else if (row.status === 'SHORT') shortRows++;
    else if (row.status === 'EXTRA') extraRows++;
    else errorRows++;
  }

  let status = 'INVALID';
  if (totalRows > 0 && validRows === totalRows) {
    status = 'READY';
  } else if (totalRows === 0) {
    status = 'ERROR';
  }

  return {
    status,
    totalRows,
    validRows,
    shortRows,
    extraRows,
    errorRows,
    totalImportedAmount: toRupees(totalImportedAmountPaise),
    totalDemandAmount: toRupees(totalDemandAmountPaise),
    totalAllocatedAmount: toRupees(totalAllocatedAmountPaise)
  };
}

async function uploadAndParseBatch(fileName, buffer, colMap, uploadedBy) {
  const parsedRows = parseImportFile(buffer, colMap);
  if (!parsedRows.length) {
    throw new Error('No valid rows found in file');
  }

  const pfNos = [...new Set(parsedRows.map(r => r.pfNo).filter(Boolean))];
  const { members, membersByPf } = await findMembersByPf(pfNos);

  const pfCounts = {};
  for (const row of parsedRows) {
    if (row.pfNo) {
      pfCounts[row.pfNo] = (pfCounts[row.pfNo] || 0) + 1;
    }
  }

  const memberCodes = members.map(m => m.code).filter(Boolean);
  const demands = memberCodes.length > 0 ? await MemberDemandDefault.find({ memberCode: { $in: memberCodes } }) : [];
  const demandsByMemberCode = {};
  for (const d of demands) {
    demandsByMemberCode[d.memberCode] = d;
  }

  const batchId = randomUUID();
  const builtRows = [];
  
  for (const pr of parsedRows) {
    const built = await validateAndBuildRow(batchId, pr, membersByPf, demandsByMemberCode, pfCounts);
    built.id = randomUUID();
    builtRows.push(built);
  }

  const summary = summarizeBatch(builtRows);
  // The workbook's own total line, when it has one, checked against the sum
  // of the member rows (paise).
  const parsedTotalPaise = parsedRows.reduce((sum, row) => sum + toPaise(row.importedTotalAmount), 0);
  const footerTotal = parsedRows.footerTotal;
  const footerMatches = footerTotal == null ? null : toPaise(footerTotal) === parsedTotalPaise;

  const batchRecord = {
    id: batchId,
    fileName,
    uploadedBy,
    uploadedAt: new Date(),
    ...summary,
    payload: { colMap, headerRow: parsedRows.headerRow, parsedTotal: toRupees(parsedTotalPaise), footerTotal: footerTotal ?? null, footerMatches }
  };

  await RecoveryImportBatch.create(batchRecord);
  
  if (builtRows.length > 0) {
    for (const row of builtRows) {
      await RecoveryImportRow.create(row);
    }
  }

  return batchRecord;
}

async function revalidateBatch(batchId) {
  const batch = await RecoveryImportBatch.findById(batchId);
  if (!batch) throw new Error('Batch not found');
  if (batch.status === 'POSTED' || batch.status === 'ACCEPTED') {
    throw new Error(`Cannot revalidate batch in ${batch.status} state`);
  }

  const rows = await RecoveryImportRow.find({ batchId });
  const pfNos = [...new Set(rows.map(r => r.pfNo).filter(Boolean))];
  const { members, membersByPf } = await findMembersByPf(pfNos);

  const pfCounts = {};
  for (const row of rows) {
    if (row.pfNo) {
      pfCounts[row.pfNo] = (pfCounts[row.pfNo] || 0) + 1;
    }
  }

  const memberCodes = members.map(m => m.code).filter(Boolean);
  const demands = memberCodes.length > 0 ? await MemberDemandDefault.find({ memberCode: { $in: memberCodes } }) : [];
  const demandsByMemberCode = {};
  for (const d of demands) {
    demandsByMemberCode[d.memberCode] = d;
  }

  const updatedRows = [];
  for (const row of rows) {
    const parsedRow = {
      sourceRowNo: row.sourceRowNo,
      pfNo: row.pfNo,
      importedTotalAmount: row.importedTotalAmount,
      // Preserve legacy source metadata through revalidation
      sourceBranch: row.sourceBranch || null,
      sourceEmployeeName: row.sourceEmployeeName || null,
      sourceGrade: row.sourceGrade || null,
      rawPayload: row.payload
    };
    const built = await validateAndBuildRow(batchId, parsedRow, membersByPf, demandsByMemberCode, pfCounts);
    built.id = row.id;
    updatedRows.push(built);
  }

  for (const ur of updatedRows) {
    const rowModel = await RecoveryImportRow.findById(ur.id);
    if (rowModel) {
      rowModel.set(ur);
      await rowModel.save();
    }
  }

  const summary = summarizeBatch(updatedRows);
  batch.set(summary);
  await batch.save();

  return batch.toObject();
}

async function acceptBatch(batchId) {
  const batch = await revalidateBatch(batchId);
  
  if (batch.status !== 'READY') {
    throw new Error('Batch is not READY. All rows must be VALID.');
  }
  
  const batchModel = await RecoveryImportBatch.findById(batchId);
  batchModel.set({ status: 'ACCEPTED' });
  await batchModel.save();

  return batchModel.toObject();
}

// Retired: it posted one voucher per Excel row (dated today, to cash). An
// imported Excel is only an input to the Recovery entry screen, which saves
// the whole batch as ONE recovery voucher once every row reconciles.
async function postBatch() {
  const error = new Error('Posting an Excel batch directly is no longer supported. Open Transactions -> Recovery From Member, import the Excel there and save it as one recovery voucher.');
  error.statusCode = 410;
  throw error;
}

module.exports = {
  analyzeFileHeaders,
  uploadAndParseBatch,
  revalidateBatch,
  acceptBatch,
  postBatch
};
