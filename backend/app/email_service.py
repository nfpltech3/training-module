"""Email notification service for new training content uploads.

Sends notifications to users filtered by module's department/role assignments.
Uses SMTP credentials from environment variables.
"""
import smtplib
import os
import uuid
from datetime import datetime, timezone
from email.message import EmailMessage
from sqlalchemy.orm import Session
from . import models

# Load credentials from environment
SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASS = os.getenv("SMTP_PASS", "")


def send_content_notification_emails(db: Session, content_id: str, uploader_id: str) -> None:
    """Send email notifications to relevant users when new content is uploaded."""
    if not SMTP_PASS or not SMTP_USER:
        print("[EmailService] Skipping emails: SMTP credentials not configured.")
        return

    # 1. Fetch the content and the uploader
    content = db.query(models.Content).filter(models.Content.id == content_id).first()
    uploader = db.query(models.User).filter(models.User.id == uploader_id).first()

    if not content or not uploader:
        print("[EmailService] Skipping: content or uploader not found.")
        return

    module = content.module
    if not module:
        print("[EmailService] Skipping: content has no linked module.")
        return

    # 2. Query target users based on module's department and role filters
    query = db.query(models.User).filter(models.User.status == "active")

    dept_slugs = [d.department.slug for d in module.departments if d.department]
    role_ids = [r.id for r in module.roles]

    if dept_slugs:
        query = query.filter(models.User.department_slug.in_(dept_slugs))

    if role_ids:
        query = query.filter(models.User.role_id.in_(role_ids))

    target_users = query.all()

    if not target_users:
        print("[EmailService] Skipping: no target users found for this module.")
        return

    # 3. Collect recipient emails (ONLY company_email — skip users without one)
    recipients = []
    for u in target_users:
        if u.company_email and u.company_email not in recipients:
            recipients.append(u.company_email)

    if not recipients:
        print("[EmailService] Skipping: no valid recipient emails.")
        return

    # 4. Build the email with proper headers (required for Microsoft 365 delivery)
    content_type_label = content.content_type.name.title()  # "Video" or "Document"

    msg = EmailMessage()
    msg["Subject"] = f"New Training Assigned: {content.title}"
    msg["From"] = SMTP_USER
    msg["To"] = SMTP_USER
    msg["Bcc"] = ", ".join(recipients)
    msg["Reply-To"] = uploader.company_email or uploader.email
    msg["Message-ID"] = f"<{uuid.uuid4()}@nagarkot-training.local>"
    msg["Date"] = datetime.now(timezone.utc).strftime("%a, %d %b %Y %H:%M:%S %z")

    # Plain text version
    plain = (
        f"Hello,\n\n"
        f"A new {content_type_label.lower()} has been added to your assigned training track.\n\n"
        f"Resource: {content.title}\n"
        f"Module: {module.title}\n"
        f"Added by: {uploader.full_name}\n\n"
        f"Please log in to review the material here:\n"
        f"http://os.int.nagarkot.co.in/\n\n"
        f"Regards,\n"
        f"Nagarkot Training Platform"
    )

    # HTML version (clean and lightweight)
    html = (
        f"<html>"
        f"<body style='font-family: Arial, sans-serif; color: #333; line-height: 1.5;'>"
        f"<p>Hello,</p>"
        f"<p>A new <strong>{content_type_label.lower()}</strong> has been added to your assigned training track.</p>"
        f"<ul style='list-style-type: none; padding-left: 0;'>"
        f"<li style='margin-bottom: 4px;'><strong>Resource:</strong> {content.title}</li>"
        f"<li style='margin-bottom: 4px;'><strong>Module:</strong> {module.title}</li>"
        f"<li style='margin-bottom: 4px;'><strong>Added by:</strong> {uploader.full_name}</li>"
        f"</ul>"
        f"<p>Please log in to review the material here:<br>"
        f"<a href='http://os.int.nagarkot.co.in/' style='color: #0056b3;'>http://os.int.nagarkot.co.in/</a></p>"
        f"<p>Regards,<br>Nagarkot Training Platform</p>"
        f"</body>"
        f"</html>"
    )

    msg.set_content(plain)
    msg.add_alternative(html, subtype="html")

    # 5. Send via SMTP
    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            server.starttls()
            server.login(SMTP_USER, SMTP_PASS)
            server.send_message(msg)
        print(f"[EmailService] Successfully sent notifications to {len(recipients)} users.")
    except Exception as e:
        # Log but don't crash — email failure should never block content creation
        print(f"[EmailService] Failed to send email: {e}")
