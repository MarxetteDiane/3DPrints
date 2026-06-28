import React, { useState, useEffect } from 'react';
import {
  Layers, Plus, Minus, Trash2, Box, Zap, Clock, Coins, Wrench, CheckCircle2, Paintbrush, Shield, User, Tag, Calculator
} from 'lucide-react';
import {
  makeId,
  createFilament,
  createPlate,
  createMaterial,
  createLabor,
  calculateTotals,
  getStockWarning,
  buildInventoryUsageMap,
  buildMaterialUsageMap
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

export default function PricingCalculator({
  state,
  onChange,
  config,
  inventoryFilaments = [],
  inventoryMaterials = [],
  products = [],
  prevFilamentUsage = {},
  prevMaterialUsage = {},
  rightColumnActions = null,
}) {
  const [selectedProductId, setSelectedProductId] = useState('');
  const [selectedVariantId, setSelectedVariantId] = useState('');
  const [selectedQty, setSelectedQty] = useState(1);
  const [uploadingImage, setUploadingImage] = useState(false);

  const updateField = (field, value) => {
    onChange((current) => ({ ...current, [field]: value }));
  };

  const addPlate = () => {
    onChange((current) => ({
      ...current,
      plates: [...current.plates, createPlate()],
    }));
  };

  const removePlate = (plateId) => {
    onChange((current) => ({
      ...current,
      plates: current.plates.length > 1
        ? current.plates.filter((p) => p.id !== plateId)
        : current.plates,
    }));
  };

  const updatePlate = (plateId, field, value) => {
    onChange((current) => ({
      ...current,
      plates: current.plates.map((p) =>
        p.id === plateId ? { ...p, [field]: value } : p,
      ),
    }));
  };

  const addPlateFilament = (plateId) => {
    onChange((current) => ({
      ...current,
      plates: current.plates.map((p) =>
        p.id === plateId
          ? { ...p, filaments: [...p.filaments, createFilament()] }
          : p,
      ),
    }));
  };

  const updatePlateFilament = (plateId, filamentId, field, value) => {
    onChange((current) => ({
      ...current,
      plates: current.plates.map((p) =>
        p.id === plateId
          ? {
              ...p,
              filaments: p.filaments.map((f) =>
                f.id === filamentId ? { ...f, [field]: value } : f,
              ),
            }
          : p,
      ),
    }));
  };

  const updatePlateFilamentInventory = (plateId, filamentId, value) => {
    const selected = inventoryFilaments.find((filament) => String(filament.id) === value);
    onChange((current) => ({
      ...current,
      plates: current.plates.map((p) =>
        p.id === plateId
          ? {
              ...p,
              filaments: p.filaments.map((f) =>
                f.id === filamentId
                  ? {
                      ...f,
                      inventoryId: selected ? selected.id : '',
                      costPerKg: selected ? selected.costPerKg : f.costPerKg,
                    }
                  : f,
              ),
            }
          : p,
      ),
    }));
  };

  const removePlateFilament = (plateId, filamentId) => {
    onChange((current) => ({
      ...current,
      plates: current.plates.map((p) =>
        p.id === plateId
          ? {
              ...p,
              filaments: p.filaments.length > 1
                ? p.filaments.filter((f) => f.id !== filamentId)
                : p.filaments,
            }
          : p,
      ),
    }));
  };

  const addMaterial = () => {
    onChange((current) => ({
      ...current,
      materials: [...current.materials, createMaterial()],
    }));
  };

  const updateMaterial = (materialId, field, value) => {
    onChange((current) => ({
      ...current,
      materials: current.materials.map((m) =>
        m.id === materialId ? { ...m, [field]: value } : m,
      ),
    }));
  };

  const updateMaterialInventory = (materialId, value) => {
    const selected = inventoryMaterials.find((material) => String(material.id) === value);
    onChange((current) => ({
      ...current,
      materials: current.materials.map((m) =>
        m.id === materialId
          ? {
              ...m,
              inventoryId: selected ? selected.id : '',
              name: selected ? selected.name : m.name,
              unit: selected ? (selected.unit || '') : m.unit,
              costPerUnit: selected
                ? Number(
                    selected.costPerUnit ??
                    (((Number(selected.bulkPrice) || 0) /
                      Math.max(1, Number(selected.quantity) || 1)) || 0),
                  )
                : m.costPerUnit,
            }
          : m,
      ),
    }));
  };

  const removeMaterial = (materialId) => {
    onChange((current) => ({
      ...current,
      materials: current.materials.filter((m) => m.id !== materialId),
    }));
  };

  const addLabor = () => {
    onChange((current) => ({
      ...current,
      labors: [...current.labors, createLabor(config?.hourlyLaborRate || 250)],
    }));
  };

  const updateLabor = (laborId, field, value) => {
    onChange((current) => ({
      ...current,
      labors: current.labors.map((l) =>
        l.id === laborId ? { ...l, [field]: value } : l,
      ),
    }));
  };

  const removeLabor = (laborId) => {
    onChange((current) => ({
      ...current,
      labors: current.labors.length > 1
        ? current.labors.filter((l) => l.id !== laborId)
        : current.labors,
    }));
  };

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
        updateField('imageUrl', compressedBase64);
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

  // State local helpers mapping
  const entryType = state.entryType || 'custom';
  const orderItems = state.orderItems || [];

  // Totals calculations
  const totals = calculateTotals(state, config);
  const filCost = totals.filCost;
  const elecCost = totals.elecCost;
  const matCost = totals.supplementaryMatCost;
  const laborCost = totals.laborCost;
  const displayTotalCost = totals.filCost + totals.elecCost + totals.supplementaryMatCost + totals.laborCost;
  const finalPrice = totals.finalPrice;
  const wearTearCost = totals.wearTearCost;
  const failureBufferCost = totals.failureBufferCost;

  // Sync catalog order items
  useEffect(() => {
    if (entryType === 'catalog') {
      if (orderItems.length === 0) {
        onChange((current) => ({
          ...current,
          itemName: '',
          fixedStandardPrice: 0,
          fixedFamilyPrice: 0,
          plates: [createPlate()],
          labors: [createLabor(config?.hourlyLaborRate || 250)]
        }));
        return;
      }

      const totalQuantity = orderItems.reduce((sum, item) => sum + item.quantity, 0);
      const combinedItemName = orderItems.length === 1
        ? `${orderItems[0].quantity}x ${orderItems[0].productName} (${orderItems[0].variantName})`
        : `${totalQuantity} Items`;

      const fixedStandardPrice = orderItems.reduce((sum, item) => sum + (item.fixedStandardPrice * item.quantity), 0);
      const fixedFamilyPrice = orderItems.reduce((sum, item) => sum + (item.fixedFamilyPrice * item.quantity), 0);

      const plates = orderItems.map((item) => {
        const totalHours = item.printTimeHours * item.quantity;
        const printTimeHours = Math.floor(totalHours);
        const printTimeMinutes = Math.round((totalHours % 1) * 60);

        return {
          id: item.id,
          printTimeHours,
          printTimeMinutes,
          filamentChangeCount: 0,
          filaments: [{
            id: item.id + 1,
            weight: item.weightGrams * item.quantity,
            costPerKg: 700
          }]
        };
      });

      const totalLaborHours = orderItems.reduce((sum, item) => sum + (item.laborHours * item.quantity), 0);
      const labors = [{
        id: Date.now() + 20,
        type: '3D Modeling & Printing',
        hours: totalLaborHours,
        rate: config?.hourlyLaborRate || 250,
        worker: ''
      }];

      onChange((current) => ({
        ...current,
        itemName: combinedItemName,
        fixedStandardPrice,
        fixedFamilyPrice,
        pricingMode: 'fixed',
        plates,
        labors
      }));
    }
  }, [orderItems, entryType]);

  const uFilamentUsage = buildInventoryUsageMap(state);
  const uMaterialUsage = buildMaterialUsageMap(state);

  return (
    <div className="flex flex-col lg:flex-row gap-6 items-start font-sans w-full">
      {/* LEFT COLUMN: Input Sections */}
      <div className="flex-1 w-full space-y-6">
        {/* Section: Client Identity */}
        <section className="bg-white border border-zinc-200 shadow-sm rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-200 flex items-center gap-2">
            <User className="w-4 h-4 text-zinc-500" />
            <h2 className="text-sm font-semibold text-zinc-900 uppercase tracking-widest">Client Identity</h2>
          </div>
          <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-5">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">
                Client Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={state.clientName || ''}
                onChange={(e) => updateField('clientName', e.target.value)}
                placeholder="e.g., John Doe"
                required
                className={fieldClass}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">
                Contact / Phone (Optional)
              </label>
              <input
                type="text"
                value={state.clientContact || ''}
                onChange={(e) => updateField('clientContact', e.target.value)}
                placeholder="+63 912 345 6789"
                className={fieldClass}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">Pricing Tier</label>
              <select
                value={String(state.isFamilyPricing)}
                onChange={(e) => {
                  const val = e.target.value;
                  updateField('isFamilyPricing', val === 'true' ? true : val === 'false' ? false : val);
                }}
                className={fieldClass}
              >
                <option value="free">Free / Print Test</option>
                <option value="true">Family / Friends Pricing</option>
                <option value="false">Standard Pricing</option>
              </select>
            </div>
          </div>
        </section>

        {/* Section: Object Info */}
        <section className="bg-white border border-zinc-200 shadow-sm rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-200 flex items-center justify-between bg-zinc-50/50 flex-wrap gap-2">
            <h2 className="text-sm font-semibold text-zinc-900 uppercase tracking-widest">1. Object Specification</h2>
            {/* Segmented Control */}
            <div className="flex bg-zinc-200/60 p-0.5 rounded-lg border border-zinc-200 text-xs font-semibold">
              <button
                type="button"
                onClick={() => {
                  onChange((current) => ({
                    ...current,
                    entryType: 'catalog',
                    pricingMode: 'fixed'
                  }));
                }}
                className={`px-3 py-1 rounded-md transition-all ${entryType === 'catalog' ? 'bg-white text-zinc-900 shadow-xs' : 'text-zinc-500 hover:text-zinc-900'}`}
              >
                Predefined Catalog
              </button>
              <button
                type="button"
                onClick={() => {
                  onChange((current) => ({
                    ...current,
                    entryType: 'custom',
                    orderItems: []
                  }));
                }}
                className={`px-3 py-1 rounded-md transition-all ${entryType === 'custom' ? 'bg-white text-zinc-900 shadow-xs' : 'text-zinc-500 hover:text-zinc-900'}`}
              >
                Custom Print
              </button>
            </div>
          </div>

          <div className="p-5 space-y-5">
            {entryType === 'catalog' ? (
              /* Predefined Order Form */
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3 bg-zinc-50 p-4 border border-zinc-200 rounded-xl items-end">
                  <div className="md:col-span-4">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5 flex items-center gap-1">
                      <Tag className="w-3.5 h-3.5 text-zinc-400" /> Predefined Product
                    </label>
                    <select
                      value={selectedProductId}
                      onChange={(e) => {
                        setSelectedProductId(e.target.value);
                        setSelectedVariantId('');
                      }}
                      className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-lg text-sm text-zinc-900 font-medium focus:outline-none focus:ring-1 focus:ring-zinc-900"
                    >
                      <option value="">-- Choose Product --</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="md:col-span-4">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5">
                      Select Variant
                    </label>
                    <select
                      value={selectedVariantId}
                      disabled={!selectedProductId}
                      onChange={(e) => setSelectedVariantId(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-lg text-sm text-zinc-900 font-medium disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-1 focus:ring-zinc-900"
                    >
                      <option value="">-- Choose Variant --</option>
                      {selectedProductId &&
                        products
                          .find((p) => p.id === selectedProductId)
                          ?.variants.map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.name} - PHP {v.fixedStandardPrice}
                            </option>
                          ))}
                    </select>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5">
                      Qty
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={selectedQty}
                      onChange={(e) => setSelectedQty(Math.max(1, Number(e.target.value)))}
                      className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-lg text-sm text-center text-zinc-900 font-bold focus:outline-none focus:ring-1 focus:ring-zinc-900"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <button
                      type="button"
                      disabled={!selectedProductId || !selectedVariantId}
                      onClick={() => {
                        const product = products.find((p) => p.id === selectedProductId);
                        if (product) {
                          const variant = product.variants.find((v) => v.id === selectedVariantId);
                          if (variant) {
                            const existingIndex = orderItems.findIndex(
                              (item) => item.productId === product.id && item.variantId === variant.id
                            );

                            if (existingIndex > -1) {
                              const updated = [...orderItems];
                              updated[existingIndex].quantity += selectedQty;
                              onChange((current) => ({ ...current, orderItems: updated }));
                            } else {
                              onChange((current) => ({
                                ...current,
                                orderItems: [
                                  ...orderItems,
                                  {
                                    id: Date.now(),
                                    productId: product.id,
                                    productName: product.name,
                                    variantId: variant.id,
                                    variantName: variant.name,
                                    fixedStandardPrice: variant.fixedStandardPrice,
                                    fixedFamilyPrice: variant.fixedFamilyPrice,
                                    printTimeHours: variant.printTimeHours,
                                    weightGrams: variant.weightGrams,
                                    laborHours: variant.laborHours,
                                    quantity: selectedQty,
                                  },
                                ]
                              }));
                            }
                            setSelectedQty(1);
                          }
                        }
                      }}
                      className="w-full bg-zinc-900 hover:bg-black text-white text-xs font-bold py-2 rounded-lg transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed h-[38px] flex items-center justify-center gap-1.5"
                    >
                      <Plus className="w-4 h-4" /> Add
                    </button>
                  </div>
                </div>

                {orderItems.length > 0 && (
                  <div className="border border-zinc-200 rounded-xl overflow-hidden bg-white">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-zinc-50 border-b border-zinc-200 text-zinc-500 font-bold uppercase tracking-wider">
                          <th className="p-3 pl-4">Product / Variant</th>
                          <th className="p-3 text-center">Unit Price</th>
                          <th className="p-3 text-center">Qty</th>
                          <th className="p-3 text-right pr-4">Subtotal</th>
                          <th className="p-3 w-10"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-200">
                        {orderItems.map((item) => (
                          <tr key={item.id} className="hover:bg-zinc-50/50 transition-colors">
                            <td className="p-3 pl-4 font-semibold text-zinc-800">
                              {item.productName}
                              <span className="block text-[10px] text-zinc-400 font-normal">
                                {item.variantName}
                              </span>
                            </td>
                            <td className="p-3 text-center font-medium text-zinc-600">
                              ₱{formatMoney(state.isFamilyPricing ? item.fixedFamilyPrice : item.fixedStandardPrice)}
                            </td>
                            <td className="p-3 text-center font-bold text-zinc-900">
                              <div className="inline-flex items-center gap-1 bg-zinc-50 border border-zinc-200 rounded-lg p-0.5 justify-center mx-auto">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updated = orderItems.map((oi) =>
                                      oi.id === item.id
                                        ? { ...oi, quantity: Math.max(1, oi.quantity - 1) }
                                        : oi
                                    );
                                    onChange((current) => ({ ...current, orderItems: updated }));
                                  }}
                                  className="p-1 hover:bg-zinc-200 rounded text-zinc-500 transition-colors flex items-center justify-center"
                                >
                                  <Minus className="w-3 h-3" />
                                </button>
                                <input
                                  type="number"
                                  min="1"
                                  value={item.quantity}
                                  onChange={(e) => {
                                    const val = Math.max(1, parseInt(e.target.value, 10) || 1);
                                    const updated = orderItems.map((oi) =>
                                      oi.id === item.id
                                        ? { ...oi, quantity: val }
                                        : oi
                                    );
                                    onChange((current) => ({ ...current, orderItems: updated }));
                                  }}
                                  className="w-8 text-center bg-transparent border-0 focus:outline-none focus:ring-0 p-0 text-xs font-bold text-zinc-900 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updated = orderItems.map((oi) =>
                                      oi.id === item.id
                                        ? { ...oi, quantity: oi.quantity + 1 }
                                        : oi
                                    );
                                    onChange((current) => ({ ...current, orderItems: updated }));
                                  }}
                                  className="p-1 hover:bg-zinc-200 rounded text-zinc-500 transition-colors flex items-center justify-center"
                                >
                                  <Plus className="w-3 h-3" />
                                </button>
                              </div>
                            </td>
                            <td className="p-3 text-right pr-4 font-bold text-zinc-950">
                              ₱{formatMoney((state.isFamilyPricing ? item.fixedFamilyPrice : item.fixedStandardPrice) * item.quantity)}
                            </td>
                            <td className="p-3 pr-4 text-center">
                              <button
                                type="button"
                                onClick={() => {
                                  const updated = orderItems.filter((oi) => oi.id !== item.id);
                                  onChange((current) => ({ ...current, orderItems: updated }));
                                }}
                                className="text-zinc-400 hover:text-red-600 transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : (
              /* Custom Print Info Fields */
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">Item Name</label>
                  <input
                    type="text"
                    value={state.itemName || ''}
                    onChange={(e) => updateField('itemName', e.target.value)}
                    placeholder="e.g. Master Sword Prop"
                    className={fieldClass}
                  />
                </div>

                {/* Pricing Mode Selection */}
                <div className="border-t border-zinc-100 pt-4">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">Pricing Mode</label>
                  <div className="flex gap-2 p-1 bg-zinc-100 rounded-lg max-w-sm mb-4">
                    <button
                      type="button"
                      onClick={() => updateField('pricingMode', 'dynamic')}
                      className={`flex-1 text-center py-1.5 text-xs font-bold rounded-md transition-all ${
                        state.pricingMode === 'dynamic' || !state.pricingMode
                          ? 'bg-white text-zinc-900 shadow-sm'
                          : 'text-zinc-500 hover:text-zinc-950'
                      }`}
                    >
                      📊 Calculated Estimate
                    </button>
                    <button
                      type="button"
                      onClick={() => updateField('pricingMode', 'fixed')}
                      className={`flex-1 text-center py-1.5 text-xs font-bold rounded-md transition-all ${
                        state.pricingMode === 'fixed'
                          ? 'bg-white text-zinc-900 shadow-sm'
                          : 'text-zinc-500 hover:text-zinc-950'
                      }`}
                    >
                      🏷️ Fixed Catalog Price
                    </button>
                  </div>

                  {state.pricingMode === 'fixed' && (
                    <div className="grid grid-cols-3 gap-4 bg-zinc-50 border border-zinc-200/60 rounded-xl p-4 animate-in slide-in-from-top-1 duration-200">
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5">Quantity</label>
                        <input
                          type="number"
                          value={state.fixedQuantity === 0 ? '' : state.fixedQuantity}
                          onChange={(e) => updateField('fixedQuantity', e.target.value === '' ? 0 : Number(e.target.value))}
                          placeholder="e.g., 1"
                          className={`${fieldClass} bg-white font-bold`}
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5">Fixed Standard (PHP)</label>
                        <input
                          type="number"
                          value={state.fixedStandardPrice === 0 ? '' : state.fixedStandardPrice}
                          onChange={(e) => updateField('fixedStandardPrice', e.target.value === '' ? 0 : Number(e.target.value))}
                          placeholder="e.g., 500"
                          className={`${fieldClass} bg-white font-bold`}
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5">Fixed Family (PHP)</label>
                        <input
                          type="number"
                          value={state.fixedFamilyPrice === 0 ? '' : state.fixedFamilyPrice}
                          onChange={(e) => updateField('fixedFamilyPrice', e.target.value === '' ? 0 : Number(e.target.value))}
                          placeholder="e.g., 350"
                          className={`${fieldClass} bg-white font-bold`}
                        />
                      </div>
                      <p className="col-span-3 text-[10px] text-zinc-400 font-medium italic mt-1 leading-normal">
                        * Internal production costs (materials, labor, wear & tear) will still be tracked for exact margin reporting, but standard and family tier billable totals are locked to these pre-sets.
                      </p>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">Product Photo</label>
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-2.5 items-center">
                      <input
                        type="file"
                        accept="image/*"
                        id="shared-image-uploader"
                        className="hidden"
                        onChange={handleImageFileChange}
                      />
                      <button
                        type="button"
                        onClick={() => document.getElementById('shared-image-uploader').click()}
                        disabled={uploadingImage}
                        className="px-3.5 py-1.5 bg-zinc-900 hover:bg-black text-white text-xs font-bold rounded-lg transition-all shadow-sm flex items-center gap-1.5 disabled:opacity-50"
                      >
                        {uploadingImage ? 'Compressing...' : 'Upload Image File'}
                      </button>
                      <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">or paste link below:</span>
                    </div>

                    <div className="flex gap-4 items-start">
                      <input
                        value={state.imageUrl || ''}
                        onChange={(e) => updateField('imageUrl', e.target.value)}
                        placeholder="https://images.unsplash.com/... or paste image URL"
                        className={fieldClass}
                      />
                      {state.imageUrl && (
                        <div className="w-12 h-12 rounded-md border border-zinc-200 overflow-hidden bg-zinc-50 shrink-0 shadow-sm flex items-center justify-center relative group">
                          <img
                            src={state.imageUrl}
                            alt="preview"
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              e.target.style.display = 'none';
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => updateField('imageUrl', '')}
                            className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-[10px] text-white font-bold"
                            title="Clear photo"
                          >
                            Clear
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Gallery Inclusion Switch – only for custom prints */}
                <div className="border-t border-zinc-100 pt-4 flex items-center gap-2.5">
                  <input
                    type="checkbox"
                    id="addToGallery"
                    checked={state.addToGallery !== false}
                    onChange={(e) => updateField('addToGallery', e.target.checked)}
                    className="w-4 h-4 rounded text-zinc-900 border-zinc-300 focus:ring-zinc-900 focus:ring-opacity-50 accent-zinc-900 cursor-pointer"
                  />
                  <label htmlFor="addToGallery" className="text-xs font-bold text-zinc-700 cursor-pointer select-none">
                    Add this product to the Product Gallery
                  </label>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Section: Plates & Operations */}
        <section className="bg-white border border-zinc-200 shadow-sm rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-200 flex items-center justify-between bg-zinc-50">
            <h2 className="text-sm font-semibold text-zinc-900 uppercase tracking-widest flex items-center gap-2">
              <Layers className="w-4 h-4 text-zinc-500" /> 2. Plates & Operations
            </h2>
            <button
              onClick={addPlate}
              className="text-xs font-medium text-zinc-700 bg-white border border-zinc-200 hover:bg-zinc-50 px-2 py-1 rounded transition-colors flex items-center gap-1 shadow-sm"
            >
              <Plus className="w-3 h-3" /> Add Plate
            </button>
          </div>

          <div className="p-4 sm:p-5 space-y-6">
            {state.plates?.map((plate, index) => {
              // Calculate electricity cost for this plate
              const pFilaChangesCount = Math.max(1, parseInt(plate.filamentChangeCount, 10) || 0);
              const hours = Math.max(0, parseFloat(plate.printTimeHours) || 0);
              const minutes = Math.max(0, parseFloat(plate.printTimeMinutes) || 0);
              const plateMinutes = hours * 60 + minutes;
              const totalPlateHours = plateMinutes / 60;
              const surgeHours = 8 / 60;
              let surgeKWh = 0;
              let normalKWh = 0;

              if (totalPlateHours > 0) {
                surgeKWh = surgeHours * (config?.powerSurgeKwh || 1.3);
                const remainingHours = Math.max(0, totalPlateHours - surgeHours);
                normalKWh = remainingHours * (config?.printerKwhPerHour || 0.2);
              } else {
                surgeKWh = surgeHours * (config?.powerSurgeKwh || 1.3);
              }
              const plateKWh = surgeKWh + normalKWh;
              const plateElecCost =
                plateKWh * (config?.baseCostRate || 14.16) +
                pFilaChangesCount * (config?.filamentChangeCost || 0.1);

              // Calculate filament cost for this plate
              let plateFilCost = 0;
              plate.filaments?.forEach((f) => {
                const weight = Math.max(0, parseFloat(f.weight) || 0);
                plateFilCost += (weight / 1000) * Math.max(0, parseFloat(f.costPerKg) || 0);
              });

              return (
                <div key={plate.id} className="border border-zinc-200 rounded-lg overflow-hidden bg-zinc-50/50 shadow-sm transition-all animate-in fade-in duration-200">
                  <div className="px-4 py-3 border-b border-zinc-200 bg-white flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <h3 className="text-sm font-bold tracking-tight text-zinc-800">Plate {index + 1}</h3>
                      <div className="flex flex-wrap gap-2 text-[10px]">
                        <span className="bg-zinc-100 text-zinc-600 px-2 py-0.5 rounded font-bold uppercase tracking-wider">
                          Filament: PHP {formatMoney(plateFilCost)}
                        </span>
                        <span className="bg-zinc-100 text-zinc-600 px-2 py-0.5 rounded font-bold uppercase tracking-wider">
                          Electricity: PHP {formatMoney(plateElecCost)}
                        </span>
                      </div>
                    </div>
                    {state.plates.length > 1 && (
                      <button
                        onClick={() => removePlate(plate.id)}
                        className="p-1.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5 border-b border-zinc-200 bg-zinc-50/50">
                    <div className="flex flex-col gap-2">
                      <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">Print Timeline</label>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="relative">
                          <input
                            type="number"
                            min="0"
                            value={plate.printTimeHours}
                            onChange={(e) => updatePlate(plate.id, 'printTimeHours', e.target.value === '' ? '' : Number(e.target.value))}
                            className={`${fieldClass} pr-12`}
                          />
                          <span className="absolute inset-y-0 right-3 flex items-center text-zinc-400 text-xs pointer-events-none uppercase">hrs</span>
                        </div>
                        <div className="relative">
                          <input
                            type="number"
                            min="0"
                            max="59"
                            value={plate.printTimeMinutes}
                            onChange={(e) => updatePlate(plate.id, 'printTimeMinutes', e.target.value === '' ? '' : Number(e.target.value))}
                            className={`${fieldClass} pr-12`}
                          />
                          <span className="absolute inset-y-0 right-3 flex items-center text-zinc-400 text-xs pointer-events-none uppercase">mins</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">Filament Changes</label>
                      <div className="relative">
                        <input
                          type="number"
                          min="0"
                          value={plate.filamentChangeCount}
                          onChange={(e) => updatePlate(plate.id, 'filamentChangeCount', e.target.value === '' ? '' : Number(e.target.value))}
                          className={`${fieldClass} pr-12`}
                        />
                        <span className="absolute inset-y-0 right-3 flex items-center text-zinc-400 text-xs pointer-events-none uppercase">qty</span>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 bg-white">
                    <div className="flex items-center justify-between mb-3">
                      <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">Filaments Used</label>
                      <button
                        onClick={() => addPlateFilament(plate.id)}
                        className="text-[11px] font-medium text-zinc-700 bg-zinc-100 hover:bg-zinc-200 px-2 py-1.5 rounded transition-colors flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" /> Add Filament
                      </button>
                    </div>
                    <div className="space-y-3">
                      {plate.filaments?.map((filament, fIndex) => (
                        <div key={filament.id} className="grid grid-cols-1 md:grid-cols-[1.5fr_1fr_1fr_auto] gap-4 md:gap-3 items-end bg-zinc-50/50 p-4 md:p-3 rounded border border-zinc-100 animate-in fade-in duration-150">
                          <div>
                            <label className="block text-[10px] font-semibold uppercase tracking-widest text-zinc-500 mb-1">Filament {fIndex + 1}</label>
                            <select
                              value={filament.inventoryId || ''}
                              onChange={(e) => updatePlateFilamentInventory(plate.id, filament.id, e.target.value)}
                              className={fieldClass}
                            >
                              <option value="">— select filament —</option>
                              {inventoryFilaments.map((inv) => (
                                <option key={inv.id} value={String(inv.id)}>
                                  {inv.type} – {inv.color} ({inv.brand})
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-[10px] font-semibold uppercase tracking-widest text-zinc-500 mb-1">Weight Used</label>
                            <div className="relative">
                              <input
                                type="number"
                                min="0"
                                value={filament.weight}
                                onChange={(e) => updatePlateFilament(plate.id, filament.id, 'weight', e.target.value === '' ? '' : Number(e.target.value))}
                                className={`${fieldClass} pr-9`}
                              />
                              <span className="absolute inset-y-0 right-3 flex items-center text-zinc-400 text-xs pointer-events-none">g</span>
                            </div>
                            {(() => {
                              if (!filament.inventoryId) return null;
                              const invItem = inventoryFilaments.find((f) => String(f.id) === String(filament.inventoryId));
                              if (!invItem) return null;
                              const totalUsed = uFilamentUsage[String(filament.inventoryId)] || 0;
                              const prevCommitted = prevFilamentUsage[String(filament.inventoryId)] || 0;
                              const effectiveStock = invItem.weightGrams + prevCommitted;
                              const warning = getStockWarning(filament.inventoryId, totalUsed, effectiveStock, 'g');
                              if (!warning) return null;
                              return (
                                <p className="mt-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 leading-snug flex items-center gap-1 animate-in slide-in-from-top-1 duration-200">
                                  ⚠️ {warning}
                                </p>
                              );
                            })()}
                          </div>
                          <div>
                            <label className="block text-[10px] font-semibold uppercase tracking-widest text-zinc-500 mb-1">Cost Rate</label>
                            <div className="relative">
                              <input
                                type="number"
                                min="0"
                                value={filament.costPerKg}
                                onChange={(e) => updatePlateFilament(plate.id, filament.id, 'costPerKg', e.target.value === '' ? '' : Number(e.target.value))}
                                className={`${fieldClass} pr-12`}
                              />
                              <span className="absolute inset-y-0 right-3 flex items-center text-zinc-400 text-xs pointer-events-none">PHP/kg</span>
                            </div>
                          </div>
                          <div className="flex h-[38px] items-center">
                            {plate.filaments.length > 1 && (
                              <button
                                onClick={() => removePlateFilament(plate.id, filament.id)}
                                className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Section: Supplementary Items */}
        <section className="bg-white border border-zinc-200 shadow-sm rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-200 flex items-center justify-between bg-zinc-50">
            <h2 className="text-sm font-semibold text-zinc-900 uppercase tracking-widest flex items-center gap-2">
              <Coins className="w-4 h-4 text-zinc-500" /> 3. Supplementary Items
            </h2>
            <button
              onClick={addMaterial}
              className="text-xs font-medium text-zinc-700 bg-white border border-zinc-200 hover:bg-zinc-50 px-2 py-1 rounded transition-colors flex items-center gap-1 shadow-sm"
            >
              <Plus className="w-3 h-3" /> Add Item
            </button>
          </div>
          <div className="p-4 sm:p-5">
            {state.materials?.length === 0 ? (
              <div className="py-4 text-xs text-zinc-400 text-center border border-dashed border-zinc-200 rounded bg-zinc-50">
                No supplementary items.
              </div>
            ) : (
              <div className="space-y-4">
                {state.materials?.map((mat) => (
                  <div key={mat.id} className="grid grid-cols-1 md:grid-cols-[1.7fr_0.8fr_1fr_auto] gap-4 md:gap-3 items-end bg-zinc-50 p-4 md:p-3 rounded border border-zinc-100 animate-in fade-in duration-200">
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">Inventory Item</label>
                      <select
                        value={mat.inventoryId || ''}
                        onChange={(e) => updateMaterialInventory(mat.id, e.target.value)}
                        className={fieldClass}
                      >
                        <option value="">-- select material/hardware --</option>
                        {inventoryMaterials.map((inv) => (
                          <option key={inv.id} value={String(inv.id)}>
                            {inv.name} ({inv.unit || 'pcs'})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">Qty</label>
                      <div className="relative">
                        <input
                          type="number"
                          min="0"
                          value={mat.quantity}
                          onChange={(e) => updateMaterial(mat.id, 'quantity', e.target.value === '' ? '' : Number(e.target.value))}
                          className={`${fieldClass} pr-10`}
                        />
                        <span className="absolute inset-y-0 right-3 flex items-center text-zinc-400 text-xs pointer-events-none">
                          {mat.unit || 'pcs'}
                        </span>
                      </div>
                      {(() => {
                        if (!mat.inventoryId) return null;
                        const invItem = inventoryMaterials.find((m) => String(m.id) === String(mat.inventoryId));
                        if (!invItem) return null;
                        const totalUsed = uMaterialUsage[String(mat.inventoryId)] || 0;
                        const prevCommitted = prevMaterialUsage[String(mat.inventoryId)] || 0;
                        const effectiveStock = invItem.quantity + prevCommitted;
                        const warning = getStockWarning(mat.inventoryId, totalUsed, effectiveStock, mat.unit || 'pcs');
                        if (!warning) return null;
                        return (
                          <p className="mt-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 leading-snug flex items-center gap-1 animate-in slide-in-from-top-1 duration-200">
                            ⚠️ {warning}
                          </p>
                        );
                      })()}
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">Cost / Unit</label>
                      <div className="relative">
                        <input
                          type="number"
                          min="0"
                          value={mat.costPerUnit}
                          onChange={(e) => updateMaterial(mat.id, 'costPerUnit', e.target.value === '' ? '' : Number(e.target.value))}
                          className={`${fieldClass} pr-12`}
                        />
                        <span className="absolute inset-y-0 right-3 flex items-center text-zinc-400 text-xs pointer-events-none">PHP</span>
                      </div>
                    </div>
                    <button
                      onClick={() => removeMaterial(mat.id)}
                      className="p-1.5 text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 rounded transition-colors shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Section: Processing & Labor */}
        <section className="bg-white border border-zinc-200 shadow-sm rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-200 flex items-center justify-between bg-zinc-50">
            <h2 className="text-sm font-semibold text-zinc-900 uppercase tracking-widest">4. Processing & Labor</h2>
            <button
              onClick={addLabor}
              className="text-xs font-medium text-zinc-700 bg-white border border-zinc-200 hover:bg-zinc-50 px-2 py-1 rounded transition-colors flex items-center gap-1 shadow-sm"
            >
              <Plus className="w-3 h-3" /> Add Labor
            </button>
          </div>
          <div className="p-4 sm:p-5">
            {state.labors?.length === 0 ? (
              <div className="py-4 text-xs text-zinc-400 text-center border border-dashed border-zinc-200 rounded bg-zinc-50">
                No labor items tracked.
              </div>
            ) : (
              <div className="space-y-4">
                {state.labors?.map((lab) => (
                  <div key={lab.id} className="grid grid-cols-1 md:grid-cols-[1.5fr_1.2fr_0.8fr_0.8fr_auto] gap-4 md:gap-3 items-end bg-zinc-50 p-4 md:p-3 rounded border border-zinc-100 animate-in fade-in duration-200">
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">Operation Phase</label>
                      <select
                        value={lab.type}
                        onChange={(e) => updateLabor(lab.id, 'type', e.target.value)}
                        className={fieldClass}
                      >
                        <option value="3D Modeling & Printing">3D Modeling & Printing</option>
                        <option value="Painting">Painting</option>
                        <option value="Sanding">Sanding</option>
                        <option value="Assembly">Assembly</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">Worker / Assigned</label>
                      <input
                        type="text"
                        placeholder="e.g. Macky"
                        value={lab.worker || ''}
                        onChange={(e) => updateLabor(lab.id, 'worker', e.target.value)}
                        className={fieldClass}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">Duration</label>
                      <div className="relative">
                        <input
                          type="number"
                          min="0"
                          value={lab.hours}
                          onChange={(e) => updateLabor(lab.id, 'hours', e.target.value === '' ? '' : Number(e.target.value))}
                          className={`${fieldClass} pr-10`}
                        />
                        <span className="absolute inset-y-0 right-3 flex items-center text-zinc-400 text-xs pointer-events-none">hrs</span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">Rate</label>
                      <div className="relative">
                        <input
                          type="number"
                          min="0"
                          value={lab.rate}
                          onChange={(e) => updateLabor(lab.id, 'rate', e.target.value === '' ? '' : Number(e.target.value))}
                          className={`${fieldClass} pr-10`}
                        />
                        <span className="absolute inset-y-0 right-3 flex items-center text-zinc-400 text-xs pointer-events-none">/hr</span>
                      </div>
                    </div>
                    <button
                      onClick={() => removeLabor(lab.id)}
                      className="p-2.5 text-zinc-400 hover:text-zinc-950 hover:bg-zinc-200 rounded transition-colors"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Section: Packaging & Shipping */}
        <section className="bg-white border border-zinc-200 shadow-sm rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-200">
            <h2 className="text-sm font-semibold text-zinc-900 uppercase tracking-widest">5. Packaging & Shipping</h2>
          </div>
          <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-5">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">Packaging</label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={state.packagingCost || 0}
                  onChange={(e) => updateField('packagingCost', e.target.value === '' ? '' : Number(e.target.value))}
                  className={`${fieldClass} pr-12 font-medium`}
                />
                <span className="absolute inset-y-0 right-3 flex items-center text-zinc-400 text-xs pointer-events-none">PHP</span>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">Shipping Cost</label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={state.shippingCost || 0}
                  onChange={(e) => updateField('shippingCost', e.target.value === '' ? '' : Number(e.target.value))}
                  className={`${fieldClass} pr-12 font-medium`}
                />
                <span className="absolute inset-y-0 right-3 flex items-center text-zinc-400 text-xs pointer-events-none">PHP</span>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">Miscellaneous</label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={state.miscellaneousCost || 0}
                  onChange={(e) => updateField('miscellaneousCost', e.target.value === '' ? '' : Number(e.target.value))}
                  className={`${fieldClass} pr-12 font-medium`}
                />
                <span className="absolute inset-y-0 right-3 flex items-center text-zinc-400 text-xs pointer-events-none">PHP</span>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* RIGHT COLUMN: Output Sticky Block */}
      <div className="w-full lg:w-[360px] lg:sticky top-6 space-y-6">
        {/* Cost Breakdown Card */}
        <div className="bg-white border border-zinc-300 shadow-xl shadow-zinc-100 rounded-lg overflow-hidden flex flex-col">
          <div className="p-5 border-b border-zinc-200 bg-zinc-50 flex items-center gap-2">
            <Calculator className="w-4 h-4 text-zinc-500" />
            <h2 className="text-sm font-bold tracking-tight text-zinc-900 uppercase">Cost Breakdown</h2>
          </div>

          <div className="p-6">
            <div className="space-y-3 font-medium text-sm text-zinc-600 border-b border-zinc-100 pb-5">
              <div className="flex justify-between items-center group">
                <span>Materials</span>
                <span className="text-zinc-900 group-hover:text-black">₱{formatMoney(filCost)}</span>
              </div>
              <div className="flex justify-between items-center group">
                <span>Utilities</span>
                <span className="text-zinc-900 group-hover:text-black">₱{formatMoney(elecCost)}</span>
              </div>
              {matCost > 0 && (
                <div className="flex justify-between items-center group">
                  <span>Supplementary</span>
                  <span className="text-zinc-900 group-hover:text-black">₱{formatMoney(matCost)}</span>
                </div>
              )}
              {laborCost > 0 && (
                <div className="flex justify-between items-center group">
                  <span>Labor</span>
                  <span className="text-zinc-900 group-hover:text-black">₱{formatMoney(laborCost)}</span>
                </div>
              )}
            </div>

            <div className="pt-4 flex flex-col items-end">
              <span className="text-xs font-bold uppercase tracking-widest text-zinc-400 mb-1">TOTAL COST</span>
              <div className="flex items-baseline gap-1">
                <span className="text-lg font-semibold text-zinc-400">₱</span>
                <span className="text-4xl font-extrabold text-zinc-900 tracking-tight">
                  {formatMoney(displayTotalCost)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Pricing Summary & Allocations Card */}
        <div className="bg-white border border-zinc-300 shadow-xl shadow-zinc-100 rounded-lg overflow-hidden flex flex-col">
          <div className="p-5 border-b border-zinc-200 bg-zinc-50 flex items-center gap-2">
            <Coins className="w-4 h-4 text-zinc-500" />
            <h2 className="text-sm font-bold tracking-tight text-zinc-900 uppercase">Pricing Summary & Allocations</h2>
          </div>

          <div className="p-6 space-y-4">
            <div className="flex justify-between items-center group">
              <span className="font-semibold text-xs uppercase tracking-wider text-zinc-500">Selling Price</span>
              <div
                className="relative w-40 cursor-text"
                onClick={(e) => {
                  const input = e.currentTarget.querySelector('input');
                  if (input) input.focus();
                }}
              >
                <span className="absolute inset-y-0 left-3 flex items-center text-zinc-400 text-sm font-bold pointer-events-none">
                  ₱
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={state.customFinalPrice || ''}
                  placeholder={formatMoney(totals.calculatedPrice)}
                  onChange={(e) => updateField('customFinalPrice', e.target.value)}
                  className="w-full pl-7 pr-3 py-1.5 text-right bg-zinc-50 border border-zinc-200 rounded-md text-sm font-bold text-zinc-950 focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 transition-colors"
                />
              </div>
            </div>
            {state.customFinalPrice !== '' && state.customFinalPrice !== undefined && (
              <div className="text-right">
                <button
                  onClick={() => updateField('customFinalPrice', '')}
                  className="text-[10px] text-zinc-400 hover:text-zinc-600 underline font-semibold transition-colors"
                >
                  Reset to Suggested (₱{formatMoney(totals.calculatedPrice)})
                </button>
              </div>
            )}

            <div className="flex justify-between items-center font-medium text-sm text-zinc-600 border-t border-zinc-100 pt-3">
              <span>Total Cost</span>
              <span className="text-zinc-900 font-semibold">₱{formatMoney(displayTotalCost)}</span>
            </div>

            {(() => {
              const priceVal =
                state.customFinalPrice !== '' && state.customFinalPrice !== undefined
                  ? Number(state.customFinalPrice)
                  : finalPrice;
              const grossProfitVal = priceVal - displayTotalCost;
              const machineWearVal = wearTearCost;
              const wasteReserveVal = failureBufferCost;
              const netProfitVal = grossProfitVal - machineWearVal - wasteReserveVal;

              return (
                <div className="space-y-3 pt-3 border-t border-zinc-100 font-medium text-sm text-zinc-600">
                  <div className="flex justify-between items-center font-bold text-zinc-900">
                    <span>Gross Profit</span>
                    <span>₱{formatMoney(grossProfitVal)}</span>
                  </div>

                  <div className="flex justify-between items-center text-xs pl-2 text-zinc-500">
                    <span>Machine Wear</span>
                    <span>₱{formatMoney(machineWearVal)}</span>
                  </div>

                  <div className="flex justify-between items-center text-xs pl-2 text-zinc-500">
                    <span>Waste Reserve</span>
                    <span>₱{formatMoney(wasteReserveVal)}</span>
                  </div>

                  <div className="flex justify-between items-center font-bold border-t border-dashed border-zinc-200 pt-3 text-zinc-900">
                    <span>Net Profit</span>
                    <span className={netProfitVal >= 0 ? 'text-zinc-900' : 'text-red-600'}>
                      ₱{formatMoney(netProfitVal)}
                    </span>
                  </div>
                </div>
              );
            })()}
          </div>

          {rightColumnActions}
        </div>
      </div>
    </div>
  );
}
