import { useEffect, useState } from "react";
import { Bell, Check } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useWsEvent, useWsRoom } from "@/lib/ws";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuTrigger, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type Notification = {
  id: string;
  type?: string;
  title?: string;
  message: string;
  read?: boolean;
  createdAt?: string;
};

export function NotificationsBell() {
  const { user } = useAuth();
  const [items, setItems] = useState<Notification[]>([]);

  useWsRoom(user ? `user:${user.id}` : null);

  const load = async () => {
    try {
      const data = await api<Notification[] | { data: Notification[] }>("/api/notifications");
      const list = Array.isArray(data) ? data : data?.data ?? [];
      setItems(list);
    } catch {}
  };

  useEffect(() => { if (user) void load(); }, [user]);

  useWsEvent("notification", (d: Notification) => {
    setItems((prev) => [{ ...d, id: d.id || crypto.randomUUID() }, ...prev]);
    toast(d.title || "Notification", { description: d.message });
  }, [user]);

  useWsEvent("booking:confirmed", (d: any) => {
    toast.success("Booking confirmed", { description: `Reference: ${d?.reference || d?.bookingId || ""}` });
    void load();
  }, [user]);

  useWsEvent("payment:failed", (d: any) => {
    toast.error("Payment failed", { description: d?.reason || "Please try again." });
    void load();
  }, [user]);

  const unread = items.filter((n) => !n.read).length;

  const markRead = async (id: string) => {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    try { await api(`/api/notifications/${id}/read`, { method: "PATCH" }); } catch {}
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="relative">
          <Bell className="size-4" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 text-[10px] rounded-full bg-primary text-primary-foreground flex items-center justify-center">
              {unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 glass-strong">
        <div className="px-3 py-2 text-xs uppercase tracking-wider text-muted-foreground">Notifications</div>
        {items.length === 0 && (
          <div className="px-3 py-6 text-sm text-muted-foreground text-center">You're all caught up.</div>
        )}
        {items.slice(0, 20).map((n) => (
          <DropdownMenuItem
            key={n.id}
            onClick={() => !n.read && markRead(n.id)}
            className="flex flex-col items-start gap-0.5 py-2"
          >
            <div className="flex w-full items-center gap-2">
              <span className={`size-1.5 rounded-full ${n.read ? "bg-muted" : "bg-primary"}`} />
              <span className="text-sm font-medium flex-1 truncate">{n.title || n.type || "Notice"}</span>
              {!n.read && <Check className="size-3 text-muted-foreground" />}
            </div>
            <span className="text-xs text-muted-foreground line-clamp-2">{n.message}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
