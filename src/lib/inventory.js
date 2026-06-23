import { supabase } from '../supabaseClient';

export const INVENTORY_FILAMENTS_TABLE = 'inventory_filaments';
export const INVENTORY_MATERIALS_TABLE = 'inventory_materials';
export const INVENTORY_EXPENSES_TABLE = 'inventory_expenses';

export function mapFilamentRowToState(row) {
  return {
    id: row.id,
    type: row.type,
    brand: row.brand,
    color: row.color,
    weightGrams: Number(row.weight_grams),
    costPerKg: Number(row.cost_per_kg),
    notes: row.notes,
  };
}

export function mapFilamentStateToRow(filament) {
  return {
    type: filament.type || 'PLA Basic',
    brand: filament.brand || '',
    color: filament.color || '',
    weight_grams: Number(filament.weightGrams) || 0,
    cost_per_kg: Number(filament.costPerKg) || 0,
    notes: filament.notes || '',
    updated_at: new Date().toISOString(),
  };
}

export function mapMaterialRowToState(row) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    quantity: Number(row.quantity),
    unit: row.unit,
    bulkPrice: Number(row.bulk_price),
    costPerUnit: Number(row.cost_per_unit),
    notes: row.notes,
  };
}

export function mapMaterialStateToRow(material) {
  return {
    name: material.name || 'New Item',
    category: material.category || 'Hardware',
    quantity: Number(material.quantity) || 0,
    unit: material.unit || 'pcs',
    bulk_price: Number(material.bulkPrice) || 0,
    cost_per_unit: Number(material.costPerUnit) || 0,
    notes: material.notes || '',
    updated_at: new Date().toISOString(),
  };
}

export function syncInventoryCache({ filaments, materials }) {
  if (filaments) {
    localStorage.setItem('inventory_filaments', JSON.stringify(filaments));
  }
  if (materials) {
    localStorage.setItem('inventory_materials', JSON.stringify(materials));
  }
}

export async function fetchInventoryFilaments() {
  const { data, error } = await supabase
    .from(INVENTORY_FILAMENTS_TABLE)
    .select('*')
    .order('id', { ascending: true });
  if (error) throw error;
  const filaments = (data || []).map(mapFilamentRowToState);
  syncInventoryCache({ filaments });
  return filaments;
}

export async function fetchInventoryMaterials() {
  const { data, error } = await supabase
    .from(INVENTORY_MATERIALS_TABLE)
    .select('*')
    .order('id', { ascending: true });
  if (error) throw error;
  const materials = (data || []).map(mapMaterialRowToState);
  syncInventoryCache({ materials });
  return materials;
}

export async function fetchInventoryExpenses() {
  const { data, error } = await supabase
    .from(INVENTORY_EXPENSES_TABLE)
    .select('*')
    .order('date', { ascending: false });
  if (error) throw error;
  return (data || []).map(row => ({
    id: row.id,
    date: row.date,
    itemName: row.item_name,
    category: row.category,
    cost: Number(row.cost),
    payer: row.payer,
    notes: row.notes,
  }));
}

export async function adjustInventoryStock({ filamentDeltaById = {}, materialDeltaById = {} }) {
  const filamentIds = Object.keys(filamentDeltaById);
  if (filamentIds.length > 0) {
    const { data, error } = await supabase
      .from(INVENTORY_FILAMENTS_TABLE)
      .select('*')
      .in('id', filamentIds);
    if (error) throw error;

    await Promise.all(
      (data || []).map((row) => {
        const delta = Number(filamentDeltaById[String(row.id)] || 0);
        return supabase
          .from(INVENTORY_FILAMENTS_TABLE)
          .update({
            weight_grams: Math.max(0, Number(row.weight_grams || 0) + delta),
            updated_at: new Date().toISOString(),
          })
          .eq('id', row.id);
      }),
    );
  }

  const materialIds = Object.keys(materialDeltaById);
  if (materialIds.length > 0) {
    const { data, error } = await supabase
      .from(INVENTORY_MATERIALS_TABLE)
      .select('*')
      .in('id', materialIds);
    if (error) throw error;

    await Promise.all(
      (data || []).map((row) => {
        const delta = Number(materialDeltaById[String(row.id)] || 0);
        const newQty = Math.max(0, Number(row.quantity || 0) + delta);
        return supabase
          .from(INVENTORY_MATERIALS_TABLE)
          .update({
            quantity: newQty,
            bulk_price: Math.round(newQty * Number(row.cost_per_unit || 0) * 100) / 100,
            updated_at: new Date().toISOString(),
          })
          .eq('id', row.id);
      }),
    );
  }

  const [filaments, materials] = await Promise.all([
    fetchInventoryFilaments().catch(() => null),
    fetchInventoryMaterials().catch(() => null),
  ]);

  syncInventoryCache({ filaments, materials });
}
