import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft,
  Radio,
  Copy,
  Check,
  Bell,
  RefreshCw,
  Battery,
  Activity,
  MapPin,
  Zap,
  Send,
  Shield,
  Clock
} from 'lucide-react';
import { IconRenderer } from '../constants';
import { libraryService } from '../services/supabaseClient';

interface CaregiverDashboardProps {
  onBack: () => void;
}

type Tab = 'feed' | 'status' | 'map';

export const CaregiverDashboard: React.FC<CaregiverDashboardProps> = ({ onBack }) => {
  const [activeTab, setActiveTab] = useState<Tab>('feed');
  const [deviceId, setDeviceId] = useState('');
  const [inputId, setInputId] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [deviceStatus, setDeviceStatus] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  const [poking, setPoking] = useState(false);

  const alertChannelRef = useRef<any>(null);
  const statusChannelRef = useRef<any>(null);

  const myDeviceId = libraryService.getDeviceId();

  const copyMyId = async () => {
    await navigator.clipboard.writeText(myDeviceId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const connectToDevice = async () => {
    if (!inputId.trim()) return;
    const targetId = inputId.trim();
    setDeviceId(targetId);

    // Fetch recent alerts
    const recent = await libraryService.fetchRecentAlerts(targetId);
    setAlerts(recent);

    // Fetch current status
    const status = await libraryService.fetchDeviceStatus(targetId);
    setDeviceStatus(status);

    // Subscribe to alerts
    if (alertChannelRef.current) libraryService.unsubscribeCaregiver(alertChannelRef.current);
    alertChannelRef.current = libraryService.subscribeToCaregiverAlerts(targetId, (newAlert) => {
      setAlerts(prev => [newAlert, ...prev].slice(0, 50));
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(`SilentEar: ${newAlert.trigger_label}`, {
          body: `Detected: "${newAlert.detected_text || newAlert.trigger_word}"`,
          icon: '/pwa-192x192.png',
        });
      }
    });

    // Subscribe to status updates
    if (statusChannelRef.current) libraryService.unsubscribeCaregiver(statusChannelRef.current);
    statusChannelRef.current = libraryService.subscribeToStatusUpdates(targetId, (update) => {
      setDeviceStatus(update);
    });

    setIsConnected(true);
  };

  const sendPoke = async () => {
    if (!deviceId || poking) return;
    setPoking(true);
    await libraryService.sendPoke(deviceId, 'Caregiver');
    setTimeout(() => setPoking(false), 2000);
  };

  useEffect(() => {
    return () => {
      if (alertChannelRef.current) libraryService.unsubscribeCaregiver(alertChannelRef.current);
      if (statusChannelRef.current) libraryService.unsubscribeCaregiver(statusChannelRef.current);
    };
  }, []);

  const isOnline = deviceStatus ? (Date.now() - new Date(deviceStatus.last_active).getTime() < 65000) : false;

  return (
    <div className="flex flex-col h-full w-full bg-slate-950 overflow-hidden">
      <header className="flex items-center p-4 bg-slate-950 border-b border-white/5 z-20">
        <button onClick={onBack} className="p-2 hover:bg-white/5 rounded-full transition-colors mr-2">
          <ArrowLeft size={24} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold truncate">Caregiver View</h1>
          {isConnected && (
            <div className="flex items-center gap-2 mt-0.5">
              <div className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {isOnline ? 'Online' : 'Offline'} • {deviceId.substring(0, 8)}...
              </span>
            </div>
          )}
        </div>
        {isConnected && (
          <button
            onClick={sendPoke}
            disabled={poking || !isOnline}
            className={`p-2.5 rounded-xl transition-all ${poking ? 'bg-fuchsia-500 text-white animate-bounce' : 'bg-white/5 text-fuchsia-400 hover:bg-white/10 active:scale-90 disabled:opacity-50'}`}
          >
            <Zap size={20} className={poking ? 'fill-current' : ''} />
          </button>
        )}
      </header>

      {!isConnected ? (
        <div className="flex-1 overflow-y-auto p-6 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <section className="bg-gradient-to-br from-blue-600/20 to-purple-600/10 border border-white/10 p-6 rounded-3xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <Shield size={120} />
            </div>
            <h2 className="text-xl font-bold mb-2">Remote Monitoring</h2>
            <p className="text-sm text-slate-400 mb-6 leading-relaxed">Connect to a SilentEar user to receive real-time alerts and monitor their safety status.</p>

            <div className="flex flex-col gap-3">
              <input
                type="text"
                value={inputId}
                onChange={(e) => setInputId(e.target.value)}
                placeholder="Enter Device ID..."
                className="bg-slate-900/50 border border-white/10 rounded-2xl px-5 py-4 text-white text-base font-mono placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
              />
              <button
                onClick={connectToDevice}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-2xl active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                <RefreshCw size={20} className={!deviceId ? '' : 'animate-spin'} /> Connect Session
              </button>
            </div>
          </section>

          <section>
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-4 px-2">Your Identity</h3>
            <div className="bg-slate-900 border border-white/5 p-5 rounded-3xl flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">My Device ID</p>
                <code className="text-xs text-blue-400 font-mono truncate block">{myDeviceId}</code>
              </div>
              <button onClick={copyMyId} className="p-3 bg-white/5 rounded-2xl hover:bg-white/10 transition-colors">
                {copied ? <Check size={20} className="text-emerald-400" /> : <Copy size={20} className="text-slate-400" />}
              </button>
            </div>
            <p className="text-[10px] text-slate-500 mt-3 italic px-2">Share this with others if you want THEM to monitor YOU.</p>
          </section>
        </div>
      ) : (
        <React.Fragment>
          <div className="flex-1 overflow-hidden flex flex-col">
            {/* Tabs */}
            <div className="flex px-4 pt-4 border-b border-white/5 gap-4">
              {(['feed', 'status', 'map'] as Tab[]).map(t => (
                <button
                  key={t}
                  onClick={() => setActiveTab(t)}
                  className={`pb-3 px-1 text-xs font-bold uppercase tracking-widest transition-all relative ${activeTab === t ? 'text-blue-400' : 'text-slate-500 hover:text-slate-300'}`}
                >
                  {t}
                  {activeTab === t && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-400 rounded-full" />}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar p-4">
              {activeTab === 'feed' && (
                <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                  {alerts.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 opacity-40">
                      <Bell size={48} className="mb-4" />
                      <p className="text-sm">No recent alerts</p>
                    </div>
                  ) : (
                    alerts.map((a, i) => (
                      <div key={i} className="bg-slate-900/50 border border-white/5 p-4 rounded-3xl flex items-center gap-4 group">
                        <div className={`p-4 rounded-2xl ${a.trigger_color || 'bg-slate-700'} shadow-lg group-hover:scale-110 transition-transform`}>
                          <IconRenderer icon={a.trigger_icon || 'zap'} size={24} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-start mb-1">
                            <h4 className="font-bold text-white leading-none">{a.trigger_label}</h4>
                            <span className="text-[10px] font-mono text-slate-500">{new Date(a.created_at).toLocaleTimeString()}</span>
                          </div>
                          <p className="text-sm text-slate-400 truncate italic">"{a.detected_text || a.trigger_word}"</p>
                          <div className="flex items-center gap-2 mt-2">
                            <span className="text-[9px] font-black uppercase bg-white/10 text-slate-400 px-2 py-0.5 rounded-full">{a.source}</span>
                            <span className="text-[9px] font-bold text-slate-600">{a.user_name}</span>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {activeTab === 'status' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-slate-900/50 border border-white/5 p-5 rounded-3xl">
                      <Activity size={20} className="text-emerald-400 mb-3" />
                      <p className="text-[10px] font-bold text-slate-500 uppercase">Monitoring</p>
                      <p className="text-xl font-black text-white">{deviceStatus?.is_listening ? 'ACTIVE' : 'IDLE'}</p>
                    </div>
                    <div className="bg-slate-900/50 border border-white/5 p-5 rounded-3xl">
                      <Battery size={20} className="text-blue-400 mb-3" />
                      <p className="text-[10px] font-bold text-slate-500 uppercase">Battery</p>
                      <p className="text-xl font-black text-white">{deviceStatus?.battery_level ? Math.round(deviceStatus.battery_level * 100) + '%' : '??%'}</p>
                    </div>
                  </div>

                  <div className="bg-slate-900/50 border border-white/5 p-5 rounded-3xl">
                    <div className="flex items-center gap-3 mb-4">
                      <Clock size={16} className="text-slate-500" />
                      <p className="text-[10px] font-bold text-slate-500 uppercase">Last Synchronization</p>
                    </div>
                    <p className="text-sm text-white">{new Date(deviceStatus?.last_active).toLocaleString()}</p>
                  </div>

                  <div className="bg-amber-500/10 border border-amber-500/20 p-5 rounded-3xl">
                    <h4 className="text-amber-400 text-xs font-bold mb-2 flex items-center gap-2">
                      <Shield size={14} /> Safety Check
                    </h4>
                    <p className="text-[11px] text-amber-200/60 leading-relaxed">
                      The user is currently {deviceStatus?.is_listening ? 'actively monitoring their environment.' : 'not listening. They might have paused the app.'}
                    </p>
                  </div>
                </div>
              )}

              {activeTab === 'map' && (
                <div className="h-full flex flex-col items-center justify-center animate-in fade-in duration-300">
                  {deviceStatus?.latitude ? (
                    <div className="w-full h-full flex flex-col">
                      <div className="flex-1 bg-slate-900 rounded-3xl border border-white/5 flex flex-col items-center justify-center overflow-hidden relative">
                        <MapPin size={48} className="text-rose-500 animate-bounce mb-4" />
                        <p className="text-sm font-bold">{deviceStatus.latitude.toFixed(6)}, {deviceStatus.longitude.toFixed(6)}</p>
                        <p className="text-xs text-slate-500 mt-2">Location via Browser Geolocation</p>

                        <a
                          href={`https://www.google.com/maps?q=${deviceStatus.latitude},${deviceStatus.longitude}`}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-6 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-6 py-3 rounded-2xl transition-all"
                        >
                          Open in Google Maps
                        </a>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center opacity-40 px-10">
                      <MapPin size={48} className="mx-auto mb-4" />
                      <p className="text-sm">Location data unavailable</p>
                      <p className="text-[10px] mt-2">The user needs to grant location permissions on their device.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </React.Fragment>
      )}

      {/* Persistent Footer if connected */}
      {isConnected && (
        <footer className="p-4 bg-slate-950/80 backdrop-blur-md border-t border-white/5">
          <button
            onClick={() => {
              if (alertChannelRef.current) libraryService.unsubscribeCaregiver(alertChannelRef.current);
              if (statusChannelRef.current) libraryService.unsubscribeCaregiver(statusChannelRef.current);
              setIsConnected(false);
              setDeviceId('');
            }}
            className="w-full py-3 bg-white/5 hover:bg-red-500/10 text-slate-400 hover:text-red-400 text-[10px] font-black uppercase tracking-[0.2em] rounded-2xl transition-all"
          >
            Terminate Session
          </button>
        </footer>
      )}
    </div>
  );
};
