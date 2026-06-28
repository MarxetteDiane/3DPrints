import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabaseClient';
import { adjustInventoryStock, fetchInventoryFilaments, fetchInventoryMaterials } from '../lib/inventory';
import { fetchProducts } from '../lib/products';
import SettlePaymentModal from './SettlePaymentModal';
import PricingCalculator from './PricingCalculator';
import {
  X,
  User,
  Package,
  Clock,
  Scale,
  Wrench,
  Calendar,
  Hash,
  Calculator,
  Pencil,
  Save,
  Plus,
  Trash2,
  Layers,
  Coins,
  XCircle,
} from 'lucide-react';
import {
  calculateTotals,
  toEditorState,
  buildInventoryUsageMap,
  buildMaterialUsageMap,
  getStoredConfig
} from '../lib/pricing';

const fieldClass =
  'w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-md focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 transition-colors text-sm text-zinc-900';

function formatMoney(value) {
  const numeric = Number.parseFloat(value);
  if (!Number.isFinite(numeric)) return '0.00';
  return numeric.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function OrderDetailsModal({ orderId, onClose, initialIsEditing = false }) {
  const queryClient = useQueryClient();
  const [config] = useState(() => getStoredConfig());
  const [inventoryMaterials, setInventoryMaterials] = useState([]);
  const [inventoryFilaments, setInventoryFilaments] = useState([]);
  const [products, setProducts] = useState([]);
  const [isEditing, setIsEditing] = useState(initialIsEditing);
  const [editorState, setEditorState] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [isSettlingPayment, setIsSettlingPayment] = useState(false);

  const handleImageFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingImage(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 400;
        const MAX_HEIGHT = 400;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        // Compress as JPEG at 0.6 quality
        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.6);
        setEditorState((current) => ({ ...current, imageUrl: compressedBase64 }));
        setUploadingImage(false);
      };
      img.onerror = () => {
        alert('Failed to load image for compression.');
        setUploadingImage(false);
      };
      img.src = event.target.result;
    };
    reader.onerror = () => {
      alert('Failed to read image file.');
      setUploadingImage(false);
    };
    reader.readAsDataURL(file);
  };

  const { data, isLoading, isError } = useQuery({
    queryKey: ['order-details', orderId],
    queryFn: async () => {
      const { data: orderData, error } = await supabase
        .from('orders')
        .select(`
          *,
          clients (*),
          items (*)
        `)
        .eq('id', orderId)
        .single();

      if (error) throw error;
      return orderData;
    },
    enabled: !!orderId,
  });

  // Initialize editor state if starting in edit mode
  useEffect(() => {
    if (initialIsEditing && data && !editorState) {
      setEditorState(toEditorState(data, config));
    }
  }, [initialIsEditing, data, config, editorState]);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      fetchInventoryMaterials().catch(() => []),
      fetchInventoryFilaments().catch(() => []),
      fetchProducts().catch(() => []),
    ]).then(([materialsData, filamentsData, productsData]) => {
      if (cancelled) return;
      setInventoryMaterials(materialsData);
      setInventoryFilaments(filamentsData);
      setProducts(productsData);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const item = data?.items?.[0] || {};
  const client = data?.clients || {};
  const canEdit = data?.status && data.status !== 'Completed' && data.status !== 'Cancelled';
  const totals = editorState ? calculateTotals(editorState, config) : null;
  const displayTotalCost = totals
    ? totals.filCost + totals.elecCost + totals.supplementaryMatCost + totals.laborCost
    : 0;

  // For stock warnings: add back quantities this order previously committed to inventory
  // (those were already deducted from stock on last save, so they don't count against the limit)
  const savedEditorState = data?.financial_breakdown?.editorState;
  const prevFilamentUsage = savedEditorState ? buildInventoryUsageMap(savedEditorState) : {};
  const prevMaterialUsage = savedEditorState ? buildMaterialUsageMap(savedEditorState) : {};

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editorState || !totals) {
        throw new Error('Calculator state is not ready.');
      }

      if (!item.id || !client.id) {
        throw new Error('This order is missing related client or item records.');
      }

      const prevBreakdown = data?.financial_breakdown || {};
      const prevPaid = prevBreakdown.amountPaid !== undefined ? Number(prevBreakdown.amountPaid) : 0;
      const nextPaid = Number(editorState.amountPaid || 0);
      const diff = nextPaid - prevPaid;
      let nextHistory = prevBreakdown.paymentHistory || [];
      if (diff !== 0) {
        nextHistory = [...nextHistory, {
          amount: diff,
          date: new Date().toISOString()
        }];
      }

      const financialBreakdown = {
        electricityCost: totals.elecCost,
        totalKWh: totals.totalKWh,
        filamentCost: totals.filCost,
        wearTearCost: totals.wearTearCost,
        failureBufferCost: totals.failureBufferCost,
        laborCost: totals.laborCost,
        supplementaryMatCost: totals.supplementaryMatCost,
        logisticsCost: totals.logisticsCost,
        servicesCost: 0,
        markupCost: totals.markupCost,
        failureRatePercent: config.failureRatePercent || 10,
        markupPercent: totals.markupPercent,
        customFinalPrice: editorState.customFinalPrice !== '' ? Math.round(Number(editorState.customFinalPrice) * 100) / 100 : null,
        pricingMode: editorState.pricingMode || 'dynamic',
        fixedStandardPrice: Number(editorState.fixedStandardPrice || 0),
        fixedFamilyPrice: Number(editorState.fixedFamilyPrice || 0),
        fixedQuantity: Number(editorState.fixedQuantity || 1),
        addToGallery: editorState.addToGallery !== false,
        amountPaid: nextPaid,
        paymentHistory: nextHistory,
        editorState: {
          ...editorState,
          pricingMode: editorState.pricingMode || 'dynamic',
          fixedStandardPrice: Number(editorState.fixedStandardPrice || 0),
          fixedFamilyPrice: Number(editorState.fixedFamilyPrice || 0),
          fixedQuantity: Number(editorState.fixedQuantity || 1),
          addToGallery: editorState.addToGallery !== false,
          amountPaid: nextPaid,
        },
      };

      const clientPayload = {
        name: editorState.clientName.trim(),
        contact: editorState.clientContact.trim() || null,
      };

      const itemPayload = {
        name: editorState.itemName.trim(),
        filament_weight_g: totals.totalFilamentWeight,
        print_time_hours: totals.totalMinutes / 60,
        number_of_plates: Math.max(1, editorState.plates.length),
        labor_hours: totals.totalLaborHours,
      };

      const orderPayload = {
        total_price: Math.round(totals.finalPrice * 100) / 100,
        financial_breakdown: financialBreakdown,
      };

      const clientResult = await supabase.from('clients').update(clientPayload).eq('id', client.id);
      if (clientResult.error) throw clientResult.error;

      const orderResult = await supabase.from('orders').update(orderPayload).eq('id', orderId);
      if (orderResult.error) throw orderResult.error;

      // Try updating items with image_url column. If the DDL has not run, catch and fallback!
      try {
        const itemResult = await supabase.from('items').update({
          ...itemPayload,
          image_url: editorState.imageUrl || null
        }).eq('id', item.id);
        if (itemResult.error) {
          console.warn('Supabase items.image_url column missing, saving without image_url:', itemResult.error);
          const fallbackResult = await supabase.from('items').update(itemPayload).eq('id', item.id);
          if (fallbackResult.error) throw fallbackResult.error;
        }
      } catch (err) {
        console.warn('Caught items.image_url column update exception, saving without image_url:', err);
        const fallbackResult = await supabase.from('items').update(itemPayload).eq('id', item.id);
        if (fallbackResult.error) throw fallbackResult.error;
      }
    },
    onSuccess: async () => {
      reconcileInventoryStock();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['order-details', orderId] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard-data'] }),
        queryClient.invalidateQueries({ queryKey: ['completed-orders'] }),
      ]);
      setIsEditing(false);
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const prevBreakdown = data?.financial_breakdown || {};
      const editorState = prevBreakdown.editorState;
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

      const { error } = await supabase
        .from('orders')
        .update({ status: 'Cancelled' })
        .eq('id', orderId);

      if (error) throw error;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['order-details', orderId] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard-data'] }),
        queryClient.invalidateQueries({ queryKey: ['completed-orders'] }),
      ]);
    }
  });

  const handleCancelOrder = () => {
    if (confirm('Are you sure you want to CANCEL this order? This will restore filaments and materials back to inventory.')) {
      cancelMutation.mutate();
    }
  };

  const handleStartEdit = () => {
    if (!data) return;
    setEditorState(toEditorState(data, config));
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setEditorState(null);
    setIsEditing(false);
  };



  const handleSave = () => {
    if (!editorState?.clientName.trim() || !editorState?.itemName.trim()) {
      alert('Client name and item name are required.');
      return;
    }

    updateMutation.mutate();
  };

  const reconcileInventoryStock = async () => {
    try {
      const previousEditorState = data?.financial_breakdown?.editorState;
      if (!previousEditorState || !editorState) return;

      const previousUsage = buildInventoryUsageMap(previousEditorState);
      const nextUsage = buildInventoryUsageMap(editorState);
      const previousMaterialUsage = buildMaterialUsageMap(previousEditorState);
      const nextMaterialUsage = buildMaterialUsageMap(editorState);

      const filamentDeltaById = {};
      const materialDeltaById = {};

      new Set([...Object.keys(previousUsage), ...Object.keys(nextUsage)]).forEach((id) => {
        filamentDeltaById[id] = (previousUsage[id] || 0) - (nextUsage[id] || 0);
      });

      new Set([...Object.keys(previousMaterialUsage), ...Object.keys(nextMaterialUsage)]).forEach((id) => {
        materialDeltaById[id] = (previousMaterialUsage[id] || 0) - (nextMaterialUsage[id] || 0);
      });

      await adjustInventoryStock({ filamentDeltaById, materialDeltaById });
    } catch (error) {
      console.error('Failed to reconcile inventory stock:', error);
    }
  };

  if (!orderId) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/60 backdrop-blur-sm animate-in fade-in duration-200 font-sans">
      <div
        className="bg-white sm:rounded-xl shadow-2xl border-x sm:border border-zinc-200 w-full max-w-6xl overflow-hidden flex flex-col h-full sm:h-auto sm:max-h-[90vh] animate-in slide-in-from-bottom sm:zoom-in-95 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-zinc-200 flex justify-between items-center bg-zinc-50 shrink-0">
          <div>
            <h3 className="text-lg font-bold tracking-tight text-zinc-900 flex items-center gap-2">
              <Hash className="w-5 h-5 text-zinc-400" />
              Order Details
            </h3>
            <p className="text-sm text-zinc-500 font-mono mt-1">{orderId}</p>
          </div>
          <div className="flex items-center gap-2">
            {canEdit && !isLoading && !isError && (
              isEditing ? (
                <>
                  <button
                    onClick={handleCancelEdit}
                    disabled={updateMutation.isPending}
                    className="px-3 py-2 text-sm font-semibold text-zinc-700 bg-white border border-zinc-300 hover:bg-zinc-100 rounded transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={updateMutation.isPending}
                    className="px-3 py-2 text-sm font-semibold text-white bg-zinc-900 hover:bg-black rounded transition-colors disabled:opacity-50 inline-flex items-center gap-2"
                  >
                    <Save className="w-4 h-4" />
                    {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => setIsSettlingPayment(true)}
                    className="px-3 py-2 text-sm font-semibold text-zinc-700 bg-white border border-zinc-300 hover:bg-zinc-100 rounded transition-colors inline-flex items-center gap-2"
                  >
                    <Coins className="w-4 h-4 text-emerald-600" />
                    Settle Payment
                  </button>
                  <button
                    onClick={handleCancelOrder}
                    disabled={cancelMutation.isPending}
                    className="px-3 py-2 text-sm font-semibold text-rose-700 bg-white border border-zinc-300 hover:bg-rose-50 rounded transition-colors inline-flex items-center gap-2 disabled:opacity-50"
                  >
                    <XCircle className="w-4 h-4 text-rose-600" />
                    Cancel Order
                  </button>
                  <button
                    onClick={handleStartEdit}
                    className="px-3 py-2 text-sm font-semibold text-zinc-700 bg-white border border-zinc-300 hover:bg-zinc-100 rounded transition-colors inline-flex items-center gap-2"
                  >
                    <Pencil className="w-4 h-4" />
                    Edit Order
                  </button>
                </>
              )
            )}
            <button
              onClick={onClose}
              className="p-2 text-zinc-400 hover:text-zinc-900 hover:bg-zinc-200 rounded-full transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-4 sm:p-6 overflow-y-auto">
          {isLoading ? (
            <div className="space-y-6">
              <div className="h-8 w-1/3 bg-zinc-100 rounded pulse-light" />
              <div className="grid grid-cols-2 gap-4">
                <div className="h-24 bg-zinc-100 rounded pulse-light" />
                <div className="h-24 bg-zinc-100 rounded pulse-light" />
                <div className="h-24 bg-zinc-100 rounded pulse-light" />
                <div className="h-24 bg-zinc-100 rounded pulse-light" />
              </div>
            </div>
          ) : isError ? (
            <div className="py-12 text-center text-red-500 font-semibold flex flex-col items-center">
              <X className="w-10 h-10 mb-3 opacity-50" />
              Failed to retrieve order details. Please try again.
            </div>
          ) : isEditing && editorState && totals ? (
            <div className="w-full space-y-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-zinc-50 p-4 rounded-lg border border-zinc-200">
                <div className="flex items-center gap-3">
                  <Calendar className="w-5 h-5 text-zinc-400" />
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Logged On</p>
                    <p className="text-sm font-medium text-zinc-900">{new Date(data.created_at).toLocaleString()}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-1">Current Status</p>
                  <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border bg-zinc-900 text-white shadow-sm inline-block">
                    {data.status}
                  </span>
                </div>
              </div>

              {updateMutation.isError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {updateMutation.error?.message || 'Failed to save order changes.'}
                </div>
              )}

              <PricingCalculator
                state={editorState}
                onChange={setEditorState}
                config={config}
                inventoryFilaments={inventoryFilaments}
                inventoryMaterials={inventoryMaterials}
                products={products}
                prevFilamentUsage={prevFilamentUsage}
                prevMaterialUsage={prevMaterialUsage}
                rightColumnActions={
                  <div className="bg-zinc-50 p-4 border-t border-zinc-200 space-y-3">
                    <div className="flex justify-between items-center group">
                      <span className="font-semibold text-xs uppercase tracking-wider text-zinc-500">Amount Paid</span>
                      <div className="relative w-40">
                        <span className="absolute inset-y-0 left-3 flex items-center text-zinc-400 text-sm font-bold pointer-events-none">₱</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="0.00"
                          value={editorState.amountPaid}
                          onChange={e => setEditorState(current => ({ ...current, amountPaid: e.target.value === '' ? '' : Number(e.target.value) }))}
                          className="w-full pl-7 pr-3 py-1.5 text-right bg-zinc-50 border border-zinc-200 rounded-md text-sm font-bold text-zinc-950 focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 transition-colors"
                        />
                      </div>
                    </div>
                    <div className="flex justify-between items-center font-semibold text-sm pt-2 border-t border-dashed border-zinc-200">
                      <span className="text-zinc-500">Remaining Balance</span>
                      <span className="text-zinc-900 font-bold">
                        ₱{formatMoney(Math.max(0, totals.finalPrice - Number(editorState.amountPaid || 0)))}
                      </span>
                    </div>
                  </div>
                }
              />
            </div>
          ) : (
            <div className="space-y-8">
              <div className="flex flex-wrap items-center justify-between gap-4 bg-zinc-50 p-4 rounded-lg border border-zinc-200">
                <div className="flex items-center gap-3">
                  <Calendar className="w-5 h-5 text-zinc-400" />
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Logged On</p>
                    <p className="text-sm font-medium text-zinc-900">{new Date(data.created_at).toLocaleString()}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-1">Current Status</p>
                  <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border bg-zinc-900 text-white shadow-sm inline-block">{data.status}</span>
                  {!canEdit && <p className="text-xs text-zinc-500 mt-2">Completed orders are locked from editing.</p>}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="border border-zinc-200 rounded-lg p-5">
                  <div className="flex items-center gap-2 mb-4 border-b border-zinc-100 pb-3">
                    <User className="w-4 h-4 text-emerald-600" />
                    <h4 className="font-semibold text-zinc-900 text-sm uppercase tracking-wider">Client Identity</h4>
                  </div>
                  <div className="space-y-3">
                    <div><p className="text-xs text-zinc-500 mb-1">Name</p><p className="font-medium text-zinc-900 text-base">{client.name}</p></div>
                    <div><p className="text-xs text-zinc-500 mb-1">Contact</p><p className="font-medium text-zinc-900 text-sm whitespace-pre-wrap">{client.contact || 'No contact provided'}</p></div>
                  </div>
                </div>

                <div className="border border-zinc-200 rounded-lg p-5">
                  <div className="flex items-center gap-2 mb-4 border-b border-zinc-100 pb-3">
                    <Package className="w-4 h-4 text-blue-600" />
                    <h4 className="font-semibold text-zinc-900 text-sm uppercase tracking-wider">Object Details</h4>
                  </div>
                  <div className="space-y-3">
                    <div><p className="text-xs text-zinc-500 mb-1">Item Title</p><p className="font-medium text-zinc-900 text-base">{item.name || 'Unnamed Asset'}</p></div>
                    <div><p className="text-xs text-zinc-500 mb-1">Quantity</p><p className="font-semibold text-zinc-900 text-sm">{item.number_of_plates} Plates</p></div>
                  </div>
                </div>
              </div>

              {data.financial_breakdown?.editorState?.orderItems?.length > 0 && (
                <div className="border border-zinc-200 rounded-lg overflow-hidden bg-white shadow-xs">
                  <div className="bg-zinc-50 px-5 py-3 border-b border-zinc-200 flex items-center gap-2">
                    <Package className="w-4 h-4 text-blue-600" />
                    <h4 className="font-semibold text-zinc-900 text-sm uppercase tracking-wider">Order Line Items</h4>
                  </div>
                  <div className="p-5">
                    <div className="border border-zinc-200 rounded-lg overflow-hidden">
                      <div className="px-3 py-1.5 bg-zinc-50 border-b border-zinc-200 grid grid-cols-12 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                        <span className="col-span-1 text-center">Qty</span>
                        <span className="col-span-5">Product</span>
                        <span className="col-span-3">Variant</span>
                        <span className="col-span-3 text-right">Subtotal</span>
                      </div>
                      <div className="divide-y divide-zinc-100 bg-white">
                        {data.financial_breakdown.editorState.orderItems.map((oi, idx) => (
                          <div key={oi.id || idx} className="px-3 py-2 grid grid-cols-12 items-center text-xs">
                            <span className="col-span-1 text-center font-bold text-zinc-700">{oi.quantity}x</span>
                            <span className="col-span-5 font-medium text-zinc-800 truncate">{oi.productName}</span>
                            <span className="col-span-3 text-zinc-500 truncate">{oi.variantName}</span>
                            <span className="col-span-3 text-right font-bold text-zinc-900">₱{(oi.fixedStandardPrice * oi.quantity).toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                      <div className="px-3 py-2 bg-zinc-50 border-t border-zinc-200 flex justify-between text-xs font-bold text-zinc-900">
                        <span>Total ({data.financial_breakdown.editorState.orderItems.reduce((s, oi) => s + oi.quantity, 0)} items)</span>
                        <span>₱{data.financial_breakdown.editorState.orderItems.reduce((s, oi) => s + (oi.fixedStandardPrice * oi.quantity), 0).toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="border border-zinc-200 rounded-lg overflow-hidden">
                <div className="bg-zinc-50 px-5 py-3 border-b border-zinc-200">
                  <h4 className="font-semibold text-zinc-900 text-sm uppercase tracking-wider">Operational Metrics</h4>
                </div>
                <div className="grid grid-cols-3 divide-x divide-zinc-200 bg-white">
                  <div className="p-4 flex flex-col items-center justify-center text-center"><Scale className="w-5 h-5 text-zinc-400 mb-2" /><p className="text-xl font-bold text-zinc-900">{Number.parseFloat(item.filament_weight_g || 0).toLocaleString()}g</p><p className="text-xs font-medium text-zinc-500 uppercase tracking-widest mt-1">Total Weight</p></div>
                  <div className="p-4 flex flex-col items-center justify-center text-center"><Clock className="w-5 h-5 text-zinc-400 mb-2" /><p className="text-xl font-bold text-zinc-900">{Number.parseFloat(item.print_time_hours || 0).toFixed(1)}h</p><p className="text-xs font-medium text-zinc-500 uppercase tracking-widest mt-1">Print Timeline</p></div>
                  <div className="p-4 flex flex-col items-center justify-center text-center"><Wrench className="w-5 h-5 text-zinc-400 mb-2" /><p className="text-xl font-bold text-zinc-900">{Number.parseFloat(item.labor_hours || 0).toFixed(1)}h</p><p className="text-xs font-medium text-zinc-500 uppercase tracking-widest mt-1">Labor Allocated</p></div>
                </div>
              </div>

              {data.financial_breakdown?.editorState?.labors?.length > 0 && (
                <div className="border border-zinc-200 rounded-lg overflow-hidden bg-white shadow-sm">
                  <div className="bg-zinc-50 px-5 py-3 border-b border-zinc-200">
                    <h4 className="font-semibold text-zinc-900 text-sm uppercase tracking-wider flex items-center gap-2">
                      <Wrench className="w-4 h-4 text-zinc-500" />
                      Labor Allocation Breakdown
                    </h4>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-zinc-600">
                      <thead className="bg-zinc-50 border-b border-zinc-200 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                        <tr>
                          <th className="px-6 py-3 font-semibold">Task</th>
                          <th className="px-6 py-3 font-semibold">Operation Phase</th>
                          <th className="px-6 py-3 font-semibold">Worker / Assigned</th>
                          <th className="px-6 py-3 font-semibold text-center">Duration</th>
                          <th className="px-6 py-3 font-semibold text-right">Rate</th>
                          <th className="px-6 py-3 font-semibold text-right">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100 bg-white">
                        {data.financial_breakdown.editorState.labors.map((lab, index) => (
                          <tr key={lab.id || index} className="hover:bg-zinc-50/50 transition-colors">
                            <td className="px-6 py-4 whitespace-nowrap font-bold text-zinc-400 text-xs">
                              Task {index + 1}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap font-semibold text-zinc-900">
                              {lab.type}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-zinc-700 font-medium">
                              {lab.worker || <span className="text-zinc-400 italic">Unassigned</span>}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-center font-medium text-zinc-900">
                              {lab.hours} hrs
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-zinc-500 font-medium">
                              ₱{formatMoney(lab.rate)}/hr
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right font-bold text-zinc-900">
                              ₱{formatMoney((parseFloat(lab.hours) || 0) * (parseFloat(lab.rate) || 0))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {data.financial_breakdown ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Card 1: Cost Breakdown */}
                  <div className="border border-zinc-200 rounded-lg overflow-hidden flex flex-col bg-white shadow-sm">
                    <div className="bg-zinc-50 px-5 py-3 border-b border-zinc-200 flex items-center justify-between">
                      <h4 className="font-semibold text-zinc-900 text-sm uppercase tracking-wider flex items-center gap-2">
                        <Calculator className="w-4 h-4 text-zinc-500" />
                        Cost Breakdown
                      </h4>
                      <span className="text-xs text-zinc-500 font-medium tracking-wide bg-zinc-200/50 px-2 py-0.5 rounded">Snapshot</span>
                    </div>
                    <div className="p-5 flex flex-col gap-3 text-sm text-zinc-600 flex-1">
                      <div className="flex justify-between items-center"><span><span>Materials</span></span><span className="text-zinc-900">₱{formatMoney(data.financial_breakdown.filamentCost)}</span></div>
                      <div className="flex justify-between items-center"><span><span>Utilities</span></span><span className="text-zinc-900">₱{formatMoney(data.financial_breakdown.electricityCost)}</span></div>
                      {Number(data.financial_breakdown.supplementaryMatCost || 0) > 0 && <div className="flex justify-between items-center"><span><span>Supplementary</span></span><span className="text-zinc-900">₱{formatMoney(data.financial_breakdown.supplementaryMatCost)}</span></div>}
                      {Number(data.financial_breakdown.laborCost || 0) > 0 && <div className="flex justify-between items-center"><span><span>Labor</span></span><span className="text-zinc-900">₱{formatMoney(data.financial_breakdown.laborCost)}</span></div>}

                      <div className="flex flex-col items-end pt-5 border-t border-zinc-200 mt-auto">
                        <span className="text-xs font-bold uppercase tracking-widest text-zinc-400 mb-1">TOTAL COST</span>
                        <div className="flex items-baseline gap-1">
                          <span className="text-lg font-semibold text-zinc-400">₱</span>
                          <span className="text-4xl font-extrabold text-zinc-900 tracking-tight">
                            {formatMoney(
                              Number(data.financial_breakdown.filamentCost || 0) +
                              Number(data.financial_breakdown.electricityCost || 0) +
                              Number(data.financial_breakdown.supplementaryMatCost || 0) +
                              Number(data.financial_breakdown.laborCost || 0)
                            )}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Card 2: Pricing Summary & Allocations */}
                  <div className="border border-zinc-200 rounded-lg overflow-hidden flex flex-col bg-white shadow-sm">
                    <div className="bg-zinc-50 px-5 py-3 border-b border-zinc-200 flex items-center justify-between">
                      <h4 className="font-semibold text-zinc-900 text-sm uppercase tracking-wider flex items-center gap-2">
                        <Coins className="w-4 h-4 text-zinc-500" />
                        Pricing Summary & Allocations
                      </h4>
                    </div>
                    <div className="p-5 flex flex-col gap-3 text-sm text-zinc-600 flex-1">
                      {(() => {
                        const totalCost =
                          Number(data.financial_breakdown.filamentCost || 0) +
                          Number(data.financial_breakdown.electricityCost || 0) +
                          Number(data.financial_breakdown.supplementaryMatCost || 0) +
                          Number(data.financial_breakdown.laborCost || 0);
                        const sellingPrice = data.total_price || 0;
                        const grossProfit = sellingPrice - totalCost;
                        const machineWear = Number(data.financial_breakdown.wearTearCost || 0);
                        const wasteReserve = Number(data.financial_breakdown.failureBufferCost || 0);
                        const netProfit = grossProfit - machineWear - wasteReserve;
                        const amountPaid = data.financial_breakdown.amountPaid || 0;
                        const remainingBalance = Math.max(0, sellingPrice - amountPaid);

                        return (
                          <>
                            <div className="flex justify-between items-center font-bold text-zinc-900">
                              <span className="text-xs uppercase tracking-wider text-zinc-500 font-semibold">Selling Price</span>
                              <span>₱{formatMoney(sellingPrice)}</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span>Total Cost</span>
                              <span>₱{formatMoney(totalCost)}</span>
                            </div>

                            <div className="space-y-3 pt-3 border-t border-zinc-100">
                              <div className="flex justify-between items-center font-bold text-zinc-900">
                                <span>Gross Profit</span>
                                <span>₱{formatMoney(grossProfit)}</span>
                              </div>

                              <div className="flex justify-between items-center text-xs pl-2 text-zinc-500">
                                <span>Machine Wear</span>
                                <span>₱{formatMoney(machineWear)}</span>
                              </div>

                              <div className="flex justify-between items-center text-xs pl-2 text-zinc-500">
                                <span>Waste Reserve</span>
                                <span>₱{formatMoney(wasteReserve)}</span>
                              </div>

                              <div className="flex justify-between items-center font-bold border-t border-dashed border-zinc-200 pt-3 text-zinc-900">
                                <span>Net Profit</span>
                                <span className={netProfit >= 0 ? 'text-zinc-900' : 'text-red-600'}>
                                  ₱{formatMoney(netProfit)}
                                </span>
                              </div>
                            </div>

                            <div className="pt-4 border-t border-zinc-200 space-y-3 mt-auto">
                              <div className="flex justify-between items-center">
                                <span>Amount Paid</span>
                                <span className="font-bold text-emerald-600">₱{formatMoney(amountPaid)}</span>
                              </div>
                              <div className="flex justify-between items-center font-bold border-t border-dashed border-zinc-100 pt-2 text-zinc-950">
                                <span>Remaining Balance</span>
                                <span>₱{formatMoney(remainingBalance)}</span>
                              </div>

                              {data.financial_breakdown.paymentHistory && data.financial_breakdown.paymentHistory.length > 0 && (
                                <div className="mt-4 pt-3.5 border-t border-zinc-150">
                                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-2">Payment History</span>
                                  <div className="space-y-2 max-h-28 overflow-y-auto pr-1">
                                    {data.financial_breakdown.paymentHistory.map((entry, index) => (
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
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="border border-zinc-200 rounded-lg overflow-hidden bg-white shadow-sm">
                  <div className="bg-zinc-50 px-5 py-3 border-b border-zinc-200 flex items-center justify-between">
                    <h4 className="font-semibold text-zinc-900 text-sm uppercase tracking-wider flex items-center gap-2">
                      <Calculator className="w-4 h-4 text-zinc-500" />
                      Cost Breakdown
                    </h4>
                    <span className="text-xs text-zinc-500 font-medium tracking-wide bg-zinc-200/50 px-2 py-0.5 rounded">Unavailable</span>
                  </div>
                  <div className="bg-zinc-50 p-6 flex flex-col items-center justify-center text-center">
                    <Calculator className="w-6 h-6 text-zinc-300 mb-2" />
                    <p className="text-sm font-semibold text-zinc-500">Financial Snapshot Unavailable</p>
                    <p className="text-xs text-zinc-400 mt-1 max-w-[280px]">Legacy orders processed prior to the database upgrade do not contain price snapshots.</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-6 py-4 bg-zinc-50 border-t border-zinc-200 flex justify-end shrink-0">
          <button onClick={onClose} className="bg-white border border-zinc-300 hover:bg-zinc-100 text-zinc-900 text-sm font-semibold py-2 px-6 rounded transition-colors shadow-sm">
            Close Details
          </button>
        </div>
      </div>
      {isSettlingPayment && (
        <SettlePaymentModal
          orderId={orderId}
          onClose={() => setIsSettlingPayment(false)}
        />
      )}
    </div>
  );
}
