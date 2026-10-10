import * as classes from './procreate-brush-library.module.scss';
import { LANG } from '../../language/language';
import { decodeTip, extractProcreate, MAX_BRUSHES, settings } from '../brushes/procreate/import-procreate';
import { loadTips, saveTips, TSavedTip } from '../brushes/procreate/tip-storage';
import { TProcreateProfile } from '../brushes/procreate/brush-profile';

export function createProcreateBrushLibrary(p: {
    isDrawing: () => boolean;
    onSelect: (canvas: HTMLCanvasElement | undefined, spacing?: number,
        profile?: TProcreateProfile, grain?: HTMLCanvasElement) => void;
}) {
    const root = document.createElement('div');
    root.className = classes.library;
    const heading = document.createElement('div');
    heading.className = classes.heading;
    heading.textContent = LANG('brush-library-title');
    const count = document.createElement('span');
    heading.append(count);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = classes.importButton;
    button.textContent = LANG('brush-import-procreate');
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.brush,.brushset';
    input.hidden = true;
    const select = document.createElement('select');
    select.setAttribute('aria-label', LANG('brush-import-library'));
    select.className = classes.select;
    const gallery = document.createElement('div');
    gallery.className = classes.gallery;
    gallery.setAttribute('aria-label', LANG('brush-import-library'));
    const progress = document.createElement('progress');
    progress.className = classes.progress;
    progress.setAttribute('aria-label', LANG('brush-import-loading'));
    progress.hidden = true;
    const preview = document.createElement('img');
    preview.alt = '';
    preview.width = preview.height = 44;
    preview.className = classes.tip;
    preview.hidden = true;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = LANG('brush-import-remove');
    remove.disabled = true;
    const row = document.createElement('div');
    row.className = classes.actions;
    row.append(preview, remove);
    const note = document.createElement('small');
    note.textContent = LANG('brush-import-note');
    note.className = classes.note;
    const report = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = LANG('brush-import-compatibility');
    const reportText = document.createElement('small');
    reportText.style.overflowWrap = 'anywhere';
    report.append(summary, reportText);
    report.hidden = true;
    const status = document.createElement('small');
    status.setAttribute('role', 'status');
    status.style.overflowWrap = 'anywhere';
    status.className = classes.status;
    root.append(heading, button, input, progress, select, gallery, row, report, note, status);
    let tips: TSavedTip[] = [];
    const savedIds = new Set<string>();
    let selected = '';
    let revision = 0;
    let busy = false;
    const setBusy = (value: boolean) => {
        busy = value;
        button.disabled = select.disabled = value;
        remove.disabled = value || !selected;
        root.setAttribute('aria-busy', String(value));
        gallery.querySelectorAll('button').forEach((item) => { item.disabled = value; });
    };
    const updateSelection = () => {
        gallery.querySelectorAll<HTMLButtonElement>('button').forEach((item) => {
            item.setAttribute('aria-pressed', String(item.dataset.id === selected));
        });
    };
    const refresh = () => {
        select.replaceChildren(new Option(LANG('brush-import-built-in'), ''));
        tips.forEach((tip) => select.add(new Option(tip.name, tip.id)));
        select.value = selected;
        count.textContent = String(tips.length);
        gallery.replaceChildren();
        if (!tips.length) {
            const empty = document.createElement('div');
            empty.className = classes.empty;
            empty.textContent = LANG('brush-library-empty');
            gallery.append(empty);
        }
        const groups = new Map<string, TSavedTip[]>();
        tips.forEach((tip) => {
            const name = tip.setName || LANG('brush-import-library');
            if (!groups.has(name)) groups.set(name, []);
            groups.get(name)!.push(tip);
        });
        groups.forEach((items, name) => {
            const label = document.createElement('div');
            label.className = classes.setName;
            label.textContent = name;
            gallery.append(label);
            items.forEach((tip) => {
                const card = document.createElement('button');
                card.type = 'button';
                card.className = classes.card;
                card.dataset.id = tip.id;
                card.disabled = busy;
                card.setAttribute('aria-label', tip.name);
                const title = document.createElement('span');
                title.textContent = tip.name;
                const sample = document.createElement('canvas');
                sample.width = 440;
                sample.height = 88;
                sample.setAttribute('aria-hidden', 'true');
                // A lightweight shape sample, not a promise of exact Procreate rendering.
                const shape = new Image();
                shape.onload = () => {
                    const ctx = sample.getContext('2d')!;
                    for (let x = 24; x < 416; x += Math.max(2, Math.min(14, tip.spacing * 24))) {
                        const t = (x - 24) / 392;
                        const size = 12 + 28 * Math.sin(Math.PI * t);
                        ctx.globalAlpha = 0.65;
                        ctx.drawImage(shape, x - size / 2, 44 + Math.sin(t * Math.PI * 2) * 14 - size / 2, size, size);
                    }
                };
                shape.src = tip.image;
                card.append(title, sample);
                card.onclick = () => {
                    if (busy || p.isDrawing()) return;
                    void activate(tip.id).catch(() => { status.textContent = LANG('brush-import-failed'); });
                };
                gallery.append(card);
            });
        });
        updateSelection();
    };
    const clearSelection = () => {
        revision++;
        selected = select.value = '';
        preview.hidden = true;
        report.hidden = true;
        remove.disabled = true;
        updateSelection();
    };
    const activate = async (id: string) => {
        const current = ++revision;
        const tip = tips.find((item) => item.id === id);
        if (!tip) {
            clearSelection();
            p.onSelect(undefined);
            return;
        }
        const loadImage = async (src: string): Promise<HTMLCanvasElement> => {
            const img = new Image();
            await new Promise<void>((resolve, reject) => {
                img.onload = () => resolve();
                img.onerror = () => reject(new Error(LANG('brush-import-failed')));
                img.src = src;
            });
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            canvas.getContext('2d')!.drawImage(img, 0, 0);
            return canvas;
        };
        const canvas = await loadImage(tip.image);
        const grain = tip.grain ? await loadImage(tip.grain) : undefined;
        if (current !== revision) return;
        if (p.isDrawing()) { select.value = selected; return; }
        p.onSelect(canvas, tip.spacing, tip.profile, grain);
        selected = select.value = id;
        updateSelection();
        preview.src = tip.image;
        preview.alt = tip.name;
        preview.hidden = false;
        report.hidden = false;
        reportText.textContent = tip.profile
            ? `${LANG('brush-import-approximation')} ${tip.unhandled?.length
                ? `${LANG('brush-import-unhandled')} ${tip.unhandled.join(', ')}` : ''}`
            : LANG('brush-import-legacy');
        remove.disabled = busy;
    };
    select.onchange = () => {
        if (p.isDrawing()) { select.value = selected; return; }
        void activate(select.value).catch(() => {
            select.value = selected;
            status.textContent = LANG('brush-import-failed');
        });
    };
    button.onclick = () => input.click();
    input.onchange = async () => {
        const file = input.files?.[0];
        input.value = '';
        if (!file || busy) return;
        setBusy(true);
        progress.hidden = false;
        progress.removeAttribute('value');
        status.textContent = LANG('brush-import-loading');
        try {
            if (file.size > 50 * 1024 * 1024) throw new Error('Brush files must be smaller than 50 MB.');
            // Allow the busy state to paint before decoding the archive.
            await new Promise((resolve) => setTimeout(resolve, 0));
            const result = extractProcreate(new Uint8Array(await file.arrayBuffer()), file.name);
            if (tips.length + result.tips.length > MAX_BRUSHES) throw new Error('The library holds up to 100 brushes. Remove some brushes first.');
            const added: TSavedTip[] = [];
            progress.max = result.tips.length || 1;
            progress.value = 0;
            for (const tip of result.tips) {
                try {
                    const canvas = await decodeTip(tip.png, tip.inverted, 1024);
                    const grain = tip.grain ? await decodeTip(tip.grain, tip.profile.grainInverted, 1024, true) : undefined;
                    const id = Array.from(crypto.getRandomValues(new Uint8Array(16)),
                        (value) => value.toString(16).padStart(2, '0')).join('');
                    added.push({ id, setName: file.name.replace(/\.(brushset|brush)$/i, ''), name: tip.name, spacing: tip.spacing, image: canvas.toDataURL(),
                        grain: grain?.toDataURL(), profile: tip.profile, unhandled: tip.unhandled,
                        source: { archive: tip.archive, shape: tip.png, grain: tip.grain, secondary: tip.secondary } });
                } catch { result.skipped.push(tip.name); }
                progress.value++;
                await new Promise((resolve) => setTimeout(resolve, 0));
            }
            tips.push(...added);
            refresh();
            let message = `${LANG('brush-import-count')} ${added.length}.`;
            if (result.skipped.length) message += ` ${LANG('brush-import-skipped')} ${result.skipped.join(', ')}`;
            try {
                await saveTips(added);
                added.forEach((tip) => savedIds.add(tip.id));
            }
            catch { message += ` ${LANG('brush-import-unsaved')}`; }
            status.textContent = message;
            if (added.length) await activate(added[0].id);
        } catch (error) {
            status.textContent = `${LANG('brush-import-failed')} ${error instanceof Error ? error.message : ''}`;
        } finally { setBusy(false); progress.hidden = true; }
    };
    remove.onclick = async () => {
        if (!selected || busy || p.isDrawing()) return;
        setBusy(true);
        try {
            if (savedIds.has(selected)) await saveTips([], selected);
            savedIds.delete(selected);
            tips = tips.filter((tip) => tip.id !== selected);
            clearSelection();
            refresh();
            p.onSelect(undefined);
            status.textContent = '';
        } catch { status.textContent = LANG('brush-import-storage-error'); }
        finally { setBusy(false); }
    };
    refresh();
    setBusy(true);
    void loadTips().then((saved) => {
        // Profiles are stored at import time; re-read them so importer fixes reach old brushes.
        saved.forEach((tip) => {
            if (!tip.source?.archive || !tip.profile) return;
            try {
                const { profile, unhandled } = settings(tip.source.archive);
                tip.profile = profile;
                tip.unhandled = unhandled;
            } catch { /* keep the stored profile */ }
        });
        tips = saved;
        saved.forEach((tip) => savedIds.add(tip.id));
        refresh();
    })
        .catch(() => { status.textContent = LANG('brush-import-unsaved'); })
        .finally(() => setBusy(false));
    return { element: root, clearSelection };
}
