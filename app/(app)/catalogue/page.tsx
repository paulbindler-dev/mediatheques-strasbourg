'use client'
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { SlidersHorizontal, Eye, EyeOff } from 'lucide-react'
import {
  DndContext, closestCenter, PointerSensor, TouchSensor,
  useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy,
  useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { CatalogueItem } from '@/app/api/catalogue/search/route'
import CoverImg from '@/components/CoverImg'
import { ViewModeToggle, type ViewMode, TYPE_CONFIG, typeBadge } from '@/components/ViewModeToggle'
import { loadStore, saveStore, addItem, addCustomList, libraryLabel, type LibraryKey } from '@/lib/wishlists'

const LIST_ICONS = ['🎮', '🕹️', '🎬', '🎥', '📚', '📖', '🎵', '🎭', '⭐', '❤️', '🔖', '🎯']

type FilterPreset = {
  id: string
  label: string
  icon: string
  type: string
  subject: string
  query: string
  custom?: boolean
  hidden?: boolean
}

type PresetsState = { hiddenIds: string[]; orderedIds: string[] }
const PRESETS_STATE_KEY = 'catalogue_presets_state'
function loadPresetsState(): PresetsState {
  try { return { hiddenIds: [], orderedIds: [], ...JSON.parse(localStorage.getItem(PRESETS_STATE_KEY) ?? '{}') } }
  catch { return { hiddenIds: [], orderedIds: [] } }
}
function savePresetsState(s: PresetsState): void {
  localStorage.setItem(PRESETS_STATE_KEY, JSON.stringify(s))
}

const BUILTIN_PRESETS: FilterPreset[] = [
  { id: 'all',      label: 'Tout',          icon: '🔍', type: '',          subject: '',    query: '' },
  { id: 'ps5',      label: 'PS5',           icon: '🎮', type: 'Jeu vidéo', subject: 'PS5', query: '' },
  { id: 'ps4',      label: 'PS4',           icon: '🕹️', type: 'Jeu vidéo', subject: 'PS4', query: '' },
  { id: 'switch',   label: 'Switch',        icon: '🎯', type: 'Jeu vidéo', subject: 'Nintendo Switch', query: '' },
  { id: 'bluray',   label: 'Blu-ray',       icon: '🎬', type: 'Vidéo',     subject: '',    query: 'blu-ray' },
  { id: 'films',    label: 'Films',         icon: '🎥', type: 'Vidéo',     subject: '',    query: '' },
  { id: 'series',   label: 'Séries',        icon: '📺', type: 'Vidéo',     subject: '',    query: 'série' },
  { id: 'bd',       label: 'BD',            icon: '📚', type: 'BD ou manga', subject: '', query: '' },
  { id: 'livres',   label: 'Livres',        icon: '📖', type: 'Livre',     subject: '',    query: '' },
  { id: 'musique',  label: 'Musique',       icon: '🎵', type: 'Musique',   subject: '',    query: '' },
  { id: 'audio',    label: 'Livres audio',  icon: '🎧', type: 'Livre audio numérique', subject: '', query: '' },
]

const LIBRARY_OPTIONS: { key: LibraryKey; label: string }[] = [
  { key: 'malraux_neudorf', label: 'Malraux + Neudorf' },
  { key: 'malraux',         label: 'André Malraux' },
  { key: 'neudorf',         label: 'Neudorf' },
  { key: 'all',             label: 'Tout le réseau' },
]

const LIBRARY_PARAM: Record<LibraryKey, string> = {
  malraux_neudorf: 'malraux_neudorf',
  malraux: 'Médiathèque André Malraux',
  neudorf: 'Médiathèque Neudorf',
  all: '',
}

function relevanceScore(title: string, q: string): number {
  if (!q) return 0
  const t = title.toLowerCase()
  const s = q.toLowerCase().trim()
  if (t === s) return 3
  if (t.startsWith(s)) return 2
  if (t.includes(s)) return 1
  return 0
}

type CatalogueCloudPrefs = {
  presetsState: PresetsState
  customPresets: FilterPreset[]
  library: LibraryKey
}

const CUSTOM_PRESETS_KEY = 'catalogue_custom_presets'

function loadCustomPresets(): FilterPreset[] {
  try { return JSON.parse(localStorage.getItem(CUSTOM_PRESETS_KEY) ?? '[]') } catch { return [] }
}
function saveCustomPresets(p: FilterPreset[]): void {
  localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(p))
}

const DragHandle = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ display: 'block' }}>
    {[0, 1, 2].map(row => [0, 1].map(col => (
      <circle key={`${row}-${col}`} cx={4 + col * 8} cy={4 + row * 4} r={1.5} fill="currentColor" />
    )))}
  </svg>
)

type SortablePresetRowProps = {
  preset: FilterPreset & { hidden?: boolean }
  onToggleVisibility: () => void
  onDelete?: () => void
}

function SortablePresetRow({ preset, onToggleVisibility, onDelete }: SortablePresetRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: preset.id })
  return (
    <div
      ref={setNodeRef}
      style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '10px 8px', borderRadius: 'var(--radius-sm)',
        opacity: isDragging ? 0.5 : preset.hidden ? 0.4 : 1,
        transition: `opacity 0.15s, ${transition ?? ''}`,
        transform: CSS.Transform.toString(transform),
        zIndex: isDragging ? 1 : undefined,
        background: isDragging ? 'var(--bg)' : undefined,
      }}
    >
      <button
        onClick={onToggleVisibility}
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', flexShrink: 0, color: preset.hidden ? 'var(--text-2)' : 'var(--navy)', display: 'flex', alignItems: 'center' }}
      >
        {preset.hidden ? <EyeOff size={16} strokeWidth={2} /> : <Eye size={16} strokeWidth={2} />}
      </button>
      <span style={{ fontSize: '16px', flexShrink: 0 }}>{preset.icon}</span>
      <span style={{ flex: 1, fontSize: '13px', fontWeight: 600, color: 'var(--color-heading)' }}>{preset.label}</span>
      <button
        {...attributes}
        {...listeners}
        style={{ background: 'none', border: 'none', cursor: 'grab', padding: '6px', color: 'var(--text-2)', display: 'flex', alignItems: 'center', flexShrink: 0, touchAction: 'none' }}
      >
        <DragHandle />
      </button>
      {onDelete ? (
        <button
          onClick={onDelete}
          style={{ width: '28px', height: '28px', borderRadius: '6px', background: 'var(--error-bg)', border: 'none', cursor: 'pointer', color: 'var(--red)', fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          title="Supprimer"
        >×</button>
      ) : (
        <div style={{ width: '28px' }} />
      )}
    </div>
  )
}

export default function CataloguePage() {
  const [preset, setPreset] = useState<string>('all')
  const [customPresets, setCustomPresets] = useState<FilterPreset[]>([])
  const [input, setInput] = useState('')
  const [query, setQuery] = useState('')
  const [library, setLibrary] = useState<LibraryKey>('malraux_neudorf')
  const [results, setResults] = useState<CatalogueItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const [addToast, setAddToast] = useState<string | null>(null)
  const [showAddModal, setShowAddModal] = useState<CatalogueItem | null>(null)
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [newPresetName, setNewPresetName] = useState('')
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [showManagePresets, setShowManagePresets] = useState(false)
  const [presetsState, setPresetsState] = useState<PresetsState>({ hiddenIds: [], orderedIds: [] })
  const [viewMode, setViewMode] = useState<ViewMode>('dots')
  const [inListTitles, setInListTitles] = useState<Set<string>>(() => {
    const s = loadStore()
    return new Set(s.lists.flatMap(l => l.items.map(i => i.title.toLowerCase())))
  })
  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  )
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cloudSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cloudLoaded = useRef(false)
  const cataloguePrefsRef = useRef<CatalogueCloudPrefs>({ presetsState: { hiddenIds: [], orderedIds: [] }, customPresets: [], library: 'malraux_neudorf' })
  const PAGE_SIZE = 20

  const orderedPresets = useMemo(() => {
    const hiddenSet = new Set(presetsState.hiddenIds)
    const all: FilterPreset[] = [...BUILTIN_PRESETS, ...customPresets].map(p => ({ ...p, hidden: hiddenSet.has(p.id) }))
    if (presetsState.orderedIds.length > 0) {
      all.sort((a, b) => {
        const ai = presetsState.orderedIds.indexOf(a.id)
        const bi = presetsState.orderedIds.indexOf(b.id)
        if (ai === -1 && bi === -1) return 0
        if (ai === -1) return 1
        if (bi === -1) return -1
        return ai - bi
      })
    }
    return all
  }, [customPresets, presetsState])

  const currentPreset = orderedPresets.find(p => p.id === preset) ?? BUILTIN_PRESETS[0]

  function mutatePresetsState(updater: (s: PresetsState) => PresetsState) {
    setPresetsState(prev => { const next = updater(prev); savePresetsState(next); return next })
    scheduleCloudSave()
  }

  function togglePresetVisibility(id: string) {
    mutatePresetsState(s => ({
      ...s,
      hiddenIds: s.hiddenIds.includes(id) ? s.hiddenIds.filter(x => x !== id) : [...s.hiddenIds, id],
    }))
  }

  function reorderPresets(activeId: string, overId: string) {
    mutatePresetsState(s => {
      const ids = s.orderedIds.length > 0 ? [...s.orderedIds] : orderedPresets.map(p => p.id)
      const from = ids.indexOf(activeId)
      const to = ids.indexOf(overId)
      if (from === -1 || to === -1) return s
      return { ...s, orderedIds: arrayMove(ids, from, to) }
    })
  }

  useEffect(() => {
    cataloguePrefsRef.current = { presetsState, customPresets, library }
  }, [presetsState, customPresets, library])

  function scheduleCloudSave() {
    if (!cloudLoaded.current) return
    if (cloudSaveTimer.current) clearTimeout(cloudSaveTimer.current)
    cloudSaveTimer.current = setTimeout(() => {
      fetch('/api/catalogue-prefs', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefs: cataloguePrefsRef.current }),
      }).catch(() => {})
    }, 200)
  }

  const VIEW_CYCLE: ViewMode[] = ['dots', 'list', 'grid2', 'grid3']

  useEffect(() => {
    const saved = localStorage.getItem('catalogue_view_mode')
    if (saved === 'icons' || saved === 'images') setViewMode('list')
    else if (['dots', 'list', 'grid2', 'grid3'].includes(saved ?? '')) setViewMode(saved as ViewMode)
    const savedSearch = localStorage.getItem('catalogue_search_state')
    if (savedSearch) {
      try {
        const { input: si, preset: sp } = JSON.parse(savedSearch) as { input?: string; preset?: string }
        if (si) setInput(si)
        if (sp) setPreset(sp)
      } catch { /* ignore */ }
    }
  }, [])

  useEffect(() => {
    localStorage.setItem('catalogue_search_state', JSON.stringify({ input, preset }))
  }, [input, preset])

  useEffect(() => {
    localStorage.setItem('catalogue_view_mode', viewMode)
  }, [viewMode])

  useEffect(() => {
    const localPresetsState = loadPresetsState()
    const localCustomPresets = loadCustomPresets()
    setPresetsState(localPresetsState)
    setCustomPresets(localCustomPresets)
    const store = loadStore()
    setLibrary(store.defaultLibrary)

    fetch('/api/catalogue-prefs')
      .then(r => r.json())
      .then((data: { prefs?: CatalogueCloudPrefs }) => {
        if (data.prefs) {
          const p = data.prefs
          if (p.presetsState) { setPresetsState(p.presetsState); savePresetsState(p.presetsState) }
          if (p.customPresets?.length) { setCustomPresets(p.customPresets); saveCustomPresets(p.customPresets) }
          if (p.library) setLibrary(p.library)
        }
      })
      .catch(() => {})
      .finally(() => { cloudLoaded.current = true })
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setQuery(input), 350)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [input])

  useEffect(() => { setPage(0); setResults([]) }, [preset, library])

  useEffect(() => {
    const hasFilter = currentPreset.type || currentPreset.subject || currentPreset.query
    if (!query && !hasFilter) { setResults([]); setTotal(0); return }

    setLoading(true)
    setError(null)

    const params = new URLSearchParams({
      q: query,
      type: currentPreset.type,
      subject: currentPreset.subject,
      query: currentPreset.query,
      location: LIBRARY_PARAM[library],
      page: String(page),
      size: String(PAGE_SIZE),
    })

    fetch(`/api/catalogue/search?${params}`)
      .then(r => r.json())
      .then((data: { error?: string; results?: CatalogueItem[]; total?: number }) => {
        if (data.error) { setError(data.error); setLoading(false); return }
        const raw = data.results ?? []
        const sorted = query
          ? [...raw].sort((a, b) => relevanceScore(b.title, query) - relevanceScore(a.title, query))
          : raw
        if (page === 0) setResults(sorted)
        else setResults(prev => [...prev, ...sorted])
        setTotal(data.total ?? 0)
        setLoading(false)
      })
      .catch(e => { setError(String(e)); setLoading(false) })
  }, [query, preset, library, page]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleAddToList = useCallback((item: CatalogueItem, listId: string) => {
    const store = loadStore()
    const updated = addItem(store, listId, item.title)
    saveStore(updated)
    setInListTitles(prev => new Set([...prev, item.title.toLowerCase()]))
    setAddToast(`"${item.title}" ajouté`)
    setTimeout(() => setAddToast(null), 2500)
    setShowAddModal(null)
  }, [])

  function saveCurrentAsPreset() {
    const name = newPresetName.trim()
    if (!name) return
    const newP: FilterPreset = {
      id: `custom_${Date.now()}`,
      label: name,
      icon: '⭐',
      type: currentPreset.type,
      subject: currentPreset.subject,
      query: currentPreset.query,
      custom: true,
    }
    const updated = [...customPresets, newP]
    setCustomPresets(updated)
    saveCustomPresets(updated)
    setPreset(newP.id)
    setShowSaveModal(false)
    setNewPresetName('')
    scheduleCloudSave()
  }

  function deleteCustomPreset(id: string) {
    const updated = customPresets.filter(p => p.id !== id)
    setCustomPresets(updated)
    saveCustomPresets(updated)
    mutatePresetsState(s => ({
      hiddenIds: s.hiddenIds.filter(x => x !== id),
      orderedIds: s.orderedIds.filter(x => x !== id),
    }))
    if (preset === id) setPreset('all')
    setDeleteConfirmId(null)
  }

  const hasMore = results.length < total && results.length > 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* Lightweight header: title + library selector */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 18px 14px',
        background: 'var(--surface)',
        borderBottom: '0.5px solid var(--border)',
        flexShrink: 0,
      }}>
        <div
          onClick={() => setViewMode(m => VIEW_CYCLE[(VIEW_CYCLE.indexOf(m) + 1) % VIEW_CYCLE.length])}
          style={{ fontSize: '22px', fontWeight: 800, color: 'var(--color-heading)', letterSpacing: '-0.5px', fontFamily: 'DM Sans, sans-serif', cursor: 'pointer', userSelect: 'none' }}
        >
          Catalogue
        </div>
        <select
          value={library}
          onChange={e => { setLibrary(e.target.value as LibraryKey); scheduleCloudSave() }}
          style={{
            fontSize: '11px', fontWeight: 600,
            padding: '5px 10px',
            borderRadius: '20px',
            border: '1.5px solid var(--border)',
            background: 'var(--tab-inactive-bg)',
            color: 'var(--text-2)',
            cursor: 'pointer',
            fontFamily: 'DM Sans, sans-serif',
            outline: 'none',
          }}
        >
          {LIBRARY_OPTIONS.map(o => (
            <option key={o.key} value={o.key}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Top zone: filter pills + search */}
      <div style={{
        flexShrink: 0,
        background: 'var(--surface)',
        borderBottom: '0.5px solid var(--border)',
      }}>
        {/* Filter pills */}
        <div
          data-hscroll
          style={{ display: 'flex', gap: '6px', overflowX: 'auto', padding: '10px 16px 0', scrollbarWidth: 'none' }}
        >
          <button
            onClick={() => setShowManagePresets(true)}
            style={{
              fontSize: '10.5px', fontWeight: 600, flexShrink: 0,
              padding: '5px 10px', borderRadius: '20px',
              border: '1.5px solid var(--border)',
              background: 'transparent', color: 'var(--text-2)',
              cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
            }}
            title="Gérer les filtres"
          >
            <SlidersHorizontal size={13} strokeWidth={2} />
          </button>
          {orderedPresets.filter(p => !p.hidden).map(p => (
            <button
              key={p.id}
              onClick={() => setPreset(p.id)}
              style={{
                fontSize: '10.5px', fontWeight: 600, flexShrink: 0,
                padding: '5px 12px',
                borderRadius: '20px', border: 'none', cursor: 'pointer',
                whiteSpace: 'nowrap', fontFamily: 'DM Sans, sans-serif',
                background: preset === p.id ? 'var(--navy)' : 'var(--tab-inactive-bg)',
                color: preset === p.id ? 'white' : 'var(--text-2)',
                transition: 'background 0.12s, color 0.12s',
              }}
            >
              {p.label}
            </button>
          ))}
          {(currentPreset.type || currentPreset.subject || currentPreset.query) && !currentPreset.custom && (
            <button
              onClick={() => setShowSaveModal(true)}
              style={{
                fontSize: '10.5px', fontWeight: 600, flexShrink: 0,
                padding: '5px 12px', borderRadius: '20px',
                border: '1.5px dashed var(--border)',
                background: 'transparent', color: 'var(--text-2)',
                cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'DM Sans, sans-serif',
              }}
            >
              + Sauvegarder
            </button>
          )}
        </div>

        {/* Search input */}
        <div style={{ position: 'relative', padding: '8px 16px 12px' }}>
          <span style={{ position: 'absolute', left: '28px', top: '50%', transform: 'translateY(-50%)', fontSize: '14px', pointerEvents: 'none', opacity: 0.45 }}>
            🔍
          </span>
          <input
            type="search"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Titre, auteur, genre…"
            style={{
              width: '100%', padding: '10px 44px 10px 36px',
              borderRadius: 'var(--radius-sm)',
              border: '1.5px solid var(--border)',
              fontSize: '14px',
              background: 'var(--bg)', color: 'var(--text)',
              fontFamily: 'DM Sans, sans-serif', outline: 'none',
              boxSizing: 'border-box',
            }}
          />
          {input && (
            <button
              onClick={() => { setInput(''); setQuery('') }}
              style={{
                position: 'absolute', right: '16px', top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-2)',
                width: '44px', height: '44px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '18px',
              }}
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '14px 16px' }}>
        {error && (
          <div style={{ fontSize: '12px', color: 'var(--text-2)', padding: '12px', background: 'var(--surface)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', fontFamily: 'DM Mono, monospace', marginBottom: '10px' }}>
            {error}
          </div>
        )}

        {!query && !currentPreset.type && !currentPreset.subject && !currentPreset.query && !loading && (
          <div style={{ textAlign: 'center', paddingTop: '48px', color: 'var(--text-2)', fontSize: '13px' }}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>🔍</div>
            Tape un titre ou sélectionne une catégorie
            <div style={{ fontSize: '11px', marginTop: '6px', color: 'var(--text-2)' }}>
              {libraryLabel(library)}
            </div>
          </div>
        )}

        {loading && results.length === 0 && (
          <div style={{ color: 'var(--text-2)', fontSize: '13px', textAlign: 'center', paddingTop: '48px', fontFamily: 'DM Mono, monospace' }}>
            Recherche…
          </div>
        )}

        {!loading && results.length === 0 && (query || currentPreset.type) && !error && (
          <div style={{ textAlign: 'center', paddingTop: '48px', color: 'var(--text-2)', fontSize: '13px' }}>
            Aucun résultat pour {libraryLabel(library)}
          </div>
        )}

        {results.length > 0 && (
          <>
            <div style={{ fontSize: '10px', color: 'var(--text-2)', fontFamily: 'DM Mono, monospace', marginBottom: '10px' }}>
              {total} résultat{total > 1 ? 's' : ''} · {libraryLabel(library)}
            </div>
            <div style={
              viewMode === 'grid2' || viewMode === 'grid3'
                ? { display: 'grid', gridTemplateColumns: viewMode === 'grid3' ? '1fr 1fr 1fr' : '1fr 1fr', gap: viewMode === 'grid3' ? '8px' : '10px', alignItems: 'start' }
                : { display: 'flex', flexDirection: 'column', gap: '8px' }
            }>
              {results.map(item => (
                <CatalogCard
                  key={item.rscId}
                  item={item}
                  onAddToList={() => setShowAddModal(item)}
                  viewMode={viewMode}
                  isInList={inListTitles.has(item.title.toLowerCase())}
                />
              ))}
            </div>
            {hasMore && (
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={loading}
                style={{
                  width: '100%', marginTop: '14px', padding: '12px',
                  background: 'var(--surface)', border: '1.5px solid var(--border)',
                  borderRadius: 'var(--radius-sm)', fontSize: '13px', fontWeight: 600,
                  color: 'var(--text-2)', cursor: loading ? 'wait' : 'pointer',
                  fontFamily: 'DM Sans, sans-serif',
                }}
              >
                {loading ? 'Chargement…' : `Voir plus (${total - results.length} restants)`}
              </button>
            )}
          </>
        )}
      </div>

      {/* Add to list modal */}
      {showAddModal && (
        <AddToListModal
          item={showAddModal}
          onAdd={handleAddToList}
          onClose={() => setShowAddModal(null)}
        />
      )}

      {/* Manage presets modal */}
      {showManagePresets && (
        <div style={{
          position: 'fixed', inset: 0, background: 'var(--overlay)',
          display: 'flex', alignItems: 'flex-end', zIndex: 200,
        }} onClick={() => setShowManagePresets(false)}>
          <div
            style={{ background: 'var(--surface)', width: '100%', borderRadius: '16px 16px 0 0', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 20px 12px' }}>
              <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-heading)' }}>Gérer les filtres</div>
              <button onClick={() => setShowManagePresets(false)}
                style={{ background: 'none', border: 'none', fontSize: '20px', color: 'var(--text-2)', cursor: 'pointer', lineHeight: 1 }}>
                ×
              </button>
            </div>
            <div style={{ padding: '0 20px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-2)' }}>Vue des résultats</span>
              <ViewModeToggle value={viewMode} onChange={setViewMode} />
            </div>
            <div style={{ overflowY: 'auto', padding: '0 12px 24px' }}>
              <DndContext
                sensors={dndSensors}
                collisionDetection={closestCenter}
                onDragEnd={(e: DragEndEvent) => {
                  const { active, over } = e
                  if (over && active.id !== over.id) reorderPresets(String(active.id), String(over.id))
                }}
              >
                <SortableContext items={orderedPresets.map(p => p.id)} strategy={verticalListSortingStrategy}>
                  {orderedPresets.map(p => (
                    <SortablePresetRow
                      key={p.id}
                      preset={p}
                      onToggleVisibility={() => togglePresetVisibility(p.id)}
                      onDelete={p.custom ? () => { setShowManagePresets(false); setDeleteConfirmId(p.id) } : undefined}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            </div>
          </div>
        </div>
      )}

      {/* Delete preset confirmation */}
      {deleteConfirmId && (() => {
        const p = customPresets.find(p => p.id === deleteConfirmId)
        if (!p) return null
        return (
          <div style={{
            position: 'fixed', inset: 0, background: 'var(--overlay)',
            display: 'flex', alignItems: 'flex-end', zIndex: 200,
          }} onClick={() => setDeleteConfirmId(null)}>
            <div
              style={{ background: 'var(--surface)', width: '100%', padding: '24px', borderRadius: '16px 16px 0 0' }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ fontSize: '20px', marginBottom: '8px', textAlign: 'center' }}>{p.icon}</div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-heading)', textAlign: 'center', marginBottom: '20px' }}>
                Supprimer le filtre « {p.label} » ?
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={() => setDeleteConfirmId(null)}
                  style={{
                    flex: 1, padding: '13px', background: 'var(--bg)',
                    border: '1.5px solid var(--border)', borderRadius: 'var(--radius-sm)',
                    fontSize: '14px', fontWeight: 600, color: 'var(--text-2)',
                    cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
                  }}
                >
                  Annuler
                </button>
                <button
                  onClick={() => deleteCustomPreset(deleteConfirmId)}
                  style={{
                    flex: 1, padding: '13px', background: 'var(--red)', color: 'white',
                    border: 'none', borderRadius: 'var(--radius-sm)',
                    fontSize: '14px', fontWeight: 700,
                    cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
                  }}
                >
                  Supprimer
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Save preset modal */}
      {showSaveModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'var(--overlay)',
          display: 'flex', alignItems: 'flex-end', zIndex: 200,
        }} onClick={() => setShowSaveModal(false)}>
          <div
            style={{ background: 'var(--surface)', width: '100%', padding: '24px', borderRadius: '16px 16px 0 0' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-heading)', marginBottom: '12px' }}>
              Sauvegarder ce filtre
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-2)', marginBottom: '12px' }}>
              {[currentPreset.type, currentPreset.subject, currentPreset.query].filter(Boolean).join(' · ')}
            </div>
            <input
              type="text"
              value={newPresetName}
              onChange={e => setNewPresetName(e.target.value)}
              placeholder="Nom du filtre…"
              autoFocus
              onKeyDown={e => e.key === 'Enter' && saveCurrentAsPreset()}
              style={{
                width: '100%', padding: '10px 14px', borderRadius: 'var(--radius-sm)',
                border: '1.5px solid var(--border)', fontSize: '14px',
                background: 'var(--bg)', color: 'var(--text)',
                fontFamily: 'DM Sans, sans-serif', outline: 'none', marginBottom: '12px',
              }}
            />
            <button
              onClick={saveCurrentAsPreset}
              disabled={!newPresetName.trim()}
              style={{
                width: '100%', padding: '12px', background: 'var(--navy)', color: 'white',
                border: 'none', borderRadius: 'var(--radius-sm)', fontSize: '14px',
                fontWeight: 700, cursor: !newPresetName.trim() ? 'not-allowed' : 'pointer',
                opacity: !newPresetName.trim() ? 0.45 : 1, fontFamily: 'DM Sans, sans-serif',
              }}
            >
              Sauvegarder
            </button>
          </div>
        </div>
      )}

      {/* Toast */}
      {addToast && (
        <div style={{
          position: 'fixed', bottom: 'calc(var(--nav-h) + 12px)', left: '50%',
          transform: 'translateX(-50%)',
          background: 'var(--navy)', color: 'white',
          padding: '8px 18px', borderRadius: '20px',
          fontSize: '12px', fontWeight: 600,
          fontFamily: 'DM Sans, sans-serif',
          zIndex: 300, whiteSpace: 'nowrap',
        }}>
          ✓ {addToast}
        </div>
      )}
    </div>
  )
}

function CatalogCard({ item, onAddToList, viewMode, isInList }: { item: CatalogueItem; onAddToList: () => void; viewMode: ViewMode; isInList?: boolean }) {
  const [avail, setAvail] = useState<boolean | null | 'checking'>('checking')
  const [imgFailed, setImgFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/catalogue/holdings?rscId=${encodeURIComponent(item.rscId)}`)
      .then(r => r.json())
      .then((data: { available?: boolean | null }) => {
        if (!cancelled) setAvail(data.available ?? null)
      })
      .catch(() => { if (!cancelled) setAvail(null) })
    return () => { cancelled = true }
  }, [item.rscId])

  const dotColor = avail === true ? 'var(--green)'
    : avail === false ? 'var(--orange)'
    : 'var(--border)'

  const typeConf = TYPE_CONFIG[item.type]
  const typeIcon = typeConf?.emoji ?? '📄'
  const typeLabel = typeBadge(item.type, item.subject ?? '')
  const subtitle = [typeLabel, item.creator, item.year].filter(Boolean).join(' · ')

  if (viewMode === 'grid2' || viewMode === 'grid3') {
    return (
      <div
        onClick={() => item.url && window.open(item.url, '_blank', 'noopener,noreferrer')}
        style={{ cursor: item.url ? 'pointer' : 'default', minWidth: 0, overflow: 'hidden' }}
      >
        <div style={{ position: 'relative', aspectRatio: '2/3', borderRadius: 'var(--radius-sm)', overflow: 'hidden', background: typeConf?.bg ?? 'var(--tab-inactive-bg)' }}>
          {item.thumbnail && !imgFailed ? (
            <img
              src={item.thumbnail}
              onError={() => setImgFailed(true)}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              alt=""
            />
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: viewMode === 'grid3' ? '24px' : '32px' }}>{typeIcon}</span>
            </div>
          )}
          <div style={{ position: 'absolute', top: '5px', left: '5px', width: '7px', height: '7px', borderRadius: '50%', background: dotColor }} />
          <button
            onClick={e => { e.stopPropagation(); onAddToList() }}
            style={{
              position: 'absolute', bottom: '6px', right: '6px',
              width: '28px', height: '28px', borderRadius: '50%',
              background: isInList ? 'rgba(34,197,94,0.18)' : 'rgba(255,255,255,0.92)',
              border: 'none', cursor: 'pointer',
              color: isInList ? 'var(--green)' : 'var(--navy)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >{isInList
            ? <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="2,6 5,9 10,3"/></svg>
            : <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><line x1="6" y1="1" x2="6" y2="11"/><line x1="1" y1="6" x2="11" y2="6"/></svg>
          }</button>
        </div>
        <div style={{ padding: '5px 2px 0' }}>
          <div style={{
            fontSize: viewMode === 'grid3' ? '10.5px' : '12px', fontWeight: 600,
            color: 'var(--color-heading)', lineHeight: 1.3,
            overflow: 'hidden', display: '-webkit-box',
            WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const,
          }}>
            {item.title}
          </div>
          {item.creator && (
            <div style={{
              fontSize: viewMode === 'grid3' ? '9.5px' : '10.5px',
              color: 'var(--text-2)', marginTop: '2px',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {item.creator}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div
      onClick={() => item.url && window.open(item.url, '_blank', 'noopener,noreferrer')}
      style={{
        background: 'var(--surface)', borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '9px 14px',
        cursor: item.url ? 'pointer' : 'default',
      }}
    >
      <div style={{
        width: '7px', height: '7px', borderRadius: '50%', flexShrink: 0,
        background: dotColor,
        animation: avail === 'checking' ? 'pulse 1s infinite' : 'none',
      }} />

      {viewMode === 'list' && (
        <CoverImg thumbnail={item.thumbnail} width={44} height={63} typeIcon={typeIcon} subject={item.subject} typeBg={typeConf?.bg} />
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-heading)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '-0.2px' }}>
          {item.title}
        </div>
        <div style={{ fontSize: '11.5px', color: 'var(--text-2)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {subtitle}
        </div>
      </div>

      <button
        onClick={e => { e.stopPropagation(); onAddToList() }}
        style={{
          width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0,
          background: isInList ? 'rgba(34,197,94,0.12)' : 'var(--tab-inactive-bg)',
          border: 'none', cursor: 'pointer',
          color: isInList ? 'var(--green)' : 'var(--navy)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >{isInList
        ? <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="2,6 5,9 10,3"/></svg>
        : <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><line x1="6" y1="1" x2="6" y2="11"/><line x1="1" y1="6" x2="11" y2="6"/></svg>
      }</button>
    </div>
  )
}

function AddToListModal({ item, onAdd, onClose }: {
  item: CatalogueItem
  onAdd: (item: CatalogueItem, listId: string) => void
  onClose: () => void
}) {
  const [store, setStore] = useState(loadStore)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newIcon, setNewIcon] = useState('⭐')

  function handleCreate() {
    const name = newName.trim()
    if (!name) return
    const id = `custom_${Date.now()}`
    const updated = addCustomList(store, { id, name, icon: newIcon, docType: '', subject: '', queryExtra: '' })
    const withItem = addItem(updated, id, item.title)
    saveStore(withItem)
    setStore(withItem)
    onAdd(item, id)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'var(--overlay)',
      display: 'flex', alignItems: 'flex-end', zIndex: 200,
    }} onClick={onClose}>
      <div
        style={{ background: 'var(--surface)', width: '100%', padding: '20px', borderRadius: '16px 16px 0 0', maxHeight: '80vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ fontSize: '12px', color: 'var(--text-2)', marginBottom: '4px' }}>Ajouter à une liste</div>
        <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-heading)', marginBottom: '16px', lineHeight: 1.3 }}>
          {item.title}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
          {store.lists.map(list => (
            <button
              key={list.id}
              onClick={() => onAdd(item, list.id)}
              style={{
                padding: '12px 14px', background: 'var(--bg)',
                border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
                textAlign: 'left', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
                display: 'flex', alignItems: 'center', gap: '10px',
              }}
            >
              <span style={{ fontSize: '20px' }}>{list.icon}</span>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-heading)' }}>{list.name}</span>
            </button>
          ))}
        </div>

        {!creating ? (
          <button
            onClick={() => setCreating(true)}
            style={{
              width: '100%', padding: '11px', background: 'transparent',
              border: '1.5px dashed var(--border)', borderRadius: 'var(--radius-sm)',
              fontSize: '13px', fontWeight: 600, color: 'var(--text-2)',
              cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
            }}
          >
            + Nouvelle liste
          </button>
        ) : (
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '14px', marginTop: '4px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-heading)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Nouvelle liste
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
              {LIST_ICONS.map(ic => (
                <button
                  key={ic}
                  onClick={() => setNewIcon(ic)}
                  style={{
                    width: '36px', height: '36px', borderRadius: '8px', fontSize: '18px',
                    border: newIcon === ic ? '2px solid var(--navy)' : '1.5px solid var(--border)',
                    background: newIcon === ic ? 'var(--tab-inactive-bg)' : 'transparent',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  {ic}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Nom de la liste…"
              autoFocus
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              style={{
                width: '100%', padding: '10px 14px', marginBottom: '10px',
                borderRadius: 'var(--radius-sm)', border: '1.5px solid var(--border)',
                fontSize: '14px', background: 'var(--bg)', color: 'var(--text)',
                fontFamily: 'DM Sans, sans-serif', outline: 'none',
              }}
            />
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => { setCreating(false); setNewName('') }}
                style={{
                  flex: 1, padding: '11px', background: 'var(--bg)',
                  border: '1.5px solid var(--border)', borderRadius: 'var(--radius-sm)',
                  fontSize: '13px', fontWeight: 600, color: 'var(--text-2)',
                  cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
                }}
              >
                Annuler
              </button>
              <button
                onClick={handleCreate}
                disabled={!newName.trim()}
                style={{
                  flex: 2, padding: '11px', background: 'var(--navy)', color: 'white',
                  border: 'none', borderRadius: 'var(--radius-sm)',
                  fontSize: '13px', fontWeight: 700,
                  cursor: !newName.trim() ? 'not-allowed' : 'pointer',
                  opacity: !newName.trim() ? 0.45 : 1,
                  fontFamily: 'DM Sans, sans-serif',
                }}
              >
                Créer et ajouter
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
