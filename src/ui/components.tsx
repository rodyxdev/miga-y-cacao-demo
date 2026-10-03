import { useEffect, useRef, type ReactNode } from 'react';
import { ArrowRight, Wheat, X, Inbox, type LucideIcon } from 'lucide-react';
import { statusText, type Ingredient, statusOf } from '../seed/prototype';

export function Brand({ light = false }: { light?: boolean }) {
  return <div className={`brand ${light ? 'brand-light' : ''}`}><span className="brand-mark"><Wheat size={27} strokeWidth={1.4}/></span><div><strong>Miga y Cacao</strong><small>REPOSTERÍA · DEMO</small></div></div>;
}
export function Button({ children, onClick, icon: Icon, variant = 'primary', type = 'button', disabled = false, className = '' }: { children: ReactNode; onClick?: () => void; icon?: LucideIcon; variant?: 'primary' | 'secondary' | 'ghost'; type?: 'button' | 'submit'; disabled?: boolean; className?: string }) {
  return <button className={`button button-${variant} ${className}`} type={type} onClick={onClick} disabled={disabled}>{Icon && <Icon size={17}/>}<span>{children}</span></button>;
}
export function StockBadge({ item }: { item: Ingredient }) { const status = statusOf(item); return <span className={`badge badge-${status}`}><i/>{statusText[status]}</span>; }
export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: string }) { return <span className={`badge badge-${tone}`}>{children}</span>; }
export function ItemMark({ item, small = false }: { item: Ingredient; small?: boolean }) { return <span className={`item-mark tone-${item.tone} ${small ? 'small' : ''}`} aria-hidden="true"><Wheat size={small ? 16 : 21} strokeWidth={1.3}/></span>; }
export function SectionHeading({ title, subtitle, action, onAction }: { title: string; subtitle?: string; action?: string; onAction?: () => void }) {
  return <div className="section-heading"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action && <button className="text-button" onClick={onAction}>{action}<ArrowRight size={15}/></button>}</div>;
}
export function EmptyState({ title = 'No encontramos resultados', text = 'Prueba con otra búsqueda o cambia los filtros.' }: { title?: string; text?: string }) { return <div className="empty-state"><Inbox size={32} strokeWidth={1.3}/><h3>{title}</h3><p>{text}</p></div>; }
export function Modal({ title, eyebrow, onClose, children, wide = false }: { title: string; eyebrow?: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current!; const origin = document.activeElement as HTMLElement | null; dialog.showModal(); const previous = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = previous; if (dialog.open) dialog.close(); if (origin?.isConnected) origin.focus({ preventScroll: true }); }; }, []);
  return <dialog className={`modal ${wide ? 'modal-wide' : ''}`} ref={ref} aria-labelledby="dialog-title" onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose(); }}><div className="modal-head"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h2 id="dialog-title">{title}</h2></div><button className="icon-button" onClick={onClose} aria-label="Cerrar ventana"><X size={20}/></button></div><div className="modal-body">{children}</div></dialog>;
}
export function PrototypeNote() { return <div className="prototype-note"><span className="small-dot"/>Vista previa: puedes revisar la captura. Los registros de ejemplo no se modifican.</div>; }
