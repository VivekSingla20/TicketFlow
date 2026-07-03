import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { PageShell } from "@/components/nav-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell, Legend,
} from "recharts";
import { Building2, CalendarPlus, CheckCircle2, Ban, BarChart3 } from "lucide-react";

export const Route = createFileRoute("/admin")({
  component: AdminPage,
});

type Venue = { id: string; name: string; city?: string };
type EventItem = { id: string; title: string; status?: string; venueId?: string; startTime?: string };
type SectionCfg = { name: string; rows: number; seatsPerRow: number; price: number };

function AdminPage() {
  const { user, loading } = useAuth();
  const nav = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!user) nav({ to: "/login" });
    else if (user.role !== "ADMIN") nav({ to: "/" });
  }, [user, loading]); // eslint-disable-line

  if (loading || !user || user.role !== "ADMIN") {
    return <PageShell><div className="glass rounded-2xl h-64 animate-pulse" /></PageShell>;
  }

  return (
    <PageShell>
      <h1 className="text-3xl font-bold mb-2">Admin Dashboard</h1>
      <p className="text-muted-foreground mb-6">Manage venues, events, and live performance.</p>

      <Tabs defaultValue="dashboard">
        <TabsList className="glass">
          <TabsTrigger value="dashboard"><BarChart3 className="size-4 mr-1.5" />Dashboard</TabsTrigger>
          <TabsTrigger value="venues"><Building2 className="size-4 mr-1.5" />Venues</TabsTrigger>
          <TabsTrigger value="events"><CalendarPlus className="size-4 mr-1.5" />Events</TabsTrigger>
        </TabsList>
        <TabsContent value="dashboard" className="mt-6"><Dashboard /></TabsContent>
        <TabsContent value="venues" className="mt-6"><VenueBuilder /></TabsContent>
        <TabsContent value="events" className="mt-6"><EventManager /></TabsContent>
      </Tabs>
    </PageShell>
  );
}

function VenueBuilder() {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [sections, setSections] = useState<SectionCfg[]>([
    { name: "VIP", rows: 3, seatsPerRow: 12, price: 250 },
    { name: "PREMIUM", rows: 6, seatsPerRow: 18, price: 120 },
    { name: "REGULAR", rows: 10, seatsPerRow: 24, price: 60 },
  ]);
  const [busy, setBusy] = useState(false);

  const update = (i: number, patch: Partial<SectionCfg>) =>
    setSections((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const layoutConfig = {
        sections: sections.map((sec) => {
          const rowsArray = Array.from({ length: sec.rows }).map((_, rIdx) => ({
            row: String.fromCharCode(65 + rIdx), // A, B, C...
            seatsCount: sec.seatsPerRow,
          }));
          return {
            name: sec.name,
            rows: rowsArray,
          };
        }),
      };

      await api("/api/admin/venues", {
        method: "POST",
        body: JSON.stringify({ name, address, city, layoutConfig }),
      });
      toast.success("Venue created");
      setName(""); setAddress(""); setCity("");
    } catch (err: any) { toast.error(err.message || "Failed"); }
    finally { setBusy(false); }
  };

  const totalSeats = sections.reduce((acc, s) => acc + s.rows * s.seatsPerRow, 0);

  return (
    <form onSubmit={submit} className="glass-strong rounded-2xl p-6 space-y-5">
      <div className="grid sm:grid-cols-3 gap-4">
        <div className="space-y-1.5"><Label>Venue name</Label><Input required value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="space-y-1.5"><Label>Address</Label><Input required value={address} onChange={(e) => setAddress(e.target.value)} /></div>
        <div className="space-y-1.5"><Label>City</Label><Input value={city} onChange={(e) => setCity(e.target.value)} /></div>
      </div>
      <div>
        <div className="flex items-center justify-between mb-2">
          <Label>Sections</Label>
          <span className="text-xs text-muted-foreground">{totalSeats.toLocaleString()} total seats</span>
        </div>
        <div className="space-y-3">
          {sections.map((s, i) => (
            <div key={i} className="grid grid-cols-2 sm:grid-cols-4 gap-3 glass rounded-xl p-3">
              <Input placeholder="Name" value={s.name} onChange={(e) => update(i, { name: e.target.value.toUpperCase() })} />
              <Input type="number" min={1} placeholder="Rows" value={s.rows} onChange={(e) => update(i, { rows: +e.target.value })} />
              <Input type="number" min={1} placeholder="Seats per row" value={s.seatsPerRow} onChange={(e) => update(i, { seatsPerRow: +e.target.value })} />
              <Input type="number" min={0} placeholder="Price" value={s.price} onChange={(e) => update(i, { price: +e.target.value })} />
            </div>
          ))}
        </div>
        <Button type="button" variant="ghost" size="sm" className="mt-2"
          onClick={() => setSections((p) => [...p, { name: "NEW", rows: 1, seatsPerRow: 10, price: 0 }])}>
          + Add section
        </Button>
      </div>
      <Button type="submit" disabled={busy} className="btn-glow btn-glow-hover">{busy ? "Creating..." : "Create venue"}</Button>
    </form>
  );
}

function EventManager() {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [venueId, setVenueId] = useState<string>("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const [v, e] = await Promise.all([
        api<Venue[] | { data: Venue[] }>("/api/admin/venues").catch(() => api<Venue[]>("/api/venues")),
        api<EventItem[] | { data: EventItem[] }>("/api/admin/events").catch(() => api<EventItem[]>("/api/events")),
      ]);
      setVenues(Array.isArray(v) ? v : v?.data ?? []);
      setEvents(Array.isArray(e) ? e : e?.data ?? []);
    } catch {}
  };
  useEffect(() => { void load(); }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/api/admin/events", {
        method: "POST",
        body: JSON.stringify({
          title,
          description,
          venueId,
          startsAt: new Date(startsAt).toISOString(),
          endsAt: new Date(endsAt).toISOString(),
        }),
      });
      toast.success("Draft event created");
      setTitle(""); setDescription(""); setStartsAt(""); setEndsAt("");
      await load();
    } catch (err: any) { toast.error(err.message || "Failed"); }
    finally { setBusy(false); }
  };

  const publish = async (id: string) => {
    try { await api(`/api/admin/events/${id}/publish`, { method: "PATCH" }); toast.success("Event published"); load(); }
    catch (e: any) { toast.error(e.message); }
  };
  const cancel = async (id: string) => {
    try { await api(`/api/admin/events/${id}/cancel`, { method: "PATCH" }); toast.success("Event cancelled"); load(); }
    catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="grid lg:grid-cols-[400px_1fr] gap-6">
      <form onSubmit={create} className="glass-strong rounded-2xl p-6 space-y-4 h-fit">
        <h3 className="font-semibold">New draft event</h3>
        <div className="space-y-1.5"><Label>Title</Label><Input required value={title} onChange={(e) => setTitle(e.target.value)} /></div>
        <div className="space-y-1.5"><Label>Description</Label><Input value={description} onChange={(e) => setDescription(e.target.value)} /></div>
        <div className="space-y-1.5">
          <Label>Venue</Label>
          <Select value={venueId} onValueChange={setVenueId}>
            <SelectTrigger><SelectValue placeholder="Choose venue" /></SelectTrigger>
            <SelectContent>
              {venues.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}{v.city ? ` — ${v.city}` : ""}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5"><Label>Start time</Label><Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required /></div>
        <div className="space-y-1.5"><Label>End time</Label><Input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} required /></div>
        <Button type="submit" disabled={busy} className="btn-glow btn-glow-hover w-full">{busy ? "Creating..." : "Create draft"}</Button>
      </form>

      <div className="space-y-3">
        {events.length === 0 && <div className="glass rounded-2xl p-8 text-center text-muted-foreground">No events yet.</div>}
        {events.map((ev) => (
          <div key={ev.id} className="glass-strong rounded-2xl p-4 flex items-center justify-between gap-3">
            <div>
              <div className="font-medium">{ev.title}</div>
              <div className="text-xs text-muted-foreground">{ev.startTime ? new Date(ev.startTime).toLocaleString() : ""}</div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-xs px-2 py-1 rounded-md glass ${ev.status === "PUBLISHED" ? "text-success" : ev.status === "CANCELLED" ? "text-destructive" : "text-warning"}`}>
                {ev.status || "DRAFT"}
              </span>
              {ev.status !== "PUBLISHED" && ev.status !== "CANCELLED" && (
                <Button size="sm" className="btn-glow btn-glow-hover" onClick={() => publish(ev.id)}>
                  <CheckCircle2 className="size-3.5 mr-1" /> Publish
                </Button>
              )}
              {ev.status !== "CANCELLED" && (
                <Button size="sm" variant="ghost" onClick={() => cancel(ev.id)}>
                  <Ban className="size-3.5 mr-1" /> Cancel
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

type DashboardData = {
  event?: any;
  stats?: {
    total?: number;
    available?: number;
    reserved?: number;
    booked?: number;
    disabled?: number;
  };
  revenue?: number;
  history?: { time: string; booked: number; reserved: number }[];
};

function Dashboard() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    api<EventItem[] | { data: EventItem[] }>("/api/admin/events")
      .catch(() => api<EventItem[]>("/api/events"))
      .then((r) => {
        const list = Array.isArray(r) ? r : r?.data ?? [];
        setEvents(list);
        if (list[0]) setSelected(list[0].id);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!selected) return;
    let alive = true;
    const load = async () => {
      try {
        const d = await api<DashboardData>(`/api/admin/events/${selected}/dashboard`);
        if (alive) setData(d);
      } catch {}
    };
    load();
    const t = setInterval(load, 5000);
    return () => { alive = false; clearInterval(t); };
  }, [selected]);

  const pieData = [
    { name: "Booked", value: data?.stats?.booked ?? 0, color: "oklch(0.62 0.22 25)" },
    { name: "Reserved", value: data?.stats?.reserved ?? 0, color: "oklch(0.78 0.16 75)" },
    { name: "Available", value: data?.stats?.available ?? 0, color: "oklch(0.7 0.14 220)" },
  ];

  return (
    <div className="space-y-6">
      <div className="glass-strong rounded-2xl p-5 flex flex-wrap items-center gap-3">
        <Label className="text-xs text-muted-foreground">Event</Label>
        <Select value={selected} onValueChange={setSelected}>
          <SelectTrigger className="w-72"><SelectValue placeholder="Pick an event" /></SelectTrigger>
          <SelectContent>
            {events.map((e) => <SelectItem key={e.id} value={e.id}>{e.title}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Total seats" value={data?.stats?.total ?? 0} />
        <Stat label="Booked" value={data?.stats?.booked ?? 0} accent="text-destructive" />
        <Stat label="Reserved" value={data?.stats?.reserved ?? 0} accent="text-warning" />
        <Stat label="Revenue" value={`$${(data?.revenue ?? 0).toLocaleString()}`} accent="text-gradient" />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="glass-strong rounded-2xl p-6">
          <h3 className="font-semibold mb-3">Seat distribution</h3>
          <div className="h-72">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={pieData} dataKey="value" outerRadius={100} innerRadius={60} stroke="none">
                  {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8 }} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="glass-strong rounded-2xl p-6">
          <h3 className="font-semibold mb-3">Activity over time</h3>
          <div className="h-72">
            <ResponsiveContainer>
              <BarChart data={data?.history ?? []}>
                <CartesianGrid stroke="oklch(1 0 0 / 0.06)" />
                <XAxis dataKey="time" stroke="var(--muted-foreground)" fontSize={12} />
                <YAxis stroke="var(--muted-foreground)" fontSize={12} />
                <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8 }} />
                <Bar dataKey="booked" stackId="a" fill="oklch(0.62 0.22 25)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="reserved" stackId="a" fill="oklch(0.78 0.16 75)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div className="glass-strong rounded-2xl p-5">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-1 text-3xl font-bold ${accent || ""}`}>{value}</div>
    </div>
  );
}
