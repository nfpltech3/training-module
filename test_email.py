import smtplib
from email.message import EmailMessage

SMTP_HOST = "smtp.office365.com"
SMTP_PORT = 587
SMTP_USER = "Crm5@nagarkot.co.in"
SMTP_PASS = "Z$820272934306oc"

msg = EmailMessage()
msg["Subject"] = "Test from Trainings"
msg["From"] = f"Nagarkot Training Platform <{SMTP_USER}>"
msg["To"] = SMTP_USER  # sending to yourself
msg.set_content("If you see this, SMTP AUTH is working.")

try:
    with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
        server.set_debuglevel(1)  # this prints the full SMTP conversation
        server.starttls()
        server.login(SMTP_USER, SMTP_PASS)
        server.send_message(msg)
    print("\n✅ Email sent successfully!")
except Exception as e:
    print(f"\n❌ Failed: {e}")