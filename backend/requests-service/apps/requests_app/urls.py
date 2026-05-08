from django.urls import path
from .views import (
    health_check,
    ServiceRequestListCreateView,
    ServiceRequestDetailView,
    RequestCommentCreateView,
    RequestAssignView,
    RequestChangeStatusView,
    RequestChangePriorityView,
)

urlpatterns = [
    path("health/", health_check),
    path("api/requests/", ServiceRequestListCreateView.as_view(), name="requests-list-create"),
    path("api/requests/<uuid:pk>/", ServiceRequestDetailView.as_view(), name="requests-detail"),
    path("api/requests/<uuid:pk>/comments/", RequestCommentCreateView.as_view(), name="requests-comment-create"),
    path("api/requests/<uuid:pk>/assign/", RequestAssignView.as_view(), name="requests-assign"),
    path("api/requests/<uuid:pk>/change-status/", RequestChangeStatusView.as_view(), name="requests-change-status"),
    path("api/requests/<uuid:pk>/change-priority/", RequestChangePriorityView.as_view(), name="requests-change-priority"),
]
