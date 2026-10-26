"use client";

import {
  AtSign,
  Check,
  ChevronsUpDown,
  CreditCard,
  Inbox,
  LayoutGrid,
  LogOut,
  MessageSquareHeart,
  Plus,
  Settings,
  SlidersHorizontal,
  User,
} from "lucide-react";
import { Link } from "@/components/app/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/cn";
import { PAGE } from "@/lib/layout";
import { Avatar } from "@/components/ui/avatar";
import { LogoMark, Wordmark } from "@/components/ui/logo";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "@/components/ui/menu";

export type ShellSpace = { id: string; name: string; slug: string; logo: string | null; fresh: number };
export type ShellUser = { name: string; email: string; image: string | null };
// Hosted billing: "12 days left" during the trial, "Payment failed" when a renewal fails.
export type ShellNotice = { label: string; href: string; danger?: boolean } | null;

function SpaceTile({ space, size = 24 }: { space: Pick<ShellSpace, "logo" | "name"> | null; size?: number }) {
  if (space?.logo) {
    return (
      <img
        src={space.logo}
        alt=""
        width={size}
        height={size}
        className="shrink-0 rounded-[6px] bg-surface-2 object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className="grid shrink-0 place-items-center rounded-[6px] bg-surface-3 text-muted"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" width={size * 0.55} height={size * 0.55} fill="currentColor">
        <path d="M12 20.4c-.3 0-.6-.1-.8-.3C6.3 16 3.2 13.1 3.2 9.4 3.2 6.6 5.3 4.5 8 4.5c1.6 0 3 .7 4 2 1-1.3 2.4-2 4-2 2.7 0 4.8 2.1 4.8 4.9 0 3.7-3.1 6.6-8 10.7-.2.2-.5.3-.8.3z" />
      </svg>
    </span>
  );
}

export { SpaceTile };

function SpaceSwitcher({ spaces, current, compact }: { spaces: ShellSpace[]; current: ShellSpace | null; compact?: boolean }) {
  const router = useRouter();
  return (
    <Menu>
      <MenuTrigger
        className={cn(
          "flex min-w-0 items-center gap-2.5 rounded-[8px] text-left transition-colors outline-none hover:bg-surface-2 focus-visible:ring-soft data-[state=open]:bg-surface-2",
          compact ? "h-10 max-w-[60vw] px-2" : "h-10 w-full px-2",
        )}
        aria-label="Switch space"
      >
        <SpaceTile space={current} size={compact ? 24 : 24} />
        <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{current?.name ?? "Spaces"}</span>
        <ChevronsUpDown className="size-3.5 shrink-0 text-faint" />
      </MenuTrigger>
      <MenuContent align="start" className="w-64">
        <MenuLabel>Spaces</MenuLabel>
        {spaces.map((s) => (
          <MenuItem key={s.id} onSelect={() => router.push(`/app/${s.id}`)}>
            <SpaceTile space={s} size={22} />
            <span className="min-w-0 flex-1 truncate">{s.name}</span>
            {s.id === current?.id ? (
              <Check className="size-4" strokeWidth={2.5} />
            ) : s.fresh > 0 ? (
              <span className="text-[12px] text-muted tabular-nums">{s.fresh}</span>
            ) : null}
          </MenuItem>
        ))}
        <MenuSeparator />
        <MenuItem onSelect={() => router.push("/app/new")}>
          <Plus /> New space
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

function AccountMenu({ user, compact, notice }: { user: ShellUser; compact?: boolean; notice?: ShellNotice }) {
  const router = useRouter();
  return (
    <Menu>
      <MenuTrigger
        className={cn(
          "flex min-w-0 items-center gap-2.5 rounded-[8px] text-left transition-colors outline-none hover:bg-surface-2 focus-visible:ring-soft data-[state=open]:bg-surface-2",
          compact ? "size-10 justify-center rounded-full" : "h-11 w-full px-2",
        )}
        aria-label={notice?.danger ? `Account: ${notice.label}` : "Account"}
      >
        <span className="relative">
          <Avatar src={user.image} size={compact ? 28 : 26} />
          {compact && notice?.danger && (
            <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-danger ring-2 ring-canvas" aria-hidden />
          )}
        </span>
        {!compact && (
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium">{user.name || user.email.split("@")[0]}</span>
            <span className="block truncate text-[12px] text-muted">{user.email}</span>
          </span>
        )}
      </MenuTrigger>
      <MenuContent align={compact ? "end" : "start"} side={compact ? "bottom" : "top"} className="w-56">
        {notice && (
          <>
            <MenuItem onSelect={() => router.push(notice.href)} className={cn(notice.danger && "text-danger")}>
              <CreditCard /> {notice.label}
            </MenuItem>
            <MenuSeparator />
          </>
        )}
        <MenuItem onSelect={() => router.push("/app/settings")}>
          <User /> Account
        </MenuItem>
        <MenuSeparator />
        <MenuItem
          onSelect={async () => {
            await authClient.signOut();
            window.location.assign("/login");
          }}
        >
          <LogOut /> Sign out
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

// Lets pages update the sidebar (new-testimonial counts, renamed spaces) without a server round trip.
const ShellCtx = createContext<{ patchSpace: (id: string, patch: Partial<ShellSpace>) => void }>({ patchSpace: () => {} });
export const useShell = () => useContext(ShellCtx);

export function Shell({
  user,
  spaces: initial,
  notice = null,
  children,
}: {
  user: ShellUser;
  spaces: ShellSpace[];
  notice?: ShellNotice;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [spaces, setSpaces] = useState(initial);
  const [seen, setSeen] = useState(initial);
  if (seen !== initial) {
    setSeen(initial);
    setSpaces(initial);
  }
  const segment = pathname.split("/")[2] ?? "";
  const currentId = segment && segment !== "new" && segment !== "settings" ? segment : null;
  const current = spaces.find((s) => s.id === currentId) ?? null;
  useEffect(() => {
    if (current)
      document.cookie = `lw-space=${current.id}; path=/app; max-age=31536000; samesite=lax${location.protocol === "https:" ? "; secure" : ""}`;
  }, [current]);
  const patchSpace = (id: string, patch: Partial<ShellSpace>) =>
    setSpaces((list) => list.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const base = current ? `/app/${current.id}` : null;
  const nav = base
    ? [
        { href: base, label: "Inbox", icon: Inbox, badge: current?.fresh ?? 0, active: pathname === base },
        { href: `${base}/widgets`, label: "Widgets", icon: LayoutGrid, active: pathname.startsWith(`${base}/widgets`) },
        { href: `${base}/collect`, label: "Collect", icon: MessageSquareHeart, active: pathname.startsWith(`${base}/collect`) },
        { href: `${base}/mentions`, label: "Mentions", icon: AtSign, active: pathname.startsWith(`${base}/mentions`) },
        { href: `${base}/settings`, label: "Settings", icon: SlidersHorizontal, active: pathname.startsWith(`${base}/settings`) },
      ]
    : [];

  return (
    <ShellCtx.Provider value={{ patchSpace }}>
      <div className="min-h-dvh bg-canvas">
        {/* Laptop: sidebar */}
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r border-line bg-grouped px-3 pt-4 pb-3 md:flex">
          <Link href="/app" className="mb-3 flex h-9 items-center rounded-lg px-2" aria-label="Lovewall">
            <Wordmark size="sm" />
          </Link>
          <SpaceSwitcher spaces={spaces} current={current} />
          <nav className="mt-2 flex flex-col gap-px" aria-label="Space">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={item.active ? "page" : undefined}
                className={cn(
                  "flex h-8 items-center gap-2.5 rounded-[7px] px-2.5 text-[14px] font-medium transition-colors",
                  item.active ? "bg-surface-3/70 text-ink" : "text-muted hover:bg-surface-2 hover:text-ink",
                )}
              >
                <item.icon className="size-4" strokeWidth={1.9} />
                <span className="flex-1">{item.label}</span>
                {item.badge ? <span className="text-[12px] text-muted tabular-nums">{item.badge}</span> : null}
              </Link>
            ))}
          </nav>
          <div className="mt-auto">
            {notice && (
              <Link
                href={notice.href}
                className={cn(
                  "mb-1 flex h-8 items-center rounded-[7px] px-2.5 text-[13px] transition-colors hover:bg-surface-2",
                  notice.danger ? "text-danger" : "text-muted hover:text-ink",
                )}
              >
                {notice.label}
              </Link>
            )}
            <Link
              href="/app/settings"
              aria-current={pathname === "/app/settings" ? "page" : undefined}
              className={cn(
                "mb-1 flex h-8 items-center gap-2.5 rounded-[7px] px-2.5 text-[14px] font-medium transition-colors",
                pathname === "/app/settings" ? "bg-surface-3/70 text-ink" : "text-muted hover:bg-surface-2 hover:text-ink",
              )}
            >
              <Settings className="size-4" strokeWidth={1.9} /> Account
            </Link>
            <AccountMenu user={user} />
          </div>
        </aside>

        {/* Phone: top bar */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-2 bar px-3 pt-safe hairline-b md:hidden">
          {spaces.length ? (
            <SpaceSwitcher spaces={spaces} current={current} compact />
          ) : (
            <Link href="/app" aria-label="Lovewall" className="px-1">
              <LogoMark size={28} />
            </Link>
          )}
          <AccountMenu user={user} compact notice={notice} />
        </header>

        <div className={cn("md:pl-[248px]", nav.length && "pb-[calc(64px+env(safe-area-inset-bottom))] md:pb-0")}>{children}</div>

        {/* Phone: tab bar */}
        {nav.length > 0 && (
          <nav
            className="fixed inset-x-0 bottom-0 z-30 grid bar pb-safe hairline-t md:hidden"
            style={{ gridTemplateColumns: `repeat(${nav.length}, minmax(0, 1fr))` }}
            aria-label="Space"
          >
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={item.active ? "page" : undefined}
                className={cn(
                  "relative flex h-[58px] flex-col items-center justify-center gap-1 text-[10.5px] font-medium transition-colors",
                  item.active ? "text-ink" : "text-faint",
                )}
              >
                <span className="relative">
                  <item.icon className="size-[22px]" strokeWidth={item.active ? 2.2 : 1.9} />
                  {item.badge ? (
                    <span
                      className="absolute -top-0.5 -right-1 size-2 rounded-full bg-accent ring-2 ring-canvas"
                      aria-label={`${item.badge} new`}
                    />
                  ) : null}
                </span>
                {item.label}
              </Link>
            ))}
          </nav>
        )}
      </div>
    </ShellCtx.Provider>
  );
}

export function Page({ width, className, children }: { width?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={PAGE}>
      <div className={cn(width, className)}>{children}</div>
    </div>
  );
}

// Page header: a large title with its actions.
export function PageHeader({
  title,
  children,
  back,
  width,
}: {
  title: React.ReactNode;
  children?: React.ReactNode;
  back?: React.ReactNode;
  width?: string;
}) {
  return (
    <Page width={width} className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3 pt-5 pb-4 md:pt-9 md:pb-6">
      <div className="min-w-0">
        {back}
        <h1 className="truncate font-display text-[24px] leading-[30px] font-semibold md:text-[26px] md:leading-[32px]">{title}</h1>
      </div>
      {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
    </Page>
  );
}
