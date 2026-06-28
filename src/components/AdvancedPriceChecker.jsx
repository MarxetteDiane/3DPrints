import { useEffect, useReducer, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabaseClient';
import { adjustInventoryStock, fetchInventoryFilaments, fetchInventoryMaterials } from '../lib/inventory';
import { fetchProducts } from '../lib/products';
import {
  Calculator, Plus, Trash2, Box, Zap, Clock, Coins, Wrench, CheckCircle2, Paintbrush, Shield, User, Layers, Tag
} from 'lucide-react';

const initialState = {
  clientName: '',
  clientPhone: '',
  itemName: '',
  imageUrl: '',
  pricingMode: 'dynamic',
  fixedStandardPrice: 0,
  fixedFamilyPrice: 0,
  fixedQuantity: 1,
  plates: [
    {
      id: Date.now(),
      printTimeHours: 0,
      printTimeMinutes: 0,
      filamentChangeCount: 0,
      filaments: [{ id: Date.now() + 1, weight: 0, costPerKg: 700 }]
    }
  ],
  labors: [],
  materials: [],
  packagingCost: 0,
  shippingCost: 0,
  miscellaneousCost: 0,
  isFamilyPricing: false,
  addToGallery: true,
};

function init(config) {
  return {
    ...initialState,
    addToGallery: true,
    plates: [
      {
        id: Date.now(),
        printTimeHours: 0,
        printTimeMinutes: 0,
        filamentChangeCount: 0,
        filaments: [{ id: Date.now() + 1, weight: 0, costPerKg: 700 }]
      }
    ],
    labors: [{ id: Date.now() + 2, type: '3D Modeling & Printing', hours: 0, rate: config?.hourlyLaborRate || 250, worker: '' }]
  };
}

function formReducer(state, action) {
  switch (action.type) {
    case 'UPDATE_FIELD':
      return { ...state, [action.field]: action.value };
    case 'LOAD_TEMPLATE':
      return {
        ...state,
        ...action.template,
        clientName: action.template.clientName || state.clientName,
        clientPhone: action.template.clientContact || action.template.clientPhone || state.clientPhone,
        imageUrl: action.template.imageUrl || action.template.image_url || '',
        pricingMode: action.template.pricingMode || 'dynamic',
        fixedStandardPrice: action.template.fixedStandardPrice !== undefined ? Number(action.template.fixedStandardPrice) : 0,
        fixedFamilyPrice: action.template.fixedFamilyPrice !== undefined ? Number(action.template.fixedFamilyPrice) : 0,
        fixedQuantity: action.template.fixedQuantity !== undefined ? Number(action.template.fixedQuantity) : 1,
        addToGallery: action.template.addToGallery !== false,
      };

    case 'RESET_FORM':
      return init(action.config);

    case 'ADD_PLATE':
      return {
        ...state,
        plates: [
          ...state.plates,
          {
            id: Date.now(),
            printTimeHours: 0,
            printTimeMinutes: 0,
            filamentChangeCount: 0,
            filaments: [{ id: Date.now() + 1, weight: 0, costPerKg: 700 }]
          }
        ]
      };
    case 'REMOVE_PLATE':
      return {
        ...state,
        plates: state.plates.filter(p => p.id !== action.id)
      };
    case 'UPDATE_PLATE':
      return {
        ...state,
        plates: state.plates.map(p =>
          p.id === action.id ? { ...p, [action.field]: action.value } : p
        )
      };

    case 'ADD_PLATE_FILAMENT':
      return {
        ...state,
        plates: state.plates.map(p =>
          p.id === action.plateId
            ? { ...p, filaments: [...p.filaments, { id: Date.now(), weight: 0, costPerKg: 700 }] }
            : p
        )
      };
    case 'UPDATE_PLATE_FILAMENT':
      return {
        ...state,
        plates: state.plates.map(p =>
          p.id === action.plateId
            ? {
              ...p,
              filaments: p.filaments.map(f =>
                f.id === action.filamentId ? { ...f, [action.field]: action.value } : f
              )
            }
            : p
        )
      };
    case 'REMOVE_PLATE_FILAMENT':
      return {
        ...state,
        plates: state.plates.map(p =>
          p.id === action.plateId
            ? { ...p, filaments: p.filaments.filter(f => f.id !== action.filamentId) }
            : p
        )
      };

    case 'ADD_MATERIAL':
      return {
        ...state,
        materials: [...state.materials, { id: Date.now(), inventoryId: '', name: '', quantity: 1, unit: '', costPerUnit: 0 }]
      };
    case 'UPDATE_MATERIAL':
      return {
        ...state,
        materials: state.materials.map(m =>
          m.id === action.id ? { ...m, [action.field]: action.value } : m
        )
      };
    case 'REMOVE_MATERIAL':
      return {
        ...state,
        materials: state.materials.filter(m => m.id !== action.id)
      };

    case 'ADD_LABOR':
      return {
        ...state,
        labors: [...state.labors, { id: Date.now(), type: '3D Modeling & Printing', hours: 0, rate: action.defaultRate || 250, worker: '' }]
      };
    case 'UPDATE_LABOR':
      return {
        ...state,
        labors: state.labors.map(l =>
          l.id === action.id ? { ...l, [action.field]: action.value } : l
        )
      };
    case 'REMOVE_LABOR':
      return {
        ...state,
        labors: state.labors.filter(l => l.id !== action.id)
      };
    default:
      return state;
  }
}

// Binary STL parser removed as per user request to replace with image url input

function buildFilamentUsageMap(plates) {
  const usage = {};
  plates?.forEach((plate) => {
    plate.filaments?.forEach((filament) => {
      if (!filament.inventoryId) return;
      const key = String(filament.inventoryId);
      usage[key] = (usage[key] || 0) + (parseFloat(filament.weight) || 0);
    });
  });
  return usage;
}

function buildMaterialUsageMap(materials) {
  const usage = {};
  materials?.forEach((material) => {
    if (!material.inventoryId) return;
    const key = String(material.inventoryId);
    usage[key] = (usage[key] || 0) + (parseFloat(material.quantity) || 0);
  });
  return usage;
}

function getStockWarning(inventoryId, usedAmount, availableStock, unit) {
  if (!inventoryId || availableStock == null) return null;
  const diff = usedAmount - availableStock;
  if (diff > 0) {
    const formatted = Number.isInteger(diff) ? diff : diff.toFixed(2);
    return `Item low on stock. Need ${formatted}${unit ? ' ' + unit : ''} more.`;
  }
  return null;
}

export default function AdvancedPriceChecker({ config }) {
  const [state, dispatch] = useReducer(formReducer, config, init);
  const queryClient = useQueryClient();

  useEffect(() => {
    const handleLoadTemplate = (e) => {
      const template = e.detail;
      if (template) {
        dispatch({ type: 'LOAD_TEMPLATE', template });
        setSelectedProductId('');
        setSelectedVariantId('');
        setEntryType('custom');
        setOrderItems([]);

        // Pre-fill custom final price if overridden
        if (template.customFinalPrice !== undefined) {
          setCustomFinalPrice(template.customFinalPrice || '');
        } else {
          setCustomFinalPrice('');
        }

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
  const [customFinalPrice, setCustomFinalPrice] = useState('');
  const [entryType, setEntryType] = useState('catalog'); // 'catalog' or 'custom'
  const [orderItems, setOrderItems] = useState([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [selectedVariantId, setSelectedVariantId] = useState('');
  const [selectedQty, setSelectedQty] = useState(1);

  // STL States removed in favor of direct Image URL input

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

  // Sync predefined order items with the pricing engine form state
  useEffect(() => {
    if (entryType === 'catalog') {
      if (orderItems.length === 0) {
        // Clear calculations and reset to initial default placeholders
        dispatch({ type: 'UPDATE_FIELD', field: 'itemName', value: '' });
        dispatch({ type: 'UPDATE_FIELD', field: 'fixedStandardPrice', value: 0 });
        dispatch({ type: 'UPDATE_FIELD', field: 'fixedFamilyPrice', value: 0 });
        dispatch({ type: 'UPDATE_FIELD', field: 'plates', value: init(config).plates });
        dispatch({ type: 'UPDATE_FIELD', field: 'labors', value: init(config).labors });
        return;
      }

      // Generate item name: single product uses full name, multiple uses "(N) Items"
      const totalQuantity = orderItems.reduce((sum, item) => sum + item.quantity, 0);
      const combinedItemName = orderItems.length === 1
        ? `${orderItems[0].quantity}x ${orderItems[0].productName} (${orderItems[0].variantName})`
        : `${totalQuantity} Items`;

      dispatch({ type: 'UPDATE_FIELD', field: 'itemName', value: combinedItemName });

      // Sum fixed standard and family prices
      const fixedStandardPrice = orderItems.reduce((sum, item) => sum + (item.fixedStandardPrice * item.quantity), 0);
      const fixedFamilyPrice = orderItems.reduce((sum, item) => sum + (item.fixedFamilyPrice * item.quantity), 0);
      dispatch({ type: 'UPDATE_FIELD', field: 'fixedStandardPrice', value: fixedStandardPrice });
      dispatch({ type: 'UPDATE_FIELD', field: 'fixedFamilyPrice', value: fixedFamilyPrice });
      dispatch({ type: 'UPDATE_FIELD', field: 'pricingMode', value: 'fixed' });

      // Generate separate plates dynamically for each variant (scaled by quantity)
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

      // Sum and generate labor list
      const totalLaborHours = orderItems.reduce((sum, item) => sum + (item.laborHours * item.quantity), 0);
      const labors = [{
        id: Date.now() + 20,
        type: '3D Modeling & Printing',
        hours: totalLaborHours,
        rate: config?.hourlyLaborRate || 250,
        worker: ''
      }];

      dispatch({ type: 'UPDATE_FIELD', field: 'plates', value: plates });
      dispatch({ type: 'UPDATE_FIELD', field: 'labors', value: labors });
    }
  }, [orderItems, entryType]);

  // handleStlUpload removed
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
        dispatch({ type: 'UPDATE_FIELD', field: 'imageUrl', value: compressedBase64 });
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


  const calcElectricityAndMaterials = () => {
    let totalKWh = 0;
    let elecCost = 0;
    let filCost = 0;
    let totalMinutes = 0;
    let totalFilamentWeight = 0;
    let totalFilamentChanges = 0;

    state.plates.forEach(plate => {
      const pFilaChangesCount = Math.max(1, parseInt(plate.filamentChangeCount) || 0);
      totalFilamentChanges += pFilaChangesCount;

      const hours = Math.max(0, parseFloat(plate.printTimeHours) || 0);
      const minutes = Math.max(0, parseFloat(plate.printTimeMinutes) || 0);
      const plateMinutes = (hours * 60) + minutes;
      totalMinutes += plateMinutes;

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
      totalKWh += (surgeKWh + normalKWh);

      plate.filaments.forEach(f => {
        const weight = Math.max(0, parseFloat(f.weight) || 0);
        totalFilamentWeight += weight;
        filCost += (weight / 1000) * Math.max(0, parseFloat(f.costPerKg) || 0);
      });
    });

    elecCost = (totalKWh * (config?.baseCostRate || 14.16)) + (totalFilamentChanges * (config?.filamentChangeCost || 0.1));

    return { totalKWh, elecCost, filCost, totalMinutes, totalFilamentWeight };
  };

  const { totalKWh, elecCost, filCost, totalMinutes, totalFilamentWeight } = calcElectricityAndMaterials();

  const wearTearCost = (totalMinutes / 15) * (config?.wearTearCostPer15Min || 2.5);

  const rawOpsCost = elecCost + filCost + wearTearCost;
  const failureBufferCost = rawOpsCost * ((config?.failureRatePercent || 10) / 100);

  const laborCost = state.labors.reduce((sum, lab) => sum + (parseFloat(lab.hours || 0) * parseFloat(lab.rate || 0)), 0);
  const matCost = state.materials.reduce((sum, mat) => sum + ((parseFloat(mat.quantity) || 0) * (parseFloat(mat.costPerUnit) || 0)), 0);
  const logisticsCost = (parseFloat(state.packagingCost) || 0) + (parseFloat(state.shippingCost) || 0) + (parseFloat(state.miscellaneousCost) || 0);

  const servicesCost =
    (additionalServices.sanding ? (config?.sandingCost || 500) : 0) +
    (additionalServices.painting ? (config?.paintingCost || 800) : 0) +
    (additionalServices.assembly ? (config?.assemblyCost || 350) : 0);

  const basePriceWithFailure = rawOpsCost + failureBufferCost + laborCost + matCost + logisticsCost + servicesCost;
  const displayTotalCost = filCost + elecCost + matCost + laborCost;
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

  const handleNum = (e) => {
    const val = e.target.value === '' ? '' : Number(e.target.value);
    dispatch({ type: 'UPDATE_FIELD', field: e.target.name, value: val });
  };

  const handleText = (e) => {
    dispatch({ type: 'UPDATE_FIELD', field: e.target.name, value: e.target.value });
  };

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
      const editorState = {
        clientName: state.clientName,
        clientContact: state.clientPhone,
        itemName: state.itemName,
        imageUrl: state.imageUrl || '',
        pricingMode: state.pricingMode || 'dynamic',
        fixedStandardPrice: Number(state.fixedStandardPrice || 0),
        fixedFamilyPrice: Number(state.fixedFamilyPrice || 0),
        fixedQuantity: Number(state.fixedQuantity || 1),
        addToGallery: state.addToGallery !== false,
        plates: state.plates,
        materials: state.materials,
        labors: state.labors,
        packagingCost: state.packagingCost,
        shippingCost: state.shippingCost,
        miscellaneousCost: state.miscellaneousCost,
        entryType: entryType,
        orderItems: entryType === 'catalog' ? orderItems : [],
        isFamilyPricing: state.isFamilyPricing,
      };

      const financial_breakdown = {
        electricityCost: elecCost,
        totalKWh: totalKWh,
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
        customFinalPrice: customFinalPrice !== '' ? Math.round(Number(customFinalPrice) * 100) / 100 : null,
        pricingMode: state.pricingMode || 'dynamic',
        fixedStandardPrice: Number(state.fixedStandardPrice || 0),
        fixedFamilyPrice: Number(state.fixedFamilyPrice || 0),
        fixedQuantity: Number(state.fixedQuantity || 1),
        addToGallery: state.addToGallery !== false,
        editorState
      };

      const rawPrice = customFinalPrice !== '' ? Number(customFinalPrice) : finalPrice;
      const roundedPrice = Math.round(rawPrice * 100) / 100;

      const { data: orderId, error: rpcErr } = await supabase.rpc('create_order_with_items', {
        p_client_name: state.clientName,
        p_client_phone: state.clientPhone,
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
    },
    onError: (e) => {
      console.error('Database Error:', e.message);
      alert('Failed to save order to Supabase.');
      setShowModal(false);
    }
  });

  return (
    <div className="flex flex-col lg:flex-row gap-6 items-start font-sans">

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
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">Client Name <span className="text-red-500">*</span></label>
              <input
                type="text" name="clientName" value={state.clientName} onChange={handleText}
                placeholder="e.g., John Doe" required
                className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-md focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 transition-colors text-sm text-zinc-900"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">Contact / Phone (Optional)</label>
              <input
                type="text" name="clientPhone" value={state.clientPhone} onChange={handleText}
                placeholder="+63 912 345 6789"
                className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-md focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 transition-colors text-sm text-zinc-900"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">Pricing Tier</label>
              <select
                name="isFamilyPricing"
                value={String(state.isFamilyPricing)}
                onChange={(e) => {
                  const val = e.target.value;
                  dispatch({
                    type: 'UPDATE_FIELD',
                    field: 'isFamilyPricing',
                    value: val === 'true' ? true : val === 'false' ? false : val
                  });
                }}
                className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-md focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 transition-colors text-sm text-zinc-900"
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
                  setEntryType('catalog');
                  dispatch({ type: 'UPDATE_FIELD', field: 'pricingMode', value: 'fixed' });
                }}
                className={`px-3 py-1 rounded-md transition-all ${entryType === 'catalog' ? 'bg-white text-zinc-900 shadow-xs' : 'text-zinc-500 hover:text-zinc-900'}`}
              >
                Predefined Catalog
              </button>
              <button
                type="button"
                onClick={() => {
                  setEntryType('custom');
                  setOrderItems([]);
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
                      {products.map(p => (
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
                      {selectedProductId && products.find(p => p.id === selectedProductId)?.variants.map(v => (
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
                        const product = products.find(p => p.id === selectedProductId);
                        if (product) {
                          const variant = product.variants.find(v => v.id === selectedVariantId);
                          if (variant) {
                            const existingIndex = orderItems.findIndex(
                              item => item.productId === product.id && item.variantId === variant.id
                            );

                            if (existingIndex > -1) {
                              const updated = [...orderItems];
                              updated[existingIndex].quantity += selectedQty;
                              setOrderItems(updated);
                            } else {
                              setOrderItems([
                                ...orderItems,
                                {
                                  id: Date.now(),
                                  productId: product.id,
                                  productName: product.name,
                                  variantId: variant.id,
                                  variantName: variant.name,
                                  fixedStandardPrice: variant.fixedStandardPrice,
                                  fixedFamilyPrice: variant.fixedFamilyPrice,
                                  weightGrams: variant.weightGrams,
                                  printTimeHours: variant.printTimeHours,
                                  laborHours: variant.laborHours,
                                  quantity: selectedQty
                                }
                              ]);
                            }

                            if (product.imageUrl && !state.imageUrl) {
                              dispatch({ type: 'UPDATE_FIELD', field: 'imageUrl', value: product.imageUrl });
                            }

                            setSelectedProductId('');
                            setSelectedVariantId('');
                            setSelectedQty(1);
                          }
                        }
                      }}
                      className="w-full bg-zinc-900 hover:bg-black text-white text-xs font-semibold py-2 px-3 rounded-lg transition-colors flex items-center justify-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm h-[38px]"
                    >
                      <Plus className="w-3.5 h-3.5 shrink-0" /> Add to Order
                    </button>
                  </div>
                </div>

                <div className="border border-zinc-200 rounded-xl overflow-hidden bg-white shadow-xs">
                  <div className="px-4 py-2 bg-zinc-50 border-b border-zinc-200 flex justify-between text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                    <span>Order Items</span>
                    <span>Subtotal</span>
                  </div>

                  {orderItems.length === 0 ? (
                    <div className="p-8 text-center text-zinc-400 text-xs font-medium">
                      No catalog items added to this order.
                    </div>
                  ) : (
                    <div className="divide-y divide-zinc-100">
                      {orderItems.map((item) => (
                        <div key={item.id} className="p-3.5 flex items-center justify-between gap-4 text-xs hover:bg-zinc-50/50 transition-colors">
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <div className="flex items-center border border-zinc-200 rounded-lg overflow-hidden shrink-0 bg-zinc-50">
                              <button
                                type="button"
                                onClick={() => {
                                  if (item.quantity > 1) {
                                    setOrderItems(orderItems.map(oi => oi.id === item.id ? { ...oi, quantity: oi.quantity - 1 } : oi));
                                  } else {
                                    setOrderItems(orderItems.filter(oi => oi.id !== item.id));
                                  }
                                }}
                                className="px-2 py-0.5 text-xs hover:bg-zinc-200 text-zinc-600 transition-colors font-bold"
                              >
                                -
                              </button>
                              <span className="px-2 py-0.5 text-xs font-bold text-zinc-900 bg-white min-w-[20px] text-center">
                                {item.quantity}
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  setOrderItems(orderItems.map(oi => oi.id === item.id ? { ...oi, quantity: oi.quantity + 1 } : oi));
                                }}
                                className="px-2 py-0.5 text-xs hover:bg-zinc-200 text-zinc-600 transition-colors font-bold"
                              >
                                +
                              </button>
                            </div>
                            <div className="min-w-0">
                              <div className="font-bold text-zinc-800 truncate">{item.productName}</div>
                              <div className="text-[10px] text-zinc-500 font-medium">Variant: {item.variantName} (PHP {item.fixedStandardPrice} each)</div>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 shrink-0 pl-2">
                            <span className="font-bold text-zinc-950 text-right min-w-[80px]">
                              PHP {(item.fixedStandardPrice * item.quantity).toFixed(2)}
                            </span>
                            <button
                              type="button"
                              onClick={() => setOrderItems(orderItems.filter(oi => oi.id !== item.id))}
                              className="p-1 hover:bg-red-50 text-zinc-400 hover:text-red-600 rounded transition-colors"
                              title="Remove item"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}

                      {/* Summary breakdown inside Section 1 */}
                      <div className="p-4 bg-zinc-50/50 flex flex-col gap-2 text-xs font-medium text-zinc-500 border-t border-zinc-200">
                        <div className="flex justify-between text-sm font-bold text-zinc-900 pt-1">
                          <span>Standard Order Total:</span>
                          <span className="text-zinc-900">
                            PHP {orderItems.reduce((sum, item) => sum + (item.fixedStandardPrice * item.quantity), 0).toFixed(2)}
                          </span>
                        </div>
                        <div className="flex justify-between text-xs font-semibold text-emerald-800">
                          <span>Family Discount Total:</span>
                          <span>
                            PHP {orderItems.reduce((sum, item) => sum + (item.fixedFamilyPrice * item.quantity), 0).toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm('Are you sure you want to clear this entire order?')) {
                        setOrderItems([]);
                        dispatch({ type: 'RESET_FORM', config });
                      }
                    }}
                    className="border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-600 text-xs font-semibold py-2 px-4 rounded-lg transition-colors"
                  >
                    Clear Order Sheet
                  </button>
                </div>
              </div>
            ) : (
              /* Custom Print manual spec */
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">Item Name</label>
                  <input
                    type="text" name="itemName" value={state.itemName} onChange={handleText}
                    placeholder="e.g., Mechanical Keyboard Chassis"
                    className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-md focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 transition-colors text-sm text-zinc-900 font-medium"
                  />
                </div>

                <div className="border-t border-zinc-100 pt-4">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">Pricing Mode</label>
                  <div className="flex gap-2 p-1 bg-zinc-100 rounded-lg max-w-sm mb-4">
                    <button
                      type="button"
                      onClick={() => dispatch({ type: 'UPDATE_FIELD', field: 'pricingMode', value: 'dynamic' })}
                      className={`flex-1 text-center py-1.5 text-xs font-bold rounded-md transition-all ${state.pricingMode === 'dynamic' || !state.pricingMode
                        ? 'bg-white text-zinc-950 shadow-sm'
                        : 'text-zinc-500 hover:text-zinc-950'
                        }`}
                    >
                      📊 Calculated Estimate
                    </button>
                    <button
                      type="button"
                      onClick={() => dispatch({ type: 'UPDATE_FIELD', field: 'pricingMode', value: 'fixed' })}
                      className={`flex-1 text-center py-1.5 text-xs font-bold rounded-md transition-all ${state.pricingMode === 'fixed'
                        ? 'bg-white text-zinc-950 shadow-sm'
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
                          name="fixedQuantity"
                          value={state.fixedQuantity === 0 ? '' : state.fixedQuantity}
                          onChange={handleNum}
                          placeholder="e.g., 1"
                          className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-md focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 transition-colors text-sm text-zinc-900 font-bold"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5">Fixed Standard (PHP)</label>
                        <input
                          type="number"
                          name="fixedStandardPrice"
                          value={state.fixedStandardPrice === 0 ? '' : state.fixedStandardPrice}
                          onChange={handleNum}
                          placeholder="e.g., 500"
                          className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-md focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 transition-colors text-sm text-zinc-900 font-bold text-zinc-800"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5">Fixed Family (PHP)</label>
                        <input
                          type="number"
                          name="fixedFamilyPrice"
                          value={state.fixedFamilyPrice === 0 ? '' : state.fixedFamilyPrice}
                          onChange={handleNum}
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
              </div>
            )}

            {/* Track 1: Product Photo / Image URL Zone */}
            {/* 
            <div className="border-t border-zinc-100 pt-4">
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">
                Product Photo
              </label>

              <div className="space-y-3">
                <div className="flex flex-wrap gap-2.5 items-center">
                  <input
                    type="file"
                    accept="image/*"
                    id="calc-image-uploader"
                    className="hidden"
                    onChange={handleImageFileChange}
                  />
                  <button
                    type="button"
                    onClick={() => document.getElementById('calc-image-uploader').click()}
                    disabled={uploadingImage}
                    className="px-3.5 py-1.5 bg-zinc-900 hover:bg-black text-white text-xs font-bold rounded-lg transition-all shadow-sm flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {uploadingImage ? 'Compressing...' : 'Upload Image File'}
                  </button>
                  <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">or paste link below:</span>
                </div>

                <div className="flex gap-4 items-start">
                  <input
                    type="text"
                    name="imageUrl"
                    value={state.imageUrl || ''}
                    onChange={handleText}
                    placeholder="https://images.unsplash.com/... or paste image URL"
                    className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-md focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 transition-colors text-sm text-zinc-900 font-medium"
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
                        onClick={() => dispatch({ type: 'UPDATE_FIELD', field: 'imageUrl', value: '' })}
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
            */}

            {/* Gallery Inclusion Switch – only for custom prints */}
            {entryType !== 'catalog' && (
              <div className="border-t border-zinc-100 pt-4 flex items-center gap-2.5">
                <input
                  type="checkbox"
                  id="addToGallery"
                  checked={state.addToGallery !== true}
                  onChange={(e) => dispatch({ type: 'UPDATE_FIELD', field: 'addToGallery', value: e.target.checked })}
                  className="w-4 h-4 rounded text-zinc-900 border-zinc-300 focus:ring-zinc-900 focus:ring-opacity-50 accent-zinc-900 cursor-pointer"
                />
                <label htmlFor="addToGallery" className="text-xs font-bold text-zinc-700 cursor-pointer select-none">
                  Add this product to the Product Gallery
                </label>
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
              onClick={() => dispatch({ type: 'ADD_PLATE' })}
              className="text-xs font-medium text-zinc-700 bg-white border border-zinc-200 hover:bg-zinc-50 px-2 py-1 rounded transition-colors flex items-center gap-1 shadow-sm"
            >
              <Plus className="w-3 h-3" /> Add Plate
            </button>
          </div>

          <div className="p-5 space-y-6">
            {state.plates.map((plate, index) => {
              // Calculate electricity cost for this plate
              const pFilaChangesCount = Math.max(1, parseInt(plate.filamentChangeCount) || 0);
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
              plate.filaments.forEach(f => {
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
                          Filament: PHP {plateFilCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        <span className="bg-zinc-100 text-zinc-600 px-2 py-0.5 rounded font-bold uppercase tracking-wider">
                          Electricity: PHP {plateElecCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                    {state.plates.length > 1 && (
                      <button
                        onClick={() => dispatch({ type: 'REMOVE_PLATE', id: plate.id })}
                        className="p-1.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors tooltip relative group"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span className="hidden group-hover:block absolute bottom-full mb-2 right-0 whitespace-nowrap bg-zinc-800 text-white text-[10px] px-2 py-1 rounded">Remove Plate</span>
                      </button>
                    )}
                  </div>

                  <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-5 border-b border-zinc-200 bg-zinc-50/50">
                    <div className="flex flex-col gap-2">
                      <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">Print Timeline</label>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="relative">
                          <input
                            type="number" min="0" step="1"
                            value={plate.printTimeHours}
                            onChange={(e) => dispatch({ type: 'UPDATE_PLATE', id: plate.id, field: 'printTimeHours', value: e.target.value === '' ? '' : Number(e.target.value) })}
                            className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-md focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 transition-colors text-sm text-zinc-900 text-left pr-12 font-medium"
                          />
                          <span className="absolute inset-y-0 right-3 flex items-center text-zinc-400 text-xs pointer-events-none uppercase">hrs</span>
                        </div>
                        <div className="relative">
                          <input
                            type="number" min="0" max="59" step="1"
                            value={plate.printTimeMinutes}
                            onChange={(e) => dispatch({ type: 'UPDATE_PLATE', id: plate.id, field: 'printTimeMinutes', value: e.target.value === '' ? '' : Number(e.target.value) })}
                            className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-md focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 transition-colors text-sm text-zinc-900 text-left pr-12 font-medium"
                          />
                          <span className="absolute inset-y-0 right-3 flex items-center text-zinc-400 text-xs pointer-events-none uppercase">mins</span>
                        </div>
                      </div>
                    </div>

                    <div className="group relative">
                      <label className="flex items-center text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">
                        Filament Changes
                        <div className="hidden group-hover:block ml-2 w-48 bg-zinc-800 text-zinc-50 text-[11px] rounded p-1.5 text-center absolute bottom-full mb-1 left-0 shadow-lg pointer-events-none z-10 normal-case tracking-normal">
                          Allocates {config?.filamentChangeCost || 0.1} PHP per filament change.
                        </div>
                      </label>
                      <div className="relative">
                        <input
                          type="number" min="0"
                          value={plate.filamentChangeCount}
                          onChange={(e) => dispatch({ type: 'UPDATE_PLATE', id: plate.id, field: 'filamentChangeCount', value: e.target.value === '' ? '' : Number(e.target.value) })}
                          className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-md focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 transition-colors text-sm text-zinc-900 text-left pr-12 font-medium"
                        />
                        <span className="absolute inset-y-0 right-3 flex items-center text-zinc-400 text-xs pointer-events-none uppercase">qty</span>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 bg-white">
                    <div className="flex items-center justify-between mb-3">
                      <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">Filaments Used</label>
                      <button
                        onClick={() => dispatch({ type: 'ADD_PLATE_FILAMENT', plateId: plate.id })}
                        className="text-[11px] font-medium text-zinc-700 bg-zinc-100 hover:bg-zinc-200 px-2 py-1.5 rounded transition-colors flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" /> Add Filament
                      </button>
                    </div>

                    <div className="space-y-3">
                      {plate.filaments.map((filament, fIndex) => (
                        <div key={filament.id} className="grid grid-cols-1 md:grid-cols-[1.5fr_1fr_1fr_auto] gap-4 md:gap-3 items-end bg-zinc-50/50 p-4 md:p-3 rounded border border-zinc-100">

                          {/* Inventory Filament Selector */}
                          <div>
                            <label className="block text-[10px] font-semibold uppercase tracking-widest text-zinc-500 mb-1">Filament {fIndex + 1}</label>
                            {inventoryFilaments.length > 0 ? (
                              <select
                                value={filament.inventoryId ?? ''}
                                onChange={(e) => {
                                  const inv = inventoryFilaments.find(f => String(f.id) === e.target.value);
                                  if (inv) {
                                    dispatch({ type: 'UPDATE_PLATE_FILAMENT', plateId: plate.id, filamentId: filament.id, field: 'inventoryId', value: inv.id });
                                    dispatch({ type: 'UPDATE_PLATE_FILAMENT', plateId: plate.id, filamentId: filament.id, field: 'costPerKg', value: inv.costPerKg });
                                  } else {
                                    dispatch({ type: 'UPDATE_PLATE_FILAMENT', plateId: plate.id, filamentId: filament.id, field: 'inventoryId', value: '' });
                                  }
                                }}
                                className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-md focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 transition-colors text-sm text-zinc-900"
                              >
                                <option value="">— select filament —</option>
                                {inventoryFilaments.map(inv => (
                                  <option key={inv.id} value={String(inv.id)}>
                                    {inv.type || inv.name}{inv.color ? ` – ${inv.color}` : ''}{inv.brand ? ` (${inv.brand})` : ''}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <div className="px-3 py-2 bg-zinc-50 border border-dashed border-zinc-200 rounded-md text-xs text-zinc-400 italic">
                                No inventory — add filaments in the Inventory tab
                              </div>
                            )}
                          </div>

                          {/* Weight */}
                          <div>
                            <label className="block text-[10px] font-semibold uppercase tracking-widest text-zinc-500 mb-1">Weight Used</label>
                            <div className="relative">
                              <input
                                type="number" min="0" value={filament.weight}
                                onChange={(e) => dispatch({ type: 'UPDATE_PLATE_FILAMENT', plateId: plate.id, filamentId: filament.id, field: 'weight', value: e.target.value === '' ? '' : Number(e.target.value) })}
                                className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-md focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 transition-colors text-sm text-zinc-900 text-left pr-9 font-medium"
                              />
                              <span className="absolute inset-y-0 right-3 flex items-center text-zinc-400 text-xs pointer-events-none">g</span>
                            </div>
                            {(() => {
                              if (!filament.inventoryId) return null;
                              const invItem = inventoryFilaments.find(f => String(f.id) === String(filament.inventoryId));
                              if (!invItem) return null;
                              const totalUsed = buildFilamentUsageMap(state.plates)[String(filament.inventoryId)] || 0;
                              const warning = getStockWarning(filament.inventoryId, totalUsed, invItem.weightGrams, 'g');
                              if (!warning) return null;
                              return (
                                <p className="mt-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 leading-snug flex items-center gap-1">
                                  ⚠️ {warning}
                                </p>
                              );
                            })()}
                          </div>

                          {/* Cost Rate (auto-filled from inventory, still editable) */}
                          <div>
                            <label className="block text-[10px] font-semibold uppercase tracking-widest text-zinc-500 mb-1">Cost Rate</label>
                            <div className="relative">
                              <input
                                type="number" min="0" value={filament.costPerKg}
                                onChange={(e) => dispatch({ type: 'UPDATE_PLATE_FILAMENT', plateId: plate.id, filamentId: filament.id, field: 'costPerKg', value: e.target.value === '' ? '' : Number(e.target.value) })}
                                className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-md focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 transition-colors text-sm text-zinc-900 text-left pr-12 font-medium"
                              />
                              <span className="absolute inset-y-0 right-3 flex items-center text-zinc-400 text-xs pointer-events-none">PHP/kg</span>
                            </div>
                          </div>

                          {/* Remove */}
                          <div className="flex h-[38px] items-center">
                            {plate.filaments.length > 1 && (
                              <button
                                onClick={() => dispatch({ type: 'REMOVE_PLATE_FILAMENT', plateId: plate.id, filamentId: filament.id })}
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
              )
            })}
          </div>
        </section>

        {/* Section: Supplementary Items */}
        <section className="bg-white border border-zinc-200 shadow-sm rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-200 flex items-center justify-between bg-zinc-50">
            <h2 className="text-sm font-semibold text-zinc-900 uppercase tracking-widest">3. Supplementary Items</h2>
            <button
              onClick={() => dispatch({ type: 'ADD_MATERIAL' })}
              className="text-xs font-medium text-zinc-700 bg-white border border-zinc-200 hover:bg-zinc-50 px-2 py-1 rounded transition-colors flex items-center gap-1 shadow-sm"
            >
              <Plus className="w-3 h-3" /> Add Item
            </button>
          </div>
          <div className="p-5">
            {state.materials.length === 0 ? (
              <div className="py-4 text-xs text-zinc-400 text-center border border-dashed border-zinc-200 rounded bg-zinc-50">
                No supplementary items.
              </div>
            ) : (
              <div className="space-y-3">
                {state.materials.map(mat => (
                  <div key={mat.id} className="grid grid-cols-1 md:grid-cols-[1.7fr_0.8fr_1fr_auto] gap-4 md:gap-3 items-end bg-zinc-50 p-4 md:p-3 rounded border border-zinc-100">
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">Inventory Item</label>
                      {inventoryMaterials.length > 0 ? (
                        <select
                          value={mat.inventoryId ?? ''}
                          onChange={(e) => {
                            const inv = inventoryMaterials.find(material => String(material.id) === e.target.value);
                            if (inv) {
                              const quantity = Math.max(1, parseFloat(mat.quantity) || 1);
                              const unitPrice = Number(inv.costPerUnit ?? (((Number(inv.bulkPrice) || 0) / Math.max(1, Number(inv.quantity) || 1)) || 0));
                              dispatch({ type: 'UPDATE_MATERIAL', id: mat.id, field: 'inventoryId', value: inv.id });
                              dispatch({ type: 'UPDATE_MATERIAL', id: mat.id, field: 'name', value: inv.name });
                              dispatch({ type: 'UPDATE_MATERIAL', id: mat.id, field: 'unit', value: inv.unit || '' });
                              dispatch({ type: 'UPDATE_MATERIAL', id: mat.id, field: 'costPerUnit', value: unitPrice });
                              if ((parseFloat(mat.quantity) || 0) <= 0) {
                                dispatch({ type: 'UPDATE_MATERIAL', id: mat.id, field: 'quantity', value: quantity });
                              }
                            } else {
                              dispatch({ type: 'UPDATE_MATERIAL', id: mat.id, field: 'inventoryId', value: '' });
                            }
                          }}
                          className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-md focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 transition-colors text-sm text-zinc-900"
                        >
                          <option value="">-- select material/hardware --</option>
                          {inventoryMaterials.map(inv => (
                            <option key={inv.id} value={String(inv.id)}>
                              {inv.name}{inv.category ? ` - ${inv.category}` : ''}{inv.unit ? ` (${inv.unit})` : ''}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <div className="px-3 py-2 bg-zinc-50 border border-dashed border-zinc-200 rounded-md text-xs text-zinc-400 italic">
                          No inventory materials - add them in the Inventory tab
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">Qty</label>
                      <div className="relative">
                        <input
                          type="number" placeholder="0" min="0" step="1"
                          value={mat.quantity}
                          onChange={(e) => dispatch({ type: 'UPDATE_MATERIAL', id: mat.id, field: 'quantity', value: e.target.value === '' ? '' : Number(e.target.value) })}
                          className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-md focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 transition-colors text-sm text-zinc-900 text-left pr-10 font-medium"
                        />
                        <span className="absolute inset-y-0 right-3 flex items-center text-zinc-400 text-xs pointer-events-none">{mat.unit || 'pcs'}</span>
                      </div>
                      {(() => {
                        if (!mat.inventoryId) return null;
                        const invItem = inventoryMaterials.find(m => String(m.id) === String(mat.inventoryId));
                        if (!invItem) return null;
                        const totalUsed = buildMaterialUsageMap(state.materials)[String(mat.inventoryId)] || 0;
                        const warning = getStockWarning(mat.inventoryId, totalUsed, invItem.quantity, mat.unit || 'pcs');
                        if (!warning) return null;
                        return (
                          <p className="mt-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 leading-snug flex items-center gap-1">
                            ⚠️ {warning}
                          </p>
                        );
                      })()}
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">Cost / Unit</label>
                      <div className="relative">
                        <input
                          type="number" placeholder="0.00" min="0" step="0.01"
                          value={mat.costPerUnit}
                          onChange={(e) => dispatch({ type: 'UPDATE_MATERIAL', id: mat.id, field: 'costPerUnit', value: e.target.value === '' ? '' : Number(e.target.value) })}
                          className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-md focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 transition-colors text-sm text-zinc-900 text-left pr-12 font-medium"
                        />
                        <span className="absolute inset-y-0 right-3 flex items-center text-zinc-400 text-xs pointer-events-none">PHP</span>
                      </div>
                    </div>
                    <button
                      onClick={() => dispatch({ type: 'REMOVE_MATERIAL', id: mat.id })}
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
        <section className="bg-white border border-zinc-200 shadow-sm rounded-lg overflow-hidden mb-6">
          <div className="px-5 py-4 border-b border-zinc-200 flex items-center justify-between bg-zinc-50">
            <h2 className="text-sm font-semibold text-zinc-900 uppercase tracking-widest">4. Processing & Labor</h2>
            <button
              onClick={() => dispatch({ type: 'ADD_LABOR', defaultRate: config?.hourlyLaborRate || 250 })}
              className="text-xs font-medium text-zinc-700 bg-white border border-zinc-200 hover:bg-zinc-50 px-2 py-1 rounded transition-colors flex items-center gap-1 shadow-sm"
            >
              <Plus className="w-3 h-3" /> Add Labor
            </button>
          </div>
          <div className="p-5">
            {state.labors.length === 0 ? (
              <div className="py-4 text-xs text-zinc-400 text-center border border-dashed border-zinc-200 rounded bg-zinc-50">
                No labor items tracked.
              </div>
            ) : (
              <div className="space-y-4">
                {state.labors.map((lab) => (
                  <div key={lab.id} className="grid grid-cols-1 md:grid-cols-[1.5fr_1.2fr_0.8fr_0.8fr_auto] gap-4 md:gap-3 items-end bg-zinc-50 p-4 md:p-3 rounded border border-zinc-100">
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">Operation Phase</label>
                      <select
                        value={lab.type}
                        onChange={(e) => dispatch({ type: 'UPDATE_LABOR', id: lab.id, field: 'type', value: e.target.value })}
                        className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-md focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 transition-colors text-sm text-zinc-900"
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
                        onChange={(e) => dispatch({ type: 'UPDATE_LABOR', id: lab.id, field: 'worker', value: e.target.value })}
                        className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-md focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 transition-colors text-sm text-zinc-900 font-medium"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">Duration</label>
                      <div className="relative">
                        <input
                          type="number" min="0" step="0.5" value={lab.hours}
                          onChange={(e) => dispatch({ type: 'UPDATE_LABOR', id: lab.id, field: 'hours', value: e.target.value === '' ? '' : Number(e.target.value) })}
                          className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-md focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 transition-colors text-sm text-zinc-900 text-left pr-10 font-medium"
                        />
                        <span className="absolute inset-y-0 right-3 flex items-center text-zinc-400 text-xs pointer-events-none">hrs</span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">Rate</label>
                      <div className="relative">
                        <input
                          type="number" min="0" value={lab.rate}
                          onChange={(e) => dispatch({ type: 'UPDATE_LABOR', id: lab.id, field: 'rate', value: e.target.value === '' ? '' : Number(e.target.value) })}
                          className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-md focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 transition-colors text-sm text-zinc-900 text-left pr-10 font-medium"
                        />
                        <span className="absolute inset-y-0 right-3 flex items-center text-zinc-400 text-xs pointer-events-none">/hr</span>
                      </div>
                    </div>
                    <div>
                      <button
                        onClick={() => dispatch({ type: 'REMOVE_LABOR', id: lab.id })}
                        className="p-2.5 text-zinc-400 hover:text-zinc-900 hover:bg-zinc-200 rounded transition-colors"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Section: Packaging & Shipping */}
        <section className="bg-white border border-zinc-200 shadow-sm rounded-lg overflow-hidden mb-8">
          <div className="px-5 py-4 border-b border-zinc-200">
            <h2 className="text-sm font-semibold text-zinc-900 uppercase tracking-widest">5. Packaging & Shipping</h2>
          </div>
          <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-5">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">Packaging</label>
              <div className="relative">
                <input
                  type="number" name="packagingCost" min="0" value={state.packagingCost} onChange={handleNum}
                  className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-md focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 transition-colors text-sm text-zinc-900 text-left pr-12 font-medium"
                />
                <span className="absolute inset-y-0 right-3 flex items-center text-zinc-400 text-xs pointer-events-none">PHP</span>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">Shipping Cost</label>
              <div className="relative">
                <input
                  type="number" name="shippingCost" min="0" value={state.shippingCost} onChange={handleNum}
                  className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-md focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 transition-colors text-sm text-zinc-900 text-left pr-12 font-medium"
                />
                <span className="absolute inset-y-0 right-3 flex items-center text-zinc-400 text-xs pointer-events-none">PHP</span>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">Miscellaneous</label>
              <div className="relative">
                <input
                  type="number" name="miscellaneousCost" min="0" value={state.miscellaneousCost} onChange={handleNum}
                  className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-md focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 transition-colors text-sm text-zinc-900 text-left pr-12 font-medium"
                />
                <span className="absolute inset-y-0 right-3 flex items-center text-zinc-400 text-xs pointer-events-none">PHP</span>
              </div>
            </div>
          </div>
        </section>

      </div>

      {/* RIGHT COLUMN: Output Sticky Block */}
      <div className="w-full lg:w-[360px] lg:sticky top-6 space-y-6">

        <div className="bg-white border border-zinc-300 shadow-xl shadow-zinc-100 rounded-lg overflow-hidden flex flex-col">

          <div className="p-5 border-b border-zinc-200 bg-zinc-50 flex items-center gap-2">
            <Calculator className="w-4 h-4 text-zinc-500" />
            <h2 className="text-sm font-bold tracking-tight text-zinc-900 uppercase">Cost Breakdown</h2>
          </div>

          <div className="p-6">
            <div className="space-y-3 font-medium text-sm text-zinc-600 border-b border-zinc-100 pb-5">
              <div className="flex justify-between items-center group">
                <span>Materials</span>
                <span className="text-zinc-900 group-hover:text-black">
                  ₱{filCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between items-center group">
                <span>Utilities</span>
                <span className="text-zinc-900 group-hover:text-black">
                  ₱{elecCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              {matCost > 0 && (
                <div className="flex justify-between items-center group">
                  <span>Supplementary</span>
                  <span className="text-zinc-900 group-hover:text-black">
                    ₱{matCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              )}
              {laborCost > 0 && (
                <div className="flex justify-between items-center group">
                  <span>Labor</span>
                  <span className="text-zinc-900 group-hover:text-black">
                    ₱{laborCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              )}
            </div>

            <div className="pt-4 flex flex-col items-end">
              <span className="text-xs font-bold uppercase tracking-widest text-zinc-400 mb-1">TOTAL COST</span>
              <div className="flex items-baseline gap-1">
                <span className="text-lg font-semibold text-zinc-400">₱</span>
                <span className="text-4xl font-extrabold text-zinc-900 tracking-tight">
                  {displayTotalCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
              <span className="font-semibold text-xs uppercase tracking-wider text-zinc-500">Selling Price ₱</span>
              <div className="relative flex items-baseline cursor-text" onClick={(e) => { const input = e.currentTarget.querySelector('input'); if (input) input.focus(); }}>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={customFinalPrice}
                  placeholder={finalPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  onChange={(e) => setCustomFinalPrice(e.target.value)}
                  className="w-36 text-right bg-transparent border-none outline-none text-2xl font-black text-zinc-900 tracking-tight placeholder:text-zinc-900 focus:bg-zinc-50 focus:border focus:border-zinc-300 focus:rounded-md focus:px-2 focus:py-0.5 transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>
            </div>
            {customFinalPrice !== '' && (
              <div className="text-right">
                <button
                  onClick={() => setCustomFinalPrice('')}
                  className="text-[10px] text-zinc-400 hover:text-zinc-600 underline font-semibold transition-colors"
                >
                  Reset to Suggested (₱{finalPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                </button>
              </div>
            )}

            <div className="flex justify-between items-center font-medium text-sm text-zinc-600 border-t border-zinc-100 pt-3">
              <span>Total Cost</span>
              <span className="text-zinc-900 font-semibold">
                ₱{displayTotalCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>

            {(() => {
              const priceVal = customFinalPrice !== '' ? Number(customFinalPrice) : finalPrice;
              const grossProfitVal = priceVal - displayTotalCost;
              const machineWearVal = wearTearCost;
              const wasteReserveVal = failureBufferCost;
              const netProfitVal = grossProfitVal - machineWearVal - wasteReserveVal;

              return (
                <div className="space-y-3 pt-3 border-t border-zinc-100 font-medium text-sm text-zinc-600">
                  <div className="flex justify-between items-center font-bold text-zinc-900">
                    <span>Gross Profit</span>
                    <span>₱{grossProfitVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>

                  <div className="flex justify-between items-center text-xs pl-2 text-zinc-500">
                    <span>Machine Wear</span>
                    <span>₱{machineWearVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>

                  <div className="flex justify-between items-center text-xs pl-2 text-zinc-500">
                    <span>Waste Reserve</span>
                    <span>₱{wasteReserveVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>

                  <div className="flex justify-between items-center font-bold border-t border-dashed border-zinc-200 pt-3 text-zinc-900">
                    <span>Net Profit</span>
                    <span className={netProfitVal >= 0 ? 'text-zinc-900' : 'text-red-600'}>
                      ₱{netProfitVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              );
            })()}
          </div>

          <div className="flex bg-zinc-50 p-4 border-t border-zinc-200 gap-2">
            <button
              onClick={() => setShowModal(true)}
              className="flex-1 bg-zinc-900 hover:bg-black text-white text-sm font-semibold py-2.5 px-4 rounded transition-colors text-center shadow-sm"
            >
              Commit Pricing
            </button>
            <button
              onClick={() => {
                dispatch({ type: 'LOAD_TEMPLATE', template: init(config) });
                setCustomFinalPrice('');
              }}
              className="w-10 bg-white border border-zinc-300 hover:bg-zinc-50 text-zinc-600 flex items-center justify-center rounded transition-colors shadow-sm"
              title="Reset Calculator"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

      </div>

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
                      className="w-4 h-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
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
                      className="w-4 h-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
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
                      className="w-4 h-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
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
                  value={customFinalPrice}
                  onChange={(e) => setCustomFinalPrice(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-md focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 transition-colors text-sm text-zinc-900 font-medium"
                />
                <span className="absolute inset-y-0 right-3 flex items-center text-zinc-400 text-xs font-semibold pointer-events-none">PHP</span>
              </div>
            </div>

            <div className="p-4 border-t border-zinc-200 bg-zinc-50 flex items-center justify-between">
              <div className="flex items-baseline gap-1">
                <span className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">New Total:</span>
                <span className="text-lg font-bold text-zinc-900 tracking-tight ml-1">
                  PHP {customFinalPrice !== '' ? Number(customFinalPrice).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : finalPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <button
                disabled={confirmOrderMutation.isPending}
                onClick={async () => {
                  if (!state.clientName || !state.itemName) {
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

    </div>
  );
}
