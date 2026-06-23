import { useState, useEffect } from 'react';
import { XCircle, ShoppingCart, Check, Scale } from 'lucide-react';

export default function RestockModal({ item, type, onClose, onUpdate, onRestock }) {
  const [quantityAdded, setQuantityAdded] = useState('');
  const [purchaseCost, setPurchaseCost] = useState('');
  const [payer, setPayer] = useState('');
  const [selectedPayer, setSelectedPayer] = useState('');
  const [customPayer, setCustomPayer] = useState('');
  const [showCustomPayer, setShowCustomPayer] = useState(false);

  useEffect(() => {
    setQuantityAdded('');
    setPurchaseCost('');
    setSelectedPayer('');
    setCustomPayer('');
    setShowCustomPayer(false);
    setPayer('');
  }, [item, type]);

  if (!item) return null;

  const isFilament = type === 'filament';
  
  // Numerical values
  const addedQtyNum = parseFloat(quantityAdded) || 0;
  const costNum = parseFloat(purchaseCost) || 0;

  // Filament Calculations
  const currentWeightGrams = isFilament ? (item.weightGrams || 0) : 0;
  const currentCostPerKg = isFilament ? (item.costPerKg || 0) : 0;
  const filamentValuePHP = (currentWeightGrams / 1000) * currentCostPerKg;
  const filamentNewTotalGrams = currentWeightGrams + addedQtyNum;
  const filamentNewValuePHP = filamentValuePHP + costNum;
  const filamentNewAvgCostPerKg = filamentNewTotalGrams > 0 
    ? (filamentNewValuePHP / (filamentNewTotalGrams / 1000)) 
    : currentCostPerKg;

  // Material Calculations
  const currentQty = !isFilament ? (item.quantity || 0) : 0;
  const currentCostPerUnit = !isFilament ? (item.costPerUnit || 0) : 0;
  const materialValuePHP = currentQty * currentCostPerUnit;
  const materialNewTotalQty = currentQty + addedQtyNum;
  const materialNewValuePHP = materialValuePHP + costNum;
  const materialNewAvgCostPerUnit = materialNewTotalQty > 0 
    ? (materialNewValuePHP / materialNewTotalQty) 
    : currentCostPerUnit;

  const handleConfirm = (e) => {
    e.preventDefault();

    if (addedQtyNum <= 0) {
      alert(`Please enter a valid ${isFilament ? 'weight (grams)' : 'quantity'} to add.`);
      return;
    }

    if (costNum < 0) {
      alert("Purchase cost cannot be negative.");
      return;
    }

    if (isFilament) {
      const roundedAvgCostPerKg = Math.round(filamentNewAvgCostPerKg * 100) / 100;
      const updatedFilament = {
        ...item,
        weightGrams: filamentNewTotalGrams,
        costPerKg: roundedAvgCostPerKg,
      };

      onUpdate(updatedFilament);
      onRestock?.({
        date: new Date().toISOString(),
        filamentId: item.id,
        filamentLabel: `${item.type || item.name}${item.color ? ' - ' + item.color : ''}${item.brand ? ' (' + item.brand + ')' : ''}`,
        gramsAdded: addedQtyNum,
        purchaseCost: costNum,
        prevCostPerKg: item.costPerKg,
        newCostPerKg: roundedAvgCostPerKg,
        prevWeightGrams: item.weightGrams,
        newWeightGrams: filamentNewTotalGrams,
        payer: payer,
      });
    } else {
      const roundedAvgCostPerUnit = Math.round(materialNewAvgCostPerUnit * 100) / 100;
      const roundedBulkPrice = Math.round(materialNewValuePHP * 100) / 100;
      
      onUpdate({
        ...item,
        quantity: materialNewTotalQty,
        bulkPrice: roundedBulkPrice,
        costPerUnit: roundedAvgCostPerUnit,
      });
      onRestock?.({
        date: new Date().toISOString(),
        itemType: 'material',
        itemId: item.id,
        itemLabel: item.name,
        itemCategory: item.category,
        unitLabel: item.unit,
        quantityAdded: addedQtyNum,
        purchaseCost: costNum,
        prevCostPerUnit: currentCostPerUnit,
        newCostPerUnit: roundedAvgCostPerUnit,
        prevQuantity: item.quantity,
        newQuantity: materialNewTotalQty,
        payer: payer,
      });
    }

    onClose();
  };

  const itemTitle = isFilament 
    ? `${item.type || 'PLA'} (${item.color || 'No Color'})`
    : item.name;

  const itemSubtitle = isFilament
    ? item.brand ? `Brand: ${item.brand}` : 'Generic brand'
    : `Category: ${item.category}`;

  const formatMoney = (val) => {
    return Number(val).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

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
              <ShoppingCart className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-zinc-950">Restock Inventory</h3>
              <p className="text-xs text-zinc-400 font-semibold mt-0.5">
                {itemTitle} • {itemSubtitle}
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

        <form onSubmit={handleConfirm} className="space-y-4">
          {/* Current Stock Summary Card */}
          <div className="grid grid-cols-2 gap-2 bg-zinc-50 p-3 rounded-lg border border-zinc-200">
            <div className="text-center border-r border-zinc-200">
              <span className="block text-[9px] font-bold text-zinc-450 uppercase tracking-wider mb-0.5">Current Stock</span>
              <span className="text-sm font-bold text-zinc-850">
                {isFilament 
                  ? `${currentWeightGrams.toLocaleString()}g`
                  : `${currentQty.toLocaleString()} ${item.unit || 'pcs'}`}
              </span>
            </div>
            <div className="text-center">
              <span className="block text-[9px] font-bold text-zinc-450 uppercase tracking-wider mb-0.5">Current Rate</span>
              <span className="text-sm font-bold text-zinc-850">
                {isFilament 
                  ? `₱${formatMoney(currentCostPerKg)}/kg`
                  : `₱${formatMoney(currentCostPerUnit)}/unit`}
              </span>
            </div>
          </div>

          {/* Quantity to Add */}
          <div>
            <label className="block text-[10px] font-bold text-zinc-450 uppercase tracking-widest mb-1.5">
              {isFilament ? 'Grams to Add' : 'Quantity to Add'}
            </label>
            <div className="relative">
              <input
                type="number"
                min="0.01"
                step="any"
                placeholder="0"
                value={quantityAdded}
                onChange={(e) => setQuantityAdded(e.target.value)}
                required
                className="w-full pr-12 pl-3 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm font-bold text-zinc-950 focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 transition-colors"
                autoFocus
              />
              <span className="absolute inset-y-0 right-3 flex items-center text-zinc-400 text-xs font-semibold pointer-events-none">
                {isFilament ? 'g' : item.unit || 'pcs'}
              </span>
            </div>
          </div>

          {/* Purchase Cost / Bulk Price */}
          <div>
            <label className="block text-[10px] font-bold text-zinc-450 uppercase tracking-widest mb-1.5">
              {isFilament ? 'Purchase Cost (PHP)' : 'Bulk Price / Total Cost (PHP)'}
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-3 flex items-center text-zinc-450 text-sm font-bold pointer-events-none">
                ₱
              </span>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={purchaseCost}
                onChange={(e) => setPurchaseCost(e.target.value)}
                className="w-full pl-7 pr-3 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm font-bold text-zinc-950 focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 transition-colors"
              />
            </div>
          </div>

          {/* Payer */}
          <div>
            <label className="block text-[10px] font-bold text-zinc-450 uppercase tracking-widest mb-1.5">
              Payer
            </label>
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
              className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm font-medium text-zinc-950 focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 transition-colors"
            >
              <option value="">- select payer -</option>
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
                  className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm font-medium text-zinc-950 focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 transition-colors"
                />
              </div>
            )}
          </div>

          {/* Dynamic Calculations preview */}
          {addedQtyNum > 0 && (
            <div className="bg-emerald-50/50 border border-emerald-100 rounded-lg p-3 space-y-1 text-xs">
              <div className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider mb-1 flex items-center gap-1">
                <Scale className="w-3.5 h-3.5" /> Estimated Stock Impact
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500 font-medium">New Total Stock:</span>
                <span className="font-bold text-zinc-800">
                  {isFilament 
                    ? `${filamentNewTotalGrams.toLocaleString()}g`
                    : `${materialNewTotalQty.toLocaleString()} ${item.unit || 'pcs'}`}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500 font-medium">New Cost Rate:</span>
                <span className="font-bold text-emerald-700">
                  {isFilament 
                    ? `₱${formatMoney(filamentNewAvgCostPerKg)}/kg`
                    : `₱${formatMoney(materialNewAvgCostPerUnit)}/unit`}
                </span>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-3.5 border-t border-zinc-100">
            <button
              type="submit"
              className="flex-1 bg-zinc-900 hover:bg-black text-white text-xs font-bold py-2.5 rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-sm"
            >
              <Check className="w-3.5 h-3.5" /> Confirm Restock
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-zinc-100 hover:bg-zinc-250 text-zinc-600 text-xs font-bold py-2.5 rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
