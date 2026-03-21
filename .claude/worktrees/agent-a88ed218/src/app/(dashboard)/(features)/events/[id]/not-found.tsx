import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function EventNotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4 p-6">
      <p className="text-ink-muted">Event not found or you don’t have access.</p>
      <Link
        href="/calendar"
        className="inline-flex items-center gap-2 text-ink hover:underline focus:outline-none focus:ring-2 focus:ring-[var(--ring)] rounded-lg px-3 py-2"
      >
        <ArrowLeft size={16} /> Back to Calendar
      </Link>
    </div>
  );
}
