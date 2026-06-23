import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabaseClient';
import { FileText, TrendingUp, Users, Printer, Clock, MoreHorizontal, CheckCircle2, Pencil, XCircle, Trash2, Loader2, AlertTriangle, ShieldAlert, Coins } from 'lucide-react';
import OrderDetailsModal from './OrderDetailsModal';
import SettlePaymentModal from './SettlePaymentModal';
import { adjustInventoryStock } from '../lib/inventory';

export default function MetricsView() {
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [openMenuId, setOpenMenuId] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [failureOrderId, setFailureOrderId] = useState(null);
  const [settlePaymentOrderId, setSettlePaymentOrderId] = useState(null);
  const menuRef = useRef(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Optimized parallel fetch using React Query
  const { data, isPending, isError, error: queryError, refetch } = useQuery({
    queryKey: ['dashboard-data'],
    queryFn: async () => {
      // Direct use of sanitized supabase client
      const { data: statsData, error: statsError } = await supabase.rpc('get_dashboard_stats');
      if (statsError) throw statsError;

      const { data: ordersData, error: ordersError } = await supabase
        .from('orders')
        .select('*, clients(*), items(name)')
        .not('status', 'in', '("Completed", "Cancelled")')
        .order('created_at', { ascending: false })
        .limit(50);
        
      if (ordersError) throw ordersError;

      return {
        orders: ordersData || [],
        metrics: {
          activeOrders: statsData.active_orders || 0,
          totalClients: statsData.total_clients || 0,
          totalItems: statsData.total_items || 0
        }
      };
    },
    placeholderData: (prev) => prev,
    staleTime: 1000 * 60 * 5,
    retry: 1
  });

  const orders = data?.orders || [];
  const metrics = data?.metrics || { activeOrders: 0, totalClients: 0, totalItems: 0 };
  const showSkeletons = isPending && !data;

  // Status update mutation
  const statusMutation = useMutation({
    mutationFn: async ({ id, nextStatus }) => {
      const { error } = await supabase.from('orders').update({ status: nextStatus }).eq('id', id);
      if (error) throw error;
    },
    onMutate: async ({ id, nextStatus }) => {
      await queryClient.cancelQueries({ queryKey: ['dashboard-data'] });
      const previousData = queryClient.getQueryData(['dashboard-data']);
      
      queryClient.setQueryData(['dashboard-data'], (old) => {
        if (!old) return old;
        return {
          ...old,
          orders: (nextStatus === 'Completed' || nextStatus === 'Cancelled')
            ? old.orders.filter(o => o.id !== id)
            : old.orders.map(o => o.id === id ? { ...o, status: nextStatus } : o)
        };
      });

      return { previousData };
    },
    onError: (err, variables, context) => {
      queryClient.setQueryData(['dashboard-data'], context.previousData);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard-data'] });
      queryClient.invalidateQueries({ queryKey: ['completed-orders'] });
    }
  });

  // Hard delete mutation for cancelling orders
  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      // 1. Fetch order to see if it is already cancelled. If not, restore inventory first
      const { data: order, error: fetchErr } = await supabase
        .from('orders')
        .select('status, financial_breakdown')
        .eq('id', id)
        .single();
      if (fetchErr) throw fetchErr;

      if (order.status !== 'Cancelled') {
        const editorState = order.financial_breakdown?.editorState;
        if (editorState) {
          const filamentDeltaById = {};
          editorState.plates?.forEach((plate) => {
            plate.filaments?.forEach((filament) => {
              if (filament.inventoryId) {
                const key = String(filament.inventoryId);
                filamentDeltaById[key] = (filamentDeltaById[key] || 0) + (parseFloat(filament.weight) || 0);
              }
            });
          });

          const materialDeltaById = {};
          editorState.materials?.forEach((material) => {
            if (material.inventoryId) {
              const key = String(material.inventoryId);
              materialDeltaById[key] = (materialDeltaById[key] || 0) + (parseFloat(material.quantity) || 0);
            }
          });

          if (Object.keys(filamentDeltaById).length > 0 || Object.keys(materialDeltaById).length > 0) {
            await adjustInventoryStock({ filamentDeltaById, materialDeltaById });
          }
        }
      }

      // 2. Perform the hard delete
      const { error } = await supabase.from('orders').delete().eq('id', id);
      if (error) throw error;
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['dashboard-data'] });
      const previousData = queryClient.getQueryData(['dashboard-data']);
      
      queryClient.setQueryData(['dashboard-data'], (old) => {
        if (!old) return old;
        return {
          ...old,
          orders: old.orders.filter(o => o.id !== id)
        };
      });

      return { previousData };
    },
    onError: (err, variables, context) => {
      queryClient.setQueryData(['dashboard-data'], context.previousData);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard-data'] });
    }
  });
 
  // Mutation to cancel order and restore inventory
  const cancelOrderMutation = useMutation({
    mutationFn: async (id) => {
      const { data: order, error: fetchErr } = await supabase
        .from('orders')
        .select('status, financial_breakdown')
        .eq('id', id)
        .single();
      if (fetchErr) throw fetchErr;
      if (order.status === 'Cancelled') return;

      const editorState = order.financial_breakdown?.editorState;
      if (editorState) {
        const filamentDeltaById = {};
        editorState.plates?.forEach((plate) => {
          plate.filaments?.forEach((filament) => {
            if (filament.inventoryId) {
              const key = String(filament.inventoryId);
              filamentDeltaById[key] = (filamentDeltaById[key] || 0) + (parseFloat(filament.weight) || 0);
            }
          });
        });

        const materialDeltaById = {};
        editorState.materials?.forEach((material) => {
          if (material.inventoryId) {
            const key = String(material.inventoryId);
            materialDeltaById[key] = (materialDeltaById[key] || 0) + (parseFloat(material.quantity) || 0);
          }
        });

        if (Object.keys(filamentDeltaById).length > 0 || Object.keys(materialDeltaById).length > 0) {
          await adjustInventoryStock({ filamentDeltaById, materialDeltaById });
        }
      }

      const { error: updateErr } = await supabase
        .from('orders')
        .update({ status: 'Cancelled' })
        .eq('id', id);
      if (updateErr) throw updateErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard-data'] });
      queryClient.invalidateQueries({ queryKey: ['completed-orders'] });
    }
  });

  const cycleStatus = (id, currentStatus) => {
    const statuses = ['Pending', 'Printing', 'Post-Processing', 'Awaiting Payment', 'For Delivery', 'Completed'];
    const nextIndex = (statuses.indexOf(currentStatus) + 1) % statuses.length;
    statusMutation.mutate({ id, nextStatus: statuses[nextIndex] });
  };

  const StatusBadge = ({ status, onClick }) => {
    let colorClass = '';
    switch(status) {
      case 'Pending': colorClass = 'bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-200'; break;
      case 'Printing': colorClass = 'bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-200'; break;
      case 'Post-Processing': colorClass = 'bg-purple-100 text-purple-700 border-purple-200 hover:bg-purple-200'; break;
      case 'Awaiting Payment': colorClass = 'bg-rose-100 text-rose-700 border-rose-200 hover:bg-rose-200'; break;
      case 'For Delivery': colorClass = 'bg-indigo-100 text-indigo-700 border-indigo-200 hover:bg-indigo-200'; break;
      case 'Completed': colorClass = 'bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-200'; break;
      default: colorClass = 'bg-zinc-100 text-zinc-700 border-zinc-200 hover:bg-zinc-200';
    }

    return (
      <button 
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border transition-colors cursor-pointer ${colorClass}`}
      >
        {status}
      </button>
    );
  };

  return (
    <div className="space-y-8">
      
      {/* Error State */}
      {isError && !data && (
        <div className="bg-red-50 border border-red-200 p-6 rounded-lg text-center">
          <TrendingUp className="w-12 h-12 text-red-400 mx-auto mb-4 opacity-50" />
          <h3 className="text-red-900 font-bold text-lg mb-2">Dashboard Connectivity Issue</h3>
          <p className="text-red-700 text-sm mb-6">
            We're having trouble connecting to the database. {queryError?.message || 'Please check your connection.'}
          </p>
          <button 
            onClick={() => refetch()}
            className="bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded font-bold shadow-sm transition-colors"
          >
            Retry Connection
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        
        <div className="bg-white p-5 rounded-lg border border-zinc-200 shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-semibold text-zinc-500 uppercase tracking-widest">Active Orders</span>
            <FileText className="w-5 h-5 text-zinc-400" />
          </div>
          <span className="text-3xl font-extrabold text-zinc-900 tracking-tight">
            {showSkeletons ? <div className="h-9 w-16 bg-zinc-100 rounded animate-shimmer" /> : metrics.activeOrders}
          </span>
          <span className="text-xs text-zinc-500 font-medium mt-2">Currently in pipeline</span>
        </div>

        <div className="bg-white p-5 rounded-lg border border-zinc-200 shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-semibold text-zinc-500 uppercase tracking-widest">Global Clients</span>
            <Users className="w-5 h-5 text-zinc-400" />
          </div>
          <span className="text-3xl font-extrabold text-zinc-900 tracking-tight">
            {showSkeletons ? <div className="h-9 w-16 bg-zinc-100 rounded animate-shimmer" /> : metrics.totalClients}
          </span>
          <span className="text-xs text-zinc-500 font-medium mt-2">Registered in database</span>
        </div>

        <div className="bg-white p-5 rounded-lg border border-zinc-200 shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-semibold text-zinc-500 uppercase tracking-widest">Items Processing</span>
            <Printer className="w-5 h-5 text-zinc-400" />
          </div>
          <span className="text-3xl font-extrabold text-zinc-900 tracking-tight">
            {showSkeletons ? <div className="h-9 w-16 bg-zinc-100 rounded animate-shimmer" /> : metrics.totalItems}
          </span>
          <span className="text-xs text-zinc-500 font-medium mt-2">Across all active objects</span>
        </div>

      </div>

      {/* Orders Data Table */}
      <div className="bg-white rounded-lg border border-zinc-200 shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-zinc-200 flex items-center justify-between bg-zinc-50">
          <div>
            <h3 className="text-lg font-bold text-zinc-900 tracking-tight">Active Pipeline</h3>
            <p className="text-sm text-zinc-500 font-medium">Manage and track your pending and active print jobs.</p>
          </div>
          <button className="bg-white text-zinc-900 border border-zinc-300 hover:bg-zinc-50 px-4 py-2 rounded text-sm font-semibold transition-colors shadow-sm">
            Export CSV
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-zinc-600">
            <thead className="bg-white border-b border-zinc-200 text-xs font-bold text-zinc-500 uppercase tracking-wider">
              <tr>
                <th className="px-6 py-4 font-semibold">Order ID</th>
                <th className="px-6 py-4 font-semibold">Client</th>
                <th className="px-6 py-4 font-semibold">Item</th>
                <th className="px-6 py-4 font-semibold">Date Logged</th>
                <th className="px-6 py-4 font-semibold">Payment Status</th>
                <th className="px-6 py-4 font-semibold text-center">Status</th>
                <th className="px-6 py-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {showSkeletons ? (
                [1, 2, 3, 4, 5].map(i => (
                  <tr key={i}>
                    <td className="px-6 py-4"><div className="h-4 w-20 bg-zinc-100 rounded pulse-light" /></td>
                    <td className="px-6 py-4"><div className="h-4 w-32 bg-zinc-100 rounded pulse-light" /></td>
                    <td className="px-6 py-4"><div className="h-4 w-32 bg-zinc-100 rounded pulse-light" /></td>
                    <td className="px-6 py-4"><div className="h-4 w-24 bg-zinc-100 rounded pulse-light" /></td>
                    <td className="px-6 py-4"><div className="h-4 w-28 bg-zinc-100 rounded pulse-light" /></td>
                    <td className="px-6 py-4 flex justify-center"><div className="h-6 w-24 bg-zinc-100 rounded-full pulse-light" /></td>
                    <td className="px-6 py-4"><div className="h-4 w-4 bg-zinc-100 rounded ml-auto pulse-light" /></td>
                  </tr>
                ))
              ) : orders.map((order) => {
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
                    <td className="px-6 py-4 whitespace-nowrap text-zinc-700 font-medium">
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
                      <StatusBadge status={order.status} onClick={() => cycleStatus(order.id, order.status)} />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right relative">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenMenuId(openMenuId === order.id ? null : order.id);
                        }}
                        className="text-zinc-400 hover:text-zinc-900 transition-colors tooltip p-1 rounded-full hover:bg-zinc-100" 
                        title="Manage Order"
                      >
                        <MoreHorizontal className="w-5 h-5 ml-auto" />
                      </button>
                      
                      {openMenuId === order.id && (
                        <div 
                          ref={menuRef}
                          className="absolute right-6 top-10 w-36 bg-white border border-zinc-200 rounded shadow-xl z-30 py-1 overflow-hidden animate-in fade-in zoom-in-95 duration-100"
                          onClick={(e) => e.stopPropagation()}
                        >
                           <button 
                            onClick={() => {
                              setSettlePaymentOrderId(order.id);
                              setOpenMenuId(null);
                            }}
                            className="w-full text-left px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 flex items-center gap-2"
                          >
                            <Coins className="w-3.5 h-3.5 text-emerald-600" />
                            Settle Payment
                          </button>
                          <button 
                            onClick={() => {
                              setSelectedOrderId(order.id);
                              setIsEditing(true);
                              setOpenMenuId(null);
                            }}
                            className="w-full text-left px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 flex items-center gap-2 border-t border-zinc-100"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            Edit Order
                          </button>
                          <button 
                            onClick={() => {
                              setFailureOrderId(order.id);
                              setOpenMenuId(null);
                            }}
                            className="w-full text-left px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 flex items-center gap-2 border-t border-zinc-100"
                          >
                            <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
                            Report Failure
                          </button>
                          <button 
                            onClick={() => {
                              if (confirm('Are you sure you want to CANCEL this order? This will restore filaments and materials back to inventory.')) {
                                cancelOrderMutation.mutate(order.id);
                              }
                              setOpenMenuId(null);
                            }}
                            className="w-full text-left px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-50 flex items-center gap-2 border-t border-zinc-100"
                          >
                            <XCircle className="w-3.5 h-3.5 text-amber-600" />
                            Cancel Order
                          </button>
                          <button 
                            onClick={() => {
                              if (confirm('Are you sure you want to PERMANENTLY DELETE this order? This action cannot be undone.')) {
                                deleteMutation.mutate(order.id);
                              }
                              setOpenMenuId(null);
                            }}
                            className="w-full text-left px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 flex items-center gap-2 border-t border-zinc-100"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Delete Order
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              
              {!isPending && orders.length === 0 && (
                <tr>
                  <td colSpan="7" className="px-6 py-10 text-center text-zinc-500">
                    No active orders found in the pipeline. Start building a quote!
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
          initialIsEditing={isEditing}
          onClose={() => {
            setSelectedOrderId(null);
            setIsEditing(false);
          }} 
        />
      )}

      {/* Settle Payment Modal Overlay */}
      {settlePaymentOrderId && (
        <SettlePaymentModal 
          orderId={settlePaymentOrderId} 
          onClose={() => setSettlePaymentOrderId(null)} 
        />
      )}

      {/* Track 3: Report Failure Modal Overlay */}
      {failureOrderId && (
        <ReportFailureModal 
          orderId={failureOrderId} 
          onClose={() => setFailureOrderId(null)} 
        />
      )}
    </div>
  );
}

// Sleek, glassmorphic modal to report print failures (Track 3)
function ReportFailureModal({ orderId, onClose }) {
  const queryClient = useQueryClient();
  const [filaments, setFilaments] = useState([]);
  const [selectedFilamentId, setSelectedFilamentId] = useState('');
  const [wastedGrams, setWastedGrams] = useState('');
  const [reason, setReason] = useState('Bed Adhesion Failure');
  const [payer, setPayer] = useState('MackyPrint');
  const [selectedPayer, setSelectedPayer] = useState('MackyPrint');
  const [customPayer, setCustomPayer] = useState('');
  const [showCustomPayer, setShowCustomPayer] = useState(false);
  const [loading, setLoading] = useState(false);
  const [orderName, setOrderName] = useState('Active Print Job');

  useEffect(() => {
    // Load filaments for dropdown
    const raw = localStorage.getItem('inventory_filaments');
    if (raw) {
      try {
        setFilaments(JSON.parse(raw));
      } catch (e) {
        console.error(e);
      }
    }
    
    // Fetch order item name
    supabase
      .from('orders')
      .select('id, items(name)')
      .eq('id', orderId)
      .single()
      .then(({ data }) => {
        if (data && data.items?.[0]?.name) {
          setOrderName(data.items[0].name);
        }
      });
  }, [orderId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const grams = parseFloat(wastedGrams);
    if (!grams || grams <= 0) {
      alert("Please enter a valid weight in grams.");
      return;
    }
    if (!selectedFilamentId) {
      alert("Please select the filament used.");
      return;
    }

    setLoading(true);
    try {
      const spool = filaments.find(f => String(f.id) === String(selectedFilamentId));
      const costPerKg = spool ? spool.costPerKg : 700;
      const calculatedCost = (grams / 1000) * costPerKg;

      // 1. Deduct stock from inventory
      const { data: filamentsData, error: loadErr } = await supabase
        .from('inventory_filaments')
        .select('*')
        .eq('id', selectedFilamentId)
        .single();

      if (!loadErr && filamentsData) {
        await supabase
          .from('inventory_filaments')
          .update({
            weight_grams: Math.max(0, Number(filamentsData.weight_grams || 0) - grams),
            updated_at: new Date().toISOString()
          })
          .eq('id', selectedFilamentId);
      }

      // 2. Insert print failure log (resilient check)
      const stlName = `${orderName} (Failed Run)`;
      try {
        await supabase
          .from('failed_prints')
          .insert({
            order_id: orderId,
            filament_id: selectedFilamentId,
            weight_grams: grams,
            estimated_cost: Math.round(calculatedCost * 100) / 100,
            failure_reason: reason
          });
      } catch (dbErr) {
        console.warn("failed_prints table might not be migrated yet, fallback active:", dbErr);
      }

      // 3. Log as an active shop outflow under inventory_expenses
      await supabase
        .from('inventory_expenses')
        .insert({
          date: new Date().toISOString(),
          item_name: `Waste: ${stlName}`,
          category: 'Waste',
          cost: Math.round(calculatedCost * 100) / 100,
          payer: payer,
          notes: `Failure reason: ${reason}. Order ID: ${orderId.split('-')[0].toUpperCase()}...`
        });

      // 4. Force sync local caches
      const { data: refreshFila } = await supabase.from('inventory_filaments').select('*').order('id', { ascending: true });
      if (refreshFila) {
        const mapped = refreshFila.map(row => ({
          id: row.id,
          type: row.type,
          brand: row.brand,
          color: row.color,
          weightGrams: Number(row.weight_grams),
          costPerKg: Number(row.cost_per_kg),
          notes: row.notes,
        }));
        localStorage.setItem('inventory_filaments', JSON.stringify(mapped));
      }

      alert("Print failure logged! Stock updated and financial outflow recorded successfully.");
      queryClient.invalidateQueries({ queryKey: ['dashboard-data'] });
      onClose();
    } catch (err) {
      console.error(err);
      alert("Logging failed: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-zinc-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div 
        className="bg-white border border-zinc-200 shadow-2xl rounded-xl max-w-md w-full p-6 animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center pb-3 border-b border-zinc-100 mb-4">
          <div>
            <h3 className="text-base font-bold text-zinc-950">Report Print Failure</h3>
            <p className="text-xs text-zinc-400 font-semibold">{orderName}</p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-zinc-100 rounded text-zinc-400 hover:text-zinc-800 transition-colors">
            <XCircle className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">Filament Spool Used</label>
            {filaments.length > 0 ? (
              <select
                value={selectedFilamentId}
                onChange={e => setSelectedFilamentId(e.target.value)}
                required
                className="w-full text-sm border border-zinc-200 rounded-lg px-3 py-2 bg-zinc-50 font-medium focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900"
              >
                <option value="">— select spool —</option>
                {filaments.map(f => (
                  <option key={f.id} value={String(f.id)}>
                    {f.type || f.name} - {f.color} ({f.brand || 'Generic'}) [{f.weightGrams}g remaining]
                  </option>
                ))}
              </select>
            ) : (
              <div className="p-2 border border-dashed border-zinc-200 rounded text-xs text-zinc-400 italic text-center bg-zinc-50">
                No active spools found. Register spools in the inventory tab first.
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">Wasted Weight</label>
              <div className="relative">
                <input
                  type="number"
                  min="1"
                  step="0.1"
                  placeholder="grams"
                  value={wastedGrams}
                  onChange={e => setWastedGrams(e.target.value)}
                  required
                  className="w-full text-sm border border-zinc-200 rounded-lg px-3 py-2 bg-zinc-50 font-semibold focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900 pr-8"
                />
                <span className="absolute inset-y-0 right-3 flex items-center text-zinc-400 text-xs pointer-events-none">g</span>
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">Payer Account</label>
              <select
                value={selectedPayer}
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedPayer(val);
                  if (val === 'Add Payer') {
                    setShowCustomPayer(true);
                    setPayer(customPayer);
                  } else {
                    setShowCustomPayer(false);
                    setPayer(val);
                  }
                }}
                required
                className="w-full text-sm border border-zinc-200 rounded-lg px-3 py-2 bg-zinc-50 font-medium focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900"
              >
                <option value="">— select payer —</option>
                <option value="MackyPrint">MackyPrint</option>
                <option value="Marxette">Marxette</option>
                <option value="Iya">Iya</option>
                <option value="Add Payer">Add Payer</option>
              </select>

              {showCustomPayer && (
                <div className="mt-2 animate-in slide-in-from-top-1 duration-150">
                  <input
                    type="text"
                    placeholder="Enter custom payer name"
                    value={customPayer}
                    onChange={(e) => {
                      setCustomPayer(e.target.value);
                      setPayer(e.target.value);
                    }}
                    required
                    className="w-full text-sm border border-zinc-200 rounded-lg px-3 py-2 bg-zinc-50 font-medium focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900"
                  />
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">Failure Reason</label>
            <select
              value={reason}
              onChange={e => setReason(e.target.value)}
              className="w-full text-sm border border-zinc-200 rounded-lg px-3 py-2 bg-zinc-50 font-medium focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900"
            >
              <option value="Bed Adhesion Failure">Bed Adhesion Failure</option>
              <option value="Nozzle Clog / Under-extrusion">Nozzle Clog / Under-extrusion</option>
              <option value="Layer Shift">Layer Shift</option>
              <option value="Filament Runout / Tangled Spool">Filament Runout / Tangled Spool</option>
              <option value="Power Failure / Interrupted Run">Power Failure / Interrupted Run</option>
              <option value="Slicing / G-code Glitch">Slicing / G-code Glitch</option>
              <option value="Other / Mechanical Error">Other / Mechanical Error</option>
            </select>
          </div>

          <div className="flex gap-3 pt-3 border-t border-zinc-100">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white text-xs font-bold py-2.5 rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-40"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Logging...
                </>
              ) : (
                "Log Failure Loss"
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 bg-zinc-100 hover:bg-zinc-200 text-zinc-600 text-xs font-bold py-2.5 rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
