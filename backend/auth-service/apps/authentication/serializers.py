from rest_framework import serializers
from apps.users.models import User
from apps.organizations.models import Organization
from apps.roles.models import UserRole


class UserMeSerializer(serializers.ModelSerializer):
    organization_name = serializers.CharField(source="organization.name", read_only=True)
    organization_type = serializers.CharField(source="organization.org_type", read_only=True)

    class Meta:
        model = User
        fields = (
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "role",
            "is_internal",
            "organization",
            "organization_name",
            "organization_type",
            "phone",
            "job_title",
        )


class AssignableUserSerializer(serializers.ModelSerializer):
    organization_name = serializers.CharField(source="organization.name", read_only=True)

    class Meta:
        model = User
        fields = (
            "id",
            "username",
            "first_name",
            "last_name",
            "role",
            "organization_name",
            "is_internal",
        )


class UserCreateSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=6)
    organization = serializers.UUIDField(required=False, allow_null=True)

    class Meta:
        model = User
        fields = (
            "id",
            "username",
            "email",
            "password",
            "first_name",
            "last_name",
            "role",
            "organization",
            "phone",
            "job_title",
            "is_active",
        )
        read_only_fields = ("id",)

    def validate_role(self, value):
        allowed_roles = {choice[0] for choice in UserRole.choices}
        if value not in allowed_roles:
            raise serializers.ValidationError("Некорректная роль.")
        return value

    def validate_organization(self, value):
        if value is None:
            return None

        if not Organization.objects.filter(id=value, is_active=True).exists():
            raise serializers.ValidationError("Организация не найдена.")
        return value

    def create(self, validated_data):
        password = validated_data.pop("password")
        organization_id = validated_data.pop("organization", None)

        organization = None
        if organization_id:
            organization = Organization.objects.get(id=organization_id)

        user = User(
            **validated_data,
            organization=organization,
        )
        user.set_password(password)
        user.save()
        return user


class AdminUserSerializer(serializers.ModelSerializer):
    organization_name = serializers.CharField(source="organization.name", read_only=True)
    organization = serializers.UUIDField(required=False, allow_null=True)

    class Meta:
        model = User
        fields = (
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "role",
            "is_internal",
            "organization",
            "organization_name",
            "phone",
            "job_title",
            "is_active",
            "date_joined",
        )
        read_only_fields = ("id", "username", "date_joined")

    def validate_role(self, value):
        allowed_roles = {choice[0] for choice in UserRole.choices}
        if value not in allowed_roles:
            raise serializers.ValidationError("Некорректная роль.")
        return value

    def validate_organization(self, value):
        if value is None:
            return None

        if not Organization.objects.filter(id=value, is_active=True).exists():
            raise serializers.ValidationError("Организация не найдена.")
        return value

    def update(self, instance, validated_data):
        organization_id = validated_data.pop("organization", serializers.empty)
        if organization_id is not serializers.empty:
            instance.organization = (
                Organization.objects.get(id=organization_id) if organization_id else None
            )

        for attr, value in validated_data.items():
            setattr(instance, attr, value)

        instance.save()
        return instance


class AdminPasswordChangeSerializer(serializers.Serializer):
    password = serializers.CharField(write_only=True, min_length=6)
    
class OrganizationShortSerializer(serializers.ModelSerializer):
    class Meta:
        model = Organization
        fields = ("id", "name", "org_type", "is_active")
