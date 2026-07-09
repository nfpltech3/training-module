import os
import json
import base64
import hashlib
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from sqlalchemy import func
from .database import SessionLocal
from . import models, schemas, email_service


def sweep_scheduled_content():
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        scheduled_items = db.query(models.Content).filter(
            models.Content.status == "scheduled",
            models.Content.scheduled_publish_at <= now
        ).all()
        
        for item in scheduled_items:
            item.status = "published"
            item.published_at = now
            # Trigger email 
            try:
                # We don't have the original uploader_id from the sheet, pass None
                email_service.send_content_notification_emails(item.id, None)
            except Exception as e:
                print(f"[Sweep] Failed to send email for {item.id}: {e}")
                
            print(f"[Sweep] Published content {item.id} (Scheduled for {item.scheduled_publish_at})")
            
        if scheduled_items:
            db.commit()
    except Exception as e:
        db.rollback()
        print(f"[Sweep] Error: {e}")
    finally:
        db.close()
