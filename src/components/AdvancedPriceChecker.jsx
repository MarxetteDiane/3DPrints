import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabaseClient';
import { adjustInventoryStock, fetchInventoryFilaments, fetchInventoryMaterials } from '../lib/inventory';
import { fetchProducts } from '../lib/products';
import { Trash2 } from 'lucide-react';
import PricingCalculator from './PricingCalculator';
import {
  calculateTotals,
  initEditorState,
  DEFAULT_CONFIG
} from '../lib/pricing';

export default function AdvancedPriceChecker({ config = DEFAULT_CONFIG }) {
  const [state, setState] = useState(() => initEditorState(config));
  const queryClient = useQueryClient();

  useEffect(() => {
    const handleLoadTemplate = (e) => {
      const template = e.detail;
      if (template) {
        setState((current) => ({
          ...current,
          ...template,
          clientName: template.clientName || current.clientName,
          clientContact: template.clientContact || template.clientPhone || current.clientContact,
          imageUrl: template.imageUrl || template.image_url || '',
          pricingMode: template.pricingMode || 'dynamic',
          fixedStandardPrice: template.fixedStandardPrice !== undefined ? Number(template.fixedStandardPrice) : 0,
          fixedFamilyPrice: template.fixedFamilyPrice !== undefined ? Number(template.fixedFamilyPrice) : 0,
          fixedQuantity: template.fixedQuantity !== undefined ? Number(template.fixedQuantity) : 1,
          addToGallery: template.addToGallery !== false,
          entryType: template.entryType || 'custom',
          orderItems: template.orderItems || [],
          customFinalPrice: template.customFinalPrice !== undefined ? String(template.customFinalPrice) : '',
        }));

        alert(`Successfully loaded recipe blueprint for "${template.itemName || 'Unnamed Item'}"! You can now adjust materials or save as a new order.`);
      }
    };

    window.addEventListener('load-calculator-template', handleLoadTemplate);
    return () => {
      window.removeEventListener('load-calculator-template', handleLoadTemplate);
    };
  }, []);

  const [showModal, setShowModal] = useState(false);
  const [additionalServices, setAdditionalServices] = useState({
    sanding: false,
    painting: false,
    assembly: false
  });

  // Read inventory filaments and products
  const [inventoryFilaments, setInventoryFilaments] = useState([]);
  const [inventoryMaterials, setInventoryMaterials] = useState([]);
  const [products, setProducts] = useState([]);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      fetchInventoryFilaments().catch(() => []),
      fetchInventoryMaterials().catch(() => []),
      fetchProducts().catch(() => []),
    ]).then(([filamentsData, materialsData, productsData]) => {
      if (cancelled) return;
      setInventoryFilaments(filamentsData);
      setInventoryMaterials(materialsData);
      setProducts(productsData);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  // Pre-calculate totals for additional services modal calculations
  const totals = calculateTotals(state, config);
  const { filCost, elecCost, totalMinutes, totalFilamentWeight } = totals;
  const wearTearCost = totals.wearTearCost;
  const failureBufferCost = totals.failureBufferCost;
  const laborCost = totals.laborCost;
  const matCost = totals.supplementaryMatCost;
  const logisticsCost = totals.logisticsCost;

  const servicesCost =
    (additionalServices.sanding ? (config?.sandingCost || 500) : 0) +
    (additionalServices.painting ? (config?.paintingCost || 800) : 0) +
    (additionalServices.assembly ? (config?.assemblyCost || 350) : 0);

  const rawOpsCost = elecCost + filCost + wearTearCost;
  const basePriceWithFailure = rawOpsCost + failureBufferCost + laborCost + matCost + logisticsCost + servicesCost;

  const isFamily = state.isFamilyPricing === true || state.isFamilyPricing === 'family';
  const isFree = state.isFamilyPricing === 'free';
  const isFixedMode = state.pricingMode === 'fixed';
  const appliedMarkupPercent = isFree ? 0 : (isFamily ? (config?.familyMarkupPercent || 15) : (config?.markupPercent || 30));

  const quantity = Math.max(1, parseInt(state.fixedQuantity) || 1);
  const calculatedFinalPrice = isFixedMode
    ? (isFree ? 0 : (isFamily ? Number(state.fixedFamilyPrice || 0) : Number(state.fixedStandardPrice || 0))) * quantity
    : (isFree ? 0 : (basePriceWithFailure + (basePriceWithFailure * (appliedMarkupPercent / 100))));

  const finalPrice = isFree ? 0 : Math.round(calculatedFinalPrice * 100) / 100;
  const markupCost = isFree ? 0 : (isFixedMode ? Math.max(0, finalPrice - basePriceWithFailure) : (basePriceWithFailure * (appliedMarkupPercent / 100)));

  // Deduct filament weights from inventory localStorage when an order is confirmed
  const deductInventoryStock = async () => {
    const filamentDeltaById = {};
    const materialDeltaById = {};

    state.plates.forEach((plate) => {
      plate.filaments.forEach((filament) => {
        if (!filament.inventoryId) return;
        const key = String(filament.inventoryId);
        filamentDeltaById[key] = (filamentDeltaById[key] || 0) - (parseFloat(filament.weight) || 0);
      });
    });

    state.materials.forEach((material) => {
      if (!material.inventoryId) return;
      const key = String(material.inventoryId);
      materialDeltaById[key] = (materialDeltaById[key] || 0) - (parseFloat(material.quantity) || 0);
    });

    await adjustInventoryStock({ filamentDeltaById, materialDeltaById });
  };

  const confirmOrderMutation = useMutation({
    mutationFn: async () => {
      const financial_breakdown = {
        electricityCost: elecCost,
        totalKWh: totals.totalKWh,
        filamentCost: filCost,
        wearTearCost: wearTearCost,
        failureBufferCost: failureBufferCost,
        laborCost: laborCost,
        supplementaryMatCost: matCost,
        logisticsCost: logisticsCost,
        servicesCost: servicesCost,
        markupCost: markupCost,
        failureRatePercent: config?.failureRatePercent || 10,
        markupPercent: appliedMarkupPercent,
        customFinalPrice: state.customFinalPrice !== '' && state.customFinalPrice !== undefined ? Math.round(Number(state.customFinalPrice) * 100) / 100 : null,
        pricingMode: state.pricingMode || 'dynamic',
        fixedStandardPrice: Number(state.fixedStandardPrice || 0),
        fixedFamilyPrice: Number(state.fixedFamilyPrice || 0),
        fixedQuantity: Number(state.fixedQuantity || 1),
        addToGallery: state.addToGallery !== false,
        editorState: state
      };

      const rawPrice = state.customFinalPrice !== '' && state.customFinalPrice !== undefined ? Number(state.customFinalPrice) : finalPrice;
      const roundedPrice = Math.round(rawPrice * 100) / 100;

      const { data: orderId, error: rpcErr } = await supabase.rpc('create_order_with_items', {
        p_client_name: state.clientName,
        p_client_phone: state.clientContact,
        p_item_name: state.itemName,
        p_filament_weight: totalFilamentWeight,
        p_print_time: totalMinutes / 60,
        p_plates: state.plates.length,
        p_labor_hours: state.labors.reduce((sum, lab) => sum + parseFloat(lab.hours || 0), 0),
        p_total_price: roundedPrice,
        p_financial_breakdown: financial_breakdown
      });

      if (rpcErr) throw rpcErr;

      // Update image_url in items table
      if (state.imageUrl) {
        const { error: itemUpdateErr } = await supabase
          .from('items')
          .update({ image_url: state.imageUrl })
          .eq('order_id', orderId);
        if (itemUpdateErr) {
          console.error('Failed to update item image URL:', itemUpdateErr);
        }
      }

      return orderId;
    },
    onSuccess: async () => {
      await deductInventoryStock();
      alert('Order successfully saved to Supabase (Optimized)!');
      queryClient.invalidateQueries({ queryKey: ['dashboard-data'] });
      setShowModal(false);
      setState(initEditorState(config));
      setAdditionalServices({ sanding: false, painting: false, assembly: false });
    },
    onError: (e) => {
      console.error('Database Error:', e.message);
      alert('Failed to save order to Supabase.');
      setShowModal(false);
    }
  });

  return (
    <>
      <PricingCalculator
        state={state}
        onChange={setState}
        config={config}
        inventoryFilaments={inventoryFilaments}
        inventoryMaterials={inventoryMaterials}
        products={products}
        rightColumnActions={
          <div className="flex bg-zinc-50 p-4 border-t border-zinc-200 gap-2">
            <button
              onClick={() => {
                if (!state.clientName?.trim() || !state.itemName?.trim()) {
                  alert('Please provide a Client Name and Item Name.');
                  return;
                }
                setShowModal(true);
              }}
              className="flex-1 bg-zinc-900 hover:bg-black text-white text-sm font-semibold py-2.5 px-4 rounded transition-colors text-center shadow-sm"
            >
              Commit Pricing
            </button>
            <button
              onClick={() => {
                setState(initEditorState(config));
                setAdditionalServices({ sanding: false, painting: false, assembly: false });
              }}
              className="w-10 bg-white border border-zinc-300 hover:bg-zinc-50 text-zinc-600 flex items-center justify-center rounded transition-colors shadow-sm"
              title="Reset Calculator"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        }
      />

      {/* ADDITIONAL SERVICES MODAL */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-lg shadow-2xl border border-zinc-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-zinc-200 flex justify-between items-center bg-zinc-50">
              <h3 className="text-sm font-bold tracking-tight text-zinc-900 uppercase">Additional Services</h3>
              <button onClick={() => setShowModal(false)} className="text-zinc-500 hover:text-zinc-900 transition-colors tooltip">✕</button>
            </div>

            <div className="p-6">
              <p className="text-sm text-zinc-500 mb-6 font-medium">Have you considered any post-processing services for this order? Select below to automatically inject them into the billable total.</p>

              <div className="space-y-4">
                {/* Checkbox item: Sanding */}
                <label className="flex items-start gap-3 p-3 border border-zinc-200 rounded-md cursor-pointer hover:bg-zinc-50 transition-colors">
                  <div className="mt-0.5">
                    <input
                      type="checkbox"
                      checked={additionalServices.sanding}
                      onChange={(e) => setAdditionalServices(p => ({ ...p, sanding: e.target.checked }))}
                      className="w-4 h-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 cursor-pointer"
                    />
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-bold text-zinc-900">Post-Print Sanding</span>
                      <span className="text-xs font-semibold text-zinc-500">+PHP {config?.sandingCost || 500}</span>
                    </div>
                    <p className="text-xs text-zinc-500 mt-1">Full surface smoothing and seam patching.</p>
                  </div>
                </label>

                {/* Checkbox item: Painting */}
                <label className="flex items-start gap-3 p-3 border border-zinc-200 rounded-md cursor-pointer hover:bg-zinc-50 transition-colors">
                  <div className="mt-0.5">
                    <input
                      type="checkbox"
                      checked={additionalServices.painting}
                      onChange={(e) => setAdditionalServices(p => ({ ...p, painting: e.target.checked }))}
                      className="w-4 h-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 cursor-pointer"
                    />
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-bold text-zinc-900">Primer & Painting</span>
                      <span className="text-xs font-semibold text-zinc-500">+PHP {config?.paintingCost || 800}</span>
                    </div>
                    <p className="text-xs text-zinc-500 mt-1">Multi-layer airbrushing and protective clear coat.</p>
                  </div>
                </label>

                {/* Checkbox item: Assembly */}
                <label className="flex items-start gap-3 p-3 border border-zinc-200 rounded-md cursor-pointer hover:bg-zinc-50 transition-colors">
                  <div className="mt-0.5">
                    <input
                      type="checkbox"
                      checked={additionalServices.assembly}
                      onChange={(e) => setAdditionalServices(p => ({ ...p, assembly: e.target.checked }))}
                      className="w-4 h-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 cursor-pointer"
                    />
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-bold text-zinc-900">Hardware Assembly</span>
                      <span className="text-xs font-semibold text-zinc-500">+PHP {config?.assemblyCost || 350}</span>
                    </div>
                    <p className="text-xs text-zinc-500 mt-1">Gluing, screwing, and final structural tests.</p>
                  </div>
                </label>
              </div>
            </div>

            <div className="p-5 border-t border-zinc-200 bg-white">
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">Override Final Sell Price (Optional)</label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder={`Default: PHP ${finalPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                  value={state.customFinalPrice || ''}
                  onChange={(e) => setState((current) => ({ ...current, customFinalPrice: e.target.value }))}
                  className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-md focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 transition-colors text-sm text-zinc-900 font-medium"
                />
                <span className="absolute inset-y-0 right-3 flex items-center text-zinc-400 text-xs font-semibold pointer-events-none">PHP</span>
              </div>
            </div>

            <div className="p-4 border-t border-zinc-200 bg-zinc-50 flex items-center justify-between">
              <div className="flex items-baseline gap-1">
                <span className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">New Total:</span>
                <span className="text-lg font-bold text-zinc-900 tracking-tight ml-1">
                  PHP {state.customFinalPrice !== '' && state.customFinalPrice !== undefined ? Number(state.customFinalPrice).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : finalPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <button
                disabled={confirmOrderMutation.isPending}
                onClick={async () => {
                  if (!state.clientName?.trim() || !state.itemName?.trim()) {
                    alert('Please provide a Client Name and Item Name.');
                    return;
                  }
                  confirmOrderMutation.mutate();
                }}
                className="bg-zinc-900 hover:bg-black text-white text-sm font-semibold py-2 px-5 rounded transition-colors shadow-sm disabled:opacity-50"
              >
                {confirmOrderMutation.isPending ? 'Saving...' : 'Confirm Order'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
