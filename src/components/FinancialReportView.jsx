import { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import {
  BarChart3, TrendingUp, TrendingDown, DollarSign, PieChart, Calendar,
  Clock, ArrowUpRight, ArrowDownRight, Wallet, ShieldAlert,
  Printer, Building2, Banknote, Settings2, ChevronRight, Zap,
  Package, Wrench, FlaskConical, Layers, BadgePercent, Briefcase,
  AlertTriangle, CheckCircle2, RefreshCw, Users, X,
} from 'lucide-react';
import { INVENTORY_EXPENSES_TABLE } from '../lib/inventory';

const PURCHASE_HISTORY_TABLE = 'inventory_purchase_history';
const FUND_WITHDRAWALS_TABLE = 'fund_withdrawals';
const ALLOC_KEY = 'mackyprint_profit_alloc';

const DEFAULT_ALLOC = { salary: 20, distribution: 50, retained: 30 };
const MATERIALS_FUND_PAYER = 'MackyPrint';

function loadAlloc() {
  try {
    const v = JSON.parse(localStorage.getItem(ALLOC_KEY) || '{}');
    const s = Number(v.salary ?? DEFAULT_ALLOC.salary);
    const d = Number(v.distribution ?? DEFAULT_ALLOC.distribution);
    const r = Number(v.retained ?? DEFAULT_ALLOC.retained);
    return { salary: s, distribution: d, retained: r };
  } catch { return { ...DEFAULT_ALLOC }; }
}

// Maps an expense category string to one of our fund buckets
function classifyExpense(category) {
  const c = (category || '').toLowerCase();
  if (['utilities', 'electricity', 'electric', 'internet', 'infrastructure', 'utility', 'power'].some(k => c.includes(k))) return 'utilities';
  if (['material', 'hardware', 'filament', 'supply', 'supplies', 'consumable'].some(k => c.includes(k))) return 'materials';
  if (['labor', 'salary', 'wage', 'contractor', 'worker', 'labour'].some(k => c.includes(k))) return 'labor';
  if (['printer', 'maintenance', 'repair', 'nozzle', 'hotend', 'ams', 'waste'].some(k => c.includes(k))) return 'printer';
  return 'other';
}

function isMaterialsFundPayer(payer) {
  return (payer || '').trim() === MATERIALS_FUND_PAYER;
}

export default function FinancialReportView() {
  const [loading, setLoading] = useState(true);
  const [alloc, setAlloc] = useState(loadAlloc);
  const [editingAlloc, setEditingAlloc] = useState(false);
  const [allocDraft, setAllocDraft] = useState({ salary: '', distribution: '', retained: '' });
  const [withdrawalFund, setWithdrawalFund] = useState(null);
  const [withdrawalDraft, setWithdrawalDraft] = useState(() => ({
    amount: '',
    withdrawnBy: 'MackyPrint',
    purpose: '',
    notes: '',
    date: new Date().toISOString().slice(0, 10),
  }));
  const [withdrawalSaving, setWithdrawalSaving] = useState(false);
  const [withdrawalError, setWithdrawalError] = useState('');
  const [reportData, setReportData] = useState({
    // Revenue
    revenue: 0, pendingRevenue: 0, orderCount: 0, avgOrderValue: 0,
    // Production cost components (collected from orders)
    col_materials: 0, col_utilities: 0, col_supplementary: 0,
    col_labor: 0, col_machineWear: 0, col_wasteBuffer: 0,
    totalProductionCost: 0, netProfit: 0,
    // Fund spending (from inventory_expenses + restocks)
    spent_utilities: 0, spent_materials: 0, spent_labor: 0, spent_printer: 0, spent_other: 0,
    withdrawals_utilities: 0, withdrawals_labor: 0, withdrawals_printer: 0,
    // All external expense transactions
    payerBreakdown: {}, recentTransactions: [],
    totalExternalExpenses: 0,
    // Charts
    monthlyProfitHistory: [],
    categoryBreakdown: {},
    wastedGramsTotal: 0, wastedCostTotal: 0,
  });

  useEffect(() => { fetchFinancialData(); }, []);

  const openAllocEditor = () => {
    setAllocDraft({ salary: String(alloc.salary), distribution: String(alloc.distribution), retained: String(alloc.retained) });
    setEditingAlloc(true);
  };

  const saveAlloc = () => {
    const s = Math.max(0, Number(allocDraft.salary) || 0);
    const d = Math.max(0, Number(allocDraft.distribution) || 0);
    const r = Math.max(0, Number(allocDraft.retained) || 0);
    const total = s + d + r;
    if (Math.round(total) !== 100) return; // guard
    const next = { salary: s, distribution: d, retained: r };
    setAlloc(next);
    localStorage.setItem(ALLOC_KEY, JSON.stringify(next));
    setEditingAlloc(false);
  };

  const draftTotal = Number(allocDraft.salary || 0) + Number(allocDraft.distribution || 0) + Number(allocDraft.retained || 0);
  const draftValid = Math.round(draftTotal) === 100;

  async function fetchFinancialData() {
    setLoading(true);
    try {
      const { data: allOrders, error: ordErr } = await supabase.from('orders').select('total_price, status, created_at, financial_breakdown');
      if (ordErr) throw ordErr;
      const orders = allOrders || [];
      const completedOrders = orders.filter(o => o.status === 'Completed');

      const { data: expenses } = await supabase.from(INVENTORY_EXPENSES_TABLE).select('*');
      const { data: restocks } = await supabase.from(PURCHASE_HISTORY_TABLE).select('*');

      let withdrawalList = [];
      try {
        const { data: withdrawals, error: withdrawalsErr } = await supabase.from(FUND_WITHDRAWALS_TABLE).select('*');
        if (withdrawalsErr) console.warn('Fund withdrawals unavailable:', withdrawalsErr);
        else withdrawalList = withdrawals || [];
      } catch (withdrawalsErr) {
        console.warn('Fund withdrawals unavailable:', withdrawalsErr);
      }

      const expList = expenses || [];
      const restockList = restocks || [];

      // ── Revenue ────────────────────────────────────────────────────────
      const revenue = orders.reduce((s, o) => {
        if (o.status === 'Cancelled') return s;
        const total = Number(o.total_price || 0);
        const paid = o.financial_breakdown?.amountPaid !== undefined
          ? Number(o.financial_breakdown.amountPaid)
          : (o.status === 'Completed' ? total : 0);
        return s + paid;
      }, 0);

      const pendingRevenue = orders.reduce((s, o) => {
        if (o.status === 'Completed' || o.status === 'Cancelled') return s;
        const total = Number(o.total_price || 0);
        const paid = o.financial_breakdown?.amountPaid !== undefined ? Number(o.financial_breakdown.amountPaid) : 0;
        return s + Math.max(0, total - paid);
      }, 0);

      // ── Production cost components collected from orders ───────────────
      const pick = (o, key) => o.status === 'Cancelled' ? 0 : Number(o.financial_breakdown?.[key] || 0);

      const col_materials     = orders.reduce((s, o) => s + pick(o, 'filamentCost'), 0);
      const col_utilities     = orders.reduce((s, o) => s + pick(o, 'electricityCost'), 0);
      const col_supplementary = orders.reduce((s, o) => s + pick(o, 'supplementaryMatCost'), 0);
      const col_labor         = orders.reduce((s, o) => s + pick(o, 'laborCost'), 0);
      const col_machineWear   = orders.reduce((s, o) => s + pick(o, 'wearTearCost'), 0);
      const col_wasteBuffer   = orders.reduce((s, o) => s + pick(o, 'failureBufferCost'), 0);

      const totalProductionCost = col_materials + col_utilities + col_supplementary + col_labor + col_machineWear + col_wasteBuffer;
      const netProfit = revenue - totalProductionCost;

      // ── Fund spending (external expenses + restocks) ───────────────────
      // Restocks only reduce the Materials fund when MackyPrint paid for them.
      const spent_materials_restocks = restockList.reduce((s, r) => (
        isMaterialsFundPayer(r.payer) ? s + (Number(r.purchase_cost) || 0) : s
      ), 0);

      // Expenses → classify by fund
      let spent_utilities = 0, spent_materials_exp = 0, spent_labor = 0, spent_printer = 0, spent_other = 0;
      expList.forEach(e => {
        const cost = Number(e.cost) || 0;
        const fund = classifyExpense(e.category);
        if (fund === 'utilities') spent_utilities += cost;
        else if (fund === 'materials' && isMaterialsFundPayer(e.payer)) spent_materials_exp += cost;
        else if (fund === 'labor') spent_labor += cost;
        else if (fund === 'printer') spent_printer += cost;
        else spent_other += cost;
      });
      const spent_materials = spent_materials_restocks + spent_materials_exp;

      const withdrawalsByFund = withdrawalList.reduce((acc, w) => {
        acc[w.fund] = (acc[w.fund] || 0) + (Number(w.amount) || 0);
        return acc;
      }, {});
      const withdrawals_utilities = withdrawalsByFund.utilities || 0;
      const withdrawals_labor = withdrawalsByFund.labor || 0;
      const withdrawals_printer = withdrawalsByFund.printer || 0;

      // ── Payer breakdown & recent transactions ─────────────────────────
      const allExpTx = [
        ...expList.map(e => ({ cost: Number(e.cost), payer: e.payer || 'Unknown', date: e.date, label: e.item_name, type: 'Expense', fund: classifyExpense(e.category) })),
        ...restockList.map(r => ({ cost: Number(r.purchase_cost), payer: r.payer || 'Unknown', date: r.date, label: r.item_label || r.filament_label, type: 'Restock', fund: 'materials' })),
      ];
      const totalExternalExpenses = allExpTx.reduce((s, e) => s + e.cost, 0);
      const payerBreakdown = allExpTx.reduce((acc, e) => { acc[e.payer] = (acc[e.payer] || 0) + e.cost; return acc; }, {});
      const recentTransactions = [...allExpTx].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 10);

      // ── Monthly profit trajectory ──────────────────────────────────────
      const now = new Date();
      const months = Array.from({ length: 6 }, (_, i) => {
        const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
        return { label: d.toLocaleDateString('en-US', { month: 'short' }), year: d.getFullYear(), monthNum: d.getMonth(), revenue: 0, cost: 0, profit: 0 };
      });
      orders.forEach(o => {
        if (o.status === 'Cancelled') return;
        const oDate = new Date(o.created_at);
        const m = months.find(m => m.year === oDate.getFullYear() && m.monthNum === oDate.getMonth());
        if (!m) return;
        const total = Number(o.total_price || 0);
        const paid = o.financial_breakdown?.amountPaid !== undefined ? Number(o.financial_breakdown.amountPaid) : (o.status === 'Completed' ? total : 0);
        const fb = o.financial_breakdown || {};
        const cost = ['filamentCost','electricityCost','supplementaryMatCost','laborCost','wearTearCost','failureBufferCost'].reduce((s, k) => s + Number(fb[k] || 0), 0);
        m.revenue += paid;
        m.cost += cost;
      });
      months.forEach(m => { m.profit = m.revenue - m.cost; });

      // ── Donut chart ───────────────────────────────────────────────────
      const categoryBreakdown = { 'Filament Restocks': 0, 'Materials & Hardware': 0, 'Waste (Failed Runs)': 0, 'Fund Withdrawals': 0, 'Other Expenses': 0 };
      expList.forEach(e => {
        const cat = (e.category || '').toLowerCase(); const cost = Number(e.cost) || 0;
        if (cat === 'waste') categoryBreakdown['Waste (Failed Runs)'] += cost;
        else if (cat === 'hardware' || cat === 'material') categoryBreakdown['Materials & Hardware'] += cost;
        else categoryBreakdown['Other Expenses'] += cost;
      });
      restockList.forEach(r => { categoryBreakdown['Filament Restocks'] += Number(r.purchase_cost) || 0; });
      withdrawalList.forEach(w => { categoryBreakdown['Fund Withdrawals'] += Number(w.amount) || 0; });

      // ── Wasted prints ─────────────────────────────────────────────────
      let wastedGramsTotal = 0, wastedCostTotal = 0;
      try {
        const { data: fl } = await supabase.from('failed_prints').select('weight_grams, estimated_cost');
        if (fl?.length) {
          wastedGramsTotal = fl.reduce((s, fp) => s + (Number(fp.weight_grams) || 0), 0);
          wastedCostTotal  = fl.reduce((s, fp) => s + (Number(fp.estimated_cost) || 0), 0);
        } else {
          wastedCostTotal = expList.filter(e => (e.category || '').toLowerCase() === 'waste').reduce((s, e) => s + (Number(e.cost) || 0), 0);
          wastedGramsTotal = wastedCostTotal / 0.7;
        }
      } catch (e) { console.warn(e); }

      setReportData({
        revenue, pendingRevenue,
        orderCount: completedOrders.length,
        avgOrderValue: completedOrders.length > 0 ? completedOrders.reduce((s, o) => s + (Number(o.total_price) || 0), 0) / completedOrders.length : 0,
        col_materials, col_utilities, col_supplementary, col_labor, col_machineWear, col_wasteBuffer,
        totalProductionCost, netProfit,
        spent_utilities, spent_materials, spent_labor, spent_printer, spent_other,
        withdrawals_utilities, withdrawals_labor, withdrawals_printer,
        payerBreakdown, recentTransactions, totalExternalExpenses,
        monthlyProfitHistory: months, categoryBreakdown,
        wastedGramsTotal, wastedCostTotal,
      });
    } catch (err) {
      console.error('Financial data error:', err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-zinc-900" />
      </div>
    );
  }

  const php  = (v) => `PHP ${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtN = (v) =>        Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const {
    revenue, pendingRevenue, orderCount, avgOrderValue,
    col_materials, col_utilities, col_supplementary, col_labor, col_machineWear, col_wasteBuffer,
    totalProductionCost, netProfit,
    spent_utilities, spent_materials, spent_labor, spent_printer, spent_other,
    withdrawals_utilities, withdrawals_labor, withdrawals_printer,
    payerBreakdown, recentTransactions, totalExternalExpenses,
    monthlyProfitHistory, categoryBreakdown, wastedGramsTotal, wastedCostTotal,
  } = reportData;

  // Fund balances
  const bal_utilities = col_utilities - spent_utilities - withdrawals_utilities;
  const bal_materials = (col_materials + col_supplementary) - spent_materials;
  const bal_labor     = col_labor - spent_labor - withdrawals_labor;
  const bal_printer   = (col_machineWear + col_wasteBuffer) - spent_printer - withdrawals_printer;

  // Profit allocations
  const netPos = Math.max(0, netProfit);
  const alloc_salary      = netPos * (alloc.salary      / 100);
  const alloc_distribution= netPos * (alloc.distribution/ 100);
  const alloc_retained    = netPos * (alloc.retained    / 100);
  const netMargin         = revenue > 0 ? (netProfit / revenue) * 100 : 0;

  const funds = [
    {
      key: 'utilities', canWithdraw: true, title: 'Utilities Fund', subtitle: 'Electricity · Internet · Infrastructure',
      icon: <Zap className="w-3.5 h-3.5 text-amber-600" />, headerBg: 'bg-amber-50', iconBg: 'bg-amber-100',
      balance: bal_utilities, collected: col_utilities, collectLabel: 'Utilities Collected',
      breakdown: [
        { label: 'Utilities Collected', value: col_utilities, positive: true },
        { label: 'Utilities Paid', value: spent_utilities, positive: false },
        { label: 'Withdrawals', value: withdrawals_utilities, positive: false },
      ],
    },
    {
      key: 'materials', title: 'Materials Fund', subtitle: 'Filament · Supplementary · Hardware',
      icon: <Package className="w-3.5 h-3.5 text-indigo-600" />, headerBg: 'bg-indigo-50', iconBg: 'bg-indigo-100',
      balance: bal_materials, collected: col_materials + col_supplementary, collectLabel: 'Materials + Supplementary',
      breakdown: [
        { label: 'Filament Collected', value: col_materials, positive: true },
        { label: 'Supplementary Collected', value: col_supplementary, positive: true },
        { label: 'Restocks & Purchases', value: spent_materials, positive: false },
      ],
    },
    {
      key: 'labor', canWithdraw: true, title: 'Labor Fund', subtitle: 'Workers · Contractors · Owner labor',
      icon: <Wrench className="w-3.5 h-3.5 text-sky-600" />, headerBg: 'bg-sky-50', iconBg: 'bg-sky-100',
      balance: bal_labor, collected: col_labor, collectLabel: 'Labor Collected',
      breakdown: [
        { label: 'Labor Collected', value: col_labor, positive: true },
        { label: 'Labor Paid', value: spent_labor, positive: false },
        { label: 'Withdrawals', value: withdrawals_labor, positive: false },
      ],
    },
    {
      key: 'printer', canWithdraw: true, title: 'Printer Fund', subtitle: 'Maintenance · Repairs · Replacement',
      icon: <Printer className="w-3.5 h-3.5 text-orange-600" />, headerBg: 'bg-orange-50', iconBg: 'bg-orange-100',
      balance: bal_printer, collected: col_machineWear + col_wasteBuffer, collectLabel: 'Wear + Waste Collected',
      breakdown: [
        { label: 'Machine Wear Collected', value: col_machineWear, positive: true },
        { label: 'Waste Buffer Collected', value: col_wasteBuffer, positive: true },
        { label: 'Printer Expenses Paid', value: spent_printer, positive: false },
        { label: 'Withdrawals', value: withdrawals_printer, positive: false },
      ],
    },
  ];

  const closeWithdrawalModal = () => {
    setWithdrawalFund(null);
    setWithdrawalError('');
    setWithdrawalSaving(false);
  };

  const openWithdrawalModal = (fund) => {
    setWithdrawalFund(fund);
    setWithdrawalError('');
    setWithdrawalDraft({
      amount: '',
      withdrawnBy: 'MackyPrint',
      purpose: '',
      notes: '',
      date: new Date().toISOString().slice(0, 10),
    });
  };

  const saveWithdrawal = async () => {
    if (!withdrawalFund) return;
    const amount = Number(withdrawalDraft.amount) || 0;
    if (amount <= 0) {
      setWithdrawalError('Enter an amount greater than zero.');
      return;
    }
    if (amount > Math.max(0, withdrawalFund.balance)) {
      setWithdrawalError('Withdrawal amount cannot exceed the current fund balance.');
      return;
    }

    setWithdrawalSaving(true);
    setWithdrawalError('');
    const { error } = await supabase.from(FUND_WITHDRAWALS_TABLE).insert({
      date: withdrawalDraft.date || new Date().toISOString(),
      fund: withdrawalFund.key,
      amount,
      withdrawn_by: withdrawalDraft.withdrawnBy.trim() || 'Unknown',
      purpose: withdrawalDraft.purpose.trim(),
      notes: withdrawalDraft.notes.trim(),
      updated_at: new Date().toISOString(),
    });

    if (error) {
      setWithdrawalError(error.message || 'Failed to save withdrawal.');
      setWithdrawalSaving(false);
      return;
    }

    closeWithdrawalModal();
    fetchFinancialData();
  };
  return (
    <div className="space-y-8 animate-in fade-in duration-500">

      {/* ── HEADER ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 mb-1">Cash Flow & Fund Allocation</h1>
          <p className="text-sm text-zinc-500 font-medium">Where your revenue was earned, reserved, and distributed.</p>
        </div>
        <button onClick={fetchFinancialData} className="p-2 hover:bg-zinc-100 rounded-full transition-colors text-zinc-500" title="Refresh">
          <RefreshCw className="w-5 h-5" />
        </button>
      </div>

      {/* ── DASHBOARD SUMMARY STRIP ─────────────────────────────────── */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-3">Fund Balances at a Glance</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: 'Utilities Fund',  value: bal_utilities, color: bal_utilities  >= 0 ? 'text-amber-700'  : 'text-rose-700', bg: bal_utilities  >= 0 ? 'bg-amber-50  border-amber-200'  : 'bg-rose-50 border-rose-200',  icon: <Zap className="w-3 h-3" /> },
            { label: 'Materials Fund',  value: bal_materials, color: bal_materials  >= 0 ? 'text-indigo-700' : 'text-rose-700', bg: bal_materials  >= 0 ? 'bg-indigo-50 border-indigo-200' : 'bg-rose-50 border-rose-200',  icon: <Package className="w-3 h-3" /> },
            { label: 'Labor Fund',      value: bal_labor,     color: bal_labor      >= 0 ? 'text-sky-700'    : 'text-rose-700', bg: bal_labor      >= 0 ? 'bg-sky-50    border-sky-200'    : 'bg-rose-50 border-rose-200',  icon: <Wrench className="w-3 h-3" /> },
            { label: 'Printer Fund',    value: bal_printer,   color: bal_printer    >= 0 ? 'text-orange-700' : 'text-rose-700', bg: bal_printer    >= 0 ? 'bg-orange-50 border-orange-200' : 'bg-rose-50 border-rose-200',  icon: <Printer className="w-3 h-3" /> },
            { label: 'Net Profit',      value: netProfit,     color: netProfit      >= 0 ? 'text-emerald-700': 'text-rose-700', bg: netProfit      >= 0 ? 'bg-emerald-50 border-emerald-200':'bg-rose-50 border-rose-200', icon: <TrendingUp className="w-3 h-3" /> },
            { label: 'Retained Earnings',value: alloc_retained,color:'text-zinc-800',                                           bg: 'bg-zinc-50 border-zinc-200',                                                            icon: <Building2 className="w-3 h-3" /> },
          ].map(({ label, value, color, bg, icon }) => (
            <div key={label} className={`border rounded-xl p-3.5 flex flex-col gap-1 ${bg}`}>
              <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-400 flex items-center gap-1">{icon}{label}</span>
              <span className={`text-sm font-black leading-tight ${color}`}>
                {value < 0 ? '−' : ''}PHP {fmtN(Math.abs(value))}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── 1. COST ALLOCATION FUNDS ────────────────────────────────── */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-3">Cost Allocation Funds</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {funds.map(fund => {
            const pos = fund.balance >= 0;
            const pct = fund.collected > 0 ? Math.min(100, (fund.balance / fund.collected) * 100) : 0;
            return (
              <div key={fund.key} className="bg-white border border-zinc-200 rounded-2xl shadow-sm overflow-hidden flex flex-col">
                {/* Card header */}
                <div className={`${fund.headerBg} px-4 py-3.5 border-b border-zinc-100 flex items-center gap-3`}>
                  <div className={`w-7 h-7 rounded-lg ${fund.iconBg} flex items-center justify-center shrink-0`}>
                    {fund.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-bold uppercase tracking-widest text-zinc-700 leading-tight">{fund.title}</p>
                    <p className="text-[9px] text-zinc-500 font-medium truncate">{fund.subtitle}</p>
                  </div>
                </div>
                {/* Balance spotlight */}
                <div className="px-4 pt-4 pb-2 text-center">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-400 mb-0.5">Current Balance</p>
                  <p className={`text-2xl font-black ${pos ? 'text-zinc-900' : 'text-rose-600'}`}>
                    {fund.balance < 0 ? '−' : ''}PHP {fmtN(Math.abs(fund.balance))}
                  </p>
                  {!pos && (
                    <span className="inline-flex items-center gap-1 mt-1 text-[9px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-100">
                      <AlertTriangle className="w-2.5 h-2.5" /> Overspent
                    </span>
                  )}
                </div>
                {/* Progress bar */}
                <div className="px-4 pb-3">
                  <div className="h-1.5 w-full bg-zinc-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-700 ${pos ? 'bg-emerald-500' : 'bg-rose-400'}`} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
                  </div>
                  <p className="text-[9px] text-zinc-400 font-semibold mt-1 text-right">{pct > 0 ? `${pct.toFixed(0)}% remaining` : 'fully deployed'}</p>
                </div>
                {/* Line items */}
                <div className="px-4 pb-4 space-y-1.5 border-t border-zinc-100 pt-3 flex-1">
                  {fund.breakdown.map(({ label, value, positive }) => (
                    <div key={label} className="flex justify-between items-center text-[11px]">
                      <span className="text-zinc-500 font-medium">{label}</span>
                      <span className={`font-bold ${positive ? 'text-emerald-700' : 'text-rose-600'}`}>
                        {positive ? '+' : '−'} PHP {fmtN(Math.abs(value))}
                      </span>
                    </div>
                  ))}
                  <div className="h-px bg-zinc-100 my-1" />
                  <div className="flex justify-between items-center text-[11px] font-bold">
                    <span className="text-zinc-700">Balance</span>
                    <span className={pos ? 'text-emerald-700' : 'text-rose-700'}>PHP {fmtN(fund.balance)}</span>
                  </div>
                  {fund.canWithdraw && (
                    <button
                      type="button"
                      onClick={() => openWithdrawalModal(fund)}
                      disabled={fund.balance <= 0}
                      className="mt-2 w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      title={fund.balance > 0 ? `Withdraw from ${fund.title}` : 'No balance available to withdraw'}
                    >
                      <Wallet className="w-3 h-3" /> Withdraw
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── 2. NET PROFIT CARD ──────────────────────────────────────── */}
      <div className="bg-white border border-zinc-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-100 bg-zinc-50 flex items-center gap-2">
          <BadgePercent className="w-4 h-4 text-zinc-500" />
          <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-800">Net Profit</h2>
          <span className="ml-auto text-[10px] text-zinc-400 font-semibold uppercase tracking-wider">Revenue − Total Cost</span>
        </div>
        {/* Cost breakdown + summary grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 divide-y lg:divide-y-0 lg:divide-x divide-zinc-100">
          {/* Left: cost line items */}
          <div className="p-6">
            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-4">Cost Breakdown</p>
            <div className="space-y-3">
              {[
                { label: 'Materials (Filament)', value: col_materials,     color: 'bg-indigo-400', icon: <Package className="w-3 h-3 text-white" /> },
                { label: 'Utilities',            value: col_utilities,     color: 'bg-amber-400',  icon: <Zap className="w-3 h-3 text-white" /> },
                { label: 'Supplementary',        value: col_supplementary, color: 'bg-teal-400',   icon: <Layers className="w-3 h-3 text-white" /> },
                { label: 'Labor',                value: col_labor,         color: 'bg-sky-400',    icon: <Wrench className="w-3 h-3 text-white" /> },
                { label: 'Machine Wear',         value: col_machineWear,   color: 'bg-orange-400', icon: <Printer className="w-3 h-3 text-white" /> },
                { label: 'Waste Buffer',         value: col_wasteBuffer,   color: 'bg-rose-400',   icon: <FlaskConical className="w-3 h-3 text-white" /> },
              ].map(({ label, value, color, icon }) => {
                const pct = totalProductionCost > 0 ? (value / totalProductionCost) * 100 : 0;
                return (
                  <div key={label} className="group">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-zinc-600 flex items-center gap-1.5">
                        <span className={`w-4 h-4 rounded flex items-center justify-center ${color}`}>{icon}</span>
                        {label}
                      </span>
                      <div className="text-right">
                        <span className="text-xs font-bold text-zinc-900">{php(value)}</span>
                        <span className="text-[9px] text-zinc-400 font-semibold ml-2">{pct.toFixed(1)}%</span>
                      </div>
                    </div>
                    <div className="h-1.5 w-full bg-zinc-100 rounded-full overflow-hidden">
                      <div className={`h-full ${color} rounded-full transition-all duration-700`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 pt-3 border-t border-zinc-100 flex justify-between text-sm font-bold">
              <span className="text-zinc-700">Total Cost</span>
              <span className="text-zinc-900">{php(totalProductionCost)}</span>
            </div>
          </div>
          {/* Right: summary KPIs */}
          <div className="p-6 flex flex-col justify-center">
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: 'Revenue', value: php(revenue), color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', sub: `${orderCount} orders` },
                { label: 'Total Cost', value: php(totalProductionCost), color: 'text-rose-700', bg: 'bg-rose-50', border: 'border-rose-200', sub: 'Production costs' },
                { label: 'Net Profit', value: php(netProfit), color: netProfit >= 0 ? 'text-indigo-700' : 'text-rose-700', bg: netProfit >= 0 ? 'bg-indigo-50' : 'bg-rose-50', border: netProfit >= 0 ? 'border-indigo-200' : 'border-rose-200', sub: 'After all costs', span2: true },
                { label: 'Net Margin', value: `${netMargin.toFixed(1)}%`, color: netMargin >= 40 ? 'text-emerald-700' : netMargin >= 20 ? 'text-amber-700' : 'text-rose-700', bg: 'bg-zinc-50', border: 'border-zinc-200', sub: 'Margin on revenue' },
              ].map(({ label, value, color, bg, border, sub, span2 }) => (
                <div key={label} className={`${bg} border ${border} rounded-xl p-4 flex flex-col gap-0.5 ${span2 ? 'col-span-2' : ''}`}>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">{label}</span>
                  <span className={`text-xl font-black ${color} leading-tight`}>{value}</span>
                  <span className="text-[9px] text-zinc-400 font-medium">{sub}</span>
                </div>
              ))}
            </div>
            {/* Flow arrow */}
            <div className="mt-5 pt-4 border-t border-zinc-100">
              <div className="flex items-center gap-2 text-[10px] text-zinc-400 font-semibold">
                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded font-bold">Revenue</span>
                <ChevronRight className="w-3 h-3" />
                <span className="px-2 py-0.5 bg-rose-100 text-rose-700 rounded font-bold">− Cost</span>
                <ChevronRight className="w-3 h-3" />
                <span className={`px-2 py-0.5 rounded font-bold ${netProfit >= 0 ? 'bg-indigo-100 text-indigo-700' : 'bg-rose-100 text-rose-700'}`}>Net Profit</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── 3. PROFIT ALLOCATION CARD ───────────────────────────────── */}
      <div className="bg-white border border-zinc-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-100 bg-zinc-50 flex items-center gap-2">
          <Users className="w-4 h-4 text-zinc-500" />
          <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-800">Profit Allocation</h2>
          <span className="ml-auto text-[10px] text-zinc-400 font-semibold">Salary + Distribution + Retained = 100%</span>
          <button
            onClick={openAllocEditor}
            className="ml-3 p-1.5 rounded-lg hover:bg-zinc-200 text-zinc-400 hover:text-zinc-700 transition-colors"
            title="Configure allocation"
          >
            <Settings2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {editingAlloc ? (
          /* Allocation editor */
          <div className="p-6">
            <p className="text-xs font-semibold text-zinc-600 mb-4">Set allocation percentages. Total must equal 100%.</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
              {[
                { key: 'salary',       label: 'Salary',           icon: <Wrench className="w-3.5 h-3.5 text-sky-600" />,     color: 'ring-sky-400' },
                { key: 'distribution', label: 'Distribution',     icon: <Banknote className="w-3.5 h-3.5 text-emerald-600" />,color: 'ring-emerald-400' },
                { key: 'retained',     label: 'Retained Earnings',icon: <Building2 className="w-3.5 h-3.5 text-indigo-600" />,color: 'ring-indigo-400' },
              ].map(({ key, label, icon, color }) => (
                <div key={key} className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 flex items-center gap-1.5">{icon}{label}</label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number" min="0" max="100"
                      value={allocDraft[key]}
                      onChange={e => setAllocDraft(prev => ({ ...prev, [key]: e.target.value }))}
                      className={`w-20 px-3 py-2 text-sm font-bold text-zinc-900 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 ${color}`}
                    />
                    <span className="text-zinc-500 font-bold">%</span>
                  </div>
                  <p className="text-[10px] text-zinc-400">= PHP {fmtN(netPos * (Number(allocDraft[key] || 0) / 100))}</p>
                </div>
              ))}
            </div>
            <div className={`flex items-center gap-2 text-xs font-bold mb-4 px-3 py-2 rounded-lg ${draftValid ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
              {draftValid ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
              Total: {draftTotal.toFixed(1)}% {draftValid ? '— Ready to save' : `— Must equal 100% (${(100 - draftTotal).toFixed(1)}% remaining)`}
            </div>
            <div className="flex gap-2">
              <button onClick={saveAlloc} disabled={!draftValid} className="px-4 py-2 bg-zinc-900 text-white text-xs font-bold rounded-lg hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">Save Allocation</button>
              <button onClick={() => setEditingAlloc(false)} className="px-4 py-2 bg-zinc-100 text-zinc-700 text-xs font-bold rounded-lg hover:bg-zinc-200 transition-colors">Cancel</button>
            </div>
          </div>
        ) : (
          /* Allocation display */
          <div className="p-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-6">
              {[
                { label: 'Salary',            pct: alloc.salary,       amount: alloc_salary,       icon: <Wrench className="w-4 h-4 text-sky-600" />,     bg: 'bg-sky-50',     border: 'border-sky-200',     color: 'text-sky-700',     bar: 'bg-sky-400',     sub: 'Owner / worker compensation' },
                { label: 'Distribution',      pct: alloc.distribution, amount: alloc_distribution, icon: <Banknote className="w-4 h-4 text-emerald-600" />, bg: 'bg-emerald-50', border: 'border-emerald-200', color: 'text-emerald-700', bar: 'bg-emerald-500', sub: 'Owner profit withdrawal' },
                { label: 'Retained Earnings', pct: alloc.retained,     amount: alloc_retained,     icon: <Building2 className="w-4 h-4 text-indigo-600" />, bg: 'bg-indigo-50',  border: 'border-indigo-200',  color: 'text-indigo-700',  bar: 'bg-indigo-500', sub: 'Reinvested in business' },
              ].map(({ label, pct, amount, icon, bg, border, color, bar, sub }) => (
                <div key={label} className={`${bg} border ${border} rounded-xl p-5 flex flex-col gap-2`}>
                  <div className="flex items-center gap-2">
                    <div className={`w-7 h-7 rounded-lg bg-white flex items-center justify-center border ${border}`}>{icon}</div>
                    <span className="text-xs font-bold uppercase tracking-widest text-zinc-700">{label}</span>
                    <span className={`ml-auto text-xs font-black px-1.5 py-0.5 rounded ${color} bg-white border ${border}`}>{pct}%</span>
                  </div>
                  <p className={`text-2xl font-black ${color}`}>PHP {fmtN(amount)}</p>
                  <p className="text-[10px] text-zinc-500 font-medium">{sub}</p>
                  <div className="h-1.5 w-full bg-white rounded-full overflow-hidden border border-white/50 mt-1">
                    <div className={`h-full ${bar} rounded-full`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              ))}
            </div>

            {/* Net Profit flow */}
            <div className="border border-zinc-100 rounded-xl p-4 bg-zinc-50">
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-3">Allocation Flow</p>
              <div className="flex flex-col sm:flex-row items-stretch gap-0">
                {[
                  { label: 'Net Profit',        value: netProfit,         sub: 'Starting point',          badge: null,          bg: 'bg-zinc-100',     text: 'text-zinc-900' },
                  { label: 'Salary',            value: alloc_salary,      sub: `${alloc.salary}%`,        badge: '→ pay',       bg: 'bg-sky-100',      text: 'text-sky-800' },
                  { label: 'Distribution',      value: alloc_distribution,sub: `${alloc.distribution}%`, badge: '→ withdraw',  bg: 'bg-emerald-100',  text: 'text-emerald-800' },
                  { label: 'Retained',          value: alloc_retained,    sub: `${alloc.retained}%`,     badge: '→ reinvest',  bg: 'bg-indigo-100',   text: 'text-indigo-800' },
                ].map((step, i, arr) => (
                  <div key={step.label} className="flex sm:flex-col flex-row items-center flex-1">
                    <div className={`flex-1 sm:w-full rounded-xl ${step.bg} px-3 py-2.5 flex flex-col items-center text-center gap-0.5`}>
                      {step.badge && <span className="text-[8px] font-black text-zinc-400 uppercase tracking-widest">{step.badge}</span>}
                      <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-500">{step.label}</span>
                      <span className={`text-base font-black ${step.text}`}>PHP {fmtN(Math.abs(step.value))}</span>
                      <span className="text-[9px] text-zinc-400">{step.sub}</span>
                    </div>
                    {i < arr.length - 1 && <ChevronRight className="w-3.5 h-3.5 text-zinc-300 shrink-0 mx-1 sm:rotate-90 sm:my-1" />}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── SECONDARY KPIs ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Pending Revenue" value={php(pendingRevenue)} sub="Orders in pipeline" icon={<Clock className="w-5 h-5 text-amber-500" />} highlight />
        <StatCard label="Avg Order Value" value={php(avgOrderValue)} sub={`${orderCount} completed`} icon={<TrendingUp className="w-5 h-5 text-emerald-500" />} />
        <StatCard label="Net Margin" value={`${netMargin.toFixed(1)}%`} sub="On total revenue" icon={<BadgePercent className="w-5 h-5 text-indigo-500" />} />
        <StatCard label="External Outflows" value={php(totalExternalExpenses)} sub="Restocks & expenses" icon={<TrendingDown className="w-5 h-5 text-rose-500" />} />
      </div>

      {/* ── CHARTS ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <ProfitTrendChart months={monthlyProfitHistory} />
        <div className="space-y-6">
          <SpendingDonutChart data={categoryBreakdown} total={totalExternalExpenses} />
          <div className="bg-white border border-zinc-200 rounded-xl p-4 shadow-sm flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-rose-50 border border-rose-100 flex items-center justify-center shrink-0">
                <ShieldAlert className="w-5 h-5 animate-pulse text-rose-500" />
              </div>
              <div>
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block">Failed Print Waste Loss</span>
                <span className="text-xs text-zinc-500 font-semibold leading-tight block">Cumulative material loss in print farm</span>
              </div>
            </div>
            <div className="text-right">
              <span className="text-sm font-black text-rose-600 block">PHP {fmtN(wastedCostTotal)}</span>
              <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block">{Math.round(wastedGramsTotal).toLocaleString()}g plastic lost</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── PAYER BREAKDOWN + RECENT OUTFLOWS ───────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <section className="bg-white border border-zinc-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
          <div className="px-6 py-5 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/50">
            <div className="flex items-center gap-2">
              <PieChart className="w-4 h-4 text-zinc-500" />
              <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-800">Spending by Payer</h2>
            </div>
            <Wallet className="w-4 h-4 text-zinc-300" />
          </div>
          <div className="p-6 flex-1 space-y-5">
            {Object.entries(payerBreakdown).length === 0 ? (
              <div className="text-center py-12 text-zinc-400 text-sm">No spending data found.</div>
            ) : (
              Object.entries(payerBreakdown).sort(([, a], [, b]) => b - a).map(([payer, amount]) => {
                const pct = totalExternalExpenses > 0 ? (amount / totalExternalExpenses) * 100 : 0;
                return (
                  <div key={payer} className="group">
                    <div className="flex justify-between items-end mb-1.5">
                      <div>
                        <span className="text-sm font-bold text-zinc-900 block">{payer}</span>
                        <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-tight">Accountable Spending</span>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-black text-zinc-900">{php(amount)}</span>
                        <span className="text-[10px] text-zinc-400 block font-medium">{pct.toFixed(1)}%</span>
                      </div>
                    </div>
                    <div className="h-2 w-full bg-zinc-100 rounded-full overflow-hidden">
                      <div className="h-full bg-zinc-900 transition-all duration-1000 ease-out group-hover:bg-indigo-600" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <div className="px-6 py-4 bg-zinc-50 border-t border-zinc-100 flex justify-between text-xs">
            <span className="text-zinc-500 font-medium">Total External Outflows</span>
            <span className="font-bold text-zinc-900">{php(totalExternalExpenses)}</span>
          </div>
        </section>

        <section className="bg-white border border-zinc-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
          <div className="px-6 py-5 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/50">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-zinc-500" />
              <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-800">Recent Outflows</h2>
            </div>
            <ArrowDownRight className="w-4 h-4 text-rose-300" />
          </div>
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-zinc-50/30 border-b border-zinc-100">
                  <th className="px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-zinc-400">Date</th>
                  <th className="px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-zinc-400">Item</th>
                  <th className="px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-zinc-400">Fund</th>
                  <th className="px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-zinc-400 text-right">Amt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50">
                {recentTransactions.map((tx, i) => {
                  const fundColors = { utilities: 'bg-amber-100 text-amber-700', materials: 'bg-indigo-100 text-indigo-700', labor: 'bg-sky-100 text-sky-700', printer: 'bg-orange-100 text-orange-700', other: 'bg-zinc-100 text-zinc-600' };
                  const fc = fundColors[tx.fund] || fundColors.other;
                  return (
                    <tr key={i} className="hover:bg-zinc-50/50 transition-colors">
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <span className="text-xs font-bold text-zinc-700 block">{new Date(tx.date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}</span>
                        <span className="text-[10px] text-zinc-400 uppercase font-medium">{tx.type}</span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="text-xs font-semibold text-zinc-900 block truncate max-w-[140px]">{tx.label}</span>
                        <span className="text-[10px] text-zinc-500 italic">by {tx.payer}</span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${fc}`}>{tx.fund}</span>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <span className="text-xs font-black text-rose-600">−{php(tx.cost)}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {withdrawalFund && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white border border-zinc-200 shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-zinc-100 bg-zinc-50 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-white border border-zinc-200 flex items-center justify-center">
                <Wallet className="w-4 h-4 text-zinc-700" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-900">Record Withdrawal</h2>
                <p className="text-xs text-zinc-500 truncate">{withdrawalFund.title} - available {php(Math.max(0, withdrawalFund.balance))}</p>
              </div>
              <button type="button" onClick={closeWithdrawalModal} className="p-1.5 rounded-lg hover:bg-zinc-200 text-zinc-500" title="Close">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Amount</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={withdrawalDraft.amount}
                    onChange={e => setWithdrawalDraft(prev => ({ ...prev, amount: e.target.value }))}
                    className="w-full px-3 py-2 text-sm font-bold text-zinc-900 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900"
                    placeholder="0.00"
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Date</span>
                  <input
                    type="date"
                    value={withdrawalDraft.date}
                    onChange={e => setWithdrawalDraft(prev => ({ ...prev, date: e.target.value }))}
                    className="w-full px-3 py-2 text-sm font-semibold text-zinc-900 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900"
                  />
                </label>
              </div>

              <label className="flex flex-col gap-1.5">
                <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Withdrawn By</span>
                <input
                  type="text"
                  value={withdrawalDraft.withdrawnBy}
                  onChange={e => setWithdrawalDraft(prev => ({ ...prev, withdrawnBy: e.target.value }))}
                  className="w-full px-3 py-2 text-sm font-semibold text-zinc-900 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900"
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Purpose</span>
                <input
                  type="text"
                  value={withdrawalDraft.purpose}
                  onChange={e => setWithdrawalDraft(prev => ({ ...prev, purpose: e.target.value }))}
                  className="w-full px-3 py-2 text-sm font-semibold text-zinc-900 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900"
                  placeholder="Transfer, payout, cash draw"
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Notes</span>
                <textarea
                  rows="3"
                  value={withdrawalDraft.notes}
                  onChange={e => setWithdrawalDraft(prev => ({ ...prev, notes: e.target.value }))}
                  className="w-full px-3 py-2 text-sm text-zinc-900 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900 resize-none"
                />
              </label>

              {withdrawalError && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
                  {withdrawalError}
                </div>
              )}
            </div>

            <div className="px-5 py-4 bg-zinc-50 border-t border-zinc-100 flex justify-end gap-2">
              <button type="button" onClick={closeWithdrawalModal} className="px-4 py-2 rounded-lg bg-white border border-zinc-200 text-xs font-bold text-zinc-700 hover:bg-zinc-100 transition-colors">Cancel</button>
              <button type="button" onClick={saveWithdrawal} disabled={withdrawalSaving} className="px-4 py-2 rounded-lg bg-zinc-900 text-white text-xs font-bold hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                {withdrawalSaving ? 'Saving...' : 'Save Withdrawal'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Chart sub-components ──────────────────────────────────────────────────────

function SpendingDonutChart({ data, total }) {
  const cats = Object.entries(data).filter(([, v]) => v > 0);
  if (!total || !cats.length) return (
    <div className="bg-white border border-zinc-200 rounded-xl p-6 shadow-sm flex items-center justify-center h-[180px]">
      <p className="text-xs text-zinc-400 italic">No external outflows logged yet.</p>
    </div>
  );
  const r = 35, c = 219.91;
  let acc = 0;
  const pal = { 'Filament Restocks': '#4f46e5', 'Materials & Hardware': '#10b981', 'Waste (Failed Runs)': '#f43f5e', 'Fund Withdrawals': '#0ea5e9', 'Other Expenses': '#a1a1aa' };
  return (
    <div className="flex flex-col sm:flex-row items-center gap-6 p-5 bg-white border border-zinc-200 rounded-xl shadow-sm">
      <div className="relative w-24 h-24 flex items-center justify-center shrink-0">
        <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
          <circle cx="50" cy="50" r={r} fill="none" stroke="#f4f4f5" strokeWidth="8" />
          {cats.map(([name, cost], i) => {
            const share = cost / total;
            const dLen = share * c;
            const off = c - dLen + (acc / 100) * c;
            acc -= share * 100;
            return <circle key={i} cx="50" cy="50" r={r} fill="none" stroke={pal[name] || '#6366f1'} strokeWidth="8" strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round" className="transition-all duration-700" />;
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-[7px] font-bold text-zinc-400 uppercase">Outflows</span>
          <span className="text-[9px] font-black text-zinc-900">PHP {Math.round(total).toLocaleString()}</span>
        </div>
      </div>
      <div className="space-y-1.5 flex-1 w-full">
        {cats.map(([name, cost], i) => (
          <div key={i} className="flex justify-between items-center">
            <div className="flex items-center gap-1.5 overflow-hidden">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: pal[name] || '#6366f1' }} />
              <span className="font-semibold text-zinc-500 truncate text-[11px]">{name}</span>
            </div>
            <div className="text-right shrink-0">
              <span className="font-bold text-zinc-900 text-[11px]">PHP {cost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
              <span className="text-[8px] text-zinc-400 block font-bold">{((cost / total) * 100).toFixed(0)}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProfitTrendChart({ months }) {
  const [hov, setHov] = useState(null);
  if (!months?.length) return (
    <div className="bg-white border border-zinc-200 rounded-xl p-6 shadow-sm flex items-center justify-center h-[230px]">
      <p className="text-xs text-zinc-400 italic text-center">Awaiting completed order transactions.</p>
    </div>
  );
  const W = 500, H = 150, pX = 40, pY = 25;
  const profits = months.map(m => m.profit);
  const maxV = Math.max(...profits, 1500), minV = Math.min(...profits, -500), rng = maxV - minV;
  const pts = months.map((m, i) => ({ x: pX + (i * (W - pX * 2)) / (months.length - 1), y: H - pY - ((m.profit - minV) * (H - pY * 2)) / (rng || 1), ...m }));
  const line = pts.map(p => `${p.x},${p.y}`).join(' ');
  const area = `${pts[0].x},${H - pY} ${line} ${pts[pts.length - 1].x},${H - pY}`;
  return (
    <div className="relative bg-white border border-zinc-200 rounded-xl p-5 shadow-sm flex flex-col justify-between h-[242px]">
      <div>
        <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-400 mb-0.5">Net Profit Trajectory</h3>
        <p className="text-[9px] text-zinc-400 font-bold uppercase tracking-widest">Month-over-month performance</p>
      </div>
      <div className="relative mt-2 flex-1 flex items-center justify-center">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full overflow-visible">
          <defs>
            <linearGradient id="pg2" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6366f1" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
            </linearGradient>
            <filter id="ps2"><feDropShadow dx="0" dy="4" stdDeviation="3" floodColor="#6366f1" floodOpacity="0.2" /></filter>
          </defs>
          {minV < 0 && <line x1={pX} y1={H - pY - ((0 - minV) * (H - pY * 2)) / rng} x2={W - pX} y2={H - pY - ((0 - minV) * (H - pY * 2)) / rng} stroke="#f4f4f5" strokeWidth="2" strokeDasharray="4 4" />}
          <path d={`M ${area} Z`} fill="url(#pg2)" />
          <polyline fill="none" stroke="#6366f1" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" points={line} filter="url(#ps2)" />
          {pts.map((p, i) => (
            <g key={i}>
              <circle cx={p.x} cy={p.y} r={hov?.label === p.label ? '6' : '4'} fill="#fff" stroke="#6366f1" strokeWidth="2.5" onMouseEnter={() => setHov(p)} onMouseLeave={() => setHov(null)} className="cursor-pointer transition-all duration-150" />
              <text x={p.x} y={H - 5} textAnchor="middle" className="text-[9px] font-bold fill-zinc-400 tracking-tighter uppercase">{p.label}</text>
            </g>
          ))}
        </svg>
        {hov && (
          <div className="absolute top-0 right-0 bg-zinc-950 text-white text-[10px] font-bold px-2.5 py-1.5 rounded border border-zinc-800 shadow-xl flex flex-col animate-in fade-in zoom-in-95 duration-100 leading-none">
            <span className="text-[7px] text-zinc-400 uppercase tracking-widest font-black mb-1">{hov.label}</span>
            <span className={hov.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}>PHP {hov.profit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, icon, highlight }) {
  return (
    <div className={`bg-white border rounded-xl p-5 shadow-sm flex flex-col gap-2 group hover:shadow-md transition-all ${highlight ? 'ring-2 ring-indigo-500/10 border-zinc-200' : 'border-zinc-200'}`}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{label}</span>
        <div className="p-1.5 bg-zinc-50 rounded-lg group-hover:scale-110 transition-transform">{icon}</div>
      </div>
      <div className="text-xl font-black text-zinc-900 leading-tight">{value}</div>
      <div className="text-xs text-zinc-400 font-medium">{sub}</div>
    </div>
  );
}
