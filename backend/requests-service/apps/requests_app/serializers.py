from rest_framework import serializers
from .models import (
    ServiceRequest,
    ServiceRequestItem,
    RequestComment,
    RequestEvent,
    RequestPriority,
    RequestStatus,
    RequestType,
)


class ServiceRequestItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = ServiceRequestItem
        fields = (
            "id",
            "item_name",
            "quantity",
            "reserved_quantity",
            "issued_quantity",
            "shortage_quantity",
            "line_status",
            "shortage_reason",
            "replacement_item_name",
            "replacement_status",
            "allow_analog",
            "comment",
        )


class RequestCommentSerializer(serializers.ModelSerializer):
    class Meta:
        model = RequestComment
        fields = (
            "id",
            "author_id",
            "author_username",
            "author_role",
            "body",
            "is_internal",
            "created_at",
        )
        read_only_fields = (
            "id",
            "author_id",
            "author_username",
            "author_role",
            "created_at",
        )


class RequestEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = RequestEvent
        fields = (
            "id",
            "actor_id",
            "actor_username",
            "actor_role",
            "event_type",
            "old_value",
            "new_value",
            "comment",
            "created_at",
        )


class ServiceRequestListSerializer(serializers.ModelSerializer):
    class Meta:
        model = ServiceRequest
        fields = (
            "id",
            "number",
            "title",
            "request_type",
            "priority",
            "status",
            "created_by_id",
            "created_by_username",
            "current_assignee_id",
            "current_assignee_username",
            "site_name",
            "created_at",
        )


class ServiceRequestDetailSerializer(serializers.ModelSerializer):
    items = ServiceRequestItemSerializer(many=True, read_only=True)
    comments = serializers.SerializerMethodField()
    events = RequestEventSerializer(many=True, read_only=True)

    class Meta:
        model = ServiceRequest
        fields = (
            "id",
            "number",
            "title",
            "description",
            "request_type",
            "priority",
            "status",
            "is_internal",
            "contract_exists",
            "recall_allowed",
            "allow_analog",
            "customer_organization_id",
            "integrator_organization_id",
            "created_by_id",
            "created_by_username",
            "current_assignee_id",
            "requested_for_user_id",
            "equipment_name",
            "equipment_model",
            "serial_number",
            "inventory_number",
            "site_name",
            "address",
            "desired_date",
            "due_date",
            "items",
            "comments",
            "events",
            "created_at",
            "updated_at",
            "current_assignee_username",
        )

    def get_comments(self, obj):
        request = self.context.get("request")
        qs = obj.comments.all()

        if request and getattr(request.user, "role", None) == "customer":
            qs = qs.filter(is_internal=False)

        return RequestCommentSerializer(qs, many=True).data


class ServiceRequestCreateSerializer(serializers.ModelSerializer):
    items = ServiceRequestItemSerializer(many=True, required=False)

    class Meta:
        model = ServiceRequest
        fields = (
            "title",
            "description",
            "request_type",
            "priority",
            "contract_exists",
            "recall_allowed",
            "allow_analog",
            "equipment_name",
            "equipment_model",
            "serial_number",
            "inventory_number",
            "site_name",
            "address",
            "desired_date",
            "due_date",
            "requested_for_user_id",
            "items",
        )

    def validate(self, attrs):
        user = self.context["request"].user
        request_type = attrs.get("request_type")

        # Заказчик не выбирает "свою" техническую категорию.
        # Он может создавать только внешние заявки:
        # ремонт/диагностика, замена оборудования, обновление/запрос софта.
        if user.role == "customer":
            if request_type == RequestType.INTERNAL_REQUEST:
                raise serializers.ValidationError(
                    {"request_type": "Заказчик не может создавать внутренний запрос."}
                )
            attrs["is_internal"] = False
        else:
            attrs["is_internal"] = request_type == RequestType.INTERNAL_REQUEST

        # Если это не внутренний запрос, requested_for_user_id не нужен
        if request_type != RequestType.INTERNAL_REQUEST:
            attrs["requested_for_user_id"] = None
            attrs["recall_allowed"] = False

        return attrs

    def create(self, validated_data):
        request = self.context["request"]
        user = request.user
        items_data = validated_data.pop("items", [])

        sr = ServiceRequest.objects.create(
            **validated_data,
            status=RequestStatus.NEW,
            created_by_id=user.id,
            created_by_username=user.username,
            customer_organization_id=user.organization_id if user.role == "customer" else None,
            integrator_organization_id=user.organization_id if user.role != "customer" else None,
        )

        for item in items_data:
            ServiceRequestItem.objects.create(request=sr, **item)

        RequestEvent.objects.create(
            request=sr,
            actor_id=user.id,
            actor_username=user.username,
            actor_role=user.role,
            event_type="request_created",
            comment="Заявка создана",
        )

        return sr
    

class AssignRequestSerializer(serializers.Serializer):
    assignee_id = serializers.UUIDField(required=True)
    assignee_username = serializers.CharField(required=False, allow_blank=True)
    comment = serializers.CharField(required=False, allow_blank=True)


class ChangeStatusSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=ServiceRequest._meta.get_field("status").choices)
    comment = serializers.CharField(required=False, allow_blank=True)


class ChangePrioritySerializer(serializers.Serializer):
    priority = serializers.ChoiceField(choices=RequestPriority.choices)
    comment = serializers.CharField(required=False, allow_blank=True)


class ConfirmReceiptSerializer(serializers.Serializer):
    comment = serializers.CharField(required=False, allow_blank=True)


class RequestItemWorkflowSerializer(serializers.ModelSerializer):
    comment = serializers.CharField(required=False, allow_blank=True)

    class Meta:
        model = ServiceRequestItem
        fields = (
            "reserved_quantity",
            "issued_quantity",
            "shortage_quantity",
            "line_status",
            "shortage_reason",
            "replacement_item_name",
            "replacement_status",
            "allow_analog",
            "comment",
        )

    def validate(self, attrs):
        instance = self.instance
        quantity = instance.quantity
        for field in ("reserved_quantity", "issued_quantity", "shortage_quantity"):
            value = attrs.get(field, getattr(instance, field))
            if value > quantity:
                raise serializers.ValidationError({field: "Количество не может быть больше запрошенного."})
        return attrs
