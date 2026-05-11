from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from .views import (
    health_check,
    MeView,
    CustomTokenObtainPairView,
    AssignableUsersView,
    AdminUserDetailView,
    AdminUserPasswordView,
    OrganizationListView,
    OrganizationDetailView,
    AdminUserCreateView,
)

urlpatterns = [
    path("health/", health_check),
    path("api/auth/login/", CustomTokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("api/auth/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("api/auth/me/", MeView.as_view(), name="auth_me"),
    path("api/users/assignable/", AssignableUsersView.as_view(), name="assignable-users"),
    path("api/admin/organizations/", OrganizationListView.as_view(), name="admin-organizations"),
    path("api/admin/organizations/<uuid:pk>/", OrganizationDetailView.as_view(), name="admin-organization-detail"),
    path("api/admin/users/", AdminUserCreateView.as_view(), name="admin-users-create"),
    path("api/admin/users/<uuid:pk>/", AdminUserDetailView.as_view(), name="admin-users-detail"),
    path("api/admin/users/<uuid:pk>/password/", AdminUserPasswordView.as_view(), name="admin-users-password"),
]
