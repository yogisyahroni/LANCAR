import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { api } from '@/lib/api';
import { useRuntimeConfig } from '@/hooks/useRuntimeConfig';
import {
  CUSTOMER_ORDER_DRAFT_KEY,
  CUSTOMER_ORDER_DRAFT_TTL_MS,
  LEGACY_CUSTOMER_ORDER_DRAFT_KEY,
  RECEIVER_LOCATION_POLL_MS,
  RECEIVER_LOCATION_STORAGE_KEY,
  DeliveryService,
  OrderFormProps,
  OrderFormValues,
  ReceiverLocationLink,
  buildSafeOrderDraftForm,
  buildSafeReceiverLocationDraft,
  clearCustomerOrderDraft,
  createOrderSchema,
  mergeDraftWithCurrentValues,
  parseCustomerOrderDraft,
} from './OrderSchemas';
import { buildCalendarDays, formatDateLabel, formatDateValue, pickupTimeOptions } from './AddressPicker';

export function useOnDemandOrderFormRuntime({ mode = 'instan', onFormChange, onSubmit }: OrderFormProps) {
  const { config } = useRuntimeConfig();
  const [services, setServices] = useState<DeliveryService[]>([]);
  const [isLoadingServices, setIsLoadingServices] = useState(true);
  const [serviceLoadError, setServiceLoadError] = useState<string | null>(null);
  const [isScanOpen, setIsScanOpen] = useState(false);
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [isTimePickerOpen, setIsTimePickerOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [receiverLocationLink, setReceiverLocationLink] = useState<ReceiverLocationLink | null>(null);
  const [receiverLocationBusy, setReceiverLocationBusy] = useState(false);
  const [receiverLocationMessage, setReceiverLocationMessage] = useState<string | null>(null);
  const receiverLocationLinkRef = useRef<ReceiverLocationLink | null>(null);
  const receiverLocationPollInFlightRef = useRef(false);
  const draftHydratedRef = useRef(false);
  const [draftRestoredAt, setDraftRestoredAt] = useState<string | null>(null);

  const onDemandServices = useMemo(() => services.filter((service) => service.service_category !== 'aggregator'), [services]);
  const aggregatorServices = useMemo(() => services.filter((service) => service.service_category === 'aggregator'), [services]);
  const defaultAggregatorService = useMemo(() => aggregatorServices[0], [aggregatorServices]);

  const customZodResolver = async (data: any) => {
    const result = createOrderSchema(config, mode).safeParse(data);
    if (result.success) return { values: result.data, errors: {} };
    const errors: Record<string, any> = {};
    result.error.issues.forEach((issue) => {
      const path = issue.path.join('.');
      if (!errors[path]) errors[path] = { type: issue.code, message: issue.message };
    });
    return { values: {}, errors };
  };

  const {
    register, handleSubmit, watch, setValue, getValues, reset,
    formState: { errors, isValid },
  } = useForm<OrderFormValues>({
    resolver: customZodResolver,
    mode: 'onChange',
    defaultValues: {
      service_code: '', size_tier: '', pickup_address: '', dropoff_address: '', recipient_name: '',
      recipient_phone: '', schedule_type: 'now', has_insurance: false,
      package_details: { category: '', weight_kg: 1, dimensions: { length: '' as any, width: '' as any, height: '' as any }, dimensions_scanned: false },
    },
  });

  const service_code = watch('service_code');
  const size_tier = watch('size_tier');
  const pickup_address = watch('pickup_address');
  const pickup_location = watch('pickup_location');
  const dropoff_address = watch('dropoff_address');
  const dropoff_location = watch('dropoff_location');
  const category = watch('package_details.category');
  const weight_kg = watch('package_details.weight_kg');
  const length = watch('package_details.dimensions.length');
  const width = watch('package_details.dimensions.width');
  const height = watch('package_details.dimensions.height');
  const dimensions_scanned = watch('package_details.dimensions_scanned');
  const has_insurance = watch('has_insurance');
  const item_value = watch('item_value');
  const schedule_type = watch('schedule_type');
  const scheduled_at = watch('scheduled_at');
  const logistics_tariff_idr = watch('logistics_tariff_idr');
  const logistics_provider = watch('logistics_provider');
  const selectedService = useMemo(() => services.find((service) => service.code === service_code), [service_code, services]);
  const selectedTier = useMemo(() => selectedService?.size_tiers?.find((tier) => tier.code === size_tier) || selectedService?.size_tiers?.[0], [selectedService, size_tier]);
  const scanRequired = Boolean(selectedService?.requires_dimension_scan);
  const todayDate = formatDateValue(new Date());
  const calendarDays = useMemo(() => buildCalendarDays(calendarMonth), [calendarMonth]);
  const volumetricWeight = useMemo(() => {
    const l = Number(length) || 0; const w = Number(width) || 0; const h = Number(height) || 0;
    return l && w && h ? (l * w * h) / 6000 : 0;
  }, [height, length, width]);
  const chargeableWeight = Math.max(Number(weight_kg) || 0, volumetricWeight);

  const persistOrderDraft = useCallback((link: ReceiverLocationLink | null = receiverLocationLinkRef.current) => {
    if (typeof window === 'undefined' || !draftHydratedRef.current) return;
    const savedAt = new Date();
    try {
      window.sessionStorage.setItem(CUSTOMER_ORDER_DRAFT_KEY, JSON.stringify({
        version: 2,
        saved_at: savedAt.toISOString(),
        expires_at: new Date(savedAt.getTime() + CUSTOMER_ORDER_DRAFT_TTL_MS).toISOString(),
        form: buildSafeOrderDraftForm(getValues()),
        receiver_location_link: buildSafeReceiverLocationDraft(link),
      }));
    } catch { /* draft is a convenience layer; submit remains source of truth */ }
  }, [getValues]);

  useEffect(() => {
    if (typeof window === 'undefined' || draftHydratedRef.current) return;
    draftHydratedRef.current = true;
    try {
      window.sessionStorage.removeItem(LEGACY_CUSTOMER_ORDER_DRAFT_KEY);
      const draft = parseCustomerOrderDraft(window.sessionStorage.getItem(CUSTOMER_ORDER_DRAFT_KEY));
      if (!draft) { window.sessionStorage.removeItem(CUSTOMER_ORDER_DRAFT_KEY); return; }
      reset(mergeDraftWithCurrentValues(getValues(), draft.form));
      setDraftRestoredAt(draft.saved_at);
      const draftLink = draft.receiver_location_link as ReceiverLocationLink | null;
      if (draftLink?.id && draftLink.expires_at && Date.parse(draftLink.expires_at) > Date.now()) {
        receiverLocationLinkRef.current = draftLink;
        setReceiverLocationLink(draftLink);
      }
    } catch { clearCustomerOrderDraft(); }
  }, [getValues, reset]);
  useEffect(() => { receiverLocationLinkRef.current = receiverLocationLink; persistOrderDraft(receiverLocationLink); }, [persistOrderDraft, receiverLocationLink]);
  useEffect(() => {
    const subscription = watch(() => persistOrderDraft(receiverLocationLinkRef.current));
    return () => subscription.unsubscribe();
  }, [persistOrderDraft, watch]);

  const loadServices = useCallback(async () => {
    setIsLoadingServices(true); setServiceLoadError(null);
    try {
      const response = await api.get('/auth/web/delivery-services');
      const nextServices = response.data?.services || [];
      setServices(nextServices);
      const defaultService = nextServices.find((service: DeliveryService) => service.code === 'tembus_instant') || nextServices[0];
      if (defaultService && !getValues('service_code')) {
        setValue('service_code', defaultService.code, { shouldDirty: true, shouldValidate: true });
        if (defaultService.size_tiers?.[0]) setValue('size_tier', defaultService.size_tiers[0].code, { shouldDirty: true, shouldValidate: true });
      }
      if (!nextServices.length) setServiceLoadError('Belum ada layanan aktif di dashboard admin.');
    } catch { setServices([]); setServiceLoadError('Layanan belum bisa dimuat. Coba muat ulang.'); }
    finally { setIsLoadingServices(false); }
  }, [getValues, setValue]);
  useEffect(() => { void loadServices(); }, [loadServices]);
  useEffect(() => {
    if (selectedService?.size_tiers?.length && !selectedService.size_tiers.some((tier) => tier.code === size_tier)) {
      setValue('size_tier', selectedService.size_tiers[0].code, { shouldDirty: true, shouldValidate: true });
    }
  }, [selectedService, setValue, size_tier]);
  useEffect(() => {
    const isAggregator = service_code === 'tembus_aggregator';
    onFormChange(getValues(), isValid && (isAggregator || Boolean(selectedService)) && (!scanRequired || Boolean(dimensions_scanned)), { selectedService, scanRequired });
  }, [category, dimensions_scanned, dropoff_address, dropoff_location?.lat, dropoff_location?.lng, getValues, has_insurance, height, isValid, item_value, length, logistics_provider, logistics_tariff_idr, onFormChange, pickup_address, pickup_location?.lat, pickup_location?.lng, scanRequired, schedule_type, scheduled_at, selectedService, service_code, size_tier, volumetricWeight, weight_kg, width]);

  const updateScheduledAt = (date: string, time: string) => setValue('scheduled_at', date && time ? `${date}T${time}` : '', { shouldDirty: true, shouldValidate: true });
  const pickScheduledDate = (date: Date) => { const next = formatDateValue(date); setScheduledDate(next); updateScheduledAt(next, scheduledTime); setIsDatePickerOpen(false); };
  const pickScheduledTime = (time: string) => { setScheduledTime(time); updateScheduledAt(scheduledDate, time); setIsTimePickerOpen(false); };
  const submitWithServiceRules = handleSubmit((data) => {
    if (scanRequired && !data.package_details.dimensions_scanned) {
      setIsScanOpen(true);
      return;
    }
    onSubmit(data);
  });

  const applyReceiverLocation = useCallback((link: ReceiverLocationLink) => {
    const lat = Number(link.submitted_lat); const lng = Number(link.submitted_lng);
    if (link.status !== 'submitted' || !link.submitted_address || !Number.isFinite(lat) || !Number.isFinite(lng)) return false;
    setValue('dropoff_address', link.submitted_address, { shouldDirty: true, shouldValidate: true });
    setValue('dropoff_location', { lat, lng }, { shouldDirty: true, shouldValidate: true });
    if (link.submitted_contact_name) setValue('recipient_name', link.submitted_contact_name, { shouldDirty: true, shouldValidate: true });
    if (link.submitted_notes && !getValues('customer_notes')) setValue('customer_notes', link.submitted_notes, { shouldDirty: true, shouldValidate: true });
    const current = receiverLocationLinkRef.current;
    persistOrderDraft(current ? { ...current, ...link } : link);
    return true;
  }, [getValues, persistOrderDraft, setValue]);
  const createReceiverLocationRequest = useCallback(async () => {
    if (!pickup_address || pickup_address.trim().length < 5) { setReceiverLocationMessage('Lengkapi alamat pickup sebelum membuat link lokasi penerima.'); return; }
    setReceiverLocationBusy(true); setReceiverLocationMessage(null);
    try {
      const response = await api.post('/customer/location-requests', { pickup_address, pickup_location, recipient_name: getValues('recipient_name') || null, recipient_phone: getValues('recipient_phone') || null, expires_hours: 24 });
      setReceiverLocationLink(response.data?.data as ReceiverLocationLink);
      setReceiverLocationMessage('Link lokasi dibuat. Bagikan ke penerima. Jawaban akan masuk otomatis tanpa refresh.');
    } catch (error: any) { setReceiverLocationMessage(error?.response?.data?.message || 'Link lokasi belum bisa dibuat.'); }
    finally { setReceiverLocationBusy(false); }
  }, [getValues, pickup_address, pickup_location]);
  const syncReceiverLocationRequest = useCallback(async (options: { silent?: boolean } = {}) => {
    const current = receiverLocationLinkRef.current;
    if (!current?.id) {
      setReceiverLocationMessage('Buat link lokasi penerima terlebih dahulu.');
      return false;
    }
    if (receiverLocationPollInFlightRef.current) return false;
    receiverLocationPollInFlightRef.current = true;
    if (!options.silent) { setReceiverLocationBusy(true); setReceiverLocationMessage(null); }
    try {
      const response = await api.get(`/customer/location-requests/${current.id}`);
      const link = response.data?.data as ReceiverLocationLink;
      const merged = { ...link, url: current.url || link.url };
      setReceiverLocationLink(merged);
      if (applyReceiverLocation(merged)) { setReceiverLocationMessage(options.silent ? 'Alamat penerima masuk otomatis ke detail pengiriman.' : 'Lokasi penerima sudah diterapkan ke detail pengiriman.'); return true; }
      if (!options.silent) setReceiverLocationMessage(link.status === 'expired' ? 'Link sudah kedaluwarsa. Buat link baru jika penerima belum mengisi.' : 'Penerima belum mengirim lokasi. Cek kembali setelah mereka selesai mengisi.');
      return false;
    } catch (error: any) { if (!options.silent) setReceiverLocationMessage(error?.response?.data?.message || 'Status lokasi penerima belum bisa dicek.'); return false; }
    finally { receiverLocationPollInFlightRef.current = false; if (!options.silent) setReceiverLocationBusy(false); }
  }, [applyReceiverLocation]);
  const refreshReceiverLocationRequest = useCallback(async () => { await syncReceiverLocationRequest(); }, [syncReceiverLocationRequest]);
  useEffect(() => {
    if (!receiverLocationLink?.id || receiverLocationLink.status !== 'pending') return;
    const poll = () => void syncReceiverLocationRequest({ silent: true });
    const visibility = () => { if (document.visibilityState === 'visible') poll(); };
    const interval = window.setInterval(poll, RECEIVER_LOCATION_POLL_MS);
    window.addEventListener('focus', poll); document.addEventListener('visibilitychange', visibility); poll();
    return () => { window.clearInterval(interval); window.removeEventListener('focus', poll); document.removeEventListener('visibilitychange', visibility); };
  }, [receiverLocationLink?.id, receiverLocationLink?.status, syncReceiverLocationRequest]);
  useEffect(() => {
    if (!receiverLocationLink?.url) return;
    const token = receiverLocationLink.url.split('/').filter(Boolean).pop(); if (!token) return;
    const listener = (event: StorageEvent) => { if (event.key !== RECEIVER_LOCATION_STORAGE_KEY || !event.newValue) return; try { if (JSON.parse(event.newValue)?.token === token) void syncReceiverLocationRequest({ silent: true }); } catch { /* ignore malformed cross-tab message */ } };
    window.addEventListener('storage', listener); return () => window.removeEventListener('storage', listener);
  }, [receiverLocationLink?.url, syncReceiverLocationRequest]);
  const copyReceiverLocationLink = useCallback(async () => {
    if (!receiverLocationLink?.url) return;
    try { await navigator.clipboard.writeText(receiverLocationLink.url); setReceiverLocationMessage('Link lokasi disalin.'); }
    catch { setReceiverLocationMessage('Browser belum mengizinkan salin otomatis. Salin link dari kolom di bawah.'); }
  }, [receiverLocationLink?.url]);

  return {
    register, watch, setValue, getValues, reset, mode, onFormChange, onSubmit, config, api,
    calendarDays, calendarMonth, chargeableWeight, clearCustomerOrderDraft, copyReceiverLocationLink,
    draftRestoredAt, dropoff_address, dropoff_location, errors, formatDateLabel, has_insurance,
    isDatePickerOpen, isLoadingServices, isTimePickerOpen, loadServices, onDemandServices,
    pickupTimeOptions, pickup_address, pickup_location, receiverLocationBusy, receiverLocationLink,
    receiverLocationMessage, scanRequired, schedule_type, scheduledDate, scheduledTime, selectedService,
    selectedTier, serviceLoadError, submitWithServiceRules, volumetricWeight, dimensions_scanned,
    setIsDatePickerOpen, setIsTimePickerOpen, setCalendarMonth, pickScheduledDate, pickScheduledTime,
    todayDate, formatDateValue, setDraftRestoredAt, refreshReceiverLocationRequest, createReceiverLocationRequest,
    service_code, size_tier,
    isScanOpen, setIsScanOpen,
  };
}
