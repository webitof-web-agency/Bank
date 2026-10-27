// The members a picker offers in the selected FY: /banking/lookups sends
// every member (names still show on old vouchers) and marks with inFy: false
// one who is not a member of that FY (left earlier with nothing left).
export function membersInFy(members = []) {
  return (Array.isArray(members) ? members : []).filter((member) => member?.inFy !== false);
}
