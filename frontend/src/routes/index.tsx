import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Calendar, MapPin, Search, Sparkles, Ticket } from "lucide-react";
import { api } from "@/lib/api";
import { PageShell } from "@/components/nav-bar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type EventItem = {
  id: string;
  title: string;
  description?: string;
  venueName?: string;
  city?: string;
  startTime?: string;
  minPrice?: number;
  maxPrice?: number;
  imageUrl?: string;
  status?: string;
};

export const Route = createFileRoute("/")({
  component: EventsPage,
});

function formatDate(d?: string) {
  if (!d) return "";
  try { return new Date(d).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }); }
  catch { return d; }
}

function EventsPage() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [city, setCity] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (city) qs.set("city", city);
      if (from) qs.set("from", from);
      if (to) qs.set("to", to);
      const data = await api<EventItem[] | { data: EventItem[] }>(`/api/events?${qs.toString()}`, { auth: false });
      const list = Array.isArray(data) ? data : data?.data ?? [];
      setEvents(list);
    } catch {
      setEvents([]);
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []); // eslint-disable-line

  return (
    <PageShell>
      <section className="relative overflow-hidden rounded-3xl glass-strong p-8 sm:p-12 mb-10">
        <div className="absolute inset-0 opacity-30" style={{ background: "var(--gradient-hero)" }} />
        <div className="relative">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass text-xs">
            <Sparkles className="size-3.5" /> Live seat selection in real time
          </div>
          <h1 className="mt-4 text-4xl sm:text-6xl font-bold tracking-tight">
            Find your <span className="text-gradient">next</span> unforgettable night.
          </h1>
          <p className="mt-4 text-muted-foreground max-w-xl">
            Concerts, theatre, sports, and more. Pick your seats live and lock them in seconds.
          </p>
        </div>
      </section>

      <div className="glass rounded-2xl p-4 mb-8 flex flex-col md:flex-row gap-3 md:items-end">
        <div className="flex-1">
          <label className="text-xs text-muted-foreground">City</label>
          <div className="relative">
            <MapPin className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
            <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Any city" className="pl-9" />
          </div>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">From</label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">To</label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <Button className="btn-glow btn-glow-hover md:w-auto" onClick={() => void load()}>
          <Search className="size-4 mr-1.5" /> Search
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {loading && Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="glass rounded-2xl h-64 animate-pulse" />
        ))}
        {!loading && events.length === 0 && (
          <div className="col-span-full glass rounded-2xl p-12 text-center text-muted-foreground">
            No events found. Try clearing filters.
          </div>
        )}
        {events.map((ev) => (
          <Link
            key={ev.id}
            to="/events/$eventId"
            params={{ eventId: ev.id }}
            className="group glass rounded-2xl overflow-hidden hover:scale-[1.01] transition-transform"
          >
            <div className="aspect-[16/9] relative overflow-hidden">
              {ev.imageUrl ? (
                <img src={ev.imageUrl} alt={ev.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
              ) : (
                <div className="w-full h-full" style={{ background: "var(--gradient-hero)" }}>
                  <div className="w-full h-full flex items-center justify-center opacity-30">
                    <Ticket className="size-16" />
                  </div>
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-card/80 to-transparent" />
            </div>
            <div className="p-5">
              <h3 className="font-semibold text-lg leading-snug line-clamp-1">{ev.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{ev.description}</p>
              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5"><MapPin className="size-3.5" />{ev.venueName}{ev.city ? `, ${ev.city}` : ""}</span>
                <span className="inline-flex items-center gap-1.5"><Calendar className="size-3.5" />{formatDate(ev.startTime)}</span>
              </div>
              {(ev.minPrice != null || ev.maxPrice != null) && (
                <div className="mt-4 flex items-center justify-between">
                  <span className="text-sm">
                    <span className="text-muted-foreground">from </span>
                    <span className="font-semibold text-gradient">${ev.minPrice ?? 0}</span>
                  </span>
                  <span className="text-xs px-2 py-1 rounded-md glass">View seats</span>
                </div>
              )}
            </div>
          </Link>
        ))}
      </div>
    </PageShell>
  );
}
