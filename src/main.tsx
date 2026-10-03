import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './ui/App';
import { InventoryProvider } from './ui/inventory-context';
import './ui/styles.css';
import './ui/purchasing.css';
import './ui/accessibility.css';
import "./design.css";

createRoot(document.getElementById('root')!).render(<StrictMode><InventoryProvider><App /></InventoryProvider></StrictMode>);
