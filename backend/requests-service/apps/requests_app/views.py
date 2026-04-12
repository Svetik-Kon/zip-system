from django.http import JsonResponse
from rest_framework import generics, permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import ServiceRequest, RequestComment, RequestEvent
from .serializers import (
    ServiceRequestListSerializer,
    ServiceRequestDetailSerializer,
    ServiceRequestCreateSerializer,
    RequestCommentSerializer,
)
from .permissions import IsAuthenticatedServiceUser, CanViewRequest


def health_check(request):
    return JsonResponse({"status": "ok", "service": "requests-service"})


class ServiceRequestListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticatedServiceUser]

    def get_queryset(self):
        user = self.request.user
        qs = ServiceRequest.objects.all()

        if user.role == "customer":
            qs = qs.filter(created_by_id=user.id)

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