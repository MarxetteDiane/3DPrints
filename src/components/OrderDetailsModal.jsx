import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabaseClient';
import { adjustInventoryStock, fetchInventoryFilaments, fetchInventoryMaterials } from '../lib/inventory';
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
} from 'lucide-react';

const DEFAULT_CONFIG = {
  baseCostRate: 14.16,
  printerKwhPerHour: 0.2,
  powerSurgeKwh: 1.3,
  hourlyLaborRate: 250,
  sandingCost: 500,
  paintingCost: 800,
  assemblyCost: 350,
  filamentChangeCost: 0.1,
  failureRatePercent: 10,
  markupPercent: 30,
  familyMarkupPercent: 15,
  wearTearCostPer15Min: 2.5,
};

const fieldClass =
  'w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-md focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 transition-colors text-sm text-zinc-900';

function makeId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getStoredConfig() {
  try {
    const raw = localStorage.getItem('nexusPrintConfig');
    return raw ? { ...DEFAULT_CONFIG, ...JSON.parse(raw) } : DEFAULT_CONFIG;
  } catch {
    return DEFAULT_CONFIG;
  }
}

function formatMoney(value) {
  const numeric = Number.parseFloat(value);
  if (!Number.isFinite(numeric)) return '0.00';
  return numeric.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function createFilament(overrides = {}) {
  return {
    id: makeId('filament'),
    inventoryId: '',
    weight: 0,
    costPerKg: 700,
    ...overrides,
  };
}

function createPlate(overrides = {}) {
  return {
    id: makeId('plate'),
    printTimeHours: 0,
    printTimeMinutes: 0,
    filamentChangeCount: 0,
    filaments: [createFilament()],
    ...overrides,
  };
}

function createMaterial(overrides = {}) {
  return {
    id: makeId('material'),
    inventoryId: '',
    name: '',
    quantity: 1,
    unit: '',
    costPerUnit: 0,
    ...overrides,
  };
}

function createLabor(defaultRate, overrides = {}) {
  return {
    id: makeId('labor'),
    type: '3D Modeling & Printing',
    hours: 0,
    rate: defaultRate,
    ...overrides,
  };
}

function toEditorState(order, config) {
  const item = order?.items?.[0] || {};
  const client = order?.clients || {};
  const snapshot = order?.financial_breakdown || {};
  const persisted = snapshot.editorState;

  if (persisted) {
    return {
      clientName: persisted.clientName || client.name || '',
      clientContact: persisted.clientContact || client.contact || '',
      itemName: persisted.itemName || item.name || '',
      plates:
        persisted.plates?.length > 0
          ? persisted.plates.map((plate) => ({
            ...plate,
            id: plate.id || makeId('plate'),
            filaments:
              plate.filaments?.length > 0
                ? plate.filaments.map((filament) => ({
                  ...filament,
                  id: filament.id || makeId('filament'),
                }))
                : [createFilament()],
          }))
          : [createPlate()],
      materials:
        persisted.materials?.map((material) => ({
          ...material,
          id: material.id || makeId('material'),
        })) || [],
      labors:
        persisted.labors?.map((labor) => ({
          ...labor,
          id: labor.id || makeId('labor'),
        })) || [createLabor(config.hourlyLaborRate)],
      packagingCost: persisted.packagingCost ?? 0,
      shippingCost: persisted.shippingCost ?? 0,
      miscellaneousCost: persisted.miscellaneousCost ?? 0,
      isFamilyPricing: persisted.isFamilyPricing || false,
      imageUrl: item.image_url || persisted.imageUrl || '',
      customFinalPrice: snapshot.customFinalPrice ?? '',
      pricingMode: persisted.pricingMode || snapshot.pricingMode || 'dynamic',
      fixedStandardPrice: persisted.fixedStandardPrice !== undefined ? Number(persisted.fixedStandardPrice) : (snapshot.fixedStandardPrice !== undefined ? Number(snapshot.fixedStandardPrice) : 0),
      fixedFamilyPrice: persisted.fixedFamilyPrice !== undefined ? Number(persisted.fixedFamilyPrice) : (snapshot.fixedFamilyPrice !== undefined ? Number(snapshot.fixedFamilyPrice) : 0),
      fixedQuantity: persisted.fixedQuantity !== undefined ? Number(persisted.fixedQuantity) : (snapshot.fixedQuantity !== undefined ? Number(snapshot.fixedQuantity) : 1),
      addToGallery: persisted.addToGallery !== false && snapshot.addToGallery !== false,
      amountPaid: snapshot.amountPaid !== undefined ? Number(snapshot.amountPaid) : (persisted.amountPaid !== undefined ? Number(persisted.amountPaid) : 0),
    };
  }

  const plateCount = Math.max(1, Number(item.number_of_plates) || 1);
  const totalMinutes = Math.round((Number(item.print_time_hours) || 0) * 60);
  const totalWeight = Number(item.filament_weight_g) || 0;
  const laborHours = Number(item.labor_hours) || 0;
  const filamentCost = Number(snapshot.filamentCost) || 0;
  const laborCost = Number(snapshot.laborCost) || 0;
  const supplementaryMatCost = Number(snapshot.supplementaryMatCost) || 0;
  const logisticsCost = Number(snapshot.logisticsCost) || 0;
  const derivedRate =
    laborHours > 0 ? laborCost / laborHours : config.hourlyLaborRate;
  const derivedCostPerKg =
    totalWeight > 0 ? filamentCost / (totalWeight / 1000) : 700;

  const baseMinutes = Math.floor(totalMinutes / plateCount);
  const minuteRemainder = totalMinutes % plateCount;
  const baseWeight = totalWeight / plateCount;

  return {
    clientName: client.name || '',
    clientContact: client.contact || '',
    itemName: item.name || '',
    plates: Array.from({ length: plateCount }, (_, index) => {
      const minutesForPlate = baseMinutes + (index < minuteRemainder ? 1 : 0);
      const hours = Math.floor(minutesForPlate / 60);
      const minutes = minutesForPlate % 60;
      return createPlate({
        printTimeHours: hours,
        printTimeMinutes: minutes,
        filamentChangeCount: 0,
        filaments: [
          createFilament({
            weight: Number(baseWeight.toFixed(2)),
            costPerKg: Number(derivedCostPerKg.toFixed(2)),
          }),
        ],
      });
    }),
    materials:
      supplementaryMatCost > 0
        ? [createMaterial({ name: 'Supplementary Materials', quantity: 1, costPerUnit: supplementaryMatCost })]
        : [],
    labors: [
      createLabor(config.hourlyLaborRate, {
        type: '3D Modeling & Printing',
        hours: laborHours,
        rate: Number(derivedRate.toFixed(2)),
      }),
    ],
    packagingCost: logisticsCost,
    shippingCost: 0,
    miscellaneousCost: 0,
    isFamilyPricing: false,
    imageUrl: item.image_url || persisted.imageUrl || '',
    customFinalPrice: snapshot.customFinalPrice ?? '',
    pricingMode: snapshot.pricingMode || 'dynamic',
    fixedStandardPrice: snapshot.fixedStandardPrice !== undefined ? Number(snapshot.fixedStandardPrice) : 0,
    fixedFamilyPrice: snapshot.fixedFamilyPrice !== undefined ? Number(snapshot.fixedFamilyPrice) : 0,
    fixedQuantity: snapshot.fixedQuantity !== undefined ? Number(snapshot.fixedQuantity) : 1,
    addToGallery: snapshot.addToGallery !== false,
    amountPaid: snapshot.amountPaid !== undefined ? Number(snapshot.amountPaid) : 0,
  };
}

function calculateTotals(editorState, config) {
  let totalKWh = 0;
  let elecCost = 0;
  let filCost = 0;
  let totalMinutes = 0;
  let totalFilamentWeight = 0;
  let totalFilamentChanges = 0;

  editorState.plates.forEach((plate) => {
    const changes = Math.max(1, parseInt(plate.filamentChangeCount, 10) || 0);
    totalFilamentChanges += changes;

    const hours = Math.max(0, parseFloat(plate.printTimeHours) || 0);
    const minutes = Math.max(0, parseFloat(plate.printTimeMinutes) || 0);
    const plateMinutes = hours * 60 + minutes;
    totalMinutes += plateMinutes;

    const totalPlateHours = plateMinutes / 60;
    const surgeHours = 8 / 60;
    let surgeKWh = 0;
    let normalKWh = 0;

    if (totalPlateHours > 0) {
      surgeKWh = surgeHours * (config.powerSurgeKwh || 1.3);
      const remainingHours = Math.max(0, totalPlateHours - surgeHours);
      normalKWh = remainingHours * (config.printerKwhPerHour || 0.2);
    } else {
      surgeKWh = surgeHours * (config.powerSurgeKwh || 1.3);
    }

    totalKWh += surgeKWh + normalKWh;

    plate.filaments.forEach((filament) => {
      const weight = Math.max(0, parseFloat(filament.weight) || 0);
      const costPerKg = Math.max(0, parseFloat(filament.costPerKg) || 0);
      totalFilamentWeight += weight;
      filCost += (weight / 1000) * costPerKg;
    });
  });

  elecCost =
    totalKWh * (config.baseCostRate || 14.16) +
    totalFilamentChanges * (config.filamentChangeCost || 0.1);

  const wearTearCost =
    (totalMinutes / 15) * (config.wearTearCostPer15Min || 2.5);
  const rawOpsCost = elecCost + filCost + wearTearCost;
  const failureBufferCost =
    rawOpsCost * ((config.failureRatePercent || 10) / 100);
  const laborCost = editorState.labors.reduce(
    (sum, labor) =>
      sum +
      (parseFloat(labor.hours || 0) || 0) * (parseFloat(labor.rate || 0) || 0),
    0,
  );
  const supplementaryMatCost = editorState.materials.reduce(
    (sum, material) =>
      sum +
      (parseFloat(material.quantity) || 0) * (parseFloat(material.costPerUnit) || 0),
    0,
  );
  const logisticsCost =
    (parseFloat(editorState.packagingCost) || 0) +
    (parseFloat(editorState.shippingCost) || 0) +
    (parseFloat(editorState.miscellaneousCost) || 0);
  const markupBase =
    rawOpsCost +
    failureBufferCost +
    laborCost +
    supplementaryMatCost +
    logisticsCost;
  const isFamily = editorState.isFamilyPricing === true || editorState.isFamilyPricing === 'family';
  const isFree = editorState.isFamilyPricing === 'free';
  const isFixedMode = editorState.pricingMode === 'fixed';
  const appliedMarkupPercent = isFree ? 0 : (isFamily ? (config.familyMarkupPercent || 15) : (config.markupPercent || 30));
  
  const calculatedPrice = isFixedMode
    ? (isFree ? 0 : (isFamily ? Number(editorState.fixedFamilyPrice || 0) : Number(editorState.fixedStandardPrice || 0)))
    : (isFree ? 0 : Math.round((markupBase + (markupBase * (appliedMarkupPercent / 100))) * 100) / 100);

  const markupCost = isFree ? 0 : (isFixedMode ? Math.max(0, calculatedPrice - markupBase) : (markupBase * (appliedMarkupPercent / 100)));
  const finalPrice = isFree ? 0 : (editorState.customFinalPrice !== '' ? Math.round(Number(editorState.customFinalPrice) * 100) / 100 : calculatedPrice);

  return {
    totalKWh,
    elecCost,
    filCost,
    totalMinutes,
    totalFilamentWeight,
    wearTearCost,
    failureBufferCost,
    laborCost,
    supplementaryMatCost,
    logisticsCost,
    markupPercent: appliedMarkupPercent,
    markupCost,
    calculatedPrice,
    finalPrice,
    totalLaborHours: editorState.labors.reduce(
      (sum, labor) => sum + (parseFloat(labor.hours) || 0),
      0,
    ),
  };
}

function readValue(value) {
  const numeric = Number.parseFloat(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function buildInventoryUsageMap(editorState) {
  const usage = {};

  if (!editorState?.plates) return usage;

  editorState.plates.forEach((plate) => {
    plate.filaments?.forEach((filament) => {
      if (!filament.inventoryId) return;
      const key = String(filament.inventoryId);
      usage[key] = (usage[key] || 0) + (parseFloat(filament.weight) || 0);
    });
  });

  return usage;
}

function buildMaterialUsageMap(editorState) {
  const usage = {};

  if (!editorState?.materials) return usage;

  editorState.materials.forEach((material) => {
    if (!material.inventoryId) return;
    const key = String(material.inventoryId);
    usage[key] = (usage[key] || 0) + (parseFloat(material.quantity) || 0);
  });

  return usage;
}

export default function OrderDetailsModal({ orderId, onClose, initialIsEditing = false }) {
  const queryClient = useQueryClient();
  const [config] = useState(() => getStoredConfig());
  const [inventoryMaterials, setInventoryMaterials] = useState([]);
  const [inventoryFilaments, setInventoryFilaments] = useState([]);
  const [isEditing, setIsEditing] = useState(initialIsEditing);
  const [editorState, setEditorState] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(false);

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
    ]).then(([materialsData, filamentsData]) => {
      if (cancelled) return;
      setInventoryMaterials(materialsData);
      setInventoryFilaments(filamentsData);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const item = data?.items?.[0] || {};
  const client = data?.clients || {};
  const canEdit = data?.status && data.status !== 'Completed';
  const totals = editorState ? calculateTotals(editorState, config) : null;

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editorState || !totals) {
        throw new Error('Calculator state is not ready.');
      }

      if (!item.id || !client.id) {
        throw new Error('This order is missing related client or item records.');
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
        amountPaid: Number(editorState.amountPaid || 0),
        editorState: {
          ...editorState,
          pricingMode: editorState.pricingMode || 'dynamic',
          fixedStandardPrice: Number(editorState.fixedStandardPrice || 0),
          fixedFamilyPrice: Number(editorState.fixedFamilyPrice || 0),
          fixedQuantity: Number(editorState.fixedQuantity || 1),
          addToGallery: editorState.addToGallery !== false,
          amountPaid: Number(editorState.amountPaid || 0),
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

  const handleStartEdit = () => {
    if (!data) return;
    setEditorState(toEditorState(data, config));
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setEditorState(null);
    setIsEditing(false);
  };

  const updateEditorField = (field, value) => {
    setEditorState((current) => ({ ...current, [field]: value }));
  };

  const updatePlate = (plateId, field, value) => {
    setEditorState((current) => ({
      ...current,
      plates: current.plates.map((plate) =>
        plate.id === plateId ? { ...plate, [field]: value } : plate,
      ),
    }));
  };

  const updatePlateFilament = (plateId, filamentId, field, value) => {
    setEditorState((current) => ({
      ...current,
      plates: current.plates.map((plate) =>
        plate.id === plateId
          ? {
            ...plate,
            filaments: plate.filaments.map((filament) =>
              filament.id === filamentId
                ? { ...filament, [field]: value }
                : filament,
            ),
          }
          : plate,
      ),
    }));
  };

  const updatePlateFilamentInventory = (plateId, filamentId, value) => {
    const selected = inventoryFilaments.find((filament) => String(filament.id) === value);
    setEditorState((current) => ({
      ...current,
      plates: current.plates.map((plate) =>
        plate.id === plateId
          ? {
            ...plate,
            filaments: plate.filaments.map((filament) =>
              filament.id === filamentId
                ? {
                  ...filament,
                  inventoryId: selected ? selected.id : '',
                  costPerKg: selected ? selected.costPerKg : filament.costPerKg,
                }
                : filament,
            ),
          }
          : plate,
      ),
    }));
  };

  const addPlate = () => {
    setEditorState((current) => ({
      ...current,
      plates: [...current.plates, createPlate()],
    }));
  };

  const removePlate = (plateId) => {
    setEditorState((current) => ({
      ...current,
      plates:
        current.plates.length > 1
          ? current.plates.filter((plate) => plate.id !== plateId)
          : current.plates,
    }));
  };

  const addPlateFilament = (plateId) => {
    setEditorState((current) => ({
      ...current,
      plates: current.plates.map((plate) =>
        plate.id === plateId
          ? { ...plate, filaments: [...plate.filaments, createFilament()] }
          : plate,
      ),
    }));
  };

  const removePlateFilament = (plateId, filamentId) => {
    setEditorState((current) => ({
      ...current,
      plates: current.plates.map((plate) =>
        plate.id === plateId
          ? {
            ...plate,
            filaments:
              plate.filaments.length > 1
                ? plate.filaments.filter((filament) => filament.id !== filamentId)
                : plate.filaments,
          }
          : plate,
      ),
    }));
  };

  const addMaterial = () => {
    setEditorState((current) => ({
      ...current,
      materials: [...current.materials, createMaterial()],
    }));
  };

  const updateMaterial = (materialId, field, value) => {
    setEditorState((current) => ({
      ...current,
      materials: current.materials.map((material) =>
        material.id === materialId ? { ...material, [field]: value } : material,
      ),
    }));
  };

  const updateMaterialInventory = (materialId, value) => {
    const selected = inventoryMaterials.find((material) => String(material.id) === value);
    setEditorState((current) => ({
      ...current,
      materials: current.materials.map((material) =>
        material.id === materialId
          ? {
            ...material,
            inventoryId: selected ? selected.id : '',
            name: selected ? selected.name : material.name,
            unit: selected ? (selected.unit || '') : material.unit,
            costPerUnit: selected
              ? Number(
                selected.costPerUnit ??
                (((Number(selected.bulkPrice) || 0) /
                  Math.max(1, Number(selected.quantity) || 1)) || 0),
              )
              : material.costPerUnit,
          }
          : material,
      ),
    }));
  };

  const removeMaterial = (materialId) => {
    setEditorState((current) => ({
      ...current,
      materials: current.materials.filter((material) => material.id !== materialId),
    }));
  };

  const addLabor = () => {
    setEditorState((current) => ({
      ...current,
      labors: [...current.labors, createLabor(config.hourlyLaborRate)],
    }));
  };

  const updateLabor = (laborId, field, value) => {
    setEditorState((current) => ({
      ...current,
      labors: current.labors.map((labor) =>
        labor.id === laborId ? { ...labor, [field]: value } : labor,
      ),
    }));
  };

  const removeLabor = (laborId) => {
    setEditorState((current) => ({
      ...current,
      labors:
        current.labors.length > 1
          ? current.labors.filter((labor) => labor.id !== laborId)
          : current.labors,
    }));
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
                <button
                  onClick={handleStartEdit}
                  className="px-3 py-2 text-sm font-semibold text-zinc-700 bg-white border border-zinc-300 hover:bg-zinc-100 rounded transition-colors inline-flex items-center gap-2"
                >
                  <Pencil className="w-4 h-4" />
                  Edit Order
                </button>
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
            <div className="flex flex-col lg:flex-row gap-6 items-start">
              <div className="flex-1 w-full space-y-6">
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

                <section className="bg-white border border-zinc-200 shadow-sm rounded-lg overflow-hidden">
                  <div className="px-5 py-4 border-b border-zinc-200 flex items-center gap-2">
                    <User className="w-4 h-4 text-zinc-500" />
                    <h2 className="text-sm font-semibold text-zinc-900 uppercase tracking-widest">Client Identity</h2>
                  </div>
                  <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-5">
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">Client Name</label>
                      <input value={editorState.clientName} onChange={(e) => updateEditorField('clientName', e.target.value)} className={fieldClass} />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">Contact / Phone</label>
                      <input value={editorState.clientContact} onChange={(e) => updateEditorField('clientContact', e.target.value)} className={fieldClass} />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">Pricing Tier</label>
                      <select
                        value={String(editorState.isFamilyPricing)}
                        onChange={(e) => {
                          const val = e.target.value;
                          updateEditorField('isFamilyPricing', val === 'true' ? true : val === 'false' ? false : val);
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

                <section className="bg-white border border-zinc-200 shadow-sm rounded-lg overflow-hidden">
                  <div className="px-5 py-4 border-b border-zinc-200">
                    <h2 className="text-sm font-semibold text-zinc-900 uppercase tracking-widest">1. Object Specification</h2>
                  </div>
                  <div className="p-5 space-y-4">
                    <div>
                       <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">Item Name</label>
                       <input value={editorState.itemName} onChange={(e) => updateEditorField('itemName', e.target.value)} className={fieldClass} />
                     </div>

                     {/* Pricing Mode Selection */}
                     <div className="border-t border-zinc-100 pt-4">
                       <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">Pricing Mode</label>
                       <div className="flex gap-2 p-1 bg-zinc-100 rounded-lg max-w-sm mb-4">
                         <button
                           type="button"
                           onClick={() => updateEditorField('pricingMode', 'dynamic')}
                           className={`flex-1 text-center py-1.5 text-xs font-bold rounded-md transition-all ${
                             editorState.pricingMode === 'dynamic' || !editorState.pricingMode
                               ? 'bg-white text-zinc-900 shadow-sm'
                               : 'text-zinc-500 hover:text-zinc-950'
                           }`}
                         >
                           📊 Calculated Estimate
                         </button>
                         <button
                           type="button"
                           onClick={() => updateEditorField('pricingMode', 'fixed')}
                           className={`flex-1 text-center py-1.5 text-xs font-bold rounded-md transition-all ${
                             editorState.pricingMode === 'fixed'
                               ? 'bg-white text-zinc-900 shadow-sm'
                               : 'text-zinc-500 hover:text-zinc-950'
                           }`}
                         >
                           🏷️ Fixed Catalog Price
                         </button>
                       </div>

                       {editorState.pricingMode === 'fixed' && (
                         <div className="grid grid-cols-3 gap-4 bg-zinc-50 border border-zinc-200/60 rounded-xl p-4 animate-in slide-in-from-top-1 duration-200">
                           <div>
                             <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5">Quantity</label>
                             <input
                               type="number"
                               value={editorState.fixedQuantity === 0 ? '' : editorState.fixedQuantity}
                               onChange={(e) => updateEditorField('fixedQuantity', e.target.value === '' ? 0 : Number(e.target.value))}
                               placeholder="e.g., 1"
                               className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-md focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 transition-colors text-sm text-zinc-900 font-bold"
                             />
                           </div>
                           <div>
                             <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5">Fixed Standard (PHP)</label>
                             <input
                               type="number"
                               value={editorState.fixedStandardPrice === 0 ? '' : editorState.fixedStandardPrice}
                               onChange={(e) => updateEditorField('fixedStandardPrice', e.target.value === '' ? 0 : Number(e.target.value))}
                               placeholder="e.g., 500"
                               className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-md focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 transition-colors text-sm text-zinc-900 font-bold"
                             />
                           </div>
                           <div>
                             <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5">Fixed Family (PHP)</label>
                             <input
                               type="number"
                               value={editorState.fixedFamilyPrice === 0 ? '' : editorState.fixedFamilyPrice}
                               onChange={(e) => updateEditorField('fixedFamilyPrice', e.target.value === '' ? 0 : Number(e.target.value))}
                               placeholder="e.g., 350"
                               className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-md focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 transition-colors text-sm text-zinc-900 font-bold"
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
                            id="modal-image-uploader"
                            className="hidden"
                            onChange={handleImageFileChange}
                          />
                          <button
                            type="button"
                            onClick={() => document.getElementById('modal-image-uploader').click()}
                            disabled={uploadingImage}
                            className="px-3.5 py-1.5 bg-zinc-900 hover:bg-black text-white text-xs font-bold rounded-lg transition-all shadow-sm flex items-center gap-1.5 disabled:opacity-50"
                          >
                            {uploadingImage ? 'Compressing...' : 'Upload Image File'}
                          </button>
                          <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">or paste link below:</span>
                        </div>

                        <div className="flex gap-4 items-start">
                          <input 
                            value={editorState.imageUrl || ''} 
                            onChange={(e) => updateEditorField('imageUrl', e.target.value)} 
                            placeholder="https://images.unsplash.com/... or paste image URL"
                            className={fieldClass} 
                          />
                          {editorState.imageUrl && (
                            <div className="w-12 h-12 rounded-md border border-zinc-200 overflow-hidden bg-zinc-50 shrink-0 shadow-sm flex items-center justify-center relative group">
                              <img src={editorState.imageUrl} alt="preview" className="w-full h-full object-cover" onError={(e) => e.target.style.display = 'none'} />
                              <button
                                type="button"
                                onClick={() => updateEditorField('imageUrl', '')}
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

                    {/* Gallery Inclusion Switch */}
                    <div className="border-t border-zinc-100 pt-4 flex items-center gap-2.5">
                      <input
                        type="checkbox"
                        id="modal-addToGallery"
                        checked={editorState.addToGallery !== false}
                        onChange={(e) => updateEditorField('addToGallery', e.target.checked)}
                        className="w-4 h-4 rounded text-zinc-900 border-zinc-300 focus:ring-zinc-900 focus:ring-opacity-50 accent-zinc-900 cursor-pointer"
                      />
                      <label htmlFor="modal-addToGallery" className="text-xs font-bold text-zinc-700 cursor-pointer select-none">
                        Add this product to the Product Gallery
                      </label>
                    </div>

                  </div>
                </section>

                <section className="bg-white border border-zinc-200 shadow-sm rounded-lg overflow-hidden">
                  <div className="px-5 py-4 border-b border-zinc-200 flex items-center justify-between bg-zinc-50">
                    <h2 className="text-sm font-semibold text-zinc-900 uppercase tracking-widest flex items-center gap-2">
                      <Layers className="w-4 h-4 text-zinc-500" />
                      2. Plates & Operations
                    </h2>
                    <button onClick={addPlate} className="text-xs font-medium text-zinc-700 bg-white border border-zinc-200 hover:bg-zinc-50 px-2 py-1 rounded transition-colors flex items-center gap-1 shadow-sm">
                      <Plus className="w-3 h-3" />
                      Add Plate
                    </button>
                  </div>

                  <div className="p-4 sm:p-5 space-y-6">
                    {editorState.plates.map((plate, index) => {
                      // Calculate electricity cost for this plate
                      const pFilaChangesCount = Math.max(1, parseInt(plate.filamentChangeCount, 10) || 0);
                      const hours = Math.max(0, parseFloat(plate.printTimeHours) || 0);
                      const minutes = Math.max(0, parseFloat(plate.printTimeMinutes) || 0);
                      const plateMinutes = (hours * 60) + minutes;
                      const totalPlateHours = plateMinutes / 60;
                      const surgeHours = 8 / 60; // 8 minutes per plate
                      let surgeKWh = 0;
                      let normalKWh = 0;

                      if (totalPlateHours > 0) {
                        surgeKWh = surgeHours * (config?.powerSurgeKwh || 1.3);
                        const remainingHours = Math.max(0, totalPlateHours - surgeHours);
                        normalKWh = remainingHours * (config?.printerKwhPerHour || 0.2);
                      } else {
                        surgeKWh = surgeHours * (config?.powerSurgeKwh || 1.3);
                        normalKWh = 0;
                      }
                      const plateKWh = surgeKWh + normalKWh;
                      const plateElecCost = (plateKWh * (config?.baseCostRate || 14.16)) + (pFilaChangesCount * (config?.filamentChangeCost || 0.1));

                      // Calculate filament cost for this plate
                      let plateFilCost = 0;
                      plate.filaments?.forEach(f => {
                        const weight = Math.max(0, parseFloat(f.weight) || 0);
                        plateFilCost += (weight / 1000) * Math.max(0, parseFloat(f.costPerKg) || 0);
                      });

                      return (
                        <div key={plate.id} className="border border-zinc-200 rounded-lg overflow-hidden bg-zinc-50/50 shadow-sm transition-all">
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
                            {editorState.plates.length > 1 && (
                              <button onClick={() => removePlate(plate.id)} className="p-1.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors">
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
                                  value={plate.printTimeHours}
                                  onChange={(e) => updatePlate(plate.id, 'printTimeHours', e.target.value === '' ? '' : Number(e.target.value))}
                                  className={`${fieldClass} pr-12`}
                                />
                                <span className="absolute inset-y-0 right-3 flex items-center text-zinc-400 text-xs pointer-events-none uppercase">hrs</span>
                              </div>
                              <div className="relative">
                                <input
                                  type="number"
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
                            <button onClick={() => addPlateFilament(plate.id)} className="text-[11px] font-medium text-zinc-700 bg-zinc-100 hover:bg-zinc-200 px-2 py-1.5 rounded transition-colors flex items-center gap-1">
                              <Plus className="w-3 h-3" /> Add Filament
                            </button>
                          </div>
                          <div className="space-y-3">
                            {plate.filaments.map((filament, fIndex) => (
                              <div key={filament.id} className="grid grid-cols-1 md:grid-cols-[1.5fr_1fr_1fr_auto] gap-4 md:gap-3 items-end bg-zinc-50/50 p-4 md:p-3 rounded border border-zinc-100">
                                <div>
                                  <label className="block text-[10px] font-semibold uppercase tracking-widest text-zinc-500 mb-1">Filament {fIndex + 1}</label>
                                  <select value={filament.inventoryId} onChange={(e) => updatePlateFilamentInventory(plate.id, filament.id, e.target.value)} className={fieldClass}>
                                    <option value="">— select filament —</option>
                                    {inventoryFilaments.map((inv) => (
                                      <option key={inv.id} value={String(inv.id)}>{inv.type} – {inv.color} ({inv.brand})</option>
                                    ))}
                                  </select>
                                </div>
                                <div>
                                  <label className="block text-[10px] font-semibold uppercase tracking-widest text-zinc-500 mb-1">Weight Used</label>
                                  <div className="relative">
                                    <input
                                      type="number"
                                      value={filament.weight}
                                      onChange={(e) => updatePlateFilament(plate.id, filament.id, 'weight', e.target.value === '' ? '' : Number(e.target.value))}
                                      className={`${fieldClass} pr-9`}
                                    />
                                    <span className="absolute inset-y-0 right-3 flex items-center text-zinc-400 text-xs pointer-events-none">g</span>
                                  </div>
                                </div>
                                <div>
                                  <label className="block text-[10px] font-semibold uppercase tracking-widest text-zinc-500 mb-1">Cost Rate</label>
                                  <div className="relative">
                                    <input
                                      type="number"
                                      value={filament.costPerKg}
                                      onChange={(e) => updatePlateFilament(plate.id, filament.id, 'costPerKg', e.target.value === '' ? '' : Number(e.target.value))}
                                      className={`${fieldClass} pr-12`}
                                    />
                                    <span className="absolute inset-y-0 right-3 flex items-center text-zinc-400 text-xs pointer-events-none">PHP/kg</span>
                                  </div>
                                </div>
                                <div className="flex h-[38px] items-center">
                                  {plate.filaments.length > 1 && (
                                    <button onClick={() => removePlateFilament(plate.id, filament.id)} className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors">
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )})}
                  </div>
                </section>

                <section className="bg-white border border-zinc-200 shadow-sm rounded-lg overflow-hidden">
                  <div className="px-5 py-4 border-b border-zinc-200 flex items-center justify-between bg-zinc-50">
                    <h2 className="text-sm font-semibold text-zinc-900 uppercase tracking-widest flex items-center gap-2">
                      <Coins className="w-4 h-4 text-zinc-500" />
                      3. Supplementary Items
                    </h2>
                    <button onClick={addMaterial} className="text-xs font-medium text-zinc-700 bg-white border border-zinc-200 hover:bg-zinc-50 px-2 py-1 rounded transition-colors flex items-center gap-1 shadow-sm">
                      <Plus className="w-3 h-3" />
                      Add Item
                    </button>
                  </div>
                  <div className="p-4 sm:p-5">
                    {editorState.materials.length === 0 ? (
                      <div className="py-4 text-xs text-zinc-400 text-center border border-dashed border-zinc-200 rounded bg-zinc-50">No supplementary items.</div>
                    ) : (
                      <div className="space-y-4">
                        {editorState.materials.map((mat) => (
                          <div key={mat.id} className="grid grid-cols-1 md:grid-cols-[1.7fr_0.8fr_1fr_auto] gap-4 md:gap-3 items-end bg-zinc-50 p-4 md:p-3 rounded border border-zinc-100">
                            <div>
                              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">Inventory Item</label>
                              <select value={mat.inventoryId} onChange={(e) => updateMaterialInventory(mat.id, e.target.value)} className={fieldClass}>
                                <option value="">-- select material/hardware --</option>
                                {inventoryMaterials.map((inv) => (
                                  <option key={inv.id} value={String(inv.id)}>{inv.name} ({inv.unit})</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">Qty</label>
                              <div className="relative">
                                <input
                                  type="number"
                                  value={mat.quantity}
                                  onChange={(e) => updateMaterial(mat.id, 'quantity', e.target.value === '' ? '' : Number(e.target.value))}
                                  className={`${fieldClass} pr-10`}
                                />
                                <span className="absolute inset-y-0 right-3 flex items-center text-zinc-400 text-xs pointer-events-none">{mat.unit || 'pcs'}</span>
                              </div>
                            </div>
                            <div>
                              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">Cost / Unit</label>
                              <div className="relative">
                                <input
                                  type="number"
                                  value={mat.costPerUnit}
                                  onChange={(e) => updateMaterial(mat.id, 'costPerUnit', e.target.value === '' ? '' : Number(e.target.value))}
                                  className={`${fieldClass} pr-12`}
                                />
                                <span className="absolute inset-y-0 right-3 flex items-center text-zinc-400 text-xs pointer-events-none">PHP</span>
                              </div>
                            </div>
                            <button onClick={() => removeMaterial(mat.id)} className="p-1.5 text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 rounded transition-colors shrink-0">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </section>

                <section className="bg-white border border-zinc-200 shadow-sm rounded-lg overflow-hidden">
                  <div className="px-5 py-4 border-b border-zinc-200 flex items-center justify-between bg-zinc-50">
                    <h2 className="text-sm font-semibold text-zinc-900 uppercase tracking-widest">4. Processing & Labor</h2>
                    <button onClick={addLabor} className="text-xs font-medium text-zinc-700 bg-white border border-zinc-200 hover:bg-zinc-50 px-2 py-1 rounded transition-colors flex items-center gap-1 shadow-sm">
                      <Plus className="w-3 h-3" />
                      Add Labor
                    </button>
                  </div>
                  <div className="p-4 sm:p-5">
                    {editorState.labors.length === 0 ? (
                      <div className="py-4 text-xs text-zinc-400 text-center border border-dashed border-zinc-200 rounded bg-zinc-50">No labor items tracked.</div>
                    ) : (
                      <div className="space-y-4">
                        {editorState.labors.map((lab) => (
                          <div key={lab.id} className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_auto] gap-4 md:gap-3 items-end bg-zinc-50 p-4 md:p-3 rounded border border-zinc-100">
                            <div>
                              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">Operation Phase</label>
                              <select value={lab.type} onChange={(e) => updateLabor(lab.id, 'type', e.target.value)} className={fieldClass}>
                                <option value="3D Modeling & Printing">3D Modeling & Printing</option>
                                <option value="Painting">Painting</option>
                                <option value="Sanding">Sanding</option>
                                <option value="Assembly">Assembly</option>
                                <option value="Other">Other</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">Duration</label>
                              <div className="relative">
                                <input
                                  type="number"
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
                                  value={lab.rate}
                                  onChange={(e) => updateLabor(lab.id, 'rate', e.target.value === '' ? '' : Number(e.target.value))}
                                  className={`${fieldClass} pr-10`}
                                />
                                <span className="absolute inset-y-0 right-3 flex items-center text-zinc-400 text-xs pointer-events-none">/hr</span>
                              </div>
                            </div>
                            <button onClick={() => removeLabor(lab.id)} className="p-2.5 text-zinc-400 hover:text-zinc-900 hover:bg-zinc-200 rounded transition-colors">
                              <Trash2 className="w-5 h-5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </section>

                <section className="bg-white border border-zinc-200 shadow-sm rounded-lg overflow-hidden">
                  <div className="px-5 py-4 border-b border-zinc-200">
                    <h2 className="text-sm font-semibold text-zinc-900 uppercase tracking-widest">5. Packaging & Shipping</h2>
                  </div>
                  <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-5">
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">Packaging</label>
                      <div className="relative">
                        <input type="number" min="0" step="0.01" value={editorState.packagingCost} onChange={(e) => updateEditorField('packagingCost', e.target.value)} className={`${fieldClass} pr-12 font-medium`} />
                        <span className="absolute inset-y-0 right-3 flex items-center text-zinc-400 text-xs pointer-events-none">PHP</span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">Shipping Cost</label>
                      <div className="relative">
                        <input type="number" min="0" step="0.01" value={editorState.shippingCost} onChange={(e) => updateEditorField('shippingCost', e.target.value)} className={`${fieldClass} pr-12 font-medium`} />
                        <span className="absolute inset-y-0 right-3 flex items-center text-zinc-400 text-xs pointer-events-none">PHP</span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">Miscellaneous</label>
                      <div className="relative">
                        <input type="number" min="0" step="0.01" value={editorState.miscellaneousCost} onChange={(e) => updateEditorField('miscellaneousCost', e.target.value)} className={`${fieldClass} pr-12 font-medium`} />
                        <span className="absolute inset-y-0 right-3 flex items-center text-zinc-400 text-xs pointer-events-none">PHP</span>
                      </div>
                    </div>
                  </div>
                </section>
              </div>

              <div className="w-full lg:w-[360px] lg:sticky lg:top-0">
                <div className="bg-white border border-zinc-300 shadow-xl shadow-zinc-100 rounded-lg overflow-hidden flex flex-col">
                  <div className="p-5 border-b border-zinc-200 bg-zinc-50 flex items-center gap-2">
                    <Calculator className="w-4 h-4 text-zinc-500" />
                    <h2 className="text-sm font-bold tracking-tight text-zinc-900 uppercase">Financial Summary</h2>
                  </div>
                  <div className="p-6">
                    <div className="space-y-3 font-medium text-sm text-zinc-600 border-b border-zinc-100 pb-5">
                      <div className="flex justify-between items-center"><span>Material Allocation</span><span className="text-zinc-900">{formatMoney(totals.filCost)}</span></div>
                      <div className="flex justify-between items-center"><span>Utility & Infrastructure <span className="text-xs text-zinc-400 font-normal">({totals.totalKWh.toFixed(1)} kWh)</span></span><span className="text-zinc-900">{formatMoney(totals.elecCost)}</span></div>
                      <div className="flex justify-between items-center pt-1.5 border-t border-dashed border-zinc-200"><span className="font-semibold text-zinc-800">Material & Utility Combined</span><span className="font-semibold text-zinc-900">{formatMoney(totals.filCost + totals.elecCost)}</span></div>
                      {totals.wearTearCost > 0 && <div className="flex justify-between items-center"><span>Machine Wear & Tear</span><span className="text-zinc-900">{formatMoney(totals.wearTearCost)}</span></div>}
                      {totals.failureBufferCost > 0 && <div className="flex justify-between items-center pt-1"><span className="italic">Ops Waste Buffer <span className="text-xs text-zinc-400 font-normal">({config.failureRatePercent}%)</span></span><span className="text-zinc-900 italic">+{formatMoney(totals.failureBufferCost)}</span></div>}
                      <div className="flex justify-between items-center pt-2 border-t border-zinc-100 mt-2"><span>Direct Labor</span><span className="text-zinc-900">{formatMoney(totals.laborCost)}</span></div>
                      {editorState.materials.length > 0 && <div className="flex justify-between items-center"><span>Supplementary</span><span className="text-zinc-900">{formatMoney(totals.supplementaryMatCost)}</span></div>}
                      {(readValue(editorState.packagingCost) > 0 || readValue(editorState.shippingCost) > 0 || readValue(editorState.miscellaneousCost) > 0) && <div className="flex justify-between items-center pt-2 border-t border-zinc-100 mt-2"><span>Logistics & Overheads</span><span className="text-zinc-900">{formatMoney(totals.logisticsCost)}</span></div>}
                      {totals.markupCost > 0 && <div className="flex justify-between items-center pt-2 border-t border-zinc-100 mt-2"><span className="font-semibold text-emerald-600">Markup Profit <span className="text-xs font-normal">({totals.markupPercent}%)</span></span><span className="text-emerald-700 font-semibold">+{formatMoney(totals.markupCost)}</span></div>}
                    </div>

                    <div className="pt-2 flex flex-col items-end">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-1">Override Final Sell Price (Optional)</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder={`Calc: PHP ${formatMoney(totals.calculatedPrice)}`}
                        value={editorState.customFinalPrice}
                        onChange={e => updateEditorField('customFinalPrice', e.target.value)}
                        className="w-48 px-3 py-1.5 text-right bg-zinc-50 border border-zinc-200 rounded-md text-sm font-medium mb-4 focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 transition-colors"
                      />
                      <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-1">Amount Paid</span>
                      <div className="relative mb-4">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="0.00"
                          value={editorState.amountPaid}
                          onChange={e => updateEditorField('amountPaid', e.target.value)}
                          className="w-48 px-3 py-1.5 text-right bg-zinc-50 border border-zinc-200 rounded-md text-sm font-medium focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 transition-colors pr-12"
                        />
                        <span className="absolute inset-y-0 right-3 flex items-center text-zinc-400 text-xs pointer-events-none">PHP</span>
                      </div>
                      <span className="text-xs font-bold uppercase tracking-widest text-zinc-400 mb-1">Total Billable</span>
                      <div className="flex items-baseline gap-1">
                        <span className="text-lg font-semibold text-zinc-400">PHP</span>
                        <span className="text-4xl font-extrabold text-zinc-900 tracking-tight">{formatMoney(totals.finalPrice)}</span>
                      </div>
                      {editorState.customFinalPrice !== '' && (
                        <span className="text-[10px] text-zinc-400 mt-1 uppercase font-semibold tracking-wider bg-zinc-100 px-2 py-0.5 rounded text-red-500">
                          Overridden (Calc: {formatMoney(totals.calculatedPrice)})
                        </span>
                      )}
                      <div className="flex items-baseline justify-between w-full mt-3 pt-3 border-t border-zinc-100 text-xs text-zinc-500 font-semibold">
                        <span>Remaining Balance:</span>
                        <span className="text-sm font-bold text-zinc-900">PHP {formatMoney(Math.max(0, totals.finalPrice - Number(editorState.amountPaid || 0)))}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
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

              <div className="border border-zinc-200 rounded-lg overflow-hidden">
                <div className="bg-zinc-50 px-5 py-3 border-b border-zinc-200 flex items-center justify-between">
                  <h4 className="font-semibold text-zinc-900 text-sm uppercase tracking-wider flex items-center gap-2">
                    <Calculator className="w-4 h-4 text-emerald-600" />
                    Financial Snapshot
                  </h4>
                  <span className="text-xs text-zinc-500 font-medium tracking-wide bg-zinc-200/50 px-2 py-0.5 rounded">{data.financial_breakdown ? 'Fixed' : 'Unavailable'}</span>
                </div>
                {data.financial_breakdown ? (
                  <div className="p-5 flex flex-col gap-3 text-sm text-zinc-600">
                    <div className="flex justify-between items-center"><span>Material Allocation</span><span className="text-zinc-900">{formatMoney(data.financial_breakdown.filamentCost)}</span></div>
                    <div className="flex justify-between items-center"><span>Utility & Infrastructure <span className="text-xs text-zinc-400">({Number.parseFloat(data.financial_breakdown.totalKWh || 0).toFixed(1)} kWh)</span></span><span className="text-zinc-900">{formatMoney(data.financial_breakdown.electricityCost)}</span></div>
                    <div className="flex justify-between items-center pt-1.5 border-t border-dashed border-zinc-200"><span className="font-semibold text-zinc-800">Material & Utility Combined</span><span className="font-semibold text-zinc-900">{formatMoney(Number(data.financial_breakdown.filamentCost) + Number(data.financial_breakdown.electricityCost))}</span></div>
                    {data.financial_breakdown.wearTearCost > 0 && <div className="flex justify-between items-center"><span>Machine Wear & Tear</span><span className="text-zinc-900">{formatMoney(data.financial_breakdown.wearTearCost)}</span></div>}
                    {data.financial_breakdown.failureBufferCost > 0 && <div className="flex justify-between items-center italic text-zinc-500"><span>Ops Waste Buffer <span className="text-xs text-zinc-400">({data.financial_breakdown.failureRatePercent}%)</span></span><span className="text-zinc-900">+{formatMoney(data.financial_breakdown.failureBufferCost)}</span></div>}
                    <div className="flex justify-between items-center border-t border-zinc-100 pt-3 mt-1"><span>Direct Labor</span><span className="text-zinc-900">{formatMoney(data.financial_breakdown.laborCost)}</span></div>
                    {data.financial_breakdown.supplementaryMatCost > 0 && <div className="flex justify-between items-center"><span>Supplementary</span><span className="text-zinc-900">{formatMoney(data.financial_breakdown.supplementaryMatCost)}</span></div>}
                    {data.financial_breakdown.logisticsCost > 0 && <div className="flex justify-between items-center"><span>Logistics & Overheads</span><span className="text-zinc-900">{formatMoney(data.financial_breakdown.logisticsCost)}</span></div>}
                    {data.financial_breakdown.markupCost > 0 && <div className="flex justify-between items-center border-t border-zinc-100 pt-3 mt-1"><span className="font-semibold text-emerald-600">Markup Profit <span className="text-xs font-normal">({data.financial_breakdown.markupPercent}%)</span></span><span className="text-emerald-700 font-semibold">+{formatMoney(data.financial_breakdown.markupCost)}</span></div>}
                    <div className="flex flex-col items-end pt-5 border-t border-zinc-200 mt-2">
                      <span className="text-xs font-bold uppercase tracking-widest text-zinc-400 mb-1">Total Billable</span>
                      <div className="flex items-baseline gap-1">
                        <span className="text-lg font-semibold text-zinc-400">PHP</span>
                        <span className="text-4xl font-extrabold text-zinc-900 tracking-tight">{formatMoney(data.total_price)}</span>
                      </div>
                      <div className="flex justify-between items-center w-full mt-3 pt-3 border-t border-zinc-100 text-sm">
                        <span className="text-zinc-500 font-semibold">Amount Paid</span>
                        <span className="font-bold text-emerald-600">PHP {formatMoney(data.financial_breakdown?.amountPaid || 0)}</span>
                      </div>
                      <div className="flex justify-between items-center w-full mt-1.5 text-sm">
                        <span className="text-zinc-500 font-semibold">Remaining Balance</span>
                        <span className="font-bold text-zinc-900">PHP {formatMoney(Math.max(0, data.total_price - (data.financial_breakdown?.amountPaid || 0)))}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-zinc-50 border-t border-zinc-200 border-dashed p-6 flex flex-col items-center justify-center text-center">
                    <Calculator className="w-6 h-6 text-zinc-300 mb-2" />
                    <p className="text-sm font-semibold text-zinc-500">Financial Snapshot Unavailable</p>
                    <p className="text-xs text-zinc-400 mt-1 max-w-[280px]">Legacy orders processed prior to the database upgrade do not contain price snapshots.</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 bg-zinc-50 border-t border-zinc-200 flex justify-end shrink-0">
          <button onClick={onClose} className="bg-white border border-zinc-300 hover:bg-zinc-100 text-zinc-900 text-sm font-semibold py-2 px-6 rounded transition-colors shadow-sm">
            Close Details
          </button>
        </div>
      </div>
    </div>
  );
}
