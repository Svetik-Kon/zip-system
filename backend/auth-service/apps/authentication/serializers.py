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
    organization = serializers.PrimaryKeyRelatedField(
        queryset=Organization.objects.filter(is_active=True),
        required=False,
        allow_null=True,
    )

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

    def create(self, validated_data):
        password = validated_data.pop("password")
        organization = validated_data.pop("organization", None)

        user = User(
            **validated_data,
            organization=organization,
        )
        user.set_password(password)
        user.save()
        return user


class AdminUserSerializer(serializers.ModelSerializer):
    organization_name = serializers.CharField(source="organization.name", read_only=True)
    organization = serializers.PrimaryKeyRelatedField(
        queryset=Organization.objects.filter(is_active=True),
        required=False,
        allow_null=True,
    )

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

    def update(self, instance, validated_data):
        organization = validated_data.pop("organization", serializers.empty)
        if organization is not serializers.empty:
            instance.organization = organization

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


class OrganizationCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Organization
        fields = ("id", "name", "org_type", "is_active")
        read_only_fields = ("id",)

    def create(self, validated_data):
        organization = Organization.objects.filter(name=validated_data["name"]).first()
        if organization:
            organization.org_type = validated_data.get("org_type", organization.org_type)
            organization.is_active = True
            organization.save(update_fields=["org_type", "is_active"])
            return organization
        return super().create(validated_data)
