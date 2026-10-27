'use strict';

// A test member (payload.testAccount = true), e.g. the Google Play review
// login: it signs in to the member app and sees its own sample balances, but
// is kept out of every list, picker, report, count, demand and the year-end
// close, so it never touches the society's figures. Delete it with
// tools/test-member/remove-test-member.sql.
function isTestMember(row = {}) {
  const payload = typeof row.payload === 'string' ? JSON.parse(row.payload || '{}') : (row.payload || {});
  return payload?.testAccount === true;
}

function withoutTestMembers(rows = []) {
  return rows.filter((row) => !isTestMember(row));
}

module.exports = { isTestMember, withoutTestMembers };
