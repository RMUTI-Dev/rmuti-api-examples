"""เรียก RMUTI API จากหลังบ้านด้วย HTTP Basic auth (ไม่มีผู้ใช้ login — ไม่ต้องขอ token จาก Keycloak)

รัน: pip install requests python-dotenv && python python.py
"""
import base64
import os

import requests
from dotenv import load_dotenv

load_dotenv()

API_URL = os.environ["RMUTI_API_URL"]
USERNAME = os.environ["RMUTI_API_USERNAME"]
PASSWORD = os.environ["RMUTI_API_PASSWORD"]

# สร้างหัว Basic เองด้วย UTF-8 (auth=(user, pass) ของ requests ใช้ latin-1 ซึ่งล้มถ้ารหัสผ่านมีอักขระนอกช่วงนั้น)
basic = base64.b64encode(f"{USERNAME}:{PASSWORD}".encode("utf-8")).decode()

res = requests.get(API_URL, headers={"Authorization": f"Basic {basic}"}, timeout=10)
res.raise_for_status()
print(res.json())
