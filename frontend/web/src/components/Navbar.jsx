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
        <Link to="/requests">Заявки</Link>
        <Link to="/requests/create">Создать заявку</Link>
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