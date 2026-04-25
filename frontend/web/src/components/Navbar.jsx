import { Link, useNavigate } from "react-router-dom";
import { clearAuth, getMe } from "../utils/auth";

export default function Navbar() {
  const navigate = useNavigate();
  const me = getMe();

  const handleLogout = () => {
    clearAuth();
    navigate("/login");
  };

  return (
    <div className="navbar">
      <div className="navbar-left">
        <Link to="/requests">Все заявки</Link>
        <Link to="/requests?assigned_to_me=true">Назначенные мне</Link>
        <Link to="/requests/create">Создать заявку</Link>
        {me?.role === "admin" ? <Link to="/admin/users">Пользователи</Link> : null}
      </div>

      <div className="navbar-right">
        {me ? (
          <span>
            {me.username} ({me.role})
          </span>
        ) : null}

        <button onClick={handleLogout}>Выйти</button>
      </div>
    </div>
  );
}