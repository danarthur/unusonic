'use client';
import { useEffect, useState } from 'react';
import { createClient } from '@/shared/api/supabase/client';
import { ShieldAlert, Clock, Terminal } from 'lucide-react';
import { StagePanel } from '@/shared/ui/stage-panel';

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
    <div className="min-h-screen bg-[var(--stage-void)] text-[var(--stage-text-primary)] font-mono p-8">
      {/* Header */}
      <header className="flex items-center gap-4 mb-10 border-b border-[oklch(1_0_0_/_0.08)] pb-4">
        <ShieldAlert className="w-10 h-10 text-[var(--stage-text-secondary)]" />
        <div>
          <h1 className="text-3xl font-medium tracking-tighter">Aion // MEMORY_CORE</h1>
          <p className="text-xs text-[var(--stage-text-secondary)]">SECURE CONNECTION ESTABLISHED</p>
        </div>
      </header>

      {/* Grid */}
      {loading ? (
        <div className="flex items-center gap-2 text-[var(--stage-text-secondary)] stage-skeleton">
          <Terminal className="w-4 h-4" />
          <span>DECRYPTING DATA STREAMS...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {emails.map((email) => (
            <StagePanel
              key={email.id} 
              interactive
              className="group relative !p-6 transition-colors duration-100"
            >
              {/* Urgency Badge */}
              <div className="flex justify-between items-start mb-4">
                <span className={`px-2 py-0.5 stage-label font-medium border ${
                  email.ai_urgency === 'High' ? 'bg-[oklch(0.35_0.08_20_/_0.25)] text-[var(--color-unusonic-error)] border-[oklch(0.65_0.18_20_/_0.3)]' :
                  email.ai_urgency === 'Medium' ? 'bg-[oklch(0.45_0.08_70_/_0.25)] text-[var(--color-unusonic-warning)] border-[oklch(0.65_0.15_70_/_0.2)]' :
                  'bg-[oklch(0.45_0.08_145_/_0.25)] text-[var(--color-unusonic-success)] border-[oklch(0.65_0.18_145_/_0.2)]'
                }`}>
                  {email.ai_urgency || 'NORMAL'}
                </span>
                <Clock className="w-3 h-3 text-[var(--stage-text-secondary)]" />
              </div>
              
              {/* Content */}
              <h2 className="text-lg font-medium mb-3 text-[var(--stage-text-primary)] leading-tight group-hover:text-[var(--stage-text-primary)] transition-colors">
                {email.subject}
              </h2>
              <p className="text-sm text-[var(--stage-text-secondary)] mb-6 leading-relaxed border-l-2 border-[oklch(1_0_0_/_0.10)] pl-3">
                {email.ai_summary}
              </p>
              
              {/* Action Protocol */}
              <div className="mt-auto stage-panel !rounded-2xl !p-3">
                 <h3 className="stage-label font-medium mb-2 flex items-center gap-2">
                   <span className="w-1 h-1 bg-[var(--color-unusonic-success)] rounded-full"></span>
                   Directives
                 </h3>
                 <div className="text-xs text-[var(--stage-text-primary)] font-sans whitespace-pre-wrap">
                   {email.ai_action_items}
                 </div>
              </div>
            </StagePanel>
          ))}
        </div>
      )}
    </div>
  );
}
