export const DEFAULT_CONFIG = {
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

export function makeId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function getStoredConfig() {
  try {
    const raw = localStorage.getItem('mackyPrintConfig');
    return raw ? { ...DEFAULT_CONFIG, ...JSON.parse(raw) } : DEFAULT_CONFIG;
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function createFilament(overrides = {}) {
  return {
    id: makeId('filament'),
    inventoryId: '',
    weight: 0,
    costPerKg: 700,
    ...overrides,
  };
}

export function createPlate(overrides = {}) {
  return {
    id: makeId('plate'),
    printTimeHours: 0,
    printTimeMinutes: 0,
    filamentChangeCount: 0,
    filaments: [createFilament()],
    ...overrides,
  };
}

export function createMaterial(overrides = {}) {
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

export function createLabor(defaultRate, overrides = {}) {
  return {
    id: makeId('labor'),
    type: '3D Modeling & Printing',
    hours: 0,
    rate: defaultRate,
    worker: '',
    ...overrides,
  };
}

export function buildInventoryUsageMap(state) {
  const usage = {};
  if (!state?.plates) return usage;
  state.plates.forEach((plate) => {
    plate.filaments?.forEach((filament) => {
      if (!filament.inventoryId) return;
      const key = String(filament.inventoryId);
      usage[key] = (usage[key] || 0) + (parseFloat(filament.weight) || 0);
    });
  });
  return usage;
}

export function buildMaterialUsageMap(state) {
  const usage = {};
  if (!state?.materials) return usage;
  state.materials.forEach((material) => {
    if (!material.inventoryId) return;
    const key = String(material.inventoryId);
    usage[key] = (usage[key] || 0) + (parseFloat(material.quantity) || 0);
  });
  return usage;
}

export function getStockWarning(inventoryId, usedAmount, availableStock, unit) {
  if (!inventoryId || availableStock == null) return null;
  const diff = usedAmount - availableStock;
  if (diff > 0) {
    const formatted = Number.isInteger(diff) ? diff : diff.toFixed(2);
    return `Item low on stock. Need ${formatted}${unit ? ' ' + unit : ''} more.`;
  }
  return null;
}

export function calculateTotals(state, config = DEFAULT_CONFIG) {
  let totalKWh = 0;
  let elecCost = 0;
  let filCost = 0;
  let totalMinutes = 0;
  let totalFilamentWeight = 0;
  let totalFilamentChanges = 0;

  if (state?.plates) {
    state.plates.forEach((plate) => {
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

      plate.filaments?.forEach((filament) => {
        const weight = Math.max(0, parseFloat(filament.weight) || 0);
        const costPerKg = Math.max(0, parseFloat(filament.costPerKg) || 0);
        totalFilamentWeight += weight;
        filCost += (weight / 1000) * costPerKg;
      });
    });
  }

  elecCost =
    totalKWh * (config.baseCostRate || 14.16) +
    totalFilamentChanges * (config.filamentChangeCost || 0.1);

  const wearTearCost =
    (totalMinutes / 15) * (config.wearTearCostPer15Min || 2.5);
  const rawOpsCost = elecCost + filCost + wearTearCost;
  const failureBufferCost =
    rawOpsCost * ((config.failureRatePercent || 10) / 100);

  const laborCost = state?.labors
    ? state.labors.reduce(
        (sum, labor) =>
          sum +
          (parseFloat(labor.hours || 0) || 0) * (parseFloat(labor.rate || 0) || 0),
        0,
      )
    : 0;

  const supplementaryMatCost = state?.materials
    ? state.materials.reduce(
        (sum, material) =>
          sum +
          (parseFloat(material.quantity) || 0) * (parseFloat(material.costPerUnit) || 0),
        0,
      )
    : 0;

  const logisticsCost =
    (parseFloat(state?.packagingCost || 0) || 0) +
    (parseFloat(state?.shippingCost || 0) || 0) +
    (parseFloat(state?.miscellaneousCost || 0) || 0);

  const markupBase =
    rawOpsCost +
    failureBufferCost +
    laborCost +
    supplementaryMatCost +
    logisticsCost;

  const isFamily = state?.isFamilyPricing === true || state?.isFamilyPricing === 'family';
  const isFree = state?.isFamilyPricing === 'free';
  const isFixedMode = state?.pricingMode === 'fixed';
  const appliedMarkupPercent = isFree ? 0 : (isFamily ? (config.familyMarkupPercent || 15) : (config.markupPercent || 30));

  const calculatedPrice = isFixedMode
    ? (isFree ? 0 : (isFamily ? Number(state.fixedFamilyPrice || 0) : Number(state.fixedStandardPrice || 0)))
    : (isFree ? 0 : Math.round((markupBase + (markupBase * (appliedMarkupPercent / 100))) * 100) / 100);

  const markupCost = isFree ? 0 : (isFixedMode ? Math.max(0, calculatedPrice - markupBase) : (markupBase * (appliedMarkupPercent / 100)));
  const finalPrice = isFree ? 0 : (state?.customFinalPrice !== '' && state?.customFinalPrice !== undefined ? Math.round(Number(state.customFinalPrice) * 100) / 100 : calculatedPrice);

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
    markupBase,
    totalLaborHours: state?.labors
      ? state.labors.reduce((sum, labor) => sum + (parseFloat(labor.hours) || 0), 0)
      : 0,
  };
}

export function initEditorState(config = DEFAULT_CONFIG) {
  return {
    clientName: '',
    clientContact: '',
    itemName: '',
    imageUrl: '',
    pricingMode: 'fixed',
    fixedStandardPrice: 0,
    fixedFamilyPrice: 0,
    fixedQuantity: 1,
    plates: [createPlate()],
    labors: [createLabor(config?.hourlyLaborRate || 250)],
    materials: [],
    packagingCost: 0,
    shippingCost: 0,
    miscellaneousCost: 0,
    isFamilyPricing: false,
    addToGallery: true,
    amountPaid: 0,
    entryType: 'catalog',
    orderItems: [],
  };
}

export function toEditorState(order, config = DEFAULT_CONFIG) {
  const item = order?.items?.[0] || order?.items || {};
  const client = order?.clients || {};
  const snapshot = order?.financial_breakdown || {};
  const persisted = snapshot.editorState;

  if (persisted) {
    return {
      clientName: persisted.clientName || client.name || '',
      clientContact: persisted.clientContact || client.contact || persisted.clientPhone || '',
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
          worker: labor.worker || '',
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
      entryType: persisted.entryType || 'custom',
      orderItems: persisted.orderItems || [],
      isExistingOrder: true,
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
    imageUrl: item.image_url || '',
    customFinalPrice: snapshot.customFinalPrice ?? '',
    pricingMode: snapshot.pricingMode || 'dynamic',
    fixedStandardPrice: snapshot.fixedStandardPrice !== undefined ? Number(snapshot.fixedStandardPrice) : 0,
    fixedFamilyPrice: snapshot.fixedFamilyPrice !== undefined ? Number(snapshot.fixedFamilyPrice) : 0,
    fixedQuantity: snapshot.fixedQuantity !== undefined ? Number(snapshot.fixedQuantity) : 1,
    addToGallery: snapshot.addToGallery !== false,
    amountPaid: snapshot.amountPaid !== undefined ? Number(snapshot.amountPaid) : 0,
    entryType: 'custom',
    orderItems: [],
    isExistingOrder: true,
  };
}
