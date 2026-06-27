import { useState, useEffect } from 'react';
import { 
  Search, Plus, Trash2, Pencil, Layers, Clock, 
  Coins, Wrench, X, Image, FileText, Check, AlertCircle 
} from 'lucide-react';
import { fetchProducts, upsertProduct, deleteProduct } from '../lib/products';

export default function ProductsView() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  
  // Form States
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formImageUrl, setFormImageUrl] = useState('');
  const [formVariants, setFormVariants] = useState([]);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    loadProductsList();
  }, []);

  const loadProductsList = async () => {
    setLoading(true);
    const data = await fetchProducts();
    setProducts(data);
    setLoading(false);
  };

  const handleOpenAddModal = () => {
    setSelectedProduct(null);
    setFormName('');
    setFormDescription('');
    setFormImageUrl('');
    setFormVariants([
      { id: '', name: 'Standard', fixedStandardPrice: 200, fixedFamilyPrice: 150, weightGrams: 50, printTimeHours: 2.0, platesCount: 1, laborHours: 0.5 }
    ]);
    setFormError('');
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (product) => {
    setSelectedProduct(product);
    setFormName(product.name);
    setFormDescription(product.description || '');
    setFormImageUrl(product.imageUrl || '');
    setFormVariants(product.variants.map(v => ({ ...v })));
    setFormError('');
    setIsModalOpen(true);
  };

  const handleAddVariantRow = () => {
    setFormVariants([
      ...formVariants,
      { id: '', name: '', fixedStandardPrice: 0, fixedFamilyPrice: 0, weightGrams: 0, printTimeHours: 0, platesCount: 1, laborHours: 0 }
    ]);
  };

  const handleRemoveVariantRow = (index) => {
    setFormVariants(formVariants.filter((_, i) => i !== index));
  };

  const handleUpdateVariantField = (index, field, value) => {
    const updated = [...formVariants];
    updated[index][field] = value;
    setFormVariants(updated);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setFormError('');

    if (!formName.trim()) {
      setFormError('Product Name is required.');
      return;
    }

    if (formVariants.length === 0) {
      setFormError('At least one product variant is required.');
      return;
    }

    for (let i = 0; i < formVariants.length; i++) {
      const v = formVariants[i];
      if (!v.name.trim()) {
        setFormError(`Variant #${i + 1} Name is required.`);
        return;
      }
      if (v.fixedStandardPrice < 0 || v.fixedFamilyPrice < 0) {
        setFormError(`Variant "${v.name}" prices cannot be negative.`);
        return;
      }
    }

    try {
      const productPayload = {
        id: selectedProduct ? selectedProduct.id : null,
        name: formName.trim(),
        description: formDescription.trim(),
        imageUrl: formImageUrl.trim()
      };

      const result = await upsertProduct(productPayload, formVariants);
      setProducts(result);
      setIsModalOpen(false);
    } catch (err) {
      console.error(err);
      setFormError('An error occurred while saving the product.');
    }
  };

  const handleDelete = async (productId) => {
    if (confirm('Are you sure you want to delete this product and all of its variants?')) {
      const result = await deleteProduct(productId);
      setProducts(result);
    }
  };

  const filteredProducts = products.filter(p => {
    const nameMatch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
    const descMatch = p.description.toLowerCase().includes(searchQuery.toLowerCase());
    const variantMatch = p.variants.some(v => v.name.toLowerCase().includes(searchQuery.toLowerCase()));
    return nameMatch || descMatch || variantMatch;
  });

  return (
    <div className="flex-1 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-zinc-900 mb-1">Product Catalog</h2>
          <p className="text-sm text-zinc-500 font-medium">Manage predefined 3D models, custom variants, and default pricing specifications.</p>
        </div>
        <button 
          onClick={handleOpenAddModal}
          className="bg-zinc-900 hover:bg-black text-white text-sm font-semibold py-2.5 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 shadow-sm"
        >
          <Plus className="w-4 h-4" /> Add Product
        </button>
      </div>

      {/* Search Bar */}
      <div className="relative max-w-md">
        <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-400">
          <Search className="w-4 h-4" />
        </span>
        <input 
          type="text" 
          placeholder="Search products or variants..." 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-9 pr-4 py-2 bg-white border border-zinc-200 rounded-lg text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 transition-colors shadow-sm"
        />
      </div>

      {/* Loading State */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-12 text-zinc-400">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-zinc-900 mb-4"></div>
          <span className="text-sm font-medium">Loading products...</span>
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="bg-white rounded-lg border border-zinc-200 shadow-sm p-12 text-center max-w-lg mx-auto">
          <Layers className="w-12 h-12 text-zinc-300 mx-auto mb-4" />
          <h3 className="text-base font-semibold text-zinc-900 mb-1">No products found</h3>
          <p className="text-sm text-zinc-500 mb-6">Create a product to define its name, variants, prices, and specifications.</p>
          <button 
            onClick={handleOpenAddModal}
            className="bg-zinc-900 hover:bg-black text-white text-xs font-semibold py-2 px-4 rounded transition-colors inline-flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" /> Get Started
          </button>
        </div>
      ) : (
        /* Product Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredProducts.map(product => (
            <div 
              key={product.id}
              className="bg-white rounded-lg border border-zinc-200 shadow-sm overflow-hidden flex flex-col justify-between hover:shadow-md transition-shadow group"
            >
              {/* Product Info */}
              <div>
                <div className="flex gap-4 p-5">
                  {/* Thumbnail */}
                  <div className="w-20 h-20 bg-zinc-50 border border-zinc-100 rounded-lg overflow-hidden shrink-0 flex items-center justify-center">
                    {product.imageUrl ? (
                      <img 
                        src={product.imageUrl} 
                        alt={product.name} 
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        onError={(e) => {
                          e.target.onerror = null; 
                          e.target.src = ''; // Clear image to display fallback
                        }}
                      />
                    ) : (
                      <Image className="w-8 h-8 text-zinc-300" />
                    )}
                  </div>
                  {/* Text Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-bold text-zinc-900 truncate text-base">{product.name}</h3>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <button 
                          onClick={() => handleOpenEditModal(product)}
                          className="p-1 hover:bg-zinc-100 rounded text-zinc-500 hover:text-zinc-900 transition-colors"
                          title="Edit Product"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button 
                          onClick={() => handleDelete(product.id)}
                          className="p-1 hover:bg-red-50 rounded text-zinc-500 hover:text-red-600 transition-colors"
                          title="Delete Product"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <p className="text-zinc-500 text-xs line-clamp-2 mt-1 leading-relaxed">{product.description || 'No description provided.'}</p>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-zinc-100 text-[10px] font-bold text-zinc-600 uppercase tracking-wider mt-2.5">
                      <Layers className="w-2.5 h-2.5" /> {product.variants.length} {product.variants.length === 1 ? 'Variant' : 'Variants'}
                    </span>
                  </div>
                </div>

                {/* Variants List Header */}
                <div className="border-t border-zinc-100 px-5 py-2.5 bg-zinc-50/50 flex justify-between text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                  <span>Variant & Prices (PHP)</span>
                  <span>Specs</span>
                </div>

                {/* Variants List */}
                <div className="border-t border-zinc-100 divide-y divide-zinc-100 max-h-48 overflow-y-auto">
                  {product.variants.map(variant => (
                    <div key={variant.id} className="px-5 py-3 flex items-center justify-between text-xs hover:bg-zinc-50/40 transition-colors">
                      <div className="min-w-0">
                        <div className="font-semibold text-zinc-800 truncate">{variant.name}</div>
                        <div className="flex gap-2.5 mt-0.5 text-zinc-500">
                          <span className="flex items-center gap-0.5 text-zinc-900 font-medium">
                            <Coins className="w-3 h-3 text-zinc-400 shrink-0" /> {variant.fixedStandardPrice}
                          </span>
                          <span className="text-zinc-300">|</span>
                          <span className="flex items-center gap-0.5 text-emerald-700 font-medium" title="Family Price">
                            F: {variant.fixedFamilyPrice}
                          </span>
                        </div>
                      </div>
                      <div className="text-right text-zinc-500 text-[11px] font-medium space-y-0.5 shrink-0 pl-4">
                        <div className="flex items-center justify-end gap-1.5">
                          <span className="font-semibold text-zinc-700">{variant.weightGrams}g</span>
                          <span className="text-zinc-300">•</span>
                          <span className="flex items-center gap-0.5">
                            <Clock className="w-2.5 h-2.5 text-zinc-400" /> {variant.printTimeHours}h
                          </span>
                        </div>
                        <div className="flex items-center justify-end gap-1 text-[10px] text-zinc-400">
                          <span>{variant.platesCount} {variant.platesCount === 1 ? 'plate' : 'plates'}</span>
                          <span>•</span>
                          <span>{variant.laborHours}h labor</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Card Footer */}
              <div className="px-5 py-3 border-t border-zinc-100 bg-zinc-50 flex items-center justify-between text-[11px] text-zinc-400 font-medium">
                <span>Database Synced</span>
                <span className="text-[10px] text-zinc-300 font-mono">ID: {String(product.id).substring(0, 8)}...</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Editor Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/45 backdrop-blur-xs flex items-center justify-center p-4 z-[999] animate-fade-in">
          <div className="bg-white rounded-xl border border-zinc-200 shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden animate-scale-up">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-zinc-200 flex items-center justify-between bg-zinc-50">
              <div>
                <h3 className="font-bold text-zinc-900 text-lg">
                  {selectedProduct ? 'Edit Product Details' : 'Add New Product'}
                </h3>
                <p className="text-xs text-zinc-500 mt-0.5">Define core specs and pricing tiers for this product family.</p>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="p-1 hover:bg-zinc-200 rounded-full text-zinc-400 hover:text-zinc-700 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body / Form */}
            <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-6 space-y-6">
              {formError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2.5 text-xs text-red-700 font-medium">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Product Info Section */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pb-6 border-b border-zinc-100">
                <div className="md:col-span-2 space-y-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">Product Name *</label>
                    <input 
                      type="text" 
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      placeholder="e.g. Articulated Dragon, Keyboard Case"
                      className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm text-zinc-900 placeholder-zinc-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 transition-colors"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">Description</label>
                    <textarea 
                      value={formDescription}
                      onChange={(e) => setFormDescription(e.target.value)}
                      placeholder="Enter a brief details or instructions regarding the model..."
                      rows="3"
                      className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm text-zinc-900 placeholder-zinc-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 transition-colors resize-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">Image URL</label>
                  <input 
                    type="url" 
                    value={formImageUrl}
                    onChange={(e) => setFormImageUrl(e.target.value)}
                    placeholder="https://images.unsplash.com/..."
                    className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm text-zinc-900 placeholder-zinc-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 transition-colors mb-3"
                  />
                  <div className="aspect-video bg-zinc-50 border border-zinc-200 border-dashed rounded-lg flex flex-col items-center justify-center text-zinc-400 text-xs overflow-hidden">
                    {formImageUrl ? (
                      <img 
                        src={formImageUrl} 
                        alt="Preview" 
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.target.onerror = null;
                          e.target.src = '';
                        }}
                      />
                    ) : (
                      <>
                        <Image className="w-8 h-8 text-zinc-300 mb-1" />
                        <span>Live Image Preview</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Variants Section */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-zinc-900 text-sm">Product Variants & Estimations</h4>
                    <p className="text-zinc-500 text-xs mt-0.5">Define variants (different sizes, setups) and specifications for calculation.</p>
                  </div>
                  <button 
                    type="button" 
                    onClick={handleAddVariantRow}
                    className="border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-800 text-xs font-semibold py-1.5 px-3 rounded-lg transition-colors flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Variant
                  </button>
                </div>

                {/* Variants Form Table */}
                <div className="border border-zinc-200 rounded-lg overflow-hidden">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-zinc-50 border-b border-zinc-200 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                        <th className="px-4 py-3 min-w-[130px]">Variant Name *</th>
                        <th className="px-3 py-3 w-[100px]">Std Price</th>
                        <th className="px-3 py-3 w-[100px]">Family Price</th>
                        <th className="px-3 py-3 w-[90px]">Weight (g)</th>
                        <th className="px-3 py-3 w-[90px]">Time (h)</th>
                        <th className="px-3 py-3 w-[80px]">Plates</th>
                        <th className="px-3 py-3 w-[90px]">Labor (h)</th>
                        <th className="px-3 py-3 text-center w-[50px]">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200 bg-white">
                      {formVariants.map((v, index) => (
                        <tr key={index} className="hover:bg-zinc-50/50">
                          {/* Name */}
                          <td className="px-4 py-3">
                            <input 
                              type="text" 
                              value={v.name}
                              onChange={(e) => handleUpdateVariantField(index, 'name', e.target.value)}
                              placeholder="e.g. Large PETG, Red PLA"
                              className="w-full px-2 py-1.5 bg-zinc-50 border border-zinc-200 rounded-md focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-950 focus:border-zinc-950 transition-colors text-xs font-medium"
                              required
                            />
                          </td>
                          {/* Standard Price */}
                          <td className="px-3 py-3">
                            <div className="relative">
                              <input 
                                type="number" 
                                value={v.fixedStandardPrice === 0 ? '' : v.fixedStandardPrice}
                                onChange={(e) => handleUpdateVariantField(index, 'fixedStandardPrice', Number(e.target.value))}
                                placeholder="0"
                                className="w-full pl-2 pr-4 py-1.5 bg-zinc-50 border border-zinc-200 rounded-md focus:bg-white focus:outline-none text-xs font-bold text-zinc-800"
                                min="0"
                              />
                            </div>
                          </td>
                          {/* Family Price */}
                          <td className="px-3 py-3">
                            <div className="relative">
                              <input 
                                type="number" 
                                value={v.fixedFamilyPrice === 0 ? '' : v.fixedFamilyPrice}
                                onChange={(e) => handleUpdateVariantField(index, 'fixedFamilyPrice', Number(e.target.value))}
                                placeholder="0"
                                className="w-full pl-2 pr-4 py-1.5 bg-zinc-50 border border-zinc-200 rounded-md focus:bg-white focus:outline-none text-xs font-semibold text-emerald-800"
                                min="0"
                              />
                            </div>
                          </td>
                          {/* Weight */}
                          <td className="px-3 py-3">
                            <input 
                              type="number" 
                              value={v.weightGrams === 0 ? '' : v.weightGrams}
                              onChange={(e) => handleUpdateVariantField(index, 'weightGrams', Number(e.target.value))}
                              placeholder="g"
                              className="w-full px-2 py-1.5 bg-zinc-50 border border-zinc-200 rounded-md focus:bg-white focus:outline-none text-xs text-zinc-700"
                              min="0"
                            />
                          </td>
                          {/* Print Time */}
                          <td className="px-3 py-3">
                            <input 
                              type="number" 
                              value={v.printTimeHours === 0 ? '' : v.printTimeHours}
                              onChange={(e) => handleUpdateVariantField(index, 'printTimeHours', Number(e.target.value))}
                              placeholder="hrs"
                              className="w-full px-2 py-1.5 bg-zinc-50 border border-zinc-200 rounded-md focus:bg-white focus:outline-none text-xs text-zinc-700"
                              min="0"
                              step="0.1"
                            />
                          </td>
                          {/* Plates */}
                          <td className="px-3 py-3">
                            <input 
                              type="number" 
                              value={v.platesCount || 1}
                              onChange={(e) => handleUpdateVariantField(index, 'platesCount', Number(e.target.value))}
                              placeholder="1"
                              className="w-full px-2 py-1.5 bg-zinc-50 border border-zinc-200 rounded-md focus:bg-white focus:outline-none text-xs text-zinc-700"
                              min="1"
                            />
                          </td>
                          {/* Labor Hours */}
                          <td className="px-3 py-3">
                            <input 
                              type="number" 
                              value={v.laborHours === 0 ? '' : v.laborHours}
                              onChange={(e) => handleUpdateVariantField(index, 'laborHours', Number(e.target.value))}
                              placeholder="hrs"
                              className="w-full px-2 py-1.5 bg-zinc-50 border border-zinc-200 rounded-md focus:bg-white focus:outline-none text-xs text-zinc-700"
                              min="0"
                              step="0.1"
                            />
                          </td>
                          {/* Actions */}
                          <td className="px-3 py-3 text-center">
                            <button 
                              type="button"
                              onClick={() => handleRemoveVariantRow(index)}
                              className="p-1 hover:bg-red-50 text-zinc-400 hover:text-red-600 rounded transition-colors"
                              title="Delete Variant"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </form>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-zinc-200 bg-zinc-50 flex items-center justify-end gap-3 shrink-0">
              <button 
                type="button" 
                onClick={() => setIsModalOpen(false)}
                className="border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700 text-xs font-semibold py-2 px-4 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button 
                type="button"
                onClick={handleSave}
                className="bg-zinc-900 hover:bg-black text-white text-xs font-semibold py-2 px-5 rounded-lg transition-colors flex items-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" /> Save Product
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
