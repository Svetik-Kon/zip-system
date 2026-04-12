import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { loginRequest, getMeRequest } from "../api/auth";
import { saveAuth, saveMe } from "../utils/auth";

export default function LoginPage() {
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const authData = await loginRequest(username, password);
      saveAuth(authData);

      const me = await getMeRequest(authData.access);
      saveMe(me);

      navigate("/requests");
    } catch (err) {
      setError("Не удалось войти. Проверь логин и пароль.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page auth-page">
      <div className="card">
        <h1>Вход в систему</h1>

        <form onSubmit={handleSubmit} className="form">
          <label>
            Логин
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Введите логин"
            />
          </label>

          <label>
            Пароль
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Введите пароль"
            />
          </label>

          {error ? <div className="error">{error}</div> : null}

          <button type="submit" disabled={loading}>
            {loading ? "Вход..." : "Войти"}
          </button>
        </form>
      </div>
    </div>
  );
}