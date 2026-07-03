import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Bell, LogOut, Ticket, User as UserIcon } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { NotificationsBell } from "@/components/notifications-bell";

export function NavBar() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const NavLink = ({ to, children }: { to: string; children: React.ReactNode }) => {
    const active = pathname === to || (to !== "/" && pathname.startsWith(to));
    return (
      <Link
        to={to}
        className={`px-3 py-2 rounded-md text-sm transition-colors ${
          active ? "text-foreground bg-white/5" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        {children}
      </Link>
    );
  };

  return (
    <header className="sticky top-0 z-40 glass-strong">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 group">
          <div className="size-9 rounded-lg btn-glow flex items-center justify-center">
            <Ticket className="size-5" />
          </div>
          <span className="font-semibold tracking-tight text-lg">
            Stagepass
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          <NavLink to="/">Events</NavLink>
          {user && <NavLink to="/bookings">My Bookings</NavLink>}
          {user?.role === "ADMIN" && <NavLink to="/admin">Admin</NavLink>}
        </nav>

        <div className="flex items-center gap-2">
          {user ? (
            <>
              <NotificationsBell />
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-md glass text-sm">
                <UserIcon className="size-4 text-muted-foreground" />
                <span className="max-w-[140px] truncate">{user.name || user.email}</span>
              </div>
              <Button variant="ghost" size="sm" onClick={() => { logout(); nav({ to: "/login" }); }}>
                <LogOut className="size-4" />
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={() => nav({ to: "/login" })}>Log in</Button>
              <Button size="sm" className="btn-glow btn-glow-hover" onClick={() => nav({ to: "/register" })}>
                Sign up
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <NavBar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 animate-float-in">{children}</main>
    </div>
  );
}

export { Bell };
