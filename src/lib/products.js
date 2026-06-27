import { supabase } from '../supabaseClient';

const PRODUCTS_TABLE = 'products';
const VARIANTS_TABLE = 'product_variants';
const LOCAL_STORAGE_KEY = 'macky_products';

// Fallback initial data if there is nothing in DB and nothing in local storage
const DEFAULT_PRODUCTS = [
  {
    id: 'prod-dragon',
    name: 'Articulated Dragon',
    description: 'A flexible, articulated dragon toy printed in one piece.',
    imageUrl: 'https://images.unsplash.com/photo-1608889175123-8ec330b86f84?w=500&auto=format&fit=crop&q=60',
    variants: [
      {
        id: 'var-dragon-sm',
        name: 'Small (PLA)',
        fixedStandardPrice: 250,
        fixedFamilyPrice: 180,
        weightGrams: 80,
        printTimeHours: 3.5,
        platesCount: 1,
        laborHours: 0.5
      },
      {
        id: 'var-dragon-lg',
        name: 'Large (PETG Glow)',
        fixedStandardPrice: 650,
        fixedFamilyPrice: 500,
        weightGrams: 280,
        printTimeHours: 11.5,
        platesCount: 2,
        laborHours: 1.5
      }
    ]
  },
  {
    id: 'prod-keycase',
    name: '60% Keyboard Case',
    description: 'Minimalist mechanical keyboard case with integrated stands.',
    imageUrl: 'https://images.unsplash.com/photo-1595225476474-87563907a212?w=500&auto=format&fit=crop&q=60',
    variants: [
      {
        id: 'var-keycase-std',
        name: 'Standard ABS',
        fixedStandardPrice: 850,
        fixedFamilyPrice: 700,
        weightGrams: 150,
        printTimeHours: 6.0,
        platesCount: 1,
        laborHours: 2.0
      }
    ]
  }
];

// Map Supabase rows to JS objects
function mapRowToProduct(prodRow, variantRows = []) {
  return {
    id: prodRow.id,
    name: prodRow.name,
    description: prodRow.description || '',
    imageUrl: prodRow.image_url || '',
    variants: variantRows.map(v => ({
      id: v.id,
      productId: v.product_id,
      name: v.name,
      fixedStandardPrice: Number(v.fixed_standard_price),
      fixedFamilyPrice: Number(v.fixed_family_price),
      weightGrams: Number(v.weight_g),
      printTimeHours: Number(v.print_time_hours),
      platesCount: Number(v.plates_count || 1),
      laborHours: Number(v.labor_hours)
    }))
  };
}

// Get from localStorage with default seeding if empty
function getLocalProducts() {
  const data = localStorage.getItem(LOCAL_STORAGE_KEY);
  if (!data) {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(DEFAULT_PRODUCTS));
    return DEFAULT_PRODUCTS;
  }
  try {
    return JSON.parse(data);
  } catch (e) {
    console.error('Error parsing local products:', e);
    return DEFAULT_PRODUCTS;
  }
}

// Save to localStorage
function saveLocalProducts(products) {
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(products));
}

// Fetch all products with their variants
export async function fetchProducts() {
  try {
    // Attempt Supabase fetch
    const { data: prodData, error: prodErr } = await supabase
      .from(PRODUCTS_TABLE)
      .select('*')
      .order('name', { ascending: true });

    if (prodErr) {
      console.warn('Supabase fetch products error, falling back to localStorage:', prodErr.message);
      return getLocalProducts();
    }

    const { data: varData, error: varErr } = await supabase
      .from(VARIANTS_TABLE)
      .select('*');

    if (varErr) {
      console.warn('Supabase fetch variants error, falling back to localStorage:', varErr.message);
      return getLocalProducts();
    }

    // Group variants by product_id
    const variantsByProdId = {};
    (varData || []).forEach(v => {
      if (!variantsByProdId[v.product_id]) {
        variantsByProdId[v.product_id] = [];
      }
      variantsByProdId[v.product_id].push(v);
    });

    const products = (prodData || []).map(p => mapRowToProduct(p, variantsByProdId[p.id] || []));
    
    // Sync local storage cache
    saveLocalProducts(products);
    
    return products;
  } catch (err) {
    console.warn('Error fetching products from database, using localStorage fallback:', err);
    return getLocalProducts();
  }
}

// Upsert a product and its variants
export async function upsertProduct(product, variants) {
  const isNew = !product.id || String(product.id).startsWith('prod-') || !String(product.id).includes('-');
  
  // Generate random client-side UUID if we fall back or need it
  const generateUuid = () => {
    try {
      return crypto.randomUUID();
    } catch {
      return 'id-' + Math.random().toString(36).substr(2, 9) + '-' + Date.now();
    }
  };

  const productId = product.id || generateUuid();

  try {
    // 1. Try Supabase upsert of product
    const productPayload = {
      name: product.name,
      description: product.description || '',
      image_url: product.imageUrl || ''
    };
    if (product.id && !isNew) {
      productPayload.id = product.id;
    }

    const { data: savedProd, error: prodErr } = await supabase
      .from(PRODUCTS_TABLE)
      .upsert(productPayload)
      .select()
      .single();

    if (prodErr) throw prodErr;

    const actualProductId = savedProd.id;

    // 2. Manage variants: get list of existing variant IDs for this product to remove deleted ones
    const activeVariantIds = [];
    const variantUpsertPayloads = variants.map(v => {
      const varId = v.id && !String(v.id).startsWith('var-') ? v.id : generateUuid();
      if (!String(varId).startsWith('id-')) {
        activeVariantIds.push(varId);
      }
      return {
        id: varId,
        product_id: actualProductId,
        name: v.name,
        fixed_standard_price: Number(v.fixedStandardPrice) || 0,
        fixed_family_price: Number(v.fixedFamilyPrice) || 0,
        weight_g: Number(v.weightGrams) || 0,
        print_time_hours: Number(v.printTimeHours) || 0,
        plates_count: Number(v.platesCount) || 1,
        labor_hours: Number(v.laborHours) || 0
      };
    });

    // Delete removed variants in DB
    if (activeVariantIds.length > 0) {
      await supabase
        .from(VARIANTS_TABLE)
        .delete()
        .eq('product_id', actualProductId)
        .not('id', 'in', `(${activeVariantIds.join(',')})`);
    } else {
      await supabase
        .from(VARIANTS_TABLE)
        .delete()
        .eq('product_id', actualProductId);
    }

    // Upsert variants
    if (variantUpsertPayloads.length > 0) {
      const { error: varErr } = await supabase
        .from(VARIANTS_TABLE)
        .upsert(variantUpsertPayloads);
      if (varErr) throw varErr;
    }

    // Refresh and return
    return await fetchProducts();

  } catch (err) {
    console.warn('Failed to upsert product in Supabase. Falling back to localStorage:', err.message);

    // Local storage fallback implementation
    const localProducts = getLocalProducts();
    const existingIndex = localProducts.findIndex(p => p.id === productId);

    const mappedVariants = variants.map(v => ({
      id: v.id || 'var-' + Math.random().toString(36).substr(2, 9),
      name: v.name,
      fixedStandardPrice: Number(v.fixedStandardPrice) || 0,
      fixedFamilyPrice: Number(v.fixedFamilyPrice) || 0,
      weightGrams: Number(v.weightGrams) || 0,
      printTimeHours: Number(v.printTimeHours) || 0,
      platesCount: Number(v.platesCount) || 1,
      laborHours: Number(v.laborHours) || 0
    }));

    const newProduct = {
      id: productId,
      name: product.name,
      description: product.description || '',
      imageUrl: product.imageUrl || '',
      variants: mappedVariants
    };

    if (existingIndex > -1) {
      localProducts[existingIndex] = newProduct;
    } else {
      localProducts.push(newProduct);
    }

    saveLocalProducts(localProducts);
    return localProducts;
  }
}

// Delete a product
export async function deleteProduct(productId) {
  try {
    const { error } = await supabase
      .from(PRODUCTS_TABLE)
      .delete()
      .eq('id', productId);

    if (error) throw error;
    
    return await fetchProducts();
  } catch (err) {
    console.warn('Failed to delete product in Supabase. Falling back to localStorage:', err.message);
    
    const localProducts = getLocalProducts();
    const filtered = localProducts.filter(p => p.id !== productId);
    saveLocalProducts(filtered);
    return filtered;
  }
}
