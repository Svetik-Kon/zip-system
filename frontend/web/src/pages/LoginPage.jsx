import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { getMeRequest, loginRequest } from "../api/auth";
import { saveAuth, saveMe } from "../utils/auth";

export default function LoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const authData = await loginRequest(username, password);
      saveAuth(authData);
      saveMe(await getMeRequest(authData.access));
      navigate("/requests");
    } catch {
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
          <label>Логин<input type="text" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Введите логин" /></label>
          <label>Пароль<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Введите пароль" /></label>
          {error ? <div className="error">{error}</div> : null}
          <button type="submit" disabled={loading}>{loading ? "Вход..." : "Войти"}</button>
        </form>
      </div>
    </div>
  );
}
