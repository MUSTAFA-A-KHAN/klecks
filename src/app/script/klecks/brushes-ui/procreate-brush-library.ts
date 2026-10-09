import { LANG } from '../../language/language';
import { decodeTip, extractProcreate, MAX_BRUSHES } from '../brushes/procreate/import-procreate';
import { loadTips, saveTips, TSavedTip } from '../brushes/procreate/tip-storage';

export function createProcreateBrushLibrary(p: {
    isDrawing: () => boolean;
    onSelect: (canvas: HTMLCanvasElement | undefined, spacing?: number) => void;
}) {
    const root = document.createElement('div');
    root.style.cssText = 'margin-top:10px;display:flex;flex-direction:column;gap:6px';
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = LANG('brush-import-procreate');
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.brush,.brushset';
    input.hidden = true;
    const select = document.createElement('select');
    select.setAttribute('aria-label', LANG('brush-import-library'));
    select.style.cssText = 'width:100%;min-width:0';
    const preview = document.createElement('img');
    preview.alt = '';
    preview.width = preview.height = 44;
    preview.style.cssText = 'background:white;object-fit:contain;border:1px solid #888';
    preview.hidden = true;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = LANG('brush-import-remove');
    remove.disabled = true;
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:6px;align-items:center';
    row.append(preview, remove);
    const note = document.createElement('small');
    note.textContent = LANG('brush-import-note');
    const status = document.createElement('small');
    status.setAttribute('role', 'status');
    status.style.overflowWrap = 'anywhere';
    root.append(button, input, select, row, note, status);
    let tips: TSavedTip[] = [];
    const savedIds = new Set<string>();
    let selected = '';
    let revision = 0;
    let busy = false;
    const setBusy = (value: boolean) => {
        busy = value;
        button.disabled = select.disabled = value;
        remove.disabled = value || !selected;
    };
    const refresh = () => {
        select.replaceChildren(new Option(LANG('brush-import-built-in'), ''));
        tips.forEach((tip) => select.add(new Option(tip.name, tip.id)));
        select.value = selected;
    };
    const clearSelection = () => {
        revision++;
        selected = select.value = '';
        preview.hidden = true;
        remove.disabled = true;
    };
    const activate = async (id: string) => {
        const current = ++revision;
        const tip = tips.find((item) => item.id === id);
        if (!tip) {
            clearSelection();
            p.onSelect(undefined);
            return;
        }
        const img = new Image();
        await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject(new Error(LANG('brush-import-failed')));
            img.src = tip.image;
        });
        if (current !== revision) return;
        if (p.isDrawing()) { select.value = selected; return; }
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 256;
        canvas.getContext('2d')!.drawImage(img, 0, 0, 256, 256);
        p.onSelect(canvas, tip.spacing);
        selected = select.value = id;
        preview.src = tip.image;
        preview.hidden = false;
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
        status.textContent = LANG('brush-import-loading');
        try {
            if (file.size > 50 * 1024 * 1024) throw new Error('Brush files must be smaller than 50 MB.');
            // Allow the busy state to paint before decoding the archive.
            await new Promise((resolve) => setTimeout(resolve, 0));
            const result = extractProcreate(new Uint8Array(await file.arrayBuffer()), file.name);
            if (tips.length + result.tips.length > MAX_BRUSHES) throw new Error('The library holds up to 100 brushes. Remove some brushes first.');
            const added: TSavedTip[] = [];
            for (const tip of result.tips) {
                try {
                    const canvas = await decodeTip(tip.png, tip.inverted);
                    const id = Array.from(crypto.getRandomValues(new Uint8Array(16)),
                        (value) => value.toString(16).padStart(2, '0')).join('');
                    added.push({ id, name: tip.name, spacing: tip.spacing, image: canvas.toDataURL() });
                } catch { result.skipped.push(tip.name); }
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
        } finally { setBusy(false); }
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
        tips = saved;
        saved.forEach((tip) => savedIds.add(tip.id));
        refresh();
    })
        .catch(() => { status.textContent = LANG('brush-import-unsaved'); })
        .finally(() => setBusy(false));
    return { element: root, clearSelection };
}
