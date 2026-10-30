import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  ArrowRightLeft,
  Building2,
  Download,
  FileBarChart,
  FileText,
  Landmark,
  PieChart,
  ReceiptText,
  ShieldCheck,
  Upload,
  User,
  Users,
  Zap
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../api/api';
import { Select } from '../../components/ui/Select';
import { useAuth } from '../../context/AuthContext';
import { useFY } from '../../context/FYContext';
import { cn } from '../../lib/cn';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart as RechartsPieChart, Pie, Cell } from 'recharts';

function formatNumber(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return '0';
  return new Intl.NumberFormat('en-IN').format(number);
}

function formatCurrency(value) {
  return `₹ ${formatNumber(value)}`;
}

// Short form for tight spots (the donut's centre): ₹19.66 Cr, ₹48.38 L.
function formatCompactCurrency(value) {
  const number = Number(value || 0);
  const abs = Math.abs(number);
  if (abs >= 1e7) return `₹ ${(number / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `₹ ${(number / 1e5).toFixed(2)} L`;
  return formatCurrency(Math.round(number));
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


const FUND_COLORS = { cash: '#1661F6', bank: '#10b981', memberLoans: '#8b5cf6', staffAdvances: '#f59e0b' };

// Quick Actions: real pages only, each shown when the user may open it.
const QUICK_ACTIONS = [
  { label: 'Recovery', desc: 'Recovery from member', icon: ReceiptText, to: '/app/transactions/member/recovery', permission: 'transactions.member.view', color: 'text-blue-600', bg: 'bg-blue-50' },
  { label: 'Demand Entry', desc: 'Monthly demand', icon: FileText, to: '/app/transactions/other/demand-entry', permission: ['demands.read', 'transactions.supporting.view'], color: 'text-violet-600', bg: 'bg-violet-50' },
  { label: 'Receipt Voucher', desc: 'Add receipt', icon: Download, to: '/app/transactions/other/receipt-voucher', permission: 'transactions.receipt-interest.view', color: 'text-emerald-600', bg: 'bg-emerald-50' },
  { label: 'Payment Voucher', desc: 'Add payment', icon: Upload, to: '/app/transactions/other/payment-voucher', permission: 'transactions.receipt-interest.view', color: 'text-rose-600', bg: 'bg-rose-50' },
  { label: 'Members', desc: 'Search member', icon: User, to: '/app/master/members', permission: 'members.read', color: 'text-amber-600', bg: 'bg-amber-50' },
  { label: 'Reports', desc: 'View reports', icon: PieChart, to: '/app/reports', permission: 'reports.read', color: 'text-slate-800', bg: 'bg-slate-100' }
];

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// A count, or '…' while the dashboard is loading (never a made-up number).
function countText(loading, value) {
  return loading ? '…' : formatNumber(value);
}

function ChangeBadge({ value, tone }) {
  if (value == null) return null;
  const up = value >= 0;
  // Against a near-empty period the change runs into thousands of %: shown capped.
  const text = Math.abs(value) > 999 ? '>999' : Math.abs(value);
  return <span className={cn('text-[11px] font-bold', tone)} title={`${value}%`}>{up ? '↑' : '↓'} {text}%</span>;
}

export function DashboardPage() {
  const { token, user, hasPermission } = useAuth();
  const { activeFY } = useFY();
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [analyticsPeriod, setAnalyticsPeriod] = useState('thisMonth');

  useEffect(() => {
    let mounted = true;
    if (!hasPermission('dashboard.read')) {
      setLoading(false);
      return () => { mounted = false; };
    }
    setLoading(true);
    api.banking.dashboard(token, { fyStart: activeFY?.start || '', fyEnd: activeFY?.end || '' })
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
  }, [hasPermission, token, activeFY]);

  const headOffice = dashboard?.headOffice || dashboard?.society || null;
  const counts = dashboard?.counts || {};
  const analytics = dashboard?.analytics || null;
  const recentVouchers = Array.isArray(dashboard?.recentVouchers) ? dashboard.recentVouchers : [];
  const recentBankTransactions = Array.isArray(dashboard?.recentBankTransactions) ? dashboard.recentBankTransactions : [];

  const metrics = [
    { label: 'Branches', value: countText(loading, counts.branches), icon: Building2, desc: 'Offices and branch coverage across the system.', color: 'text-blue-500', bg: 'bg-blue-50', spark: 'text-blue-500' },
    { label: 'Members', value: countText(loading, counts.members), icon: Users, desc: 'Active members on the roll.', color: 'text-emerald-500', bg: 'bg-emerald-50', spark: 'text-emerald-500' },
    { label: 'Employees', value: countText(loading, counts.employees), icon: ShieldCheck, desc: 'Staff in the employee master.', color: 'text-amber-500', bg: 'bg-amber-50', spark: 'text-amber-500' },
    { label: 'Ledgers', value: countText(loading, counts.ledgers), icon: FileText, desc: 'Accounting heads available for posting.', color: 'text-rose-500', bg: 'bg-rose-50', spark: 'text-rose-500' },
    { label: 'Bank Accounts', value: countText(loading, counts.bankAccounts), icon: Landmark, desc: 'Bank ledgers in the books.', color: 'text-violet-500', bg: 'bg-violet-50', spark: 'text-violet-500' },
    { label: 'Vouchers', value: countText(loading, counts.vouchers), icon: ReceiptText, desc: 'Vouchers entered in this financial year.', color: 'text-emerald-500', bg: 'bg-emerald-50', spark: 'text-emerald-500' }
  ];

  const quickActions = QUICK_ACTIONS.filter((action) => hasPermission(action.permission));

  const analyticsOptions = useMemo(() => [
    { value: 'thisMonth', label: 'This Month' },
    { value: 'lastMonth', label: 'Last Month' },
    { value: 'thisYear', label: 'This FY' }
  ], []);

  const selectedTotals = analytics?.periods?.[analyticsPeriod] || analytics?.periods?.thisMonth || { income: 0, expense: 0 };
  // Month by month over the FY, in lakh.
  const lineData = useMemo(() => (analytics?.monthly || []).map((row) => ({
    name: `${MONTH_NAMES[Number(row.month.slice(5, 7)) - 1]} ${row.month.slice(2, 4)}`,
    income: Number((row.income / 100000).toFixed(2)),
    expense: Number((row.expense / 100000).toFixed(2))
  })), [analytics]);

  const fundTotal = (analytics?.fundPosition || []).reduce((sum, item) => sum + Math.max(0, Number(item.value || 0)), 0);
  const selectedFundPosition = useMemo(() => (analytics?.fundPosition || []).map((item) => ({
    name: item.label,
    // The donut takes no negative slice; the list shows the true figure.
    value: Math.max(0, Number(item.value || 0)),
    amount: Number(item.value || 0),
    color: FUND_COLORS[item.key] || '#94a3b8',
    pct: fundTotal ? `${((Math.max(0, Number(item.value || 0)) / fundTotal) * 100).toFixed(1)}%` : '0%'
  })), [analytics, fundTotal]);

  return (
    <div className="space-y-6 pb-12">
      <div
        className="relative overflow-hidden shadow-sm"
        style={{
          borderRadius: 'var(--radius-card, 1.75rem)',
          background: 'linear-gradient(135deg, color-mix(in srgb, var(--primary, #1661F6) 85%, white) 0%, color-mix(in srgb, var(--primary, #1661F6) 65%, white) 100%)'
        }}
      >
        {/* Real Bank Image with Theme Blending */}
        <div className="absolute right-0 top-0 h-full w-[60%] pointer-events-none flex items-center justify-end overflow-hidden">
          <img
            src="/assets/images/banner.png"
            alt="Bank Building"
            className="h-[110%] w-auto max-w-none opacity-40 mix-blend-overlay grayscale contrast-125"
            style={{
              maskImage: 'linear-gradient(to right, transparent 0%, black 40%)',
              WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 40%)'
            }}
          />
        </div>

        <div className="relative px-6 py-8 md:px-8 text-white flex flex-col justify-between min-h-[160px]">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-white/80 mb-1">
              Welcome back,
            </p>
            <h1 className="text-2xl font-bold leading-tight tracking-tight md:text-[32px]">
              {user?.fullName || user?.name || ''} <span className="inline-block">👋</span>
            </h1>
            <p className="mt-1.5 text-sm font-medium text-white/90 max-w-xl">
              {headOffice?.name || ''}{headOffice?.branchCode ? ` • ${headOffice.branchCode}` : ''}
            </p>
          </div>

          <div className="mt-8 flex flex-wrap gap-4 md:gap-5">
            <div className="flex items-center gap-3 rounded-[var(--radius-button,1rem)] bg-white/15 px-4 py-3 backdrop-blur-md border border-white/20 shadow-sm transition-transform hover:-translate-y-1">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/25">
                <Users size={18} className="text-white" />
              </div>
              <div className="pr-2">
                <p className="text-[10px] font-bold text-white/70 uppercase tracking-wider">Members</p>
                <p className="text-[15px] font-bold text-white leading-none mt-1">{countText(loading, counts.members)}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-[var(--radius-button,1rem)] bg-white/15 px-4 py-3 backdrop-blur-md border border-white/20 shadow-sm transition-transform hover:-translate-y-1">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/25">
                <ShieldCheck size={18} className="text-white" />
              </div>
              <div className="pr-2">
                <p className="text-[10px] font-bold text-white/70 uppercase tracking-wider">Employees</p>
                <p className="text-[15px] font-bold text-white leading-none mt-1">{countText(loading, counts.employees)}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-[var(--radius-button,1rem)] bg-white/15 px-4 py-3 backdrop-blur-md border border-white/20 shadow-sm transition-transform hover:-translate-y-1">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/25">
                <ReceiptText size={18} className="text-white" />
              </div>
              <div className="pr-2">
                <p className="text-[10px] font-bold text-white/70 uppercase tracking-wider">Vouchers</p>
                <p className="text-[15px] font-bold text-white leading-none mt-1">{countText(loading, counts.vouchers)}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-[var(--radius-button,1rem)] bg-white/15 px-4 py-3 backdrop-blur-md border border-white/20 shadow-sm transition-transform hover:-translate-y-1">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/25">
                <ArrowRightLeft size={18} className="text-white" />
              </div>
              <div className="pr-2">
                <p className="text-[10px] font-bold text-white/70 uppercase tracking-wider">Bank Entries</p>
                <p className="text-[15px] font-bold text-white leading-none mt-1">{countText(loading, counts.bankTransactions)}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-6 lg:gap-6">
        {metrics.map((item) => (
          <div key={item.label} className="relative flex flex-col justify-between overflow-hidden rounded-[var(--radius-card,1.75rem)] bg-white p-5 min-h-[140px] shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] border border-gray-100 hover:shadow-md transition-shadow group">
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
        <div className="rounded-[var(--radius-card,1.75rem)] border border-slate-100 bg-white p-6 shadow-sm lg:col-span-2">
          <div className="mb-6 flex items-center justify-between">
            <h3 className="flex items-center gap-2.5 text-lg font-bold text-slate-900">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] text-[var(--primary,#1661F6)]">
                <FileBarChart size={22} strokeWidth={1.5} />
              </div>
              Overview Analytics
            </h3>
            <div className="w-40">
              <Select
                value={analyticsPeriod}
                onChange={setAnalyticsPeriod}
                options={analyticsOptions}
              />
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-8">
            {/* Income vs Expense Line Chart */}
            <div className="flex flex-col justify-between">
              <div>
                <p className="text-[12px] font-semibold text-slate-500">Income vs Expense</p>
                <div className="mt-3 flex flex-wrap items-end gap-x-8 gap-y-3">
                  <div>
                    <p className="whitespace-nowrap text-lg font-bold text-slate-900 xl:text-xl">{formatCurrency(selectedTotals.income)}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <p className="text-[11px] text-slate-500">Total Income</p>
                      <ChangeBadge value={selectedTotals.incomeChange} tone="text-emerald-500" />
                    </div>
                  </div>
                  <div>
                    <p className="whitespace-nowrap text-lg font-bold text-slate-900 xl:text-xl">{formatCurrency(selectedTotals.expense)}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <p className="text-[11px] text-slate-500">Total Expense</p>
                      <ChangeBadge value={selectedTotals.expenseChange} tone="text-rose-500" />
                    </div>
                  </div>
                </div>
              </div>
              <div className="mt-6 h-[180px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={lineData} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} tickFormatter={(value) => `${value}L`} />
                    <Tooltip formatter={(value) => `₹ ${value} L`} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                    <Line type="monotone" dataKey="income" stroke="#1661F6" strokeWidth={2.5} dot={{ r: 4, strokeWidth: 2, fill: '#fff' }} />
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
              <p className="text-[12px] font-semibold text-slate-500">Fund Position{analytics?.asOn ? ` as on ${formatDate(analytics.asOn)}` : ''}</p>
              <div className="mt-6 flex flex-col items-center sm:flex-row sm:items-center sm:justify-between gap-6">
                <div className="relative h-[160px] w-[160px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsPieChart>
                      <Pie
                        data={selectedFundPosition}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={80}
                        paddingAngle={2}
                        dataKey="value"
                        stroke="none"
                      >
                        {selectedFundPosition.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                    </RechartsPieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                    <p className="max-w-[96px] truncate text-[15px] font-bold text-slate-900" title={formatCurrency(fundTotal)}>{formatCompactCurrency(fundTotal)}</p>
                    <p className="text-[10px] font-medium text-slate-500">Total</p>
                  </div>
                </div>

                <div className="grid w-full min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto_2.75rem] items-center gap-x-3 gap-y-4 text-[12px]">
                  {selectedFundPosition.map(item => (
                    <Fragment key={item.name}>
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: item.color }}></span>
                        <span className="font-medium text-slate-600">{item.name}</span>
                      </div>
                      <span className="whitespace-nowrap text-right font-bold tabular-nums text-slate-900">{formatCurrency(item.amount)}</span>
                      <span className="text-right font-medium tabular-nums text-slate-400">{item.pct}</span>
                    </Fragment>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="rounded-[var(--radius-card,1.75rem)] border border-gray-100 bg-white p-6 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
          <h3 className="mb-6 flex items-center gap-2.5 text-[15px] font-bold text-gray-900">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] text-[var(--primary,#1661F6)]">
              <Zap size={22} strokeWidth={1.5} />
            </div>
            Quick Actions
          </h3>
          <div className="grid grid-cols-3 gap-3">
            {quickActions.map(action => (
              <Link key={action.label} to={action.to} className="group flex flex-col items-center justify-center rounded-[var(--radius-button,1rem)] border border-gray-100 py-5 px-2 text-center transition-all hover:border-blue-100 hover:shadow-[0_4px_12px_-4px_rgba(0,0,0,0.08)] bg-white">
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
        <div className="rounded-[var(--radius-card,1.75rem)] border border-slate-100 bg-white p-6 shadow-sm">
          <h3 className="mb-5 flex items-center gap-2.5 text-lg font-bold text-slate-900">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] text-[var(--primary,#1661F6)]">
              <ReceiptText size={22} strokeWidth={1.5} />
            </div>
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
                  <tr><td colSpan={5} className="py-6 text-center text-slate-500">No vouchers in this financial year</td></tr>
                ) : recentVouchers.slice(0, 5).map(v => (
                  <tr key={v.id || v._id || v.voucherNo} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
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
          <div className="mt-5 flex justify-center">
            <Link to="/app/transactions/overview" className="inline-flex items-center gap-1.5 text-[13px] font-bold transition-all hover:opacity-80 hover:gap-2.5" style={{ color: 'var(--primary, #1661F6)' }}>
              View all vouchers <ArrowRight size={14} strokeWidth={2.5} />
            </Link>
          </div>
        </div>

        {/* Recent Bank Entries */}
        <div className="rounded-[var(--radius-card,1.75rem)] border border-slate-100 bg-white p-6 shadow-sm">
          <h3 className="mb-5 flex items-center gap-2.5 text-lg font-bold text-slate-900">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] text-[var(--primary,#1661F6)]">
              <Landmark size={22} strokeWidth={1.5} />
            </div>
            Recent Bank Entries
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-100 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  <th className="pb-3 pl-1 pr-4">Voucher No</th>
                  <th className="pb-3 pr-4">Date</th>
                  <th className="pb-3 pr-4">Type</th>
                  <th className="pb-3 pr-4">Amount</th>
                  <th className="pb-3 pr-1">Status</th>
                </tr>
              </thead>
              <tbody className="text-[13px]">
                {loading ? (
                  <tr><td colSpan={5} className="py-6 text-center text-slate-500">Loading...</td></tr>
                ) : recentBankTransactions.length === 0 ? (
                  <tr><td colSpan={5} className="py-6 text-center text-slate-500">No bank entries in this financial year</td></tr>
                ) : recentBankTransactions.slice(0, 5).map(tx => (
                  <tr key={tx.id || tx._id || tx.voucherNo} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                    <td className="py-3 pl-1 pr-4 font-bold text-slate-800">{tx.voucherNo || '-'}</td>
                    <td className="py-3 pr-4 text-slate-500">{formatDate(tx.date)}</td>
                    <td className="py-3 pr-4 font-medium text-slate-600">{tx.voucherCategory || tx.transactionType || '-'}</td>
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
          <div className="mt-5 flex justify-center">
            <Link to="/app/transactions/bank" className="inline-flex items-center gap-1.5 text-[13px] font-bold transition-all hover:opacity-80 hover:gap-2.5" style={{ color: 'var(--primary, #1661F6)' }}>
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



