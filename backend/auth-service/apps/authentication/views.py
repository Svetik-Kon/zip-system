from django.http import JsonResponse
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.views import TokenObtainPairView

from apps.users.models import User
from apps.organizations.models import Organization
from .serializers import (
    UserMeSerializer,
    AssignableUserSerializer,
    UserCreateSerializer,
    OrganizationShortSerializer,
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

    def post(self, request):
        if request.user.role != "admin":
            return Response({"detail": "Нет доступа."}, status=403)

        serializer = UserCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(UserMeSerializer(user).data, status=201)