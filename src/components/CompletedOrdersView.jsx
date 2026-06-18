import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../supabaseClient';
import { CheckCircle2 } from 'lucide-react';
import OrderDetailsModal from './OrderDetailsModal';

export default function CompletedOrdersView() {
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['completed-orders'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('*, clients(*), items(name)')
        .eq('status', 'Completed')
        .order('created_at', { ascending: false })
        .limit(50); // Optimization: Limit to last 50 for faster load
      
      if (error) throw error;
      return data;
    }
  });

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold tracking-tight text-zinc-900 mb-6">Completed Orders Archive</h2>
      
      <div className="bg-white rounded-lg border border-zinc-200 shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-zinc-200 flex items-center justify-between bg-zinc-50">
          <div>
            <h3 className="text-lg font-bold text-zinc-900 tracking-tight">Archived History</h3>
            <p className="text-sm text-zinc-500 font-medium">Search and review previously shipped print jobs.</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-zinc-600">
            <thead className="bg-white border-b border-zinc-200 text-xs font-bold text-zinc-500 uppercase tracking-wider">
              <tr>
                <th className="px-6 py-4 font-semibold">Order ID</th>
                <th className="px-6 py-4 font-semibold">Client</th>
                <th className="px-6 py-4 font-semibold">Item</th>
                <th className="px-6 py-4 font-semibold">Completion Date</th>
                <th className="px-6 py-4 font-semibold">Payment Status</th>
                <th className="px-6 py-4 font-semibold text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              
              {isLoading ? (
                [1, 2, 3].map(i => (
                  <tr key={i}>
                    <td className="px-6 py-4"><div className="h-4 w-20 bg-zinc-100 rounded pulse-light" /></td>
                    <td className="px-6 py-4"><div className="h-4 w-32 bg-zinc-100 rounded pulse-light" /></td>
                    <td className="px-6 py-4"><div className="h-4 w-32 bg-zinc-100 rounded pulse-light" /></td>
                    <td className="px-6 py-4"><div className="h-4 w-24 bg-zinc-100 rounded pulse-light" /></td>
                    <td className="px-6 py-4"><div className="h-4 w-28 bg-zinc-100 rounded pulse-light" /></td>
                    <td className="px-6 py-4 flex justify-center"><div className="h-6 w-24 bg-zinc-100 rounded-full pulse-light" /></td>
                  </tr>
                ))
              ) : orders.length > 0 ? (
                orders.map((order) => {
                  const total = Number(order.total_price || 0);
                  const amountPaid = order.financial_breakdown?.amountPaid !== undefined
                    ? Number(order.financial_breakdown.amountPaid)
                    : (order.status === 'Completed' ? total : 0);
                  const balance = Math.max(0, total - amountPaid);

                  const formatMoney = (val) => {
                    const num = Number.parseFloat(val);
                    if (!Number.isFinite(num)) return '0.00';
                    return num.toLocaleString('en-US', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    });
                  };

                  return (
                    <tr 
                      key={order.id} 
                      className="hover:bg-zinc-50 transition-colors cursor-pointer"
                      onClick={() => setSelectedOrderId(order.id)}
                    >
                      <td className="px-6 py-4 whitespace-nowrap font-semibold text-zinc-900">
                        {order.id.split('-')[0].toUpperCase()}...
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap font-medium text-zinc-700">
                        {order.clients?.name || 'Unknown Client'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-zinc-700">
                        {order.items?.[0]?.name || 'Unknown Item'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-zinc-500">
                        {new Date(order.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {total === 0 ? (
                          <div>
                            <div className="font-semibold text-zinc-900">PHP 0.00</div>
                            <div className="text-xs text-zinc-400 font-medium">Free Tier</div>
                          </div>
                        ) : balance <= 0 ? (
                          <div>
                            <div className="font-semibold text-zinc-900">PHP {formatMoney(total)}</div>
                            <div className="text-xs text-emerald-600 font-bold uppercase tracking-wider">Fully Paid</div>
                          </div>
                        ) : amountPaid > 0 ? (
                          <div>
                            <div className="font-semibold text-zinc-900">PHP {formatMoney(total)}</div>
                            <div className="text-xs text-amber-600 font-semibold">
                              Paid: PHP {formatMoney(amountPaid)}
                              <span className="block text-[10px] text-zinc-400 font-normal">Bal: PHP {formatMoney(balance)}</span>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <div className="font-semibold text-zinc-900">PHP {formatMoney(total)}</div>
                            <div className="text-xs text-zinc-400 font-bold uppercase tracking-wider">Unpaid</div>
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border bg-emerald-100 text-emerald-700 border-emerald-200 inline-flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          Completed
                        </span>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="6" className="px-6 py-10 text-center text-zinc-500">
                    <CheckCircle2 className="w-10 h-10 text-zinc-300 mx-auto mb-3" />
                    No completed orders found in the database.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Order Details Modal Overlay */}
      {selectedOrderId && (
        <OrderDetailsModal 
          orderId={selectedOrderId} 
          onClose={() => setSelectedOrderId(null)} 
        />
      )}
    </div>
  );
}
