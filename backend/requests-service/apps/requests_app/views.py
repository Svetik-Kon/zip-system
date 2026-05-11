from django.http import JsonResponse
from django.shortcuts import get_object_or_404
from django.db.models import Q
from rest_framework import generics
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import ServiceRequest, ServiceRequestItem, RequestComment, RequestEvent


from .serializers import (
    ServiceRequestListSerializer,
    ServiceRequestDetailSerializer,
    ServiceRequestCreateSerializer,
    RequestCommentSerializer,
    AssignRequestSerializer,
    ChangeStatusSerializer,
    ChangePrioritySerializer,
    RequestItemWorkflowSerializer,
)


from .permissions import (
    IsAuthenticatedServiceUser,
    CanViewRequest,
    IsInternalStaffUser,
)


def health_check(request):
    return JsonResponse({"status": "ok", "service": "requests-service"})


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
