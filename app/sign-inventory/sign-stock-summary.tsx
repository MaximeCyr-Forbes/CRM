import type { Stock } from '../lib/sign-inventory/model';

export function SignStockSummary({ stock }: { stock: Stock[] }) {
 const signs = stock.filter(item => item.kind === 'sign');
 return <>
  <dl aria-label="Inventaire total des pancartes">{signs.map(item =>
   <div key={item.id} className="sign-stock-chip"><dt>{item.label}</dt><dd>{item.total}<span className="sign-sr"> au total</span></dd></div>
  )}</dl>
  <div className="sign-warehouse">
   <span>À l’entrepôt</span>
   <dl aria-label="Pancartes à l’entrepôt">{signs.map(item =>
    <div key={item.id}><dt>{item.label}</dt><dd>{Math.max(0, item.available)}</dd></div>
   )}</dl>
  </div>
 </>;
}
