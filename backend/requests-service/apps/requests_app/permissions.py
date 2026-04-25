from rest_framework.permissions import BasePermission


class IsAuthenticatedServiceUser(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and getattr(request.user, "is_authenticated", False))


class CanViewRequest(BasePermission):
    def has_object_permission(self, request, view, obj):
        user = request.user

        if user.role == "admin":
            return True

        if user.role == "customer":
            return str(obj.created_by_id) == str(user.id)

        return True


class IsInternalStaffUser(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return bool(
            user
            and getattr(user, "is_authenticated", False)
            and getattr(user, "role", None) != "customer"
        )