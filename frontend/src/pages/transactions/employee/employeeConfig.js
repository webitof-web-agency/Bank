import { Banknote, Repeat2, ArrowUpRight, ArrowDownLeft } from 'lucide-react';

export const EMPLOYEE_TRANSACTION_TYPES = [
  {
    key: 'advance-paid-emp',
    label: 'Advance Paid by Cash/Cheque',
    description: 'Employee advance payment workspace.',
    route: '/app/transactions/employee/advance-paid-emp',
    detailRouteBase: '/app/transactions/employee/advance-paid-emp',
    tone: 'pink',
    icon: ArrowUpRight
  },
  {
    key: 'advance-recovery-emp',
    label: 'Advance Recovery by Cash/Transfer',
    description: 'Employee advance recovery workspace.',
    route: '/app/transactions/employee/advance-recovery-emp',
    detailRouteBase: '/app/transactions/employee/advance-recovery-emp',
    tone: 'emerald',
    icon: ArrowDownLeft
  }
];

export function getEmployeeTransactionTypeByKey(key = '') {
  return EMPLOYEE_TRANSACTION_TYPES.find((item) => item.key === key) || null;
}

export function getEmployeeTransactionTypeBySlug(slug = '') {
  return EMPLOYEE_TRANSACTION_TYPES.find((item) => item.route.endsWith(`/${slug}`) || item.key === slug) || null;
}
