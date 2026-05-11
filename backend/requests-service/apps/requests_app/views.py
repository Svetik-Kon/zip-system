from django.http import JsonResponse
from django.shortcuts import get_object_or_404
from django.db.models import Q
from django.utils import timezone
from rest_framework import generics
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import ServiceRequest, ServiceRequestItem, RequestComment, RequestEvent, RequestStatus


from .serializers import (
    ServiceRequestListSerializer,
    ServiceRequestDetailSerializer,
    ServiceRequestCreateSerializer,
    RequestCommentSerializer,
    AssignRequestSerializer,
    ChangeStatusSerializer,
    ChangePrioritySerializer,
    ConfirmReceiptSerializer,
    RequestItemWorkflowSerializer,
)


from .permissions import (
    IsAuthenticatedServiceUser,
    CanViewRequest,
    IsInternalStaffUser,
)


def health_check(request):
    return JsonResponse({"status": "ok", "service": "requests-service"})


WORKFLOW_TRANSITIONS = {
    RequestStatus.NEW: {RequestStatus.IN_REVIEW, RequestStatus.CANCELLED},
    RequestStatus.IN_REVIEW: {RequestStatus.AWAITING_WAREHOUSE, RequestStatus.DIAGNOSTICS, RequestStatus.REJECTED, RequestStatus.CANCELLED},
    RequestStatus.DIAGNOSTICS: {RequestStatus.AWAITING_WAREHOUSE, RequestStatus.AWAITING_REPLACEMENT, RequestStatus.IN_LAB, RequestStatus.CLOSED, RequestStatus.REJECTED},
    RequestStatus.AWAITING_WAREHOUSE: {RequestStatus.RESERVED, RequestStatus.SHORTAGE, RequestStatus.AWAITING_PROCUREMENT, RequestStatus.AWAITING_REALLOCATION, RequestStatus.READY_TO_SHIP, RequestStatus.AWAITING_CONFIRMATION},
    RequestStatus.AWAITING_PROCUREMENT: {RequestStatus.AWAITING_WAREHOUSE, RequestStatus.AWAITING_REPLACEMENT, RequestStatus.SHORTAGE, RequestStatus.CANCELLED},
    RequestStatus.AWAITING_REPLACEMENT: {RequestStatus.AWAITING_WAREHOUSE, RequestStatus.AWAITING_PROCUREMENT, RequestStatus.SHORTAGE, RequestStatus.CANCELLED},
    RequestStatus.AWAITING_REALLOCATION: {RequestStatus.AWAITING_WAREHOUSE, RequestStatus.RESERVED, RequestStatus.SHORTAGE, RequestStatus.CANCELLED},
    RequestStatus.SHORTAGE: {RequestStatus.AWAITING_PROCUREMENT, RequestStatus.AWAITING_REPLACEMENT, RequestStatus.AWAITING_REALLOCATION, RequestStatus.PARTIALLY_FULFILLED, RequestStatus.CANCELLED},
    RequestStatus.RESERVED: {RequestStatus.READY_TO_SHIP, RequestStatus.PARTIALLY_FULFILLED, RequestStatus.AWAITING_CONFIRMATION, RequestStatus.CANCELLED},
    RequestStatus.READY_TO_SHIP: {RequestStatus.AWAITING_CONFIRMATION, RequestStatus.PARTIALLY_FULFILLED, RequestStatus.CANCELLED},
    RequestStatus.PARTIALLY_FULFILLED: {RequestStatus.AWAITING_WAREHOUSE, RequestStatus.AWAITING_PROCUREMENT, RequestStatus.READY_TO_SHIP, RequestStatus.AWAITING_CONFIRMATION, RequestStatus.CLOSED},
    RequestStatus.SHIPPED: {RequestStatus.AWAITING_CONFIRMATION, RequestStatus.RECEIVED},
    RequestStatus.AWAITING_CONFIRMATION: {RequestStatus.RECEIVED},
    RequestStatus.RECEIVED: {RequestStatus.CLOSED},
    RequestStatus.IN_LAB: {RequestStatus.DIAGNOSTICS, RequestStatus.AWAITING_WAREHOUSE, RequestStatus.CLOSED},
    RequestStatus.AWAITING_RETURN: {RequestStatus.DIAGNOSTICS, RequestStatus.CLOSED, RequestStatus.CANCELLED},
}

APPROVAL_TARGET_STATUSES = {
    RequestStatus.AWAITING_WAREHOUSE,
    RequestStatus.DIAGNOSTICS,
    RequestStatus.REJECTED,
    RequestStatus.CANCELLED,
}

WAREHOUSE_WORKFLOW_STATUSES = {
    RequestStatus.AWAITING_WAREHOUSE,
    RequestStatus.RESERVED,
    RequestStatus.READY_TO_SHIP,
    RequestStatus.AWAITING_CONFIRMATION,
    RequestStatus.PARTIALLY_FULFILLED,
    RequestStatus.SHORTAGE,
    RequestStatus.AWAITING_PROCUREMENT,
    RequestStatus.AWAITING_REPLACEMENT,
    RequestStatus.AWAITING_REALLOCATION,
}

WAREHOUSE_WORKFLOW_ROLES = {"admin", "manager", "warehouse", "procurement"}

PROCUREMENT_WORKFLOW_STATUSES = {
    RequestStatus.AWAITING_PROCUREMENT,
    RequestStatus.AWAITING_REPLACEMENT,
}

PROCUREMENT_WORKFLOW_ROLES = {"admin", "manager", "procurement"}


def validate_status_transition(service_request, user, new_status):
    old_status = service_request.status
    if old_status == new_status:
        return None
    allowed = WORKFLOW_TRANSITIONS.get(old_status, set())
    if new_status not in allowed:
        return Response(
            {"status": f"Недопустимый переход: {old_status} -> {new_status}."},
            status=400,
        )
    if old_status == RequestStatus.IN_REVIEW and new_status in APPROVAL_TARGET_STATUSES and user.role not in ("admin", "manager"):
        return Response(
            {"status": "Согласовать заявку может только менеджер или администратор."},
            status=403,
        )
    if (
        old_status in WAREHOUSE_WORKFLOW_STATUSES
        or new_status in WAREHOUSE_WORKFLOW_STATUSES
    ) and user.role not in WAREHOUSE_WORKFLOW_ROLES:
        return Response(
            {"status": "Складские статусы могут менять только склад, снабжение, менеджер или администратор."},
            status=403,
        )
    if (
        old_status in PROCUREMENT_WORKFLOW_STATUSES
        or new_status in PROCUREMENT_WORKFLOW_STATUSES
    ) and user.role not in PROCUREMENT_WORKFLOW_ROLES:
        return Response(
            {"status": "Статусы снабжения могут менять только снабжение, менеджер или администратор."},
            status=403,
        )
    return None


class ServiceRequestListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticatedServiceUser]

    def get_queryset(self):
        user = self.request.user
        qs = ServiceRequest.objects.all()

        status_filter = self.request.query_params.get("status")
        type_filter = self.request.query_params.get("request_type")
        priority_filter = self.request.query_params.get("priority")
        search = self.request.query_params.get("search")

        if user.role == "customer":
            qs = qs.filter(created_by_id=user.id)
        else:
            only_my_created = self.request.query_params.get("my_requests")
            assigned_to_me = self.request.query_params.get("assigned_to_me")
            assignee_filter = self.request.query_params.get("assignee_id")

            if only_my_created == "true":
                qs = qs.filter(created_by_id=user.id)

            if assigned_to_me == "true":
                qs = qs.filter(current_assignee_id=user.id)

            if assignee_filter:
                qs = qs.filter(current_assignee_id=assignee_filter)

        if status_filter:
            qs = qs.filter(status=status_filter)

        if type_filter:
            qs = qs.filter(request_type=type_filter)

        if priority_filter:
            qs = qs.filter(priority=priority_filter)

        if search:
            qs = qs.filter(
                Q(number__icontains=search)
                | Q(title__icontains=search)
                | Q(description__icontains=search)
                | Q(equipment_name__icontains=search)
                | Q(equipment_model__icontains=search)
                | Q(serial_number__icontains=search)
                | Q(site_name__icontains=search)
                | Q(created_by_username__icontains=search)
                | Q(current_assignee_username__icontains=search)
            )

        return qs

    def get_serializer_class(self):
        if self.request.method == "POST":
            return ServiceRequestCreateSerializer
        return ServiceRequestListSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        service_request = serializer.save()

        output_serializer = ServiceRequestDetailSerializer(
            service_request,
            context={"request": request},
        )
        headers = self.get_success_headers(output_serializer.data)
        return Response(output_serializer.data, status=201, headers=headers)


class ServiceRequestDetailView(generics.RetrieveAPIView):
    queryset = ServiceRequest.objects.all()
    serializer_class = ServiceRequestDetailSerializer
    permission_classes = [IsAuthenticatedServiceUser, CanViewRequest]


class RequestCommentCreateView(APIView):
    permission_classes = [IsAuthenticatedServiceUser]

    def post(self, request, pk):
        service_request = generics.get_object_or_404(ServiceRequest, pk=pk)

        if request.user.role == "customer" and str(service_request.created_by_id) != str(request.user.id):
            return Response({"detail": "Нет доступа."}, status=403)

        serializer = RequestCommentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        is_internal = serializer.validated_data.get("is_internal", False)
        if request.user.role == "customer":
            is_internal = False

        comment = RequestComment.objects.create(
            request=service_request,
            author_id=request.user.id,
            author_username=request.user.username,
            author_role=request.user.role,
            body=serializer.validated_data["body"],
            is_internal=is_internal,
        )

        RequestEvent.objects.create(
            request=service_request,
            actor_id=request.user.id,
            actor_username=request.user.username,
            actor_role=request.user.role,
            event_type="comment_added",
            comment=comment.body[:255],
        )

        return Response(RequestCommentSerializer(comment).data, status=201)
    

class RequestAssignView(APIView):
    permission_classes = [IsAuthenticatedServiceUser, IsInternalStaffUser]

    def post(self, request, pk):
        service_request = get_object_or_404(ServiceRequest, pk=pk)

        serializer = AssignRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        old_assignee = service_request.current_assignee_username or ""
        new_assignee = serializer.validated_data["assignee_id"]
        assignee_username = serializer.validated_data.get("assignee_username", "")
        comment = serializer.validated_data.get("comment", "")

        service_request.current_assignee_id = new_assignee
        service_request.current_assignee_username = assignee_username
        service_request.save(
            update_fields=["current_assignee_id", "current_assignee_username", "updated_at"]
        )

        RequestEvent.objects.create(
            request=service_request,
            actor_id=request.user.id,
            actor_username=request.user.username,
            actor_role=request.user.role,
            event_type="assignee_changed",
            old_value=old_assignee,
            new_value=assignee_username or str(new_assignee),
            comment=comment or f"Исполнитель назначен: {assignee_username or new_assignee}",
        )

        output_serializer = ServiceRequestDetailSerializer(
            service_request,
            context={"request": request},
        )
        return Response(output_serializer.data, status=200)
    


class RequestChangeStatusView(APIView):
    permission_classes = [IsAuthenticatedServiceUser, IsInternalStaffUser]

    def post(self, request, pk):
        service_request = get_object_or_404(ServiceRequest, pk=pk)

        serializer = ChangeStatusSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        old_status = service_request.status
        new_status = serializer.validated_data["status"]
        comment = serializer.validated_data.get("comment", "")
        transition_error = validate_status_transition(service_request, request.user, new_status)
        if transition_error:
            return transition_error

        service_request.status = new_status
        service_request.save(update_fields=["status", "updated_at"])

        RequestEvent.objects.create(
            request=service_request,
            actor_id=request.user.id,
            actor_username=request.user.username,
            actor_role=request.user.role,
            event_type="status_changed",
            old_value=old_status,
            new_value=new_status,
            comment=comment or f"Статус изменён: {old_status} → {new_status}",
        )

        output_serializer = ServiceRequestDetailSerializer(
            service_request,
            context={"request": request},
        )
        return Response(output_serializer.data, status=200)


class RequestConfirmReceiptView(APIView):
    permission_classes = [IsAuthenticatedServiceUser]

    def post(self, request, pk):
        service_request = get_object_or_404(ServiceRequest, pk=pk)
        if request.user.role == "customer" and str(service_request.created_by_id) != str(request.user.id):
            return Response({"detail": "Нет доступа."}, status=403)
        if request.user.role != "customer" and request.user.role not in ("admin", "manager"):
            return Response({"detail": "Подтвердить получение может заказчик, менеджер или администратор."}, status=403)

        serializer = ConfirmReceiptSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        if service_request.status not in {RequestStatus.AWAITING_CONFIRMATION, RequestStatus.SHIPPED}:
            return Response({"status": "Подтверждение доступно только после выдачи заказчику."}, status=400)

        old_status = service_request.status
        service_request.status = RequestStatus.RECEIVED
        service_request.save(update_fields=["status", "updated_at"])

        RequestEvent.objects.create(
            request=service_request,
            actor_id=request.user.id,
            actor_username=request.user.username,
            actor_role=request.user.role,
            event_type="receipt_confirmed",
            old_value=old_status,
            new_value=RequestStatus.RECEIVED,
            comment=serializer.validated_data.get("comment", "") or "Получение подтверждено заказчиком",
        )

        output_serializer = ServiceRequestDetailSerializer(service_request, context={"request": request})
        return Response(output_serializer.data, status=200)


class RequestChangePriorityView(APIView):
    permission_classes = [IsAuthenticatedServiceUser]

    def post(self, request, pk):
        service_request = get_object_or_404(ServiceRequest, pk=pk)

        if request.user.role == "customer" and str(service_request.created_by_id) != str(request.user.id):
            return Response({"detail": "Нет доступа."}, status=403)

        serializer = ChangePrioritySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        old_priority = service_request.priority
        new_priority = serializer.validated_data["priority"]
        comment = serializer.validated_data.get("comment", "")

        service_request.priority = new_priority
        service_request.save(update_fields=["priority", "updated_at"])

        RequestEvent.objects.create(
            request=service_request,
            actor_id=request.user.id,
            actor_username=request.user.username,
            actor_role=request.user.role,
            event_type="priority_changed",
            old_value=old_priority,
            new_value=new_priority,
            comment=comment or f"Приоритет изменен: {old_priority} -> {new_priority}",
        )

        output_serializer = ServiceRequestDetailSerializer(
            service_request,
            context={"request": request},
        )
        return Response(output_serializer.data, status=200)


class RequestItemWorkflowView(APIView):
    permission_classes = [IsAuthenticatedServiceUser, IsInternalStaffUser]

    def patch(self, request, pk, item_pk):
        service_request = get_object_or_404(ServiceRequest, pk=pk)
        item = get_object_or_404(ServiceRequestItem, pk=item_pk, request=service_request)

        old_value = (
            f"резерв {item.reserved_quantity}, выдано {item.issued_quantity}, "
            f"дефицит {item.shortage_quantity}, статус {item.line_status or '-'}"
        )

        serializer = RequestItemWorkflowSerializer(item, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()

        comment = serializer.validated_data.get("comment", "")
        new_value = (
            f"резерв {item.reserved_quantity}, выдано {item.issued_quantity}, "
            f"дефицит {item.shortage_quantity}, статус {item.line_status or '-'}"
        )

        RequestEvent.objects.create(
            request=service_request,
            actor_id=request.user.id,
            actor_username=request.user.username,
            actor_role=request.user.role,
            event_type="item_workflow_updated",
            old_value=old_value,
            new_value=new_value,
            comment=comment or f"Обновлена позиция: {item.item_name}",
        )

        output_serializer = ServiceRequestDetailSerializer(service_request, context={"request": request})
        return Response(output_serializer.data, status=200)


class ReactionNotificationsView(APIView):
    permission_classes = [IsAuthenticatedServiceUser, IsInternalStaffUser]

    def get(self, request):
        if request.user.role not in ("admin", "manager"):
            return Response([], status=200)

        now = timezone.now()
        deadline = now - timezone.timedelta(minutes=30)
        expires_after = now - timezone.timedelta(hours=2, minutes=30)
        qs = ServiceRequest.objects.filter(
            status="new",
            current_assignee_id__isnull=True,
            created_at__lte=deadline,
            created_at__gte=expires_after,
        ).order_by("-created_at")

        notifications = [
            {
                "id": f"reaction-{item.id}",
                "request_id": str(item.id),
                "number": item.number,
                "title": item.title,
                "message": f"{item.number} без реакции больше 30 минут",
                "created_at": item.created_at,
                "expires_at": item.created_at + timezone.timedelta(hours=2, minutes=30),
            }
            for item in qs
        ]
        confirmation_deadline = now - timezone.timedelta(hours=24)
        confirmation_expires_after = now - timezone.timedelta(hours=26)
        confirmation_qs = ServiceRequest.objects.filter(
            status=RequestStatus.AWAITING_CONFIRMATION,
            updated_at__lte=confirmation_deadline,
            updated_at__gte=confirmation_expires_after,
        ).order_by("-updated_at")
        notifications.extend([
            {
                "id": f"confirmation-{item.id}",
                "request_id": str(item.id),
                "number": item.number,
                "title": item.title,
                "message": f"{item.number} ожидает подтверждения получения больше суток",
                "created_at": item.updated_at,
                "expires_at": item.updated_at + timezone.timedelta(hours=26),
            }
            for item in confirmation_qs
        ])
        return Response(notifications, status=200)
