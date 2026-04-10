from rest_framework import serializers
from apps.users.models import User


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