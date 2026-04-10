from django.contrib import admin
from .models import ServiceRequest, ServiceRequestItem, RequestComment, RequestEvent


class ServiceRequestItemInline(admin.TabularInline):
    model = ServiceRequestItem
    extra = 1


class RequestCommentInline(admin.TabularInline):
    model = RequestComment
    extra = 0
    readonly_fields = ("created_at",)


class RequestEventInline(admin.TabularInline):
    model = RequestEvent
    extra = 0
    readonly_fields = ("created_at",)


@admin.register(ServiceRequest)
class ServiceRequestAdmin(admin.ModelAdmin):
    list_display = (
        "number",
        "title",
        "request_type",
        "status",
        "priority",
        "is_internal",
        "created_at",
    )
    list_filter = ("request_type", "status", "priority", "is_internal")
    search_fields = ("number", "title", "description", "equipment_name", "serial_number")
    inlines = [ServiceRequestItemInline, RequestCommentInline, RequestEventInline]


@admin.register(ServiceRequestItem)
class ServiceRequestItemAdmin(admin.ModelAdmin):
    list_display = ("item_name", "request", "quantity", "allow_analog")
    search_fields = ("item_name",)


@admin.register(RequestComment)
class RequestCommentAdmin(admin.ModelAdmin):
    list_display = ("request", "author_role", "is_internal", "created_at")
    list_filter = ("author_role", "is_internal")


@admin.register(RequestEvent)
class RequestEventAdmin(admin.ModelAdmin):
    list_display = ("request", "event_type", "actor_role", "created_at")
    list_filter = ("event_type", "actor_role")