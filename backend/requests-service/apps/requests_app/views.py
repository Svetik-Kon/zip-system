from django.http import JsonResponse
from django.shortcuts import get_object_or_404
from rest_framework import generics
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import ServiceRequest, RequestComment, RequestEvent


from .serializers import (
    ServiceRequestListSerializer,
    ServiceRequestDetailSerializer,
    ServiceRequestCreateSerializer,
    RequestCommentSerializer,
    AssignRequestSerializer,
    ChangeStatusSerializer,
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

        if user.role == "customer":
            qs = qs.filter(created_by_id=user.id)
        else:
            assigned_to_me = self.request.query_params.get("assigned_to_me")

            if assigned_to_me == "true":
                qs = qs.filter(current_assignee_id=user.id)

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