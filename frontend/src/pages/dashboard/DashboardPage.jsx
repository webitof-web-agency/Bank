import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  ArrowRightLeft,
  Building2,
  ChevronDown,
  Download,
  FileBarChart,
  FileText,
  Landmark,
  PieChart,
  ReceiptText,
  Search,
  ShieldCheck,
  Upload,
  User,
  Users,
  WalletCards,
  Zap
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../api/api';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { useAuth } from '../../context/AuthContext';
import { cn } from '../../lib/cn';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart as RechartsPieChart, Pie, Cell } from 'recharts';

function formatNumber(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return '0';
  return new Intl.NumberFormat('en-IN').format(number);
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).format(date);
}

function statusTone(value = '') {
  const text = String(value).toLowerCase();
  if (text.includes('post') || text.includes('active') || text.includes('success')) return 'text-emerald-500 bg-emerald-50/50';
  if (text.includes('draft') || text.includes('pending')) return 'text-amber-500 bg-amber-50/50';
  if (text.includes('reverse') || text.includes('inactive') || text.includes('reject')) return 'text-rose-500 bg-rose-50/50';
  return 'text-slate-500 bg-slate-50/50';
}


export function DashboardPage() {
  const { token, user, hasPermission } = useAuth();
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    if (!hasPermission('dashboard.read')) {
      setLoading(false);
      return () => { mounted = false; };
    }
    setLoading(true);
    api.banking.dashboard(token)
      .then((response) => {
        if (!mounted) return;
        setDashboard(response.data || null);
      })
      .catch((error) => {
        if (!mounted) return;
        toast.error(error.message || 'Unable to load dashboard data');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => { mounted = false; };
  }, [hasPermission, token]);

  const society = dashboard?.society || null;
  const counts = dashboard?.counts || {};
  const recentVouchers = Array.isArray(dashboard?.recentVouchers) ? dashboard.recentVouchers : [];
  const recentBankTransactions = Array.isArray(dashboard?.recentBankTransactions) ? dashboard.recentBankTransactions : [];

  const metrics = [
    { label: 'Branches', value: formatNumber(counts.branches || 4), icon: Building2, desc: 'Offices and branch coverage across the system.', color: 'text-blue-500', bg: 'bg-blue-50', spark: 'text-blue-500' },
    { label: 'Members', value: formatNumber(counts.members || 8), icon: Users, desc: 'Registered member records and KYC base.', color: 'text-emerald-500', bg: 'bg-emerald-50', spark: 'text-emerald-500' },
    { label: 'Employees', value: formatNumber(counts.employees || 9), icon: ShieldCheck, desc: 'Staff and access-controlled user accounts.', color: 'text-amber-500', bg: 'bg-amber-50', spark: 'text-amber-500' },
    { label: 'Ledgers', value: formatNumber(counts.ledgers || 19), icon: FileText, desc: 'Accounting heads available for posting.', color: 'text-rose-500', bg: 'bg-rose-50', spark: 'text-rose-500' },
    { label: 'Bank Accounts', value: formatNumber(counts.bankAccounts || 3), icon: Landmark, desc: 'Operational accounts linked to the books.', color: 'text-violet-500', bg: 'bg-violet-50', spark: 'text-violet-500' },
    { label: 'Vouchers', value: formatNumber(counts.vouchers || 5), icon: ReceiptText, desc: 'Posted vouchers and workflow entries.', color: 'text-emerald-500', bg: 'bg-emerald-50', spark: 'text-emerald-500' }
  ];

  const quickActions = [
    { label: 'New Voucher', desc: 'Create new voucher', icon: FileText, to: '/app/transactions/vouchers/new', color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Receipt Entry', desc: 'Add receipt', icon: Download, to: '/app/transactions/vouchers/new?type=receipt', color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: 'Payment Entry', desc: 'Add payment', icon: Upload, to: '/app/transactions/vouchers/new?type=payment', color: 'text-rose-600', bg: 'bg-rose-50' },
    { label: 'Bank Transfer', desc: 'New transfer', icon: ArrowRightLeft, to: '/app/transactions/vouchers/new?type=journal', color: 'text-violet-600', bg: 'bg-violet-50' },
    { label: 'Member Search', desc: 'Search member', icon: User, to: '/app/master/members', color: 'text-amber-600', bg: 'bg-amber-50' },
    { label: 'Reports', desc: 'View reports', icon: PieChart, to: '/app/reports', color: 'text-slate-800', bg: 'bg-slate-100' }
  ];

  const analyticsData = [
    { name: '01 May', income: 6, expense: 4 },
    { name: '07 May', income: 4.5, expense: 5 },
    { name: '14 May', income: 7, expense: 4 },
    { name: '21 May', income: 6, expense: 4.5 },
    { name: '28 May', income: 8, expense: 5 }
  ];

  const fundPositionData = [
    { name: 'Cash in Hand', value: 845000, color: '#3b82f6', pct: '23.7%' },
    { name: 'Bank Balances', value: 2015000, color: '#10b981', pct: '56.6%' },
    { name: 'Deposits', value: 560000, color: '#8b5cf6', pct: '15.7%' },
    { name: 'Advances', value: 140000, color: '#f59e0b', pct: '3.9%' }
  ];

  return (
    <div className="space-y-6 pb-12">
      {/* Banner */}
      <div className="relative overflow-hidden rounded-2xl shadow-sm bg-[#093ebd]">
        {/* Background Image */}
        <div className="absolute inset-0">
          <img src="/assets/images/banner.png" alt="Bank Banner" className="absolute right-0 top-0 h-full w-full md:w-[60%] object-cover object-right" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#093ebd] via-[#093ebd]/70 to-transparent" />
        </div>
        
        <div className="relative px-8 py-10 md:px-10 text-white">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[11px] font-medium text-white/90 backdrop-blur-sm">
            <span>🛡️</span> Welcome back, {user?.fullName || 'System Admin'} 👋
          </div>
          
          <h1 className="max-w-2xl text-2xl font-bold leading-tight tracking-tight md:text-3xl lg:text-[34px]">
            {society?.name || 'The Raipur Co-operative Employees Thrift Society Ltd.'}
          </h1>
          <p className="mt-2 text-sm font-medium text-blue-100/90">
            {society?.regNo ? `Reg. No. ${society.regNo}` : 'Reg. No. CG/PPR/CS/00417'}
          </p>

          <div className="mt-8 flex flex-wrap gap-4">
            <div className="flex w-[210px] items-center gap-4 rounded-xl bg-[#2a62df]/90 px-4 py-3 backdrop-blur-md shadow-sm border border-[#447eed]/30">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#447eed]">
                <ShieldCheck size={20} className="text-white" />
              </div>
              <div className="overflow-hidden">
                <p className="text-[10px] font-semibold text-blue-200">Logged in as</p>
                <p className="truncate text-[13px] font-bold text-white">{user?.fullName || 'System Admin'}</p>
                <p className="truncate text-[10px] text-blue-200">{user?.role || 'Administrator'}</p>
              </div>
            </div>
            
            <div className="flex w-[210px] items-center gap-4 rounded-xl bg-[#2a62df]/90 px-4 py-3 backdrop-blur-md shadow-sm border border-[#447eed]/30">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#447eed]">
                <Building2 size={20} className="text-white" />
              </div>
              <div className="overflow-hidden">
                <p className="text-[10px] font-semibold text-blue-200">Branch Link</p>
                <p className="truncate text-[13px] font-bold text-white">{society?.branchCode || 'BR01'}</p>
                <p className="truncate text-[10px] text-blue-200">Default operating branch</p>
              </div>
            </div>

            <div className="flex w-[210px] items-center gap-4 rounded-xl bg-[#2a62df]/90 px-4 py-3 backdrop-blur-md shadow-sm border border-[#447eed]/30">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#447eed]">
                <FileText size={20} className="text-white" />
              </div>
              <div className="overflow-hidden">
                <p className="text-[10px] font-semibold text-blue-200">Vouchers</p>
                <p className="truncate text-[13px] font-bold text-white">{counts.vouchers || 5}</p>
                <p className="truncate text-[10px] text-blue-200">Posted voucher records</p>
              </div>
            </div>

            <div className="flex w-[210px] items-center gap-4 rounded-xl bg-[#2a62df]/90 px-4 py-3 backdrop-blur-md shadow-sm border border-[#447eed]/30">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#447eed]">
                <ArrowRightLeft size={20} className="text-white" />
              </div>
              <div className="overflow-hidden">
                <p className="text-[10px] font-semibold text-blue-200">Bank TX</p>
                <p className="truncate text-[13px] font-bold text-white">{counts.bankTransactions || 1}</p>
                <p className="truncate text-[10px] text-blue-200">Bank movement entries</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-6 lg:gap-6">
        {metrics.map((item) => (
          <div key={item.label} className="relative flex flex-col justify-between overflow-hidden rounded-[20px] bg-white p-5 min-h-[140px] shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] border border-gray-100 hover:shadow-md transition-shadow group">
            <div className="flex items-center gap-3">
              <div className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px]', item.bg, item.color)}>
                <item.icon size={22} strokeWidth={1.5} />
              </div>
              <div>
                <p className="text-[11.5px] font-semibold text-gray-500 mb-0.5">{item.label}</p>
                <p className="text-[22px] font-extrabold text-gray-900 leading-none">{item.value}</p>
              </div>
            </div>
            <p className="mt-4 text-[10.5px] font-medium leading-[1.5] text-slate-500 max-w-[135px] relative z-10">{item.desc}</p>
            
            {/* Sparkline (Decorative) */}
            <div className={cn("absolute bottom-2 right-2 w-24 h-10 opacity-80 group-hover:opacity-100 transition-opacity", item.spark)}>
              <svg viewBox="0 0 100 30" className="w-full h-full drop-shadow-sm text-current" preserveAspectRatio="none">
                <defs>
                  <linearGradient id={`gradient-${item.label.replace(/\s+/g, '')}`} x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="currentColor" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path
                  d="M 0 25 L 10 22 L 20 26 L 30 18 L 40 22 L 50 15 L 60 20 L 70 12 L 80 16 L 90 8 L 100 10"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M 0 25 L 10 22 L 20 26 L 30 18 L 40 22 L 50 15 L 60 20 L 70 12 L 80 16 L 90 8 L 100 10 L 100 30 L 0 30 Z"
                  fill={`url(#gradient-${item.label.replace(/\s+/g, '')})`}
                />
              </svg>
            </div>
          </div>
        ))}
      </div>

      {/* Analytics & Quick Actions */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Overview Analytics */}
        <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm lg:col-span-2">
          <div className="mb-6 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-lg font-bold text-slate-900">
              <FileBarChart size={20} className="text-blue-500" />
              Overview Analytics
            </h3>
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-1.5 text-[13px] font-medium text-slate-700 cursor-pointer hover:bg-slate-50">
              This Month <ChevronDown size={14} />
            </div>
          </div>
          
          <div className="grid lg:grid-cols-2 gap-8">
            {/* Income vs Expense Line Chart */}
            <div className="flex flex-col justify-between">
              <div>
                <p className="text-[12px] font-semibold text-slate-500">Income vs Expense</p>
                <div className="mt-3 flex items-end gap-12">
                  <div>
                    <p className="text-xl font-bold text-slate-900">₹ 12,45,000</p>
                    <div className="flex items-center gap-2 mt-1">
                      <p className="text-[11px] text-slate-500">Total Income</p>
                      <span className="text-[11px] font-bold text-emerald-500">↑ 12.5%</span>
                    </div>
                  </div>
                  <div>
                    <p className="text-xl font-bold text-slate-900">₹ 8,75,000</p>
                    <div className="flex items-center gap-2 mt-1">
                      <p className="text-[11px] text-slate-500">Total Expense</p>
                      <span className="text-[11px] font-bold text-rose-500">↑ 8.2%</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="mt-6 h-[180px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={analyticsData} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} tickFormatter={(value) => `${value}L`} />
                    <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                    <Line type="monotone" dataKey="income" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 4, strokeWidth: 2, fill: '#fff' }} />
                    <Line type="monotone" dataKey="expense" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 5" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-3 flex justify-center gap-6 text-[11px] font-medium text-slate-500">
                <div className="flex items-center gap-2"><span className="h-0.5 w-3 bg-blue-500"></span> Income</div>
                <div className="flex items-center gap-2"><span className="h-0.5 w-3 border-t-2 border-dashed border-slate-400"></span> Expense</div>
              </div>
            </div>

            {/* Fund Position Donut Chart */}
            <div>
              <p className="text-[12px] font-semibold text-slate-500">Fund Position</p>
              <div className="mt-6 flex flex-col items-center sm:flex-row sm:items-center sm:justify-between gap-6">
                <div className="relative h-[160px] w-[160px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsPieChart>
                      <Pie
                        data={fundPositionData}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={80}
                        paddingAngle={2}
                        dataKey="value"
                        stroke="none"
                      >
                        {fundPositionData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                    </RechartsPieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                    <p className="text-[16px] font-bold text-slate-900">₹ 35,60,000</p>
                    <p className="text-[10px] font-medium text-slate-500">Total Funds</p>
                  </div>
                </div>
                
                <div className="flex-1 w-full space-y-4">
                  {fundPositionData.map(item => (
                    <div key={item.name} className="flex items-center justify-between text-[12px]">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }}></span>
                        <span className="font-medium text-slate-600">{item.name}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="font-bold text-slate-900">₹ {new Intl.NumberFormat('en-IN').format(item.value)}</span>
                        <span className="w-8 text-right font-medium text-slate-400">{item.pct}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="rounded-[20px] border border-gray-100 bg-white p-6 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
          <h3 className="mb-6 flex items-center gap-2 text-[14px] font-bold text-gray-900">
            <Zap size={16} className="text-blue-600" />
            Quick Actions
          </h3>
          <div className="grid grid-cols-3 gap-3">
            {quickActions.map(action => (
              <Link key={action.label} to={action.to} className="group flex flex-col items-center justify-center rounded-[16px] border border-gray-100 py-5 px-2 text-center transition-all hover:border-blue-100 hover:shadow-[0_4px_12px_-4px_rgba(0,0,0,0.08)] bg-white">
                <div className={cn('mb-3 flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] transition-transform group-hover:scale-110', action.bg, action.color)}>
                  <action.icon size={22} strokeWidth={1.5} />
                </div>
                <p className="text-[11.5px] font-extrabold text-gray-900 leading-tight mb-1">{action.label}</p>
                <p className="text-[9.5px] font-medium text-slate-500">{action.desc}</p>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Tables Section */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Vouchers */}
        <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
          <h3 className="mb-5 flex items-center gap-2 text-lg font-bold text-slate-900">
            <ReceiptText size={20} className="text-blue-500" />
            Recent Vouchers
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-100 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  <th className="pb-3 pl-1 pr-4">Voucher No</th>
                  <th className="pb-3 pr-4">Date</th>
                  <th className="pb-3 pr-4">Category</th>
                  <th className="pb-3 pr-4">Amount</th>
                  <th className="pb-3 pr-1">Status</th>
                </tr>
              </thead>
              <tbody className="text-[13px]">
                {loading ? (
                  <tr><td colSpan={5} className="py-6 text-center text-slate-500">Loading...</td></tr>
                ) : recentVouchers.length === 0 ? (
                  <tr><td colSpan={5} className="py-6 text-center text-slate-500">No recent vouchers</td></tr>
                ) : recentVouchers.slice(0, 5).map(v => (
                  <tr key={v._id || v.voucherNo} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                    <td className="py-3 pl-1 pr-4 font-bold text-slate-800">{v.voucherNo || '-'}</td>
                    <td className="py-3 pr-4 text-slate-500">{formatDate(v.date)}</td>
                    <td className="py-3 pr-4 font-medium text-slate-600">{v.voucherCategory || v.transactionType || '-'}</td>
                    <td className="py-3 pr-4 font-bold text-slate-800">₹ {formatNumber(v.amount)}</td>
                    <td className="py-3 pr-1">
                      <span className={cn('inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider', statusTone(v.status))}>
                        {v.status || 'Posted'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex justify-center">
            <Link to="/app/transactions/vouchers" className="inline-flex items-center gap-1.5 text-[13px] font-bold text-blue-600 transition hover:text-blue-700">
              View all vouchers <ArrowRight size={14} strokeWidth={2.5} />
            </Link>
          </div>
        </div>

        {/* Recent Bank Transactions */}
        <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
          <h3 className="mb-5 flex items-center gap-2 text-lg font-bold text-slate-900">
            <Landmark size={20} className="text-blue-500" />
            Recent Bank Transactions
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-100 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  <th className="pb-3 pl-1 pr-4">TX No</th>
                  <th className="pb-3 pr-4">Date</th>
                  <th className="pb-3 pr-4">Account</th>
                  <th className="pb-3 pr-4">Type</th>
                  <th className="pb-3 pr-4">Amount</th>
                  <th className="pb-3 pr-1">Status</th>
                </tr>
              </thead>
              <tbody className="text-[13px]">
                {loading ? (
                  <tr><td colSpan={6} className="py-6 text-center text-slate-500">Loading...</td></tr>
                ) : recentBankTransactions.length === 0 ? (
                  <tr><td colSpan={6} className="py-6 text-center text-slate-500">No recent transactions</td></tr>
                ) : recentBankTransactions.slice(0, 5).map(tx => (
                  <tr key={tx._id || tx.transactionNo} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                    <td className="py-3 pl-1 pr-4 font-bold text-slate-800">{tx.transactionNo || '-'}</td>
                    <td className="py-3 pr-4 text-slate-500">{formatDate(tx.date)}</td>
                    <td className="py-3 pr-4 font-medium text-slate-600">{tx.bankAccountCode || '-'}</td>
                    <td className="py-3 pr-4 text-slate-600 capitalize">{tx.transactionType || '-'}</td>
                    <td className="py-3 pr-4 font-bold text-slate-800">₹ {formatNumber(tx.amount)}</td>
                    <td className="py-3 pr-1">
                      <span className={cn('inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider', statusTone(tx.status))}>
                        {tx.status || 'Posted'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex justify-center">
            <Link to="/app/transactions/bank-transactions" className="inline-flex items-center gap-1.5 text-[13px] font-bold text-blue-600 transition hover:text-blue-700">
              View all transactions <ArrowRight size={14} strokeWidth={2.5} />
            </Link>
          </div>
        </div>
      </div>
      
      <div className="mt-6 text-center text-[11px] text-slate-400">
        © 2026 The Raipur Co-operative Employees Thrift Society Ltd. All rights reserved.
      </div>
    </div>
  );
}

export default DashboardPage;
