from rest_framework_simplejwt.serializers import TokenObtainPairSerializer


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)

        token["user_id"] = str(user.id)
        token["username"] = user.username
        token["role"] = user.role
        token["organization_id"] = str(user.organization_id) if user.organization_id else None
        token["is_internal"] = user.is_internal

        return token