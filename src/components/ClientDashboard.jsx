import { useState, useEffect } from 'react';
import AdvancedPriceChecker from './AdvancedPriceChecker';
import MetricsView from './MetricsView';
import ConfigurationsView from './ConfigurationsView';
import CompletedOrdersView from './CompletedOrdersView';
import InventoryView from './InventoryView';
import { supabase } from '../supabaseClient';
import { ChevronRight, Search, Menu, Settings, Box, Factory, LogOut, Archive, Package } from 'lucide-react';

const DEFAULT_SYSTEM_CONFIG = {
  baseCostRate: 14.16,
  printerKwhPerHour: 0.2,
  powerSurgeKwh: 1.3,
  hourlyLaborRate: 250,
  filamentChangeCost: 0.1,
  sandingCost: 500,
  paintingCost: 800,
  assemblyCost: 350,
  failureRatePercent: 10,
  markupPercent: 30,
  familyMarkupPercent: 15,
  wearTearCostPer15Min: 2.5,
};

function mapConfigRowToState(row) {
  return {
    baseCostRate: Number(row.base_cost_rate),
    printerKwhPerHour: Number(row.printer_kwh_per_hour),
    powerSurgeKwh: Number(row.power_surge_kwh),
    hourlyLaborRate: Number(row.hourly_labor_rate),
    filamentChangeCost: Number(row.filament_change_cost),
    sandingCost: Number(row.sanding_cost),
    paintingCost: Number(row.painting_cost),
    assemblyCost: Number(row.assembly_cost),
    failureRatePercent: Number(row.failure_rate_percent),
    markupPercent: Number(row.markup_percent),
    familyMarkupPercent: Number(row.family_markup_percent || 15),
    wearTearCostPer15Min: Number(row.wear_tear_cost_per_15_min),
  };
}

function mapConfigStateToRow(config) {
  return {
    id: 1,
    base_cost_rate: config.baseCostRate,
    printer_kwh_per_hour: config.printerKwhPerHour,
    power_surge_kwh: config.powerSurgeKwh,
    hourly_labor_rate: config.hourlyLaborRate,
    filament_change_cost: config.filamentChangeCost,
    sanding_cost: config.sandingCost,
    painting_cost: config.paintingCost,
    assembly_cost: config.assemblyCost,
    failure_rate_percent: config.failureRatePercent,
    markup_percent: config.markupPercent,
    family_markup_percent: config.familyMarkupPercent || 15,
    wear_tear_cost_per_15_min: config.wearTearCostPer15Min,
    updated_at: new Date().toISOString(),
  };
}

export default function ClientDashboard() {
  const [selectedClient, setSelectedClient] = useState('John Doe Studios');
  const [selectedOrder, setSelectedOrder] = useState('ORD-2024-089');
  const [activeTab, setActiveTab] = useState('Calculator');
  const [configLoading, setConfigLoading] = useState(true);
  const [configSaving, setConfigSaving] = useState(false);
  
  const [systemConfig, setSystemConfig] = useState(() => {
    const saved = localStorage.getItem('nexusPrintConfig');
    if (saved) return { ...DEFAULT_SYSTEM_CONFIG, ...JSON.parse(saved) };
    return DEFAULT_SYSTEM_CONFIG;
  });

  useEffect(() => {
    localStorage.setItem('nexusPrintConfig', JSON.stringify(systemConfig));
  }, [systemConfig]);

  useEffect(() => {
    let cancelled = false;

    const loadConfig = async () => {
      setConfigLoading(true);

      const { data, error } = await supabase
        .from('system_configurations')
        .select('*')
        .eq('id', 1)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        console.error('Failed to load system configuration from Supabase:', error);
        setConfigLoading(false);
        return;
      }

      if (data) {
        setSystemConfig(mapConfigRowToState(data));
        setConfigLoading(false);
        return;
      }

      const fallbackConfig = (() => {
        const saved = localStorage.getItem('nexusPrintConfig');
        return saved ? { ...DEFAULT_SYSTEM_CONFIG, ...JSON.parse(saved) } : DEFAULT_SYSTEM_CONFIG;
      })();

      const { data: insertedData, error: upsertError } = await supabase
        .from('system_configurations')
        .upsert(mapConfigStateToRow(fallbackConfig), { onConflict: 'id' })
        .select()
        .single();

      if (cancelled) return;

      if (upsertError) {
        console.error('Failed to initialize system configuration in Supabase:', upsertError);
        setSystemConfig(fallbackConfig);
      } else {
        setSystemConfig(mapConfigRowToState(insertedData));
      }

      setConfigLoading(false);
    };

    loadConfig();

    return () => {
      cancelled = true;
    };
  }, []);

  const saveSystemConfig = async (nextConfig) => {
    setConfigSaving(true);

    const { data, error } = await supabase
      .from('system_configurations')
      .upsert(mapConfigStateToRow(nextConfig), { onConflict: 'id' })
      .select()
      .single();

    setConfigSaving(false);

    if (error) {
      console.error('Failed to save system configuration to Supabase:', error);
      throw error;
    }

    setSystemConfig(mapConfigRowToState(data));
  };

  const clients = ['John Doe Studios', 'Acme Props', 'NerdGear Inc'];
  const orders = ['ORD-2024-089', 'ORD-2024-092', 'New Order'];

  return (
    <div className="flex bg-zinc-100 min-h-screen font-sans selection:bg-zinc-200">
      
      {/* Sidebar: Ultra-thin Minimalist Left Navigation */}
      <aside className="w-[68px] sm:w-[260px] bg-white border-r border-zinc-200 flex flex-col transition-all h-screen shrink-0 relative z-20">
        <div className="h-14 border-b border-zinc-200 flex items-center px-4 shrink-0 overflow-hidden">
          <Factory className="w-6 h-6 text-zinc-900 shrink-0" />
          <span className="ml-3 font-bold tracking-tight text-zinc-900 whitespace-nowrap hidden sm:block font-mono text-sm uppercase">NexusPrint</span>
        </div>
        
        <nav className="flex-1 py-4 space-y-1 px-3">
          <button 
            onClick={() => setActiveTab('Dashboard')}
            className={`w-full flex items-center px-2 sm:px-3 py-2 rounded transition-colors group ${activeTab === 'Dashboard' ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50'}`}
          >
            <Box className="w-4 h-4 shrink-0 transition-transform group-hover:scale-110" />
            <span className="ml-3 font-medium text-sm hidden sm:block">Dashboard</span>
          </button>
          <button 
            onClick={() => setActiveTab('Calculator')}
            className={`w-full flex items-center px-2 sm:px-3 py-2 rounded transition-colors group ${activeTab === 'Calculator' ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50'}`}
          >
            <Calculator className="w-4 h-4 shrink-0" />
            <span className="ml-3 font-medium text-sm hidden sm:block">Pricing Calculator</span>
          </button>
          
          <button 
            onClick={() => setActiveTab('Archives')}
            className={`w-full flex items-center px-2 sm:px-3 py-2 rounded transition-colors group ${activeTab === 'Archives' ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50'}`}
          >
            <Archive className="w-4 h-4 shrink-0 transition-transform group-hover:scale-110" />
            <span className="ml-3 font-medium text-sm hidden sm:block">Completed Archives</span>
          </button>

          <button 
            onClick={() => setActiveTab('Inventory')}
            className={`w-full flex items-center px-2 sm:px-3 py-2 rounded transition-colors group ${activeTab === 'Inventory' ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50'}`}
          >
            <Package className="w-4 h-4 shrink-0 transition-transform group-hover:scale-110" />
            <span className="ml-3 font-medium text-sm hidden sm:block">Inventory</span>
          </button>

          <button 
            onClick={() => setActiveTab('Configurations')}
            className={`w-full flex items-center px-2 sm:px-3 py-2 rounded transition-colors group ${activeTab === 'Configurations' ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50'}`}
          >
            <Settings className="w-4 h-4 shrink-0 transition-transform group-hover:scale-110" />
            <span className="ml-3 font-medium text-sm hidden sm:block">Configurations</span>
          </button>
        </nav>

        <div className="p-4 border-t border-zinc-200 flex justify-center sm:justify-start">
          <button className="text-zinc-400 hover:text-zinc-900 transition-colors" title="Sign out">
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </aside>

      {/* Main Content Pane */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden relative">
        
        {/* Header - Workspace / Directory Navigation */}
        <header className="h-14 bg-white border-b border-zinc-200 flex items-center px-6 justify-between shrink-0">
          
          <div className="flex items-center text-xs font-medium text-zinc-500 uppercase tracking-widest gap-2">
            <div className="relative group/client">
              <button className="hover:text-zinc-900 transition-colors decoration-zinc-300 underline-offset-4 hover:underline">
                {selectedClient}
              </button>
              <div className="absolute top-full left-0 mt-2 w-48 bg-white border border-zinc-200 rounded shadow-xl opacity-0 invisible group-hover/client:opacity-100 group-hover/client:visible transition-all z-30 pb-1">
                <div className="p-2 border-b border-zinc-100">
                  <div className="flex items-center gap-2 bg-zinc-50 px-2 py-1.5 rounded border border-zinc-200">
                    <Search className="w-3 h-3 text-zinc-400" />
                    <input type="text" placeholder="Filter..." className="bg-transparent text-xs outline-none w-full normal-case" />
                  </div>
                </div>
                {clients.map(c => (
                  <button 
                    key={c} onClick={() => setSelectedClient(c)}
                    className={`w-full text-left px-3 py-2 normal-case tracking-normal hover:bg-zinc-50 transition-colors ${selectedClient === c ? 'text-zinc-900 font-semibold' : 'text-zinc-600'}`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
            
            <ChevronRight className="w-3 h-3 text-zinc-300" />
            
            <div className="relative group/order">
              <button className="text-zinc-900 font-bold hover:underline decoration-zinc-900 underline-offset-4">
                {selectedOrder}
              </button>
              <div className="absolute top-full left-0 mt-2 w-48 bg-white border border-zinc-200 rounded shadow-xl opacity-0 invisible group-hover/order:opacity-100 group-hover/order:visible transition-all z-30 py-1">
                {orders.map(o => (
                  <button 
                    key={o} onClick={() => setSelectedOrder(o)}
                    className={`w-full text-left px-3 py-2 normal-case tracking-normal hover:bg-zinc-50 transition-colors ${selectedOrder === o ? 'text-zinc-900 font-semibold' : 'text-zinc-600'}`}
                  >
                    {o}
                  </button>
                ))}
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-widest hidden sm:block">Administrator</span>
            <div className="w-7 h-7 bg-zinc-900 text-white rounded flex items-center justify-center text-xs font-bold font-mono">
              AD
            </div>
          </div>

        </header>

        {/* Scrollable Form Content */}
        <div className="flex-1 overflow-auto p-4 md:p-8 bg-zinc-50">
          <div className="max-w-[1240px] mx-auto">
            {activeTab === 'Calculator' && (
              <>
                <div className="mb-8">
                  <h1 className="text-2xl font-bold tracking-tight text-zinc-900 mb-1">Cost Estimation Engine</h1>
                  <p className="text-sm text-zinc-500 font-medium">Configure inputs precisely to generate the final pricing tier.</p>
                </div>
                <AdvancedPriceChecker config={systemConfig} />
              </>
            )}

            {activeTab === 'Dashboard' && <MetricsView />}
            
            {activeTab === 'Archives' && <CompletedOrdersView />}

            {activeTab === 'Inventory' && <InventoryView />}
            
            {activeTab === 'Configurations' && (
              <ConfigurationsView
                config={systemConfig}
                onSave={saveSystemConfig}
                isLoading={configLoading}
                isSaving={configSaving}
              />
            )}
          </div>
        </div>

      </main>
    </div>
  );
}

// Minimal shim for the removed lucide icon in this file
function Calculator(props) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect width="16" height="20" x="4" y="2" rx="2"/><line x1="8" x2="16" y1="6" y2="6"/><line x1="16" x2="16.01" y1="10" y2="10"/><line x1="12" x2="12.01" y1="10" y2="10"/><line x1="8" x2="8.01" y1="10" y2="10"/><line x1="16" x2="16.01" y1="14" y2="14"/><line x1="12" x2="12.01" y1="14" y2="14"/><line x1="8" x2="8.01" y1="14" y2="14"/><line x1="16" x2="16.01" y1="18" y2="18"/><line x1="12" x2="12.01" y1="18" y2="18"/><line x1="8" x2="8.01" y1="18" y2="18"/>
    </svg>
  );
}
