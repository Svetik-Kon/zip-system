import { useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { clearAuth, getMe } from "../utils/auth";
import { getRoleLabel } from "../utils/dictionaries";

export default function Navbar({ children }) {
  const navigate = useNavigate();
  const me = getMe();
  const [open, setOpen] = useState(true);
  const isCustomer = me?.role === "customer";

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
    !isCustomer ? { to: "/movements", label: "Движения", hint: "Операции" } : null,
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
