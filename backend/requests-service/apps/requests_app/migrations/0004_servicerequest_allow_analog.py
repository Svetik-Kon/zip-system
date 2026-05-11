from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("requests_app", "0003_request_shortage_workflow"),
    ]

    operations = [
        migrations.AddField(
            model_name="servicerequest",
            name="allow_analog",
            field=models.BooleanField(default=False),
        ),
    ]
