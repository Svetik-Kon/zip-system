from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import User


@admin.register(User)
class CustomUserAdmin(UserAdmin):
    model = User

    list_display = (
        "username",
        "email",
        "first_name",
        "last_name",
        "role",
        "organization",
        "is_internal",
        "is_staff",
        "is_active",
    )
    list_filter = ("role", "organization", "is_internal", "is_staff", "is_active")

    fieldsets = UserAdmin.fieldsets + (
        (
            "Дополнительно",
            {
                "fields": (
                    "role",
                    "organization",
                    "phone",
                    "job_title",
                    "is_internal",
                )
            },
        ),
    )

    add_fieldsets = UserAdmin.add_fieldsets + (
        (
            "Дополнительно",
            {
                "fields": (
                    "email",
                    "role",
                    "organization",
                    "phone",
                    "job_title",
                )
            },
        ),
    )

    search_fields = ("username", "email", "first_name", "last_name")