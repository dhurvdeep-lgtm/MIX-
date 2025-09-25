import time
import traceback
from bot import CommandBot, appstate

def start_bot():
    print("✅ Bot starting...")
    client = CommandBot(None, None, session_cookies=appstate)
    client.listen()

while True:
    try:
        start_bot()
    except Exception as e:
        print("❌ Bot crashed, restarting in 10s...")
        traceback.print_exc()
        time.sleep(10)
