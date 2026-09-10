"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { useNotificationStore } from "@/store/useNotificationStore";
import { api } from "@/lib/api";
import {
  LayoutDashboard,
  Package,
  BarChart3,
  Settings,
  LogOut,
  Layers,
  Sun,
  Moon,
  Monitor,
  Bell,
  Search,
  User,
  X,
  ChevronRight,
  MapPin,
  Menu,
  ChevronLeft,
  AlertTriangle,
  CheckCircle2,
  Info,
  Key,
  Ticket,
  Link as LinkIcon,
  XCircle,
} from "lucide-react";
import { CustomerPageSkeleton } from "@/components/ui/Skeleton";
import { NetworkStatusBanner } from "@/components/ui/AsyncRecoveryState";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import PushNotificationPrompt from "@/components/PushNotificationPrompt";
import WalletWidget from "@/components/WalletWidget";
import { cn } from "@/lib/utils";
import { clientLog } from "@/lib/clientLogger";
import { sanitizeDeepLink } from "@/lib/deepLink";

import { getSocket, disconnectSocket } from "@/lib/socket";
import { clearCustomerOrderDraft } from "@/components/orders/OrderSchemas";
import LocaleSwitcher from "@/components/i18n/LocaleSwitcher";
import { useI18n } from "@/components/i18n/I18nProvider";
import { formatTime } from "@/i18n/format";
import type { MessageKey } from "@/i18n/messages";
import { useTheme } from "@/components/providers/ThemeProvider";

interface DBNotification {
  id: string;
  title: string;
  body: string;
  type: string;
  is_read: boolean;
  created_at: string;
  order_id?: string;
  metadata?: any;
  deep_link?: string;
}

// S3-CW-03: deep_link validation extracted to @/lib/deepLink (shared with /notifikasi page)

/**
 * Emitted by notification pages after mark-read/clear mutations so the bell
 * badge in this layout can re-sync without a full reload.
 */
const NOTIFICATIONS_UPDATED_EVENT = "tembus:notifications-updated";

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { locale, t } = useI18n();
  const { isAuthenticated, isLoading, setAuth, setLoading, user } =
    useAuthStore();
  const { notifications, addNotification, removeNotification } =
    useNotificationStore();
  const router = useRouter();
  const pathname = usePathname();
  const { theme, resolvedTheme, setTheme } = useTheme();

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [bellNotifications, setBellNotifications] = useState<DBNotification[]>(
    [],
  );

  // Socket initialization
  useEffect(() => {
    if (isAuthenticated && user?.id) {
      const socket = getSocket(user.id);
      if (socket) {
        socket.on("new_notification", (notif: DBNotification) => {
          clientLog.debug("Customer notification received", {
            type: notif.type,
            hasOrder: Boolean(notif.order_id),
            hasDeepLink: Boolean(notif.deep_link),
          });
          // Add to toast
          addNotification({
            title: notif.title,
            message: notif.body,
            type:
              notif.type === "critical"
                ? "error"
                : ["success", "error", "warning"].includes(notif.type)
                  ? (notif.type as "success" | "error" | "warning")
                  : "info",
            persist: notif.type === "critical",
          });
          // Add to bell list
          setBellNotifications((prev) => {
            // Avoid duplicates
            if (prev.find((n) => n.id === notif.id)) return prev;
            return [notif, ...prev];
          });

          // If it's a dispute chat, we might want to refresh current chat view if open
          if (notif.type === "dispute_chat") {
            // Dispatch a custom event for local components to listen to
            window.dispatchEvent(
              new CustomEvent("new_dispute_chat_notification", {
                detail: notif,
              }),
            );
          }
        });
      }
    }

    return () => {
      // We don't necessarily want to disconnect on every re-render,
      // but if the layout unmounts or auth changes, we might.
      // For a persistent layout, this runs on unmount.
    };
  }, [isAuthenticated, user?.id, addNotification]);

  // Auth check
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await api.get("/auth/web/me");
        setAuth(true, response.data.user);
      } catch (error) {
        clientLog.error("Auth check failed", { error });
        setAuth(false, null);
        router.push("/login");
      } finally {
        setLoading(false);
      }
    };

    if (!isAuthenticated && isLoading) {
      checkAuth();
    } else if (!isAuthenticated && !isLoading) {
      router.push("/login");
    }
  }, [isAuthenticated, isLoading, router, setAuth, setLoading]);

  // Initial fetch for notifications + re-sync when notification pages mutate them
  const fetchBellNotifications = useCallback(async () => {
    if (isAuthenticated) {
      try {
        const res = await api.get("/auth/web/notifications");
        setBellNotifications(res.data.notifications || []);
      } catch (error) {
        clientLog.error("Failed to fetch notifications", { error });
      }
    }
  }, [isAuthenticated]);

  useEffect(() => {
    void fetchBellNotifications();
  }, [fetchBellNotifications]);

  useEffect(() => {
    const handler = () => void fetchBellNotifications();
    window.addEventListener(NOTIFICATIONS_UPDATED_EVENT, handler);
    return () =>
      window.removeEventListener(NOTIFICATIONS_UPDATED_EVENT, handler);
  }, [fetchBellNotifications]);

  // Command palette state
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setIsSearchOpen((prev) => !prev);
      }
      if (e.key === "Escape") {
        setIsSearchOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Notifications & User dropdowns
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [isUserOpen, setIsUserOpen] = useState(false);

  const handleLogout = async () => {
    try {
      await api.post("/auth/web/logout");
    } catch (error) {
      clientLog.error("Logout failed", { error });
    } finally {
      clearCustomerOrderDraft();
      setAuth(false, null);
      router.push("/login");
    }
  };

  // Navigation Items — only customer-facing pages
  const navItems = [
    { labelKey: "nav.dashboard", href: "/dashboard", icon: LayoutDashboard },
    { labelKey: "nav.paymentLinks", href: "/payment-links", icon: LinkIcon },
    { labelKey: "nav.products", href: "/products", icon: Package },
    { labelKey: "nav.ordersNew", href: "/orders/new", icon: Package },
    { labelKey: "nav.ordersBulk", href: "/orders/bulk", icon: Layers },
    { labelKey: "nav.orders", href: "/orders", icon: Package },
    { labelKey: "nav.help", href: "/disputes", icon: AlertTriangle },
    { labelKey: "nav.tracking", href: "/resi", icon: Layers },
    { labelKey: "nav.voucher", href: "/voucher", icon: Ticket },
    { labelKey: "nav.addresses", href: "/alamat", icon: MapPin },
    { labelKey: "nav.reports", href: "/laporan", icon: BarChart3 },
    { labelKey: "common.notifications", href: "/notifikasi", icon: Bell },
    { labelKey: "nav.profile", href: "/profil", icon: Settings },
  ] satisfies Array<{
    labelKey: MessageKey;
    href: string;
    icon: typeof LayoutDashboard;
  }>;

  const orderCreationRoutes = ["/orders/new", "/orders/bulk"];
  const isNavigationItemActive = (href: string) => {
    if (href === "/orders") {
      return (
        pathname === href ||
        (pathname.startsWith("/orders/") &&
          !orderCreationRoutes.some(
            (route) => pathname === route || pathname.startsWith(`${route}/`),
          ))
      );
    }

    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const cycleTheme = () => {
    setTheme(
      theme === "light" ? "dark" : theme === "dark" ? "system" : "light",
    );
  };

  // Top fake progress/loading bar during navigation
  const [isNavigating, setIsNavigating] = useState(false);
  useEffect(() => {
    setIsNavigating(true);
    const timer = setTimeout(() => setIsNavigating(false), 500);
    return () => clearTimeout(timer);
  }, [pathname]);

  const filteredSearchItems = navItems.filter((item) =>
    t(item.labelKey).toLowerCase().includes(searchQuery.toLowerCase()),
  );

  if (isLoading) {
    return (
      <div className="min-h-screen w-full bg-background p-6">
        <CustomerPageSkeleton />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex overflow-hidden transition-colors duration-300">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[200] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-3 focus:text-on-primary"
      >
        Lewati ke konten utama
      </a>

      {/* Background decoration */}
      <div className="fixed top-0 left-0 w-full h-full pointer-events-none opacity-20">
        <div className="absolute top-[-10%] right-[-10%] w-[30%] h-[30%] bg-primary/20 rounded-full blur-[100px]" />
      </div>

      {/* Top fake progress bar */}
      <AnimatePresence>
        {isNavigating && (
          <motion.div
            initial={{ width: "0%" }}
            animate={{ width: "100%" }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: "easeInOut" }}
            className="fixed top-0 left-0 h-1 bg-primary z-[120] pointer-events-none shadow-[0_0_10px_rgba(34,197,94,0.7)]"
          />
        )}
      </AnimatePresence>

      <NetworkStatusBanner />

      {/* Sidebar - Desktop */}
      <motion.aside
        initial={false}
        animate={{ width: isCollapsed ? 80 : 280 }}
        className="hidden lg:flex flex-col border-r border-border bg-surface relative z-30 transition-colors duration-300"
      >
        <div className="p-6 h-20 flex items-center justify-between shrink-0">
          {!isCollapsed ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-3"
            >
              <img
                src="/tembusweb.svg"
                alt="Tembus"
                className="h-10 object-contain drop-shadow-md"
              />
            </motion.div>
          ) : (
            <div className="h-10 w-10 overflow-hidden flex items-center justify-center mx-auto">
              <img
                src="/tembusweb.svg"
                alt="Tembus"
                className="h-10 w-auto max-w-none object-cover object-left drop-shadow-md -ml-3"
              />
            </div>
          )}
        </div>

        <WalletWidget isCollapsed={isCollapsed} />

        <nav
          aria-label="Navigasi utama"
          className="flex-1 px-4 space-y-1 mt-2 overflow-y-auto"
        >
          {navItems.map((item) => {
            const active = isNavigationItemActive(item.href);
            return (
              <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined}>
                <motion.div
                  whileHover={{ x: 4, scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition-all duration-200 group mb-1",
                    active
                      ? "bg-primary text-on-primary shadow-lg shadow-primary/20"
                      : "text-foreground-secondary hover:bg-surface-subtle hover:text-foreground",
                  )}
                >
                  <item.icon
                    className={cn(
                      "h-5 w-5 flex-shrink-0 transition-colors",
                      active
                        ? "text-on-primary"
                        : "group-hover:text-primary-light",
                    )}
                    aria-hidden="true"
                  />
                  {!isCollapsed && (
                    <span className="font-medium whitespace-nowrap">
                      {t(item.labelKey)}
                    </span>
                  )}
                </motion.div>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-border shrink-0">
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="w-full flex items-center justify-center p-3 rounded-xl bg-surface-subtle hover:bg-border text-foreground-muted hover:text-foreground transition-all group"
          >
            <ChevronLeft
              className={cn(
                "h-5 w-5 transition-transform duration-300 group-hover:scale-110",
                isCollapsed && "rotate-180",
              )} aria-hidden="true" />
          </button>
        </div>
      </motion.aside>

      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileMenuOpen(false)}
              className="fixed inset-0 bg-scrim/60 backdrop-blur-sm z-[100] lg:hidden"
            />
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed top-0 left-0 bottom-0 w-[280px] bg-background z-[101] lg:hidden flex flex-col p-6 border-r border-border/40"
            >
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                  <img
                    src="/tembusweb.svg"
                    alt="Tembus"
                    className="h-10 object-contain drop-shadow-md"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setIsMobileMenuOpen(false)}
                  aria-label="Tutup navigasi"
                  className="p-2 text-foreground-muted hover:bg-surface-subtle rounded-xl transition-all"
                >
                  <X size={24} aria-hidden="true" />
                </button>
              </div>

              <WalletWidget />

              <nav
                aria-label="Navigasi mobile"
                className="space-y-1 overflow-y-auto flex-1 mt-4"
              >
                {navItems.map((item) => {
                  const active = isNavigationItemActive(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      onClick={() => setIsMobileMenuOpen(false)}
                    >
                      <div
                        className={cn(
                          "flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition-all duration-200 mb-1",
                          active
                            ? "bg-primary text-on-primary shadow-lg shadow-primary/20"
                            : "text-foreground-secondary hover:bg-surface-subtle hover:text-foreground",
                        )}
                      >
                        <item.icon
                          className={cn(
                            "h-5 w-5 flex-shrink-0",
                            active
                              ? "text-on-primary"
                              : "text-foreground-muted",
                          )}
                          aria-hidden="true"
                        />
                        <span className="font-medium whitespace-nowrap">
                          {t(item.labelKey)}
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </nav>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <main
        id="main-content"
        tabIndex={-1}
        className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden relative"
      >
        {/* Topbar */}
        <header className="h-20 border-b border-border bg-surface flex items-center justify-between px-6 sticky top-0 z-50 transition-colors duration-300">
          <div className="flex items-center gap-4 flex-1">
            <button
              aria-label="Open navigation"
              className="lg:hidden p-2.5 text-foreground-muted hover:text-foreground hover:bg-surface-subtle rounded-xl transition-all"
              onClick={() => setIsMobileMenuOpen(true)}
            >
              <Menu className="h-6 w-6" aria-hidden="true" />
            </button>
            <div className="relative max-w-md w-full hidden md:block">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground-muted"
                aria-hidden="true"
              />
              <input
                type="text"
                aria-label={t("nav.searchPlaceholder")}
                placeholder={t("nav.searchPlaceholder")}
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  if (e.target.value.length > 0) setIsSearchOpen(true);
                  else setIsSearchOpen(false);
                }}
                className="w-full bg-surface-subtle dark:bg-surface-subtle border border-border dark:border-border rounded-xl py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all placeholder:text-foreground-muted dark:placeholder:text-foreground-muted text-foreground"
              />
              <kbd className="absolute right-3 top-1/2 -translate-y-1/2 hidden lg:inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-border dark:border-border text-foreground-muted font-mono">
                Ctrl K
              </kbd>
            </div>
          </div>

          <div className="flex items-center gap-3 md:gap-4">
            <LocaleSwitcher />
            {/* Theme Toggle */}
            <button
              onClick={cycleTheme}
              aria-pressed={theme === "dark"}
              className="relative p-2.5 text-foreground-muted hover:text-foreground hover:bg-surface-subtle rounded-xl transition-all"
              title={`${t("common.toggleTheme")} (${theme})`}
              aria-label={`${t("common.toggleTheme")} (${theme}). ${resolvedTheme}`}
            >
              {theme === "system" ? (
                <Monitor className="h-5 w-5" aria-hidden="true" />
              ) : resolvedTheme === "dark" ? (
                <Sun className="h-5 w-5" aria-hidden="true" />
              ) : (
                <Moon className="h-5 w-5" aria-hidden="true" />
              )}
            </button>

            {/* Notification */}
            <div className="relative">
              <button
                type="button"
                aria-label={t("common.notifications")}
                onClick={() => {
                  setIsNotifOpen(!isNotifOpen);
                  setIsUserOpen(false);
                }}
                className="relative p-2.5 text-foreground-muted dark:text-foreground-muted hover:text-foreground hover:bg-surface-subtle dark:hover:bg-surface-subtle rounded-xl transition-all"
              >
                <Bell className="h-5 w-5" aria-hidden="true" />
                {bellNotifications.some((n) => !n.is_read) && (
                  <span className="absolute top-2.5 right-2.5 w-2.5 h-2.5 bg-primary-light rounded-full border-2 border-background" />
                )}
              </button>
              <AnimatePresence>
                {isNotifOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setIsNotifOpen(false)}
                    />
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      transition={{ duration: 0.2 }}
                      className="absolute right-0 mt-2 w-80 bg-surface dark:bg-surface border border-border dark:border-border shadow-2xl rounded-2xl p-4 flex flex-col max-h-[380px] z-50 select-none"
                    >
                      <div className="flex items-center justify-between border-b border-border dark:border-border pb-2 mb-2">
                        <span className="text-xs font-semibold text-foreground">
                          {t("common.notifications")}
                        </span>
                        <button
                          onClick={async () => {
                            try {
                              await api.delete("/auth/web/notifications");
                              setBellNotifications([]);
                            } catch (e) {
                              clientLog.error("Failed to clear notifications", {
                                error: e,
                              });
                            }
                          }}
                          className="text-[10px] text-primary hover:underline"
                        >
                          {t("common.clearAll")}
                        </button>
                      </div>
                      <div className="overflow-y-auto space-y-2 flex-1 scrollbar-hide">
                        {bellNotifications.length > 0 ? (
                          bellNotifications.map((notif) => (
                            <div
                              key={notif.id}
                              className={cn(
                                "p-2.5 rounded-xl transition-all duration-200 cursor-pointer",
                                notif.is_read
                                  ? "bg-transparent opacity-60"
                                  : "bg-surface-subtle dark:bg-surface-subtle hover:bg-surface-subtle dark:hover:bg-surface-subtle",
                              )}
                              onClick={async () => {
                                if (!notif.is_read) {
                                  try {
                                    await api.patch(
                                      `/auth/web/notifications/${notif.id}/read`,
                                    );
                                    setBellNotifications((prev) =>
                                      prev.map((n) =>
                                        n.id === notif.id
                                          ? { ...n, is_read: true }
                                          : n,
                                      ),
                                    );
                                  } catch (e) {
                                    clientLog.error(
                                      "Failed to mark notification as read",
                                      { error: e },
                                    );
                                  }
                                }
                                if (notif.deep_link) {
                                  // S3-CW-03: Validate deep_link before navigation to prevent open redirect.
                                  // S3-CW-03b: Route allowlist enforced — only customer pages allowed.
                                  const safeLink = sanitizeDeepLink(
                                    notif.deep_link,
                                  );
                                  if (safeLink) {
                                    router.push(safeLink);
                                  } else {
                                    clientLog.warn(
                                      "Blocked suspicious deep_link from notification",
                                      { raw: notif.deep_link },
                                    );
                                  }
                                  setIsNotifOpen(false);
                                }
                              }}
                            >
                              <div className="flex items-start justify-between">
                                <p className="text-xs font-semibold text-foreground">
                                  {notif.title}
                                </p>
                                {!notif.is_read && (
                                  <span className="w-2 h-2 bg-primary rounded-full mt-1" />
                                )}
                              </div>
                              <p className="text-[11px] text-foreground-muted dark:text-foreground-muted mt-0.5 leading-relaxed">
                                {notif.body}
                              </p>
                              <span className="text-[9px] text-foreground-muted dark:text-foreground-muted mt-1 block">
                                {formatTime(notif.created_at, locale)}
                              </span>
                            </div>
                          ))
                        ) : (
                          <div className="flex flex-col items-center justify-center py-8 text-center">
                            <Bell className="h-8 w-8 text-foreground-muted dark:text-foreground-muted mb-2" aria-hidden="true" />
                            <p className="text-xs text-foreground-muted">
                              {t("common.noNotifications")}
                            </p>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>

            <div className="h-8 w-px bg-surface-subtle dark:bg-surface-subtle mx-1 md:mx-2 hidden sm:block" />

            {/* Profile Dropdown */}
            <div className="relative">
              <div
                className="flex items-center gap-3 group p-1.5 hover:bg-surface-subtle dark:hover:bg-surface-subtle rounded-xl transition-all cursor-pointer"
                onClick={() => {
                  setIsUserOpen(!isUserOpen);
                  setIsNotifOpen(false);
                }}
              >
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-bold text-foreground group-hover:text-primary-light transition-colors">
                    {user?.name || t("nav.profileDefault")}
                  </p>
                  <p className="text-[10px] tracking-widest text-foreground-muted font-bold">
                    {user?.awb_sender_name
                      ? t("nav.sender", {
                          name: user.awb_sender_name.toUpperCase(),
                        })
                      : t("nav.standardTier")}
                  </p>
                </div>
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-primary p-[1px] shadow-lg shadow-primary/10">
                  <div className="h-full w-full rounded-[11px] bg-background flex items-center justify-center overflow-hidden">
                    <img
                      src={`https://ui-avatars.com/api/?name=${encodeURIComponent(user?.name || "Customer")}&background=006437&color=fff`}
                      alt="Avatar"
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>
              </div>

              <AnimatePresence>
                {isUserOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setIsUserOpen(false)}
                    />
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      transition={{ duration: 0.2 }}
                      className="absolute right-0 mt-2 w-48 bg-surface dark:bg-surface border border-border dark:border-border shadow-2xl rounded-2xl p-2 flex flex-col z-50 select-none"
                    >
                      <Link
                        href="/profil"
                        onClick={() => setIsUserOpen(false)}
                        className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-foreground-muted dark:text-foreground-muted hover:bg-surface-subtle dark:hover:bg-surface-subtle hover:text-foreground transition-all duration-200 select-none"
                      >
                        <User className="h-4 w-4 shrink-0" aria-hidden="true" />
                        {t("nav.profileLink")}
                      </Link>
                      <button
                        onClick={handleLogout}
                        className="flex items-center gap-2 px-3 py-2 mt-1 rounded-xl text-sm text-foreground-muted hover:bg-error-surface hover:text-error transition-all duration-200 select-none cursor-pointer text-left w-full"
                      >
                        <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
                        {t("nav.logout")}
                      </button>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          </div>
        </header>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 lg:p-8 scroll-smooth pb-24 md:pb-8">
          {children}
        </div>

        {/* Mobile Bottom Navigation Bar (≤ 767px) */}
        <nav
          aria-label="Navigasi bawah mobile"
          className="fixed bottom-0 left-0 right-0 h-16 border-t border-border dark:border-border bg-surface-subtle dark:bg-surface-subtle flex justify-around items-center px-2 z-50 md:hidden select-none pb-safe"
        >
          {navItems.slice(0, 5).map((item) => {
            const isActive = isNavigationItemActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={`flex flex-col items-center justify-center gap-1 px-3 py-1 rounded-xl transition-all duration-200 select-none ${
                  isActive
                    ? "text-primary font-bold"
                    : "text-foreground-muted dark:text-foreground-muted"
                }`}
              >
                <item.icon
                  className={cn(
                    "h-5 w-5 shrink-0",
                    isActive && "text-primary animate-pulse",
                  )}
                  aria-hidden="true"
                />
                <span className="text-[10px] tracking-tight">
                  {t(item.labelKey)}
                </span>
              </Link>
            );
          })}
        </nav>
      </main>

      {/* Global Command Palette / Search Dialog */}
      <AnimatePresence>
        {isSearchOpen && (
          <div className="fixed inset-0 bg-background/60 backdrop-blur-sm flex items-start justify-center pt-[15vh] px-4 z-[150] select-none transition-all duration-300">
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.98 }}
              transition={{ duration: 0.2 }}
              className="w-full max-w-lg glass-card rounded-2xl shadow-2xl p-4 flex flex-col gap-3 select-none overflow-hidden"
            >
              <div className="flex items-center gap-3 border border-border dark:border-border bg-surface-subtle dark:bg-surface-subtle rounded-xl px-3 py-2.5 transition-all shadow-sm">
                <Search className="h-4 w-4 text-foreground-muted shrink-0" aria-hidden="true" />
                <input
                  type="text"
                  placeholder={t("nav.featureSearchPlaceholder")}
                  className="flex-1 text-sm bg-transparent border-none focus:outline-none text-foreground placeholder:text-foreground-muted select-text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setIsSearchOpen(false)}
                  aria-label={t("common.close")}
                  title={t("common.close")}
                  className="p-1.5 rounded-lg text-foreground-muted hover:bg-surface-subtle dark:hover:bg-surface-subtle hover:text-foreground transition-all cursor-pointer select-none"
                >
                  <X className="h-4 w-4 shrink-0" aria-hidden="true" />
                </button>
              </div>

              {/* Navigation list */}
              <div className="max-h-72 overflow-y-auto select-none mt-1 space-y-1">
                {filteredSearchItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => {
                      setIsSearchOpen(false);
                      setSearchQuery("");
                    }}
                    className="flex items-center justify-between p-3 rounded-xl hover:bg-surface-subtle dark:hover:bg-surface-subtle text-foreground-muted dark:text-foreground-muted hover:text-foreground transition-all cursor-pointer border border-transparent hover:border-border dark:hover:border-border select-none"
                  >
                    <div className="flex items-center gap-3">
                      <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span className="text-sm font-medium">
                        {t(item.labelKey)}
                      </span>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-foreground-muted" aria-hidden="true" />
                  </Link>
                ))}
                {filteredSearchItems.length === 0 && (
                  <div className="text-center p-6">
                    <span className="text-xs text-foreground-muted select-none">
                      {t("common.noPages")}
                    </span>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Global Toast Notifications (Right-Top Corner) */}
      <div className="fixed top-24 right-4 z-[150] flex flex-col gap-2 max-w-sm pointer-events-none select-none">
        <AnimatePresence>
          {notifications.map((notif) =>
            (() => {
              const NotificationIcon =
                notif.type === "success"
                  ? CheckCircle2
                  : notif.type === "error"
                    ? XCircle
                    : notif.type === "warning"
                      ? AlertTriangle
                      : Info;
              const notificationTone =
                notif.type === "success"
                  ? "bg-success-surface text-success"
                  : notif.type === "error"
                    ? "bg-error-surface text-error"
                    : notif.type === "warning"
                      ? "bg-warning-surface text-warning"
                      : "bg-info-surface text-info";
              return (
                <motion.div
                  key={notif.id}
                  initial={{ opacity: 0, x: 20, scale: 0.95 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: 20, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                  role={notif.type === "error" ? "alert" : "status"}
                  aria-live={notif.type === "error" ? "assertive" : "polite"}
                  aria-atomic="true"
                  className="p-4 bg-surface-raised border border-border rounded-2xl shadow-xl pointer-events-auto flex justify-between gap-3 select-none"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-2">
                      <span
                        className={`mt-0.5 rounded-full p-1 ${notificationTone}`}
                      >
                        <NotificationIcon
                          className="h-3.5 w-3.5"
                          aria-hidden="true"
                        />
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-foreground truncate">
                          {notif.title || t("common.notifications")}
                        </p>
                        <p className="text-[11px] text-foreground-muted mt-0.5 leading-normal">
                          {notif.message}
                        </p>
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeNotification(notif.id)}
                    aria-label="Tutup notifikasi"
                    className="p-1.5 h-7 w-7 flex items-center justify-center rounded-lg text-foreground-muted hover:bg-surface-subtle dark:hover:bg-surface-subtle hover:text-foreground transition-all cursor-pointer shrink-0 select-none"
                  >
                    <X className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  </button>
                </motion.div>
              );
            })(),
          )}
        </AnimatePresence>
      </div>

      <PushNotificationPrompt />
    </div>
  );
}
