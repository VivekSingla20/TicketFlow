import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { PageShell } from "@/components/nav-bar";
import { useAuth } from "@/lib/auth";
import { useWsEvent, useWsRoom } from "@/lib/ws";
import { CheckCircle2, Clock, XCircle, Ticket } from "lucide-react";

type Booking = {
  id: string;
  reference?: string;
  status: "PENDING_PAYMENT" | "CONFIRMED" | "CANCELLED" | string;
  totalAmount?: string | number;
  event?: { title?: string; venueName?: string; startTime?: string };
  seats?: { row: string | number; number: string | number; section: string }[];
  createdAt?: string;
};

export const Route = createFileRoute("/bookings")({
  component: BookingsPage,
});

const STATUS_META: Record<string, { icon: any; cls: string; label: string }> = {
  CONFIRMED: { icon: CheckCircle2, cls: "text-success", label: "Confirmed" },
  PENDING_PAYMENT: { icon: Clock, cls: "text-warning", label: "Pending payment" },
  CANCELLED: { icon: XCircle, cls: "text-destructive", label: "Cancelled" },
};

function BookingsPage() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const [items, setItems] = useState<Booking[]>([]);
  const [busy, setBusy] = useState(true);

  useWsRoom(user ? `user:${user.id}` : null);

  const load = async () => {
    setBusy(true);
    try {
      const data = await api<Booking[] | { data: Booking[] }>("/api/bookings");
      setItems(Array.isArray(data) ? data : data?.data ?? []);
    } catch { setItems([]); } finally { setBusy(false); }
  };

  useEffect(() => {
    if (loading) return;
    if (!user) { nav({ to: "/login" }); return; }
    void load();
  }, [user, loading]); // eslint-disable-line

  useWsEvent("booking:confirmed", () => { void load(); });
  useWsEvent("payment:failed", () => { void load(); });

  return (
    <PageShell>
      <h1 className="text-3xl font-bold mb-6">My Bookings</h1>
      {busy && <div className="glass rounded-2xl h-40 animate-pulse" />}
      {!busy && items.length === 0 && (
        <div className="glass-strong rounded-2xl p-12 text-center">
          <Ticket className="size-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">You don't have any bookings yet.</p>
        </div>
      )}
      <div className="grid sm:grid-cols-2 gap-4">
        {items.map((b) => {
          const meta = STATUS_META[b.status] || STATUS_META.PENDING_PAYMENT;
          const Icon = meta.icon;
          return (
            <div key={b.id} className="glass-strong rounded-2xl p-5">
              <div className="flex items-center justify-between">
                <div className="font-semibold">{b.event?.title || "Event"}</div>
                <span className={`inline-flex items-center gap-1.5 text-xs ${meta.cls}`}>
                  <Icon className="size-4" /> {meta.label}
                </span>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {b.event?.venueName} {b.event?.startTime ? `· ${new Date(b.event.startTime).toLocaleString()}` : ""}
              </div>
              {b.seats && b.seats.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {b.seats.map((s, i) => (
                    <span key={i} className="text-[11px] glass px-2 py-1 rounded-md">
                      {s.section} {s.row}-{s.number}
                    </span>
                  ))}
                </div>
              )}
              <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
                <span className="text-xs text-muted-foreground">{b.reference || b.id}</span>
                {b.totalAmount != null && (
                  <span className="font-semibold text-gradient">
                    ${typeof b.totalAmount === "number" ? b.totalAmount.toFixed(2) : parseFloat(b.totalAmount).toFixed(2)}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </PageShell>
  );
}
