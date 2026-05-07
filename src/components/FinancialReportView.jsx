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
  Wallet
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
    avgOrderValue: 0
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

      setReportData({
        revenue: totalRevenue,
        expenses: totalExpenses,
        netIncome,
        pendingRevenue: totalPendingRevenue,
        payerBreakdown,
        recentTransactions,
        orderCount: (completedOrders || []).length,
        avgOrderValue: (completedOrders || []).length > 0 ? totalRevenue / completedOrders.length : 0
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
