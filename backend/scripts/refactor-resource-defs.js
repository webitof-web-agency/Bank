const fs = require('fs');
const path = require('path');

const filePath = path.resolve(__dirname, '../services/banking.service.js');
let content = fs.readFileSync(filePath, 'utf8');

const newDefs = `
  demandLines: {
    model: DemandLine,
    searchFields: ['demandListNo', 'memberCode'],
    normalize(data = {}) {
      return {
        demandListNo: cleanUpper(data.demandListNo),
        memberCode: cleanUpper(data.memberCode),
        loanEmi: toNumber(data.loanEmi, 0),
        cdInstallment: toNumber(data.cdInstallment, 0),
        ssaInstallment: toNumber(data.ssaInstallment, 0),
        insurancePremium: toNumber(data.insurancePremium, 0),
        shares: toNumber(data.shares, 0),
        otherCharges: toNumber(data.otherCharges, 0),
        payload: toMixed(data.payload, {})
      };
    }
  },
  memberDemandDefaults: {
    model: MemberDemandDefault,
    searchFields: ['memberCode'],
    normalize(data = {}) {
      return {
        memberCode: cleanUpper(data.memberCode),
        loanEmi: toNumber(data.loanEmi, 0),
        cdInstallment: toNumber(data.cdInstallment, 0),
        ssaInstallment: toNumber(data.ssaInstallment, 0),
        insurancePremium: toNumber(data.insurancePremium, 0),
        payload: toMixed(data.payload, {})
      };
    }
  },
  recoveryLines: {
    model: RecoveryLine,
    searchFields: ['voucherNo', 'memberCode'],
    normalize(data = {}) {
      return {
        voucherNo: cleanUpper(data.voucherNo),
        memberCode: cleanUpper(data.memberCode),
        loanPrincipal: toNumber(data.loanPrincipal, 0),
        loanInterest: toNumber(data.loanInterest, 0),
        cdInstallment: toNumber(data.cdInstallment, 0),
        ssaInstallment: toNumber(data.ssaInstallment, 0),
        insurancePremium: toNumber(data.insurancePremium, 0),
        shares: toNumber(data.shares, 0),
        pf: toNumber(data.pf, 0),
        penalty: toNumber(data.penalty, 0),
        otherCharges: toNumber(data.otherCharges, 0),
        payload: toMixed(data.payload, {})
      };
    }
  },
`;

if (!content.includes('demandLines: {')) {
  content = content.replace(
    /const RESOURCE_DEFS = {/,
    `const RESOURCE_DEFS = {\${newDefs}`
  );
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('banking.service.js updated with new RESOURCE_DEFS.');
} else {
  console.log('Already updated.');
}
