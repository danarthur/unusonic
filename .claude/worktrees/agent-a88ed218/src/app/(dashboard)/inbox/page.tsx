'use client';
import { useEffect, useState } from 'react';
import { createClient } from '@/shared/api/supabase/client';
import { ShieldAlert, Clock, Terminal } from 'lucide-react';
import { LiquidPanel } from '@/shared/ui/liquid-panel';

export default function InboxPage() {
  const supabase = createClient();
  interface Email {
    id: number;
    subject: string;
    ai_summary: string;
    ai_urgency: string;
    ai_action_items: string;
    received_at: string;
  }

  const [emails, setEmails] = useState<Email[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      // Fetch data from Supabase
      const { data, error } = await supabase
        .from('inbox')
        .select('*')
        .order('received_at', { ascending: false });

      if (error) console.error('Error:', error);
      if (data) setEmails(data);
      setLoading(false);
    };
    fetchData();
  }, []);

  return (
    <div className="min-h-screen bg-canvas text-ink font-mono p-8">
      {/* Header */}
      <header className="flex items-center gap-4 mb-10 border-b border-stone/30 pb-4">
        <ShieldAlert className="w-10 h-10 text-ink" />
        <div>
          <h1 className="text-3xl font-bold tracking-tighter">ION // MEMORY_CORE</h1>
          <p className="text-xs text-ink-muted">SECURE CONNECTION ESTABLISHED</p>
        </div>
      </header>

      {/* Grid */}
      {loading ? (
        <div className="flex items-center gap-2 text-ink-muted animate-pulse">
          <Terminal className="w-4 h-4" />
          <span>DECRYPTING DATA STREAMS...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {emails.map((email) => (
            <LiquidPanel
              key={email.id} 
              hoverEffect
              className="group relative !p-6 transition-all duration-300"
            >
              {/* Urgency Badge */}
              <div className="flex justify-between items-start mb-4">
                <span className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest border ${
                  email.ai_urgency === 'High' ? 'bg-rose-100 text-rose-600 border-rose-200' : 
                  email.ai_urgency === 'Medium' ? 'bg-amber-100 text-amber-600 border-amber-200' :
                  'bg-emerald-100 text-emerald-600 border-emerald-200'
                }`}>
                  {email.ai_urgency || 'NORMAL'}
                </span>
                <Clock className="w-3 h-3 text-ink-muted" />
              </div>
              
              {/* Content */}
              <h2 className="text-lg font-bold mb-3 text-ink leading-tight group-hover:text-ink transition-colors">
                {email.subject}
              </h2>
              <p className="text-sm text-ink-muted mb-6 leading-relaxed border-l-2 border-stone/40 pl-3">
                {email.ai_summary}
              </p>
              
              {/* Action Protocol */}
              <div className="mt-auto liquid-panel liquid-panel-nested !rounded-2xl !p-3">
                 <h3 className="text-[10px] text-ink-muted mb-2 uppercase tracking-widest font-bold flex items-center gap-2">
                   <span className="w-1 h-1 bg-emerald-500 rounded-full"></span>
                   Directives
                 </h3>
                 <div className="text-xs text-ink font-sans whitespace-pre-wrap">
                   {email.ai_action_items}
                 </div>
              </div>
            </LiquidPanel>
          ))}
        </div>
      )}
    </div>
  );
}
