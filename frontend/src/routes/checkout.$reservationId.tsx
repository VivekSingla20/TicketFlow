import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { CreditCard, Lock, Timer } from "lucide-react";
import { api } from "@/lib/api";
import { PageShell } from "@/components/nav-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useWsEvent, useWsRoom } from "@/lib/ws";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

type Seat = { id: string; row: string | number; number: string | number; section: string; price?: number };
type Stored = {
  reservationId: string;
  eventId: string;
  expiresAt: string;
  seats: Seat[];
  total: number;
  event?: { title?: string; venueName?: string };
};

export const Route = createFileRoute("/checkout/$reservationId")({
  component: CheckoutPage,
});

function CheckoutPage() {
  const { reservationId } = Route.useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const [data, setData] = useState<Stored | null>(null);
  const [now, setNow] = useState(Date.now());
  const [paying, setPaying] = useState(false);
  const [cardName, setCardName] = useState(user?.name || "");
  const [cardNumber, setCardNumber] = useState("4242 4242 4242 4242");
  const [cardExp, setCardExp] = useState("12/29");
  const [cardCvc, setCardCvc] = useState("123");

  useWsRoom(user ? `user:${user.id}` : null);

  useEffect(() => {
    const raw = sessionStorage.getItem(`reservation:${reservationId}`);
    if (raw) {
      try { setData(JSON.parse(raw)); return; } catch {}
    }
    // Fallback: try API
    api<Stored>(`/api/reservations/${reservationId}`).then(setData).catch(() => {
      toast.error("Reservation not found");
      nav({ to: "/" });
    });
  }, [reservationId]); // eslint-disable-line

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useWsEvent("reservation:expired", (d: any) => {
    if (d?.reservationId && d.reservationId !== reservationId) return;
    toast.error("Reservation expired", { description: "Your seats were released." });
    sessionStorage.removeItem(`reservation:${reservationId}`);
    nav({ to: "/" });
  }, [reservationId]);

  const remaining = useMemo(() => {
    if (!data?.expiresAt) return 0;
    return Math.max(0, new Date(data.expiresAt).getTime() - now);
  }, [data, now]);

  useEffect(() => {
    if (data && remaining === 0) {
      toast.error("Reservation expired");
      nav({ to: "/" });
    }
  }, [remaining, data]); // eslint-disable-line

  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  const pct = data?.expiresAt
    ? Math.min(100, (remaining / (10 * 60 * 1000)) * 100)
    : 0;

  const pay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!data) return;
    setPaying(true);
    try {
      const idempotencyKey = crypto.randomUUID();
      await api("/api/bookings", {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey },
        body: JSON.stringify({
          reservationId,
          idempotencyKey,
          payment: { method: "card", last4: cardNumber.replace(/\s/g, "").slice(-4) },
        }),
      });
      sessionStorage.removeItem(`reservation:${reservationId}`);
      toast.success("Payment submitted", { description: "Awaiting confirmation..." });
      nav({ to: "/bookings" });
    } catch (err: any) {
      toast.error(err.message || "Payment failed");
    } finally { setPaying(false); }
  };

  if (!data) return <PageShell><div className="h-64 glass rounded-2xl animate-pulse" /></PageShell>;

  return (
    <PageShell>
      <div className="max-w-5xl mx-auto grid lg:grid-cols-[1fr_380px] gap-6">
        <div className="space-y-6">
          <div className="glass-strong rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h1 className="text-2xl font-semibold">Checkout</h1>
                <p className="text-sm text-muted-foreground">{data.event?.title}</p>
              </div>
              <div className="text-right">
                <div className="text-xs text-muted-foreground inline-flex items-center gap-1"><Timer className="size-3.5" /> Hold expires in</div>
                <div className="text-2xl font-bold tabular-nums text-gradient">
                  {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
                </div>
              </div>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div className="h-full transition-all" style={{ width: `${pct}%`, background: "var(--gradient-hero)" }} />
            </div>
          </div>

          <form onSubmit={pay} className="glass-strong rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-2">
              <CreditCard className="size-5" />
              <h2 className="font-semibold">Payment details</h2>
              <span className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Lock className="size-3" /> Secured mock checkout
              </span>
            </div>
            <div className="space-y-1.5">
              <Label>Cardholder name</Label>
              <Input required value={cardName} onChange={(e) => setCardName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Card number</Label>
              <Input required value={cardNumber} onChange={(e) => setCardNumber(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Expiry</Label>
                <Input required value={cardExp} onChange={(e) => setCardExp(e.target.value)} placeholder="MM/YY" />
              </div>
              <div className="space-y-1.5">
                <Label>CVC</Label>
                <Input required value={cardCvc} onChange={(e) => setCardCvc(e.target.value)} maxLength={4} />
              </div>
            </div>
            <Button type="submit" disabled={paying || remaining === 0} className="w-full btn-glow btn-glow-hover">
              {paying ? "Processing payment..." : `Confirm & Pay $${data.total.toFixed(2)}`}
            </Button>
          </form>
        </div>

        <aside className="glass-strong rounded-2xl p-6 h-fit lg:sticky lg:top-24">
          <h3 className="font-semibold mb-3">Order summary</h3>
          <div className="space-y-2">
            {data.seats.map((s) => (
              <div key={s.id} className="flex items-center justify-between text-sm glass rounded-lg px-3 py-2">
                <div>
                  <div className="font-medium">{s.section} · Row {s.row} · Seat {s.number}</div>
                </div>
                <div className="font-semibold">${s.price ?? 0}</div>
              </div>
            ))}
          </div>
          <div className="border-t border-border mt-4 pt-4 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Total</span>
            <span className="text-2xl font-bold text-gradient">${data.total.toFixed(2)}</span>
          </div>
        </aside>
      </div>

      {paying && (
        <div className="fixed inset-0 bg-background/70 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="glass-strong rounded-2xl p-8 text-center max-w-sm">
            <div className="size-12 rounded-full mx-auto mb-4 btn-glow flex items-center justify-center animate-pulse">
              <CreditCard className="size-6" />
            </div>
            <h3 className="font-semibold">Processing payment</h3>
            <p className="text-sm text-muted-foreground mt-1">Securely confirming your booking…</p>
          </div>
        </div>
      )}
    </PageShell>
  );
}
