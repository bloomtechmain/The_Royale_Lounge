import { useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, X, Plus, Trash2, CheckCircle, Package, Tag, Calendar, ShoppingBag } from 'lucide-react';
import { toast } from 'sonner';
import { productService } from '@/services/productService';
import Button from '@/components/common/Button';
import Input from '@/components/common/Input';
import Select from '@/components/common/Select';
import Textarea from '@/components/common/Textarea';
import type { ProductCategory } from '@/types';

const STEPS = ['Basic Info', 'Pricing', 'Variants', 'Review'];

interface VariantForm {
  size: string;
  color: string;
  material: string;
  stockQuantity: number;
  availableForRent: number;
  sellingPrice: string;
  rentalPricePerDay: string;
}

export default function ProductFormPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = !!id;
  const qc = useQueryClient();
  const [step, setStep] = useState(0);
  const [images, setImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    name: '', description: '', categoryId: '', type: 'both',
    sellingPrice: '', rentalPricePerDay: '', lateFinePerDay: '',
  });

  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  const [variants, setVariants] = useState<VariantForm[]>([]);
  const [newVariant, setNewVariant] = useState<VariantForm>({
    size: '', color: '', material: '', stockQuantity: 0,
    availableForRent: 0, sellingPrice: '', rentalPricePerDay: '',
  });

  const { data: categories } = useQuery({
    queryKey: ['product-categories'],
    queryFn: productService.getCategories,
  });

  const createCategoryMutation = useMutation({
    mutationFn: (name: string) => productService.createCategory({ name }),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ['product-categories'] });
      setForm((prev) => ({ ...prev, categoryId: data.id }));
      setNewCategoryName('');
      setShowNewCategory(false);
      toast.success(`Category "${data.name}" created`);
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to create category'),
  });

  const { data: existing } = useQuery({
    queryKey: ['product', id],
    queryFn: () => productService.getById(id!),
    enabled: isEdit,
    onSuccess: (data: any) => {
      setForm({
        name: data.name || '',
        description: data.description || '',
        categoryId: data.category_id || '',
        type: data.type || 'both',
        sellingPrice: data.selling_price || '',
        rentalPricePerDay: data.rental_price_per_day || '',
        lateFinePerDay: data.late_fine_per_day || '',
      });
    },
  } as any);

  const createMutation = useMutation({
    mutationFn: productService.create,
    onSuccess: (data: any) => {
      toast.success('Product created successfully!');
      qc.invalidateQueries({ queryKey: ['products'] });
      navigate(`/products/${data.id}`);
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to create product'),
  });

  const updateMutation = useMutation({
    mutationFn: (payload: any) => productService.update(id!, payload),
    onSuccess: () => {
      toast.success('Product updated successfully!');
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['product', id] });
      navigate(`/products/${id}`);
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to update product'),
  });

  const handleImageDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'));
    addImages(files);
  };

  const addImages = (files: File[]) => {
    setImages((prev) => [...prev, ...files]);
    files.forEach((f) => {
      const reader = new FileReader();
      reader.onload = (ev) => setImagePreviews((prev) => [...prev, ev.target?.result as string]);
      reader.readAsDataURL(f);
    });
  };

  const removeImage = (idx: number) => {
    setImages((prev) => prev.filter((_, i) => i !== idx));
    setImagePreviews((prev) => prev.filter((_, i) => i !== idx));
  };

  const addVariant = () => {
    if (!newVariant.size && !newVariant.color) {
      toast.error('Please enter at least size or color');
      return;
    }
    setVariants((prev) => [...prev, { ...newVariant }]);
    setNewVariant({ size: '', color: '', material: '', stockQuantity: 0, availableForRent: 0, sellingPrice: '', rentalPricePerDay: '' });
  };

  const removeVariant = (idx: number) => setVariants((prev) => prev.filter((_, i) => i !== idx));

  const handleSubmit = async () => {
    const payload = {
      name: form.name,
      description: form.description,
      categoryId: form.categoryId || undefined,
      type: form.type,
      sellingPrice: form.sellingPrice ? parseFloat(form.sellingPrice) : undefined,
      rentalPricePerDay: form.rentalPricePerDay ? parseFloat(form.rentalPricePerDay) : undefined,
      lateFinePerDay: form.lateFinePerDay ? parseFloat(form.lateFinePerDay) : 0,
      variants: variants.map((v) => ({
        ...v,
        sellingPrice: v.sellingPrice ? parseFloat(v.sellingPrice) : undefined,
        rentalPricePerDay: v.rentalPricePerDay ? parseFloat(v.rentalPricePerDay) : undefined,
      })),
    };

    if (isEdit) {
      updateMutation.mutate(payload);
    } else {
      createMutation.mutate(payload);
    }
  };

  const categoryOptions = [
    { value: '', label: 'Select Category' },
    ...(categories || []).map((c: ProductCategory) => ({ value: c.id, label: c.name })),
  ];

  const canProceed = () => {
    if (step === 0) return form.name.trim().length > 0 && form.type;
    if (step === 1) {
      if (form.type === 'sale') return !!form.sellingPrice;
      if (form.type === 'rental') return !!form.rentalPricePerDay;
      return !!form.sellingPrice || !!form.rentalPricePerDay;
    }
    return true;
  };

  return (
    <>
      {/* Backdrop */}
      <div
        style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)', zIndex: 40,
        }}
        onClick={() => navigate('/products')}
      />

      {/* Right-side panel */}
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        transition={{ type: 'tween', duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0,
          width: '100%', maxWidth: 640,
          background: '#1a1a26', borderLeft: '1px solid #2a2a38',
          zIndex: 50, display: 'flex', flexDirection: 'column',
          boxShadow: '-8px 0 40px rgba(0,0,0,0.6)',
        }}
      >
        {/* Panel header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px', borderBottom: '1px solid #21212f', flexShrink: 0 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#c8c8d8', fontFamily: '"Playfair Display", Georgia, serif' }}>
            {isEdit ? 'Edit Product' : 'New Product'}
          </h2>
          <button onClick={() => navigate('/products')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b6b80', padding: 6, borderRadius: 8, display: 'flex', alignItems: 'center' }}>
            <X size={18} />
          </button>
        </div>

        {/* Steps */}
        <div className="flex items-center px-6 py-4 border-b border-charcoal-600" style={{ flexShrink: 0 }}>
          {STEPS.map((label, i) => (
            <div key={i} className="flex items-center flex-1">
              <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-medium flex-shrink-0 transition-all duration-200 ${
                i < step ? 'bg-gold-gradient text-charcoal-900' :
                i === step ? 'bg-charcoal-600 border-2 border-gold-600 text-gold-400' :
                'bg-charcoal-600 border border-charcoal-400 text-charcoal-300'
              }`}>
                {i < step ? <CheckCircle size={13} /> : i + 1}
              </div>
              <span className={`ml-1.5 text-xs hidden sm:inline ${i === step ? 'text-charcoal-50 font-medium' : 'text-charcoal-300'}`}>{label}</span>
              {i < STEPS.length - 1 && <div className={`flex-1 h-px mx-2 ${i < step ? 'bg-gold-700' : 'bg-charcoal-500'}`} />}
            </div>
          ))}
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
        <div>
        <AnimatePresence mode="wait">
          {/* Step 0: Basic Info */}
          {step === 0 && (
            <motion.div key="step0" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
              <h3 className="section-title">Basic Information</h3>
              <Input label="Product Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Classic Black Tuxedo" required />
              {/* Category with inline creation */}
              <div>
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <Select label="Category" options={categoryOptions} value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} />
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowNewCategory(!showNewCategory)}
                    className="mb-0.5 flex items-center gap-1 px-3 py-2.5 rounded-xl border border-charcoal-400 bg-charcoal-600 text-charcoal-200 hover:border-gold-700/60 hover:text-gold-400 transition-colors text-xs font-medium flex-shrink-0"
                    title="Create new category"
                  >
                    <Plus size={14} />
                    New
                  </button>
                </div>
                <AnimatePresence>
                  {showNewCategory && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="flex items-center gap-2 mt-2 p-3 bg-charcoal-600/50 rounded-xl border border-charcoal-400">
                        <input
                          type="text"
                          value={newCategoryName}
                          onChange={(e) => setNewCategoryName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && newCategoryName.trim()) createCategoryMutation.mutate(newCategoryName.trim());
                            if (e.key === 'Escape') { setShowNewCategory(false); setNewCategoryName(''); }
                          }}
                          placeholder="Category name (e.g. Suits, Sherwanis)"
                          className="flex-1 bg-transparent text-sm text-charcoal-50 placeholder-charcoal-300 outline-none"
                          autoFocus
                        />
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => newCategoryName.trim() && createCategoryMutation.mutate(newCategoryName.trim())}
                          loading={createCategoryMutation.isPending}
                          disabled={!newCategoryName.trim()}
                        >
                          Save
                        </Button>
                        <button
                          type="button"
                          onClick={() => { setShowNewCategory(false); setNewCategoryName(''); }}
                          className="text-charcoal-300 hover:text-charcoal-50 transition-colors"
                        >
                          <X size={15} />
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Product Type tiles */}
              <div>
                <p className="text-sm font-medium text-charcoal-100 mb-2">Product Type <span className="text-red-400">*</span></p>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { value: 'sale', label: 'Sale Only', icon: ShoppingBag, desc: 'Sold to customers' },
                    { value: 'rental', label: 'Rental Only', icon: Calendar, desc: 'Available to rent' },
                    { value: 'both', label: 'Rental & Sale', icon: Tag, desc: 'Both options' },
                  ].map(({ value, label, icon: Icon, desc }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setForm({ ...form, type: value })}
                      className={`flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all duration-150 text-center ${
                        form.type === value
                          ? 'border-gold-600 bg-gold-700/10 text-gold-400'
                          : 'border-charcoal-400 bg-charcoal-600/30 text-charcoal-200 hover:border-charcoal-300 hover:text-charcoal-50'
                      }`}
                    >
                      <Icon size={20} />
                      <span className="text-xs font-semibold leading-tight">{label}</span>
                      <span className="text-xs opacity-60 leading-tight hidden sm:block">{desc}</span>
                    </button>
                  ))}
                </div>
              </div>
              <Textarea label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Describe this product..." rows={3} />
            </motion.div>
          )}

          {/* Step 1: Pricing */}
          {step === 1 && (
            <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
              <h3 className="section-title">Pricing Details</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {(form.type === 'sale' || form.type === 'both') && (
                  <Input label="Selling Price (LKR)" type="number" step="0.01" min="0" value={form.sellingPrice} onChange={(e) => setForm({ ...form, sellingPrice: e.target.value })} placeholder="0.00" />
                )}
                {(form.type === 'rental' || form.type === 'both') && (
                  <Input label="Rental Price Per Day (LKR)" type="number" step="0.01" min="0" value={form.rentalPricePerDay} onChange={(e) => setForm({ ...form, rentalPricePerDay: e.target.value })} placeholder="0.00" />
                )}
                {(form.type === 'rental' || form.type === 'both') && (
                  <Input label="Late Fine Per Day (LKR)" type="number" step="0.01" min="0" value={form.lateFinePerDay} onChange={(e) => setForm({ ...form, lateFinePerDay: e.target.value })} placeholder="0.00" />
                )}
              </div>
            </motion.div>
          )}

          {/* Step 2: Variants */}
          {step === 2 && (
            <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
              <h3 className="section-title">Product Variants</h3>

              {/* Add variant form */}
              <div className="p-4 bg-charcoal-600/50 rounded-xl border border-charcoal-400 space-y-3">
                <p className="text-sm font-medium text-charcoal-100">Add Variant</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Input placeholder="Size (e.g. 38, M, XL)" value={newVariant.size} onChange={(e) => setNewVariant({ ...newVariant, size: e.target.value })} />
                  <Input placeholder="Color" value={newVariant.color} onChange={(e) => setNewVariant({ ...newVariant, color: e.target.value })} />
                  <Input placeholder="Material" value={newVariant.material} onChange={(e) => setNewVariant({ ...newVariant, material: e.target.value })} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input label="Stock Qty" type="number" min="0" value={newVariant.stockQuantity} onChange={(e) => setNewVariant({ ...newVariant, stockQuantity: parseInt(e.target.value) || 0 })} />
                  <Input label="Available for Rent" type="number" min="0" value={newVariant.availableForRent} onChange={(e) => setNewVariant({ ...newVariant, availableForRent: parseInt(e.target.value) || 0 })} />
                </div>
                <Button variant="secondary" size="sm" icon={<Plus size={14} />} onClick={addVariant}>
                  Add Variant
                </Button>
              </div>

              {/* Variants list */}
              {variants.length > 0 && (
                <div className="space-y-2">
                  {variants.map((v, i) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-charcoal-600/30 rounded-xl border border-charcoal-500">
                      <div className="flex items-center gap-3 flex-wrap">
                        {v.size && <span className="text-sm text-charcoal-50 font-medium">Size: {v.size}</span>}
                        {v.color && <span className="text-sm text-charcoal-200">Color: {v.color}</span>}
                        {v.material && <span className="text-sm text-charcoal-200">Material: {v.material}</span>}
                        <span className="text-sm text-charcoal-200">Qty: {v.stockQuantity}</span>
                      </div>
                      <button onClick={() => removeVariant(i)} className="text-charcoal-200 hover:text-red-400 transition-colors">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {variants.length === 0 && (
                <p className="text-sm text-charcoal-200 text-center py-4">
                  No variants added yet. Add at least one variant with size/color information.
                </p>
              )}

              {/* Image upload */}
              <div className="pt-2">
                <p className="text-sm font-medium text-charcoal-100 mb-2">Product Images</p>
                <div
                  className="border-2 border-dashed border-charcoal-400 rounded-xl p-6 text-center cursor-pointer hover:border-gold-700/50 transition-colors"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleImageDrop}
                  onClick={() => fileRef.current?.click()}
                >
                  <Upload size={24} className="mx-auto text-charcoal-200 mb-2" />
                  <p className="text-sm text-charcoal-200">Drag & drop images or click to upload</p>
                  <p className="text-xs text-charcoal-300 mt-1">PNG, JPG, WebP up to 5MB each</p>
                </div>
                <input ref={fileRef} type="file" accept="image/*" multiple className="hidden"
                  onChange={(e) => addImages(Array.from(e.target.files || []))} />

                {imagePreviews.length > 0 && (
                  <div className="grid grid-cols-4 gap-3 mt-3">
                    {imagePreviews.map((src, i) => (
                      <div key={i} className="relative aspect-square rounded-xl overflow-hidden bg-charcoal-600">
                        <img src={src} alt="" className="w-full h-full object-cover" />
                        <button
                          onClick={() => removeImage(i)}
                          className="absolute top-1 right-1 w-6 h-6 bg-red-500/80 rounded-full flex items-center justify-center"
                        >
                          <X size={12} className="text-white" />
                        </button>
                        {i === 0 && <span className="absolute bottom-1 left-1 text-xs bg-gold-600 text-charcoal-900 px-1.5 py-0.5 rounded font-medium">Primary</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* Step 3: Review */}
          {step === 3 && (
            <motion.div key="step3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
              <h3 className="section-title">Review & Save</h3>
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    { label: 'Name', value: form.name },
                    { label: 'Type', value: form.type === 'both' ? 'Rental & Sale' : form.type === 'rental' ? 'Rental Only' : 'Sale Only' },
                    { label: 'Category', value: categories?.find((c: ProductCategory) => c.id === form.categoryId)?.name || '—' },
                    { label: 'Selling Price', value: form.sellingPrice ? `LKR ${form.sellingPrice}` : '—' },
                    { label: 'Rental Price/Day', value: form.rentalPricePerDay ? `LKR ${form.rentalPricePerDay}` : '—' },
                    { label: 'Late Fine/Day', value: form.lateFinePerDay ? `LKR ${form.lateFinePerDay}` : '—' },
                    { label: 'Variants', value: variants.length > 0 ? `${variants.length} variant(s)` : 'None' },
                    { label: 'Images', value: images.length > 0 ? `${images.length} image(s)` : 'None' },
                  ].map(({ label, value }) => (
                    <div key={label} className="p-3 bg-charcoal-600/50 rounded-xl">
                      <p className="text-xs text-charcoal-200">{label}</p>
                      <p className="text-sm font-medium text-charcoal-50 mt-0.5 capitalize">{value}</p>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        </div>
        </div>

        {/* Footer navigation */}
        <div style={{ borderTop: '1px solid #21212f', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', flexShrink: 0 }}>
          <Button variant="secondary" onClick={() => step > 0 ? setStep(step - 1) : navigate('/products')} disabled={createMutation.isPending}>
            {step === 0 ? 'Cancel' : 'Back'}
          </Button>
          {step < STEPS.length - 1 ? (
            <Button variant="primary" onClick={() => setStep(step + 1)} disabled={!canProceed()}>
              Next
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={handleSubmit}
              loading={createMutation.isPending || updateMutation.isPending}
              icon={<CheckCircle size={16} />}
            >
              {isEdit ? 'Save Changes' : 'Create Product'}
            </Button>
          )}
        </div>
      </motion.div>
    </>
  );
}
