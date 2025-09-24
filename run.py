import time
import traceback
from bot import CommandBot, appstate

while True:
    try:
        print("✅ Starting bot...")
        client = CommandBot(None, None, session_cookies=appstate)
        client.listen()
    except Exception as e:
        print("❌ Bot crashed! Restarting in 10s...")
        traceback.print_exc()
        time.sleep(10)
