import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { 
  Search, Image, Layers, Scale, Clock, Coins, 
  ExternalLink, Sparkles, Filter, Check, Tag, 
  TrendingUp, BarChart3, PackageOpen, HelpCircle, Loader2,
  Pencil, UploadCloud, X
} from 'lucide-react';

function ProductGalleryView({ config, onLoadTemplate }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');

  const loadGalleryItems = async () => {
    try {
      setLoading(true);
      // Query completed or successful orders that have related items
      const { data, error: queryError } = await supabase
        .from('orders')
        .select(`
          id,
          total_price,
          status,
          created_at,
          financial_breakdown,
          clients (
            name,
            contact
          ),
          items (
            id,
            name,
            filament_weight_g,
            print_time_hours,
            number_of_plates,
            labor_hours,
            image_url
          )
        `)
        .neq('status', 'Failed')
        .order('created_at', { ascending: false });

      if (queryError) throw queryError;

      // Compile item blueprints
      const compiledBlueprints = [];
      const seenNames = new Set();

      (data || []).forEach(order => {
        const item = order.items?.[0] || order.items; // handle array or single object
        if (!item || !item.name) return;

        // Gracefully extract financial details
        const breakdown = order.financial_breakdown || {};
        const editorState = breakdown.editorState || {};

        // Skip if explicitly excluded from gallery
        const addToGallery = breakdown.addToGallery !== false && editorState.addToGallery !== false;
        if (!addToGallery) return;

        const imageUrl = item.image_url || editorState.imageUrl || '';
        
        const directMaterialCost = Number(breakdown.filamentCost || 0);
        const directElecCost = Number(breakdown.electricityCost || 0);
        const directWearTear = Number(breakdown.wearTearCost || 0);
        const rawOpsCost = directMaterialCost + directElecCost + directWearTear;
        
        const laborCost = Number(breakdown.laborCost || 0);
        const supplementaryCost = Number(breakdown.supplementaryMatCost || 0);
        const logisticsCost = Number(breakdown.logisticsCost || 0);
        
        const totalProductionCost = rawOpsCost + laborCost + supplementaryCost + logisticsCost;
        const sellPrice = Number(order.total_price || 0);
        const profit = sellPrice - totalProductionCost;
        const marginPercent = totalProductionCost > 0 ? (profit / totalProductionCost) * 100 : 0;

        // Calculate Standard Retail Price & Family Price
        const isFixedMode = breakdown.pricingMode === 'fixed' || editorState.pricingMode === 'fixed';
        const failureRatePercent = Number(breakdown.failureRatePercent || config?.failureRatePercent || 10);
        const failureBufferCost = Number(breakdown.failureBufferCost !== undefined ? breakdown.failureBufferCost : (rawOpsCost * (failureRatePercent / 100)));
        const servicesCost = Number(breakdown.servicesCost || 0);
        const basePriceWithFailure = rawOpsCost + failureBufferCost + laborCost + supplementaryCost + logisticsCost + servicesCost;
        
        let standardPrice = 0;
        let familyPrice = 0;
        if (isFixedMode) {
          standardPrice = Number(breakdown.fixedStandardPrice !== undefined ? breakdown.fixedStandardPrice : (editorState.fixedStandardPrice || 0));
          familyPrice = Number(breakdown.fixedFamilyPrice !== undefined ? breakdown.fixedFamilyPrice : (editorState.fixedFamilyPrice || 0));
        } else {
          const markupPercent = Number(config?.markupPercent !== undefined ? config.markupPercent : 30);
          standardPrice = Math.round((basePriceWithFailure + (basePriceWithFailure * (markupPercent / 100))) * 100) / 100;
          
          const familyMarkupPercent = Number(config?.familyMarkupPercent !== undefined ? config.familyMarkupPercent : 15);
          familyPrice = Math.round((basePriceWithFailure + (basePriceWithFailure * (familyMarkupPercent / 100))) * 100) / 100;
        }

        // Determine HSL category color accent based on item name or type
        let accentHue = 210; // Blue default
        const nameLower = item.name.toLowerCase();
        if (nameLower.includes('gear') || nameLower.includes('mech') || nameLower.includes('tool')) {
          accentHue = 24; // Orange/Rust for technical/hardware
        } else if (nameLower.includes('toy') || nameLower.includes('figure') || nameLower.includes('flexi')) {
          accentHue = 280; // Purple for toys/creations
        } else if (nameLower.includes('box') || nameLower.includes('case') || nameLower.includes('stand')) {
          accentHue = 145; // Emerald for organizational
        } else if (nameLower.includes('art') || nameLower.includes('vase') || nameLower.includes('decor') || nameLower.includes('glow')) {
          accentHue = 330; // Pink/Magenta for aesthetics
        }

        const blueprint = {
          id: item.id || order.id,
          name: item.name,
          imageUrl,
          category: editorState.plates?.[0]?.filaments?.[0]?.color || 'Aesthetic',
          tags: nameLower.includes('toy') ? 'Toy' : nameLower.includes('gear') ? 'Hardware' : nameLower.includes('box') ? 'Case' : 'Utility',
          weightGrams: Number(item.filament_weight_g || 0),
          printTimeHours: Number(item.print_time_hours || 0),
          numberOfPlates: Number(item.number_of_plates || 1),
          laborHours: Number(item.labor_hours || 0),
          productionCost: totalProductionCost,
          sellPrice,
          standardPrice,
          familyPrice,
          orderId: order.id,
          itemId: item.id,
          profit,
          marginPercent,
          accentHue,
          editorState,
          clientName: order.clients?.name || 'Standard Client',
          date: order.created_at,
        };

        compiledBlueprints.push(blueprint);
      });

      // Group duplicates by name to showcase unique products, keeping track of print occurrences
      const uniqueProductsMap = {};
      compiledBlueprints.forEach(bp => {
        if (!uniqueProductsMap[bp.name]) {
          uniqueProductsMap[bp.name] = {
            ...bp,
            totalOrders: 0,
            history: [],
            orderIds: [],
            itemIds: []
          };
        }
        uniqueProductsMap[bp.name].totalOrders += 1;
        uniqueProductsMap[bp.name].history.push({
          date: bp.date,
          sellPrice: bp.sellPrice,
          clientName: bp.clientName
        });

        if (bp.orderId && !uniqueProductsMap[bp.name].orderIds.includes(bp.orderId)) {
          uniqueProductsMap[bp.name].orderIds.push(bp.orderId);
        }
        if (bp.itemId && !uniqueProductsMap[bp.name].itemIds.includes(bp.itemId)) {
          uniqueProductsMap[bp.name].itemIds.push(bp.itemId);
        }

        // Pick the card with an image if available
        if (!uniqueProductsMap[bp.name].imageUrl && bp.imageUrl) {
          uniqueProductsMap[bp.name].imageUrl = bp.imageUrl;
        }
      });

      setItems(Object.values(uniqueProductsMap));
    } catch (err) {
      console.error('Failed to load gallery items:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGalleryItems();
  }, [config]);

  const [editingProduct, setEditingProduct] = useState(null);
  const [editForm, setEditForm] = useState({
    name: '',
    imageUrl: '',
    standardPrice: '',
    familyPrice: '',
    addToGallery: true
  });
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  const handleEditClick = (product) => {
    setEditingProduct(product);
    setEditForm({
      name: product.name || '',
      imageUrl: product.imageUrl || '',
      standardPrice: product.standardPrice || '',
      familyPrice: product.familyPrice || '',
      addToGallery: product.editorState?.addToGallery !== false
    });
  };

  const handleImageFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingImage(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new window.Image();
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

        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.6);
        setEditForm(current => ({ ...current, imageUrl: compressedBase64 }));
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

  const handleSaveProductDetails = async (e) => {
    e.preventDefault();
    if (!editingProduct) return;

    try {
      setSaving(true);
      const newName = editForm.name.trim();
      const newImageUrl = editForm.imageUrl.trim() || null;
      const newStandardPrice = Number(editForm.standardPrice) || 0;
      const newFamilyPrice = Number(editForm.familyPrice) || 0;
      const newAddToGallery = editForm.addToGallery !== false;

      if (!newName) {
        alert('Product name is required.');
        setSaving(false);
        return;
      }

      // 1. Batch update on the items table
      if (editingProduct.itemIds && editingProduct.itemIds.length > 0) {
        const { error: itemsError } = await supabase
          .from('items')
          .update({ 
            name: newName,
            image_url: newImageUrl 
          })
          .in('id', editingProduct.itemIds);
        if (itemsError) throw itemsError;
      }

      // 2. Fetch and update matching orders
      if (editingProduct.orderIds && editingProduct.orderIds.length > 0) {
        const { data: ordersToUpdate, error: fetchOrdersError } = await supabase
          .from('orders')
          .select('id, total_price, financial_breakdown')
          .in('id', editingProduct.orderIds);
        
        if (fetchOrdersError) throw fetchOrdersError;

        // Compile updates and execute
        const updatePromises = (ordersToUpdate || []).map(async (order) => {
          const breakdown = order.financial_breakdown || {};
          const editorState = breakdown.editorState || {};
          
          const newBreakdown = {
            ...breakdown,
            pricingMode: 'fixed',
            fixedStandardPrice: newStandardPrice,
            fixedFamilyPrice: newFamilyPrice,
            addToGallery: newAddToGallery,
            editorState: {
              ...editorState,
              itemName: newName,
              pricingMode: 'fixed',
              fixedStandardPrice: newStandardPrice,
              fixedFamilyPrice: newFamilyPrice,
              imageUrl: newImageUrl || '',
              addToGallery: newAddToGallery,
            }
          };

          const isFamily = editorState.isFamilyPricing === true || editorState.isFamilyPricing === 'family';
          const isFree = editorState.isFamilyPricing === 'free';
          const quantity = Number(editorState.fixedQuantity || breakdown.fixedQuantity || 1);
          
          let newTotalPrice = order.total_price;
          if (isFree) {
            newTotalPrice = 0;
          } else if (isFamily) {
            newTotalPrice = newFamilyPrice * quantity;
          } else {
            newTotalPrice = newStandardPrice * quantity;
          }

          return supabase
            .from('orders')
            .update({
              total_price: Math.round(newTotalPrice * 100) / 100,
              financial_breakdown: newBreakdown
            })
            .eq('id', order.id);
        });

        const updateResults = await Promise.all(updatePromises);
        const firstError = updateResults.find(r => r.error);
        if (firstError) throw firstError.error;
      }

      await loadGalleryItems();
      setEditingProduct(null);
    } catch (err) {
      console.error('Failed to update product details:', err);
      alert('Failed to save product edits: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // Filter items based on category and search query
  const filteredItems = items.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          item.tags.toLowerCase().includes(searchQuery.toLowerCase());
    
    if (selectedCategory === 'All') return matchesSearch;
    return matchesSearch && item.tags === selectedCategory;
  });

  // Calculate high level metrics
  const totalUnique = items.length;
  const avgProfitMargin = items.length > 0
    ? items.reduce((sum, item) => sum + (item.marginPercent || 0), 0) / items.length
    : 0;
  const totalPrintedQty = items.reduce((sum, item) => sum + (item.totalOrders || 0), 0);

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center text-red-700 font-semibold max-w-xl mx-auto my-12">
        Failed to fetch gallery details: {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Upper Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-5">
        <div className="bg-white border border-zinc-200 shadow-sm rounded-xl p-5 flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-zinc-100 flex items-center justify-center text-zinc-600 shrink-0">
            <PackageOpen className="w-5 h-5" />
          </div>
          <div>
            <span className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest leading-none mb-1">Catalog Products</span>
            <span className="text-2xl font-black text-zinc-900 leading-none">{totalUnique} unique</span>
          </div>
        </div>
        
        <div className="bg-white border border-zinc-200 shadow-sm rounded-xl p-5 flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <span className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest leading-none mb-1">Avg Profit Margin</span>
            <span className="text-2xl font-black text-emerald-600 leading-none">{avgProfitMargin.toFixed(1)}%</span>
          </div>
        </div>

        <div className="bg-white border border-zinc-200 shadow-sm rounded-xl p-5 flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-zinc-100 flex items-center justify-center text-zinc-600 shrink-0">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <span className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest leading-none mb-1">Total Logs Count</span>
            <span className="text-2xl font-black text-zinc-900 leading-none">{totalPrintedQty} successful</span>
          </div>
        </div>
      </div>

      {/* Filter and search panel */}
      <div className="bg-white border border-zinc-200 shadow-sm rounded-xl p-4 md:p-5 flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative w-full md:w-80 shrink-0">
          <input
            type="text"
            placeholder="Search catalog blueprints..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-zinc-50 border border-zinc-200 rounded-lg pl-9 pr-4 py-2 text-sm focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900 transition-colors"
          />
          <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-3" />
        </div>

        <div className="flex gap-1.5 overflow-x-auto w-full md:w-auto pb-1 md:pb-0 scrollbar-hide whitespace-nowrap">
          {['All', 'Utility', 'Case', 'Hardware', 'Toy'].map(category => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
                selectedCategory === category
                  ? 'bg-zinc-900 border-zinc-900 text-white shadow-sm'
                  : 'bg-white border-zinc-200 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50'
              }`}
            >
              {category}
            </button>
          ))}
        </div>
      </div>

      {/* Grid of Catalog items */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 py-8">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-sm h-[320px] flex flex-col justify-between p-5 space-y-4 pulse-light">
              <div className="h-44 bg-zinc-100 rounded-lg" />
              <div className="h-4 bg-zinc-200 rounded w-2/3" />
              <div className="h-3 bg-zinc-100 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="bg-white border border-zinc-200 shadow-sm rounded-xl py-16 text-center text-zinc-400 flex flex-col items-center">
          <PackageOpen className="w-10 h-10 mb-3 opacity-30" />
          <p className="font-semibold text-zinc-500">No matching print blueprints found.</p>
          <p className="text-xs text-zinc-400 mt-1">Attach image URLs in your Order details to build your visual gallery!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredItems.map(item => {
            const hasCustomAccent = item.accentHue !== 210;
            const cardAccentStyle = {
              '--card-accent': `hsl(${item.accentHue}, 80%, 45%)`,
              '--card-accent-light': `hsl(${item.accentHue}, 80%, 96%)`,
              '--card-accent-border': `hsl(${item.accentHue}, 40%, 90%)`,
            };

            return (
              <div 
                key={item.id} 
                style={cardAccentStyle}
                className="group bg-white border border-zinc-200 hover:border-[var(--card-accent)] rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-300 flex flex-col h-[360px]"
              >
                {/* Visual Header Photo or Wireframe */}
                <div className="h-40 bg-zinc-50 relative overflow-hidden flex items-center justify-center border-b border-zinc-100 shrink-0">
                  {item.imageUrl ? (
                    <img 
                      src={item.imageUrl} 
                      alt={item.name} 
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
                      onError={(e) => {
                        e.target.style.display = 'none';
                        e.target.nextSibling.style.display = 'flex';
                      }}
                    />
                  ) : null}
                  
                  <div 
                    style={item.imageUrl ? { display: 'none' } : { display: 'flex' }}
                    className="absolute inset-0 bg-gradient-to-tr from-zinc-50 to-zinc-100/50 flex flex-col items-center justify-center gap-1.5 p-4"
                  >
                    <div className="w-12 h-12 rounded-full flex items-center justify-center text-zinc-300 bg-white border border-zinc-200/60 shadow-sm shadow-zinc-100 transition-transform group-hover:scale-110">
                      <Image className="w-5 h-5 text-zinc-400" />
                    </div>
                    <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">Blueprint Blueprint</span>
                  </div>

                  <span className="absolute top-3 left-3 bg-zinc-900/80 backdrop-blur-md text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider shadow-sm">
                    {item.tags}
                  </span>
                  
                  <span className="absolute top-3 right-3 bg-white/95 backdrop-blur-sm text-zinc-800 text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm">
                    {item.totalOrders} print{item.totalOrders !== 1 ? 's' : ''}
                  </span>
                </div>

                {/* Body details */}
                <div className="p-4 md:p-5 flex-1 flex flex-col justify-between bg-white">
                  <div>
                    <h3 className="font-extrabold text-zinc-900 text-base line-clamp-1 group-hover:text-[var(--card-accent)] transition-colors">{item.name}</h3>
                    
                    <div className="grid grid-cols-3 gap-2 mt-3 text-zinc-500 font-bold text-[10px] uppercase tracking-wider">
                      <div className="flex flex-col">
                        <span className="text-zinc-400 font-medium text-[8px]">Plates</span>
                        <span className="flex items-center gap-1 text-zinc-700 mt-0.5"><Layers className="w-3.5 h-3.5 text-zinc-400" /> {item.numberOfPlates}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-zinc-400 font-medium text-[8px]">Hours</span>
                        <span className="flex items-center gap-1 text-zinc-700 mt-0.5"><Clock className="w-3.5 h-3.5 text-zinc-400" /> {item.printTimeHours.toFixed(1)}h</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-zinc-400 font-medium text-[8px]">Weight</span>
                        <span className="flex items-center gap-1 text-zinc-700 mt-0.5"><Scale className="w-3.5 h-3.5 text-zinc-400" /> {item.weightGrams.toLocaleString()}g</span>
                      </div>
                    </div>
                  </div>

                  {/* Profit Margins & Load Action */}
                  <div className="pt-3 border-t border-zinc-100 flex items-center justify-between mt-auto gap-1">
                    <div className="flex flex-col">
                      <span className="text-[8px] text-zinc-400 uppercase font-black tracking-widest">Base Cost</span>
                      <span className="text-xs text-zinc-400 font-bold leading-none mt-1">PHP {item.productionCost.toFixed(2)}</span>
                    </div>
                    
                    <div className="flex flex-col text-right">
                      <div className="text-[8px] text-zinc-400 uppercase font-black tracking-widest">Std Price</div>
                      <div className="text-xs font-black text-zinc-950 leading-none mt-0.5">PHP {item.standardPrice.toFixed(2)}</div>
                      <div className="text-[8px] text-zinc-400 uppercase font-black tracking-widest mt-1">Family Price</div>
                      <div className="text-[10px] font-bold text-zinc-600 leading-none mt-0.5">PHP {item.familyPrice.toFixed(2)}</div>
                    </div>

                    <div className="flex flex-col gap-1.5 shrink-0">
                      <button
                        onClick={() => handleEditClick(item)}
                        title="Edit product details, image and pricing presets"
                        className="p-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-lg transition-all hover:scale-105 border border-zinc-200 shadow-sm"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => onLoadTemplate(item.editorState)}
                        title="Load this recipe blueprint straight back into the Pricing Calculator!"
                        className="p-1.5 bg-zinc-950 hover:bg-zinc-800 text-white rounded-lg transition-all hover:scale-105 shadow-sm shadow-zinc-200"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Product Edit Modal */}
      {editingProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-zinc-950/45 backdrop-blur-md transition-opacity duration-300"
            onClick={() => { if (!saving) setEditingProduct(null); }}
          />
          
          {/* Dialog Body */}
          <div className="relative w-full max-w-md bg-white/95 backdrop-blur-xl border border-zinc-200/80 shadow-2xl rounded-2xl overflow-hidden transition-all duration-300 transform scale-100 flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="px-5 py-4 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/50">
              <div>
                <h3 className="font-extrabold text-zinc-950 text-base">Edit Gallery Product</h3>
                <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider mt-0.5 line-clamp-1">{editingProduct.name}</p>
              </div>
              <button 
                type="button"
                onClick={() => setEditingProduct(null)}
                disabled={saving}
                className="w-8 h-8 rounded-full bg-white hover:bg-zinc-100 border border-zinc-200 flex items-center justify-center text-zinc-400 hover:text-zinc-600 transition-colors shadow-sm disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable Content */}
            <form onSubmit={handleSaveProductDetails} className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Product Name Section */}
              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Product Name</label>
                <input
                  type="text"
                  required
                  value={editForm.name}
                  onChange={e => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                  disabled={saving}
                  placeholder="Enter product name"
                  className="w-full bg-zinc-50 border border-zinc-200 focus:border-zinc-950 rounded-lg px-3 py-2.5 text-xs focus:bg-white focus:outline-none transition-colors font-semibold text-zinc-900"
                />
              </div>

              {/* Image Input Section */}
              <div className="space-y-2">
                <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Product Image</label>
                
                <div className="flex flex-col gap-2">
                  {/* Uploader & Paste URL */}
                  <div className="flex gap-2">
                    <input 
                      type="file"
                      accept="image/*"
                      id="gallery-image-uploader"
                      className="hidden"
                      onChange={handleImageFileChange}
                      disabled={saving || uploadingImage}
                    />
                    <button
                      type="button"
                      onClick={() => document.getElementById('gallery-image-uploader').click()}
                      disabled={saving || uploadingImage}
                      className="flex-1 px-3 py-2 bg-zinc-50 border border-zinc-200 hover:border-zinc-300 rounded-lg text-xs font-semibold text-zinc-700 hover:text-zinc-950 transition-all flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-60"
                    >
                      <UploadCloud className="w-4 h-4 text-zinc-500" />
                      {uploadingImage ? 'Compressing...' : 'Upload Local Spool Photo'}
                    </button>
                  </div>
                  
                  <div className="relative">
                    <input 
                      type="text"
                      value={editForm.imageUrl}
                      onChange={e => setEditForm(prev => ({ ...prev, imageUrl: e.target.value }))}
                      disabled={saving}
                      placeholder="https://example.com/image.jpg or base64..."
                      className="w-full bg-zinc-50 border border-zinc-200 focus:border-zinc-950 rounded-lg pl-3 pr-8 py-2 text-xs focus:bg-white focus:outline-none transition-colors"
                    />
                    {editForm.imageUrl && (
                      <button
                        type="button"
                        onClick={() => setEditForm(prev => ({ ...prev, imageUrl: '' }))}
                        className="absolute right-2 top-2 text-zinc-400 hover:text-zinc-600"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Preview Frame */}
                {editForm.imageUrl && (
                  <div className="h-32 bg-zinc-50 rounded-lg border border-zinc-100 overflow-hidden relative group">
                    <img 
                      src={editForm.imageUrl} 
                      alt="preview" 
                      className="w-full h-full object-cover"
                      onError={e => { e.target.style.display = 'none'; }}
                    />
                  </div>
                )}
              </div>

              {/* Standard Price Preset */}
              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Fixed Standard Price (PHP)</label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-zinc-400 font-bold text-xs">PHP</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={editForm.standardPrice === 0 ? '' : editForm.standardPrice}
                    onChange={e => setEditForm(prev => ({ ...prev, standardPrice: e.target.value === '' ? 0 : Number(e.target.value) }))}
                    disabled={saving}
                    placeholder="Enter fixed retail standard price"
                    className="w-full bg-zinc-50 border border-zinc-200 focus:border-zinc-950 rounded-lg pl-12 pr-4 py-2.5 text-sm font-extrabold focus:bg-white focus:outline-none transition-colors"
                  />
                </div>
              </div>

              {/* Family Price Preset */}
              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Fixed Family Price (PHP)</label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-zinc-400 font-bold text-xs">PHP</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={editForm.familyPrice === 0 ? '' : editForm.familyPrice}
                    onChange={e => setEditForm(prev => ({ ...prev, familyPrice: e.target.value === '' ? 0 : Number(e.target.value) }))}
                    disabled={saving}
                    placeholder="Enter fixed partner family price"
                    className="w-full bg-zinc-50 border border-zinc-200 focus:border-zinc-950 rounded-lg pl-12 pr-4 py-2.5 text-sm font-extrabold focus:bg-white focus:outline-none transition-colors"
                  />
                </div>
              </div>

              {/* Gallery Inclusion Switch */}
              <div className="pt-2 flex items-center gap-2">
                <input
                  type="checkbox"
                  id="modal-addToGallery"
                  checked={editForm.addToGallery !== false}
                  onChange={e => setEditForm(prev => ({ ...prev, addToGallery: e.target.checked }))}
                  disabled={saving}
                  className="w-4 h-4 rounded text-zinc-900 border-zinc-300 focus:ring-zinc-900 focus:ring-opacity-50 accent-zinc-900 cursor-pointer"
                />
                <label htmlFor="modal-addToGallery" className="text-xs font-bold text-zinc-700 cursor-pointer select-none">
                  Add this product to the Product Gallery
                </label>
              </div>

              {/* Notice */}
              <div className="bg-zinc-50 border border-zinc-155 rounded-xl p-3 text-[10px] text-zinc-500 font-medium leading-relaxed">
                📢 **Information on Cascading Updates**:
                Saving these predefined pricing and image presets will synchronize and apply them to all **{editingProduct.totalOrders}** matching order records of this catalog item!
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-zinc-100 flex gap-3">
                <button
                  type="button"
                  onClick={() => setEditingProduct(null)}
                  disabled={saving}
                  className="flex-1 py-2.5 bg-zinc-100 hover:bg-zinc-200 border border-zinc-200 text-zinc-700 font-semibold rounded-lg text-xs transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || uploadingImage}
                  className="flex-1 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white font-semibold rounded-lg text-xs transition-colors flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-50"
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Saving presets...
                    </>
                  ) : 'Save Presets'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default ProductGalleryView;
