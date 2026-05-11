from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("requests_app", "0002_servicerequest_current_assignee_username"),
    ]

    operations = [
        migrations.AddField(
            model_name="servicerequestitem",
            name="issued_quantity",
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AddField(
            model_name="servicerequestitem",
            name="line_status",
            field=models.CharField(blank=True, default="", max_length=50),
        ),
        migrations.AddField(
            model_name="servicerequestitem",
            name="replacement_item_name",
            field=models.CharField(blank=True, max_length=255),
        ),
        migrations.AddField(
            model_name="servicerequestitem",
            name="replacement_status",
            field=models.CharField(blank=True, max_length=50),
        ),
        migrations.AddField(
            model_name="servicerequestitem",
            name="reserved_quantity",
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AddField(
            model_name="servicerequestitem",
            name="shortage_quantity",
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AddField(
            model_name="servicerequestitem",
            name="shortage_reason",
            field=models.CharField(blank=True, max_length=255),
        ),
    ]
