import jwt
from types import SimpleNamespace
from django.conf import settings
from rest_framework import authentication, exceptions


class ServiceUser(SimpleNamespace):
    @property
    def is_authenticated(self):
        return True


class JWTServiceAuthentication(authentication.BaseAuthentication):
    def authenticate(self, request):
        auth_header = request.headers.get("Authorization")

        if not auth_header:
            return None

        parts = auth_header.split()
        if len(parts) != 2 or parts[0].lower() != "bearer":
            raise exceptions.AuthenticationFailed("Некорректный Authorization header.")

        token = parts[1]

        try:
            payload = jwt.decode(
                token,
                settings.SECRET_KEY,
                algorithms=["HS256"],
            )
        except jwt.ExpiredSignatureError:
            raise exceptions.AuthenticationFailed("Токен истёк.")
        except jwt.InvalidTokenError:
            raise exceptions.AuthenticationFailed("Некорректный токен.")

        user = ServiceUser(
            id=payload.get("user_id"),
            username=payload.get("username"),
            role=payload.get("role"),
            organization_id=payload.get("organization_id"),
            is_internal=payload.get("is_internal", False),
        )

        return (user, token)