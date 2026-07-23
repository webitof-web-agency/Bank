import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, ExternalLink, MapPin, Paperclip, Palette, PencilLine, Plus, Sparkles, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../api/api';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Modal } from '../../components/ui/Modal';
import { PageHeader } from '../../components/ui/PageHeader';
import { Input, Textarea } from '../../components/ui/Input';
import { cn } from '../../lib/cn';

const STORAGE_KEY = 'webitofCalendarEventsV1';

const COLOR_OPTIONS = [
  { label: 'Blue', value: '#2563eb' },
  { label: 'Emerald', value: '#059669' },
  { label: 'Amber', value: '#d97706' },
  { label: 'Rose', value: '#e11d48' },
  { label: 'Violet', value: '#7c3aed' },
  { label: 'Slate', value: '#475569' }
];

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function pad(value) {
  return String(value).padStart(2, '0');
}

function formatDateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseDateKey(value) {
  if (!value) return null;
  const [year, month, day] = String(value).split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date, amount) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function isSameDay(left, right) {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();
}

function toMondayIndex(date) {
  return (date.getDay() + 6) % 7;
}

function hexToRgba(hex, alpha = 1) {
  const normalized = String(hex || '#2563eb').replace('#', '');
  const expanded = normalized.length === 3
    ? normalized.split('').map((char) => `${char}${char}`).join('')
    : normalized.padEnd(6, '0').slice(0, 6);
  const red = parseInt(expanded.slice(0, 2), 16);
  const green = parseInt(expanded.slice(2, 4), 16);
  const blue = parseInt(expanded.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function createEventId() {
  return `event_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

function createEmptyForm(date = formatDateKey(new Date()), attachments = []) {
  return {
    title: '',
    date,
    time: '',
    color: COLOR_OPTIONS[0].value,
    notes: '',
    attachments
  };
}

function normalizeAttachment(file) {
  const fileId = String(file?.fileId || file?.id || '');
  if (!fileId) return null;

  return {
    id: fileId,
    fileId,
    originalName: file.originalName || file.name || 'Attachment',
    viewUrl: file.viewUrl || '',
    mimeType: file.mimeType || '',
    sizeBytes: Number(file.sizeBytes || file.size || 0),
    uploadedAt: file.uploadedAt || file.createdAt || new Date().toISOString()
  };
}

function formatFileSize(sizeBytes) {
  const size = Number(sizeBytes || 0);
  if (size <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
  const value = size / (1024 ** index);
  return `${value >= 10 || index === 0 ? Math.round(value) : value.toFixed(1)} ${units[index]}`;
}

function loadEvents() {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveEvents(events) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
}

function getMonthLabel(date) {
  return new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(date);
}

function getDayLabel(value) {
  const date = parseDateKey(value);
  if (!date) return 'Select a date';
  return new Intl.DateTimeFormat('en', { weekday: 'long', month: 'short', day: 'numeric' }).format(date);
}

function sortEvents(items) {
  return [...items].sort((left, right) => {
    const lDate = left?.date || '';
    const rDate = right?.date || '';
    if (lDate !== rDate) return lDate.localeCompare(rDate);
    const leftTime = left?.time || '99:99';
    const rightTime = right?.time || '99:99';
    return leftTime.localeCompare(rightTime);
  });
}

function buildMonthGrid(monthDate) {
  const firstDay = startOfMonth(monthDate);
  const daysOffset = toMondayIndex(firstDay);
  const gridStart = new Date(firstDay);
  gridStart.setDate(firstDay.getDate() - daysOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const current = new Date(gridStart);
    current.setDate(gridStart.getDate() + index);
    return {
      date: current,
      key: formatDateKey(current),
      inMonth: current.getMonth() === monthDate.getMonth()
    };
  });
}

function getColorMeta(color) {
  return COLOR_OPTIONS.find((item) => item.value.toLowerCase() === String(color || '').toLowerCase()) || COLOR_OPTIONS[0];
}

function EventColorPicker({ value, onChange }) {
  return (
    <div className="flex flex-wrap gap-3 mt-2">
      {COLOR_OPTIONS.map((color) => {
        const active = String(value).toLowerCase() === color.value.toLowerCase();

        return (
          <button
            key={color.value}
            type="button"
            onClick={() => onChange(color.value)}
            className="h-8 w-8 rounded-full transition-all hover:scale-110"
            style={{ 
              backgroundColor: color.value,
              outline: active ? `2px solid ${color.value}` : '2px solid transparent',
              outlineOffset: '2px',
              boxShadow: `inset 0 0 0 1px ${hexToRgba(color.value, 0.2)}`
            }}
            title={color.label}
          />
        );
      })}
    </div>
  );
}

export function CalendarPage() {
  const { token } = useAuth();
  const attachmentInputRef = useRef(null);
  const draftEventIdRef = useRef(createEventId());
  const originalAttachmentIdsRef = useRef([]);
  const [events, setEvents] = useState(() => loadEvents());
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState(() => formatDateKey(new Date()));
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [uploadingAttachments, setUploadingAttachments] = useState(false);
  const [form, setForm] = useState(() => createEmptyForm(formatDateKey(new Date())));

  useEffect(() => {
    saveEvents(events);
  }, [events]);

  const today = useMemo(() => new Date(), []);
  const monthGrid = useMemo(() => buildMonthGrid(currentMonth), [currentMonth]);
  const eventsByDate = useMemo(() => {
    return events.reduce((acc, item) => {
      if (!item || !item.date) return acc;
      if (!acc[item.date]) acc[item.date] = [];
      acc[item.date].push(item);
      return acc;
    }, {});
  }, [events]);
  const monthEvents = useMemo(
    () => sortEvents(events.filter((event) => event?.date?.startsWith(`${currentMonth.getFullYear()}-${pad(currentMonth.getMonth() + 1)}`))),
    [currentMonth, events]
  );
  const selectedEvents = useMemo(
    () => sortEvents(eventsByDate[selectedDate] || []),
    [eventsByDate, selectedDate]
  );
  const upcomingEvents = useMemo(
    () => sortEvents(events).filter((event) => event?.date && event.date >= formatDateKey(today)).slice(0, 6),
    [events, today]
  );

  function openNewEvent(prefillDate = selectedDate) {
    const draftId = createEventId();
    draftEventIdRef.current = draftId;
    originalAttachmentIdsRef.current = [];
    setEditingId(null);
    setForm(createEmptyForm(prefillDate || formatDateKey(today), []));
    setUploadingAttachments(false);
    setIsModalOpen(true);
  }

  function openEditEvent(item) {
    const attachments = Array.isArray(item.attachments)
      ? item.attachments.map(normalizeAttachment).filter(Boolean)
      : [];
    draftEventIdRef.current = item.id;
    originalAttachmentIdsRef.current = attachments.map((attachment) => String(attachment.fileId || attachment.id || ''));
    setEditingId(item.id);
    setForm({
      title: item.title || '',
      date: item.date || formatDateKey(today),
      time: item.time || '',
      color: item.color || COLOR_OPTIONS[0].value,
      notes: item.notes || '',
      attachments
    });
    setUploadingAttachments(false);
    setIsModalOpen(true);
  }

  function handleMonthChange(amount) {
    const nextMonth = addMonths(currentMonth, amount);
    setCurrentMonth(nextMonth);
    setSelectedDate(formatDateKey(nextMonth));
  }

  function handleToday() {
    const nextToday = new Date();
    setCurrentMonth(startOfMonth(nextToday));
    setSelectedDate(formatDateKey(nextToday));
  }

  async function handleAttachmentSelect(event) {
    const selectedFiles = Array.from(event.target.files || []);
    event.target.value = '';

    if (!selectedFiles.length) return;
    if (!token) {
      toast.error('Please sign in again to upload attachments');
      return;
    }

    setUploadingAttachments(true);

    try {
      const draftId = draftEventIdRef.current || editingId || createEventId();
      draftEventIdRef.current = draftId;

      const formData = new FormData();
      selectedFiles.forEach((file) => {
        formData.append('file', file);
      });
      formData.append('moduleName', 'calendar');
      formData.append('entityId', draftId);
      formData.append('documentType', 'calendar-attachment');
      formData.append('isPublic', 'true');

      const response = await api.files.upload(token, formData);
      const uploaded = Array.isArray(response.data) ? response.data : [];
      const normalized = uploaded.map(normalizeAttachment).filter(Boolean);

      if (!normalized.length) {
        throw new Error('Attachment upload failed');
      }

      setForm((current) => ({
        ...current,
        attachments: [...(current.attachments || []), ...normalized]
      }));
      toast.success(`${normalized.length} attachment${normalized.length === 1 ? '' : 's'} uploaded`);
    } catch (error) {
      toast.error(error.message || 'Unable to upload attachments');
    } finally {
      setUploadingAttachments(false);
    }
  }

  async function handleAttachmentRemove(attachment) {
    const fileId = String(attachment?.fileId || attachment?.id || '');
    if (!fileId) return;

    try {
      if (token) {
        await api.files.remove(token, fileId);
      }
      setForm((current) => ({
        ...current,
        attachments: (current.attachments || []).filter((item) => String(item.fileId || item.id || '') !== fileId)
      }));
      toast.success('Attachment removed');
    } catch (error) {
      toast.error(error.message || 'Unable to remove attachment');
    }
  }

  async function cleanupDraftAttachments() {
    if (!token) return;

    const originalIds = new Set((originalAttachmentIdsRef.current || []).map(String));
    const extraAttachments = (form.attachments || []).filter((attachment) => {
      const fileId = String(attachment?.fileId || attachment?.id || '');
      return fileId && !originalIds.has(fileId);
    });

    if (!extraAttachments.length) return;
    await Promise.allSettled(extraAttachments.map((attachment) => api.files.remove(token, attachment.fileId || attachment.id)));
  }

  async function closeModal({ discardDraft = true } = {}) {
    if (discardDraft) {
      void cleanupDraftAttachments();
    }
    setIsModalOpen(false);
    setEditingId(null);
    setUploadingAttachments(false);
  }

  async function handleSave(event) {
    event.preventDefault();

    if (!form.title.trim()) {
      toast.error('Event title is required');
      return;
    }

    if (!form.date) {
      toast.error('Event date is required');
      return;
    }

    const eventId = editingId || draftEventIdRef.current || createEventId();
    const payload = {
      id: eventId,
      title: form.title.trim(),
      date: form.date,
      time: form.time,
      color: form.color,
      notes: form.notes.trim(),
      attachments: (form.attachments || []).map(normalizeAttachment).filter(Boolean)
    };

    setEvents((current) => {
      if (editingId) {
        return sortEvents(current.map((item) => (item.id === editingId ? payload : item)));
      }

      return sortEvents([...current, payload]);
    });

    setSelectedDate(form.date);
    setCurrentMonth(startOfMonth(parseDateKey(form.date) || today));
    originalAttachmentIdsRef.current = payload.attachments.map((attachment) => String(attachment.fileId || attachment.id || ''));
    setIsModalOpen(false);
    setEditingId(null);
    setUploadingAttachments(false);
    toast.success(editingId ? 'Event updated' : 'Event added');
  }

  async function handleDelete(eventId) {
    const currentRecord = events.find((item) => String(item.id) === String(eventId));
    const attachmentIds = Array.isArray(currentRecord?.attachments)
      ? currentRecord.attachments.map((attachment) => String(attachment.fileId || attachment.id || '')).filter(Boolean)
      : [];

    if (token && attachmentIds.length) {
      await Promise.allSettled(attachmentIds.map((fileId) => api.files.remove(token, fileId)));
    }

    setEvents((current) => current.filter((item) => item.id !== eventId));
    setIsModalOpen(false);
    setEditingId(null);
    setUploadingAttachments(false);
    toast.success('Event removed');
  }

  const selectedDateCount = selectedEvents.length;
  const monthEventCount = monthEvents.length;
  const nextEvent = upcomingEvents[0];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Event calendar"
        meta={(
          <div className="flex flex-wrap gap-2 text-[12px]">
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 font-semibold text-slate-600">This month {monthEventCount}</span>
            <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 font-semibold text-blue-700">Selected day {selectedDateCount}</span>
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 font-semibold text-emerald-700">{getDayLabel(selectedDate)}</span>
          </div>
        )}
        actions={[
          {
            label: 'Today',
            variant: 'outline',
            icon: CalendarDays,
            onClick: handleToday
          },
          {
            label: 'Add Event',
            variant: 'primary',
            icon: Plus,
            onClick: () => openNewEvent()
          }
        ]}
      />



      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.85fr)]">
        <Card className="rounded-[var(--radius-card,1.75rem)] border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-2 pb-4">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-button,14px)] bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] text-[var(--primary,#1661F6)]">
                <CalendarDays size={20} />
              </span>
              <h2 className="text-xl font-bold text-slate-900">{getMonthLabel(currentMonth)}</h2>
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => handleMonthChange(-1)}>
                <ChevronLeft size={15} />
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={handleToday}>
                Today
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => handleMonthChange(1)}>
                <ChevronRight size={15} />
              </Button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-7 gap-2 px-1">
            {WEEKDAYS.map((day) => (
              <div key={day} className="px-2 py-1 text-center text-[13px] font-semibold text-slate-500">
                {day}
              </div>
            ))}

            {monthGrid.map((cell) => {
              const dayEvents = eventsByDate[cell.key] || [];
              const isToday = isSameDay(cell.date, today);
              const isSelected = cell.key === selectedDate;

              return (
                <button
                  key={cell.key}
                  type="button"
                  onClick={() => setSelectedDate(cell.key)}
                  className={cn(
                    'min-h-[7.5rem] rounded-2xl border p-2 text-left transition-all duration-200',
                    cell.inMonth 
                      ? 'border-slate-200 bg-white hover:-translate-y-0.5 hover:border-[var(--primary)] hover:bg-[color-mix(in_srgb,var(--primary)_4%,transparent)] hover:shadow-sm' 
                      : 'border-dashed border-slate-100 bg-slate-50/60 text-slate-300',
                    isSelected && cell.inMonth && 'border-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_6%,transparent)] shadow-sm ring-1 ring-[var(--primary)]',
                    isToday && 'ring-2 ring-[var(--primary)] ring-offset-1'
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className={cn('text-sm font-semibold', cell.inMonth ? 'text-slate-900' : 'text-slate-300')}>
                      {cell.date.getDate()}
                    </span>
                    {dayEvents.length ? (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                        {dayEvents.length}
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-2 space-y-1.5">
                    {dayEvents.slice(0, 2).map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center gap-2 rounded-xl px-2 py-1 text-[12px] font-medium"
                        style={{ backgroundColor: hexToRgba(item.color, 0.12), color: item.color }}
                        onClick={(e) => {
                          e.stopPropagation();
                          openEditEvent(item);
                        }}
                      >
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                        <span className="truncate">{item.title}</span>
                      </div>
                    ))}
                    {dayEvents.length > 2 ? (
                      <p className="px-2 text-[11px] font-medium text-slate-400">+{dayEvents.length - 2} more</p>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        </Card>

        <div className="space-y-6">
          <Card className="rounded-[var(--radius-card,1.75rem)] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-button,12px)] bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] text-[var(--primary,#1661F6)]">
                  <Clock3 size={18} />
                </span>
                <h3 className="text-lg font-bold text-slate-900">{getDayLabel(selectedDate)}</h3>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => openNewEvent(selectedDate)}>
                <Plus size={15} />
                Add
              </Button>
            </div>

            <div className="mt-4 space-y-3">
              {selectedEvents.length ? selectedEvents.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => openEditEvent(item)}
                  className="group flex w-full items-start gap-3 rounded-[var(--radius-button,1rem)] border border-slate-100 bg-slate-50/50 p-3 text-left transition-all duration-300 hover:-translate-y-0.5 hover:border-slate-200 hover:bg-white hover:shadow-md"
                >
                  <span
                    className="mt-1 h-3.5 w-3.5 shrink-0 rounded-full shadow-sm group-hover:scale-110 transition-transform"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-3">
                      <span className="truncate text-sm font-semibold text-slate-900">{item.title}</span>
                      {item.time ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-500">
                          <Clock3 size={11} />
                          {item.time}
                        </span>
                      ) : null}
                    </span>
                    {item.notes ? <span className="mt-1 block line-clamp-2 text-[12px] leading-5 text-slate-500">{item.notes}</span> : null}
                  </span>
                </button>
              )) : (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-5 text-center">
                  <CalendarDays className="mx-auto text-slate-300" size={28} />
                  <p className="mt-3 text-sm font-medium text-slate-700">No events on this day</p>
                  <p className="mt-1 text-sm text-slate-500">Add a quick event from the button above.</p>
                </div>
              )}
            </div>
          </Card>

          <Card className="rounded-[var(--radius-card,1.75rem)] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-button,12px)] bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] text-[var(--primary,#1661F6)]">
                  <Sparkles size={18} />
                </span>
                <h3 className="text-lg font-bold text-slate-900">Next few events</h3>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {upcomingEvents.length ? upcomingEvents.map((item) => {
                const colorMeta = getColorMeta(item.color);
                return (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => openEditEvent(item)}
                    className="group flex w-full items-start gap-3 rounded-[var(--radius-button,1rem)] border border-slate-100 bg-white p-3 text-left transition-all duration-300 hover:-translate-y-0.5 hover:border-slate-200 hover:bg-slate-50 hover:shadow-md"
                  >
                    <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-button,1rem)] shadow-sm transition-transform group-hover:scale-105" style={{ backgroundColor: hexToRgba(colorMeta.value, 0.12), color: colorMeta.value }}>
                      <Palette size={16} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-3">
                        <span className="truncate text-sm font-semibold text-slate-900">{item.title}</span>
                        <span className="text-[11px] font-semibold text-slate-400">
                          {new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(parseDateKey(item.date))}
                        </span>
                      </span>
                      <span className="mt-1 flex items-center gap-2 text-[12px] text-slate-500">
                        <MapPin size={12} className="text-slate-400" />
                        {item.time ? `Time ${item.time}` : 'All day'}
                      </span>
                    </span>
                  </button>
                );
              }) : (
                <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-6 text-center text-sm text-slate-500">
                  No upcoming events yet.
                </p>
              )}
            </div>
          </Card>
        </div>
      </div>

      <Modal
        open={isModalOpen}
        onClose={() => {
          void closeModal();
        }}
        title={editingId ? 'Edit event' : 'Add event'}
        width="min(760px, 96vw)"
        footer={(
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {editingId ? (
                <Button type="button" variant="destructive" onClick={() => void handleDelete(editingId)}>
                  <Trash2 size={16} />
                  Delete
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  void closeModal();
                }}
              >
                Cancel
              </Button>
              <Button type="submit" form="calendar-event-form">
                <PencilLine size={16} />
                {editingId ? 'Update event' : 'Save event'}
              </Button>
            </div>
          </div>
        )}
      >
        <form id="calendar-event-form" className="space-y-5" onSubmit={handleSave}>
          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Event title</label>
              <Input
                value={form.title}
                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                placeholder="Client meeting"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Event date</label>
              <Input
                type="date"
                value={form.date}
                onChange={(event) => {
                  setForm((current) => ({ ...current, date: event.target.value }));
                  setSelectedDate(event.target.value);
                }}
              />
            </div>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Time</label>
              <Input
                type="time"
                value={form.time}
                onChange={(event) => setForm((current) => ({ ...current, time: event.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Color</label>
              <EventColorPicker
                value={form.color}
                onChange={(value) => setForm((current) => ({ ...current, color: value }))}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Notes</label>
            <Textarea
              value={form.notes}
              onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
              placeholder="Optional details, follow-up points, location, etc."
              rows={4}
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <label className="text-sm font-medium text-slate-700">Attachments</label>
            </div>

            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-4">
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => attachmentInputRef.current?.click()}
                  disabled={uploadingAttachments}
                >
                  <Upload size={15} />
                  {uploadingAttachments ? 'Uploading...' : 'Add attachment'}
                </Button>
              </div>

              <input
                ref={attachmentInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(event) => {
                  void handleAttachmentSelect(event);
                }}
              />

              {form.attachments?.length ? (
                <div className="mt-4 space-y-2">
                  {form.attachments.map((attachment) => {
                    const fileId = String(attachment.fileId || attachment.id || '');
                    return (
                      <div key={fileId} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                        <div className="min-w-0 flex items-center gap-3">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                            <Paperclip size={16} />
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-900">{attachment.originalName}</p>
                            <p className="text-xs text-slate-500">
                              {formatFileSize(attachment.sizeBytes)}
                              {attachment.uploadedAt ? ` • ${new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(attachment.uploadedAt))}` : ''}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => window.open(attachment.viewUrl || api.files.viewUrl(fileId), '_blank', 'noopener,noreferrer')}
                          >
                            <ExternalLink size={14} />
                            Open
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => void handleAttachmentRemove(attachment)}
                          >
                            <Trash2 size={14} />
                            Remove
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default CalendarPage;
