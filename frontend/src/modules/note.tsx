import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { cfgStr, defineModule } from '@/sdk';
import type { WidgetProps } from '@/sdk';

const URL_RE = /(https?:\/\/[^\s)]+)/g;

function inline(text: string): ComponentChildren[] {
  const out: ComponentChildren[] = [];
  text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).forEach((chunk, i) => {
    if (/^\*\*[^*]+\*\*$/.test(chunk)) { out.push(<strong key={`b${i}`}>{chunk.slice(2, -2)}</strong>); return; }
    if (/^`[^`]+`$/.test(chunk)) { out.push(<code key={`c${i}`}>{chunk.slice(1, -1)}</code>); return; }
    chunk.split(URL_RE).forEach((part, j) => {
      if (/^https?:\/\//.test(part)) out.push(<a key={`u${i}-${j}`} href={part} target="_blank" rel="noopener noreferrer">{part.replace(/^https?:\/\//, '')}</a>);
      else if (part) out.push(part);
    });
  });
  return out;
}

function Rendered({ text, onToggle }: { text: string; onToggle: (line: number) => void }) {
  const lines = text.split('\n');
  return (
    <div class="m-note-view">
      {lines.map((line, i) => {
        const task = /^\s*[-*] \[( |x|X)\] (.*)$/.exec(line);
        if (task) {
          const done = task[1].toLowerCase() === 'x';
          return (
            <label key={i} class={done ? 'task done' : 'task'} onClick={(e) => e.stopPropagation()}>
              <input type="checkbox" checked={done} onChange={() => onToggle(i)} /> <span>{inline(task[2])}</span>
            </label>
          );
        }
        const h = /^(#{1,3}) (.*)$/.exec(line);
        if (h) return <div key={i} class={`h h${h[1].length}`}>{inline(h[2])}</div>;
        const li = /^\s*[-*] (.*)$/.exec(line);
        if (li) return <div key={i} class="li">{inline(li[1])}</div>;
        if (!line.trim()) return <div key={i} class="gap" />;
        return <div key={i}>{inline(line)}</div>;
      })}
    </div>
  );
}

function Note({ config, ctx }: WidgetProps) {
  const content = cfgStr(config, 'content');
  const title = cfgStr(config, 'note_title');
  const style = cfgStr(config, 'style', 'plain');
  const font = cfgStr(config, 'font_size', 'normal');
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState(content);
  const ta = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (!edit) setDraft(content); }, [content, edit]);
  useEffect(() => { if (edit) ta.current?.focus(); }, [edit]);

  const commit = () => {
    setEdit(false);
    if (draft !== content) ctx.setConfig({ content: draft });
  };
  const toggle = (line: number) => {
    const lines = content.split('\n');
    lines[line] = lines[line].replace(/\[( |x|X)\]/, (m) => (m === '[ ]' ? '[x]' : '[ ]'));
    ctx.setConfig({ content: lines.join('\n') });
  };

  return (
    <div class={`m-note m-note-${style} m-note-${font}`} onDblClick={() => setEdit(true)}>
      {title && <div class="m-note-title">{title}</div>}
      {edit ? (
        <textarea ref={ta} value={draft} onInput={(e) => setDraft((e.target as HTMLTextAreaElement).value)} onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Escape') { setDraft(content); setEdit(false); } if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) commit(); }}
          placeholder={ctx.t('- [ ] Aufgabe\n# Überschrift\n**fett**, Links …', '- [ ] task\n# heading\n**bold**, links …')} />
      ) : content.trim() ? (
        <Rendered text={content} onToggle={toggle} />
      ) : (
        <button type="button" class="m-note-empty" onClick={() => setEdit(true)}>{ctx.t('Doppelklick zum Schreiben …', 'Double-click to write …')}</button>
      )}
    </div>
  );
}

defineModule({
  type: 'note',
  name: { de: 'Notiz', en: 'Note' },
  description: { de: 'Notizen & Checklisten, direkt im Widget bearbeiten', en: 'Notes & checklists, edit inline' },
  icon: 'sticky-note',
  category: 'productivity',
  size: { w: 6, h: 5 },
  schema: [
    { key: 'note_title', type: 'text', label: 'Titel (optional)', default: '' },
    { key: 'content', type: 'textarea', label: 'Inhalt', default: '', rows: 8 },
    { key: 'style', type: 'select', label: 'Stil', default: 'plain', options: ['plain', 'info', 'success', 'warning', 'danger'].map((v) => ({ value: v, label: v })) },
    { key: 'font_size', type: 'select', label: 'Schriftgröße', default: 'normal', options: [{ value: 'klein', label: 'Klein' }, { value: 'normal', label: 'Normal' }, { value: 'groß', label: 'Groß' }] },
  ],
  component: Note,
});
