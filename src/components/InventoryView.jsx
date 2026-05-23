import { useState, useEffect } from 'react';
import { Plus, Trash2, Pencil, Check, X, Package, Layers, AlertTriangle, ShoppingCart, Receipt, RotateCcw, Wallet } from 'lucide-react';
import { supabase } from '../supabaseClient';
import {
  INVENTORY_FILAMENTS_TABLE,
  INVENTORY_MATERIALS_TABLE,
  INVENTORY_EXPENSES_TABLE,
  fetchInventoryFilaments,
  fetchInventoryMaterials,
  fetchInventoryExpenses,
  mapFilamentStateToRow,
  mapMaterialStateToRow,
  syncInventoryCache,
} from '../lib/inventory';

const FILAMENT_TYPES = ['PLA Basic', 'PLA Glow', 'PLA Marble', 'PETG', 'ABS', 'TPU'];
const FILAMENT_BRANDS = ['Bambu Lab', 'eSun'];

const DEFAULT_FILAMENTS = [
  { id: 1, type: 'PLA', brand: '', color: 'White', weightGrams: 1000, costPerKg: 700, notes: '' },
  { id: 2, type: 'PETG', brand: '', color: 'Black', weightGrams: 1000, costPerKg: 850, notes: '' },
];

const DEFAULT_MATERIALS = [
  { id: 1, name: 'M3 Clicker Insert', category: 'Hardware', quantity: 50, unit: 'pcs', bulkPrice: 250, notes: '' },
];

const roundCurrency = (value) => Math.round((value || 0) * 100) / 100;

function getMaterialBulkPrice(material) {
  if (material?.bulkPrice != null && Number.isFinite(Number(material.bulkPrice))) {
    return Number(material.bulkPrice);
  }
  const quantity = Number(material?.quantity) || 0;
  const costPerUnit = Number(material?.costPerUnit) || 0;
  return quantity * costPerUnit;
}

function getMaterialUnitPrice(material) {
  const quantity = Number(material?.quantity) || 0;
  if (quantity <= 0) return 0;
  return getMaterialBulkPrice(material) / quantity;
}

function normalizeMaterial(material) {
  const quantity = Number(material?.quantity) || 0;
  const bulkPrice = roundCurrency(getMaterialBulkPrice(material));
  return {
    ...material,
    quantity,
    bulkPrice,
    costPerUnit: quantity > 0 ? roundCurrency(bulkPrice / quantity) : 0,
  };
}

const PURCHASE_HISTORY_TABLE = 'inventory_purchase_history';

function mapHistoryEntryToRow(entry) {
  const isFilamentEntry = typeof entry.gramsAdded === 'number';

  return {
    ...(entry.id != null ? { id: entry.id } : {}),
    date: entry.date,
    item_type: isFilamentEntry ? 'filament' : (entry.itemType || 'material'),
    item_id: entry.itemId ?? null,
    item_label: entry.itemLabel || entry.filamentLabel || 'Unknown item',
    item_category: entry.itemCategory ?? null,
    unit_label: entry.unitLabel ?? null,
    quantity_added: isFilamentEntry ? (entry.gramsAdded ?? 0) : (entry.quantityAdded ?? 0),
    purchase_cost: entry.purchaseCost ?? 0,
    prev_cost_per_unit: entry.prevCostPerUnit ?? null,
    new_cost_per_unit: entry.newCostPerUnit ?? null,
    prev_quantity: entry.prevQuantity ?? null,
    new_quantity: entry.newQuantity ?? null,
    filament_id: entry.filamentId ?? null,
    filament_label: entry.filamentLabel ?? null,
    grams_added: entry.gramsAdded ?? null,
    prev_cost_per_kg: entry.prevCostPerKg ?? null,
    new_cost_per_kg: entry.newCostPerKg ?? null,
    prev_weight_grams: entry.prevWeightGrams ?? null,
    new_weight_grams: entry.newWeightGrams ?? null,
    payer: entry.payer || '',
  };
}

function mapHistoryRowToEntry(row) {
  return {
    id: row.id,
    date: row.date,
    itemType: row.item_type,
    itemId: row.item_id,
    itemLabel: row.item_label,
    itemCategory: row.item_category,
    unitLabel: row.unit_label,
    quantityAdded: row.quantity_added,
    purchaseCost: row.purchase_cost,
    prevCostPerUnit: row.prev_cost_per_unit,
    newCostPerUnit: row.new_cost_per_unit,
    prevQuantity: row.prev_quantity,
    newQuantity: row.new_quantity,
    filamentId: row.filament_id,
    filamentLabel: row.filament_label,
    gramsAdded: row.grams_added,
    prevCostPerKg: row.prev_cost_per_kg,
    newCostPerKg: row.new_cost_per_kg,
    prevWeightGrams: row.prev_weight_grams,
    newWeightGrams: row.new_weight_grams,
    payer: row.payer || '',
  };
}

const LOW_STOCK_THRESHOLD_GRAMS = 200;
const LOW_STOCK_THRESHOLD_QTY = 5;

// ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Inline editable row ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬

function FilamentRow({ filament, onUpdate, onDelete, onRestock }) {
  const [editing, setEditing] = useState(() => {
    return !filament.color && filament.weightGrams === 0 && filament.costPerKg === 0;
  });
  const [draft, setDraft] = useState(filament);
  const [restocking, setRestocking] = useState(false);
  const [restockGrams, setRestockGrams] = useState('');
  const [restockCost, setRestockCost] = useState('');
  const [restockPayer, setRestockPayer] = useState('');

  const handleSave = () => {
    if (!draft.color.trim()) {
      alert("Please enter a filament color before saving.");
      return;
    }
    if (draft.weightGrams <= 0) {
      alert("Please enter a valid weight in grams.");
      return;
    }
    if (draft.costPerKg <= 0) {
      alert("Please enter a valid cost per kg.");
      return;
    }
    onUpdate(draft);
    setEditing(false);
  };

  const handleCancel = () => {
    if (!filament.color && filament.weightGrams === 0 && filament.costPerKg === 0) {
      onDelete(filament.id);
    } else {
      setDraft(filament);
      setEditing(false);
    }
  };

  // Weighted average cost calculation
  const restockGramsNum = parseFloat(restockGrams) || 0;
  const restockCostNum = parseFloat(restockCost) || 0;
  const currentValuePHP = (filament.weightGrams / 1000) * filament.costPerKg;
  const newTotalGrams = filament.weightGrams + restockGramsNum;
  const newTotalValuePHP = currentValuePHP + restockCostNum;
  const newAvgCostPerKg = newTotalGrams > 0 ? (newTotalValuePHP / (newTotalGrams / 1000)) : filament.costPerKg;

  const handleRestockConfirm = () => {
    if (restockGramsNum <= 0) return;
    const updatedFilament = {
      ...filament,
      weightGrams: newTotalGrams,
      costPerKg: Math.round(newAvgCostPerKg * 100) / 100,
    };
    onUpdate(updatedFilament);
    onRestock?.({
      date: new Date().toISOString(),
      filamentId: filament.id,
      filamentLabel: `${filament.type || filament.name}${filament.color ? ' - ' + filament.color : ''}${filament.brand ? ' (' + filament.brand + ')' : ''}`,
      gramsAdded: restockGramsNum,
      purchaseCost: restockCostNum,
      prevCostPerKg: filament.costPerKg,
      newCostPerKg: Math.round(newAvgCostPerKg * 100) / 100,
      prevWeightGrams: filament.weightGrams,
      newWeightGrams: newTotalGrams,
      payer: restockPayer,
    });
    setRestockGrams('');
    setRestockCost('');
    setRestockPayer('');
    setRestocking(false);
  };

  const isLow = filament.weightGrams <= LOW_STOCK_THRESHOLD_GRAMS;

  if (editing) {
    return (
      <tr className="bg-zinc-50 border-b border-zinc-100">
        <td className="px-4 py-2">
          <select
            className="w-full text-sm border border-zinc-300 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900"
            value={draft.type}
            onChange={e => setDraft(d => ({ ...d, type: e.target.value }))}
          >
            {FILAMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </td>
        <td className="px-4 py-2">
          <select
            className="w-full text-sm border border-zinc-300 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900"
            value={draft.brand}
            onChange={e => setDraft(d => ({ ...d, brand: e.target.value }))}
          >
            <option value="">- select -</option>
            {FILAMENT_BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </td>
        <td className="px-4 py-2">
          <input
            className="w-full text-sm border border-zinc-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-zinc-900"
            value={draft.color}
            onChange={e => setDraft(d => ({ ...d, color: e.target.value }))}
            placeholder="Color"
          />
        </td>
        <td className="px-4 py-2">
          <div className="relative">
            <input
              type="number" min="0"
              className="w-full text-sm border border-zinc-300 rounded px-2 py-1 pr-8 focus:outline-none focus:ring-1 focus:ring-zinc-900"
              value={draft.weightGrams}
              onChange={e => setDraft(d => ({ ...d, weightGrams: Number(e.target.value) }))}
            />
            <span className="absolute inset-y-0 right-2 flex items-center text-zinc-400 text-xs pointer-events-none">g</span>
          </div>
        </td>
        <td className="px-4 py-2">
          <div className="relative">
            <input
              type="number" min="0"
              className="w-full text-sm border border-zinc-300 rounded px-2 py-1 pr-16 focus:outline-none focus:ring-1 focus:ring-zinc-900"
              value={draft.costPerKg}
              onChange={e => setDraft(d => ({ ...d, costPerKg: Number(e.target.value) }))}
            />
            <span className="absolute inset-y-0 right-2 flex items-center text-zinc-400 text-xs pointer-events-none">PHP/kg</span>
          </div>
        </td>
        <td className="px-4 py-2">
          <input
            className="w-full text-sm border border-zinc-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-zinc-900"
            value={draft.notes}
            onChange={e => setDraft(d => ({ ...d, notes: e.target.value }))}
            placeholder="Notes"
          />
        </td>
        <td className="px-4 py-2">
          <div className="flex gap-1">
            <button onClick={handleSave} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded transition-colors"><Check className="w-4 h-4" /></button>
            <button onClick={handleCancel} className="p-1.5 text-zinc-400 hover:bg-zinc-100 rounded transition-colors"><X className="w-4 h-4" /></button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <>
      <tr className={`border-b border-zinc-100 hover:bg-zinc-50/70 transition-colors ${isLow ? 'bg-amber-50/40' : 'bg-white'}`}>
        <td className="px-4 py-3 text-sm font-semibold text-zinc-800 flex items-center gap-2">
          {isLow && <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" title="Low stock" />}
          {filament.type || filament.name || '-'}
        </td>
        <td className="px-4 py-3 text-sm text-zinc-500">{filament.brand || '-'}</td>
        <td className="px-4 py-3 text-sm text-zinc-500">{filament.color}</td>
        <td className="px-4 py-3">
          <span className={`text-sm font-bold ${isLow ? 'text-amber-600' : 'text-zinc-800'}`}>
            {filament.weightGrams.toLocaleString()}g
          </span>
        </td>
        <td className="px-4 py-3 text-sm text-zinc-600">PHP {filament.costPerKg.toLocaleString()}/kg</td>
        <td className="px-4 py-3 text-xs text-zinc-400 max-w-[140px] truncate">{filament.notes || '-'}</td>
        <td className="px-4 py-3">
          <div className="flex gap-1">
            <button onClick={() => { setEditing(true); setRestocking(false); }} className="p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded transition-colors" title="Edit"><Pencil className="w-3.5 h-3.5" /></button>
            <button
              onClick={() => { setRestocking(r => !r); setEditing(false); }}
              className={`p-1.5 rounded transition-colors ${restocking ? 'text-emerald-600 bg-emerald-50' : 'text-zinc-400 hover:text-emerald-600 hover:bg-emerald-50'}`}
              title="Restock"
            >
              <ShoppingCart className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => onDelete(filament.id)} className="p-1.5 text-zinc-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
        </td>
      </tr>

      {/* Restock inline panel */}
      {restocking && (
        <tr className="bg-emerald-50/60 border-b border-emerald-100">
          <td colSpan={7} className="px-4 py-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="text-xs font-bold uppercase tracking-widest text-emerald-700 flex items-center gap-1.5 mr-1">
                <ShoppingCart className="w-3.5 h-3.5" /> Restock - {filament.type || filament.name}
              </div>

              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-widest text-zinc-500 mb-1">Grams to Add</label>
                <div className="relative">
                  <input
                    type="number" min="1" placeholder="0"
                    value={restockGrams}
                    onChange={e => setRestockGrams(e.target.value)}
                    className="w-28 text-sm border border-zinc-300 rounded px-2 py-1 pr-6 focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-white"
                  />
                  <span className="absolute inset-y-0 right-2 flex items-center text-zinc-400 text-xs pointer-events-none">g</span>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-widest text-zinc-500 mb-1">Purchase Cost</label>
                <div className="relative">
                  <input
                    type="number" min="0" placeholder="0.00"
                    value={restockCost}
                    onChange={e => setRestockCost(e.target.value)}
                    className="w-32 text-sm border border-zinc-300 rounded px-2 py-1 pr-10 focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-white"
                  />
                  <span className="absolute inset-y-0 right-2 flex items-center text-zinc-400 text-xs pointer-events-none">PHP</span>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-widest text-zinc-500 mb-1">Payer</label>
                <input
                  type="text" placeholder="Who paid?"
                  value={restockPayer}
                  onChange={e => setRestockPayer(e.target.value)}
                  className="w-32 text-sm border border-zinc-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-white"
                />
              </div>

              {restockGramsNum > 0 && (
                <div className="text-xs text-zinc-500 bg-white border border-zinc-200 rounded px-3 py-1.5 space-y-0.5">
                  <div>New stock: <strong className="text-zinc-800">{newTotalGrams.toLocaleString()}g</strong></div>
                  <div>Avg cost: <strong className="text-emerald-700">PHP {newAvgCostPerKg.toFixed(2)}/kg</strong></div>
                </div>
              )}

              <div className="flex gap-1.5 ml-auto">
                <button
                  onClick={handleRestockConfirm}
                  disabled={restockGramsNum <= 0}
                  className="text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded transition-colors disabled:opacity-40 flex items-center gap-1"
                >
                  <Check className="w-3.5 h-3.5" /> Confirm
                </button>
                <button
                  onClick={() => { setRestocking(false); setRestockGrams(''); setRestockCost(''); }}
                  className="text-xs font-semibold bg-white border border-zinc-200 hover:bg-zinc-50 text-zinc-600 px-3 py-1.5 rounded transition-colors flex items-center gap-1"
                >
                  <X className="w-3.5 h-3.5" /> Cancel
                </button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function MaterialRow({ material, onUpdate, onDelete, onRestock }) {
  const [editing, setEditing] = useState(() => {
    return material.name === 'New Item' && Number(material.quantity) === 0 && Number(material.bulkPrice) === 0;
  });
  const [draft, setDraft] = useState(() => normalizeMaterial(material));
  const [restocking, setRestocking] = useState(false);
  const [restockQty, setRestockQty] = useState('');
  const [restockCost, setRestockCost] = useState('');
  const [restockPayer, setRestockPayer] = useState('');

  useEffect(() => {
    setDraft(normalizeMaterial(material));
  }, [material]);

  const handleSave = () => {
    if (!draft.name.trim() || draft.name === 'New Item') {
      alert("Please enter a valid, unique name for the material item.");
      return;
    }
    if (draft.quantity <= 0) {
      alert("Please enter a valid quantity.");
      return;
    }
    if (draft.bulkPrice <= 0) {
      alert("Please enter a valid bulk purchase price.");
      return;
    }
    onUpdate(normalizeMaterial(draft));
    setEditing(false);
  };

  const handleCancel = () => {
    if (material.name === 'New Item' && Number(material.quantity) === 0 && Number(material.bulkPrice) === 0) {
      onDelete(material.id);
    } else {
      setDraft(normalizeMaterial(material));
      setEditing(false);
    }
  };

  const normalizedMaterial = normalizeMaterial(material);
  const restockQtyNum = parseFloat(restockQty) || 0;
  const restockCostNum = parseFloat(restockCost) || 0;
  const currentBulkPrice = getMaterialBulkPrice(normalizedMaterial);
  const currentUnitPrice = getMaterialUnitPrice(normalizedMaterial);
  const newTotalQty = normalizedMaterial.quantity + restockQtyNum;
  const newTotalBulkPrice = currentBulkPrice + restockCostNum;
  const newAvgCostPerUnit = newTotalQty > 0 ? (newTotalBulkPrice / newTotalQty) : currentUnitPrice;
  const isLow = normalizedMaterial.quantity <= LOW_STOCK_THRESHOLD_QTY;

  const handleRestockConfirm = () => {
    if (restockQtyNum <= 0) return;
    const roundedCostPerUnit = roundCurrency(newAvgCostPerUnit);
    onUpdate({
      ...normalizedMaterial,
      quantity: newTotalQty,
      bulkPrice: roundCurrency(newTotalBulkPrice),
      costPerUnit: roundedCostPerUnit,
    });
    onRestock?.({
      date: new Date().toISOString(),
      itemType: 'material',
      itemId: normalizedMaterial.id,
      itemLabel: normalizedMaterial.name,
      itemCategory: normalizedMaterial.category,
      unitLabel: normalizedMaterial.unit,
      quantityAdded: restockQtyNum,
      purchaseCost: restockCostNum,
      prevCostPerUnit: currentUnitPrice,
      newCostPerUnit: roundedCostPerUnit,
      prevQuantity: normalizedMaterial.quantity,
      newQuantity: newTotalQty,
      payer: restockPayer,
    });
    setRestockQty('');
    setRestockCost('');
    setRestockPayer('');
    setRestocking(false);
  };

  if (editing) {
    return (
      <tr className="bg-zinc-50 border-b border-zinc-100">
        <td className="px-4 py-2">
          <input className="w-full text-sm border border-zinc-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-zinc-900" value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} placeholder="Name" />
        </td>
        <td className="px-4 py-2">
          <input className="w-full text-sm border border-zinc-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-zinc-900" value={draft.category} onChange={e => setDraft(d => ({ ...d, category: e.target.value }))} placeholder="Category" />
        </td>
        <td className="px-4 py-2">
          <div className="flex gap-1.5 items-center">
            <input type="number" min="0" className="w-20 text-sm border border-zinc-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-zinc-900 font-bold" value={draft.quantity} onChange={e => setDraft(d => ({ ...d, quantity: Number(e.target.value) }))} placeholder="Qty" />
            <input className="w-16 text-sm border border-zinc-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-zinc-900" value={draft.unit} onChange={e => setDraft(d => ({ ...d, unit: e.target.value }))} placeholder="unit (e.g. pcs)" />
          </div>
        </td>
        <td className="px-4 py-2 hidden"></td>
        <td className="px-4 py-2">
          <div className="relative">
            <input type="number" min="0" className="w-full text-sm border border-zinc-300 rounded px-2 py-1 pr-10 focus:outline-none focus:ring-1 focus:ring-zinc-900" value={draft.bulkPrice ?? ''} onChange={e => setDraft(d => ({ ...d, bulkPrice: Number(e.target.value) }))} />
            <span className="absolute inset-y-0 right-2 flex items-center text-zinc-400 text-xs pointer-events-none">PHP</span>
          </div>
          <div className="mt-1 text-[10px] text-zinc-500">Unit price: PHP {getMaterialUnitPrice(draft).toFixed(2)}/{draft.unit || 'unit'}</div>
        </td>
        <td className="px-4 py-2">
          <input className="w-full text-sm border border-zinc-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-zinc-900" value={draft.notes} onChange={e => setDraft(d => ({ ...d, notes: e.target.value }))} placeholder="Notes" />
        </td>
        <td className="px-4 py-2">
          <div className="flex gap-1">
            <button onClick={handleSave} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded transition-colors"><Check className="w-4 h-4" /></button>
            <button onClick={handleCancel} className="p-1.5 text-zinc-400 hover:bg-zinc-100 rounded transition-colors"><X className="w-4 h-4" /></button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <>
      <tr className={`border-b border-zinc-100 hover:bg-zinc-50/70 transition-colors ${isLow ? 'bg-amber-50/40' : 'bg-white'}`}>
        <td className="px-4 py-3 text-sm font-semibold text-zinc-800 flex items-center gap-2">
          {isLow && <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" title="Low stock" />}
          {normalizedMaterial.name}
        </td>
        <td className="px-4 py-3"><span className="text-xs font-medium bg-zinc-100 text-zinc-600 px-2 py-0.5 rounded-full">{normalizedMaterial.category}</span></td>
        <td className="px-4 py-3">
          <span className={`text-sm font-bold ${isLow ? 'text-amber-600' : 'text-zinc-800'}`}>{normalizedMaterial.quantity.toLocaleString()}</span>
          <span className="text-xs text-zinc-400 ml-1">{normalizedMaterial.unit}</span>
        </td>
        <td className="px-4 py-3 text-sm text-zinc-500 hidden">{normalizedMaterial.unit}</td>
        <td className="px-4 py-3 text-sm text-zinc-600">PHP {getMaterialUnitPrice(normalizedMaterial).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td className="px-4 py-3 text-xs text-zinc-400 max-w-[140px] truncate">{normalizedMaterial.notes || '-'}</td>
        <td className="px-4 py-3">
          <div className="flex gap-1">
            <button onClick={() => { setEditing(true); setRestocking(false); }} className="p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
            <button onClick={() => { setRestocking(r => !r); setEditing(false); }} className={`p-1.5 rounded transition-colors ${restocking ? 'text-emerald-600 bg-emerald-50' : 'text-zinc-400 hover:text-emerald-600 hover:bg-emerald-50'}`} title="Restock"><ShoppingCart className="w-3.5 h-3.5" /></button>
            <button onClick={() => onDelete(normalizedMaterial.id)} className="p-1.5 text-zinc-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
        </td>
      </tr>

      {restocking && (
        <tr className="bg-emerald-50/60 border-b border-emerald-100">
          <td colSpan={7} className="px-4 py-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="text-xs font-bold uppercase tracking-widest text-emerald-700 flex items-center gap-1.5 mr-1"><ShoppingCart className="w-3.5 h-3.5" /> Restock - {normalizedMaterial.name}</div>

              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-widest text-zinc-500 mb-1">Quantity to Add</label>
                <div className="relative">
                  <input type="number" min="1" placeholder="0" value={restockQty} onChange={e => setRestockQty(e.target.value)} className="w-28 text-sm border border-zinc-300 rounded px-2 py-1 pr-10 focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-white" />
                  <span className="absolute inset-y-0 right-2 flex items-center text-zinc-400 text-xs pointer-events-none">{normalizedMaterial.unit}</span>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-widest text-zinc-500 mb-1">Bulk Price</label>
                <div className="relative">
                  <input type="number" min="0" placeholder="0.00" value={restockCost} onChange={e => setRestockCost(e.target.value)} className="w-32 text-sm border border-zinc-300 rounded px-2 py-1 pr-10 focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-white" />
                  <span className="absolute inset-y-0 right-2 flex items-center text-zinc-400 text-xs pointer-events-none">PHP</span>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-widest text-zinc-500 mb-1">Payer</label>
                <input
                  type="text" placeholder="Who paid?"
                  value={restockPayer}
                  onChange={e => setRestockPayer(e.target.value)}
                  className="w-32 text-sm border border-zinc-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-white"
                />
              </div>

              {restockQtyNum > 0 && (
                <div className="text-xs text-zinc-500 bg-white border border-zinc-200 rounded px-3 py-1.5 space-y-0.5">
                  <div>New stock: <strong className="text-zinc-800">{newTotalQty.toLocaleString()} {normalizedMaterial.unit}</strong></div>
                  <div>Bulk value: <strong className="text-zinc-800">PHP {roundCurrency(newTotalBulkPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
                  <div>Unit price: <strong className="text-emerald-700">PHP {newAvgCostPerUnit.toFixed(2)}/{normalizedMaterial.unit}</strong></div>
                </div>
              )}

              <div className="flex gap-1.5 ml-auto">
                <button onClick={handleRestockConfirm} disabled={restockQtyNum <= 0} className="text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded transition-colors disabled:opacity-40 flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Confirm</button>
                <button onClick={() => { setRestocking(false); setRestockQty(''); setRestockCost(''); }} className="text-xs font-semibold bg-white border border-zinc-200 hover:bg-zinc-50 text-zinc-600 px-3 py-1.5 rounded transition-colors flex items-center gap-1"><X className="w-3.5 h-3.5" /> Cancel</button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function ExpenseRow({ expense, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(() => {
    return expense.itemName === 'New Expense' && Number(expense.cost) === 0;
  });
  const [draft, setDraft] = useState(expense);

  const handleSave = () => {
    if (!draft.itemName.trim() || draft.itemName === 'New Expense') {
      alert("Please enter a valid expense item name.");
      return;
    }
    if (draft.cost <= 0) {
      alert("Please enter a valid cost amount.");
      return;
    }
    onUpdate(draft);
    setEditing(false);
  };

  const handleCancel = () => {
    if (expense.itemName === 'New Expense' && Number(expense.cost) === 0) {
      onDelete(expense.id);
    } else {
      setDraft(expense);
      setEditing(false);
    }
  };

  if (editing) {
    return (
      <tr className="bg-zinc-50 border-b border-zinc-100">
        <td className="px-4 py-2">
          <input
            type="date"
            className="w-full text-sm border border-zinc-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-zinc-900"
            value={draft.date ? new Date(draft.date).toISOString().split('T')[0] : ''}
            onChange={e => setDraft(d => ({ ...d, date: new Date(e.target.value).toISOString() }))}
          />
        </td>
        <td className="px-4 py-2">
          <input
            className="w-full text-sm border border-zinc-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-zinc-900"
            value={draft.itemName}
            onChange={e => setDraft(d => ({ ...d, itemName: e.target.value }))}
            placeholder="Item Name"
          />
        </td>
        <td className="px-4 py-2">
          <input
            className="w-full text-sm border border-zinc-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-zinc-900"
            value={draft.category}
            onChange={e => setDraft(d => ({ ...d, category: e.target.value }))}
            placeholder="Category"
          />
        </td>
        <td className="px-4 py-2">
          <div className="relative">
            <input
              type="number" min="0"
              className="w-full text-sm border border-zinc-300 rounded px-2 py-1 pr-10 focus:outline-none focus:ring-1 focus:ring-zinc-900"
              value={draft.cost}
              onChange={e => setDraft(d => ({ ...d, cost: Number(e.target.value) }))}
            />
            <span className="absolute inset-y-0 right-2 flex items-center text-zinc-400 text-xs pointer-events-none">PHP</span>
          </div>
        </td>
        <td className="px-4 py-2">
          <input
            className="w-full text-sm border border-zinc-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-zinc-900"
            value={draft.payer}
            onChange={e => setDraft(d => ({ ...d, payer: e.target.value }))}
            placeholder="Payer"
          />
        </td>
        <td className="px-4 py-2">
          <input
            className="w-full text-sm border border-zinc-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-zinc-900"
            value={draft.notes}
            onChange={e => setDraft(d => ({ ...d, notes: e.target.value }))}
            placeholder="Notes"
          />
        </td>
        <td className="px-4 py-2">
          <div className="flex gap-1">
            <button onClick={handleSave} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded transition-colors"><Check className="w-4 h-4" /></button>
            <button onClick={handleCancel} className="p-1.5 text-zinc-400 hover:bg-zinc-100 rounded transition-colors"><X className="w-4 h-4" /></button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-zinc-100 hover:bg-zinc-50/70 transition-colors bg-white">
      <td className="px-4 py-3 text-xs text-zinc-500 whitespace-nowrap">
        {new Date(expense.date).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })}
      </td>
      <td className="px-4 py-3 text-sm font-semibold text-zinc-800">{expense.itemName}</td>
      <td className="px-4 py-3 text-xs text-zinc-500">
        <span className="bg-zinc-100 text-zinc-600 px-2 py-0.5 rounded-full">{expense.category}</span>
      </td>
      <td className="px-4 py-3 text-sm font-bold text-zinc-900">
        PHP {expense.cost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </td>
      <td className="px-4 py-3 text-sm text-zinc-600">{expense.payer}</td>
      <td className="px-4 py-3 text-xs text-zinc-400 max-w-[140px] truncate">{expense.notes || '-'}</td>
      <td className="px-4 py-3">
        <div className="flex gap-1">
          <button onClick={() => setEditing(true)} className="p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
          <button onClick={() => onDelete(expense.id)} className="p-1.5 text-zinc-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      </td>
    </tr>
  );
}

function getFilamentColorHex(colorName) {
  const color = (colorName || '').toLowerCase().trim();
  if (color.includes('white') || color.includes('clear') || color.includes('translucent')) {
    return { bg: 'bg-zinc-100 border-zinc-300', fill: '#f4f4f5', text: 'text-zinc-600', gradient: 'from-zinc-100 to-white' };
  }
  if (color.includes('black') || color.includes('carbon') || color.includes('dark grey')) {
    return { bg: 'bg-zinc-900 border-zinc-950', fill: '#18181b', text: 'text-zinc-300', gradient: 'from-zinc-950 to-zinc-800' };
  }
  if (color.includes('grey') || color.includes('gray') || color.includes('silver')) {
    return { bg: 'bg-zinc-500 border-zinc-600', fill: '#a1a1aa', text: 'text-white', gradient: 'from-zinc-600 to-zinc-400' };
  }
  if (color.includes('red')) {
    return { bg: 'bg-red-600 border-red-700', fill: '#ef4444', text: 'text-white', gradient: 'from-red-700 to-red-500' };
  }
  if (color.includes('blue')) {
    return { bg: 'bg-blue-600 border-blue-700', fill: '#3b82f6', text: 'text-white', gradient: 'from-blue-700 to-blue-500' };
  }
  if (color.includes('green')) {
    return { bg: 'bg-emerald-600 border-emerald-700', fill: '#10b981', text: 'text-white', gradient: 'from-emerald-700 to-emerald-500' };
  }
  if (color.includes('yellow')) {
    return { bg: 'bg-yellow-400 border-yellow-500', fill: '#facc15', text: 'text-zinc-900', gradient: 'from-yellow-500 to-yellow-300' };
  }
  if (color.includes('orange')) {
    return { bg: 'bg-orange-500 border-orange-600', fill: '#f97316', text: 'text-white', gradient: 'from-orange-600 to-orange-400' };
  }
  if (color.includes('purple')) {
    return { bg: 'bg-purple-600 border-purple-700', fill: '#a855f7', text: 'text-white', gradient: 'from-purple-700 to-purple-500' };
  }
  if (color.includes('pink')) {
    return { bg: 'bg-pink-500 border-pink-600', fill: '#ec4899', text: 'text-white', gradient: 'from-pink-600 to-pink-400' };
  }
  if (color.includes('gold') || color.includes('brass') || color.includes('bronze')) {
    return { bg: 'bg-amber-600 border-amber-700', fill: '#fbbf24', text: 'text-zinc-950', gradient: 'from-amber-600 to-yellow-500' };
  }
  
  return { bg: 'bg-indigo-500 border-indigo-600', fill: '#6366f1', text: 'text-white', gradient: 'from-indigo-600 to-indigo-400' };
}

// Visual Spool Card Component representing physical spool
function SpoolCard({ filament, onUpdate, onDelete, onRestock }) {
  const [editing, setEditing] = useState(() => {
    return !filament.color && filament.weightGrams === 0 && filament.costPerKg === 0;
  });
  const [draft, setDraft] = useState(filament);
  const [restocking, setRestocking] = useState(false);
  const [restockGrams, setRestockGrams] = useState('');
  const [restockCost, setRestockCost] = useState('');
  const [restockPayer, setRestockPayer] = useState('');

  const isLow = filament.weightGrams <= LOW_STOCK_THRESHOLD_GRAMS;
  const percent = Math.min(100, Math.max(0, (filament.weightGrams / 1000) * 100));
  const swatch = getFilamentColorHex(filament.color);

  const handleSave = () => {
    if (!draft.color.trim()) {
      alert("Please enter a filament color before saving.");
      return;
    }
    if (draft.weightGrams <= 0) {
      alert("Please enter a valid weight in grams.");
      return;
    }
    if (draft.costPerKg <= 0) {
      alert("Please enter a valid cost per kg.");
      return;
    }
    onUpdate(draft);
    setEditing(false);
  };

  const handleCancel = () => {
    if (!filament.color && filament.weightGrams === 0 && filament.costPerKg === 0) {
      onDelete(filament.id);
    } else {
      setDraft(filament);
      setEditing(false);
    }
  };

  const restockGramsNum = parseFloat(restockGrams) || 0;
  const restockCostNum = parseFloat(restockCost) || 0;
  const currentValuePHP = (filament.weightGrams / 1000) * filament.costPerKg;
  const newTotalGrams = filament.weightGrams + restockGramsNum;
  const newTotalValuePHP = currentValuePHP + restockCostNum;
  const newAvgCostPerKg = newTotalGrams > 0 ? (newTotalValuePHP / (newTotalGrams / 1000)) : filament.costPerKg;

  const handleRestockConfirm = () => {
    if (restockGramsNum <= 0) return;
    const updatedFilament = {
      ...filament,
      weightGrams: newTotalGrams,
      costPerKg: Math.round(newAvgCostPerKg * 100) / 100,
    };
    onUpdate(updatedFilament);
    onRestock?.({
      date: new Date().toISOString(),
      filamentId: filament.id,
      filamentLabel: `${filament.type || filament.name}${filament.color ? ' - ' + filament.color : ''}${filament.brand ? ' (' + filament.brand + ')' : ''}`,
      gramsAdded: restockGramsNum,
      purchaseCost: restockCostNum,
      prevCostPerKg: filament.costPerKg,
      newCostPerKg: Math.round(newAvgCostPerKg * 100) / 100,
      prevWeightGrams: filament.weightGrams,
      newWeightGrams: newTotalGrams,
      payer: restockPayer,
    });
    setRestockGrams('');
    setRestockCost('');
    setRestockPayer('');
    setRestocking(false);
  };

  if (editing) {
    return (
      <div className="bg-zinc-50 border border-zinc-300 rounded-xl p-4 shadow-md space-y-3 flex flex-col justify-between min-h-[300px] animate-in zoom-in-95 duration-150">
        <div className="space-y-2">
          <div>
            <label className="block text-[9px] font-bold text-zinc-400 uppercase tracking-widest mb-0.5">Type</label>
            <select
              className="w-full text-xs border border-zinc-200 rounded px-2 py-1.5 bg-white font-medium focus:ring-1 focus:ring-zinc-900"
              value={draft.type}
              onChange={e => setDraft(d => ({ ...d, type: e.target.value }))}
            >
              {FILAMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[9px] font-bold text-zinc-400 uppercase tracking-widest mb-0.5">Brand</label>
            <select
              className="w-full text-xs border border-zinc-200 rounded px-2 py-1.5 bg-white font-medium focus:ring-1 focus:ring-zinc-900"
              value={draft.brand}
              onChange={e => setDraft(d => ({ ...d, brand: e.target.value }))}
            >
              <option value="">- select -</option>
              {FILAMENT_BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[9px] font-bold text-zinc-400 uppercase tracking-widest mb-0.5">Color</label>
            <input
              className="w-full text-xs border border-zinc-200 rounded px-2 py-1.5 focus:ring-1 focus:ring-zinc-900"
              value={draft.color}
              onChange={e => setDraft(d => ({ ...d, color: e.target.value }))}
              placeholder="Color"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[9px] font-bold text-zinc-400 uppercase tracking-widest mb-0.5">Weight (g)</label>
              <input
                type="number" min="0"
                className="w-full text-xs border border-zinc-200 rounded px-2 py-1.5 focus:ring-1 focus:ring-zinc-900"
                value={draft.weightGrams}
                onChange={e => setDraft(d => ({ ...d, weightGrams: Number(e.target.value) }))}
              />
            </div>
            <div>
              <label className="block text-[9px] font-bold text-zinc-400 uppercase tracking-widest mb-0.5">Rate (PHP/kg)</label>
              <input
                type="number" min="0"
                className="w-full text-xs border border-zinc-200 rounded px-2 py-1.5 focus:ring-1 focus:ring-zinc-900"
                value={draft.costPerKg}
                onChange={e => setDraft(d => ({ ...d, costPerKg: Number(e.target.value) }))}
              />
            </div>
          </div>
          <div>
            <label className="block text-[9px] font-bold text-zinc-400 uppercase tracking-widest mb-0.5">Notes</label>
            <input
              className="w-full text-xs border border-zinc-200 rounded px-2 py-1.5 focus:ring-1 focus:ring-zinc-900"
              value={draft.notes}
              onChange={e => setDraft(d => ({ ...d, notes: e.target.value }))}
              placeholder="Notes"
            />
          </div>
        </div>
        <div className="flex gap-2 pt-2 border-t border-zinc-200">
          <button onClick={handleSave} className="flex-1 bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold py-1.5 rounded flex items-center justify-center gap-1"><Check className="w-3.5 h-3.5" /> Save</button>
          <button onClick={handleCancel} className="flex-1 bg-white border border-zinc-200 hover:bg-zinc-50 text-zinc-600 text-xs font-bold py-1.5 rounded flex items-center justify-center gap-1"><X className="w-3.5 h-3.5" /> Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white border rounded-xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between min-h-[300px] relative overflow-hidden group ${isLow ? 'border-amber-300 ring-2 ring-amber-500/5' : 'border-zinc-200'}`}>
      
      {/* Low Stock Pulsing indicator */}
      {isLow && (
        <div className="absolute top-3.5 right-3.5 w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" title="Low stock alert" />
      )}

      {/* Spool Info */}
      <div>
        <div className="flex justify-between items-start mb-0.5">
          <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">{filament.brand || 'Generic'}</span>
          {isLow && (
            <span className="inline-flex items-center bg-amber-50 border border-amber-200 text-amber-700 text-[8px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-widest scale-90 origin-right">
              LOW
            </span>
          )}
        </div>
        <h3 className="text-sm font-bold text-zinc-950 truncate" title={filament.type}>
          {filament.type || 'PLA'}
        </h3>
        <span className="text-xs text-zinc-500 font-semibold block mt-0.5">{filament.color}</span>
      </div>

      {/* SVG Spool Graphic with Filament Swatch Ring */}
      <div className="my-4 flex items-center justify-center relative select-none">
        <svg width="90" height="90" viewBox="0 0 100 100" className="drop-shadow-sm overflow-visible">
          {/* Spool outer ring */}
          <circle cx="50" cy="50" r="46" fill="none" stroke="#e4e4e7" strokeWidth="5" />
          
          {/* Filament wound thickness core shadow */}
          <circle cx="50" cy="50" r="38" fill="none" stroke="#f4f4f5" strokeWidth="8" />

          {/* Filament core winding swatch progress bar */}
          <circle 
            cx="50" 
            cy="50" 
            r="38" 
            fill="none" 
            stroke={swatch.fill} 
            strokeWidth="8"
            strokeDasharray="238.76"
            strokeDashoffset={238.76 - (percent / 100) * 238.76}
            strokeLinecap="round"
            className="transition-all duration-1000 ease-out origin-center -rotate-90"
          />

          {/* Inner plastic cylinder hub */}
          <circle cx="50" cy="50" r="22" fill="#ffffff" stroke="#e4e4e7" strokeWidth="1" />
          {/* Center spindle cutout */}
          <circle cx="50" cy="50" r="8" fill="#f4f4f5" stroke="#d4d4d8" strokeWidth="1.5" />
        </svg>

        {/* Core Weight display overlay */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none mt-1">
          <span className="text-xs font-black text-zinc-800 leading-none">{filament.weightGrams.toLocaleString()}g</span>
          <span className="text-[8px] font-bold text-zinc-400 uppercase tracking-tighter mt-0.5">{percent.toFixed(0)}%</span>
        </div>
      </div>

      {/* Spool Cost Rate & Actions */}
      <div className="space-y-3 pt-3 border-t border-zinc-100 mt-2">
        <div className="flex justify-between items-center text-xs font-semibold text-zinc-500">
          <span>Cost Rate</span>
          <span className="text-zinc-950 font-bold">PHP {filament.costPerKg.toLocaleString()}/kg</span>
        </div>

        {restocking ? (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2.5 space-y-2.5 mt-2 animate-in zoom-in-95 duration-150">
            <div className="text-[9px] font-bold uppercase tracking-widest text-emerald-800 flex items-center gap-1">
              <ShoppingCart className="w-3 h-3" /> Quick Restock
            </div>
            
            <div className="grid grid-cols-2 gap-1.5">
              <div>
                <label className="block text-[8px] font-bold text-zinc-500 uppercase tracking-widest mb-0.5">Grams</label>
                <input
                  type="number" min="1" placeholder="grams"
                  value={restockGrams}
                  onChange={e => setRestockGrams(e.target.value)}
                  className="w-full text-xs border border-zinc-200 rounded px-1.5 py-1 bg-white font-medium focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-[8px] font-bold text-zinc-500 uppercase tracking-widest mb-0.5">Cost</label>
                <input
                  type="number" min="0" placeholder="PHP"
                  value={restockCost}
                  onChange={e => setRestockCost(e.target.value)}
                  className="w-full text-xs border border-zinc-200 rounded px-1.5 py-1 bg-white font-medium focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            </div>
            
            <div>
              <label className="block text-[8px] font-bold text-zinc-500 uppercase tracking-widest mb-0.5">Payer</label>
              <input
                type="text" placeholder="Who paid?"
                value={restockPayer}
                onChange={e => setRestockPayer(e.target.value)}
                className="w-full text-xs border border-zinc-200 rounded px-1.5 py-1 bg-white font-medium focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            {restockGramsNum > 0 && (
              <div className="text-[9px] text-zinc-500 bg-white border border-zinc-100 rounded p-1.5 font-medium leading-tight space-y-0.5">
                <div>New stock: <strong className="text-zinc-800">{newTotalGrams.toLocaleString()}g</strong></div>
                <div>Avg cost: <strong className="text-emerald-700">PHP {newAvgCostPerKg.toFixed(2)}/kg</strong></div>
              </div>
            )}

            <div className="flex gap-1.5">
              <button
                onClick={handleRestockConfirm}
                disabled={restockGramsNum <= 0}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold py-1 rounded transition-colors disabled:opacity-40"
              >
                Confirm
              </button>
              <button
                onClick={() => { setRestocking(false); setRestockGrams(''); setRestockCost(''); }}
                className="flex-1 bg-white border border-zinc-200 hover:bg-zinc-50 text-zinc-600 text-[10px] font-bold py-1 rounded transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex gap-1.5">
            <button
              onClick={() => { setRestocking(true); setEditing(false); }}
              className="flex-1 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 text-xs font-bold py-1.5 rounded-md transition-colors flex items-center justify-center gap-1 shadow-sm"
            >
              <ShoppingCart className="w-3.5 h-3.5" /> Restock
            </button>
            <button
              onClick={() => { setEditing(true); setRestocking(false); }}
              className="bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 text-zinc-600 hover:text-zinc-950 p-1.5 rounded-md transition-colors flex items-center justify-center"
              title="Edit Spool"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => {
                if (window.confirm("Permanently delete this spool?")) {
                  onDelete(filament.id);
                }
              }}
              className="bg-zinc-50 hover:bg-red-50 border border-zinc-200 text-zinc-300 hover:text-red-500 p-1.5 rounded-md transition-colors flex items-center justify-center"
              title="Delete Spool"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

    </div>
  );
}

export default function InventoryView() {
  const [filaments, setFilaments] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [inventoryLoading, setInventoryLoading] = useState(true);
  const [purchaseHistory, setPurchaseHistory] = useState([]);
  const [purchaseHistoryLoading, setPurchaseHistoryLoading] = useState(true);
  const [expenses, setExpenses] = useState([]);
  const [expensesLoading, setExpensesLoading] = useState(true);
  const [activeSection, setActiveSection] = useState('filaments');
  const [filamentViewMode, setFilamentViewMode] = useState('shelf'); // Default to shelf grid

  useEffect(() => {
    syncInventoryCache({ filaments, materials });
  }, [filaments, materials]);

  useEffect(() => {
    let cancelled = false;

    const loadInventory = async () => {
      setInventoryLoading(true);

      try {
        const [dbFilaments, dbMaterials] = await Promise.all([
          fetchInventoryFilaments(),
          fetchInventoryMaterials(),
        ]);

        if (cancelled) return;

        const localFilaments = (() => {
          try {
            const raw = localStorage.getItem('inventory_filaments');
            return raw ? JSON.parse(raw) : [];
          } catch {
            return [];
          }
        })();

        const localMaterials = (() => {
          try {
            const raw = localStorage.getItem('inventory_materials');
            return raw ? JSON.parse(raw).map(normalizeMaterial) : [];
          } catch {
            return [];
          }
        })();

        let nextFilaments = dbFilaments;
        let nextMaterials = dbMaterials.map(normalizeMaterial);

        if (dbFilaments.length === 0 && localFilaments.length > 0) {
          const { data, error } = await supabase
            .from(INVENTORY_FILAMENTS_TABLE)
            .insert(localFilaments.map(mapFilamentStateToRow))
            .select('*');
          if (!error && !cancelled) {
            nextFilaments = (data || []).map((row) => ({
              id: row.id,
              type: row.type,
              brand: row.brand,
              color: row.color,
              weightGrams: Number(row.weight_grams),
              costPerKg: Number(row.cost_per_kg),
              notes: row.notes,
            }));
          }
        }

        if (dbMaterials.length === 0 && localMaterials.length > 0) {
          const { data, error } = await supabase
            .from(INVENTORY_MATERIALS_TABLE)
            .insert(localMaterials.map(mapMaterialStateToRow))
            .select('*');
          if (!error && !cancelled) {
            nextMaterials = (data || []).map((row) =>
              normalizeMaterial({
                id: row.id,
                name: row.name,
                category: row.category,
                quantity: Number(row.quantity),
                unit: row.unit,
                bulkPrice: Number(row.bulk_price),
                costPerUnit: Number(row.cost_per_unit),
                notes: row.notes,
              }),
            );
          }
        }

        if (cancelled) return;
        setFilaments(nextFilaments);
        setMaterials(nextMaterials);
      } catch (error) {
        console.error('Failed to load inventory from Supabase:', error);
        setFilaments(DEFAULT_FILAMENTS);
        setMaterials(DEFAULT_MATERIALS.map(normalizeMaterial));
      } finally {
        if (!cancelled) setInventoryLoading(false);
      }
    };

    const loadExpenses = async () => {
      setExpensesLoading(true);
      try {
        const dbExpenses = await fetchInventoryExpenses();
        if (!cancelled) setExpenses(dbExpenses);
      } catch (error) {
        console.error('Failed to load expenses from Supabase:', error);
      } finally {
        if (!cancelled) setExpensesLoading(false);
      }
    };

    loadInventory();
    loadExpenses();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadPurchaseHistory = async () => {
      setPurchaseHistoryLoading(true);

      const localEntries = (() => {
        try {
          const raw = localStorage.getItem('inventory_purchase_history');
          return raw ? JSON.parse(raw) : [];
        } catch {
          return [];
        }
      })();

      const { data, error } = await supabase
        .from(PURCHASE_HISTORY_TABLE)
        .select('*')
        .order('date', { ascending: false });

      if (error) {
        console.error('Failed to load purchase history from Supabase:', error);
        if (!cancelled) {
          setPurchaseHistory(localEntries);
          setPurchaseHistoryLoading(false);
        }
        return;
      }

      if (localEntries.length > 0) {
        const existingIds = new Set((data || []).map(entry => entry.id));
        const missingLocalEntries = localEntries.filter(entry => !existingIds.has(entry.id));

        if (missingLocalEntries.length > 0) {
          const { error: importError } = await supabase
            .from(PURCHASE_HISTORY_TABLE)
            .insert(missingLocalEntries.map(mapHistoryEntryToRow));

          if (importError) {
            console.error('Failed to import local purchase history into Supabase:', importError);
          } else {
            localStorage.removeItem('inventory_purchase_history');
          }
        } else {
          localStorage.removeItem('inventory_purchase_history');
        }
      }

      const { data: refreshedData, error: refreshError } = await supabase
        .from(PURCHASE_HISTORY_TABLE)
        .select('*')
        .order('date', { ascending: false });

      const { data: expensesData, error: expensesError } = await supabase
        .from(INVENTORY_EXPENSES_TABLE)
        .select('*')
        .order('date', { ascending: false });

      if (cancelled) return;

      let historyEntries = (refreshedData || []).map(mapHistoryRowToEntry);

      if (!expensesError && expensesData) {
        const expenseEntries = expensesData.map(row => ({
          id: `exp-${row.id}`,
          originalId: row.id,
          date: row.date,
          itemLabel: row.item_name,
          itemType: 'expense',
          itemCategory: row.category,
          purchaseCost: Number(row.cost),
          payer: row.payer,
          notes: row.notes,
          isExpense: true
        }));
        historyEntries = [...historyEntries, ...expenseEntries];
      }

      // Sort combined list by date descending
      historyEntries.sort((a, b) => new Date(b.date) - new Date(a.date));

      setPurchaseHistory(historyEntries);
      setPurchaseHistoryLoading(false);
    };

    loadPurchaseHistory();

    return () => {
      cancelled = true;
    };
  }, []);

  const addToHistory = async (entry) => {
    const mappedEntry = mapHistoryEntryToRow(entry);
    const { data, error } = await supabase
      .from(PURCHASE_HISTORY_TABLE)
      .insert(mappedEntry)
      .select()
      .single();

    if (error) {
      console.error('Failed to save purchase history entry to Supabase:', error);
      setPurchaseHistory(prev => [entry, ...prev]);
      return;
    }

    setPurchaseHistory(prev => [mapHistoryRowToEntry(data), ...prev]);
  };

  const clearHistory = async () => {
    if (window.confirm('Clear all purchase history? This cannot be undone.')) {
      const { error } = await supabase
        .from(PURCHASE_HISTORY_TABLE)
        .delete()
        .not('id', 'is', null);

      if (error) {
        console.error('Failed to clear purchase history from Supabase:', error);
        return;
      }

      setPurchaseHistory([]);
    }
  };

  const voidHistoryEntry = async (entryId) => {
    if (!window.confirm('Void this purchase history entry? This will remove the record only.')) {
      return;
    }

    const { error } = await supabase
      .from(PURCHASE_HISTORY_TABLE)
      .delete()
      .eq('id', entryId);

    if (error) {
      console.error('Failed to void purchase history entry in Supabase:', error);
      return;
    }

    setPurchaseHistory(prev => prev.filter(entry => entry.id !== entryId));
  };

  const canUndoHistoryEntry = (entry) => {
    const isFilamentEntry = entry.itemType === 'filament' || typeof entry.gramsAdded === 'number' || entry.filamentId != null;

    if (isFilamentEntry) {
      const filament = filaments.find(f => f.id === entry.filamentId);
      if (!filament) return false;
      return filament.weightGrams === entry.newWeightGrams && filament.costPerKg === entry.newCostPerKg;
    }

    const material = materials.find(m => m.id === entry.itemId);
    if (!material) return false;
    const normalizedMaterial = normalizeMaterial(material);
    return normalizedMaterial.quantity === entry.newQuantity && normalizedMaterial.costPerUnit === entry.newCostPerUnit;
  };

  const undoHistoryEntry = async (entry) => {
    if (!canUndoHistoryEntry(entry)) {
      window.alert('This purchase can no longer be undone because the item stock changed after this entry.');
      return;
    }

    if (!window.confirm('Undo this purchase entry? This will roll back the inventory item and remove the history record.')) {
      return;
    }

    const isFilamentEntry = entry.itemType === 'filament' || typeof entry.gramsAdded === 'number' || entry.filamentId != null;

    if (isFilamentEntry) {
      const rollback = {
        weight_grams: entry.prevWeightGrams,
        cost_per_kg: entry.prevCostPerKg,
        updated_at: new Date().toISOString(),
      };
      const { error: rollbackError } = await supabase
        .from(INVENTORY_FILAMENTS_TABLE)
        .update(rollback)
        .eq('id', entry.filamentId);

      if (rollbackError) {
        console.error('Failed to roll back filament inventory in Supabase:', rollbackError);
        return;
      }

      setFilaments(prev => prev.map(f => (
        f.id === entry.filamentId
          ? { ...f, weightGrams: entry.prevWeightGrams, costPerKg: entry.prevCostPerKg }
          : f
      )));
    } else {
      const rollback = {
        quantity: entry.prevQuantity,
        bulk_price: roundCurrency((entry.prevCostPerUnit || 0) * (entry.prevQuantity || 0)),
        cost_per_unit: entry.prevCostPerUnit,
        updated_at: new Date().toISOString(),
      };
      const { error: rollbackError } = await supabase
        .from(INVENTORY_MATERIALS_TABLE)
        .update(rollback)
        .eq('id', entry.itemId);

      if (rollbackError) {
        console.error('Failed to roll back material inventory in Supabase:', rollbackError);
        return;
      }

      setMaterials(prev => prev.map(m => (
        m.id === entry.itemId
          ? normalizeMaterial({
            ...m,
            quantity: entry.prevQuantity,
            bulkPrice: roundCurrency((entry.prevCostPerUnit || 0) * (entry.prevQuantity || 0)),
            costPerUnit: entry.prevCostPerUnit,
          })
          : m
      )));
    }

    const { error } = await supabase
      .from(PURCHASE_HISTORY_TABLE)
      .delete()
      .eq('id', entry.id);

    if (error) {
      console.error('Failed to delete undone purchase history entry from Supabase:', error);
      return;
    }

    setPurchaseHistory(prev => prev.filter(historyEntry => historyEntry.id !== entry.id));
  };

  // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Filament CRUD ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬

  const addFilament = () => {
    supabase
      .from(INVENTORY_FILAMENTS_TABLE)
      .insert(mapFilamentStateToRow({
        type: FILAMENT_TYPES[0],
        brand: FILAMENT_BRANDS[0],
        color: '',
        weightGrams: 0,
        costPerKg: 0,
        notes: '',
      }))
      .select('*')
      .single()
      .then(({ data, error }) => {
        if (error) {
          console.error('Failed to add filament to Supabase:', error);
          return;
        }
        setFilaments(prev => [...prev, {
          id: data.id,
          type: data.type,
          brand: data.brand,
          color: data.color,
          weightGrams: Number(data.weight_grams),
          costPerKg: Number(data.cost_per_kg),
          notes: data.notes,
        }]);
      });
  };

  const updateFilament = (updated) => {
    supabase
      .from(INVENTORY_FILAMENTS_TABLE)
      .update(mapFilamentStateToRow(updated))
      .eq('id', updated.id)
      .then(({ error }) => {
        if (error) {
          console.error('Failed to update filament in Supabase:', error);
          return;
        }
        setFilaments(prev => prev.map(f => f.id === updated.id ? updated : f));
      });
  };

  const deleteFilament = (id) => {
    if (window.confirm('Remove this filament from inventory?')) {
      supabase
        .from(INVENTORY_FILAMENTS_TABLE)
        .delete()
        .eq('id', id)
        .then(({ error }) => {
          if (error) {
            console.error('Failed to delete filament from Supabase:', error);
            return;
          }
          setFilaments(prev => prev.filter(f => f.id !== id));
        });
    }
  };

  // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Material CRUD ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬

  const addMaterial = () => {
    supabase
      .from(INVENTORY_MATERIALS_TABLE)
      .insert(mapMaterialStateToRow({
        name: 'New Item',
        category: 'Hardware',
        quantity: 0,
        unit: 'pcs',
        bulkPrice: 0,
        costPerUnit: 0,
        notes: '',
      }))
      .select('*')
      .single()
      .then(({ data, error }) => {
        if (error) {
          console.error('Failed to add material to Supabase:', error);
          return;
        }
        setMaterials(prev => [...prev, normalizeMaterial({
          id: data.id,
          name: data.name,
          category: data.category,
          quantity: Number(data.quantity),
          unit: data.unit,
          bulkPrice: Number(data.bulk_price),
          costPerUnit: Number(data.cost_per_unit),
          notes: data.notes,
        })]);
      });
  };

  const updateMaterial = (updated) => {
    const normalized = normalizeMaterial(updated);
    supabase
      .from(INVENTORY_MATERIALS_TABLE)
      .update(mapMaterialStateToRow(normalized))
      .eq('id', normalized.id)
      .then(({ error }) => {
        if (error) {
          console.error('Failed to update material in Supabase:', error);
          return;
        }
        setMaterials(prev => prev.map(m => m.id === normalized.id ? normalized : m));
      });
  };

  const deleteMaterial = (id) => {
    if (window.confirm('Remove this item from inventory?')) {
      supabase
        .from(INVENTORY_MATERIALS_TABLE)
        .delete()
        .eq('id', id)
        .then(({ error }) => {
          if (error) {
            console.error('Failed to delete material from Supabase:', error);
            return;
          }
          setMaterials(prev => prev.filter(m => m.id !== id));
        });
    }
  };

  // --- Expenses CRUD ---

  const addExpense = () => {
    console.log('Attempting to add expense to table:', INVENTORY_EXPENSES_TABLE);
    supabase
      .from(INVENTORY_EXPENSES_TABLE)
      .insert({
        date: new Date().toISOString(),
        item_name: 'New Expense',
        category: 'Hardware',
        cost: 0,
        payer: '',
        notes: '',
      })
      .select('*')
      .then(({ data, error }) => {
        if (error) {
          console.error('Failed to add expense to Supabase:', error);
          window.alert(`Error adding expense: ${error.message || 'Unknown error'}`);
          return;
        }

        if (!data || data.length === 0) {
          console.error('No data returned from insert');
          return;
        }

        const newRow = data[0];
        const newExpense = {
          id: newRow.id,
          date: newRow.date,
          itemName: newRow.item_name,
          category: newRow.category,
          cost: Number(newRow.cost),
          payer: newRow.payer,
          notes: newRow.notes,
        };
        setExpenses(prev => [newExpense, ...prev]);

        // Also update purchase history
        setPurchaseHistory(prev => [{
          id: `exp-${newRow.id}`,
          originalId: newRow.id,
          date: newRow.date,
          itemLabel: newRow.item_name,
          itemType: 'expense',
          itemCategory: newRow.category,
          purchaseCost: Number(newRow.cost),
          payer: newRow.payer,
          notes: newRow.notes,
          isExpense: true
        }, ...prev].sort((a, b) => new Date(b.date) - new Date(a.date)));
      });
  };

  const updateExpense = (updated) => {
    supabase
      .from(INVENTORY_EXPENSES_TABLE)
      .update({
        date: updated.date,
        item_name: updated.itemName,
        category: updated.category,
        cost: updated.cost,
        payer: updated.payer,
        notes: updated.notes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', updated.id)
      .then(({ error }) => {
        if (error) {
          console.error('Failed to update expense in Supabase:', error);
          window.alert(`Error updating expense: ${error.message}`);
          return;
        }
        setExpenses(prev => prev.map(e => e.id === updated.id ? updated : e));

        // Also update purchase history
        setPurchaseHistory(prev => prev.map(h => {
          if (h.isExpense && h.originalId === updated.id) {
            return {
              ...h,
              date: updated.date,
              itemLabel: updated.itemName,
              itemCategory: updated.category,
              purchaseCost: updated.cost,
              payer: updated.payer,
              notes: updated.notes,
            };
          }
          return h;
        }).sort((a, b) => new Date(b.date) - new Date(a.date)));
      });
  };

  const deleteExpense = (id) => {
    if (window.confirm('Remove this expense?')) {
      supabase
        .from(INVENTORY_EXPENSES_TABLE)
        .delete()
        .eq('id', id)
        .then(({ error }) => {
          if (error) {
            console.error('Failed to delete expense from Supabase:', error);
            return;
          }
          setExpenses(prev => prev.filter(e => e.id !== id));

          // Also update purchase history
          setPurchaseHistory(prev => prev.filter(h => !(h.isExpense && h.originalId === id)));
        });
    }
  };

  // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Stats ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬

  const totalFilamentWeight = filaments.reduce((s, f) => s + f.weightGrams, 0);
  const lowFilaments = filaments.filter(f => f.weightGrams <= LOW_STOCK_THRESHOLD_GRAMS).length;
  const totalMatQty = materials.reduce((s, m) => s + m.quantity, 0);
  const lowMaterials = materials.filter(m => m.quantity <= LOW_STOCK_THRESHOLD_QTY).length;
  const totalSpentHistory = purchaseHistory.filter(h => !h.isExpense).reduce((s, h) => s + (h.purchaseCost || 0), 0);
  const totalSpentExpenses = expenses.reduce((s, e) => s + (e.cost || 0), 0);
  const totalSpent = totalSpentHistory + totalSpentExpenses;

  return (
    <div className="space-y-6">

      {/* Page header */}
      <div className="mb-2">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 mb-1">Inventory</h1>
        <p className="text-sm text-zinc-500 font-medium">Track filament stock and supplementary materials on-hand.</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Filament Types"
          value={filaments.length}
          sub="tracked"
          icon={<Layers className="w-4 h-4" />}
        />
        <StatCard
          label="Total Filament"
          value={`${(totalFilamentWeight / 1000).toFixed(2)} kg`}
          sub="in stock"
          icon={<Layers className="w-4 h-4" />}
        />
        <StatCard
          label="Total Spent"
          value={`PHP ${totalSpent.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          sub="on restocks"
          icon={<Receipt className="w-4 h-4" />}
        />
        <StatCard
          label="Low Stock Alerts"
          value={lowFilaments + lowMaterials}
          sub="items"
          icon={<AlertTriangle className="w-4 h-4" />}
          alert={lowFilaments + lowMaterials > 0}
        />
      </div>

      {/* Section tabs */}
      <div className="flex gap-1 bg-zinc-100 p-1 rounded-xl w-full sm:w-fit overflow-x-auto whitespace-nowrap scrollbar-hide">
        <button
          onClick={() => setActiveSection('filaments')}
          className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-colors ${activeSection === 'filaments' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}
        >
          Filaments
        </button>
        <button
          onClick={() => setActiveSection('materials')}
          className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-colors ${activeSection === 'materials' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}
        >
          Materials &amp; Hardware
        </button>
        <button
          onClick={() => setActiveSection('expenses')}
          className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-colors flex items-center gap-1.5 ${activeSection === 'expenses' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}
        >
          <Wallet className="w-3.5 h-3.5" /> Other Expenses
        </button>
        <button
          onClick={() => setActiveSection('history')}
          className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-colors flex items-center gap-1.5 ${activeSection === 'history' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}
        >
          <Receipt className="w-3.5 h-3.5" /> Purchase History
          {purchaseHistory.length > 0 && (
            <span className="bg-zinc-200 text-zinc-600 text-[10px] font-bold px-1.5 py-0.5 rounded-full">{purchaseHistory.length}</span>
          )}
        </button>
      </div>

      {/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Filaments Table ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */}
      {activeSection === 'filaments' && (
        <section className="bg-white border border-zinc-200 shadow-sm rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-200 flex items-center justify-between bg-zinc-50">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-zinc-500" />
              <h2 className="text-sm font-semibold text-zinc-900 uppercase tracking-widest">Filament Stock</h2>
              {lowFilaments > 0 && (
                <span className="ml-1 inline-flex items-center gap-1 bg-amber-100 text-amber-700 text-[11px] font-semibold px-2 py-0.5 rounded-full">
                  <AlertTriangle className="w-3 h-3" /> {lowFilaments} low
                </span>
              )}
            </div>
            <div className="flex items-center gap-4">
              {/* Segmented Controller Toggler */}
              <div className="bg-zinc-100 p-0.5 rounded-lg flex items-center text-xs font-bold border border-zinc-200/50 shadow-inner">
                <button
                  onClick={() => setFilamentViewMode('shelf')}
                  className={`px-2.5 py-1 rounded-md transition-all ${filamentViewMode === 'shelf' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-400 hover:text-zinc-600'}`}
                >
                  Shelf View
                </button>
                <button
                  onClick={() => setFilamentViewMode('table')}
                  className={`px-2.5 py-1 rounded-md transition-all ${filamentViewMode === 'table' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-400 hover:text-zinc-600'}`}
                >
                  Table View
                </button>
              </div>

              <button
                onClick={addFilament}
                className="text-xs font-medium text-zinc-700 bg-white border border-zinc-200 hover:bg-zinc-50 px-2 py-1 rounded transition-colors flex items-center gap-1 shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" /> Add Filament
              </button>
            </div>
          </div>

          {inventoryLoading ? (
            <div className="p-8 text-center text-zinc-400 text-sm border-b border-zinc-100">
              Loading inventory...
            </div>
          ) : filaments.length === 0 ? (
            <div className="p-8 text-center text-zinc-400 text-sm border-b border-zinc-100">
              No filaments in inventory. Add one above.
            </div>
          ) : filamentViewMode === 'shelf' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 p-6 bg-zinc-50 border-b border-zinc-100">
              {filaments.map(f => (
                <SpoolCard key={f.id} filament={f} onUpdate={updateFilament} onDelete={deleteFilament} onRestock={addToHistory} />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50/70">
                    <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-widest text-zinc-500">Type</th>
                    <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-widest text-zinc-500">Brand</th>
                    <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-widest text-zinc-500">Color</th>
                    <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-widest text-zinc-500">Weight</th>
                    <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-widest text-zinc-500">Cost Rate</th>
                    <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-widest text-zinc-500">Notes</th>
                    <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-widest text-zinc-500">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filaments.map(f => (
                    <FilamentRow key={f.id} filament={f} onUpdate={updateFilament} onDelete={deleteFilament} onRestock={addToHistory} />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="px-5 py-3 border-t border-zinc-100 bg-zinc-50/50 flex justify-end">
            <span className="text-xs text-zinc-400 font-medium">
              Total stock: <strong className="text-zinc-700">{(totalFilamentWeight / 1000).toFixed(3)} kg</strong> across {filaments.length} filament type{filaments.length !== 1 ? 's' : ''}
            </span>
          </div>
        </section>
      )}

      {/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Materials Table ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */}
      {activeSection === 'materials' && (
        <section className="bg-white border border-zinc-200 shadow-sm rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-200 flex items-center justify-between bg-zinc-50">
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-zinc-500" />
              <h2 className="text-sm font-semibold text-zinc-900 uppercase tracking-widest">Materials & Hardware</h2>
              {lowMaterials > 0 && (
                <span className="ml-1 inline-flex items-center gap-1 bg-amber-100 text-amber-700 text-[11px] font-semibold px-2 py-0.5 rounded-full">
                  <AlertTriangle className="w-3 h-3" /> {lowMaterials} low
                </span>
              )}
            </div>
            <button
              onClick={addMaterial}
              className="text-xs font-medium text-zinc-700 bg-white border border-zinc-200 hover:bg-zinc-50 px-2 py-1 rounded transition-colors flex items-center gap-1 shadow-sm"
            >
              <Plus className="w-3 h-3" /> Add Item
            </button>
          </div>

          {inventoryLoading ? (
            <div className="p-8 text-center text-zinc-400 text-sm border-b border-zinc-100">
              Loading inventory...
            </div>
          ) : materials.length === 0 ? (
            <div className="p-8 text-center text-zinc-400 text-sm border-b border-zinc-100">
              No materials in inventory. Add one above.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50/70">
                    <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-widest text-zinc-500">Name</th>
                    <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-widest text-zinc-500">Category</th>
                    <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-widest text-zinc-500">Qty</th>
                    <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-widest text-zinc-500 hidden">Unit</th>
                    <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-widest text-zinc-500">Unit Price</th>
                    <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-widest text-zinc-500">Notes</th>
                    <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-widest text-zinc-500">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {materials.map(m => (
                    <MaterialRow key={m.id} material={m} onUpdate={updateMaterial} onDelete={deleteMaterial} onRestock={addToHistory} />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="px-5 py-3 border-t border-zinc-100 bg-zinc-50/50 flex justify-end">
            <span className="text-xs text-zinc-400 font-medium">
              Total: <strong className="text-zinc-700">{totalMatQty.toLocaleString()} units</strong> across {materials.length} item{materials.length !== 1 ? 's' : ''}
            </span>
          </div>
        </section>
      )}

      {/* --- Expenses Table --- */}
      {activeSection === 'expenses' && (
        <section className="bg-white border border-zinc-200 shadow-sm rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-200 flex items-center justify-between bg-zinc-50">
            <div className="flex items-center gap-2">
              <Wallet className="w-4 h-4 text-zinc-500" />
              <h2 className="text-sm font-semibold text-zinc-900 uppercase tracking-widest">Other Expenses</h2>
              <span className="text-xs text-zinc-400 font-normal normal-case tracking-normal">(printers, tools, repairs, etc.)</span>
            </div>
            <button
              onClick={addExpense}
              className="text-xs font-medium text-zinc-700 bg-white border border-zinc-200 hover:bg-zinc-50 px-2 py-1 rounded transition-colors flex items-center gap-1 shadow-sm"
            >
              <Plus className="w-3 h-3" /> Add Expense
            </button>
          </div>

          {expensesLoading ? (
            <div className="p-8 text-center text-zinc-400 text-sm border-b border-zinc-100">
              Loading expenses...
            </div>
          ) : expenses.length === 0 ? (
            <div className="p-8 text-center text-zinc-400 text-sm border-b border-zinc-100">
              No expenses recorded. Add one above.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50/70">
                    <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-widest text-zinc-500">Date</th>
                    <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-widest text-zinc-500">Item</th>
                    <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-widest text-zinc-500">Category</th>
                    <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-widest text-zinc-500">Cost</th>
                    <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-widest text-zinc-500">Payer</th>
                    <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-widest text-zinc-500">Notes</th>
                    <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-widest text-zinc-500">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.map(e => (
                    <ExpenseRow key={e.id} expense={e} onUpdate={updateExpense} onDelete={deleteExpense} />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="px-5 py-3 border-t border-zinc-100 bg-zinc-50/50 flex justify-end">
            <span className="text-xs text-zinc-400 font-medium">
              Total other expenses: <strong className="text-zinc-700">PHP {totalSpentExpenses.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
            </span>
          </div>
        </section>
      )}

      {/* Purchase History Table */}
      {activeSection === 'history' && (
        <section className="bg-white border border-zinc-200 shadow-sm rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-200 flex items-center justify-between bg-zinc-50">
            <div className="flex items-center gap-2">
              <Receipt className="w-4 h-4 text-zinc-500" />
              <h2 className="text-sm font-semibold text-zinc-900 uppercase tracking-widest">Purchase History</h2>
              <span className="text-xs text-zinc-400 font-normal normal-case tracking-normal">(filament and material restocks)</span>
            </div>
            {purchaseHistory.length > 0 && (
              <button
                onClick={clearHistory}
                className="text-xs font-medium text-red-500 hover:text-red-700 hover:bg-red-50 border border-red-200 px-2 py-1 rounded transition-colors flex items-center gap-1"
              >
                <Trash2 className="w-3 h-3" /> Clear History
              </button>
            )}
          </div>

          {purchaseHistoryLoading ? (
            <div className="p-8 text-center text-zinc-400 text-sm">
              Loading purchase history...
            </div>
          ) : purchaseHistory.length === 0 ? (
            <div className="p-8 text-center text-zinc-400 text-sm">
              No purchase history yet. Use the <ShoppingCart className="w-3.5 h-3.5 inline mb-0.5 mx-1" /> Restock button on any inventory item to record a purchase.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50/70">
                    <th className="px-6 py-3 text-[11px] font-bold uppercase tracking-widest text-zinc-500">Date</th>
                    <th className="px-6 py-3 text-[11px] font-bold uppercase tracking-widest text-zinc-500">Item</th>
                    <th className="px-6 py-3 text-[11px] font-bold uppercase tracking-widest text-zinc-500">Type</th>
                    <th className="px-6 py-3 text-[11px] font-bold uppercase tracking-widest text-zinc-500">Added</th>
                    <th className="px-6 py-3 text-[11px] font-bold uppercase tracking-widest text-zinc-500">Cost</th>
                    <th className="px-6 py-3 text-[11px] font-bold uppercase tracking-widest text-zinc-500">Payer</th>
                    <th className="px-6 py-3 text-[11px] font-bold uppercase tracking-widest text-zinc-500">New Avg / Stock</th>
                    <th className="px-6 py-3 text-[11px] font-bold uppercase tracking-widest text-zinc-500 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {purchaseHistory.map(h => {
                    if (h.isExpense) {
                      return (
                        <tr key={h.id} className="border-b border-zinc-100 hover:bg-zinc-50/70 transition-colors bg-white">
                          <td className="px-6 py-4 text-xs text-zinc-500 whitespace-nowrap">
                            <span className="font-semibold text-zinc-700">{new Date(h.date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}</span>
                            <span className="block text-[10px] text-zinc-400">{new Date(h.date).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}</span>
                          </td>
                          <td className="px-6 py-4 text-sm font-bold text-zinc-900">{h.itemLabel}</td>
                          <td className="px-6 py-4">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 bg-zinc-100 px-1.5 py-0.5 rounded">
                              {h.itemCategory}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-zinc-400 font-medium">-</td>
                          <td className="px-6 py-4 text-sm font-black text-zinc-900">
                            {h.purchaseCost > 0 ? `PHP ${h.purchaseCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}
                          </td>
                          <td className="px-6 py-4 text-sm text-zinc-600 font-medium">{h.payer || '-'}</td>
                          <td className="px-6 py-4 text-xs text-zinc-400">-</td>
                          <td className="px-6 py-4 text-right">
                            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-tighter">Expense</span>
                          </td>
                        </tr>
                      );
                    }

                    const isFilamentEntry = h.itemType === 'filament' || typeof h.gramsAdded === 'number' || h.filamentId != null;
                    const itemLabel = h.itemLabel || h.filamentLabel || 'Unknown item';
                    const itemTypeLabel = isFilamentEntry ? 'Filament' : (h.itemCategory || 'Material');
                    const quantityAdded = isFilamentEntry ? h.gramsAdded : (h.quantityAdded || 0);
                    const unitLabel = isFilamentEntry ? 'g' : (h.unitLabel || 'units');
                    const batchRate = quantityAdded > 0 ? (h.purchaseCost / (quantityAdded / (isFilamentEntry ? 1000 : 1))) : 0;
                    const batchCostPerKg = batchRate;
                    const stockAfter = isFilamentEntry ? h.newWeightGrams : h.newQuantity;
                    const averageUnitLabel = isFilamentEntry ? 'kg' : unitLabel;
                    const canUndo = canUndoHistoryEntry(h);
                    return (
                      <tr key={h.id} className="border-b border-zinc-100 hover:bg-zinc-50/70 transition-colors bg-white">
                        <td className="px-6 py-4 text-xs text-zinc-500 whitespace-nowrap">
                          <span className="font-semibold text-zinc-700">{new Date(h.date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}</span>
                          <span className="block text-[10px] text-zinc-400">{new Date(h.date).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}</span>
                        </td>
                        <td className="px-6 py-4 text-sm font-bold text-zinc-900">{itemLabel}</td>
                        <td className="px-6 py-4 text-xs text-zinc-500 font-medium">{itemTypeLabel}</td>
                        <td className="px-6 py-4 text-sm text-zinc-700 font-bold">+{quantityAdded.toLocaleString()}{unitLabel}</td>
                        <td className="px-6 py-4">
                          <div className="text-sm font-black text-zinc-900">
                            {h.purchaseCost > 0 ? `PHP ${h.purchaseCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}
                          </div>
                          {h.purchaseCost > 0 && (
                            <div className="text-[10px] text-zinc-400 font-medium">PHP {batchCostPerKg.toFixed(2)}/{averageUnitLabel}</div>
                          )}
                        </td>
                        <td className="px-6 py-4 text-sm text-zinc-600 font-medium">{h.payer || '-'}</td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-md w-fit">
                              AVG: PHP {Number((isFilamentEntry ? h.newCostPerKg : h.newCostPerUnit) || 0).toFixed(2)}
                            </span>
                            <span className="text-[10px] text-zinc-500">
                              Stock: {stockAfter.toLocaleString()}{unitLabel}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => undoHistoryEntry(h)}
                              disabled={!canUndo}
                              title={canUndo ? 'Undo this purchase and roll back inventory' : 'Undo is only available while this entry matches the current stock state'}
                              className="p-1.5 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-md transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => voidHistoryEntry(h.id)}
                              className="p-1.5 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="px-5 py-3 border-t border-zinc-100 bg-zinc-50/50 flex justify-between items-center">
            <span className="text-xs text-zinc-400">{purchaseHistory.length} purchase event{purchaseHistory.length !== 1 ? 's' : ''} recorded</span>
            <span className="text-xs text-zinc-500 font-medium">
              Total spent: <strong className="text-zinc-800">PHP {totalSpent.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
            </span>
          </div>
        </section>
      )}

    </div>
  );
}

function StatCard({ label, value, sub, icon, alert }) {
  return (
    <div className={`bg-white border rounded-lg p-4 shadow-sm ${alert ? 'border-amber-200 bg-amber-50/40' : 'border-zinc-200'}`}>
      <div className={`flex items-center gap-1.5 mb-2 ${alert ? 'text-amber-500' : 'text-zinc-400'}`}>
        {icon}
        <span className="text-[11px] font-bold uppercase tracking-widest">{label}</span>
      </div>
      <div className={`text-2xl font-extrabold tracking-tight ${alert ? 'text-amber-600' : 'text-zinc-900'}`}>{value}</div>
      <div className="text-xs text-zinc-400 mt-0.5">{sub}</div>
    </div>
  );
}


