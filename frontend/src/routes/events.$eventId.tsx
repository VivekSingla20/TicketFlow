import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Calendar, MapPin, ArrowLeft } from "lucide-react";
import { api } from "@/lib/api";
import { PageShell } from "@/components/nav-bar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { useWs, useWsEvent, useWsRoom } from "@/lib/ws";
import { toast } from "sonner";

type SeatStatus = "AVAILABLE" | "RESERVED" | "BOOKED" | "DISABLED" | string;
type SeatSection = "VIP" | "PREMIUM" | "REGULAR" | string;

type Seat = {
  id: string;
  row: string | number;
  number: number | string;
  section: SeatSection;
  status: SeatStatus;
  price?: number;
};

type EventDetail = {
  id: string;
  title: string;
  description?: string;
  venueName?: string;
  city?: string;
  startTime?: string;
  imageUrl?: string;
};

export const Route = createFileRoute("/events/$eventId")({
  component: EventDetailPage,
});

const SECTION_TOKENS: Record<string, string> = {
  VIP: "bg-[color:var(--vip)]/80",
  PREMIUM: "bg-[color:var(--premium)]/80",
  REGULAR: "bg-[color:var(--regular)]/80",
};

function statusColor(s: SeatStatus, sectionBg: string, selected: boolean) {
  if (selected) return "bg-foreground text-background ring-2 ring-primary";
  if (s === "DISABLED") return "bg-muted/40 text-muted-foreground line-through cursor-not-allowed";
  if (s === "BOOKED") return "bg-destructive/80 text-destructive-foreground cursor-not-allowed";
  if (s === "RESERVED") return "bg-warning/70 text-background cursor-not-allowed";
  return `${sectionBg} hover:scale-110 cursor-pointer`;
}

function EventDetailPage() {
  const { eventId } = Route.useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const ws = useWs();

  const [event, setEvent] = useState<EventDetail | null>(null);
  const [seats, setSeats] = useState<Seat[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [reserving, setReserving] = useState(false);

  useWsRoom(`event:${eventId}`);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const [ev, seatRes] = await Promise.all([
          api<EventDetail>(`/api/events/${eventId}`, { auth: false }).catch(() => null),
          api<Seat[] | { seats: Seat[] }>(`/api/events/${eventId}/seats`, { auth: false }),
        ]);
        if (ev) setEvent(ev);
        const list = Array.isArray(seatRes) ? seatRes : seatRes?.seats ?? [];
        setSeats(list);
      } catch (e: any) {
        toast.error(e.message || "Failed to load event");
      } finally { setLoading(false); }
    })();
  }, [eventId]);

  const updateSeatStatus = (seatId: string, status: SeatStatus) => {
    setSeats((prev) => prev.map((s) => (s.id === seatId ? { ...s, status } : s)));
  };

  useWsEvent("seat:reserved", (d: any) => {
    const ids: string[] = d.seatIds || (d.seatId ? [d.seatId] : []);
    ids.forEach((id) => updateSeatStatus(id, "RESERVED"));
  });
  useWsEvent("seat:booked", (d: any) => {
    const ids: string[] = d.seatIds || (d.seatId ? [d.seatId] : []);
    ids.forEach((id) => updateSeatStatus(id, "BOOKED"));
  });
  useWsEvent("seat:available", (d: any) => {
    const ids: string[] = d.seatIds || (d.seatId ? [d.seatId] : []);
    ids.forEach((id) => updateSeatStatus(id, "AVAILABLE"));
    setSelected((sel) => sel.filter((s) => !ids.includes(s)));
  });

  const grouped = useMemo(() => {
    const bySection: Record<string, Record<string, Seat[]>> = {};
    for (const seat of seats) {
      const section = String(seat.section || "REGULAR");
      const row = String(seat.row);
      bySection[section] ||= {};
      bySection[section][row] ||= [];
      bySection[section][row].push(seat);
    }
    for (const sec of Object.values(bySection)) {
      for (const row of Object.values(sec)) row.sort((a, b) => Number(a.number) - Number(b.number));
    }
    return bySection;
  }, [seats]);

  const selectedSeats = useMemo(() => seats.filter((s) => selected.includes(s.id)), [seats, selected]);
  const total = selectedSeats.reduce((acc, s) => acc + (s.price || 0), 0);

  const toggle = (s: Seat) => {
    if (s.status !== "AVAILABLE") return;
    setSelected((prev) => {
      if (prev.includes(s.id)) return prev.filter((id) => id !== s.id);
      if (prev.length >= 10) {
        toast.warning("You can select up to 10 seats.");
        return prev;
      }
      return [...prev, s.id];
    });
  };

  const reserve = async () => {
    if (!user) { nav({ to: "/login" }); return; }
    if (selected.length === 0) return;
    setReserving(true);
    try {
      const data = await api<{ id: string; reservationId?: string; expiresAt: string; seats?: Seat[] }>(
        "/api/reservations",
        { method: "POST", body: JSON.stringify({ eventId, seatIds: selected }) },
      );
      const reservationId = data.id || data.reservationId!;
      sessionStorage.setItem(
        `reservation:${reservationId}`,
        JSON.stringify({
          reservationId,
          eventId,
          expiresAt: data.expiresAt,
          seats: selectedSeats,
          total,
          event,
        }),
      );
      nav({ to: "/checkout/$reservationId", params: { reservationId } });
    } catch (e: any) {
      toast.error(e.message || "Failed to reserve seats");
    } finally { setReserving(false); }
  };

  return (
    <PageShell>
      <button onClick={() => nav({ to: "/" })} className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 mb-6">
        <ArrowLeft className="size-4" /> All events
      </button>

      <div className="grid lg:grid-cols-[1fr_360px] gap-8">
        <div>
          <div className="glass-strong rounded-2xl overflow-hidden mb-6">
            <div className="aspect-[21/9] relative">
              {event?.imageUrl ? (
                <img src={event.imageUrl} className="w-full h-full object-cover" alt="" />
              ) : (
                <div className="w-full h-full" style={{ background: "var(--gradient-hero)" }} />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-card via-card/60 to-transparent" />
              <div className="absolute bottom-0 p-6">
                <h1 className="text-3xl sm:text-4xl font-bold">{event?.title || "Event"}</h1>
                <div className="mt-2 flex flex-wrap gap-4 text-sm text-muted-foreground">
                  {event?.venueName && <span className="inline-flex items-center gap-1.5"><MapPin className="size-4" />{event.venueName}{event.city ? `, ${event.city}` : ""}</span>}
                  {event?.startTime && <span className="inline-flex items-center gap-1.5"><Calendar className="size-4" />{new Date(event.startTime).toLocaleString()}</span>}
                </div>
              </div>
            </div>
          </div>

          <div className="glass-strong rounded-2xl p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <h2 className="font-semibold text-lg">Pick your seats</h2>
              <Legend />
            </div>

            <div className="mx-auto w-full max-w-3xl mb-6">
              <div className="h-2 rounded-full bg-gradient-to-r from-transparent via-primary to-transparent opacity-70" />
              <div className="text-center text-xs text-muted-foreground mt-1.5 uppercase tracking-widest">Stage</div>
            </div>

            {loading ? (
              <div className="h-72 glass rounded-xl animate-pulse" />
            ) : (
              <div className="space-y-8">
                {Object.entries(grouped).map(([section, rows]) => (
                  <div key={section}>
                    <div className="flex items-center gap-2 mb-3">
                      <span className={`size-3 rounded-sm ${SECTION_TOKENS[section] || "bg-muted"}`} />
                      <span className="text-sm font-medium tracking-wide">{section}</span>
                    </div>
                    <div className="space-y-1.5 overflow-x-auto">
                      {Object.entries(rows).map(([row, rowSeats]) => (
                        <div key={row} className="flex items-center gap-1.5 justify-center">
                          <span className="text-[10px] text-muted-foreground w-5 text-right">{row}</span>
                          {rowSeats.map((s) => {
                            const isSel = selected.includes(s.id);
                            const bg = SECTION_TOKENS[String(s.section)] || "bg-muted";
                            return (
                              <button
                                key={s.id}
                                onClick={() => toggle(s)}
                                title={`Row ${s.row} · Seat ${s.number}${s.price ? ` · $${s.price}` : ""}`}
                                className={`size-6 rounded-md text-[10px] flex items-center justify-center transition-all ${statusColor(s.status, bg, isSel)}`}
                              >
                                {s.number}
                              </button>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <aside className="lg:sticky lg:top-24 h-fit">
          <div className="glass-strong rounded-2xl p-6">
            <h3 className="font-semibold">Your selection</h3>
            <p className="text-xs text-muted-foreground">Up to 10 seats per booking</p>
            <div className="mt-4 space-y-2 max-h-72 overflow-y-auto">
              {selectedSeats.length === 0 && (
                <div className="text-sm text-muted-foreground py-6 text-center glass rounded-lg">
                  No seats selected yet.
                </div>
              )}
              {selectedSeats.map((s) => (
                <div key={s.id} className="flex items-center justify-between glass rounded-lg px-3 py-2 text-sm">
                  <div>
                    <div className="font-medium">{s.section} · Row {s.row} · Seat {s.number}</div>
                    <div className="text-xs text-muted-foreground">{s.id}</div>
                  </div>
                  <div className="font-semibold">${s.price ?? 0}</div>
                </div>
              ))}
            </div>
            <div className="border-t border-border mt-4 pt-4 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Total</span>
              <span className="text-xl font-bold text-gradient">${total.toFixed(2)}</span>
            </div>
            <Button
              onClick={reserve}
              disabled={selected.length === 0 || reserving}
              className="w-full mt-4 btn-glow btn-glow-hover"
            >
              {reserving ? "Reserving..." : `Reserve ${selected.length || ""} seat${selected.length === 1 ? "" : "s"}`}
            </Button>
            <p className="text-[11px] text-muted-foreground mt-2 text-center">
              Seats are held for 10 minutes during checkout.
            </p>
          </div>
        </aside>
      </div>
    </PageShell>
  );
}

function Legend() {
  const items = [
    { c: "bg-[color:var(--vip)]/80", l: "VIP" },
    { c: "bg-[color:var(--premium)]/80", l: "Premium" },
    { c: "bg-[color:var(--regular)]/80", l: "Regular" },
    { c: "bg-warning/70", l: "Reserved" },
    { c: "bg-destructive/80", l: "Sold" },
    { c: "bg-muted/40", l: "Disabled" },
  ];
  return (
    <div className="flex flex-wrap gap-3 text-xs">
      {items.map((i) => (
        <span key={i.l} className="inline-flex items-center gap-1.5"><span className={`size-3 rounded-sm ${i.c}`} />{i.l}</span>
      ))}
    </div>
  );
}
