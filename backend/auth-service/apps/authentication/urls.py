from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from .views import health_check, MeView, CustomTokenObtainPairView

urlpatterns = [
    path("health/", health_check),
    path("api/auth/login/", CustomTokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("api/auth/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("api/auth/me/", MeView.as_view(), name="auth_me"),
]