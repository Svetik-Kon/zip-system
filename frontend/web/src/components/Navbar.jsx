import { useEffect, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { getReactionNotifications } from "../api/requests";
import { clearAuth, getMe } from "../utils/auth";
import { getRoleLabel } from "../utils/dictionaries";

export default function Navbar({ children }) {
  const navigate = useNavigate();
  const me = getMe();
  const [open, setOpen] = useState(true);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const isCustomer = me?.role === "customer";
  const canUseMovements = ["admin", "warehouse"].includes(me?.role);
  const canSeeNotifications = ["admin", "manager"].includes(me?.role);

  useEffect(() => {
    if (!canSeeNotifications) return;

    let cancelled = false;
    const loadNotifications = async () => {
      try {
        const data = await getReactionNotifications();
        if (!cancelled) setNotifications(data || []);
      } catch {
        if (!cancelled) setNotifications([]);
      }
    };

    loadNotifications();
    const timer = window.setInterval(loadNotifications, 60000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [canSeeNotifications]);

  const handleLogout = () => {
    clearAuth();
    navigate("/login");
  };

  const navItems = [
    { to: "/requests", label: "Заявки", hint: "Список" },
    { to: "/requests/create", label: "Новая заявка", hint: "Создать" },
    !isCustomer ? { to: "/requests?assigned_to_me=true", label: "Назначенные", hint: "Мои" } : null,
    !isCustomer ? { to: "/catalog", label: "Каталог", hint: "Номенклатура" } : null,
    !isCustomer ? { to: "/inventory", label: "Склад", hint: "Остатки" } : null,
    !isCustomer ? { to: "/contracts", label: "Договоры", hint: "Заказчики" } : null,
    canUseMovements ? { to: "/movements", label: "Движения", hint: "Операции" } : null,
    me?.role === "admin" ? { to: "/admin/users", label: "Пользователи", hint: "Доступ" } : null,
  ].filter(Boolean);

  return (
    <div className={`app-shell ${open ? "sidebar-open" : "sidebar-collapsed"}`}>
      <header className="topbar">
        <button className="icon-button" onClick={() => setOpen((value) => !value)} aria-label="Меню">
          ☰
        </button>
        <Link className="brand" to="/requests">ZIPTrack</Link>
        <div className="topbar-title">Главная</div>
        <div className="topbar-spacer" />
        {canSeeNotifications ? (
          <div className="notification-wrap">
            <button className="icon-button notification-button" onClick={() => setNotificationsOpen((value) => !value)} aria-label="Уведомления">
              🔔
              {notifications.length ? <span>{notifications.length}</span> : null}
            </button>
            {notificationsOpen ? (
              <div className="notification-menu">
                <strong>Уведомления</strong>
                {!notifications.length ? <p>Новых уведомлений нет.</p> : null}
                {notifications.map((item) => (
                  <Link key={item.id} to={`/requests/${item.request_id}`} onClick={() => setNotificationsOpen(false)}>
                    <span>{item.message}</span>
                    <small>{item.title}</small>
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="user-pill">{me?.username || "Пользователь"} · {getRoleLabel(me?.role)}</div>
        <button className="ghost-button" onClick={handleLogout}>Выйти</button>
      </header>

      <aside className="sidebar">
        <div className="sidebar-title">Меню</div>
        <nav className="side-nav">
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
              <span>{item.label}</span>
              <small>{item.hint}</small>
            </NavLink>
          ))}
        </nav>
      </aside>

      <main className="shell-content">{children}</main>
    </div>
  );
}
