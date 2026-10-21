/**
 * Split View — a browser client plugin for DeepSeek Harness.
 *
 * The split view is a Conversation View tab (next to Chat and Trajectory), not a
 * separate main panel, so the resident Conversation header — Session title,
 * Agent Team / cost / export utilities, the right-sidebar toggle — and the
 * frame chrome all stay exactly as the shipped UI renders them.
 *
 * The view hosts up to nine live Session panes (side by side, 2x2, 3x3, and the
 * other row/column presets). Each pane binds its own Session through the
 * renderer's SessionProvider seat and renders the shipped `conversation.content`
 * factory in its embedded occurrence, so every pane keeps its own transcript,
 * composer, draft, and running turn. While the split view is the active view of
 * a Session, that Session's resident composer is replaced by an empty gate so a
 * Session shown in a pane never mounts a second editable composer root.
 *
 * Interactions: drag a Session row from the sidebar into a pane, drag files
 * into a pane (only that pane receives them), click a pane title to switch its
 * Session, and use the toolbar to change the layout.
 */
window.__ModuleLoader__.load({
  id: '@wxysskd/dsh-split-view',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useEffect, useMemo, useRef, useState, useSyncExternalStore } = React;

    const NS = 'split-view';
    const VIEW_ID = 'split-view';
    const MAX_PANES = 9;
    const STORAGE_KEY = '@wxysskd/dsh-split-view/v2';
    const PANE_SLOT = (index) => `@wxysskd/dsh-split-view/pane.${index}`;
    /** dsh-projects drag payload MIME; the shipped browser drags bare Session ids. */
    const PROJECTS_DRAG_MIME = 'application/x-dsh-projects';

    // ---------------------------------------------------------------------
    // Locale dictionaries
    // ---------------------------------------------------------------------
    const zh = {
      'view.label': '分屏',
      'layout.label': '布局',
      'layout.1x1': '单屏',
      'layout.2x1': '左右并排',
      'layout.1x2': '上下排列',
      'layout.2x2': '田字格',
      'layout.3x1': '三列并排',
      'layout.3x2': '六宫格',
      'layout.3x3': '九宫格',
      'pane.pick': '拖入或选择会话',
      'pane.switch': '切换会话',
      'pane.openMain': '在主视图打开',
      'pane.close': '关闭窗格',
      'pane.retainFailed': '无法打开此会话，请重新选择',
      'picker.title': '选择会话',
      'picker.search': '搜索会话…',
      'picker.empty': '没有匹配的会话',
      'picker.new': '新会话',
      'picker.untitled': '未命名会话',
      'picker.subagent': '子代理',
      'picker.expand': '展开子会话',
      'picker.collapse': '收起子会话',
      'drop.subagentUnsupported': '子代理会话不支持附件',
      'action.close': '关闭',
    };

    const en = {
      'view.label': 'Split',
      'layout.label': 'Layout',
      'layout.1x1': 'Single',
      'layout.2x1': 'Side by side',
      'layout.1x2': 'Stacked',
      'layout.2x2': '2 × 2 grid',
      'layout.3x1': 'Three columns',
      'layout.3x2': '3 × 2 grid',
      'layout.3x3': '3 × 3 grid',
      'pane.pick': 'Drop or choose a session',
      'pane.switch': 'Switch session',
      'pane.openMain': 'Open in the main view',
      'pane.close': 'Close pane',
      'pane.retainFailed': 'This session could not be opened. Choose another one.',
      'picker.title': 'Choose a session',
      'picker.search': 'Search sessions…',
      'picker.empty': 'No matching session',
      'picker.new': 'New session',
      'picker.untitled': 'Untitled session',
      'picker.subagent': 'Subagent',
      'picker.expand': 'Expand child sessions',
      'picker.collapse': 'Collapse child sessions',
      'drop.subagentUnsupported': 'Subagent sessions do not accept attachments',
      'action.close': 'Close',
    };

    // ---------------------------------------------------------------------
    // Layout presets
    // ---------------------------------------------------------------------
    const LAYOUTS = [
      { id: '1x1', cols: 1, rows: 1 },
      { id: '2x1', cols: 2, rows: 1 },
      { id: '1x2', cols: 1, rows: 2 },
      { id: '2x2', cols: 2, rows: 2 },
      { id: '3x1', cols: 3, rows: 1 },
      { id: '3x2', cols: 3, rows: 2 },
      { id: '3x3', cols: 3, rows: 3 },
    ];

    const LAYOUT_BY_ID = new Map(LAYOUTS.map((layout) => [layout.id, layout]));

    function layoutFor(cols, rows) {
      return LAYOUTS.find((layout) => layout.cols === cols && layout.rows === rows) ?? LAYOUTS[1];
    }

    // ---------------------------------------------------------------------
    // Styles (theme tokens only, per the Harness UI rules)
    // ---------------------------------------------------------------------
    const CSS = `
.dshsv-overlay { box-sizing: border-box; display: flex; flex-direction: column; background: var(--dsw-alias-bg-base); }
.dshsv-root { position: relative; isolation: isolate; box-sizing: border-box; display: flex; flex-direction: column; gap: 8px; height: 100%; min-height: 0;
  padding: 2px 12px 10px; color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-base); }
.dshsv-select { height: 24px; box-sizing: border-box; padding: 0 22px 0 8px; font: inherit; font-size: 12px;
  color: var(--dsw-alias-label-primary); background-color: var(--dsw-alias-bg-layer-1);
  border: 1px solid var(--dsw-alias-border-l1); border-radius: var(--dsw-radius-sm, 6px);
  appearance: none; -webkit-appearance: none; cursor: pointer;
  background-image: linear-gradient(45deg, transparent 50%, currentColor 50%), linear-gradient(135deg, currentColor 50%, transparent 50%);
  background-position: calc(100% - 13px) 11px, calc(100% - 9px) 11px; background-size: 4px 4px; background-repeat: no-repeat; }
.dshsv-header-chip { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--dsw-alias-label-secondary); }
.dshsv-header-chip .dshsv-select { height: 24px; padding: 0 20px 0 7px; background-position: calc(100% - 11px) 10px, calc(100% - 7px) 10px; }
.dshsv-select:hover { border-color: var(--dsw-alias-border-l2); }
.dshsv-select:focus-visible { outline: none; border-color: var(--dsw-alias-brand-primary); }
.dshsv-button { display: inline-flex; align-items: center; gap: 6px; height: 26px; padding: 0 10px; box-sizing: border-box;
  font: inherit; font-size: 12px; color: var(--dsw-alias-label-secondary); background: transparent; cursor: pointer;
  border: 1px solid var(--dsw-alias-border-l1); border-radius: var(--dsw-radius-sm, 6px); }
.dshsv-button:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, .12)); color: var(--dsw-alias-label-primary); }
.dshsv-grid { flex: 1; min-height: 0; display: grid; gap: 8px; }
.dshsv-pane { display: flex; flex-direction: column; min-width: 0; min-height: 0; overflow: hidden; position: relative;
  background: var(--dsw-alias-bg-layer-1); border: 1px solid var(--dsw-alias-border-l1);
  border-radius: var(--dsw-radius-lg, 12px); transition: border-color .12s, box-shadow .12s; }
.dshsv-pane.is-focused { border-color: var(--dsw-alias-brand-primary); }
.dshsv-pane.is-drop-target { border-color: var(--dsw-alias-brand-primary);
  box-shadow: 0 0 0 1px var(--dsw-alias-brand-primary), 0 0 0 4px color-mix(in srgb, var(--dsw-alias-brand-primary) 16%, transparent); }
.dshsv-pane-header { display: flex; align-items: center; gap: 4px; flex: none; height: 32px; padding: 0 4px 0 6px;
  border-bottom: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); }
.dshsv-pane-title { display: flex; align-items: center; gap: 6px; flex: 1; min-width: 0; height: 26px; padding: 0 6px;
  font: inherit; font-size: 12px; font-weight: 500; text-align: left; color: var(--dsw-alias-label-primary);
  background: transparent; border: 0; border-radius: var(--dsw-radius-sm, 6px); cursor: pointer; }
.dshsv-pane-title:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, .12)); }
.dshsv-pane-title-text { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dshsv-toast { position: absolute; left: 50%; bottom: 22px; transform: translateX(-50%); z-index: 500;
  display: inline-flex; align-items: center; gap: 8px; max-width: min(520px, calc(100% - 48px));
  padding: 9px 16px; font-size: 13px; line-height: 18px; color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-base, #fff); border: 1px solid var(--dsw-alias-state-warn-primary);
  border-radius: 999px; box-shadow: var(--dsw-shadow-lv2, 0 4px 16px rgba(0, 0, 0, .18));
  pointer-events: none; animation: dshsv-toast-in .18s ease-out; }
.dshsv-toast.is-leaving { animation: dshsv-toast-out .2s ease-in forwards; }
.dshsv-toast-icon { display: inline-flex; flex: none; color: var(--dsw-alias-state-warn-primary); }
@keyframes dshsv-toast-in { from { opacity: 0; transform: translate(-50%, 6px); } to { opacity: 1; transform: translate(-50%, 0); } }
@keyframes dshsv-toast-out { from { opacity: 1; transform: translate(-50%, 0); } to { opacity: 0; transform: translate(-50%, 6px); } }
.dshsv-pane-actions { display: inline-flex; align-items: center; gap: 2px; flex: none; }
.dshsv-dot { width: 6px; height: 6px; border-radius: 50%; flex: none; background: var(--dsw-alias-state-idle-primary); }
.dshsv-dot.is-running { background: var(--dsw-alias-state-success-primary); }
.dshsv-icon-button { display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; flex: none;
  padding: 0; font: inherit; color: var(--dsw-alias-label-secondary); background: transparent; border: 0;
  border-radius: var(--dsw-radius-sm, 6px); cursor: pointer; }
.dshsv-icon-button:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, .12)); color: var(--dsw-alias-label-primary); }
.dshsv-pane-body { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
.dshsv-empty { display: flex; flex-direction: column; align-items: center; gap: 8px; margin: auto; padding: 22px 26px;
  font: inherit; font-size: 12px; color: var(--dsw-alias-label-secondary); background: transparent; cursor: pointer;
  border: 1px dashed var(--dsw-alias-border-l2); border-radius: var(--dsw-radius-lg, 12px); }
.dshsv-empty:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, .12)); color: var(--dsw-alias-label-primary); }
.dshsv-empty.is-drop-target { border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-label-primary); }
.dshsv-failure { display: flex; flex-direction: column; align-items: center; gap: 8px; margin: auto; padding: 18px 24px;
  font-size: 12px; color: var(--dsw-alias-label-secondary); text-align: center; }
.dshsv-backdrop { position: fixed; inset: 0; z-index: 950; display: flex; align-items: flex-start; justify-content: center;
  padding: clamp(44px, 10vh, 120px) 24px 24px; background: rgba(0, 0, 0, .35); }
.dshsv-dialog { display: flex; flex-direction: column; width: min(560px, calc(100vw - 48px)); max-height: min(72vh, 640px);
  overflow: hidden; background: var(--dsw-alias-bg-base, #fff);
  border: 1px solid var(--dsw-alias-border-l1); border-radius: var(--dsw-radius-lg, 12px);
  box-shadow: 0 18px 48px rgba(0, 0, 0, .28); }
.dshsv-dialog-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 10px 10px 8px 14px;
  font-size: 13px; font-weight: 600; }
.dshsv-search { box-sizing: border-box; height: 30px; margin: 0 12px 8px; padding: 0 9px;
  font: inherit; font-size: 12px; color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-base, #fff);
  border: 1px solid var(--dsw-alias-border-l1); border-radius: var(--dsw-radius-sm, 6px); outline: none; }
.dshsv-search:focus { border-color: var(--dsw-alias-brand-primary); }
.dshsv-dialog-list { display: flex; flex-direction: column; gap: 2px; overflow: auto; padding: 2px 8px 10px;
  background: var(--dsw-alias-bg-base, #fff); }
.dshsv-session-item { display: flex; align-items: center; gap: 2px; min-width: 0; }
.dshsv-session-item > .dshsv-session-row { flex: 1; min-width: 0; }
.dshsv-chevron-btn { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; flex: none;
  padding: 0; color: var(--dsw-alias-label-secondary); background: transparent; border: 0; border-radius: var(--dsw-radius-sm, 6px); cursor: pointer; }
.dshsv-chevron-btn:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, .12)); color: var(--dsw-alias-label-primary); }
.dshsv-session-row { display: flex; align-items: center; gap: 8px; width: 100%; padding: 7px 8px; box-sizing: border-box;
  font: inherit; font-size: 12px; color: var(--dsw-alias-label-primary); text-align: left; background: transparent;
  border: 0; border-radius: var(--dsw-radius-sm, 6px); cursor: pointer; }
.dshsv-session-row:hover, .dshsv-session-row:focus-visible { background: var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, .12)); }
.dshsv-session-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dshsv-tag { flex: none; padding: 0 5px; font-size: 10px; line-height: 15px; color: var(--dsw-alias-label-secondary);
  border: 1px solid var(--dsw-alias-border-l1); border-radius: 4px; }
.dshsv-dialog-empty { padding: 22px 8px 26px; font-size: 12px; text-align: center; color: var(--dsw-alias-label-secondary); }
`;

    // ---------------------------------------------------------------------
    // Inline icons
    // ---------------------------------------------------------------------
    function Svg(props) {
      return h(
        'svg',
        {
          viewBox: '0 0 16 16',
          width: props.size ?? 14,
          height: props.size ?? 14,
          'aria-hidden': true,
          focusable: false,
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: props.strokeWidth ?? 1.4,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          style: props.style,
        },
        props.children,
      );
    }

    function ChevronIcon(props) {
      return h(Svg, props, h('path', { d: 'M4 6.5 8 10l4-3.5' }));
    }

    function ExpandIcon(props) {
      return h(Svg, props, h('path', { d: 'M6.2 3.2H3.2v3' }), h('path', { d: 'M9.8 12.8h3v-3' }), h('path', { d: 'M3.2 3.2l4 4' }), h('path', { d: 'M12.8 12.8l-4-4' }));
    }

    function CloseIcon(props) {
      return h(Svg, props, h('path', { d: 'M4 4l8 8' }), h('path', { d: 'M12 4l-8 8' }));
    }

    function PlusGridIcon(props) {
      return h(
        Svg,
        props,
        h('rect', { x: 2.2, y: 2.6, width: 4.6, height: 4.6, rx: 1 }),
        h('rect', { x: 9.2, y: 2.6, width: 4.6, height: 4.6, rx: 1 }),
        h('rect', { x: 2.2, y: 9, width: 4.6, height: 4.6, rx: 1 }),
        h('path', { d: 'M11.5 9.4v4M9.5 11.4h4' }),
      );
    }

    // ---------------------------------------------------------------------
    // Persisted plugin store (layout + pane assignments, shared by the tabs)
    // ---------------------------------------------------------------------
    const EMPTY_PANES = Object.freeze(new Array(MAX_PANES).fill(null));

    function sanitizeLayout(value) {
      if (value === null || typeof value !== 'object') return null;
      const cols = Number(value.cols);
      const rows = Number(value.rows);
      if (!Number.isInteger(cols) || cols < 1 || cols > 3) return null;
      if (!Number.isInteger(rows) || rows < 1 || rows > 3) return null;
      const panes = new Array(MAX_PANES).fill(null);
      if (Array.isArray(value.panes)) {
        for (let index = 0; index < MAX_PANES; index += 1) {
          const id = value.panes[index];
          if (typeof id === 'string' && id.length > 0) panes[index] = id;
        }
      }
      const focus = Number(value.focus);
      return {
        cols,
        rows,
        panes,
        focus: Number.isInteger(focus) && focus >= 0 && focus < MAX_PANES ? focus : 0,
      };
    }

    function loadState() {
      const fallback = { cols: 2, rows: 1, panes: EMPTY_PANES.slice(), focus: 0 };
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw === null) return fallback;
        return sanitizeLayout(JSON.parse(raw)) ?? fallback;
      } catch (error) {
        return fallback;
      }
    }

    function saveState(state) {
      try {
        window.localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ cols: state.cols, rows: state.rows, panes: state.panes, focus: state.focus }),
        );
      } catch (error) {
        /* Persistence is best-effort; the in-memory layout stays authoritative. */
      }
    }

    function createStore() {
      let state = loadState();
      const listeners = new Set();
      const getSnapshot = () => state;
      const subscribe = (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      };
      const commit = (next) => {
        if (next === state) return;
        state = next;
        saveState(state);
        for (const listener of [...listeners]) listener();
      };
      const visibleCount = (snapshot) => Math.min(snapshot.cols * snapshot.rows, MAX_PANES);
      const store = {
        getSnapshot,
        subscribe,
        visibleCount,
        setLayout(id) {
          const layout = LAYOUT_BY_ID.get(id);
          if (layout === undefined) return;
          commit({ ...state, cols: layout.cols, rows: layout.rows });
        },
        setFocus(index) {
          if (!Number.isInteger(index) || index < 0 || index >= MAX_PANES) return;
          if (state.focus === index) return;
          commit({ ...state, focus: index });
        },
        /** Put one session into a pane, moving it out of any other visible pane first. */
        assignToPane(index, sessionId) {
          if (!Number.isInteger(index) || index < 0 || index >= MAX_PANES) return;
          if (typeof sessionId !== 'string' || sessionId.length === 0) return;
          const panes = state.panes.slice();
          for (let cursor = 0; cursor < MAX_PANES; cursor += 1) {
            if (panes[cursor] === sessionId) panes[cursor] = null;
          }
          panes[index] = sessionId;
          commit({ ...state, panes, focus: index });
        },
        clearPane(index) {
          if (!Number.isInteger(index) || index < 0 || index >= MAX_PANES) return;
          if (state.panes[index] === null) return;
          const panes = state.panes.slice();
          panes[index] = null;
          commit({ ...state, panes });
        },
      };
      return store;
    }

    // ---------------------------------------------------------------------
    // Retained Session references (one shared binding per pane session)
    // ---------------------------------------------------------------------
    function createSessionPool(ctx) {
      const entries = new Map();
      return {
        acquire(sessionId) {
          const existing = entries.get(sessionId);
          if (existing !== undefined) {
            existing.count += 1;
            return existing.reference;
          }
          try {
            const reference = ctx.sessions.retain(sessionId, { source: 'splitView' });
            entries.set(sessionId, { reference, count: 1 });
            return reference;
          } catch (error) {
            console.warn(`[${NS}] could not retain session ${sessionId}:`, error);
            return undefined;
          }
        },
        release(sessionId) {
          const existing = entries.get(sessionId);
          if (existing === undefined) return;
          existing.count -= 1;
          if (existing.count > 0) return;
          entries.delete(sessionId);
          try {
            existing.reference.release();
          } catch (error) {
            console.warn(`[${NS}] could not release session ${sessionId}:`, error);
          }
        },
        dispose() {
          for (const [sessionId, existing] of entries) {
            try {
              existing.reference.release();
            } catch (error) {
              console.warn(`[${NS}] could not release session ${sessionId}:`, error);
            }
          }
          entries.clear();
        },
      };
    }

    /**
     * Keep one retained SessionReference per wanted session. Removal is released
     * after the owning provider has unmounted, so a binding is never released
     * while a SessionProvider still renders it.
     */
    function useSessionReferences(pool, sessionIds) {
      const key = sessionIds.join('\u0001');
      const wantedRef = useRef(new Set());
      const referencesRef = useRef(new Map());
      const aliveRef = useRef(true);
      const [version, setVersion] = useState(0);
      const [ready, setReady] = useState(false);
      const bump = () => {
        if (aliveRef.current) setVersion((value) => value + 1);
      };

      useEffect(() => {
        aliveRef.current = true;
        return () => {
          aliveRef.current = false;
        };
      }, []);

      useEffect(() => {
        const wanted = new Set();
        for (const id of sessionIds) {
          if (typeof id === 'string' && id.length > 0) wanted.add(id);
        }
        wantedRef.current = wanted;
        let changed = false;
        for (const id of wanted) {
          if (referencesRef.current.has(id)) continue;
          const reference = pool.acquire(id);
          if (reference !== undefined) {
            referencesRef.current.set(id, reference);
            changed = true;
          }
        }
        for (const id of [...referencesRef.current.keys()]) {
          if (wanted.has(id)) continue;
          window.setTimeout(() => {
            if (wantedRef.current.has(id)) return;
            if (!referencesRef.current.has(id)) return;
            referencesRef.current.delete(id);
            pool.release(id);
            bump();
          }, 0);
        }
        setReady(true);
        if (changed) bump();
      }, [key]);

      useEffect(
        () => () => {
          for (const id of [...referencesRef.current.keys()]) {
            referencesRef.current.delete(id);
            pool.release(id);
          }
        },
        [],
      );

      const references = useMemo(() => {
        const out = {};
        for (const [id, reference] of referencesRef.current) out[id] = reference;
        return out;
      }, [key, version]);

      return { references, ready };
    }

    // ---------------------------------------------------------------------
    // Active split-view geometry (which Session is open and where its view area is)
    // ---------------------------------------------------------------------
    /** The active split view: its Session and the viewport rect it occupies. */
    const splitMode = (() => {
      let state = { sessionId: null, rect: null };
      const listeners = new Set();
      const publish = (next) => {
        const previous = state;
        if (
          previous.sessionId === next.sessionId &&
          (previous.rect === next.rect ||
            (previous.rect !== null && next.rect !== null &&
              previous.rect.left === next.rect.left &&
              previous.rect.top === next.rect.top &&
              previous.rect.width === next.rect.width &&
              previous.rect.height === next.rect.height))
        ) {
          return;
        }
        state = next;
        for (const listener of [...listeners]) listener();
      };
      return {
        getSnapshot: () => state,
        subscribe: (listener) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        show(sessionId, rect) {
          publish({ sessionId, rect });
        },
        updateRect(sessionId, rect) {
          if (state.sessionId !== sessionId) return;
          publish({ sessionId, rect });
        },
        hide(sessionId) {
          if (state.sessionId !== sessionId) return;
          publish({ sessionId: null, rect: null });
        },
      };
    })();

    // ---------------------------------------------------------------------
    // Per-session composer inputs (published by the mounted composer arrangements)
    // ---------------------------------------------------------------------
    /**
     * SessionId -> the InputActions of a mounted composer arrangement. Two
     * arrangements can exist for the current Session (the resident panel composer
     * and its pane composer), so entries are reference counted.
     */
    const composerInputs = new Map();
    function registerComposerInput(sessionId, inputActions) {
      if (typeof sessionId !== 'string' || sessionId.length === 0) return () => {};
      const existing = composerInputs.get(sessionId);
      if (existing !== undefined) {
        existing.count += 1;
        if (inputActions !== undefined) existing.inputActions = inputActions;
        return () => {
          const current = composerInputs.get(sessionId);
          if (current === undefined) return;
          current.count -= 1;
          if (current.count <= 0) composerInputs.delete(sessionId);
        };
      }
      composerInputs.set(sessionId, { count: 1, inputActions });
      return () => {
        const current = composerInputs.get(sessionId);
        if (current === undefined) return;
        current.count -= 1;
        if (current.count <= 0) composerInputs.delete(sessionId);
      };
    }

    // ---------------------------------------------------------------------
    // Drop routing shared between the view and its pane occupants
    // ---------------------------------------------------------------------
    function readSessionIdFromDrop(dataTransfer) {
      if (dataTransfer === null || dataTransfer === undefined) return undefined;
      const types = Array.isArray(dataTransfer.types) ? dataTransfer.types : [];
      const read = (type) => {
        try {
          return dataTransfer.getData(type);
        } catch (error) {
          return '';
        }
      };
      if (types.includes(PROJECTS_DRAG_MIME)) {
        try {
          const payload = JSON.parse(read(PROJECTS_DRAG_MIME));
          if (payload !== null && typeof payload === 'object' && payload.kind === 'session' && typeof payload.sessionId === 'string') {
            return payload.sessionId;
          }
        } catch (error) {
          /* fall through to the plain payload */
        }
      }
      const text = read('text/plain');
      if (typeof text === 'string' && text.length > 0) {
        try {
          const payload = JSON.parse(text);
          if (payload !== null && typeof payload === 'object' && payload.kind === 'session' && typeof payload.sessionId === 'string') {
            return payload.sessionId;
          }
        } catch (error) {
          /* not JSON: the shipped sidebar browser drags the bare Session id */
        }
        return text;
      }
      return undefined;
    }

    // ---------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------
    function sessionTitle(node, t) {
      if (node === undefined) return '';
      if (typeof node.displayTitle === 'string' && node.displayTitle.length > 0) return node.displayTitle;
      if (node.blank === true) return t('picker.new');
      return typeof node.title === 'string' && node.title.length > 0 ? node.title : t('picker.untitled');
    }

    /**
     * Group Session rows by their parent Session: subagent sessions collapse
     * under the Session that spawned them. Filtered rows whose parent is not in
     * the current result stay at the top level so search never hides a match.
     */
    function buildSessionTree(rows) {
      const present = new Set(rows.map((row) => row.id));
      const children = new Map();
      const roots = [];
      for (const row of rows) {
        const parentId = typeof row.parentId === 'string' && present.has(row.parentId) ? row.parentId : undefined;
        if (parentId === undefined) {
          roots.push(row);
          continue;
        }
        const list = children.get(parentId) ?? [];
        list.push(row);
        children.set(parentId, list);
      }
      return { roots, children };
    }

    function isRunning(statusMap, sessionId) {
      if (statusMap === undefined || sessionId === undefined) return false;
      const status = statusMap.get(sessionId);
      return status?.running === true;
    }

    function sessionRows(snapshot, query, t) {
      if (snapshot === undefined) return [];
      const byId = snapshot.byId ?? {};
      const ids = Array.isArray(snapshot.ids) ? snapshot.ids : Object.keys(byId);
      const needle = query.trim().toLowerCase();
      const rows = [];
      for (const id of ids) {
        const node = byId[id];
        if (node === undefined || node.archived === true) continue;
        if (needle.length > 0 && !sessionTitle(node, t).toLowerCase().includes(needle)) continue;
        rows.push(node);
      }
      rows.sort((left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0));
      return rows;
    }

    /** IME composition state: the ownership watchdog must never interrupt a composition. */
    const splitComposition = { active: false, until: 0 };

    /** Latest draft text of the Session that hosts the split view (root-ownership watchdog). */
    const splitDraftMirror = { draft: null };

    /** Whether a Session is a subagent session (one-shot record or continuable child). */
    function sessionIsSubagent(ctx, sessionId) {
      try {
        const binding = ctx.sessions.binding?.(sessionId);
        const snapshot = binding?.session?.getSnapshot?.();
        return snapshot?.subagent !== undefined && snapshot?.subagent !== null;
      } catch (error) {
        return false;
      }
    }

    /** True when the drag carries a directory: those keep the host path-reference path. */
    function transferHasDirectory(transfer) {
      try {
        const items = transfer?.items;
        if (items === undefined || items === null) return false;
        for (const item of Array.from(items)) {
          const entry = typeof item.webkitGetAsEntry === 'function' ? item.webkitGetAsEntry() : null;
          if (entry !== null && entry !== undefined && entry.isDirectory === true) return true;
        }
      } catch (error) {
        /* treat as plain files */
      }
      return false;
    }

    /** Resolve the session-scoped Conversation service (draft attachments + uploads). */
    function scopedConversationOf(ctx, sessionId) {
      try {
        const scope = ctx.sessions.scope?.(sessionId);
        const conversation = scope?.get?.('conversation');
        return conversation !== undefined && conversation !== null ? conversation : undefined;
      } catch (error) {
        return undefined;
      }
    }

    /** Resolve the pane index under the pointer from a drag event, if any. */
    function paneIndexAt(event) {
      try {
        const stack = typeof document.elementsFromPoint === 'function'
          ? document.elementsFromPoint(event.clientX, event.clientY)
          : [event.target];
        for (const element of stack) {
          if (!(element instanceof Element)) continue;
          const pane = element.closest('[data-pane]');
          if (pane !== null) {
            const index = Number(pane.getAttribute('data-pane'));
            if (Number.isInteger(index)) return index;
          }
        }
      } catch (error) {
        /* hit testing is best-effort */
      }
      return undefined;
    }

    // ---------------------------------------------------------------------
    // The conversation View (mode switch + geometry) and the overlay grid
    // ---------------------------------------------------------------------
    /**
     * The View tab itself: it occupies the conversation view area, reports that
     * area's viewport rectangle, and switches the split mode on for its Session.
     * The pane grid renders in `shell.overlay` — outside the `conversation.content`
     * factory — because a pane occurrence of that factory cannot be nested inside
     * the occurrence that hosts the View (the renderer rejects recursive renders).
     */
    function createSplitViewEntry(ctx, store) {
      return function SplitViewPlaceholder(props) {
        const { sessionId, inputActions, useInput } = props;
        const anchorRef = useRef(null);
        const draftValue = typeof useInput === 'function' ? useInput((value) => value.draft) : undefined;
        useEffect(() => {
          splitDraftMirror.draft = typeof draftValue === 'string' ? draftValue : null;
          return () => {
            splitDraftMirror.draft = null;
          };
        }, [draftValue]);

        useEffect(() => {
          if (typeof sessionId !== 'string' || sessionId.length === 0) return undefined;
          const releaseInput = registerComposerInput(sessionId, inputActions);
          const update = () => {
            const anchor = anchorRef.current;
            if (anchor === null) return;
            const rect = anchor.getBoundingClientRect();
            splitMode.updateRect(sessionId, {
              left: rect.left,
              top: rect.top,
              width: rect.width,
              height: rect.height,
            });
          };
          const anchor = anchorRef.current;
          if (anchor !== null) {
            const rect = anchor.getBoundingClientRect();
            splitMode.show(sessionId, {
              left: rect.left,
              top: rect.top,
              width: rect.width,
              height: rect.height,
            });
          }
          const observer = typeof ResizeObserver === 'function' && anchor !== null ? new ResizeObserver(update) : undefined;
          if (observer !== undefined) observer.observe(anchor);
          window.addEventListener('resize', update);
          return () => {
            releaseInput();
            if (observer !== undefined) observer.disconnect();
            window.removeEventListener('resize', update);
            splitMode.hide(sessionId);
          };
        }, [sessionId]);

        return h('div', {
          ref: anchorRef,
          'data-split-anchor': '',
          style: { width: '100%', height: '100%', pointerEvents: 'none' },
        });
      };
    }

    /** The grid itself: toolbar, pane frames, session picker, and drop routing. */
    function createSplitGrid(ctx, store, pool, setResidentComposerHidden) {
      function SessionPickerDialog(props) {
        const { paneIndex, snapshot, t, onClose } = props;
        const [query, setQuery] = useState('');

        useEffect(() => {
          const onKeyDown = (event) => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            event.stopPropagation();
            onClose();
          };
          window.addEventListener('keydown', onKeyDown, true);
          return () => window.removeEventListener('keydown', onKeyDown, true);
        }, []);

        const rows = useMemo(() => sessionRows(snapshot, query, t), [snapshot, query]);
        const tree = useMemo(() => buildSessionTree(rows), [rows]);
        const [expanded, setExpanded] = useState(() => new Set());
        const searching = query.trim().length > 0;
        const isOpen = (id) => searching || expanded.has(id);
        const toggleOpen = (id) =>
          setExpanded((previous) => {
            const next = new Set(previous);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
          });
        const pick = (id) => {
          store.assignToPane(paneIndex, id);
          onClose();
        };
        const renderNode = (node, depth) => {
          const kids = tree.children.get(node.id) ?? [];
          const open = isOpen(node.id);
          return h(
            React.Fragment,
            { key: node.id },
            h(
              'div',
              { className: 'dshsv-session-item', style: { paddingLeft: `${depth * 16}px` } },
              h(
                'button',
                { type: 'button', className: 'dshsv-session-row', onClick: () => pick(node.id) },
                h('span', { className: 'dshsv-dot' }),
                h('span', { className: 'dshsv-session-title' }, sessionTitle(node, t)),
                node.origin === 'subagent' ? h('span', { className: 'dshsv-tag' }, t('picker.subagent')) : null,
                node.blank === true ? h('span', { className: 'dshsv-tag' }, t('picker.new')) : null,
              ),
              kids.length > 0
                ? h(
                    'button',
                    {
                      type: 'button',
                      className: 'dshsv-chevron-btn',
                      title: open ? t('picker.collapse') : t('picker.expand'),
                      'aria-label': open ? t('picker.collapse') : t('picker.expand'),
                      'aria-expanded': open,
                      onClick: () => toggleOpen(node.id),
                    },
                    h(ChevronIcon, { size: 12, style: { transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .12s' } }),
                  )
                : null,
            ),
            kids.length > 0 && open ? kids.map((kid) => renderNode(kid, depth + 1)) : null,
          );
        };

        return h(
          'div',
          {
            className: 'dshsv-backdrop',
            onMouseDown: (event) => {
              if (event.target === event.currentTarget) onClose();
            },
          },
          h(
            'div',
            { className: 'dshsv-dialog', role: 'dialog', 'aria-modal': true, 'aria-label': t('picker.title') },
            h(
              'div',
              { className: 'dshsv-dialog-head' },
              h('span', null, t('picker.title')),
              h('button', {
                type: 'button',
                className: 'dshsv-icon-button',
                title: t('action.close'),
                'aria-label': t('action.close'),
                onClick: onClose,
              }, h(CloseIcon, { size: 13 })),
            ),
            h('input', {
              className: 'dshsv-search',
              type: 'text',
              value: query,
              placeholder: t('picker.search'),
              autoFocus: true,
              onChange: (event) => setQuery(event.target.value),
            }),
            h(
              'div',
              { className: 'dshsv-dialog-list' },
              rows.length === 0
                ? h('div', { className: 'dshsv-dialog-empty' }, t('picker.empty'))
                : tree.roots.map((node) => renderNode(node, 0)),
            ),
          ),
        );
      }

      function PaneFrame(props) {
        const { index, paneSessionId, focused, node, running, dropTarget, t, onPick, onClear, onOpenMain, onFocus, children } = props;
        const hasSession = paneSessionId !== null && paneSessionId !== undefined;
        const className = `dshsv-pane${focused ? ' is-focused' : ''}${dropTarget ? ' is-drop-target' : ''}`;
        return h(
          'section',
          {
            className,
            'data-pane': index,
            onMouseDown: onFocus,
          },
          h(
            'header',
            { className: 'dshsv-pane-header' },
            h(
              'button',
              {
                type: 'button',
                className: 'dshsv-pane-title',
                title: t('pane.switch'),
                onClick: onPick,
              },
              hasSession ? h('span', { className: `dshsv-dot${running ? ' is-running' : ''}` }) : null,
              h('span', { className: 'dshsv-pane-title-text' }, hasSession ? sessionTitle(node, t) : t('pane.pick')),
            ),
            h(
              'div',
              { className: 'dshsv-pane-actions' },
              hasSession
                ? h('button', {
                    type: 'button',
                    className: 'dshsv-icon-button',
                    title: t('pane.openMain'),
                    'aria-label': t('pane.openMain'),
                    onClick: (event) => {
                      event.stopPropagation();
                      onOpenMain();
                    },
                  }, h(ExpandIcon, { size: 13 }))
                : null,
              hasSession
                ? h('button', {
                    type: 'button',
                    className: 'dshsv-icon-button',
                    title: t('pane.close'),
                    'aria-label': t('pane.close'),
                    onClick: (event) => {
                      event.stopPropagation();
                      onClear();
                    },
                  }, h(CloseIcon, { size: 13 }))
                : null,
            ),
          ),
          h('div', { className: 'dshsv-pane-body' }, children),
        );
      }

      return function SplitGrid(props) {
        const { SessionProvider, renderSlot, useSessions, useSessionStatus, sessionId, t } = props;
        const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
        const snapshot = useSessions((value) => value);
        const statusMap = useSessionStatus((value) => value);
        const [pickerPane, setPickerPane] = useState(null);
        const [hoverPane, setHoverPane] = useState(undefined);
        const [paneNotice, setPaneNotice] = useState(null);
        const noticeTimers = useRef([]);
        const clearNoticeTimers = () => {
          for (const timer of noticeTimers.current) window.clearTimeout(timer);
          noticeTimers.current = [];
        };
        const flashPaneNotice = (index, text) => {
          clearNoticeTimers();
          setPaneNotice({ text, leaving: false });
          noticeTimers.current.push(
            window.setTimeout(() => {
              setPaneNotice((current) => (current === null ? null : { ...current, leaving: true }));
            }, 2600),
          );
          noticeTimers.current.push(
            window.setTimeout(() => {
              setPaneNotice(null);
              noticeTimers.current = [];
            }, 2600 + 220),
          );
        };
        useEffect(() => clearNoticeTimers, []);

        const stateRef = useRef(state);
        stateRef.current = state;
        const sessionIdRef = useRef(sessionId);
        sessionIdRef.current = sessionId;

        const count = Math.min(state.cols * state.rows, MAX_PANES);
        const paneIds = state.panes.slice(0, count);
        const { references, ready } = useSessionReferences(pool, paneIds);

        const paneIdsKey = paneIds.filter((id) => id !== null).join('\u0001');

        // Opening the split view puts the current Session in the first free pane
        // (top-left / left on the default 1 x 2 layout).
        useEffect(() => {
          if (typeof sessionId !== 'string' || sessionId.length === 0) return;
          const current = store.getSnapshot();
          const visibleCount = Math.min(current.cols * current.rows, MAX_PANES);
          const visible = current.panes.slice(0, visibleCount);
          if (visible.includes(sessionId)) return;
          const empty = visible.indexOf(null);
          if (empty < 0) return;
          store.assignToPane(empty, sessionId);
        }, []);

        // Switching to a Session that is already shown in the grid moves the pane
        // focus to it (e.g. the header subagent switcher opens child Session B while
        // the split view shows B as a pane).
        useEffect(() => {
          if (typeof sessionId !== 'string' || sessionId.length === 0) return;
          const current = store.getSnapshot();
          const visibleCount = Math.min(current.cols * current.rows, MAX_PANES);
          const index = current.panes.slice(0, visibleCount).indexOf(sessionId);
          if (index >= 0) store.setFocus(index);
        }, [sessionId]);

        // Watchdog: the current Session can have two composer arrangements (the
        // hidden resident one and its pane one) over ONE Lexical editor. If the
        // hidden one keeps the editor root, the visible pane composer accepts
        // native text that never reaches the draft (looks typed, cannot send).
        // Detect that and rebind by remounting the composer bars, restoring the
        // typed text through the draft API.
        useEffect(() => {
          if (typeof sessionId !== 'string' || sessionId.length === 0) return undefined;
          let consecutive = 0;
          let attempts = 0;
          let cooldownUntil = 0;
          const heal = (text) => {
            if (Date.now() < cooldownUntil || attempts >= 3) return false;
            attempts += 1;
            cooldownUntil = Date.now() + 2200;
            let dispose;
            try {
              dispose = ctx.slots.register(
                { name: 'conversation.composer.bar', priority: -1, locale: NS },
                function SplitComposerRebind() {
                  return null;
                },
              );
            } catch (error) {
              return false;
            }
            window.setTimeout(() => {
              try {
                dispose();
              } catch (error) {
                /* already disposed */
              }
            }, 90);
            window.setTimeout(() => {
              const entry = composerInputs.get(sessionId);
              if (entry?.inputActions?.setDraft !== undefined && typeof text === 'string' && text.length > 0) {
                try {
                  entry.inputActions.setDraft(text);
                } catch (error) {
                  console.warn(`[${NS}] could not restore the typed draft:`, error);
                }
              }
            }, 280);
            return true;
          };
          const timer = window.setInterval(() => {
            if (splitComposition.active || Date.now() < splitComposition.until) {
              consecutive = 0;
              return;
            }
            const state = store.getSnapshot();
            const count = Math.min(state.cols * state.rows, MAX_PANES);
            const index = state.panes.slice(0, count).indexOf(sessionId);
            if (index < 0) {
              consecutive = 0;
              return;
            }
            const pane = document.querySelector(`[data-pane="${index}"]`);
            if (pane === null) return;
            const editable = pane.querySelector('[data-composer-input]');
            if (editable === null) return;
            const typed = editable.textContent || '';
            const draft = splitDraftMirror.draft;
            if (typed.length === 0 || typeof draft !== 'string' || draft.length > 0) {
              consecutive = 0;
              return;
            }
            consecutive += 1;
            if (consecutive < 2) return;
            consecutive = 0;
            heal(typed);
          }, 520);
          return () => window.clearInterval(timer);
        }, [sessionId]);

        // Hide the resident composer only while the current Session lives inside a
        // pane; the pane's composer is then the single editable root for it.
        useEffect(
          () => () => {
            if (typeof sessionIdRef.current === 'string') setResidentComposerHidden(false);
          },
          [],
        );
        useEffect(() => {
          if (typeof sessionId !== 'string') {
            setResidentComposerHidden(false);
            return;
          }
          setResidentComposerHidden(paneIds.includes(sessionId));
        }, [sessionId, paneIdsKey]);

        // Drag & drop: Session rows from the sidebar and files dropped into a pane.
        useEffect(() => {
          const typeList = (event) => {
            const types = event.dataTransfer?.types;
            return types === undefined ? [] : Array.from(types);
          };
          const isFileDrag = (event) => typeList(event).includes('Files');
          const insideRoot = (event) => event.target instanceof Element && event.target.closest('[data-split-view]') !== null;
          const allowDropEffect = (dataTransfer) => {
            if (dataTransfer === null) return;
            // The sidebar browser drags with `effectAllowed = "move"`; forcing
            // `copy` there makes Chromium reject the drop entirely.
            const allowed = dataTransfer.effectAllowed;
            dataTransfer.dropEffect =
              allowed === 'copy' || allowed === 'copyMove' || allowed === 'copyLink' || allowed === 'all'
                ? 'copy'
                : 'move';
          };
          const onDragOver = (event) => {
            if (!insideRoot(event)) return;
            const index = paneIndexAt(event);
            setHoverPane((previous) => (previous === index ? previous : index));
            // File drags belong to the shipped attachment intake: leave their
            // default handling alone. Any other payload is a Session row from
            // the sidebar (dsh-projects / shipped workspace browser).
            if (isFileDrag(event)) return;
            event.preventDefault();
            allowDropEffect(event.dataTransfer);
          };
          const onDrop = (event) => {
            setHoverPane(undefined);
            if (!insideRoot(event)) return;
            if (isFileDrag(event)) {
              const transfer = event.dataTransfer;
              const files = transfer !== null ? Array.from(transfer.files) : [];
              if (files.length === 0) return;
              // Directories rely on host path references; leave those to the host.
              if (transfer !== null && transferHasDirectory(transfer)) return;
              const index = paneIndexAt(event);
              const dropIndex = index ?? stateRef.current.focus;
              const panes = stateRef.current.panes;
              const targetSession =
                panes[dropIndex] ?? panes[stateRef.current.focus] ?? (typeof sessionId === 'string' ? sessionId : null);
              if (typeof targetSession !== 'string' || targetSession.length === 0) return;
              // Subagent Sessions do not accept attachments anywhere in the product:
              // one-shot children use a read-only composer, continuable children reject
              // files at prompt time. Consume such a drop and explain it instead of
              // leaving a failed upload behind.
              if (sessionIsSubagent(ctx, targetSession)) {
                event.preventDefault();
                event.stopImmediatePropagation();
                flashPaneNotice(dropIndex, t('drop.subagentUnsupported'));
                return;
              }
              const composer = composerInputs.get(targetSession);
              const conversation = scopedConversationOf(ctx, targetSession);
              if (composer === undefined || composer.inputActions === undefined || conversation === undefined) {
                // Fall back to the shipped intake instead of swallowing the drop.
                return;
              }
              // Take the drop over: the shipped intake is installed once per mounted
              // composer arrangement, and the current Session can have two of them
              // (resident panel + pane), which would upload every file twice. One
              // explicit upload for the target Session replaces all of them.
              event.preventDefault();
              event.stopImmediatePropagation();
              try {
                const drafts = conversation.createDrafts(targetSession, files);
                if (Array.isArray(drafts) && drafts.length > 0) {
                  composer.inputActions.addAttachments(drafts.map((draft) => draft.id));
                }
              } catch (error) {
                console.warn(`[${NS}] could not route the dropped files:`, error);
              }
              return;
            }
            const dropped = readSessionIdFromDrop(event.dataTransfer);
            if (typeof dropped !== 'string' || dropped.length === 0) return;
            const known = ctx.sessions.list?.getSnapshot?.().byId?.[dropped] !== undefined;
            if (!known) return;
            event.preventDefault();
            event.stopPropagation();
            const index = paneIndexAt(event);
            const target = index ?? stateRef.current.focus;
            store.assignToPane(target, dropped);
          };
          const clearHover = () => setHoverPane(undefined);
          // The shipped attachment intake renders one full-page blurred DropOverlay
          // per mounted composer. In a split grid that stacks several overlays, and a
          // missed dragleave can leave them wedged open, blocking the view. The pane
          // highlight is the drag affordance while split is active, so keep those
          // overlays off: only their dragenter activation is suppressed, the drop
          // intake itself still runs and files land in the pane under the cursor.
          const suppressDropOverlay = (event) => {
            if (!typeList(event).includes('Files')) return;
            event.stopImmediatePropagation();
          };
          const onDragLeave = (event) => {
            if (event.target !== document.documentElement && event.target !== document.body) return;
            if (event.clientX > 0 && event.clientY > 0 && event.clientX < window.innerWidth && event.clientY < window.innerHeight) return;
            clearHover();
          };
          document.addEventListener('dragenter', suppressDropOverlay, true);
          document.addEventListener('dragover', onDragOver, true);
          document.addEventListener('drop', onDrop, true);
          document.addEventListener('dragleave', onDragLeave, true);
          window.addEventListener('dragend', clearHover, true);
          return () => {
            document.removeEventListener('dragenter', suppressDropOverlay, true);
            document.removeEventListener('dragover', onDragOver, true);
            document.removeEventListener('drop', onDrop, true);
            document.removeEventListener('dragleave', onDragLeave, true);
            window.removeEventListener('dragend', clearHover, true);
          };
        }, []);

        const openPicker = (index) => {
          store.setFocus(index);
          setPickerPane(index);
        };

        const visibleIds = paneIds.filter((id) => id !== null);
        const grid = h(
          'div',
          {
            className: 'dshsv-grid',
            style: {
              gridTemplateColumns: `repeat(${state.cols}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${state.rows}, minmax(0, 1fr))`,
            },
          },
          paneIds.map((paneSessionId, index) => {
            const node = paneSessionId === null ? undefined : snapshot.byId?.[paneSessionId];
            const reference = paneSessionId === null ? undefined : references[paneSessionId];
            const dropTarget = hoverPane === index;
            let body;
            if (paneSessionId === null) {
              body = h(
                'button',
                { type: 'button', className: `dshsv-empty${dropTarget ? ' is-drop-target' : ''}`, onClick: () => openPicker(index) },
                h(PlusGridIcon, { size: 18 }),
                h('span', null, t('pane.pick')),
              );
            } else if (reference === undefined) {
              body = ready
                ? h(
                    'div',
                    { className: 'dshsv-failure' },
                    h('span', null, t('pane.retainFailed')),
                    h('button', { type: 'button', className: 'dshsv-button', onClick: () => openPicker(index) }, t('pane.switch')),
                  )
                : h('div', { className: 'dshsv-failure' }, h('span', null, '…'));
            } else {
              body = h(SessionProvider, { session: reference, key: paneSessionId }, renderSlot(PANE_SLOT(index)));
            }
            return h(
              PaneFrame,
              {
                key: `pane-${index}`,
                index,
                paneSessionId,
                focused: state.focus === index,
                node,
                running: isRunning(statusMap, paneSessionId ?? undefined),
                dropTarget,
                t,
                onPick: () => openPicker(index),
                onClear: () => store.clearPane(index),
                onOpenMain: () => {
                  if (paneSessionId === null) return;
                  try {
                    ctx.uiWorkspace.openSession(paneSessionId);
                  } catch (error) {
                    console.warn(`[${NS}] could not open the session in the main view:`, error);
                  }
                },
                onFocus: () => store.setFocus(index),
              },
              body,
            );
          }),
        );

        const currentVisible = typeof sessionId === 'string' && visibleIds.includes(sessionId);
        return h(
          'div',
          { className: 'dshsv-root', 'data-split-view': '' },
          grid,
          paneNotice === null
            ? null
            : h(
                'div',
                { className: `dshsv-toast${paneNotice.leaving === true ? ' is-leaving' : ''}`, role: 'status' },
                h('span', { className: 'dshsv-toast-icon' }, h(Svg, null, h('circle', { cx: 8, cy: 8, r: 6.2 }), h('path', { d: 'M8 4.8v2.1' }), h('path', { d: 'M8 9.8v1.4' }))),
                h('span', null, paneNotice.text),
              ),
          pickerPane === null
            ? null
            : h(SessionPickerDialog, {
                paneIndex: pickerPane,
                snapshot,
                t,
                onClose: () => setPickerPane(null),
              }),
        );
      };
    }

    /** Hosts the grid in the frame-wide overlay layer, clipped to the View's rect. */
    function createSplitOverlayHost(gridComponent) {
      return function SplitOverlayHost(props) {
        const mode = useSyncExternalStore(splitMode.subscribe, splitMode.getSnapshot);
        if (mode.sessionId === null || mode.rect === null) return null;
        return h(
          'div',
          {
            className: 'dshsv-overlay',
            'data-split-view': '',
            style: {
              position: 'fixed',
              left: `${mode.rect.left}px`,
              top: `${mode.rect.top}px`,
              width: `${mode.rect.width}px`,
              height: `${mode.rect.height}px`,
              overflow: 'hidden',
              pointerEvents: 'auto',
            },
          },
          h(gridComponent, { ...props, sessionId: mode.sessionId }),
        );
      };
    }

    /** One pane's embedded Conversation body for the Session bound around it. */
    function PaneConversation(props) {
      const { sessionId, useSession, useConversation, useSessions, useInput, inputActions, renderFactorySlot } = props;
      const session = useSession((value) => value);
      const conversation = useConversation((value) => value);
      const summaryBlank = useSessions((value) => (sessionId === undefined ? undefined : value.byId[sessionId]?.blank));
      useEffect(
        () => registerComposerInput(sessionId, inputActions),
        [sessionId],
      );

      const shellPhase =
        conversation.activeTargets.size > 0 || (session.blank !== true && session.awaitingFirstTurn !== true) || session.running
          ? 'active'
          : session.promptAttempted
            ? 'engaging'
            : 'blank';
      const parentAvailabilityPending =
        session.subagent?.address?.mode === 'continuable' && session.subagent.parentAvailable === undefined;
      const settling =
        (shellPhase === 'blank' && session.openState === 'loading' && summaryBlank !== true) || parentAvailabilityPending;
      const hero = shellPhase === 'blank' && (session.openState === 'open' || summaryBlank === true);
      return renderFactorySlot(
        'conversation.content',
        {
          variant: 'embedded',
          phase: settling ? 'settling' : hero ? 'hero' : 'active',
          hero,
        },
        { slots: { views: PaneChatView } },
      );
    }

    /** Fixed Chat tab for an embedded Conversation occurrence. */
    function PaneChatView(props) {
      return props.renderSlot('conversation.session', { view: 'chat' });
    }

    // ---------------------------------------------------------------------
    // Plugin half
    // ---------------------------------------------------------------------
    const inject = ['slots', 'sessions', 'locale', 'uiWorkspace'];

    /**
     * @param ctx - Client plugin context carrying Slots, Sessions, Locale, and Workspace.
     */
    function apply(ctx) {
      const store = createStore();
      const pool = createSessionPool(ctx);
      const t = ctx.locale.bind(NS);

      ctx.effect(() => ctx.locale.register(NS, { zh, en }), `${NS}: locale dictionaries`);

      ctx.effect(() => {
        const tag = document.createElement('style');
        tag.dataset.plugin = '@wxysskd/dsh-split-view';
        tag.dataset.pluginCss = '@wxysskd/dsh-split-view/split-view.css';
        tag.textContent = CSS;
        document.head.appendChild(tag);
        return () => tag.remove();
      }, `${NS}: styles`);

      // While the current Session is rendered inside a pane, the resident composer
      // seat is hidden with CSS (the pane's composer then owns the one editable
      // Lexical root). Chain replacement is not usable here: it is per Session, so
      // it would hide the pane occurrence too. When the seat becomes visible again
      // its InputBar is cleanly remounted, because the editor root was borrowed by
      // the pane occurrence in the meantime.
      const gateStyle = document.createElement('style');
      gateStyle.dataset.plugin = '@wxysskd/dsh-split-view';
      gateStyle.dataset.pluginCss = '@wxysskd/dsh-split-view/resident-composer-gate.css';
      gateStyle.textContent = '[data-composer-seat]:not([data-split-view] *){display:none!important}';
      gateStyle.disabled = true;
      document.head.appendChild(gateStyle);

      let healToken = 0;
      let healShadowDispose;
      let healTimer;
      let healWatchdog;
      let healSince = 0;
      const cancelComposerHeal = () => {
        healToken += 1;
        if (healTimer !== undefined) {
          window.clearTimeout(healTimer);
          healTimer = undefined;
        }
        if (healWatchdog !== undefined) {
          window.clearTimeout(healWatchdog);
          healWatchdog = undefined;
        }
        try {
          healShadowDispose?.();
        } catch (error) {
          /* already disposed */
        }
        healShadowDispose = undefined;
        healSince = 0;
      };
      const scheduleComposerHeal = () => {
        cancelComposerHeal();
        const token = healToken;
        try {
          // Registered inside a ctx.effect so plugin unload/HMR can never strand
          // the remount shadow: the effect disposer removes the slot entry.
          healShadowDispose = ctx.effect(() => {
            const dispose = ctx.slots.register(
              { name: 'conversation.composer.bar', priority: -1, locale: NS },
              function SplitComposerRemount() {
                return null;
              },
            );
            return () => {
              try {
                dispose();
              } catch (error) {
                /* already disposed */
              }
            };
          });
        } catch (error) {
          console.warn(`[${NS}] could not remount the resident composer:`, error);
          return;
        }
        healSince = Date.now();
        const finish = () => {
          if (token !== healToken) return;
          if (healTimer !== undefined) {
            window.clearTimeout(healTimer);
            healTimer = undefined;
          }
          if (healWatchdog !== undefined) {
            window.clearTimeout(healWatchdog);
            healWatchdog = undefined;
          }
          try {
            healShadowDispose?.();
          } catch (error) {
            /* already disposed */
          }
          healShadowDispose = undefined;
          healSince = 0;
        };
        healTimer = window.setTimeout(finish, 120);
        healWatchdog = window.setTimeout(finish, 2000);
      };
      const setResidentComposerHidden = (hidden) => {
        const next = hidden === true;
        if (gateStyle.disabled === !next) return;
        gateStyle.disabled = !next;
        // Both transitions remount the composer bars once: the resident occurrence
        // mounts before the pane occurrence, so the visible pane composer ends up
        // owning the single editable Lexical root (and the resident composer is
        // cleanly re-bound when it becomes visible again).
        scheduleComposerHeal();
      };
      let lastHidden = false;
      // Watchdog: the gate may only be enabled while a split view surface is in
      // the DOM. If an unmount path ever misses the reset, restore the composer
      // within a second instead of leaving the input box gone.
      const safetyTimer = window.setInterval(() => {
        try {
          const overlayPresent = document.querySelector('[data-split-view]') !== null;
          if (!overlayPresent) {
            if (gateStyle.disabled === false) setResidentComposerHidden(false);
            if (healShadowDispose !== undefined && healSince !== 0 && Date.now() - healSince > 500) cancelComposerHeal();
          }
        } catch (error) {
          /* keep watching */
        }
      }, 800);
      ctx.effect(
        () => {
          const start = () => {
            splitComposition.active = true;
          };
          const end = () => {
            splitComposition.active = false;
            splitComposition.until = Date.now() + 500;
          };
          document.addEventListener('compositionstart', start, true);
          document.addEventListener('compositionend', end, true);
          return () => {
            document.removeEventListener('compositionstart', start, true);
            document.removeEventListener('compositionend', end, true);
            splitComposition.active = false;
          };
        },
        `${NS}: composition guard`,
      );

      ctx.effect(
        () => () => {
          window.clearInterval(safetyTimer);
          cancelComposerHeal();
          gateStyle.remove();
        },
        `${NS}: resident composer gate teardown`,
      );

      // Layout selector lives in the Conversation header utilities row; it only
      // renders while THIS Session's split view is the active one.
      function SplitLayoutControl(props) {
        const { sessionId: controlSessionId, t } = props;
        const mode = useSyncExternalStore(splitMode.subscribe, splitMode.getSnapshot);
        const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
        if (mode.sessionId === null || mode.sessionId !== controlSessionId) return null;
        return h(
          'label',
          { className: 'dshsv-header-chip', title: t('layout.label') },
          h(
            'select',
            {
              className: 'dshsv-select',
              value: layoutFor(state.cols, state.rows).id,
              'aria-label': t('layout.label'),
              onChange: (event) => store.setLayout(event.target.value),
            },
            LAYOUTS.map((layout) => h('option', { key: layout.id, value: layout.id }, t(`layout.${layout.id}`))),
          ),
        );
      }

      const SplitGrid = createSplitGrid(ctx, store, pool, setResidentComposerHidden);
      const SplitViewPlaceholder = createSplitViewEntry(ctx, store);
      const SplitOverlayHost = createSplitOverlayHost(SplitGrid);

      // Per-pane Session-scoped local slots live on the overlay entry; their
      // occupants render the embedded Conversation for the Session bound by the
      // surrounding SessionProvider.
      const children = {};
      for (let index = 0; index < MAX_PANES; index += 1) {
        children[PANE_SLOT(index)] = { kind: 'single', scope: 'session' };
      }

      ctx.effect(
        () =>
          ctx.slots.inject('shell.overlay', () =>
            ctx.slots.register(
              {
                name: 'shell.overlay',
                id: 'split-view-grid',
                locale: NS,
                children,
              },
              SplitOverlayHost,
            ),
          ),
        `${NS}: overlay grid`,
      );

      ctx.effect(
        () =>
          ctx.slots.inject('conversation.session.header.utilities', () =>
            ctx.slots.register(
              {
                name: 'conversation.session.header.utilities',
                id: 'split-view-layout',
                order: 40,
                locale: NS,
              },
              SplitLayoutControl,
            ),
          ),
        `${NS}: layout control`,
      );

      ctx.effect(
        () =>
          ctx.slots.inject('conversation.view', () =>
            ctx.slots.register(
              {
                name: 'conversation.view',
                id: VIEW_ID,
                order: 20,
                locale: NS,
                label: () => t('view.label'),
              },
              SplitViewPlaceholder,
            ),
          ),
        `${NS}: split view tab`,
      );

      for (let index = 0; index < MAX_PANES; index += 1) {
        ctx.effect(
          () =>
            ctx.slots.inject(PANE_SLOT(index), () =>
              ctx.slots.register({ name: PANE_SLOT(index), locale: NS }, PaneConversation),
            ),
          `${NS}: pane ${index}`,
        );
      }

      ctx.effect(() => () => pool.dispose(), `${NS}: session reference teardown`);
    }

    const module = { exports: {} };
    module.exports.apply = apply;
    module.exports.inject = inject;
    return module.exports;
  },
});

