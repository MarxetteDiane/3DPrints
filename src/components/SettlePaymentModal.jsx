import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabaseClient';
import { XCircle, Loader2, Coins, Check } from 'lucide-react';

export default function SettlePaymentModal({ orderId, onClose, onSuccess }) {
  const queryClient = useQueryClient();
  const [amountReceived, setAmountReceived] = useState('');
  
  const { data: order, isLoading, isError, error } = useQuery({
    queryKey: ['order-payment-details', orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('*, clients(name)')
        .eq('id', orderId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!orderId,
  });

  useEffect(() => {
    setAmountReceived('');
  }, [order]);

  const updateMutation = useMutation({
    mutationFn: async (receivedVal) => {
      const prevBreakdown = order.financial_breakdown || {};
      const prevPaid = prevBreakdown.amountPaid !== undefined
        ? Number(prevBreakdown.amountPaid)
        : (order.status === 'Completed' ? Number(order.total_price || 0) : 0);
      
      const nextAmountPaid = prevPaid + receivedVal;
      
      let nextHistory = prevBreakdown.paymentHistory || [];
      if (receivedVal !== 0) {
        nextHistory = [...nextHistory, {
          amount: receivedVal,
          date: new Date().toISOString()
        }];
      }

      const nextBreakdown = {
        ...prevBreakdown,
        amountPaid: nextAmountPaid,
        paymentHistory: nextHistory,
        editorState: prevBreakdown.editorState ? {
          ...prevBreakdown.editorState,
          amountPaid: nextAmountPaid
        } : {
          amountPaid: nextAmountPaid
        }
      };

      const { error } = await supabase
        .from('orders')
        .update({ financial_breakdown: nextBreakdown })
        .eq('id', orderId);

      if (error) throw error;
    },
    onSuccess: async () => {
      setAmountReceived('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['order-details', orderId] }),
        queryClient.invalidateQueries({ queryKey: ['order-payment-details', orderId] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard-data'] }),
        queryClient.invalidateQueries({ queryKey: ['completed-orders'] }),
      ]);
      onSuccess?.();
      onClose();
    }
  });

  if (!orderId) return null;

  const formatMoney = (val) => {
    const num = Number.parseFloat(val);
    if (!Number.isFinite(num)) return '0.00';
    return num.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const totalAmount = order ? Number(order.total_price || 0) : 0;
  const prevPaid = order && order.financial_breakdown?.amountPaid !== undefined
    ? Number(order.financial_breakdown.amountPaid)
    : (order?.status === 'Completed' ? totalAmount : 0);
  const balanceDue = Math.max(0, totalAmount - prevPaid);
  const parsedReceived = Math.max(0, Number(amountReceived) || 0);
  const remainingBalance = Math.max(0, balanceDue - parsedReceived);

  const handlePayInFull = () => {
    setAmountReceived(balanceDue.toString());
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (parsedReceived < 0) {
      alert("Amount Received cannot be negative.");
      return;
    }
    if (parsedReceived === 0) {
      alert("Please enter an amount received greater than 0.");
      return;
    }
    updateMutation.mutate(parsedReceived);
  };

  const clientName = order?.clients?.name || 'Unknown Client';
  const orderRef = orderId.split('-')[0].toUpperCase();

  return (
    <div className="fixed inset-0 bg-zinc-950/45 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div 
        className="bg-white border border-zinc-200 shadow-2xl rounded-xl max-w-md w-full p-6 animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center pb-3.5 border-b border-zinc-100 mb-5">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
              <Coins className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-zinc-950">Settle Order Payment</h3>
              <p className="text-xs text-zinc-400 font-semibold mt-0.5">
                Ref: #{orderRef} • {clientName}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-1 hover:bg-zinc-100 rounded-lg text-zinc-400 hover:text-zinc-800 transition-colors"
            title="Close"
          >
            <XCircle className="w-5 h-5" />
          </button>
        </div>

        {isLoading ? (
          <div className="py-8 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-8 h-8 text-zinc-900 animate-spin" />
            <p className="text-xs text-zinc-500 font-medium">Retrieving transaction details...</p>
          </div>
        ) : isError ? (
          <div className="py-6 text-center">
            <p className="text-sm font-semibold text-rose-600">Failed to load order payment info</p>
            <p className="text-xs text-zinc-400 mt-1">{error?.message || "An unexpected error occurred."}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Total, Paid, and Balance Summary Grid */}
            <div className="grid grid-cols-3 gap-2 bg-zinc-50 p-3 rounded-lg border border-zinc-200">
              <div className="text-center">
                <span className="block text-[9px] font-bold text-zinc-450 uppercase tracking-wider mb-0.5">Total Price</span>
                <span className="text-sm font-bold text-zinc-850">₱{formatMoney(totalAmount)}</span>
              </div>
              <div className="text-center border-x border-zinc-200">
                <span className="block text-[9px] font-bold text-zinc-450 uppercase tracking-wider mb-0.5">Paid So Far</span>
                <span className="text-sm font-bold text-zinc-850">₱{formatMoney(prevPaid)}</span>
              </div>
              <div className="text-center">
                <span className="block text-[9px] font-bold text-zinc-450 uppercase tracking-wider mb-0.5">Balance Due</span>
                <span className="text-sm font-bold text-zinc-850">₱{formatMoney(balanceDue)}</span>
              </div>
            </div>

            {/* Amount Received (Editable Input) */}
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="block text-[10px] font-bold text-zinc-450 uppercase tracking-widest">
                  Amount Received
                </label>
                {balanceDue > 0 && (
                  <button
                    type="button"
                    onClick={handlePayInFull}
                    className="text-[10px] font-bold text-emerald-600 hover:text-emerald-700 hover:underline transition-colors uppercase tracking-wider"
                  >
                    Pay Remaining Balance
                  </button>
                )}
              </div>
              <div className="relative">
                <span className="absolute inset-y-0 left-3 flex items-center text-zinc-450 text-sm font-bold pointer-events-none">
                  ₱
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={amountReceived}
                  onChange={(e) => setAmountReceived(e.target.value)}
                  required
                  className="w-full pl-7 pr-3 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm font-bold text-zinc-950 focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 transition-colors"
                  autoFocus
                />
              </div>
            </div>

            {/* Remaining Balance (Dynamic calculation) */}
            <div>
              <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">
                Remaining Balance
              </label>
              <div className={`border rounded-lg px-3 py-2 text-lg font-extrabold transition-all duration-200 ${
                remainingBalance <= 0 
                  ? "bg-emerald-50 border-emerald-100 text-emerald-700 shadow-sm"
                  : "bg-amber-50/50 border-amber-100/70 text-amber-700"
              }`}>
                <div className="flex justify-between items-center">
                  <span>₱{formatMoney(remainingBalance)}</span>
                  {remainingBalance <= 0 && (
                    <span className="text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full inline-flex items-center gap-1 shadow-sm animate-pulse">
                      <Check className="w-3 h-3" /> Fully Paid
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Payment History Log */}
            {order.financial_breakdown?.paymentHistory && order.financial_breakdown.paymentHistory.length > 0 && (
              <div className="bg-zinc-50 border border-zinc-150 rounded-lg p-3">
                <span className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">
                  Payment History
                </span>
                <div className="space-y-2 max-h-28 overflow-y-auto pr-1">
                  {order.financial_breakdown.paymentHistory.map((entry, index) => (
                    <div key={index} className="flex justify-between items-center text-xs">
                      <span className="text-zinc-500 font-medium">
                        {new Date(entry.date).toLocaleDateString()} {new Date(entry.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span className={`font-bold ${entry.amount >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {entry.amount >= 0 ? '+' : ''}₱{formatMoney(entry.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Form actions */}
            <div className="flex gap-3 pt-3.5 border-t border-zinc-100">
              <button
                type="submit"
                disabled={updateMutation.isPending}
                className="flex-1 bg-zinc-900 hover:bg-black text-white text-xs font-bold py-2.5 rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-40"
              >
                {updateMutation.isPending ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving...
                  </>
                ) : (
                  "Save Payment"
                )}
              </button>
              <button
                type="button"
                onClick={onClose}
                disabled={updateMutation.isPending}
                className="flex-1 bg-zinc-100 hover:bg-zinc-200 text-zinc-600 text-xs font-bold py-2.5 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
