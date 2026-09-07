const xlsx = require('xlsx');
const { randomUUID } = require('crypto');
const { Member, MemberDemandDefault, RecoveryImportBatch, RecoveryImportRow } = require('../models/banking.models');
const { createVoucher } = require('./banking.service');
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

function getHeadersFromBuffer(buffer) {
  const workbook = xlsx.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });
  if (!data.length) return [];
  return data[0].map(h => String(h == null ? '' : h));
}

/**
 * Analyse the uploaded file buffer and return header info + auto-detected
 * column mapping. Used by the frontend GET /analyze endpoint.
 */
function analyzeFileHeaders(buffer) {
  const headers = getHeadersFromBuffer(buffer);
  const detection = detectLegacyTemplate(headers);
  return { headers, ...detection };
}

// ---------------------------------------------------------------------------
// File Parsing
// ---------------------------------------------------------------------------

/**
 * Parse the Excel file. Supports two colMap shapes:
 *   Legacy (name-based):  { pfNo: 'PF No.', amount: 'Total Amt.', branch: 'Branch', ... }
 *   Manual (index-based): { pfNo: 2, amount: 5 }
 */
function parseImportFile(buffer, colMap) {
  const workbook = xlsx.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  // Formula check
  for (const key in sheet) {
    if (key[0] === '!') continue;
    if (sheet[key].f) {
      throw new Error('Formulas are not allowed in the import file. Please paste values only.');
    }
  }

  // Determine whether colMap uses string header names or numeric indices
  const isNameBasedMap = typeof colMap.pfNo === 'string' && isNaN(Number(colMap.pfNo));

  let data;
  if (isNameBasedMap) {
    data = xlsx.utils.sheet_to_json(sheet, { defval: null });
  } else {
    const rawRows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: null });
    if (rawRows.length < 2) return [];
    data = rawRows.slice(1).map(row => {
      const obj = {};
      (rawRows[0] || []).forEach((h, i) => { obj[i] = row[i]; });
      return obj;
    });
  }

  const pfKey = isNameBasedMap ? colMap.pfNo : Number(colMap.pfNo);
  const amountKey = isNameBasedMap ? colMap.amount : Number(colMap.amount);
  const branchKey = colMap.branch != null ? (isNameBasedMap ? colMap.branch : Number(colMap.branch)) : null;
  const empNameKey = colMap.empName != null ? (isNameBasedMap ? colMap.empName : Number(colMap.empName)) : null;
  const gradeKey = colMap.grade != null ? (isNameBasedMap ? colMap.grade : Number(colMap.grade)) : null;

  const parsedRows = [];
  data.forEach((row, index) => {
    const rawPfNo = row[pfKey];
    const rawAmount = row[amountKey];

    const pfNo = rawPfNo != null ? String(rawPfNo).trim() : null;
    const amount = rawAmount != null ? parseFloat(rawAmount) : null;

    if (!pfNo && !amount) return; // Skip completely empty rows

    const sourceBranch = branchKey != null && row[branchKey] != null
      ? String(row[branchKey]).trim() : null;
    const sourceEmployeeName = empNameKey != null && row[empNameKey] != null
      ? String(row[empNameKey]).trim() : null;
    const sourceGrade = gradeKey != null && row[gradeKey] != null
      ? String(row[gradeKey]).trim() : null;

    parsedRows.push({
      sourceRowNo: index + 2, // +2 because row 1 is header
      pfNo: pfNo || '',
      importedTotalAmount: isNaN(amount) ? 0 : amount,
      sourceBranch,
      sourceEmployeeName,
      sourceGrade,
      rawPayload: row
    });
  });

  return parsedRows;
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
  const members = pfNos.length > 0 ? await Member.find({ pfNo: pfNos }) : [];
  
  const membersByPf = {};
  for (const m of members) {
    if (!membersByPf[m.pfNo]) membersByPf[m.pfNo] = [];
    membersByPf[m.pfNo].push(m);
  }

  const pfCounts = {};
  for (const row of parsedRows) {
    if (row.pfNo) {
      pfCounts[row.pfNo] = (pfCounts[row.pfNo] || 0) + 1;
    }
  }

  const memberCodes = members.map(m => m.code).filter(Boolean);
  const demands = memberCodes.length > 0 ? await MemberDemandDefault.find({ memberCode: memberCodes }) : [];
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

  const batchRecord = {
    id: batchId,
    fileName,
    uploadedBy,
    uploadedAt: new Date(),
    ...summary,
    payload: { colMap }
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
  const members = pfNos.length > 0 ? await Member.find({ pfNo: pfNos }) : [];
  
  const membersByPf = {};
  for (const m of members) {
    if (!membersByPf[m.pfNo]) membersByPf[m.pfNo] = [];
    membersByPf[m.pfNo].push(m);
  }

  const pfCounts = {};
  for (const row of rows) {
    if (row.pfNo) {
      pfCounts[row.pfNo] = (pfCounts[row.pfNo] || 0) + 1;
    }
  }

  const memberCodes = members.map(m => m.code).filter(Boolean);
  const demands = memberCodes.length > 0 ? await MemberDemandDefault.find({ memberCode: memberCodes }) : [];
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

async function postBatch(batchId, meta = {}) {
  const batch = await RecoveryImportBatch.findById(batchId);
  if (!batch) throw new Error('Batch not found');
  if (batch.status !== 'ACCEPTED') throw new Error('Batch must be ACCEPTED before posting');

  const rows = await RecoveryImportRow.find({ batchId, status: 'VALID' });
  if (rows.length !== batch.totalRows) {
    throw new Error('Mismatch in valid rows count. Revalidate batch.');
  }

  const membersIds = [...new Set(rows.map(r => r.memberId).filter(Boolean))];
  const members = membersIds.length > 0 ? await Member.find({ id: membersIds }) : [];
  const memberMap = {};
  for (const m of members) {
    memberMap[m.id] = m;
  }

  // Iterate to create vouchers sequentially. (True ACID atomic wrap would require modifying createVoucher)
  for (const row of rows) {
    const member = memberMap[row.memberId];
    if (!member) throw new Error(`Member not found for row ${row.sourceRowNo}`);
    
    const recoveryLines = [];
    const linePayload = {
      memberCode: member.code,
      share: row.allocatedShare,
      specialDeposit: row.allocatedSpecialDeposit,
      compulsoryDeposit: row.allocatedCompulsoryDeposit,
      regularLoan: row.allocatedRegularLoan,
      loanAgainstDeposit: row.allocatedLoanAgainstDeposit,
      total: row.allocatedTotal
    };
    recoveryLines.push(linePayload);

    const voucherData = {
      voucherCategory: 'Recovery From Member',
      transactionType: 'receipt',
      date: new Date().toISOString().slice(0, 10),
      amount: row.allocatedTotal,
      partyCode: member.code,
      mode: 'Cash / Transfer', 
      narration: `Imported Recovery (Batch ${batchId})`,
      details: {
        key: 'recovery-member',
        recoveryLines
      }
    };

    const createdVoucher = await createVoucher(voucherData, meta);
    
    const rowModel = await RecoveryImportRow.findById(row.id);
    rowModel.set({
      status: 'POSTED',
      recoveryVoucherId: createdVoucher.id,
      postedAt: new Date()
    });
    await rowModel.save();
  }

  batch.set({ status: 'POSTED' });
  await batch.save();

  return batch.toObject();
}

module.exports = {
  analyzeFileHeaders,
  uploadAndParseBatch,
  revalidateBatch,
  acceptBatch,
  postBatch
};
