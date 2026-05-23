import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { 
  BarChart3, 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Users, 
  PieChart, 
  Calendar,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  Wallet,
  ShieldAlert,
  AlertCircle
} from 'lucide-react';
import { INVENTORY_EXPENSES_TABLE } from '../lib/inventory';

const PURCHASE_HISTORY_TABLE = 'inventory_purchase_history';

export default function FinancialReportView() {
  const [loading, setLoading] = useState(true);
  const [reportData, setReportData] = useState({
    revenue: 0,
    expenses: 0,
    netIncome: 0,
    pendingRevenue: 0,
    payerBreakdown: {},
    recentTransactions: [],
    orderCount: 0,
    avgOrderValue: 0,
    monthlyProfitHistory: [],
    categoryBreakdown: {},
    wastedGramsTotal: 0,
    wastedCostTotal: 0
  });

  useEffect(() => {
    fetchFinancialData();
  }, []);

  async function fetchFinancialData() {
    setLoading(true);
    try {
      // 1. Fetch Orders (Both Completed and Pending)
      const { data: allOrders, error: ordersError } = await supabase
        .from('orders')
        .select('total_price, status, created_at');

      if (ordersError) throw ordersError;

      const completedOrders = allOrders.filter(o => o.status === 'Completed');
      const pendingOrders = allOrders.filter(o => o.status !== 'Completed' && o.status !== 'Cancelled');

      // 2. Fetch Expenses
      const { data: expenses, error: expensesError } = await supabase
        .from(INVENTORY_EXPENSES_TABLE)
        .select('*');

      if (expensesError) throw expensesError;

      // 3. Fetch Purchase History (Restocks)
      const { data: restocks, error: restocksError } = await supabase
        .from(PURCHASE_HISTORY_TABLE)
        .select('*');

      if (restocksError) throw restocksError;

      // Calculations
      const totalRevenue = (completedOrders || []).reduce((sum, o) => sum + (Number(o.total_price) || 0), 0);
      const totalPendingRevenue = (pendingOrders || []).reduce((sum, o) => sum + (Number(o.total_price) || 0), 0);
      
      const totalExpensesList = [
        ...(expenses || []).map(e => ({ cost: Number(e.cost), payer: e.payer || 'Unknown', date: e.date, label: e.item_name, type: 'Expense' })),
        ...(restocks || []).map(r => ({ cost: Number(r.purchase_cost), payer: r.payer || 'Unknown', date: r.date, label: r.item_label || r.filament_label, type: 'Restock' }))
      ];

      const totalExpenses = totalExpensesList.reduce((sum, e) => sum + e.cost, 0);
      const netIncome = totalRevenue - totalExpenses;

      const payerBreakdown = totalExpensesList.reduce((acc, e) => {
        const payer = e.payer || 'Unknown';
        acc[payer] = (acc[payer] || 0) + e.cost;
        return acc;
      }, {});

      // Sort recent transactions
      const recentTransactions = totalExpensesList
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 10);

      // Track 4: Calculate monthly profit trajectory for last 6 months
      const months = [];
      const now = new Date();
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        months.push({
          label: d.toLocaleDateString('en-US', { month: 'short' }),
          year: d.getFullYear(),
          monthNum: d.getMonth(),
          revenue: 0,
          expense: 0,
          profit: 0
        });
      }

      (completedOrders || []).forEach(o => {
        const oDate = new Date(o.created_at);
        const match = months.find(m => m.year === oDate.getFullYear() && m.monthNum === oDate.getMonth());
        if (match) {
          match.revenue += Number(o.total_price) || 0;
        }
      });

      totalExpensesList.forEach(e => {
        const eDate = new Date(e.date);
        const match = months.find(m => m.year === eDate.getFullYear() && m.monthNum === eDate.getMonth());
        if (match) {
          match.expense += Number(e.cost) || 0;
        }
      });

      months.forEach(m => {
        m.profit = m.revenue - m.expense;
      });

      // Calculate spending categories for Donut Chart
      const categoryBreakdown = {
        'Filament Restocks': 0,
        'Materials & Hardware': 0,
        'Waste (Failed Runs)': 0,
        'Other Expenses': 0
      };

      (expenses || []).forEach(e => {
        const category = e.category || 'Other';
        const cost = Number(e.cost) || 0;
        if (category.toLowerCase() === 'waste') {
          categoryBreakdown['Waste (Failed Runs)'] += cost;
        } else if (category.toLowerCase() === 'hardware' || category.toLowerCase() === 'material') {
          categoryBreakdown['Materials & Hardware'] += cost;
        } else {
          categoryBreakdown['Other Expenses'] += cost;
        }
      });

      (restocks || []).forEach(r => {
        const cost = Number(r.purchase_cost) || 0;
        categoryBreakdown['Filament Restocks'] += cost;
      });

      // Calculate total failed print weight and cost from DB
      let wastedGramsTotal = 0;
      let wastedCostTotal = 0;
      try {
        const { data: failedList } = await supabase.from('failed_prints').select('weight_grams, estimated_cost');
        if (failedList && failedList.length > 0) {
          wastedGramsTotal = failedList.reduce((sum, fp) => sum + (Number(fp.weight_grams) || 0), 0);
          wastedCostTotal = failedList.reduce((sum, fp) => sum + (Number(fp.estimated_cost) || 0), 0);
        } else {
          // Fallback based on expenses Waste category
          const loggedWasteExpenses = (expenses || []).filter(e => (e.category || '').toLowerCase() === 'waste');
          wastedCostTotal = loggedWasteExpenses.reduce((sum, e) => sum + (Number(e.cost) || 0), 0);
          wastedGramsTotal = wastedCostTotal / 0.7; // Fallback g estimate
        }
      } catch (err) {
        console.warn(err);
      }

      setReportData({
        revenue: totalRevenue,
        expenses: totalExpenses,
        netIncome,
        pendingRevenue: totalPendingRevenue,
        payerBreakdown,
        recentTransactions,
        orderCount: (completedOrders || []).length,
        avgOrderValue: (completedOrders || []).length > 0 ? totalRevenue / completedOrders.length : 0,
        monthlyProfitHistory: months,
        categoryBreakdown,
        wastedGramsTotal,
        wastedCostTotal
      });

    } catch (error) {
      console.error('Failed to fetch financial data:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-zinc-900"></div>
      </div>
    );
  }

  const formatPHP = (val) => `PHP ${Number(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 mb-1 text-premium">Financial Performance</h1>
          <p className="text-sm text-zinc-500 font-medium">Comprehensive breakdown of revenue, expenses, and payer accountability.</p>
        </div>
        <button 
          onClick={fetchFinancialData}
          className="p-2 hover:bg-zinc-100 rounded-full transition-colors text-zinc-500"
          title="Refresh Data"
        >
          <Calendar className="w-5 h-5" />
        </button>
      </div>

      {/* Main KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          label="Total Revenue" 
          value={formatPHP(reportData.revenue)} 
          sub={`${reportData.orderCount} completed orders`}
          icon={<TrendingUp className="w-5 h-5 text-emerald-500" />}
          trend="+12% from last month" // Placeholder trend
          trendColor="text-emerald-600"
        />
        <StatCard 
          label="Total Expenses" 
          value={formatPHP(reportData.expenses)} 
          sub="Restocks & other costs"
          icon={<TrendingDown className="w-5 h-5 text-rose-500" />}
          trend="+5% from last month"
          trendColor="text-rose-600"
        />
        <StatCard 
          label="Pending Revenue" 
          value={formatPHP(reportData.pendingRevenue)} 
          sub="Orders in pipeline"
          icon={<Clock className="w-5 h-5 text-amber-500" />}
          highlight={true}
        />
        <StatCard 
          label="Net Income" 
          value={formatPHP(reportData.netIncome)} 
          sub="Profit after all costs"
          icon={<DollarSign className="w-5 h-5 text-indigo-500" />}
          highlight={reportData.netIncome >= 0}
        />
      </div>

      {/* Track 4: Custom Interactive SVG Charts & Waste widgets */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Profit Trajectory Glowing Line/Area spline */}
        <ProfitTrendChart months={reportData.monthlyProfitHistory} />

        {/* Spending Category Donut Chart & Waste Card */}
        <div className="space-y-6">
          <SpendingDonutChart data={reportData.categoryBreakdown} total={reportData.expenses} />
          
          <div className="bg-white border border-zinc-200 rounded-xl p-4 shadow-sm flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-500 shrink-0">
                <ShieldAlert className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block">Failed Print waste loss</span>
                <span className="text-xs text-zinc-500 font-semibold leading-tight block">Cumulative material loss in print farm</span>
              </div>
            </div>
            
            <div className="text-right">
              <span className="text-sm font-black text-rose-600 block">
                PHP {reportData.wastedCostTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block">
                {Math.round(reportData.wastedGramsTotal).toLocaleString()}g plastic lost
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Payer Breakdown */}
        <section className="bg-white border border-zinc-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
          <div className="px-6 py-5 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/50">
            <div className="flex items-center gap-2">
              <PieChart className="w-4 h-4 text-zinc-500" />
              <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-800">Spending by Payer</h2>
            </div>
            <Wallet className="w-4 h-4 text-zinc-300" />
          </div>
          <div className="p-6 flex-1">
            <div className="space-y-6">
              {Object.entries(reportData.payerBreakdown).length === 0 ? (
                <div className="text-center py-12 text-zinc-400 text-sm">No spending data found.</div>
              ) : (
                Object.entries(reportData.payerBreakdown)
                  .sort(([, a], [, b]) => b - a)
                  .map(([payer, amount]) => {
                    const percentage = (amount / reportData.expenses) * 100;
                    return (
                      <div key={payer} className="group">
                        <div className="flex justify-between items-end mb-2">
                          <div>
                            <span className="text-sm font-bold text-zinc-900 block">{payer}</span>
                            <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-tight">Accountable Spending</span>
                          </div>
                          <div className="text-right">
                            <span className="text-sm font-black text-zinc-900">{formatPHP(amount)}</span>
                            <span className="text-[10px] text-zinc-400 block font-medium">{percentage.toFixed(1)}% of total</span>
                          </div>
                        </div>
                        <div className="h-2 w-full bg-zinc-100 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-zinc-900 transition-all duration-1000 ease-out group-hover:bg-indigo-600" 
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    );
                  })
              )}
            </div>
          </div>
          <div className="px-6 py-4 bg-zinc-50 border-t border-zinc-100">
            <div className="flex justify-between text-xs">
              <span className="text-zinc-500 font-medium">Total Accountable</span>
              <span className="font-bold text-zinc-900">{formatPHP(reportData.expenses)}</span>
            </div>
          </div>
        </section>

        {/* Recent Financial Events */}
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
                  <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-widest text-zinc-400">Date</th>
                  <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-widest text-zinc-400">Item / Category</th>
                  <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-widest text-zinc-400 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50">
                {reportData.recentTransactions.map((tx, idx) => (
                  <tr key={idx} className="hover:bg-zinc-50/50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-xs font-bold text-zinc-700 block">{new Date(tx.date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}</span>
                      <span className="text-[10px] text-zinc-400 uppercase font-medium">{tx.type}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-semibold text-zinc-900 block truncate max-w-[180px]">{tx.label}</span>
                      <span className="text-[10px] text-zinc-500 font-medium italic">Paid by {tx.payer}</span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="text-sm font-black text-rose-600">-{formatPHP(tx.cost)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* Summary Footer Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-zinc-900 text-white p-6 rounded-xl shadow-lg shadow-zinc-200">
          <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-1">Avg Order Value</div>
          <div className="text-xl font-black">{formatPHP(reportData.avgOrderValue)}</div>
        </div>
        <div className="bg-white border border-zinc-200 p-6 rounded-xl shadow-sm">
          <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1">Efficiency Ratio</div>
          <div className="text-xl font-black text-zinc-900">
            {reportData.revenue > 0 ? ((reportData.netIncome / reportData.revenue) * 100).toFixed(1) : 0}%
          </div>
        </div>
        <div className="bg-white border border-zinc-200 p-6 rounded-xl shadow-sm">
          <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1">Total Orders</div>
          <div className="text-xl font-black text-zinc-900">{reportData.orderCount}</div>
        </div>
        <div className="bg-white border border-zinc-200 p-6 rounded-xl shadow-sm">
          <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1">ROI Score</div>
          <div className="text-xl font-black text-zinc-900">
            {reportData.expenses > 0 
              ? `${((reportData.netIncome / reportData.expenses) * 100).toFixed(1)}%` 
              : '0.0%'}
          </div>
        </div>
      </div>
    </div>
  );
}

// Track 4: Spending categories visual SVG donut chart
function SpendingDonutChart({ data, total }) {
  const categories = Object.entries(data).filter(([, val]) => val > 0);
  
  if (total <= 0 || categories.length === 0) {
    return (
      <div className="bg-white border border-zinc-200 rounded-xl p-6 shadow-sm flex flex-col justify-center items-center h-[230px] text-center">
        <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-400 mb-2">Spending Categories</h3>
        <div className="text-zinc-400 text-xs italic">No outflows logged yet. Log spool restocks or expenses first.</div>
      </div>
    );
  }

  const r = 35;
  const c = 219.91; // 2 * pi * 35
  let accumulatedPercent = 0;

  const colorPalette = {
    'Filament Restocks': '#4f46e5',   // Indigo
    'Materials & Hardware': '#10b981', // Emerald
    'Waste (Failed Runs)': '#f43f5e',  // Rose
    'Other Expenses': '#a1a1aa'       // Zinc
  };

  return (
    <div className="flex flex-col sm:flex-row items-center justify-around gap-6 p-5 bg-white border border-zinc-200 rounded-xl shadow-sm h-fit sm:h-[168px]">
      <div className="relative w-28 h-28 flex items-center justify-center shrink-0">
        <svg viewBox="0 0 100 100" className="w-full h-full transform -rotate-90">
          <circle cx="50" cy="50" r={r} fill="none" stroke="#f4f4f5" strokeWidth="8" />
          {categories.map(([name, cost], idx) => {
            const share = cost / total;
            const strokeLength = share * c;
            const strokeOffset = c - strokeLength + (accumulatedPercent / 100) * c;
            accumulatedPercent -= share * 100;
            const color = colorPalette[name] || '#6366f1';
            
            return (
              <circle
                key={idx}
                cx="50"
                cy="50"
                r={r}
                fill="none"
                stroke={color}
                strokeWidth="8"
                strokeDasharray={c}
                strokeDashoffset={strokeOffset}
                strokeLinecap="round"
                className="transition-all duration-700"
              />
            );
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-[7px] font-bold text-zinc-400 uppercase tracking-widest">Outflows</span>
          <span className="text-[10px] font-black text-zinc-950">PHP {Math.round(total).toLocaleString()}</span>
        </div>
      </div>

      <div className="space-y-1.5 flex-1 w-full overflow-hidden">
        {categories.map(([name, cost], idx) => {
          const share = (cost / total) * 100;
          const color = colorPalette[name] || '#6366f1';
          return (
            <div key={idx} className="flex justify-between items-center text-xs">
              <div className="flex items-center gap-1.5 overflow-hidden">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                <span className="font-semibold text-zinc-500 truncate text-[11px]">{name}</span>
              </div>
              <div className="text-right shrink-0">
                <span className="font-bold text-zinc-900 text-[11px]">PHP {cost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                <span className="text-[8px] text-zinc-400 block font-bold leading-none">{share.toFixed(0)}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Track 4: Profit Trajectory Custom Area Spline chart
function ProfitTrendChart({ months }) {
  const [hoveredNode, setHoveredNode] = useState(null);
  
  if (!months || months.length === 0) {
    return (
      <div className="bg-white border border-zinc-200 rounded-xl p-6 shadow-sm flex flex-col justify-center items-center h-[230px] text-center">
        <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-400 mb-2">Profit Trajectory</h3>
        <div className="text-zinc-400 text-xs italic">Awaiting completed order transactions.</div>
      </div>
    );
  }

  const width = 500;
  const height = 150;
  const paddingX = 40;
  const paddingY = 25;
  
  const profits = months.map(m => m.profit);
  const maxVal = Math.max(...profits, 1500);
  const minVal = Math.min(...profits, -500);
  const range = maxVal - minVal;

  const points = months.map((m, index) => {
    const x = paddingX + (index * (width - paddingX * 2)) / (months.length - 1);
    const y = height - paddingY - ((m.profit - minVal) * (height - paddingY * 2)) / (range || 1);
    return { x, y, ...m };
  });

  const polylinePath = points.map(p => `${p.x},${p.y}`).join(' ');
  const areaPath = `${points[0].x},${height - paddingY} ` + polylinePath + ` ${points[points.length - 1].x},${height - paddingY}`;

  return (
    <div className="relative bg-white border border-zinc-200 rounded-xl p-5 shadow-sm flex flex-col justify-between h-[242px]">
      <div>
        <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-400 mb-0.5">Profit Trajectory</h3>
        <p className="text-[9px] text-zinc-400 font-bold uppercase tracking-widest">Month-over-month performance</p>
      </div>

      <div className="relative mt-2 flex-1 flex items-center justify-center">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible">
          <defs>
            <linearGradient id="profit-glow" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6366f1" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#6366f1" stopOpacity="0.0" />
            </linearGradient>
            <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
              <feDropShadow dx="0" dy="4" stdDeviation="3" floodColor="#6366f1" floodOpacity="0.2" />
            </filter>
          </defs>
          
          {/* Zero baseline axis grid */}
          {minVal < 0 && (
            <line 
              x1={paddingX} 
              y1={height - paddingY - ((0 - minVal) * (height - paddingY * 2)) / range} 
              x2={width - paddingX} 
              y2={height - paddingY - ((0 - minVal) * (height - paddingY * 2)) / range} 
              stroke="#f4f4f5" 
              strokeWidth="2" 
              strokeDasharray="4 4" 
            />
          )}

          {/* Area fill under curve */}
          <path d={`M ${areaPath} Z`} fill="url(#profit-glow)" className="transition-all duration-500" />
          
          {/* Spline curve line */}
          <polyline fill="none" stroke="#6366f1" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" points={polylinePath} filter="url(#shadow)" className="transition-all duration-500" />
          
          {/* Plot nodes */}
          {points.map((p, i) => (
            <g key={i}>
              <circle 
                cx={p.x} 
                cy={p.y} 
                r={hoveredNode?.label === p.label ? "6" : "4"} 
                fill="#ffffff" 
                stroke="#6366f1" 
                strokeWidth="2.5" 
                onMouseEnter={() => setHoveredNode(p)}
                onMouseLeave={() => setHoveredNode(null)}
                className="cursor-pointer transition-all duration-150" 
              />
              <text x={p.x} y={height - 5} textAnchor="middle" className="text-[9px] font-bold fill-zinc-400 tracking-tighter uppercase">{p.label}</text>
            </g>
          ))}
        </svg>

        {/* Interactive glow tooltip */}
        {hoveredNode && (
          <div className="absolute top-0 right-0 bg-zinc-950 text-white text-[10px] font-bold px-2.5 py-1.5 rounded border border-zinc-800 shadow-xl flex flex-col animate-in fade-in zoom-in-95 duration-100 leading-none">
            <span className="text-[7px] text-zinc-400 uppercase tracking-widest font-black mb-1">{hoveredNode.label} Profitability</span>
            <span className={hoveredNode.profit >= 0 ? "text-emerald-400" : "text-rose-400"}>
              PHP {hoveredNode.profit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, icon, trend, trendColor, highlight }) {
  return (
    <div className={`bg-white border rounded-xl p-6 shadow-sm flex flex-col relative overflow-hidden group transition-all hover:shadow-md ${highlight && value.includes('PHP') && !value.includes('-') ? 'ring-2 ring-indigo-500/10' : 'border-zinc-200'}`}>
      <div className="flex items-center justify-between mb-4">
        <span className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">{label}</span>
        <div className="p-2 bg-zinc-50 rounded-lg group-hover:scale-110 transition-transform">
          {icon}
        </div>
      </div>
      <div className={`text-2xl font-black tracking-tight mb-1 ${highlight ? 'text-zinc-900' : 'text-zinc-900'}`}>
        {value}
      </div>
      <div className="flex items-center justify-between mt-auto">
        <span className="text-xs text-zinc-400 font-medium">{sub}</span>
        {trend && (
          <span className={`text-[10px] font-bold flex items-center gap-0.5 ${trendColor}`}>
            <ArrowUpRight className="w-3 h-3" />
            {trend}
          </span>
        )}
      </div>
    </div>
  );
}
