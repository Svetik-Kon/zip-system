from django.db.models import Q
from django.http import JsonResponse
from django.shortcuts import get_object_or_404
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView

from apps.organizations.models import Organization
from apps.users.models import User
from .serializers import (
    AdminPasswordChangeSerializer,
    AdminUserSerializer,
    AssignableUserSerializer,
    OrganizationShortSerializer,
    UserCreateSerializer,
    UserMeSerializer,
)
from .token_serializers import CustomTokenObtainPairSerializer


def health_check(request):
    return JsonResponse({"status": "ok", "service": "auth-service"})


class CustomTokenObtainPairView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        serializer = UserMeSerializer(request.user)
        return Response(serializer.data)


class AssignableUsersView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role == "customer":
            return Response({"detail": "Нет доступа."}, status=403)

        users = User.objects.filter(is_active=True, is_internal=True).order_by("username")
        serializer = AssignableUserSerializer(users, many=True)
        return Response(serializer.data)


class OrganizationListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role != "admin":
            return Response({"detail": "Нет доступа."}, status=403)

        organizations = Organization.objects.filter(is_active=True).order_by("name")
        serializer = OrganizationShortSerializer(organizations, many=True)
        return Response(serializer.data)


class AdminUserCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role != "admin":
            return Response({"detail": "Нет доступа."}, status=403)

        users = User.objects.select_related("organization").all().order_by("username")
        search = request.query_params.get("search")
        role = request.query_params.get("role")
        is_active = request.query_params.get("is_active")

        if search:
            users = users.filter(
                Q(username__icontains=search)
                | Q(email__icontains=search)
                | Q(first_name__icontains=search)
                | Q(last_name__icontains=search)
            )

        if role:
            users = users.filter(role=role)

        if is_active in {"true", "false"}:
            users = users.filter(is_active=is_active == "true")

        serializer = AdminUserSerializer(users, many=True)
        return Response(serializer.data)

    def post(self, request):
        if request.user.role != "admin":
            return Response({"detail": "Нет доступа."}, status=403)

        serializer = UserCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(UserMeSerializer(user).data, status=201)


class AdminUserDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        if request.user.role != "admin":
            return Response({"detail": "Нет доступа."}, status=403)

        user = get_object_or_404(User, pk=pk)
        requested_role = request.data.get("role")

        if str(user.id) == str(request.user.id) and requested_role and requested_role != user.role:
            return Response({"role": "Нельзя менять собственную роль."}, status=400)

        serializer = AdminUserSerializer(user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class AdminUserPasswordView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        if request.user.role != "admin":
            return Response({"detail": "Нет доступа."}, status=403)

        user = get_object_or_404(User, pk=pk)
        serializer = AdminPasswordChangeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user.set_password(serializer.validated_data["password"])
        user.save(update_fields=["password"])
        return Response({"detail": "Пароль обновлен."})
